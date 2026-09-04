-- Preserve the exact accepted Driver Pool amount on the existing booking payout
-- override while keeping ACK, Calendar, reports, messaging and payout execution
-- in their established separate lanes.

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
      'public_booking_reference', v_offer.public_booking_reference
    );
  end if;

  if v_offer.closes_at <= v_now and v_offer.offer_status = 'open' then
    update public.driver_job_bid_offers
    set offer_status = 'expired',
        closed_reason = 'expired',
        closed_at = v_now,
        updated_at = v_now
    where id = v_offer.id;

    update public.driver_job_bids
    set bid_status = 'expired',
        decided_at = v_now,
        decision_actor_role = 'system',
        decision_actor_label = 'Offer expired',
        updated_at = v_now
    where driver_job_bid_offer_id = v_offer.id
      and bid_status = 'pending';

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
    select 1
    from public.driver_access_accounts a
    where a.driver_reference = p_driver_id::text
      and a.account_status = 'active'
      and a.active_device_id_hash ~ '^[0-9a-f]{64}$'
  ) then
    return jsonb_build_object('ok', false, 'reason', 'not_eligible');
  end if;

  v_end := case
    when v_booking.dropoff_datetime > v_booking.pickup_at
      then v_booking.dropoff_datetime
    else v_booking.pickup_at + interval '90 minutes'
  end;

  if exists (
    select 1
    from public.bookings b
    where b.driver_id = p_driver_id
      and b.id <> v_booking.id
      and coalesce(lower(btrim(b.admin_internal_status)), '') not in ('cancelled', 'completed', 'archived', 'deleted')
      and coalesce(lower(btrim(b.customer_facing_status)), '') not in ('cancelled', 'completed')
      and tstzrange(
        b.pickup_at,
        case
          when b.dropoff_datetime > b.pickup_at then b.dropoff_datetime
          else b.pickup_at + interval '90 minutes'
        end,
        '[)'
      ) && tstzrange(v_booking.pickup_at, v_end, '[)')
  ) then
    return jsonb_build_object('ok', false, 'reason', 'schedule_conflict');
  end if;

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
  set offer_status = 'assigned',
      closed_reason = 'first_driver_accepted',
      closed_at = v_now,
      updated_at = v_now
  where id = v_offer.id
  returning * into v_offer;

  update public.bookings
  set driver_id = v_driver.id,
      driver_name = v_driver.driver_name,
      driver_contact = v_driver.contact_number,
      driver_plate_number = v_driver.plate_number,
      driver_payout_override=v_offer.offer_payout_sgd,
      driver_payout_reason='Driver Pool accepted fixed offer.',
      updated_at = v_now
  where id = v_booking.id
    and updated_at = v_booking.updated_at;
  if not found then
    raise exception 'Saved booking changed during Driver Pool acceptance.' using errcode = '40001';
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
    'public_booking_reference', v_offer.public_booking_reference
  );
end;
$$;

revoke all on function public.accept_driver_pool_offer(text, bigint, timestamptz, text)
from public, anon, authenticated;
grant execute on function public.accept_driver_pool_offer(text, bigint, timestamptz, text)
to service_role;

comment on function public.accept_driver_pool_offer(text, bigint, timestamptz, text) is
  'Atomically accepts one Driver Pool offer, assigns the verified Driver, and preserves the exact accepted fixed payout on the existing booking override without issuing a link or touching ACK, Calendar, reports, messages, billing, payment, PayNow or payout execution.';
