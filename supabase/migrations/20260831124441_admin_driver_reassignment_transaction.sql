-- Atomic protection for the established Dispatch Save Driver Assignment action.
-- This function is server-only and may be invoked only by the existing verified
-- Admin/Dispatcher API through the service-role Supabase client.

create or replace function public.apply_admin_driver_reassignment(
  p_booking_reference text,
  p_expected_updated_at timestamptz,
  p_new_driver_id bigint,
  p_actor_role text,
  p_actor_label text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_actor_label text := btrim(coalesce(p_actor_label, ''));
  v_actor_role text := lower(btrim(coalesce(p_actor_role, '')));
  v_booking_id bigint;
  v_booking_reference text := btrim(coalesce(p_booking_reference, ''));
  v_customer_id bigint;
  v_event_key text;
  v_expired_link_ids uuid[] := array[]::uuid[];
  v_new_driver_contact text;
  v_new_driver_id bigint;
  v_new_driver_name text;
  v_new_driver_plate_number text;
  v_new_driver_status text;
  v_notification_id uuid;
  v_notification_link_id uuid;
  v_now timestamptz := clock_timestamp();
  v_previous_driver_contact text;
  v_previous_driver_id bigint;
  v_previous_driver_name text;
  v_previous_driver_plate_number text;
  v_previous_updated_at timestamptz;
begin
  if
    length(v_booking_reference) = 0
    or length(v_booking_reference) > 120
    or v_booking_reference !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$'
  then
    raise exception 'A valid booking reference is required.' using errcode = '22023';
  end if;

  if p_expected_updated_at is null then
    raise exception 'The exact saved booking version is required.' using errcode = '22023';
  end if;

  if p_new_driver_id is null or p_new_driver_id <= 0 then
    raise exception 'A valid replacement Driver id is required.' using errcode = '22023';
  end if;

  if v_actor_role not in ('admin', 'dispatcher') then
    raise exception 'A verified Admin or Dispatcher actor is required.' using errcode = '42501';
  end if;

  if length(v_actor_label) = 0 or length(v_actor_label) > 160 then
    raise exception 'A bounded actor label is required.' using errcode = '22023';
  end if;

  select
    id,
    customer_id,
    driver_id,
    driver_name,
    driver_contact,
    driver_plate_number,
    updated_at
  into
    v_booking_id,
    v_customer_id,
    v_previous_driver_id,
    v_previous_driver_name,
    v_previous_driver_contact,
    v_previous_driver_plate_number,
    v_previous_updated_at
  from public.bookings
  where booking_reference = v_booking_reference
  for update;

  if not found then
    raise exception 'The exact saved booking was not found.' using errcode = 'P0002';
  end if;

  if v_previous_updated_at is distinct from p_expected_updated_at then
    raise exception 'The saved booking changed. Reload it before assigning another Driver.'
      using errcode = '40001';
  end if;

  if v_previous_driver_id is null then
    raise exception 'Initial Driver assignment must use the established booking update path.'
      using errcode = '22023';
  end if;

  if v_previous_driver_id = p_new_driver_id then
    raise exception 'The selected Driver is already assigned to this booking.'
      using errcode = '22023';
  end if;

  select
    id,
    driver_name,
    contact_number,
    plate_number,
    availability_status
  into
    v_new_driver_id,
    v_new_driver_name,
    v_new_driver_contact,
    v_new_driver_plate_number,
    v_new_driver_status
  from public.drivers
  where id = p_new_driver_id
    and lower(btrim(availability_status)) <> 'inactive'
  for update;

  if not found or v_new_driver_id is null then
    raise exception 'The replacement Driver must be one active verified Driver profile.'
      using errcode = 'P0002';
  end if;

  -- Lock every exact old-driver active link before the single-table update.
  perform id
  from public.driver_job_links
  where booking_reference = v_booking_reference
    and driver_id = v_previous_driver_id
    and link_status = 'active'
    and revoked_at is null
    and (expires_at is null or expires_at > v_now)
  for update;

  select id
  into v_notification_link_id
  from public.driver_job_links
  where booking_reference = v_booking_reference
    and driver_id = v_previous_driver_id
    and link_status = 'active'
    and revoked_at is null
    and (expires_at is null or expires_at > v_now)
  order by created_at desc
  limit 1;

  update public.bookings
  set
    driver_id = v_new_driver_id,
    driver_name = v_new_driver_name,
    driver_contact = v_new_driver_contact,
    driver_plate_number = v_new_driver_plate_number,
    updated_at = v_now
  where id = v_booking_id
    and updated_at = v_previous_updated_at;

  if not found then
    raise exception 'The saved booking changed. Reload it before assigning another Driver.'
      using errcode = '40001';
  end if;

  with expired_links as (
    update public.driver_job_links
    set
      expires_at = v_now,
      link_status = 'expired',
      updated_at = v_now
    where booking_reference = v_booking_reference
      and driver_id = v_previous_driver_id
      and link_status = 'active'
      and revoked_at is null
      and (expires_at is null or expires_at > v_now)
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into v_expired_link_ids
  from expired_links;

  v_event_key := 'driver-reassignment:' || encode(
    extensions.digest(
      concat_ws(
        ':',
        v_booking_reference,
        v_previous_driver_id::text,
        v_new_driver_id::text,
        p_expected_updated_at::text
      ),
      'sha256'
    ),
    'hex'
  );

  insert into public.customer_driver_app_notification_outbox (
    notification_type,
    notification_status,
    priority,
    delivery_surface,
    event_key,
    booking_reference,
    driver_job_link_id,
    workflow_area,
    safe_title,
    safe_message,
    safe_context,
    source_surface,
    actor_role,
    actor_label,
    updated_at
  )
  values (
    'booking_status',
    'queued',
    'urgent',
    'driver_app',
    v_event_key,
    v_booking_reference,
    v_notification_link_id,
    'driver_reassignment',
    'Prestige Driver',
    'Job reassigned, do not proceed.',
    jsonb_build_object(
      'audience', 'replaced_driver',
      'source', 'save_driver_assignment'
    ),
    'admin_api',
    v_actor_role,
    v_actor_label,
    v_now
  )
  returning id into v_notification_id;

  insert into public.audit_logs (
    entity_type,
    entity_id,
    action,
    source_route,
    actor_label,
    change_summary,
    booking_id,
    customer_id,
    actor_role,
    action_type,
    booking_reference,
    source_surface,
    reason,
    safe_before,
    safe_after
  )
  values (
    'booking',
    v_booking_id,
    'booking_updated',
    '/api/admin-bookings',
    v_actor_label,
    'Verified Driver reassigned; exact old-driver active links expired and one old-driver notice queued.',
    v_booking_id,
    v_customer_id,
    v_actor_role,
    'booking_updated',
    v_booking_reference,
    'admin_api',
    'Save Driver Assignment replacement protection.',
    jsonb_build_object(
      'driver_id', v_previous_driver_id,
      'driver_name', v_previous_driver_name,
      'driver_contact', v_previous_driver_contact,
      'driver_plate_number', v_previous_driver_plate_number
    ),
    jsonb_build_object(
      'driver_id', v_new_driver_id,
      'driver_name', v_new_driver_name,
      'driver_contact', v_new_driver_contact,
      'driver_plate_number', v_new_driver_plate_number
    )
  );

  return jsonb_build_object(
    'booking_id', v_booking_id,
    'booking_reference', v_booking_reference,
    'previous_driver_id', v_previous_driver_id,
    'new_driver_id', v_new_driver_id,
    'expired_link_ids', to_jsonb(v_expired_link_ids),
    'notification', jsonb_build_object(
      'id', v_notification_id,
      'booking_reference', v_booking_reference,
      'delivery_surface', 'driver_app',
      'driver_job_link_id', v_notification_link_id,
      'notification_status', 'queued',
      'notification_type', 'booking_status',
      'priority', 'urgent',
      'safe_message', 'Job reassigned, do not proceed.',
      'safe_title', 'Prestige Driver',
      'workflow_area', 'driver_reassignment'
    )
  );
end;
$$;

revoke execute on function public.apply_admin_driver_reassignment(
  text,
  timestamptz,
  bigint,
  text,
  text
)
  from public, anon, authenticated;
grant execute on function public.apply_admin_driver_reassignment(
  text,
  timestamptz,
  bigint,
  text,
  text
)
  to service_role;

comment on function public.apply_admin_driver_reassignment(
  text,
  timestamptz,
  bigint,
  text,
  text
) is
  'Server-only atomic Save Driver Assignment replacement action. It updates only the exact booking Driver identity, expires only that booking previous Driver active links without revocation, queues one replaced-Driver notice, and records one safe audit row.';
