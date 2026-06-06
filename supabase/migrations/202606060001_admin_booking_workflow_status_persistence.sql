-- Stage 4A-427: admin booking workflow status persistence.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration adds admin/dispatcher operational workflow status storage only.
-- No customer auth, driver auth, invoice, PDF, payment, payout, notification
-- sending, live-location, proof/photo, parser-learning, or finance data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.booking_workflow_statuses (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  workflow_area text not null,
  status_value text not null,
  status_label text,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  safe_status_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint booking_workflow_statuses_reference_not_blank check (length(btrim(booking_reference)) > 0),
  constraint booking_workflow_statuses_workflow_area_check check (
    workflow_area in (
      'admin_booking_review',
      'dispatch_release',
      'driver_acknowledgement',
      'driver_job_progress',
      'day_of_trip_exception',
      'dispatch_recovery',
      'trip_completion',
      'closeout_review'
    )
  ),
  constraint booking_workflow_statuses_status_value_check check (
    status_value in (
      'not_started',
      'needs_review',
      'ready',
      'released',
      'pending_acknowledgement',
      'acknowledged',
      'no_response_needs_call',
      'otw',
      'ots',
      'pob',
      'completed',
      'exception_open',
      'recovery_review',
      'closed'
    )
  ),
  constraint booking_workflow_statuses_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint booking_workflow_statuses_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint booking_workflow_statuses_safe_context_object check (
    jsonb_typeof(safe_status_context) = 'object'
  )
);

comment on table public.booking_workflow_statuses is
  'Admin-only operational workflow status persistence for booking review, dispatch, acknowledgement, trip progress, recovery, completion, and closeout. RLS is enabled; customer and driver runtime access is not approved here.';

comment on column public.booking_workflow_statuses.booking_reference is
  'Safe booking reference used as the stable link to bookings across current and earlier schema shapes.';

comment on column public.booking_workflow_statuses.safe_status_context is
  'Safe operational status context only. Do not store prices, payouts, payment details, notification payloads, auth tokens, parser/debug internals, proof/photo data, or internal finance notes.';

alter table public.booking_workflow_statuses
  add column if not exists booking_reference text,
  add column if not exists workflow_area text,
  add column if not exists status_value text,
  add column if not exists status_label text,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists safe_status_context jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists booking_workflow_statuses_reference_area_key
  on public.booking_workflow_statuses (booking_reference, workflow_area);

create index if not exists booking_workflow_statuses_booking_reference_idx
  on public.booking_workflow_statuses (booking_reference);

create index if not exists booking_workflow_statuses_workflow_area_idx
  on public.booking_workflow_statuses (workflow_area);

create index if not exists booking_workflow_statuses_status_value_idx
  on public.booking_workflow_statuses (status_value);

create index if not exists booking_workflow_statuses_updated_at_idx
  on public.booking_workflow_statuses (updated_at);

alter table public.booking_workflow_statuses enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before this table is used by runtime
-- production writes.
