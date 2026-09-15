-- Refuse to overwrite a reassignment function that changed after the read-only preflight.
do $$ begin
  if md5(pg_get_functiondef('public.apply_admin_driver_reassignment(text,timestamptz,bigint,text,text)'::regprocedure))
     is distinct from 'd71068e37dbd4222f2a367d3d89ce903' then
    raise exception 'Driver reassignment changed. Review the current function before applying cancellation.';
  end if;
end $$;

-- Extend the existing transaction with explicit NULL-replacement cancellation.
-- Positive replacement behavior remains the established Save Driver Assignment lane.
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
  v_cancellation boolean := p_new_driver_id is null;
  v_message text := case when p_new_driver_id is null then 'Job cancel, do not proceed.' else 'Job reassigned, do not proceed.' end;
  v_workflow text := case when p_new_driver_id is null then 'driver_assignment_cancellation' else 'driver_reassignment' end;
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

  if p_new_driver_id <= 0 then
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

  if v_cancellation then
    if exists (select 1 from public.bookings b where b.id = v_booking_id and (
      lower(btrim(coalesce(b.status, ''))) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed') or
      lower(btrim(coalesce(b.admin_internal_status, ''))) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed') or
      lower(btrim(coalesce(b.customer_facing_status, ''))) in ('cancelled','canceled','completed','complete','archived','deleted','declined','declined_internal','history','job completed','job_completed'))) then
      raise exception 'A terminal booking cannot have its Driver removed.' using errcode = '22023';
    end if;
    if exists (select 1 from public.driver_job_bid_offers where booking_reference = v_booking_reference
      and offer_status in ('open','assigned')) then
      raise exception 'Use the existing Driver Pool cancellation control for this assignment.' using errcode = '22023';
    end if;
    -- ACK and link issuance already lock this booking first. Status insertion below
    -- takes the same lock so a started trip and cancellation cannot both win.
    perform id from public.driver_job_links where booking_reference = v_booking_reference order by id for update;
    if exists (select 1 from public.driver_job_status_events where booking_reference = v_booking_reference) or
       exists (select 1 from public.driver_live_location_latest_positions where booking_reference = v_booking_reference) then
      raise exception 'Trip reporting or location sharing has started. Review the trip before changing its Driver.' using errcode = '22023';
    end if;
    if exists (select 1 from public.driver_job_links where booking_reference = v_booking_reference
      and driver_id is not null and driver_id <> v_previous_driver_id
      and link_status = 'active' and revoked_at is null and (expires_at is null or expires_at > v_now)) then
      raise exception 'Another Driver has an active link. Review the current assignment first.' using errcode = '22023';
    end if;
  else
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

  if v_cancellation then v_notification_link_id := null; end if;

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
      and (driver_id = v_previous_driver_id or (v_cancellation and driver_id is null))
      and link_status = 'active'
      and revoked_at is null
      and (expires_at is null or expires_at > v_now)
    returning id
  )
  select coalesce(array_agg(id), array[]::uuid[])
  into v_expired_link_ids
  from expired_links;

  if v_cancellation then
    update public.driver_job_links
    set safe_link_context = coalesce(safe_link_context, '{}'::jsonb) ||
      jsonb_build_object('assignment_cancelled_at', v_now)
    where booking_reference = v_booking_reference and (driver_id = v_previous_driver_id or driver_id is null);
  end if;

  v_event_key := (case when v_cancellation then 'driver-assignment-cancel:' else 'driver-reassignment:' end) || encode(
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
    v_workflow,
    'Prestige Driver',
    v_message,
    case when v_cancellation then jsonb_build_object('audience','cancelled_driver',
      'source','cancel_driver_assignment','recipient_driver_id',v_previous_driver_id) else jsonb_build_object(
      'audience', 'replaced_driver',
      'source', 'save_driver_assignment'
    ) end,
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
    case when v_cancellation then 'Driver assignment cancelled; booking retained, access disabled and one old-driver notice queued.'
      else 'Verified Driver reassigned; exact old-driver active links expired and one old-driver notice queued.' end,
    v_booking_id,
    v_customer_id,
    v_actor_role,
    'booking_updated',
    v_booking_reference,
    'admin_api',
    case when v_cancellation then 'Cancel Driver Assignment without replacement.' else 'Save Driver Assignment replacement protection.' end,
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
      'safe_message', v_message,
      'safe_title', 'Prestige Driver',
      'workflow_area', v_workflow
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
  'Server-only atomic Driver replacement or explicit NULL-replacement cancellation. Cancellation keeps the booking, disables old-driver/unbound access, queues one recipient-bound notice and preserves reports and Calendar records.';

-- Only assignments explicitly cancelled by the transaction above are blocked.
-- Preserve every existing report; a late request cannot append one after removal.
create or replace function public.guard_cancelled_driver_assignment_status()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform id from public.bookings where booking_reference = new.booking_reference for update;
  if exists (select 1 from public.driver_job_links where id = new.driver_job_link_id
    and booking_reference = new.booking_reference and safe_link_context ? 'assignment_cancelled_at') then
    raise exception 'This Driver assignment was cancelled. Contact Admin for the current job.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_cancelled_driver_assignment_status() from public, anon, authenticated;
grant execute on function public.guard_cancelled_driver_assignment_status() to service_role;
create trigger guard_cancelled_driver_assignment_status before insert on public.driver_job_status_events
for each row execute function public.guard_cancelled_driver_assignment_status();
