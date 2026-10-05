-- Repair only the existing Pool combo's member-to-member timing check.
-- No booking end times are inferred or persisted. Driver conflicts against
-- other bookings, direct assignment, acceptance and all consumers stay intact.
-- Fingerprint preflight refuses to overwrite a changed deployed definition.
do $repair$
declare
  function_oid oid := to_regprocedure('public.publish_driver_job_combo(uuid,uuid,timestamp with time zone,numeric,text,text,text,text,bigint[],text)');
  body text;
  definition text;
  old_check text := $before$  if exists(select 1 from public.bookings a join public.bookings b on a.booking_reference<b.booking_reference
    where a.booking_reference=any(refs) and b.booking_reference=any(refs)
    and tstzrange(a.pickup_at,case when a.dropoff_datetime>a.pickup_at then a.dropoff_datetime else a.pickup_at+interval '90 minutes' end,'[)')
      && tstzrange(b.pickup_at,case when b.dropoff_datetime>b.pickup_at then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')) then
$before$;
  new_check text := $after$  if exists(select 1 from public.bookings a join public.bookings b on a.booking_reference<b.booking_reference
    where a.booking_reference=any(refs) and b.booking_reference=any(refs)
    -- Admin composed these exact TRF legs as one sequence. A missing end is
    -- unknown, not a measured 90-minute duration between member pickups.
    -- Keep simultaneous pickups, explicit overlaps and malformed ends blocked.
    and not (
      coalesce(upper(btrim(a.service_type)),'')='TRF'
      and coalesce(upper(btrim(b.service_type)),'')='TRF'
      and (a.dropoff_datetime is null or a.dropoff_datetime>a.pickup_at)
      and (b.dropoff_datetime is null or b.dropoff_datetime>b.pickup_at)
      and ((a.pickup_at<b.pickup_at and a.dropoff_datetime is null)
        or (b.pickup_at<a.pickup_at and b.dropoff_datetime is null))
    )
    and tstzrange(a.pickup_at,case when a.dropoff_datetime>a.pickup_at then a.dropoff_datetime else a.pickup_at+interval '90 minutes' end,'[)')
      && tstzrange(b.pickup_at,case when b.dropoff_datetime>b.pickup_at then b.dropoff_datetime else b.pickup_at+interval '90 minutes' end,'[)')) then
$after$;
begin
  select prosrc,pg_get_functiondef(oid) into body,definition from pg_proc where oid=function_oid;
  if function_oid is null or md5(body) is distinct from 'e9a90410db5347c42c647c3d1b609690'
    or (length(body)-length(replace(body,old_check,'')))/length(old_check)<>1 then
    raise exception 'Combo TRF timing repair: definition changed.';
  end if;
  execute replace(definition,old_check,new_check);
end;
$repair$;
