-- Monthly invoice billable item price review foundation.
-- Created for review only in this stage; do not apply without explicit approval.
-- This migration prepares admin/dispatcher reviewed billable item pricing before
-- any invoice is sent to a customer. It covers fixed-trip bookings such as
-- MNG/arrival, DEP/departure, TRF/transfer, plus DSP/hourly jobs that use
-- reviewed actual-time evidence.
-- No invoice sending, PDF generation, payment processing, payout creation,
-- notification sending, customer auth, driver auth, live-location, proof/photo,
-- parser-learning, or external finance export is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.monthly_invoice_billable_item_price_reviews (
  id uuid primary key default gen_random_uuid(),
  draft_id uuid not null references public.monthly_invoice_drafts(id) on delete cascade,
  draft_trip_link_id uuid references public.monthly_invoice_draft_trip_links(id) on delete set null,
  item_review_id uuid not null references public.monthly_invoice_draft_item_reviews(id) on delete cascade,
  booking_reference text not null,
  booking_type text not null,
  billing_item_type text not null default 'base_trip',
  calculation_basis text not null,
  price_review_status text not null default 'pending_review',
  price_decision text not null default 'hold_for_review',
  reviewed_customer_amount_cents integer,
  currency text not null default 'SGD',
  dsp_total_minutes integer,
  dsp_billable_minutes integer,
  source_price_context jsonb not null default '{}'::jsonb,
  safe_price_review_note text,
  safe_price_review_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoice_billable_item_price_reviews_reference_not_blank check (
    length(btrim(booking_reference)) > 0
  ),
  constraint monthly_invoice_billable_item_price_reviews_booking_type_check check (
    booking_type in (
      'MNG',
      'DEP',
      'TRF',
      'DSP',
      'arrival',
      'departure',
      'transfer',
      'hourly',
      'seaport_transfer'
    )
  ),
  constraint monthly_invoice_billable_item_price_reviews_item_type_check check (
    billing_item_type in ('base_trip', 'extra_charge', 'adjustment', 'waiver')
  ),
  constraint monthly_invoice_billable_item_price_reviews_calculation_basis_check check (
    calculation_basis in ('fixed_trip', 'dsp_actual_time', 'manual_review', 'extra_charge', 'waived')
  ),
  constraint monthly_invoice_billable_item_price_reviews_status_check check (
    price_review_status in (
      'pending_review',
      'reviewed',
      'needs_correction',
      'blocked',
      'approved_for_invoice_draft'
    )
  ),
  constraint monthly_invoice_billable_item_price_reviews_decision_check check (
    price_decision in (
      'hold_for_review',
      'include_in_invoice',
      'exclude_from_invoice',
      'needs_manager_review',
      'waived',
      'blocked'
    )
  ),
  constraint monthly_invoice_billable_item_price_reviews_amount_check check (
    reviewed_customer_amount_cents is null or reviewed_customer_amount_cents >= 0
  ),
  constraint monthly_invoice_billable_item_price_reviews_currency_check check (
    currency ~ '^[A-Z]{3}$'
  ),
  constraint monthly_invoice_billable_item_price_reviews_dsp_minutes_check check (
    (
      dsp_total_minutes is null
      and dsp_billable_minutes is null
    )
    or (
      dsp_total_minutes is not null
      and dsp_total_minutes >= 0
      and (
        dsp_billable_minutes is null
        or (
          dsp_billable_minutes >= 0
          and dsp_billable_minutes <= dsp_total_minutes
        )
      )
    )
  ),
  constraint monthly_invoice_billable_item_price_reviews_dsp_basis_check check (
    calculation_basis <> 'dsp_actual_time'
    or booking_type in ('DSP', 'hourly')
  ),
  constraint monthly_invoice_billable_item_price_reviews_include_requires_amount check (
    price_decision <> 'include_in_invoice'
    or reviewed_customer_amount_cents is not null
  ),
  constraint monthly_invoice_billable_item_price_reviews_approved_requires_include check (
    price_review_status <> 'approved_for_invoice_draft'
    or price_decision = 'include_in_invoice'
  ),
  constraint monthly_invoice_billable_item_price_reviews_source_context_object check (
    jsonb_typeof(source_price_context) = 'object'
  ),
  constraint monthly_invoice_billable_item_price_reviews_safe_context_object check (
    jsonb_typeof(safe_price_review_context) = 'object'
  ),
  constraint monthly_invoice_billable_item_price_reviews_note_length check (
    safe_price_review_note is null or length(safe_price_review_note) <= 1000
  ),
  constraint monthly_invoice_billable_item_price_reviews_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint monthly_invoice_billable_item_price_reviews_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  )
);

comment on table public.monthly_invoice_billable_item_price_reviews is
  'Admin-only billable item price review before customer invoice sending. Supports MNG/arrival, DEP/departure, TRF/transfer, and DSP/hourly actual-time review. This does not send invoices, generate PDFs, process payments, or create payouts.';

comment on column public.monthly_invoice_billable_item_price_reviews.reviewed_customer_amount_cents is
  'Admin-reviewed customer amount in minor currency units for invoice draft review only. Not a payment, not an issued invoice, and not visible to drivers.';

comment on column public.monthly_invoice_billable_item_price_reviews.calculation_basis is
  'Review basis for the billable item: fixed trip, DSP actual time, manual review, extra charge, or waived.';

comment on column public.monthly_invoice_billable_item_price_reviews.source_price_context is
  'Safe admin source context for price review only. Do not store payment details, payout details, PayNow details, final invoice links, PDF links, notification payloads, auth tokens, parser/debug internals, proof/photo data, live-location data, driver token/link details, or internal finance notes.';

alter table public.monthly_invoice_billable_item_price_reviews
  add column if not exists draft_id uuid references public.monthly_invoice_drafts(id) on delete cascade,
  add column if not exists draft_trip_link_id uuid references public.monthly_invoice_draft_trip_links(id) on delete set null,
  add column if not exists item_review_id uuid references public.monthly_invoice_draft_item_reviews(id) on delete cascade,
  add column if not exists booking_reference text,
  add column if not exists booking_type text,
  add column if not exists billing_item_type text not null default 'base_trip',
  add column if not exists calculation_basis text,
  add column if not exists price_review_status text not null default 'pending_review',
  add column if not exists price_decision text not null default 'hold_for_review',
  add column if not exists reviewed_customer_amount_cents integer,
  add column if not exists currency text not null default 'SGD',
  add column if not exists dsp_total_minutes integer,
  add column if not exists dsp_billable_minutes integer,
  add column if not exists source_price_context jsonb not null default '{}'::jsonb,
  add column if not exists safe_price_review_note text,
  add column if not exists safe_price_review_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists monthly_invoice_billable_item_price_reviews_item_type_key
  on public.monthly_invoice_billable_item_price_reviews (item_review_id, billing_item_type);

create index if not exists monthly_invoice_billable_item_price_reviews_draft_idx
  on public.monthly_invoice_billable_item_price_reviews (draft_id);

create index if not exists monthly_invoice_billable_item_price_reviews_trip_link_idx
  on public.monthly_invoice_billable_item_price_reviews (draft_trip_link_id);

create index if not exists monthly_invoice_billable_item_price_reviews_booking_reference_idx
  on public.monthly_invoice_billable_item_price_reviews (booking_reference);

create index if not exists monthly_invoice_billable_item_price_reviews_booking_type_idx
  on public.monthly_invoice_billable_item_price_reviews (booking_type);

create index if not exists monthly_invoice_billable_item_price_reviews_status_idx
  on public.monthly_invoice_billable_item_price_reviews (price_review_status);

create index if not exists monthly_invoice_billable_item_price_reviews_decision_idx
  on public.monthly_invoice_billable_item_price_reviews (price_decision);

create index if not exists monthly_invoice_billable_item_price_reviews_updated_at_idx
  on public.monthly_invoice_billable_item_price_reviews (updated_at);

alter table public.monthly_invoice_billable_item_price_reviews enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved API/RLS stage may expose only
-- guarded admin/dispatcher reads and writes; customer/driver access is not
-- approved here.
