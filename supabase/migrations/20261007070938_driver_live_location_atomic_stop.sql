-- Persist the existing GPS share/stop operations atomically. No new public lane.
-- Apply before the matching server adapter; old direct writers are not fenced.
create index driver_live_location_exact_stop_cutoff_idx
  on public.driver_live_location_audit_events (driver_job_link_id, booking_reference, occurred_at desc)
  where event_type = 'share_stopped';

create function public.persist_driver_live_location(
  p_action text,
  p_driver_job_link_id uuid,
  p_booking_reference text,
  p_position jsonb,
  p_evidence_reference text,
  p_request_started_at timestamptz
) returns text
language plpgsql security invoker
set search_path = public, pg_catalog
as $$
declare
  v_link public.driver_job_links%rowtype;
  v_position public.driver_live_location_latest_positions%rowtype;
  v_stop timestamptz;
  v_written_at timestamptz;
begin
  if p_action is null or p_action not in ('share', 'stop')
     or p_driver_job_link_id is null or nullif(btrim(p_booking_reference), '') is null
     or p_request_started_at is null or not isfinite(p_request_started_at) then
    raise exception 'Invalid live location persistence request.' using errcode = '22023';
  end if;

  -- A single transaction, including its audit, owns this exact link's GPS write.
  perform pg_advisory_xact_lock(hashtextextended('driver-gps:' || p_driver_job_link_id::text, 0));
  -- Match cancellation/deletion's booking -> link -> GPS order, not the reverse.
  perform 1 from public.bookings where booking_reference = p_booking_reference for update;
  if not found then
    raise exception 'Live location booking is unavailable.' using errcode = 'P0001';
  end if;
  select * into v_link from public.driver_job_links
    where id = p_driver_job_link_id and booking_reference = p_booking_reference for update;
  if not found or v_link.link_status is distinct from 'active' or v_link.revoked_at is not null
     or v_link.expires_at is null or v_link.expires_at <= clock_timestamp() then
    raise exception 'Live location link is unavailable.' using errcode = 'P0001';
  end if;

  if p_action = 'stop' then
    -- clock_timestamp, after locking: transaction-start time can predate a wait.
    v_written_at := clock_timestamp();
    delete from public.driver_live_location_latest_positions where driver_job_link_id = p_driver_job_link_id;
    insert into public.driver_live_location_audit_events
      (event_type, driver_job_link_id, booking_reference, occurred_at, safe_event_context,
       source_surface, actor_role, evidence_reference)
    values ('share_stopped', p_driver_job_link_id, p_booking_reference, v_written_at,
      '{"source":"bounded_driver_live_location_runtime"}', 'driver_job_api', 'driver', p_evidence_reference);
    return 'stopped';
  end if;

  if p_position is null or jsonb_typeof(p_position) <> 'object'
     or exists (select 1 from jsonb_object_keys(p_position) k where k not in
       ('accuracy_meters', 'captured_at', 'heading_degrees', 'latitude', 'longitude',
        'speed_meters_per_second', 'stale_after', 'driver_display_label', 'assigned_job_label',
        'job_status', 'vehicle_plate_label')) then
    raise exception 'Invalid live location position.' using errcode = '22023';
  end if;
  select * into v_position from jsonb_populate_record(null::public.driver_live_location_latest_positions, p_position);
  if v_position.captured_at is null or not isfinite(v_position.captured_at)
     or v_position.stale_after is null or not isfinite(v_position.stale_after)
     or v_position.stale_after <= v_position.captured_at then
    raise exception 'Invalid live location capture time.' using errcode = '22023';
  end if;

  select max(occurred_at) into v_stop from public.driver_live_location_audit_events
    where driver_job_link_id = p_driver_job_link_id and booking_reference = p_booking_reference
      and event_type = 'share_stopped';
  -- The server request time also fences a pre-stop request from an ahead clock.
  -- A new post-stop capture/request keeps the established Share Location Again path.
  if v_stop is not null and
     (v_position.captured_at <= v_stop or p_request_started_at <= v_stop) then
    return 'ignored';
  end if;

  v_written_at := clock_timestamp();
  insert into public.driver_live_location_latest_positions
    (driver_job_link_id, booking_reference, driver_display_label, assigned_job_label, job_status,
     vehicle_plate_label, latitude, longitude, accuracy_meters, heading_degrees, speed_meters_per_second,
     captured_at, stale_after, sharing_state, source_surface, evidence_reference, updated_at)
  values (p_driver_job_link_id, p_booking_reference, v_position.driver_display_label,
     v_position.assigned_job_label, v_position.job_status, v_position.vehicle_plate_label,
     v_position.latitude, v_position.longitude, v_position.accuracy_meters,
     v_position.heading_degrees, v_position.speed_meters_per_second, v_position.captured_at,
     v_position.stale_after, 'active', 'driver_job_api', p_evidence_reference, v_written_at)
  on conflict (driver_job_link_id) do update set
    booking_reference = excluded.booking_reference,
    driver_display_label = excluded.driver_display_label, assigned_job_label = excluded.assigned_job_label,
    job_status = excluded.job_status, vehicle_plate_label = excluded.vehicle_plate_label,
    latitude = excluded.latitude, longitude = excluded.longitude, accuracy_meters = excluded.accuracy_meters,
    heading_degrees = excluded.heading_degrees, speed_meters_per_second = excluded.speed_meters_per_second,
    captured_at = excluded.captured_at, stale_after = excluded.stale_after, sharing_state = excluded.sharing_state,
    source_surface = excluded.source_surface, evidence_reference = excluded.evidence_reference,
    updated_at = excluded.updated_at;
  insert into public.driver_live_location_audit_events
    (event_type, driver_job_link_id, booking_reference, occurred_at, safe_event_context,
     source_surface, actor_role, evidence_reference)
  values ('position_updated', p_driver_job_link_id, p_booking_reference, v_written_at,
    '{"source":"bounded_driver_live_location_runtime"}', 'driver_job_api', 'driver', p_evidence_reference);
  return 'stored';
end;
$$;

revoke all on function public.persist_driver_live_location(text, uuid, text, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.persist_driver_live_location(text, uuid, text, jsonb, text, timestamptz)
  to service_role;
