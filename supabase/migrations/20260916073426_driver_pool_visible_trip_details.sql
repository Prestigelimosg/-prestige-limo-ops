-- Read-only trip details for the same eligible Driver Pool recipients.
-- Existing open offers gain details without republishing, data backfill or alerts.
begin;
do $baseline$ begin
  if not exists (select 1 from pg_proc
    where oid=to_regprocedure('public.list_driver_pool_available_jobs(bigint,integer,integer)')
      and not prosecdef
      and md5(regexp_replace(prosrc,'[[:space:]]','','g'))='dffaeb554992021bb01c7e42bfbe92f7') then
    raise exception 'Driver Pool reader changed. Inspect before applying trip details.';
  end if;
end $baseline$;
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
      coalesce(nullif(btrim(j.pickup_location), ''), nullif(btrim(j.pickup_address), ''), 'Pickup not provided') as safe_pickup_area,
      coalesce(nullif(btrim(j.dropoff_location), ''), nullif(btrim(j.dropoff_address), ''), 'Drop-off not provided') as safe_dropoff_area,
      jsonb_build_object(
        'route', coalesce(nullif(btrim(j.route_summary), ''), nullif(btrim(j.route), '')),
        'flight_number', nullif(btrim(j.flight_no), ''),
        'passengers', coalesce(j.pax_count, j.pax),
        'luggage', j.luggage_count,
        'child_seat', case when j.child_seat_required then concat(
          coalesce(nullif(j.child_seat_count, 0)::text || ' ', ''),
          coalesce(nullif(btrim(j.child_seat_type), ''), 'Child seat required')) else null end,
        'instructions', nullif(btrim(j.customer_special_request), ''),
        'scheduled_end_at', j.dropoff_datetime
      ) as safe_job_details,
      o.safe_vehicle_label,
      o.safe_trip_summary,
      o.updated_at,
      'first_accept'::text as selection_mode,
      'pending'::text as response_status
    from public.driver_job_bid_offers o
    join public.driver_job_bids b on b.driver_job_bid_offer_id = o.id
    join public.bookings j on j.booking_reference = o.booking_reference
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

revoke all on function public.list_driver_pool_available_jobs(bigint,integer,integer) from public, anon, authenticated;
grant execute on function public.list_driver_pool_available_jobs(bigint,integer,integer) to service_role;
commit;
