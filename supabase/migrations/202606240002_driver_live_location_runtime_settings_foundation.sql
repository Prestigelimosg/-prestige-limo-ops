-- Driver live location admin runtime settings foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares the closed admin-controlled setting row used to
-- open Driver Live Location for explicit job references after stable server
-- env gates are already installed.
-- No GPS capture, admin active-jobs map runtime, customer live map, provider
-- send, external messaging, billing/payment/PDF/payout, parser,
-- Save Booking, or /api/admin-saved-bookings behavior is activated here.

set search_path = public, extensions;

create table if not exists public.driver_live_location_runtime_settings (
  setting_name text primary key,
  setting_status text not null default 'closed',
  driver_live_location_capture_enabled boolean not null default false,
  admin_active_jobs_map_enabled boolean not null default false,
  driver_live_location_mode text not null default 'closed',
  driver_live_location_allowed_job_references text[] not null default '{}'::text[],
  driver_live_location_stale_after_seconds integer not null default 300,
  driver_live_location_retention_minutes integer not null default 120,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint driver_live_location_runtime_setting_singleton check (
    setting_name = 'driver_live_location_runtime'
  ),
  constraint driver_live_location_runtime_setting_status_check check (
    setting_status in ('closed', 'active')
  ),
  constraint driver_live_location_runtime_mode_check check (
    driver_live_location_mode in ('closed', 'runtime')
  ),
  constraint driver_live_location_runtime_references_limit check (
    cardinality(driver_live_location_allowed_job_references) <= 50
  ),
  constraint driver_live_location_runtime_references_no_null check (
    array_position(driver_live_location_allowed_job_references, null) is null
  ),
  constraint driver_live_location_runtime_references_no_wildcards check (
    not (
      driver_live_location_allowed_job_references && array[
        '*',
        'all',
        'ALL',
        'all-drivers',
        'all-jobs',
        'all_drivers',
        'all_jobs'
      ]::text[]
    )
  ),
  constraint driver_live_location_runtime_stale_after_range check (
    driver_live_location_stale_after_seconds >= 30
    and driver_live_location_stale_after_seconds <= 3600
  ),
  constraint driver_live_location_runtime_retention_range check (
    driver_live_location_retention_minutes >= 5
    and driver_live_location_retention_minutes <= 1440
  ),
  constraint driver_live_location_runtime_closed_has_no_refs check (
    setting_status = 'active'
    or cardinality(driver_live_location_allowed_job_references) = 0
  )
);

comment on table public.driver_live_location_runtime_settings is
  'Closed admin-controlled Driver Live Location runtime gate settings. RLS is enabled; no public, customer, anonymous, broad authenticated, or direct driver policies are created here.';

comment on column public.driver_live_location_runtime_settings.setting_name is
  'Singleton setting name. Only driver_live_location_runtime is allowed.';

comment on column public.driver_live_location_runtime_settings.driver_live_location_allowed_job_references is
  'Explicit safe booking/job references only. Wildcards and all-driver/all-job activation are not allowed.';

create index if not exists driver_live_location_runtime_settings_status_idx
  on public.driver_live_location_runtime_settings (setting_status);

create index if not exists driver_live_location_runtime_settings_updated_at_idx
  on public.driver_live_location_runtime_settings (updated_at);

alter table public.driver_live_location_runtime_settings enable row level security;

revoke all on table public.driver_live_location_runtime_settings from anon, authenticated;
grant select, insert, update, delete on table public.driver_live_location_runtime_settings to service_role;

-- RLS is intentionally enabled without public, customer, anonymous, broad
-- authenticated, or direct driver policies. The service role is the only
-- granted role because route/helper code must keep access server-side behind
-- admin/dispatcher and driver job-token boundaries. A later approved evidence
-- pass must prove closed default state, explicit reference scoping, cleanup,
-- zero temporary rows, rollback, and no customer live map before GPS capture or
-- active map runtime is enabled.
