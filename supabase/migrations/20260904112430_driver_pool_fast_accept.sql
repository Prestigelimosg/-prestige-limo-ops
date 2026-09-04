-- Optional Driver Pool fast-accept lane. Additive only; disabled at the app gate by default.
-- Acceptance assigns the saved booking only. Driver Job Link, ACK, both Calendar lanes,
-- status reporting, billing, invoice, payout execution, PayNow, messaging and GPS stay separate.

set search_path = public, extensions;

alter table public.driver_job_bid_offers
  add column if not exists offer_key text,
  add column if not exists public_booking_reference text,
  add column if not exists booking_updated_at timestamptz,
  add column if not exists offer_payout_sgd numeric(10,2),
  add column if not exists publish_idempotency_key text,
  add column if not exists closed_reason text,
  add column if not exists recipient_count integer not null default 0,
  add column if not exists push_target_count integer not null default 0;

update public.driver_job_bid_offers
set offer_key = encode(extensions.gen_random_bytes(32), 'hex')
where offer_key is null;

alter table public.driver_job_bid_offers
  alter column offer_key set default encode(extensions.gen_random_bytes(32), 'hex'),
  alter column offer_key set not null;

alter table public.driver_job_bid_offers
  drop constraint if exists driver_job_bid_offers_offer_key_check,
  add constraint driver_job_bid_offers_offer_key_check check (offer_key ~ '^[0-9a-f]{64}$'),
  drop constraint if exists driver_job_bid_offers_payout_check,
  add constraint driver_job_bid_offers_payout_check check (
    offer_payout_sgd is null or (offer_payout_sgd > 0 and offer_payout_sgd <= 99999.99)
  ),
  drop constraint if exists driver_job_bid_offers_recipient_count_check,
  add constraint driver_job_bid_offers_recipient_count_check check (
    recipient_count >= 0 and push_target_count >= 0 and push_target_count <= recipient_count
  );

create unique index if not exists driver_job_bid_offers_offer_key_key
  on public.driver_job_bid_offers (offer_key);
create unique index if not exists driver_job_bid_offers_publish_idempotency_key_key
  on public.driver_job_bid_offers (publish_idempotency_key)
  where publish_idempotency_key is not null;
create unique index if not exists driver_job_bid_offers_one_open_per_booking_key
  on public.driver_job_bid_offers (booking_reference)
  where offer_status = 'open';

alter table public.driver_job_bids
  add column if not exists decision_idempotency_key text;
create unique index if not exists driver_job_bids_decision_idempotency_key_key
  on public.driver_job_bids (decision_idempotency_key)
  where decision_idempotency_key is not null;

revoke all on table public.driver_job_bid_offers from anon, authenticated;
revoke all on table public.driver_job_bids from anon, authenticated;
grant select, insert, update on table public.driver_job_bid_offers to service_role;
grant select, insert, update on table public.driver_job_bids to service_role;

create or replace function public.publish_driver_pool_offer(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_offer_payout_sgd numeric,
  p_idempotency_key text,
  p_actor_role text,
  p_actor_label text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_offer public.driver_job_bid_offers%rowtype;
  v_actor_role text := lower(btrim(coalesce(p_actor_role, '')));
  v_actor_label text := btrim(coalesce(p_actor_label, ''));
  v_reference text := btrim(coalesce(p_booking_reference, ''));
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_now timestamptz := clock_timestamp();
  v_recipient_count integer := 0;
  v_push_target_count integer := 0;
  v_recipient_ids bigint[] := array[]::bigint[];
  v_expired_ids uuid[] := array[]::uuid[];
begin
  if v_actor_role not in ('admin', 'dispatcher') or length(v_actor_label) not between 1 and 160 then
    raise exception 'Verified Admin or Dispatcher required.' using errcode = '42501';
  end if;
  if v_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
     or v_key !~ '^[0-9a-f-]{32,80}$'
     or p_expected_updated_at is null
     or p_offer_payout_sgd is null
     or p_offer_payout_sgd <= 0
     or p_offer_payout_sgd > 99999.99 then
    raise exception 'Malformed Driver Pool offer.' using errcode = '22023';
  end if;

  select * into v_offer from public.driver_job_bid_offers
  where publish_idempotency_key = v_key;
  if found then
    return jsonb_build_object('offer', to_jsonb(v_offer), 'recipient_driver_ids', '[]'::jsonb, 'idempotent', true);
  end if;

  select * into v_booking from public.bookings
  where booking_reference = v_reference for update;
  if not found then raise exception 'Saved booking not found.' using errcode = 'P0002'; end if;
  if v_booking.updated_at is distinct from p_expected_updated_at then
    raise exception 'Saved booking changed. Reload before publishing.' using errcode = '40001';
  end if;
  if nullif(btrim(coalesce(v_booking.public_booking_reference, '')), '') is null
     or length(btrim(v_booking.public_booking_reference)) > 120
     or v_booking.driver_id is not null
     or coalesce(lower(btrim(v_booking.admin_internal_status)), '') in ('cancelled','completed','archived','deleted')
     or coalesce(lower(btrim(v_booking.customer_facing_status)), '') in ('cancelled','completed')
     or v_booking.pickup_at <= v_now then
    raise exception 'Only a future unassigned non-terminal booking can be offered.' using errcode = '22023';
  end if;
  with expired as (
    update public.driver_job_bid_offers
    set offer_status = 'expired', closed_reason = 'expired', closed_at = v_now, updated_at = v_now
    where booking_reference = v_reference and offer_status = 'open' and closes_at <= v_now
    returning id
  ) select coalesce(array_agg(id), array[]::uuid[]) into v_expired_ids from expired;
  update public.driver_job_bids
  set bid_status = 'expired', decided_at = v_now, decision_actor_role = 'system',
      decision_actor_label = 'Offer expired', updated_at = v_now
  where driver_job_bid_offer_id = any(v_expired_ids) and bid_status = 'pending';
  if exists (select 1 from public.driver_job_bid_offers where booking_reference = v_reference and offer_status = 'open') then
    raise exception 'This booking already has an open Driver Pool offer.' using errcode = '23505';
  end if;

  select count(distinct d.id), array_agg(distinct d.id order by d.id)
  into v_recipient_count, v_recipient_ids
  from public.drivers d
  join public.driver_access_accounts a
    on a.driver_reference = d.id::text
   and a.account_status = 'active'
   and a.active_device_id_hash ~ '^[0-9a-f]{64}$'
  where lower(btrim(coalesce(d.availability_status, ''))) = 'available';
  v_recipient_count := coalesce(v_recipient_count, 0);
  v_recipient_ids := coalesce(v_recipient_ids, array[]::bigint[]);
  if v_recipient_count = 0 then
    raise exception 'No pool-ready Driver account is available.' using errcode = 'P0002';
  end if;

  select count(distinct s.driver_id) into v_push_target_count
  from public.driver_device_push_subscriptions s
  where s.driver_id = any(v_recipient_ids) and s.subscription_status = 'active';

  insert into public.driver_job_bid_offers (
    booking_reference, public_booking_reference, booking_updated_at, offer_payout_sgd,
    publish_idempotency_key, offer_status, pickup_at, safe_pickup_area,
    safe_dropoff_area, safe_vehicle_label, safe_trip_summary, safe_offer_context,
    source_surface, actor_role, actor_label, opened_at, closes_at,
    recipient_count, push_target_count, updated_at
  ) values (
    v_reference, nullif(btrim(coalesce(v_booking.public_booking_reference, '')), ''),
    v_booking.updated_at, p_offer_payout_sgd, v_key, 'open', v_booking.pickup_at,
    'Pickup details after assignment', 'Drop-off details after assignment',
    nullif(btrim(coalesce(v_booking.vehicle, '')), ''),
    nullif(btrim(coalesce(v_booking.service_type, v_booking.booking_type, '')), ''),
    jsonb_build_object('kind','fixed_driver_offer','price_scope','driver_offer_only'),
    'admin_api', v_actor_role, v_actor_label, v_now,
    least(v_booking.pickup_at, v_now + interval '24 hours'),
    v_recipient_count, coalesce(v_push_target_count, 0), v_now
  ) returning * into v_offer;

  insert into public.driver_job_bids (
    driver_job_bid_offer_id, booking_reference, driver_reference, bid_status,
    bid_source, safe_bid_context, submitted_at, created_at, updated_at
  )
  select v_offer.id, v_reference, d::text, 'pending', 'system',
    jsonb_build_object('recipient','pool_ready_at_publish'), v_now, v_now, v_now
  from unnest(v_recipient_ids) d;

  insert into public.audit_logs (
    entity_type, entity_id, action, source_route, actor_label, change_summary,
    booking_id, customer_id, actor_role, action_type, booking_reference,
    source_surface, reason, safe_before, safe_after
  ) values (
    'booking', v_booking.id, 'admin_dispatcher_override', '/api/admin-driver-job-bid-offers',
    v_actor_label, 'Optional Driver Pool offer published; booking remains unassigned.',
    v_booking.id, v_booking.customer_id, v_actor_role, 'admin_dispatcher_override',
    v_reference, 'admin_api', 'Owner published fixed Driver offer.',
    jsonb_build_object('driver_id', v_booking.driver_id),
    jsonb_build_object('driver_pool_offer_id', v_offer.id, 'recipient_count', v_recipient_count)
  );

  return jsonb_build_object('offer', to_jsonb(v_offer), 'recipient_driver_ids', to_jsonb(v_recipient_ids), 'idempotent', false);
end;
$$;

create or replace function public.cancel_driver_pool_offer(
  p_offer_key text,
  p_expected_updated_at timestamptz,
  p_actor_role text,
  p_actor_label text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_offer public.driver_job_bid_offers%rowtype;
  v_booking public.bookings%rowtype;
  v_now timestamptz := clock_timestamp();
begin
  if lower(btrim(coalesce(p_actor_role,''))) not in ('admin','dispatcher')
     or length(btrim(coalesce(p_actor_label,''))) not between 1 and 160 then
    raise exception 'Verified Admin or Dispatcher required.' using errcode='42501';
  end if;
  select * into v_offer from public.driver_job_bid_offers where offer_key = lower(btrim(coalesce(p_offer_key,''))) for update;
  if not found then raise exception 'Driver Pool offer not found.' using errcode='P0002'; end if;
  if v_offer.updated_at is distinct from p_expected_updated_at then
    raise exception 'Driver Pool offer changed. Reload before cancelling.' using errcode='40001';
  end if;
  if v_offer.offer_status = 'cancelled' then return to_jsonb(v_offer); end if;
  if v_offer.offer_status <> 'open' then raise exception 'Only an open Driver Pool offer can be cancelled.' using errcode='22023'; end if;
  update public.driver_job_bid_offers set offer_status='cancelled', closed_reason='offer_cancelled_by_admin', closed_at=v_now, updated_at=v_now
  where id=v_offer.id returning * into v_offer;
  update public.driver_job_bids set bid_status='expired', decided_at=v_now, decision_actor_role='system', decision_actor_label='Driver Pool', updated_at=v_now
  where driver_job_bid_offer_id=v_offer.id and bid_status='pending';
  select * into v_booking from public.bookings where booking_reference = v_offer.booking_reference;
  if found then
    insert into public.audit_logs (
      entity_type,entity_id,action,source_route,actor_label,change_summary,booking_id,customer_id,
      actor_role,action_type,booking_reference,source_surface,reason,safe_before,safe_after
    ) values (
      'booking',v_booking.id,'admin_dispatcher_override','/api/admin-driver-job-bid-offers',btrim(p_actor_label),
      'Driver Pool offer cancelled; booking remains active.',v_booking.id,v_booking.customer_id,
      lower(btrim(p_actor_role)),'admin_dispatcher_override',v_booking.booking_reference,'admin_api',
      'Owner cancelled only the Driver Pool offer.',jsonb_build_object('driver_pool_offer_status','open'),
      jsonb_build_object('driver_pool_offer_status','cancelled')
    );
  end if;
  return to_jsonb(v_offer);
end; $$;

create or replace function public.decline_driver_pool_offer(
  p_offer_key text, p_driver_id bigint, p_expected_updated_at timestamptz, p_idempotency_key text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare v_offer public.driver_job_bid_offers%rowtype; v_bid public.driver_job_bids%rowtype; v_now timestamptz:=clock_timestamp();
begin
  if p_driver_id is null or p_driver_id <= 0
     or lower(btrim(coalesce(p_offer_key,''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(p_idempotency_key,''))) !~ '^[0-9a-f-]{32,80}$'
     or p_expected_updated_at is null then
    raise exception 'Malformed Driver Pool decline.' using errcode='22023';
  end if;
  select * into v_offer from public.driver_job_bid_offers where offer_key=lower(btrim(coalesce(p_offer_key,''))) for update;
  if not found then return jsonb_build_object('ok',false,'reason','no_longer_available'); end if;
  select * into v_bid from public.driver_job_bids where driver_job_bid_offer_id=v_offer.id and driver_reference=p_driver_id::text for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
  if v_offer.closes_at <= v_now and v_offer.offer_status='open' then
    update public.driver_job_bid_offers set offer_status='expired',closed_reason='expired',closed_at=v_now,updated_at=v_now where id=v_offer.id;
    update public.driver_job_bids set bid_status='expired',decided_at=v_now,decision_actor_role='system',decision_actor_label='Offer expired',updated_at=v_now where driver_job_bid_offer_id=v_offer.id and bid_status='pending';
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  if v_offer.offer_status <> 'open' or v_offer.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  if v_bid.bid_status='declined' then return jsonb_build_object('ok',true,'reason','declined'); end if;
  if v_bid.bid_status<>'pending' then return jsonb_build_object('ok',false,'reason','no_longer_available'); end if;
  update public.driver_job_bids set bid_status='declined', decision_idempotency_key=lower(btrim(p_idempotency_key)),
    decided_at=v_now, decision_actor_role='system', decision_actor_label='Authenticated Driver', updated_at=v_now where id=v_bid.id;
  return jsonb_build_object('ok',true,'reason','declined');
end; $$;

create or replace function public.list_driver_pool_available_jobs(
  p_driver_id bigint,
  p_page integer default 1,
  p_limit integer default 20
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 20);
  v_offset integer;
  v_jobs jsonb;
  v_count integer;
begin
  if p_driver_id is null or p_driver_id <= 0
     or p_page is null or p_page < 1 or p_page > 100000 then
    raise exception 'Malformed Available Jobs request.' using errcode='22023';
  end if;
  if not exists (
    select 1
    from public.drivers d
    join public.driver_access_accounts a
      on a.driver_reference = d.id::text
     and a.account_status = 'active'
     and a.active_device_id_hash ~ '^[0-9a-f]{64}$'
    where d.id = p_driver_id
      and lower(btrim(coalesce(d.availability_status,''))) = 'available'
  ) then
    return jsonb_build_object('jobs','[]'::jsonb,'has_more',false);
  end if;
  v_offset := (p_page - 1) * v_limit;
  with eligible as (
    select
      o.offer_key,
      o.public_booking_reference,
      o.offer_payout_sgd,
      o.pickup_at,
      o.closes_at,
      o.safe_pickup_area,
      o.safe_dropoff_area,
      o.safe_vehicle_label,
      o.safe_trip_summary,
      o.updated_at
    from public.driver_job_bid_offers o
    join public.driver_job_bids b on b.driver_job_bid_offer_id = o.id
    where b.driver_reference = p_driver_id::text
      and b.bid_status = 'pending'
      and o.offer_status = 'open'
      and o.closes_at > clock_timestamp()
    order by o.pickup_at asc, o.offer_key asc
    offset v_offset limit v_limit + 1
  ), page_rows as (
    select * from eligible order by pickup_at asc, offer_key asc limit v_limit
  )
  select
    coalesce((select jsonb_agg(to_jsonb(page_rows) order by pickup_at asc, offer_key asc) from page_rows), '[]'::jsonb),
    (select count(*) from eligible)
  into v_jobs, v_count;
  return jsonb_build_object('jobs',v_jobs,'has_more',v_count > v_limit);
end; $$;

create or replace function public.accept_driver_pool_offer(
  p_offer_key text, p_driver_id bigint, p_expected_updated_at timestamptz, p_idempotency_key text
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_offer public.driver_job_bid_offers%rowtype; v_bid public.driver_job_bids%rowtype;
  v_booking public.bookings%rowtype; v_driver public.drivers%rowtype;
  v_now timestamptz:=clock_timestamp(); v_end timestamptz;
begin
  if p_driver_id is null or p_driver_id<=0 or lower(btrim(coalesce(p_offer_key,''))) !~ '^[0-9a-f]{64}$'
    or lower(btrim(coalesce(p_idempotency_key,''))) !~ '^[0-9a-f-]{32,80}$'
    or p_expected_updated_at is null then
    raise exception 'Malformed Driver Pool acceptance.' using errcode='22023';
  end if;
  select * into v_offer from public.driver_job_bid_offers where offer_key=lower(btrim(p_offer_key));
  if not found then return jsonb_build_object('ok',false,'reason','no_longer_available'); end if;
  select * into v_booking from public.bookings where booking_reference=v_offer.booking_reference for update;
  if not found then return jsonb_build_object('ok',false,'reason','no_longer_available'); end if;
  select * into v_offer from public.driver_job_bid_offers where id=v_offer.id for update;
  select * into v_bid from public.driver_job_bids where driver_job_bid_offer_id=v_offer.id and driver_reference=p_driver_id::text for update;
  if not found then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
  if v_offer.offer_status='assigned' and v_bid.bid_status='accepted' then
    return jsonb_build_object('ok',true,'reason','already_accepted','public_booking_reference',v_offer.public_booking_reference);
  end if;
  if v_offer.closes_at<=v_now and v_offer.offer_status='open' then
    update public.driver_job_bid_offers set offer_status='expired',closed_reason='expired',closed_at=v_now,updated_at=v_now where id=v_offer.id;
    update public.driver_job_bids set bid_status='expired',decided_at=v_now,decision_actor_role='system',decision_actor_label='Offer expired',updated_at=v_now where driver_job_bid_offer_id=v_offer.id and bid_status='pending';
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  if v_offer.offer_status <> 'open' or v_offer.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  if v_booking.updated_at is distinct from v_offer.booking_updated_at or v_booking.driver_id is not null
     or coalesce(lower(btrim(v_booking.admin_internal_status)),'') in ('cancelled','completed','archived','deleted')
     or coalesce(lower(btrim(v_booking.customer_facing_status)),'') in ('cancelled','completed') then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  select * into v_driver from public.drivers where id=p_driver_id and lower(btrim(coalesce(availability_status,''))) = 'available' for update;
  if not found or not exists (
    select 1 from public.driver_access_accounts a where a.driver_reference=p_driver_id::text
      and a.account_status='active' and a.active_device_id_hash ~ '^[0-9a-f]{64}$'
  ) then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;
  v_end := case when v_booking.dropoff_datetime>v_booking.pickup_at
                then v_booking.dropoff_datetime else v_booking.pickup_at+interval '90 minutes' end;
  if exists (
    select 1 from public.bookings b where b.driver_id=p_driver_id and b.id<>v_booking.id
      and coalesce(lower(btrim(b.admin_internal_status)),'') not in ('cancelled','completed','archived','deleted')
      and coalesce(lower(btrim(b.customer_facing_status)),'') not in ('cancelled','completed')
      and tstzrange(b.pickup_at,
        case when b.dropoff_datetime>b.pickup_at
             then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')
          && tstzrange(v_booking.pickup_at,v_end,'[)')
  ) then return jsonb_build_object('ok',false,'reason','schedule_conflict'); end if;

  update public.driver_job_bids set bid_status=case when id=v_bid.id then 'accepted' else 'expired' end,
    decision_idempotency_key=case when id=v_bid.id then lower(btrim(p_idempotency_key)) else decision_idempotency_key end,
    decided_at=v_now, decision_actor_role='system', decision_actor_label='Fast accept', updated_at=v_now
  where driver_job_bid_offer_id=v_offer.id and bid_status='pending';
  update public.driver_job_bid_offers set offer_status='assigned', closed_reason='first_driver_accepted', closed_at=v_now, updated_at=v_now
  where id=v_offer.id returning * into v_offer;
  update public.bookings set driver_id=v_driver.id, driver_name=v_driver.driver_name,
    driver_contact=v_driver.contact_number, driver_plate_number=v_driver.plate_number, updated_at=v_now
  where id=v_booking.id and updated_at=v_booking.updated_at;
  if not found then raise exception 'Saved booking changed during Driver Pool acceptance.' using errcode='40001'; end if;
  insert into public.audit_logs (
    entity_type,entity_id,action,source_route,actor_label,change_summary,booking_id,customer_id,
    actor_role,action_type,booking_reference,source_surface,reason,safe_before,safe_after
  ) values (
    'booking',v_booking.id,'driver_assigned','/api/driver-job-bids','Authenticated Driver',
    'First valid Driver Pool acceptance assigned the verified Driver; Driver ACK remains pending.',
    v_booking.id,v_booking.customer_id,'system','driver_assigned',v_booking.booking_reference,'system',
    'Atomic Driver Pool fast accept.',jsonb_build_object('driver_id',null),
    jsonb_build_object('driver_id',v_driver.id,'driver_pool_offer_id',v_offer.id)
  );
  return jsonb_build_object('ok',true,'reason','accepted','public_booking_reference',v_offer.public_booking_reference);
end; $$;

create or replace function public.close_driver_pool_offer_on_booking_change()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_now timestamptz:=clock_timestamp(); v_reason text; v_ids uuid[];
begin
  if new.driver_id is distinct from old.driver_id then v_reason:='booking_assigned_elsewhere';
  elsif coalesce(lower(btrim(new.admin_internal_status)),'') in ('cancelled','completed','archived','deleted')
     or coalesce(lower(btrim(new.customer_facing_status)),'') in ('cancelled','completed') then v_reason:='booking_terminal';
  elsif new.updated_at is distinct from old.updated_at then v_reason:='booking_amended';
  else return new; end if;
  with closed as (
    update public.driver_job_bid_offers set offer_status=case when v_reason='booking_terminal' then 'cancelled' else 'closed' end,
      closed_reason=v_reason,closed_at=v_now,updated_at=v_now
    where booking_reference=new.booking_reference and offer_status='open' returning id
  ) select coalesce(array_agg(id),array[]::uuid[]) into v_ids from closed;
  update public.driver_job_bids set bid_status='expired',decided_at=v_now,decision_actor_role='system',
    decision_actor_label='Booking changed',updated_at=v_now
  where driver_job_bid_offer_id=any(v_ids) and bid_status='pending';
  return new;
end; $$;

drop trigger if exists close_driver_pool_offer_on_booking_change on public.bookings;
create trigger close_driver_pool_offer_on_booking_change
after update on public.bookings for each row
execute function public.close_driver_pool_offer_on_booking_change();

create or replace function public.guard_driver_job_link_against_driver_pool_offer()
returns trigger language plpgsql security invoker set search_path='' as $$
declare v_booking public.bookings%rowtype;
begin
  select * into v_booking
  from public.bookings
  where booking_reference = new.booking_reference
  for update;
  if not found then
    raise exception 'Saved booking not found for Driver Job Link.' using errcode='P0002';
  end if;
  if coalesce(lower(btrim(v_booking.admin_internal_status)),'') in ('cancelled','completed','archived','deleted')
     or coalesce(lower(btrim(v_booking.customer_facing_status)),'') in ('cancelled','completed') then
    raise exception 'A Driver Job Link cannot be created for a terminal booking.' using errcode='22023';
  end if;
  if exists (
    select 1 from public.driver_job_bid_offers
    where booking_reference = new.booking_reference
      and offer_status = 'open'
      and closes_at > clock_timestamp()
  ) then
    raise exception 'An open Driver Pool offer must be resolved before Driver Job Link creation.' using errcode='22023';
  end if;
  return new;
end; $$;

drop trigger if exists guard_driver_job_link_against_driver_pool_offer on public.driver_job_links;
create trigger guard_driver_job_link_against_driver_pool_offer
before insert on public.driver_job_links for each row
execute function public.guard_driver_job_link_against_driver_pool_offer();

revoke all on function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.cancel_driver_pool_offer(text,timestamptz,text,text) from public, anon, authenticated;
revoke all on function public.decline_driver_pool_offer(text,bigint,timestamptz,text) from public, anon, authenticated;
revoke all on function public.accept_driver_pool_offer(text,bigint,timestamptz,text) from public, anon, authenticated;
revoke all on function public.list_driver_pool_available_jobs(bigint,integer,integer) from public, anon, authenticated;
revoke all on function public.guard_driver_job_link_against_driver_pool_offer() from public, anon, authenticated;
grant execute on function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text) to service_role;
grant execute on function public.cancel_driver_pool_offer(text,timestamptz,text,text) to service_role;
grant execute on function public.decline_driver_pool_offer(text,bigint,timestamptz,text) to service_role;
grant execute on function public.accept_driver_pool_offer(text,bigint,timestamptz,text) to service_role;
grant execute on function public.list_driver_pool_available_jobs(bigint,integer,integer) to service_role;

comment on column public.driver_job_bid_offers.offer_payout_sgd is
  'Exact Admin-set driver offer payout only. Never customer price, invoice/billing, comparison, PayNow, bank or finance data.';
