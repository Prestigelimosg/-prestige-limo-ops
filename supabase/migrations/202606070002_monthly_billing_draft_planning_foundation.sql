-- Monthly billing draft planning foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares admin/dispatcher monthly billing draft planning storage only.
-- No invoice generation, invoice number, PDF, payment, payout, notification
-- sending, customer auth, driver auth, live-location, proof/photo, parser-learning,
-- or finance settlement data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.monthly_billing_draft_plans (
  id uuid primary key default gen_random_uuid(),
  customer_account text not null,
  customer_id text,
  billing_month text not null,
  draft_status text not null default 'planning',
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
  constraint monthly_billing_draft_plans_customer_account_not_blank check (
    length(btrim(customer_account)) > 0
  ),
  constraint monthly_billing_draft_plans_billing_month_check check (
    billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  constraint monthly_billing_draft_plans_draft_status_check check (
    draft_status in (
      'planning',
      'blocked',
      'ready_for_billing_draft_review',
      'archived'
    )
  ),
  constraint monthly_billing_draft_plans_readiness_status_check check (
    readiness_status in ('ready', 'blocked', 'mixed')
  ),
  constraint monthly_billing_draft_plans_counts_non_negative check (
    ready_count >= 0 and blocked_count >= 0 and total_count >= 0
  ),
  constraint monthly_billing_draft_plans_total_matches_counts check (
    total_count = ready_count + blocked_count
  ),
  constraint monthly_billing_draft_plans_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint monthly_billing_draft_plans_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint monthly_billing_draft_plans_source_grouping_summary_object check (
    jsonb_typeof(source_grouping_summary) = 'object'
  ),
  constraint monthly_billing_draft_plans_safe_draft_context_object check (
    jsonb_typeof(safe_draft_context) = 'object'
  ),
  constraint monthly_billing_draft_plans_safe_note_length check (
    safe_draft_note is null or length(safe_draft_note) <= 1000
  )
);

comment on table public.monthly_billing_draft_plans is
  'Admin-only monthly billing draft planning foundation from saved completed-trip grouping data. RLS is enabled; customer and driver runtime access is not approved here.';

comment on column public.monthly_billing_draft_plans.customer_account is
  'Safe customer/account display label used for admin monthly billing draft planning.';

comment on column public.monthly_billing_draft_plans.billing_month is
  'YYYY-MM billing month used to group saved completed trips for later billing draft review.';

comment on column public.monthly_billing_draft_plans.source_grouping_summary is
  'Safe grouping summary copied from monthly billing read data. Do not store prices, payouts, payment details, invoice data, PDF links, notification payloads, auth tokens, parser/debug internals, proof/photo data, or internal finance notes.';

comment on column public.monthly_billing_draft_plans.safe_draft_context is
  'Safe admin planning context only. This does not create invoice numbers, PDFs, payment links, payouts, notifications, or customer/driver auth.';

alter table public.monthly_billing_draft_plans
  add column if not exists customer_account text,
  add column if not exists customer_id text,
  add column if not exists billing_month text,
  add column if not exists draft_status text not null default 'planning',
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

create unique index if not exists monthly_billing_draft_plans_account_month_key
  on public.monthly_billing_draft_plans (customer_account, billing_month);

create index if not exists monthly_billing_draft_plans_billing_month_idx
  on public.monthly_billing_draft_plans (billing_month);

create index if not exists monthly_billing_draft_plans_draft_status_idx
  on public.monthly_billing_draft_plans (draft_status);

create index if not exists monthly_billing_draft_plans_readiness_status_idx
  on public.monthly_billing_draft_plans (readiness_status);

create index if not exists monthly_billing_draft_plans_updated_at_idx
  on public.monthly_billing_draft_plans (updated_at);

alter table public.monthly_billing_draft_plans enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before runtime production writes.
