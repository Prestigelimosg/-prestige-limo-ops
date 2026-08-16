-- One approved Driver account per exact acknowledged Job Link and one native
-- app installation per account. Source-only until separately approved for
-- Production. Public signup and browser-direct table access remain closed.

set search_path = public, extensions;

alter table public.driver_access_accounts
  add column if not exists source_driver_job_link_id uuid
    references public.driver_job_links(id) on delete restrict,
  add column if not exists active_device_id_hash text,
  add column if not exists device_bound_at timestamptz,
  add constraint driver_access_accounts_device_hash_check check (
    active_device_id_hash is null
    or active_device_id_hash ~ '^[0-9a-f]{64}$'
  );

create unique index if not exists driver_access_accounts_source_link_key
  on public.driver_access_accounts (source_driver_job_link_id)
  where source_driver_job_link_id is not null;

create unique index if not exists driver_access_accounts_active_device_key
  on public.driver_access_accounts (active_device_id_hash)
  where active_device_id_hash is not null;

comment on column public.driver_access_accounts.source_driver_job_link_id is
  'Exact acknowledged Driver Job Link that authorized account creation. One link can authorize at most one Driver account.';

comment on column public.driver_access_accounts.active_device_id_hash is
  'Server-peppered SHA-256 hash of the one approved native app installation. Never store or return the raw installation identifier.';

create table if not exists public.driver_account_enrollments (
  id uuid primary key default gen_random_uuid(),
  driver_job_link_id uuid not null references public.driver_job_links(id) on delete restrict,
  driver_id bigint not null references public.drivers(id) on delete restrict,
  email_normalized text not null,
  enrollment_status text not null default 'reserved',
  auth_user_id uuid,
  created_at timestamptz not null default now(),
  consumed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (driver_job_link_id),
  unique (driver_id),
  unique (auth_user_id),
  constraint driver_account_enrollments_email_check check (
    email_normalized = lower(btrim(email_normalized))
    and length(email_normalized) between 3 and 254
  ),
  constraint driver_account_enrollments_status_check check (
    enrollment_status in ('reserved', 'consumed', 'failed')
  ),
  constraint driver_account_enrollments_consumed_check check (
    (enrollment_status = 'consumed' and auth_user_id is not null and consumed_at is not null)
    or enrollment_status <> 'consumed'
  )
);

comment on table public.driver_account_enrollments is
  'Server-only one-time account-enrolment claims derived from exact acknowledged Driver Job Links. Contains no password, raw Job Link token, raw device identifier, cookie, JWT, refresh token, Calendar credential, finance, billing, invoice, payout, PayNow, parser/debug, or internal admin data.';

alter table public.driver_account_enrollments enable row level security;

revoke all on table public.driver_account_enrollments from anon, authenticated;
grant select, insert, update on table public.driver_account_enrollments to service_role;

create or replace function public.admin_revoke_driver_account_and_delete_profile(
  p_driver_id bigint,
  p_actor_role text,
  p_actor_label text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_account_auth_user_id uuid;
  v_account_id uuid;
  v_account_reference text;
  v_account_revoked boolean := false;
  v_actor_label text := btrim(coalesce(p_actor_label, ''));
  v_actor_role text := lower(btrim(coalesce(p_actor_role, '')));
  v_contact_number text;
  v_driver_name text;
  v_plate_number text;
  v_vehicle_type text;
  v_availability_status text;
  v_now timestamptz := now();
begin
  if p_driver_id is null or p_driver_id <= 0 then
    raise exception 'A valid Driver id is required.' using errcode = '22023';
  end if;

  if v_actor_role not in ('admin', 'dispatcher') then
    raise exception 'A verified Admin or Dispatcher actor is required.' using errcode = '42501';
  end if;

  if length(v_actor_label) = 0 or length(v_actor_label) > 160 then
    raise exception 'A bounded actor label is required.' using errcode = '22023';
  end if;

  select
    driver_name,
    contact_number,
    vehicle_type,
    plate_number,
    availability_status
  into
    v_driver_name,
    v_contact_number,
    v_vehicle_type,
    v_plate_number,
    v_availability_status
  from public.drivers
  where id = p_driver_id
  for update;

  if not found then
    raise exception 'The selected Driver profile does not exist.' using errcode = 'P0002';
  end if;

  select id, auth_user_id, driver_reference
  into v_account_id, v_account_auth_user_id, v_account_reference
  from public.driver_access_accounts
  where driver_reference = p_driver_id::text
  for update;

  if found then
    update public.driver_access_accounts
    set
      account_status = 'revoked',
      active_device_id_hash = null,
      updated_at = v_now
    where id = v_account_id;

    insert into public.customer_driver_access_audit_events (
      account_surface,
      account_reference,
      auth_user_id,
      event_type,
      source_surface,
      actor_role,
      actor_label,
      safe_event_context
    )
    values (
      'driver',
      v_account_reference,
      v_account_auth_user_id,
      'account_revoked',
      'admin_api',
      v_actor_role,
      v_actor_label,
      jsonb_build_object('reason', 'driver_profile_deleted')
    );

    v_account_revoked := true;
  end if;

  delete from public.drivers
  where id = p_driver_id;

  return jsonb_build_object(
    'account_revoked', v_account_revoked,
    'record', jsonb_build_object(
      'id', p_driver_id,
      'driver_name', v_driver_name,
      'contact_number', v_contact_number,
      'vehicle_type', v_vehicle_type,
      'plate_number', v_plate_number,
      'availability_status', v_availability_status
    )
  );
end;
$$;

revoke execute on function public.admin_revoke_driver_account_and_delete_profile(bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_revoke_driver_account_and_delete_profile(bigint, text, text)
  to service_role;

comment on function public.admin_revoke_driver_account_and_delete_profile(bigint, text, text) is
  'Server-only atomic Admin action used by the existing Driver Database Delete control. It revokes an exact Driver app account, clears its installation binding, records one safe audit event, and deletes that exact Driver profile. It does not revoke private Driver Job Links.';
