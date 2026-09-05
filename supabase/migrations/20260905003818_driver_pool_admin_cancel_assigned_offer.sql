-- Allow Admin to cancel only one untouched Driver Pool winner before any
-- Driver Job Link or Driver status exists. The same migration returns the
-- other exact recipients after first acceptance for a silent app refresh and
-- keeps manual Driver A -> B reassignment consistent with the assigned offer.

do $$
declare
  v_accept text;
  v_accept_security_definer boolean;
  v_cancel text;
  v_cancel_security_definer boolean;
  v_trigger text;
  v_trigger_security_definer boolean;
begin
  select pg_get_functiondef(p.oid), p.prosecdef
  into v_accept, v_accept_security_definer
  from pg_proc p
  where p.oid = 'public.accept_driver_pool_offer(text,bigint,timestamptz,text)'::regprocedure;
  select pg_get_functiondef(p.oid), p.prosecdef
  into v_cancel, v_cancel_security_definer
  from pg_proc p
  where p.oid = 'public.cancel_driver_pool_offer(text,timestamptz,text,text)'::regprocedure;
  select pg_get_functiondef(p.oid), p.prosecdef
  into v_trigger, v_trigger_security_definer
  from pg_proc p
  where p.oid = 'public.close_driver_pool_offer_on_booking_change()'::regprocedure;

  if v_accept not like '%Driver Pool accepted fixed offer.%'
     or v_accept not like '%Saved booking changed during Driver Pool acceptance.%P0001%'
     or v_cancel not like '%Only an open Driver Pool offer can be cancelled.%'
     or v_cancel not like '%Driver Pool offer changed. Reload before cancelling.%P0001%'
     or v_trigger not like '%booking_assigned_elsewhere%'
     or v_accept_security_definer is distinct from false
     or v_cancel_security_definer is distinct from false
     or v_trigger_security_definer is distinct from false then
    raise exception 'Driver Pool functions changed before bounded assignment cancellation migration.';
  end if;
end;
$$;

create or replace function public.cancel_driver_pool_offer(
  p_offer_key text,
  p_expected_updated_at timestamptz,
  p_actor_role text,
  p_actor_label text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offer public.driver_job_bid_offers%rowtype;
  v_booking public.bookings%rowtype;
  v_bid public.driver_job_bids%rowtype;
  v_cancelled_driver_id bigint;
  v_now timestamptz := clock_timestamp();
begin
  if lower(btrim(coalesce(p_actor_role, ''))) not in ('admin', 'dispatcher')
     or length(btrim(coalesce(p_actor_label, ''))) not between 1 and 160 then
    raise exception 'Verified Admin or Dispatcher required.' using errcode = '42501';
  end if;

  select * into v_offer
  from public.driver_job_bid_offers
  where offer_key = lower(btrim(coalesce(p_offer_key, '')));
  if not found then
    raise exception 'Driver Pool offer not found.' using errcode = 'P0002';
  end if;

  select * into v_booking
  from public.bookings
  where booking_reference = v_offer.booking_reference
  for update;

  select * into v_offer
  from public.driver_job_bid_offers
  where id = v_offer.id
  for update;

  if v_offer.updated_at is distinct from p_expected_updated_at then
    raise exception 'Driver Pool offer changed. Reload before cancelling.' using errcode = 'P0001';
  end if;

  if v_offer.offer_status = 'cancelled' then
    return jsonb_build_object(
      'assignment_cancelled', false,
      'cancelled_driver_id', null,
      'offer', to_jsonb(v_offer),
      'public_booking_reference', v_offer.public_booking_reference
    );
  end if;

  if v_offer.offer_status = 'open' then
    update public.driver_job_bid_offers
    set offer_status = 'cancelled',
        closed_reason = 'offer_cancelled_by_admin',
        closed_at = v_now,
        updated_at = v_now
    where id = v_offer.id
    returning * into v_offer;

    update public.driver_job_bids
    set bid_status = 'expired',
        decided_at = v_now,
        decision_actor_role = 'system',
        decision_actor_label = 'Driver Pool',
        updated_at = v_now
    where driver_job_bid_offer_id = v_offer.id
      and bid_status = 'pending';

    if v_booking.id is not null then
      insert into public.audit_logs (
        entity_type, entity_id, action, source_route, actor_label, change_summary,
        booking_id, customer_id, actor_role, action_type, booking_reference,
        source_surface, reason, safe_before, safe_after
      ) values (
        'booking', v_booking.id, 'admin_dispatcher_override',
        '/api/admin-driver-job-bid-offers', btrim(p_actor_label),
        'Driver Pool offer cancelled; booking remains active.',
        v_booking.id, v_booking.customer_id, lower(btrim(p_actor_role)),
        'admin_dispatcher_override', v_booking.booking_reference, 'admin_api',
        'Owner cancelled only the open Driver Pool offer.',
        jsonb_build_object('driver_pool_offer_status', 'open'),
        jsonb_build_object('driver_pool_offer_status', 'cancelled')
      );
    end if;

    return jsonb_build_object(
      'assignment_cancelled', false,
      'cancelled_driver_id', null,
      'offer', to_jsonb(v_offer),
      'public_booking_reference', v_offer.public_booking_reference
    );
  end if;

  if v_offer.offer_status <> 'assigned' or v_booking.id is null then
    raise exception 'Only an open or untouched assigned Driver Pool offer can be cancelled.' using errcode = '22023';
  end if;

  select * into v_bid
  from public.driver_job_bids
  where driver_job_bid_offer_id = v_offer.id
    and bid_status = 'accepted'
  for update;

  if not found
     or v_bid.driver_reference !~ '^[1-9][0-9]*$'
     or v_booking.driver_id is distinct from v_bid.driver_reference::bigint
     or v_booking.updated_at is distinct from v_offer.updated_at
     or v_booking.driver_payout_override is distinct from v_offer.offer_payout_sgd
     or btrim(coalesce(v_booking.driver_payout_reason, '')) <> 'Driver Pool accepted fixed offer.'
     or coalesce(lower(btrim(v_booking.admin_internal_status)), '') in ('cancelled', 'completed', 'archived', 'deleted')
     or coalesce(lower(btrim(v_booking.customer_facing_status)), '') in ('cancelled', 'completed')
     or exists (
       select 1 from public.driver_job_links
       where booking_reference = v_booking.booking_reference
     )
     or exists (
       select 1 from public.driver_job_status_events
       where booking_reference = v_booking.booking_reference
     ) then
    raise exception 'Only an untouched assigned Driver Pool offer without a Driver Job Link or Driver status may be cancelled.' using errcode = '22023';
  end if;

  v_cancelled_driver_id := v_booking.driver_id;

  update public.driver_job_bid_offers
  set offer_status = 'cancelled',
      closed_reason = 'assigned_offer_cancelled_by_admin',
      closed_at = v_now,
      updated_at = v_now
  where id = v_offer.id
  returning * into v_offer;

  update public.bookings
  set driver_id = null,
      driver_name = null,
      driver_contact = null,
      driver_plate_number = null,
      driver_payout_override = null,
      driver_payout_reason = null,
      updated_at = v_now
  where id = v_booking.id
    and updated_at = v_booking.updated_at;
  if not found then
    raise exception 'Saved booking changed during Driver Pool assignment cancellation.' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (
    entity_type, entity_id, action, source_route, actor_label, change_summary,
    booking_id, customer_id, actor_role, action_type, booking_reference,
    source_surface, reason, safe_before, safe_after
  ) values (
    'booking', v_booking.id, 'admin_dispatcher_override',
    '/api/admin-driver-job-bid-offers', btrim(p_actor_label),
    'accepted Driver Pool assignment cancelled before Driver Job Link issuance; booking remains active.',
    v_booking.id, v_booking.customer_id, lower(btrim(p_actor_role)),
    'admin_dispatcher_override', v_booking.booking_reference, 'admin_api',
    'Owner cancelled an accidental Driver Pool acceptance before dispatch.',
    jsonb_build_object('driver_id', v_cancelled_driver_id, 'driver_pool_offer_status', 'assigned'),
    jsonb_build_object('driver_id', null, 'driver_pool_offer_status', 'cancelled')
  );

  return jsonb_build_object(
    'assignment_cancelled', true,
    'cancelled_driver_id', v_cancelled_driver_id,
    'offer', to_jsonb(v_offer),
    'public_booking_reference', v_offer.public_booking_reference
  );
end;
$$;

create or replace function public.accept_driver_pool_offer(
  p_offer_key text,
  p_driver_id bigint,
  p_expected_updated_at timestamptz,
  p_idempotency_key text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_offer public.driver_job_bid_offers%rowtype;
  v_bid public.driver_job_bids%rowtype;
  v_booking public.bookings%rowtype;
  v_driver public.drivers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_end timestamptz;
  v_other_recipient_driver_ids bigint[] := array[]::bigint[];
begin
  if p_driver_id is null
     or p_driver_id <= 0
     or lower(btrim(coalesce(p_offer_key, ''))) !~ '^[0-9a-f]{64}$'
     or lower(btrim(coalesce(p_idempotency_key, ''))) !~ '^[0-9a-f-]{32,80}$'
     or p_expected_updated_at is null then
    raise exception 'Malformed Driver Pool acceptance.' using errcode = '22023';
  end if;

  select * into v_offer
  from public.driver_job_bid_offers
  where offer_key = lower(btrim(p_offer_key));
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_longer_available');
  end if;

  select * into v_booking
  from public.bookings
  where booking_reference = v_offer.booking_reference
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_longer_available');
  end if;

  select * into v_offer
  from public.driver_job_bid_offers
  where id = v_offer.id
  for update;

  select * into v_bid
  from public.driver_job_bids
  where driver_job_bid_offer_id = v_offer.id
    and driver_reference = p_driver_id::text
  for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  if v_offer.offer_status = 'assigned' and v_bid.bid_status = 'accepted' then
    return jsonb_build_object(
      'ok', true,
      'reason', 'already_accepted',
      'public_booking_reference', v_offer.public_booking_reference,
      'other_recipient_driver_ids', '[]'::jsonb
    );
  end if;

  if v_offer.closes_at <= v_now and v_offer.offer_status = 'open' then
    update public.driver_job_bid_offers
    set offer_status = 'expired', closed_reason = 'expired',
        closed_at = v_now, updated_at = v_now
    where id = v_offer.id;
    update public.driver_job_bids
    set bid_status = 'expired', decided_at = v_now,
        decision_actor_role = 'system', decision_actor_label = 'Offer expired',
        updated_at = v_now
    where driver_job_bid_offer_id = v_offer.id and bid_status = 'pending';
    return jsonb_build_object('ok', false, 'reason', 'no_longer_available');
  end if;

  if v_offer.offer_status <> 'open'
     or v_offer.updated_at is distinct from p_expected_updated_at then
    return jsonb_build_object('ok', false, 'reason', 'no_longer_available');
  end if;

  if v_booking.updated_at is distinct from v_offer.booking_updated_at
     or v_booking.driver_id is not null
     or coalesce(lower(btrim(v_booking.admin_internal_status)), '') in ('cancelled', 'completed', 'archived', 'deleted')
     or coalesce(lower(btrim(v_booking.customer_facing_status)), '') in ('cancelled', 'completed') then
    return jsonb_build_object('ok', false, 'reason', 'no_longer_available');
  end if;

  select * into v_driver
  from public.drivers
  where id = p_driver_id
    and lower(btrim(coalesce(availability_status, ''))) = 'available'
  for update;
  if not found or not exists (
    select 1 from public.driver_access_accounts a
    where a.driver_reference = p_driver_id::text
      and a.account_status = 'active'
      and a.active_device_id_hash ~ '^[0-9a-f]{64}$'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  v_end := case
    when v_booking.dropoff_datetime > v_booking.pickup_at then v_booking.dropoff_datetime
    else v_booking.pickup_at + interval '90 minutes'
  end;

  if exists (
    select 1 from public.bookings b
    where b.driver_id = p_driver_id
      and b.id <> v_booking.id
      and coalesce(lower(btrim(b.admin_internal_status)), '') not in ('cancelled', 'completed', 'archived', 'deleted')
      and coalesce(lower(btrim(b.customer_facing_status)), '') not in ('cancelled', 'completed')
      and tstzrange(
        b.pickup_at,
        case when b.dropoff_datetime > b.pickup_at then b.dropoff_datetime else b.pickup_at + interval '90 minutes' end,
        '[)'
      ) && tstzrange(v_booking.pickup_at, v_end, '[)')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'schedule_conflict');
  end if;

  select coalesce(array_agg(driver_reference::bigint order by driver_reference::bigint), array[]::bigint[])
  into v_other_recipient_driver_ids
  from public.driver_job_bids
  where driver_job_bid_offer_id = v_offer.id
    and id <> v_bid.id
    and bid_status = 'pending'
    and driver_reference ~ '^[1-9][0-9]*$';

  update public.driver_job_bids
  set bid_status = case when id = v_bid.id then 'accepted' else 'expired' end,
      decision_idempotency_key = case
        when id = v_bid.id then lower(btrim(p_idempotency_key))
        else decision_idempotency_key
      end,
      decided_at = v_now,
      decision_actor_role = 'system',
      decision_actor_label = 'Fast accept',
      updated_at = v_now
  where driver_job_bid_offer_id = v_offer.id
    and bid_status = 'pending';

  update public.driver_job_bid_offers
  set offer_status = 'assigned', closed_reason = 'first_driver_accepted',
      closed_at = v_now, updated_at = v_now
  where id = v_offer.id
  returning * into v_offer;

  update public.bookings
  set driver_id = v_driver.id,
      driver_name = v_driver.driver_name,
      driver_contact = v_driver.contact_number,
      driver_plate_number = v_driver.plate_number,
      driver_payout_override = v_offer.offer_payout_sgd,
      driver_payout_reason = 'Driver Pool accepted fixed offer.',
      updated_at = v_now
  where id = v_booking.id
    and updated_at = v_booking.updated_at;
  if not found then
    raise exception 'Saved booking changed during Driver Pool acceptance.' using errcode = 'P0001';
  end if;

  insert into public.audit_logs (
    entity_type, entity_id, action, source_route, actor_label, change_summary,
    booking_id, customer_id, actor_role, action_type, booking_reference,
    source_surface, reason, safe_before, safe_after
  ) values (
    'booking', v_booking.id, 'driver_assigned', '/api/driver-job-bids',
    'Authenticated Driver',
    'First valid Driver Pool acceptance assigned the verified Driver at the exact accepted fixed payout; Driver ACK remains pending.',
    v_booking.id, v_booking.customer_id, 'system', 'driver_assigned',
    v_booking.booking_reference, 'system', 'Atomic Driver Pool fast accept.',
    jsonb_build_object('driver_id', null),
    jsonb_build_object('driver_id', v_driver.id, 'driver_pool_offer_id', v_offer.id)
  );

  return jsonb_build_object(
    'ok', true,
    'reason', 'accepted',
    'public_booking_reference', v_offer.public_booking_reference,
    'other_recipient_driver_ids', to_jsonb(v_other_recipient_driver_ids)
  );
end;
$$;

create or replace function public.close_driver_pool_offer_on_booking_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_reason text;
  v_ids uuid[];
begin
  if new.driver_id is distinct from old.driver_id then
    v_reason := 'booking_assigned_elsewhere';
  elsif coalesce(lower(btrim(new.admin_internal_status)), '') in ('cancelled', 'completed', 'archived', 'deleted')
     or coalesce(lower(btrim(new.customer_facing_status)), '') in ('cancelled', 'completed') then
    v_reason := 'booking_terminal';
  elsif new.updated_at is distinct from old.updated_at then
    v_reason := 'booking_amended';
  else
    return new;
  end if;

  with closed as (
    update public.driver_job_bid_offers o
    set offer_status = case when v_reason = 'booking_terminal' then 'cancelled' else 'closed' end,
        closed_reason = v_reason,
        closed_at = v_now,
        updated_at = v_now
    where o.booking_reference = new.booking_reference
      and (
        o.offer_status = 'open'
        or (
          o.offer_status = 'assigned'
          and v_reason = 'booking_assigned_elsewhere'
          and not exists (
            select 1
            from public.driver_job_bids b
            where b.driver_job_bid_offer_id = o.id
              and b.bid_status = 'accepted'
              and b.driver_reference = coalesce(new.driver_id::text, '')
          )
        )
      )
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[]) into v_ids from closed;

  update public.driver_job_bids
  set bid_status = 'expired', decided_at = v_now,
      decision_actor_role = 'system', decision_actor_label = 'Booking changed',
      updated_at = v_now
  where driver_job_bid_offer_id = any(v_ids)
    and bid_status = 'pending';

  return new;
end;
$$;

revoke all on function public.cancel_driver_pool_offer(text, timestamptz, text, text)
from public, anon, authenticated;
revoke all on function public.accept_driver_pool_offer(text, bigint, timestamptz, text)
from public, anon, authenticated;
revoke all on function public.close_driver_pool_offer_on_booking_change()
from public, anon, authenticated;

grant execute on function public.cancel_driver_pool_offer(text, timestamptz, text, text)
to service_role;
grant execute on function public.accept_driver_pool_offer(text, bigint, timestamptz, text)
to service_role;

comment on function public.cancel_driver_pool_offer(text, timestamptz, text, text) is
  'Cancels an open Driver Pool offer or atomically removes only an untouched accepted assignment before any Driver Job Link or status exists; preserves the active booking and accepted bid audit.';
comment on function public.accept_driver_pool_offer(text, bigint, timestamptz, text) is
  'Atomically accepts the first valid Driver, assigns the exact fixed payout, and returns only the other exact recipient IDs for a privacy-safe silent app refresh.';
comment on function public.close_driver_pool_offer_on_booking_change() is
  'Closes open offers on booking changes and closes an assigned offer only when the accepted Driver is replaced through the established assignment lane.';
