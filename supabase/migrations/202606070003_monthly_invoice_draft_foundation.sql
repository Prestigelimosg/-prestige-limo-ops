-- Monthly invoice draft foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares admin/dispatcher invoice draft records only.
-- No final invoice number, PDF, payment, payout, notification sending,
-- customer auth, driver auth, live-location, proof/photo, parser-learning,
-- or finance settlement data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.monthly_invoice_drafts (
  id uuid primary key default gen_random_uuid(),
  customer_account text not null,
  customer_id text,
  billing_month text not null,
  draft_status text not null default 'draft_planning',
  readiness_status text not null default 'mixed',
  ready_count integer not null default 0,
  blocked_count integer not null default 0,
  total_count integer not null default 0,
  source_grouping_summary jsonb not null default '{}'::jsonb,
  safe_draft_note text,
  safe_draft_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoice_drafts_customer_account_not_blank check (
    length(btrim(customer_account)) > 0
  ),
  constraint monthly_invoice_drafts_billing_month_check check (
    billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  constraint monthly_invoice_drafts_draft_status_check check (
    draft_status in (
      'draft_planning',
      'pending_admin_review',
      'admin_reviewed',
      'manager_approval_needed',
      'manager_approved',
      'blocked',
      'archived'
    )
  ),
  constraint monthly_invoice_drafts_readiness_status_check check (
    readiness_status in ('ready', 'blocked', 'mixed')
  ),
  constraint monthly_invoice_drafts_counts_non_negative check (
    ready_count >= 0 and blocked_count >= 0 and total_count >= 0
  ),
  constraint monthly_invoice_drafts_total_matches_counts check (
    total_count = ready_count + blocked_count
  ),
  constraint monthly_invoice_drafts_source_grouping_summary_object check (
    jsonb_typeof(source_grouping_summary) = 'object'
  ),
  constraint monthly_invoice_drafts_safe_draft_context_object check (
    jsonb_typeof(safe_draft_context) = 'object'
  ),
  constraint monthly_invoice_drafts_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint monthly_invoice_drafts_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint monthly_invoice_drafts_safe_draft_note_length check (
    safe_draft_note is null or length(safe_draft_note) <= 1000
  )
);

comment on table public.monthly_invoice_drafts is
  'Admin-only monthly invoice draft foundation. This is draft preparation only; no final invoice number, PDF, payment, payout, notification, customer auth, or driver auth is approved here.';

comment on column public.monthly_invoice_drafts.source_grouping_summary is
  'Safe grouped completed-trip summary copied from monthly billing grouping data. Do not store prices, payouts, payment details, final invoice numbers, PDF links, notification payloads, auth tokens, parser/debug internals, proof/photo data, or internal finance notes.';

comment on column public.monthly_invoice_drafts.safe_draft_context is
  'Safe admin invoice draft context only. This does not issue invoice numbers, generate PDFs, create payment links, send notifications, or expose customer/driver auth.';

alter table public.monthly_invoice_drafts
  add column if not exists customer_account text,
  add column if not exists customer_id text,
  add column if not exists billing_month text,
  add column if not exists draft_status text not null default 'draft_planning',
  add column if not exists readiness_status text not null default 'mixed',
  add column if not exists ready_count integer not null default 0,
  add column if not exists blocked_count integer not null default 0,
  add column if not exists total_count integer not null default 0,
  add column if not exists source_grouping_summary jsonb not null default '{}'::jsonb,
  add column if not exists safe_draft_note text,
  add column if not exists safe_draft_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists monthly_invoice_drafts_account_month_key
  on public.monthly_invoice_drafts (customer_account, billing_month);

create index if not exists monthly_invoice_drafts_billing_month_idx
  on public.monthly_invoice_drafts (billing_month);

create index if not exists monthly_invoice_drafts_draft_status_idx
  on public.monthly_invoice_drafts (draft_status);

create index if not exists monthly_invoice_drafts_readiness_status_idx
  on public.monthly_invoice_drafts (readiness_status);

create index if not exists monthly_invoice_drafts_updated_at_idx
  on public.monthly_invoice_drafts (updated_at);

create table if not exists public.monthly_invoice_draft_trip_links (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.monthly_invoice_drafts(id) on delete cascade,
  booking_reference text not null,
  closeout_id uuid,
  trip_readiness_status text not null default 'ready',
  closeout_status text,
  billing_prep_readiness text,
  safe_trip_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoice_draft_trip_links_reference_not_blank check (
    length(btrim(booking_reference)) > 0
  ),
  constraint monthly_invoice_draft_trip_links_trip_readiness_status_check check (
    trip_readiness_status in ('ready', 'blocked')
  ),
  constraint monthly_invoice_draft_trip_links_safe_trip_context_object check (
    jsonb_typeof(safe_trip_context) = 'object'
  )
);

comment on table public.monthly_invoice_draft_trip_links is
  'Admin-only links between monthly invoice draft records and grouped completed trips. This stores references/readiness only, not prices, payouts, PDF, payment, notification, or final invoice data.';

alter table public.monthly_invoice_draft_trip_links
  add column if not exists draft_id uuid,
  add column if not exists booking_reference text,
  add column if not exists closeout_id uuid,
  add column if not exists trip_readiness_status text not null default 'ready',
  add column if not exists closeout_status text,
  add column if not exists billing_prep_readiness text,
  add column if not exists safe_trip_context jsonb not null default '{}'::jsonb,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists monthly_invoice_draft_trip_links_draft_booking_key
  on public.monthly_invoice_draft_trip_links (draft_id, booking_reference);

create index if not exists monthly_invoice_draft_trip_links_draft_id_idx
  on public.monthly_invoice_draft_trip_links (draft_id);

create index if not exists monthly_invoice_draft_trip_links_booking_reference_idx
  on public.monthly_invoice_draft_trip_links (booking_reference);

alter table public.monthly_invoice_drafts enable row level security;
alter table public.monthly_invoice_draft_trip_links enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before runtime production writes.
