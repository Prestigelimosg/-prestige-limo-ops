-- Existing Driver Pool only. No new tables, routes, providers, or downstream workflow.
-- Selected invitations and availability use the existing safe context fields.
-- Existing open legacy offers retain first-valid-accept behavior (with terminal-bid fix).
begin;
do $baseline$ begin
  if not exists(select 1 from pg_proc where oid=to_regprocedure('public.accept_driver_pool_offer(text,bigint,timestamptz,text)')
    and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='25ec0a469143a7cfb72e5b83bca070d2')
  or not exists(select 1 from pg_proc where oid=to_regprocedure('public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text)')
    and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='77188fa509300d114132e348c788e323')
  or not exists(select 1 from pg_proc where oid=to_regprocedure('public.list_driver_pool_available_jobs(bigint,integer,integer)')
    and not prosecdef and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='35fd899740e6fb47a6e776de8f23834f') then
    raise exception 'Driver Pool baseline changed. Inspect before applying Admin selection.';
  end if;
end; $baseline$;
drop function public.accept_driver_pool_offer(text,bigint,timestamptz,text);
drop function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text);
CREATE OR REPLACE FUNCTION public.accept_driver_pool_offer(p_offer_key text, p_driver_id bigint, p_expected_updated_at timestamp with time zone, p_idempotency_key text, p_actor_role text DEFAULT NULL, p_actor_label text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_offer public.driver_job_bid_offers%rowtype;
  v_bid public.driver_job_bids%rowtype;
  v_booking public.bookings%rowtype;
  v_driver public.drivers%rowtype;
  v_now timestamptz := clock_timestamp();
  v_end timestamptz;
  v_admin boolean := p_actor_role is not null or p_actor_label is not null;
  v_other_recipient_driver_ids bigint[] := array[]::bigint[];
begin
  if v_admin and (coalesce(p_actor_role, '') not in ('admin','dispatcher') or length(btrim(coalesce(p_actor_label,''))) not between 1 and 160) then
    raise exception 'Verified Admin or Dispatcher required.' using errcode='42501';
  end if;
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

  v_now := clock_timestamp();

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

  -- A declined, withdrawn or expired invitation can never become a winner.
  if v_bid.bid_status <> 'pending' then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  if v_admin and (v_offer.safe_offer_context ->> 'selection_mode') is distinct from 'admin' then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;
  if v_admin and (v_bid.safe_bid_context ->> 'response') is distinct from 'available' then
    return jsonb_build_object('ok',false,'reason','response_required');
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

  perform 1 from public.driver_access_accounts a
  where a.driver_reference = p_driver_id::text and a.account_status = 'active'
    and a.active_device_id_hash ~ '^[0-9a-f]{64}$' for share;
  if not found then return jsonb_build_object('ok',false,'reason','not_eligible'); end if;

  v_now := clock_timestamp();
  if v_offer.closes_at <= v_now then
    return jsonb_build_object('ok',false,'reason','no_longer_available');
  end if;

  if (v_offer.safe_offer_context ->> 'vehicle_requirement_version') is distinct from '1'
     or not public.driver_pool_vehicle_matches(v_offer.safe_vehicle_label, v_driver.vehicle_type) then
    return jsonb_build_object('ok', false, 'reason', 'vehicle_mismatch');
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

  -- For selected and widened offers, Driver acceptance only records availability.
  -- Keep the invitation pending so existing close/cancel/amendment consumers expire it.
  if v_offer.safe_offer_context ->> 'selection_mode' = 'admin' and not v_admin then
    if v_bid.safe_bid_context ->> 'response' = 'available' then
      return jsonb_build_object('ok',true,'reason','awaiting_admin');
    end if;
    update public.driver_job_bids
    set safe_bid_context = safe_bid_context || jsonb_build_object('response','available','responded_at',v_now),
        decision_idempotency_key = lower(btrim(p_idempotency_key)), updated_at = v_now
    where id = v_bid.id;
    return jsonb_build_object('ok',true,'reason','awaiting_admin');
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
      decision_actor_role = case when v_admin then p_actor_role else 'system' end,
      decision_actor_label = case when v_admin then btrim(p_actor_label) else 'Fast accept' end,
      updated_at = v_now
  where driver_job_bid_offer_id = v_offer.id
    and bid_status = 'pending';

  update public.driver_job_bid_offers
  set offer_status = 'assigned', closed_reason = case when v_admin then 'admin_selected_driver' else 'first_driver_accepted' end,
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
    'booking', v_booking.id, 'driver_assigned', case when v_admin then '/api/admin-driver-job-bid-offers' else '/api/driver-job-bids' end,
    case when v_admin then btrim(p_actor_label) else 'Authenticated Driver' end,
    'Driver Pool awarded the verified Driver at the exact fixed offer; Driver ACK remains pending.',
    v_booking.id, v_booking.customer_id, case when v_admin then p_actor_role else 'system' end, 'driver_assigned',
    v_booking.booking_reference, case when v_admin then 'admin_api' else 'system' end, 'Atomic Driver Pool award.',
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
$function$
;

CREATE OR REPLACE FUNCTION public.list_driver_pool_available_jobs(p_driver_id bigint, p_page integer DEFAULT 1, p_limit integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
      o.updated_at,
      case when o.safe_offer_context ->> 'selection_mode' = 'admin' then 'admin' else 'first_accept' end as selection_mode,
      case when b.safe_bid_context ->> 'response' = 'available' then 'awaiting_admin' else 'pending' end as response_status
    from public.driver_job_bid_offers o
    join public.driver_job_bids b on b.driver_job_bid_offer_id = o.id
    where b.driver_reference = p_driver_id::text
      and b.bid_status = 'pending'
      and o.offer_status = 'open'
      and o.closes_at > clock_timestamp()
      and o.safe_offer_context ->> 'vehicle_requirement_version' = '1'
      and exists (
        select 1 from public.drivers d where d.id = p_driver_id
          and public.driver_pool_vehicle_matches(o.safe_vehicle_label, d.vehicle_type)
      )
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
end; $function$
;

CREATE OR REPLACE FUNCTION public.publish_driver_pool_offer(p_booking_reference text, p_expected_updated_at timestamp with time zone, p_offer_payout_sgd numeric, p_idempotency_key text, p_actor_role text, p_actor_label text, p_vehicle_requirement text DEFAULT NULL, p_selected_driver_ids bigint[] DEFAULT NULL, p_offer_key text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
  v_all_recipient_ids bigint[] := array[]::bigint[];
  v_widen boolean := p_offer_key is not null;
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
     or p_offer_payout_sgd > 99999.99
     or p_vehicle_requirement is null
     or p_vehicle_requirement not in ('E / AVF', 'AVF', 'S', 'VVV', 'COMBI')
     or (v_widen and lower(btrim(p_offer_key)) !~ '^[0-9a-f]{64}$')
     or (not v_widen and (p_selected_driver_ids is null or cardinality(p_selected_driver_ids) not between 1 and 10
       or exists(select 1 from unnest(p_selected_driver_ids) d where d is null or d <= 0)
       or cardinality(p_selected_driver_ids) <> (select count(distinct d) from unnest(p_selected_driver_ids) d)))
     or (v_widen and p_selected_driver_ids is not null) then
    raise exception 'Malformed Driver Pool offer.' using errcode = '22023';
  end if;

  select * into v_booking from public.bookings
  where booking_reference = v_reference for update;
  if not found then raise exception 'Saved booking not found.' using errcode = 'P0002'; end if;

  if v_widen then
    select * into v_offer from public.driver_job_bid_offers
    where offer_key = lower(btrim(p_offer_key)) and booking_reference = v_reference for update;
    if not found then raise exception 'Driver Pool record not found.' using errcode='P0002'; end if;
    if v_offer.safe_offer_context ->> 'widen_key' = v_key
       and v_offer.safe_offer_context ->> 'audience' = 'wider'
       and v_offer.offer_payout_sgd = p_offer_payout_sgd
       and v_offer.safe_vehicle_label = p_vehicle_requirement then
      return jsonb_build_object('offer',to_jsonb(v_offer),'recipient_driver_ids','[]'::jsonb,'idempotent',true);
    end if;
    if v_offer.offer_status <> 'open' or v_offer.closes_at <= v_now
       or v_offer.updated_at is distinct from p_expected_updated_at
       or v_booking.updated_at is distinct from v_offer.booking_updated_at
       or v_offer.safe_offer_context ->> 'selection_mode' is distinct from 'admin'
       or v_offer.safe_offer_context ->> 'audience' is distinct from 'selected'
       or v_offer.offer_payout_sgd is distinct from p_offer_payout_sgd
       or v_offer.safe_vehicle_label is distinct from p_vehicle_requirement then
      raise exception 'Driver Pool state changed. Reload before widening.' using errcode='P0001';
    end if;
    if exists(select 1 from public.driver_job_bids where driver_job_bid_offer_id=v_offer.id
      and bid_status='pending' and safe_bid_context ->> 'response'='available') then
      raise exception 'An Available response needs Admin selection. Review responses first.' using errcode='22023';
    end if;
  else
    select * into v_offer from public.driver_job_bid_offers where publish_idempotency_key = v_key;
    if found then
      if v_offer.booking_reference is distinct from v_reference
         or v_offer.booking_updated_at is distinct from p_expected_updated_at
         or v_offer.offer_payout_sgd is distinct from p_offer_payout_sgd
         or v_offer.safe_vehicle_label is distinct from p_vehicle_requirement
         or v_offer.safe_offer_context -> 'selected_driver_ids' is distinct from
           (select jsonb_agg(d order by d) from unnest(p_selected_driver_ids) d) then
        raise exception 'Publish key already used for different input.' using errcode='22023';
      end if;
      return jsonb_build_object('offer',to_jsonb(v_offer),'recipient_driver_ids','[]'::jsonb,'idempotent',true);
    end if;
    if v_booking.updated_at is distinct from p_expected_updated_at then
      raise exception 'Saved booking changed. Reload before publishing.' using errcode='P0001';
    end if;
  end if;
  v_now := clock_timestamp();
  if nullif(btrim(coalesce(v_booking.public_booking_reference, '')), '') is null
     or length(btrim(v_booking.public_booking_reference)) > 120
     or v_booking.driver_id is not null
     or coalesce(lower(btrim(v_booking.admin_internal_status)), '') in ('cancelled','completed','archived','deleted')
     or coalesce(lower(btrim(v_booking.customer_facing_status)), '') in ('cancelled','completed')
     or v_booking.pickup_at <= v_now then
    raise exception 'Only a future unassigned non-terminal booking can be offered.' using errcode = '22023';
  end if;
  if not v_widen then
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

  end if;

  -- Lock candidate profiles and accounts while deriving the exact invitation set.
  perform 1 from public.drivers d where lower(btrim(coalesce(d.availability_status,'')))='available'
    and (v_widen or d.id=any(p_selected_driver_ids)) order by d.id for share;
  perform 1 from public.driver_access_accounts a
    where a.account_status='active' and (v_widen or a.driver_reference=any(
      select d::text from unnest(p_selected_driver_ids) d)) order by a.driver_reference for share;

  v_now := clock_timestamp();
  if v_booking.pickup_at <= v_now or (v_widen and v_offer.closes_at <= v_now) then
    raise exception 'Driver Pool offer expired while waiting. Reload before acting.' using errcode='22023';
  end if;

  select count(distinct d.id), array_agg(distinct d.id order by d.id)
  into v_recipient_count, v_recipient_ids
  from public.drivers d
  join public.driver_access_accounts a
    on a.driver_reference = d.id::text
   and a.account_status = 'active'
   and a.active_device_id_hash ~ '^[0-9a-f]{64}$'
  where lower(btrim(coalesce(d.availability_status, ''))) = 'available'
    and public.driver_pool_vehicle_matches(p_vehicle_requirement, d.vehicle_type)
    and (v_widen or d.id = any(p_selected_driver_ids))
    and (not v_widen or not exists(select 1 from public.driver_job_bids b
      where b.driver_job_bid_offer_id=v_offer.id and b.driver_reference=d.id::text));
  v_recipient_count := coalesce(v_recipient_count, 0);
  v_recipient_ids := coalesce(v_recipient_ids, array[]::bigint[]);
  if not v_widen and v_recipient_count <> cardinality(p_selected_driver_ids) then
    raise exception 'Selected drivers must be available, vehicle-compatible and have an active registered phone. Reload drivers.' using errcode='22023';
  end if;
  if v_widen and v_recipient_count = 0 then
    raise exception 'No additional eligible drivers are available.' using errcode='22023';
  end if;
  if v_recipient_count = 0 then
    raise exception 'No available Driver has the selected vehicle type.' using errcode = '22023';
  end if;

  v_all_recipient_ids := v_recipient_ids;
  if v_widen then
    select v_recipient_ids || coalesce(array_agg(driver_reference::bigint),array[]::bigint[])
    into v_all_recipient_ids from public.driver_job_bids where driver_job_bid_offer_id=v_offer.id;
  end if;
  select count(distinct s.driver_id) into v_push_target_count
  from public.driver_device_push_subscriptions s
  where s.driver_id = any(v_all_recipient_ids) and s.subscription_status = 'active';

  if v_widen then
    update public.driver_job_bid_offers
    set safe_offer_context = safe_offer_context || jsonb_build_object('audience','wider','widen_key',v_key,'widened_at',v_now),
        recipient_count=cardinality(v_all_recipient_ids), push_target_count=coalesce(v_push_target_count,0), updated_at=v_now
    where id=v_offer.id returning * into v_offer;
  else
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
    p_vehicle_requirement,
    nullif(btrim(coalesce(v_booking.service_type, v_booking.booking_type, '')), ''),
    jsonb_build_object('kind','fixed_driver_offer','price_scope','driver_offer_only','vehicle_requirement_version',1,'selection_mode','admin','audience','selected',
      'selected_driver_ids',(select jsonb_agg(d order by d) from unnest(p_selected_driver_ids) d)),
    'admin_api', v_actor_role, v_actor_label, v_now,
    least(v_booking.pickup_at, v_now + interval '24 hours'),
    v_recipient_count, coalesce(v_push_target_count, 0), v_now
  ) returning * into v_offer;
  end if;

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
    v_actor_label, case when v_widen then 'Driver Pool widened; prior responses retained and booking unassigned.' else 'Driver Pool published to selected drivers; Admin chooses the winner.' end,
    v_booking.id, v_booking.customer_id, v_actor_role, 'admin_dispatcher_override',
    v_reference, 'admin_api', 'Owner published fixed Driver offer.',
    jsonb_build_object('driver_id', v_booking.driver_id),
    jsonb_build_object('driver_pool_offer_id', v_offer.id, 'recipient_count', v_recipient_count)
  );

  return jsonb_build_object('offer', to_jsonb(v_offer), 'recipient_driver_ids', to_jsonb(v_recipient_ids), 'idempotent', false);
end;
$function$
;


revoke all on function public.accept_driver_pool_offer(text,bigint,timestamptz,text,text,text) from public, anon, authenticated;
grant execute on function public.accept_driver_pool_offer(text,bigint,timestamptz,text,text,text) to service_role;
revoke all on function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text,bigint[],text) from public, anon, authenticated;
grant execute on function public.publish_driver_pool_offer(text,timestamptz,numeric,text,text,text,text,bigint[],text) to service_role;
revoke all on function public.list_driver_pool_available_jobs(bigint,integer,integer) from public, anon, authenticated;
grant execute on function public.list_driver_pool_available_jobs(bigint,integer,integer) to service_role;
notify pgrst, 'reload schema';
commit;
