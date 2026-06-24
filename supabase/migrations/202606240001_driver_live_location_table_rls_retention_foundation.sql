-- Driver live location table/RLS/retention foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares closed live-location latest-position and audit
-- storage for a later approved driver GPS evidence lane.
-- No GPS capture, admin active-jobs map runtime, customer live map, provider
-- send, Telegram/WhatsApp/SMS/email, billing/payment/PDF/payout, parser,
-- Save Booking, or /api/admin-saved-bookings behavior is activated here.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.driver_live_location_latest_positions (
  id uuid primary key default gen_random_uuid(),
  driver_job_link_id uuid not null references public.driver_job_links(id) on delete cascade,
  booking_reference text not null,
  driver_display_label text,
  assigned_job_label text,
  job_status text,
  vehicle_plate_label text,
  latitude numeric(10, 7) not null,
  longitude numeric(10, 7) not null,
  accuracy_meters numeric(10, 2),
  heading_degrees numeric(6, 2),
  speed_meters_per_second numeric(8, 2),
  captured_at timestamptz not null,
  stale_after timestamptz not null,
  sharing_state text not null default 'active',
  source_surface text not null default 'driver_job_api',
  evidence_reference text,
  updated_at timestamptz not null default now(),
  constraint driver_live_location_latest_booking_reference_not_blank check (
    length(btrim(booking_reference)) > 0 and length(booking_reference) <= 120
  ),
  constraint driver_live_location_latest_driver_label_length check (
    driver_display_label is null or length(driver_display_label) <= 160
  ),
  constraint driver_live_location_latest_job_label_length check (
    assigned_job_label is null or length(assigned_job_label) <= 160
  ),
  constraint driver_live_location_latest_job_status_length check (
    job_status is null or length(job_status) <= 80
  ),
  constraint driver_live_location_latest_vehicle_plate_length check (
    vehicle_plate_label is null or length(vehicle_plate_label) <= 80
  ),
  constraint driver_live_location_latest_latitude_range check (
    latitude >= -90 and latitude <= 90
  ),
  constraint driver_live_location_latest_longitude_range check (
    longitude >= -180 and longitude <= 180
  ),
  constraint driver_live_location_latest_accuracy_range check (
    accuracy_meters is null or (accuracy_meters >= 0 and accuracy_meters <= 10000)
  ),
  constraint driver_live_location_latest_heading_range check (
    heading_degrees is null or (heading_degrees >= 0 and heading_degrees < 360)
  ),
  constraint driver_live_location_latest_speed_range check (
    speed_meters_per_second is null
    or (speed_meters_per_second >= 0 and speed_meters_per_second <= 120)
  ),
  constraint driver_live_location_latest_stale_after_order check (
    stale_after > captured_at
  ),
  constraint driver_live_location_latest_sharing_state_check check (
    sharing_state in ('active', 'paused', 'stopped', 'stale', 'expired')
  ),
  constraint driver_live_location_latest_source_surface_check check (
    source_surface in ('driver_job_api', 'admin_api', 'migration', 'system')
  ),
  constraint driver_live_location_latest_evidence_reference_length check (
    evidence_reference is null or length(evidence_reference) <= 160
  )
);

comment on table public.driver_live_location_latest_positions is
  'Closed driver live-location latest-position foundation. RLS is enabled; no public, customer, anonymous, broad authenticated, or direct driver policies are created here.';

comment on column public.driver_live_location_latest_positions.driver_job_link_id is
  'Server-side reference to the resolved driver job link row. Raw driver job tokens and token hashes must never be stored here.';

comment on column public.driver_live_location_latest_positions.booking_reference is
  'Safe booking reference for admin dispatch matching only. Do not store customer contact details, prices, payouts, payment, billing, invoice, PDF, parser/debug, or provider payload fields.';

comment on column public.driver_live_location_latest_positions.evidence_reference is
  'Optional safe evidence run reference. Do not store secrets, env values, cookies, JWTs, API keys, raw tokens, or private customer data.';

create unique index if not exists driver_live_location_latest_positions_job_link_key
  on public.driver_live_location_latest_positions (driver_job_link_id);

create index if not exists driver_live_location_latest_positions_booking_reference_idx
  on public.driver_live_location_latest_positions (booking_reference);

create index if not exists driver_live_location_latest_positions_sharing_state_idx
  on public.driver_live_location_latest_positions (sharing_state);

create index if not exists driver_live_location_latest_positions_stale_after_idx
  on public.driver_live_location_latest_positions (stale_after);

create index if not exists driver_live_location_latest_positions_updated_at_idx
  on public.driver_live_location_latest_positions (updated_at);

create table if not exists public.driver_live_location_audit_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  driver_job_link_id uuid references public.driver_job_links(id) on delete set null,
  booking_reference text not null,
  occurred_at timestamptz not null default now(),
  safe_event_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'driver_job_api',
  actor_role text not null default 'driver',
  evidence_reference text,
  created_at timestamptz not null default now(),
  constraint driver_live_location_audit_event_type_check check (
    event_type in (
      'share_started',
      'position_updated',
      'share_paused',
      'share_stopped',
      'position_stale',
      'position_expired',
      'admin_read',
      'access_blocked',
      'evidence_cleanup'
    )
  ),
  constraint driver_live_location_audit_booking_reference_not_blank check (
    length(btrim(booking_reference)) > 0 and length(booking_reference) <= 120
  ),
  constraint driver_live_location_audit_context_object check (
    jsonb_typeof(safe_event_context) = 'object'
  ),
  constraint driver_live_location_audit_source_surface_check check (
    source_surface in ('driver_job_api', 'admin_api', 'migration', 'system')
  ),
  constraint driver_live_location_audit_actor_role_check check (
    actor_role in ('driver', 'admin', 'dispatcher', 'system')
  ),
  constraint driver_live_location_audit_evidence_reference_length check (
    evidence_reference is null or length(evidence_reference) <= 160
  )
);

comment on table public.driver_live_location_audit_events is
  'Bounded driver live-location audit-event foundation. RLS is enabled and no browser-readable policies are created here.';

comment on column public.driver_live_location_audit_events.safe_event_context is
  'Safe audit context only. Do not store raw tokens, token hashes, cookies, JWTs, API keys, customer contact details, customer messages, prices, payouts, PayNow, payment, billing, invoice, PDF, internal notes, parser/debug fields, provider payloads, OTS/photo/storage, or calendar data.';

create index if not exists driver_live_location_audit_events_booking_reference_idx
  on public.driver_live_location_audit_events (booking_reference);

create index if not exists driver_live_location_audit_events_driver_job_link_idx
  on public.driver_live_location_audit_events (driver_job_link_id)
  where driver_job_link_id is not null;

create index if not exists driver_live_location_audit_events_event_type_idx
  on public.driver_live_location_audit_events (event_type);

create index if not exists driver_live_location_audit_events_occurred_at_idx
  on public.driver_live_location_audit_events (occurred_at);

create index if not exists driver_live_location_audit_events_evidence_reference_idx
  on public.driver_live_location_audit_events (evidence_reference)
  where evidence_reference is not null;

alter table public.driver_live_location_latest_positions enable row level security;
alter table public.driver_live_location_audit_events enable row level security;

revoke all on table public.driver_live_location_latest_positions from anon, authenticated;
revoke all on table public.driver_live_location_audit_events from anon, authenticated;

-- RLS is intentionally enabled without public, customer, anonymous, broad
-- authenticated, or direct driver policies. A later approved route/helper lane
-- must prove server-side driver job token resolution, admin/dispatcher read
-- isolation, retention cleanup, and rollback before GPS capture or active map
-- runtime can be enabled.
