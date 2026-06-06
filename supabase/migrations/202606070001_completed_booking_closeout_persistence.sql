-- Stage 4A-434: completed booking closeout persistence foundation.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration prepares admin/dispatcher completed-trip closeout storage only.
-- No customer auth, driver auth, invoice, PDF, payment, payout, notification
-- sending, live-location, proof/photo, parser-learning, or finance data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.completed_booking_closeouts (
  id uuid primary key default gen_random_uuid(),
  booking_reference text not null,
  closeout_status text not null default 'not_started',
  completed_job_status text not null default 'not_confirmed',
  dsp_actual_hours_readiness text not null default 'not_applicable',
  extra_charges_readiness text not null default 'needs_review',
  billing_prep_readiness text not null default 'not_ready',
  safe_closeout_note text,
  safe_closeout_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint completed_booking_closeouts_reference_not_blank check (length(btrim(booking_reference)) > 0),
  constraint completed_booking_closeouts_closeout_status_check check (
    closeout_status in (
      'not_started',
      'needs_review',
      'ready_for_billing_prep',
      'closed'
    )
  ),
  constraint completed_booking_closeouts_completed_job_status_check check (
    completed_job_status in (
      'not_confirmed',
      'completed',
      'completion_exception',
      'needs_review'
    )
  ),
  constraint completed_booking_closeouts_dsp_actual_hours_readiness_check check (
    dsp_actual_hours_readiness in (
      'not_applicable',
      'needs_review',
      'ready',
      'blocked'
    )
  ),
  constraint completed_booking_closeouts_extra_charges_readiness_check check (
    extra_charges_readiness in (
      'none',
      'needs_review',
      'ready',
      'blocked'
    )
  ),
  constraint completed_booking_closeouts_billing_prep_readiness_check check (
    billing_prep_readiness in (
      'not_ready',
      'ready',
      'blocked'
    )
  ),
  constraint completed_booking_closeouts_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint completed_booking_closeouts_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint completed_booking_closeouts_safe_context_object check (
    jsonb_typeof(safe_closeout_context) = 'object'
  ),
  constraint completed_booking_closeouts_safe_note_length check (
    safe_closeout_note is null or length(safe_closeout_note) <= 1000
  )
);

comment on table public.completed_booking_closeouts is
  'Admin-only completed booking closeout persistence foundation for future monthly billing preparation. RLS is enabled; customer and driver runtime access is not approved here.';

comment on column public.completed_booking_closeouts.booking_reference is
  'Safe booking reference used as the stable link to completed bookings across current and earlier schema shapes.';

comment on column public.completed_booking_closeouts.dsp_actual_hours_readiness is
  'Operational readiness marker only for future DSP actual-hours review; no rate, price, payout, invoice, or payment amount is stored.';

comment on column public.completed_booking_closeouts.extra_charges_readiness is
  'Operational readiness marker only for future extra-charge review; no charge amount, invoice, payment, or payout data is stored.';

comment on column public.completed_booking_closeouts.billing_prep_readiness is
  'Operational readiness marker only for future monthly billing preparation; this does not create invoices, PDFs, payments, payouts, or finance records.';

comment on column public.completed_booking_closeouts.safe_closeout_context is
  'Safe operational closeout context only. Do not store prices, payouts, payment details, invoice data, PDF links, notification payloads, auth tokens, parser/debug internals, proof/photo data, or internal finance notes.';

alter table public.completed_booking_closeouts
  add column if not exists booking_reference text,
  add column if not exists closeout_status text not null default 'not_started',
  add column if not exists completed_job_status text not null default 'not_confirmed',
  add column if not exists dsp_actual_hours_readiness text not null default 'not_applicable',
  add column if not exists extra_charges_readiness text not null default 'needs_review',
  add column if not exists billing_prep_readiness text not null default 'not_ready',
  add column if not exists safe_closeout_note text,
  add column if not exists safe_closeout_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists completed_booking_closeouts_booking_reference_key
  on public.completed_booking_closeouts (booking_reference);

create index if not exists completed_booking_closeouts_closeout_status_idx
  on public.completed_booking_closeouts (closeout_status);

create index if not exists completed_booking_closeouts_completed_job_status_idx
  on public.completed_booking_closeouts (completed_job_status);

create index if not exists completed_booking_closeouts_billing_prep_readiness_idx
  on public.completed_booking_closeouts (billing_prep_readiness);

create index if not exists completed_booking_closeouts_updated_at_idx
  on public.completed_booking_closeouts (updated_at);

alter table public.completed_booking_closeouts enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before this table is used by runtime
-- production writes.
