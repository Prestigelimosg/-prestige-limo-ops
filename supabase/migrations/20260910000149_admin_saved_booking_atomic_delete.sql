-- Completed account enrollment remains audit history after its source job is deleted.
-- New/in-progress enrollments still require an existing acknowledged Job Link.
alter table public.driver_account_enrollments
  alter column driver_job_link_id drop not null,
  add constraint driver_account_enrollments_deleted_source_check
    check (driver_job_link_id is not null or enrollment_status = 'consumed');

create function public.admin_delete_saved_booking_atomic(
  p_booking_id text,
  p_booking_reference text,
  p_status_column text,
  p_expected_status text,
  p_any_status boolean,
  p_actor_role text
) returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_booking public.bookings%rowtype;
  v_row jsonb;
  v_links uuid[];
  v_count integer;
begin
  if p_actor_role is null or p_actor_role not in ('admin', 'dispatcher')
    or p_any_status is null
    or p_status_column is null or p_status_column not in ('admin_internal_status', 'status')
    or nullif(p_booking_id, '') is null or nullif(p_booking_reference, '') is null
    or nullif(p_expected_status, '') is null then
    raise exception 'Invalid booking deletion request' using errcode = '22023';
  end if;
  select * into v_booking from public.bookings
    where id::text = p_booking_id and booking_reference = p_booking_reference for update;
  if not found then return null; end if;
  v_row := to_jsonb(v_booking);
  if coalesce(lower(v_row->>p_status_column), 'unknown') <> p_expected_status
    or (not p_any_status and p_expected_status not in ('completed', 'cancelled')) then
    raise exception 'Booking changed; reload before deleting' using errcode = '40001';
  end if;

  -- Lock exact links before account enrollment checks, blocking new FK claim races.
  perform id from public.driver_job_links where booking_reference = p_booking_reference
    order by id for update;
  select coalesce(array_agg(id), '{}'::uuid[]) into v_links
    from public.driver_job_links where booking_reference = p_booking_reference;
  perform id from public.driver_account_enrollments where driver_job_link_id = any(v_links)
    order by id for update;
  perform id from public.driver_access_accounts where source_driver_job_link_id = any(v_links)
    order by id for update;
  if exists (select 1 from public.driver_account_enrollments
      where driver_job_link_id = any(v_links) and enrollment_status <> 'consumed') then
    raise exception 'Driver account setup is unresolved; no records deleted' using errcode = '55000';
  end if;
  if exists (
    select 1 from public.driver_access_accounts a
    where a.source_driver_job_link_id = any(v_links)
      and not (a.account_status = 'revoked' and a.active_device_id_hash is null)
      and not exists (select 1 from public.driver_account_enrollments e
        where e.driver_job_link_id = a.source_driver_job_link_id
          and e.driver_id::text = a.driver_reference and e.auth_user_id = a.auth_user_id
          and e.enrollment_status = 'consumed')
  ) then
    raise exception 'Driver account source needs review; no records deleted' using errcode = '55000';
  end if;

  -- Detach provenance only. Never revoke accounts, clear device bindings or delete drivers.
  update public.driver_access_accounts set source_driver_job_link_id = null
    where source_driver_job_link_id = any(v_links);
  update public.driver_account_enrollments set driver_job_link_id = null
    where driver_job_link_id = any(v_links) and enrollment_status = 'consumed';

  delete from public.booking_service_items where booking_id = v_booking.id;
  delete from public.booking_route_points where booking_id = v_booking.id;
  delete from public.driver_job_bids where booking_reference = p_booking_reference;
  delete from public.driver_job_bid_offers where booking_reference = p_booking_reference;
  delete from public.customer_driver_app_notification_outbox where booking_reference = p_booking_reference;
  delete from public.driver_live_location_latest_positions where booking_reference = p_booking_reference;
  delete from public.driver_live_location_audit_events where booking_reference = p_booking_reference;
  delete from public.driver_ots_photo_proofs where booking_reference = p_booking_reference;
  delete from public.driver_job_dsp_actual_time_events where booking_reference = p_booking_reference;
  delete from public.driver_job_status_events where booking_reference = p_booking_reference;
  delete from public.driver_job_links where id = any(v_links);
  delete from public.bookings where id = v_booking.id and booking_reference = p_booking_reference;
  get diagnostics v_count = row_count;
  if v_count <> 1 then raise exception 'Booking deletion changed unexpectedly'; end if;
  -- Retain the existing safe adapter shape. No account or job details leave the function.
  return jsonb_build_object('id', v_booking.id, 'status', p_expected_status,
    'admin_internal_status', p_expected_status);
end;
$$;

revoke all on function public.admin_delete_saved_booking_atomic(text,text,text,text,boolean,text)
  from public, anon, authenticated;
grant execute on function public.admin_delete_saved_booking_atomic(text,text,text,text,boolean,text)
  to service_role;
