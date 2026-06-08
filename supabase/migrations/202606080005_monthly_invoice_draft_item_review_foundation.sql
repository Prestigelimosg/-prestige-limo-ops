-- Monthly invoice draft item review foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares admin/dispatcher per-trip invoice draft item review records only.
-- No final invoice number, PDF generation, payment, payout, notification sending,
-- customer auth, driver auth, live-location, proof/photo, parser-learning,
-- payment gateway, bank integration, or finance settlement data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.monthly_invoice_draft_item_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.monthly_invoice_drafts(id) on delete cascade,
  draft_trip_link_id uuid references public.monthly_invoice_draft_trip_links(id) on delete set null,
  booking_reference text not null,
  item_review_status text not null default 'pending_review',
  trip_detail_review_status text not null default 'pending_review',
  extra_charge_review_status text not null default 'pending_review',
  billing_item_decision text not null default 'hold_for_review',
  source_trip_summary jsonb not null default '{}'::jsonb,
  safe_item_review_note text,
  safe_item_review_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoice_draft_item_reviews_reference_not_blank check (
    length(btrim(booking_reference)) > 0
  ),
  constraint monthly_invoice_draft_item_reviews_status_check check (
    item_review_status in (
      'pending_review',
      'reviewed',
      'needs_correction',
      'blocked',
      'archived'
    )
  ),
  constraint monthly_invoice_draft_item_reviews_trip_detail_status_check check (
    trip_detail_review_status in (
      'pending_review',
      'reviewed',
      'needs_correction',
      'blocked'
    )
  ),
  constraint monthly_invoice_draft_item_reviews_extra_charge_status_check check (
    extra_charge_review_status in (
      'pending_review',
      'reviewed',
      'none',
      'needs_correction',
      'blocked'
    )
  ),
  constraint monthly_invoice_draft_item_reviews_decision_check check (
    billing_item_decision in (
      'hold_for_review',
      'include_in_draft',
      'exclude_from_draft',
      'needs_manager_review',
      'blocked'
    )
  ),
  constraint monthly_invoice_draft_item_reviews_source_summary_object check (
    jsonb_typeof(source_trip_summary) = 'object'
  ),
  constraint monthly_invoice_draft_item_reviews_safe_context_object check (
    jsonb_typeof(safe_item_review_context) = 'object'
  ),
  constraint monthly_invoice_draft_item_reviews_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint monthly_invoice_draft_item_reviews_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint monthly_invoice_draft_item_reviews_safe_note_length check (
    safe_item_review_note is null or length(safe_item_review_note) <= 1000
  )
);

comment on table public.monthly_invoice_draft_item_reviews is
  'Admin-only monthly invoice draft item review foundation. This stores per-trip review state only; it does not issue invoice numbers, generate PDFs, process payments, create payouts, send notifications, or expose customer/driver auth.';

comment on column public.monthly_invoice_draft_item_reviews.source_trip_summary is
  'Safe draft trip summary copied from saved invoice draft trip links. Do not store prices, payouts, payment details, invoice numbers, PDF links, notification payloads, auth tokens, parser/debug internals, proof/photo data, customer contact data, driver token/link details, or internal finance notes.';

comment on column public.monthly_invoice_draft_item_reviews.safe_item_review_context is
  'Safe admin invoice draft item review context only. This does not issue invoice numbers, generate PDFs, create payment links, send notifications, post customer charges, or expose customer/driver auth.';

alter table public.monthly_invoice_draft_item_reviews
  add column if not exists draft_id uuid,
  add column if not exists draft_trip_link_id uuid,
  add column if not exists booking_reference text,
  add column if not exists item_review_status text not null default 'pending_review',
  add column if not exists trip_detail_review_status text not null default 'pending_review',
  add column if not exists extra_charge_review_status text not null default 'pending_review',
  add column if not exists billing_item_decision text not null default 'hold_for_review',
  add column if not exists source_trip_summary jsonb not null default '{}'::jsonb,
  add column if not exists safe_item_review_note text,
  add column if not exists safe_item_review_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists monthly_invoice_draft_item_reviews_draft_booking_key
  on public.monthly_invoice_draft_item_reviews (draft_id, booking_reference);

create index if not exists monthly_invoice_draft_item_reviews_draft_id_idx
  on public.monthly_invoice_draft_item_reviews (draft_id);

create index if not exists monthly_invoice_draft_item_reviews_trip_link_idx
  on public.monthly_invoice_draft_item_reviews (draft_trip_link_id);

create index if not exists monthly_invoice_draft_item_reviews_booking_reference_idx
  on public.monthly_invoice_draft_item_reviews (booking_reference);

create index if not exists monthly_invoice_draft_item_reviews_status_idx
  on public.monthly_invoice_draft_item_reviews (item_review_status);

create index if not exists monthly_invoice_draft_item_reviews_updated_at_idx
  on public.monthly_invoice_draft_item_reviews (updated_at);

alter table public.monthly_invoice_draft_item_reviews enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before runtime production writes.
