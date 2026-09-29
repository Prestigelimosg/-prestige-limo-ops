-- Repair the existing Pool cancellation only. No booking is cancelled by this migration.
-- Exact live body and existing report guard are required; fail closed on drift.
do $preflight$
begin
  if (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.cancel_driver_pool_offer(text,timestamptz,text,text)')) is distinct from '9112c138a623412513f8808757509bf5'
    or (select md5(prosrc) from pg_proc where oid=to_regprocedure('public.guard_cancelled_driver_assignment_status()')) is distinct from '308f0447b158d16b1b0930b0824aee80' then
    raise exception 'Pool cancellation prerequisite changed; inspect before applying.';
  end if;
end;
$preflight$;

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

  -- Same booking -> links lock order as ACK, issuance and explicit reassignment.
  -- The existing report guard locks this booking, then rejects cancelled links.
  perform id from public.driver_job_links
  where booking_reference = v_booking.booking_reference order by id for update;

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
     or exists (select 1 from unnest(array[v_booking.status, v_booking.admin_internal_status, v_booking.customer_facing_status]) s
       where lower(btrim(s)) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed'))
     or (nullif(v_offer.safe_offer_context->>'combo_id','') is not null and exists (
       select 1 from public.driver_job_links where booking_reference = v_booking.booking_reference
     ))
     or exists (
       select 1 from public.driver_job_links where booking_reference = v_booking.booking_reference
       and driver_id is not null and driver_id <> v_booking.driver_id
       and link_status = 'active' and revoked_at is null and (expires_at is null or expires_at > v_now)
     )
     or exists (
       select 1 from public.driver_live_location_latest_positions where booking_reference = v_booking.booking_reference
     )
     or exists (
       select 1 from public.driver_job_status_events
       where booking_reference = v_booking.booking_reference
     ) then
    raise exception 'Only the unchanged Pool assignment before trip reporting or location sharing, without conflicting Driver links, may be cancelled.' using errcode = '22023';
  end if;

  v_cancelled_driver_id := v_booking.driver_id;

  -- Disable only the cancelled driver's (or unbound) access. Retain ACK, reports,
  -- explicit revocation history and both Calendar records/credentials.
  update public.driver_job_links
  set expires_at = v_now, link_status = 'expired', updated_at = v_now
  where booking_reference = v_booking.booking_reference
    and (driver_id = v_cancelled_driver_id or driver_id is null)
    and link_status = 'active' and revoked_at is null
    and (expires_at is null or expires_at > v_now);
  update public.driver_job_links
  set safe_link_context = coalesce(safe_link_context, '{}'::jsonb) ||
    jsonb_build_object('assignment_cancelled_at', v_now)
  where booking_reference = v_booking.booking_reference
    and (driver_id = v_cancelled_driver_id or driver_id is null);


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
    'accepted Driver Pool assignment cancelled before trip start; booking remains active.',
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


revoke all on function public.cancel_driver_pool_offer(text,timestamptz,text,text) from public,anon,authenticated;
grant execute on function public.cancel_driver_pool_offer(text,timestamptz,text,text) to service_role;

-- A location request already in flight must not recreate access after cancellation.
-- Reuse the existing cancelled-assignment guard, its booking lock and exact link marker.
-- Other bookings/links pass through unchanged; no position is deleted or rewritten.
create trigger guard_cancelled_driver_assignment_location
before insert or update on public.driver_live_location_latest_positions
for each row execute function public.guard_cancelled_driver_assignment_status();
