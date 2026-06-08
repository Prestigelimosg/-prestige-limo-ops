-- Monthly invoice issue review foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares admin/dispatcher invoice issue readiness records only.
-- No final invoice number, PDF, payment, payout, notification sending,
-- customer auth, driver auth, live-location, proof/photo, parser-learning,
-- or finance settlement data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.monthly_invoice_issue_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.monthly_invoice_drafts(id) on delete cascade,
  customer_account text not null,
  billing_month text not null,
  draft_status_snapshot text not null default 'pending_admin_review',
  issue_review_status text not null default 'issue_review_pending',
  readiness_status text not null default 'mixed',
  ready_count integer not null default 0,
  blocked_count integer not null default 0,
  total_count integer not null default 0,
  source_draft_summary jsonb not null default '{}'::jsonb,
  safe_issue_note text,
  safe_issue_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoice_issue_reviews_customer_account_not_blank check (
    length(btrim(customer_account)) > 0
  ),
  constraint monthly_invoice_issue_reviews_billing_month_check check (
    billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  constraint monthly_invoice_issue_reviews_draft_status_snapshot_check check (
    draft_status_snapshot in (
      'draft_planning',
      'pending_admin_review',
      'admin_reviewed',
      'manager_approval_needed',
      'manager_approved',
      'blocked',
      'archived'
    )
  ),
  constraint monthly_invoice_issue_reviews_issue_status_check check (
    issue_review_status in (
      'issue_review_pending',
      'manager_review_required',
      'manager_reviewed',
      'ready_for_future_issue',
      'blocked',
      'archived'
    )
  ),
  constraint monthly_invoice_issue_reviews_readiness_status_check check (
    readiness_status in ('ready', 'blocked', 'mixed')
  ),
  constraint monthly_invoice_issue_reviews_counts_non_negative check (
    ready_count >= 0 and blocked_count >= 0 and total_count >= 0
  ),
  constraint monthly_invoice_issue_reviews_total_matches_counts check (
    total_count = ready_count + blocked_count
  ),
  constraint monthly_invoice_issue_reviews_source_draft_summary_object check (
    jsonb_typeof(source_draft_summary) = 'object'
  ),
  constraint monthly_invoice_issue_reviews_safe_issue_context_object check (
    jsonb_typeof(safe_issue_context) = 'object'
  ),
  constraint monthly_invoice_issue_reviews_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint monthly_invoice_issue_reviews_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint monthly_invoice_issue_reviews_safe_issue_note_length check (
    safe_issue_note is null or length(safe_issue_note) <= 1000
  )
);

comment on table public.monthly_invoice_issue_reviews is
  'Admin-only monthly invoice issue readiness review. This is pre-issue review only; no final invoice number, PDF, payment link, payout, notification, customer auth, or driver auth is approved here.';

comment on column public.monthly_invoice_issue_reviews.source_draft_summary is
  'Safe invoice draft snapshot summary only. Do not store prices, payouts, payment details, final invoice numbers, PDF links, notification payloads, auth tokens, parser/debug internals, proof/photo data, or internal finance notes.';

comment on column public.monthly_invoice_issue_reviews.safe_issue_context is
  'Safe admin issue-readiness context only. This does not issue invoice numbers, generate PDFs, create payment links, send notifications, post customer charges, or expose customer/driver auth.';

alter table public.monthly_invoice_issue_reviews
  add column if not exists draft_id uuid,
  add column if not exists customer_account text,
  add column if not exists billing_month text,
  add column if not exists draft_status_snapshot text not null default 'pending_admin_review',
  add column if not exists issue_review_status text not null default 'issue_review_pending',
  add column if not exists readiness_status text not null default 'mixed',
  add column if not exists ready_count integer not null default 0,
  add column if not exists blocked_count integer not null default 0,
  add column if not exists total_count integer not null default 0,
  add column if not exists source_draft_summary jsonb not null default '{}'::jsonb,
  add column if not exists safe_issue_note text,
  add column if not exists safe_issue_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists monthly_invoice_issue_reviews_draft_key
  on public.monthly_invoice_issue_reviews (draft_id);

create index if not exists monthly_invoice_issue_reviews_account_month_idx
  on public.monthly_invoice_issue_reviews (customer_account, billing_month);

create index if not exists monthly_invoice_issue_reviews_billing_month_idx
  on public.monthly_invoice_issue_reviews (billing_month);

create index if not exists monthly_invoice_issue_reviews_issue_status_idx
  on public.monthly_invoice_issue_reviews (issue_review_status);

create index if not exists monthly_invoice_issue_reviews_readiness_status_idx
  on public.monthly_invoice_issue_reviews (readiness_status);

create index if not exists monthly_invoice_issue_reviews_updated_at_idx
  on public.monthly_invoice_issue_reviews (updated_at);

alter table public.monthly_invoice_issue_reviews enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before runtime production writes.
