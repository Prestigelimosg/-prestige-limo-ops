-- Monthly invoice issue record foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares admin/dispatcher invoice production state records only.
-- No automatic payment, payout, PDF sending, external notification sending,
-- customer auth activation, driver auth activation, live-location, proof/photo,
-- parser-learning, payment gateway, bank integration, or payout data is added.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.monthly_invoice_issue_records (
  id uuid primary key default gen_random_uuid(),
  issue_review_id uuid not null references public.monthly_invoice_issue_reviews(id) on delete restrict,
  draft_id uuid not null references public.monthly_invoice_drafts(id) on delete restrict,
  customer_account text not null,
  billing_month text not null,
  issue_record_status text not null default 'draft_locked',
  draft_lock_status text not null default 'locked_for_issue',
  invoice_number text,
  invoice_number_status text not null default 'not_reserved',
  pdf_generation_status text not null default 'not_requested',
  invoice_delivery_status text not null default 'not_sent',
  payment_record_status text not null default 'not_recorded',
  source_issue_review_summary jsonb not null default '{}'::jsonb,
  safe_issue_record_note text,
  safe_issue_record_context jsonb not null default '{}'::jsonb,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint monthly_invoice_issue_records_customer_account_not_blank check (
    length(btrim(customer_account)) > 0
  ),
  constraint monthly_invoice_issue_records_billing_month_check check (
    billing_month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'
  ),
  constraint monthly_invoice_issue_records_issue_status_check check (
    issue_record_status in (
      'draft_locked',
      'invoice_number_reserved',
      'pdf_generation_ready',
      'pdf_generated_not_sent',
      'sent_manually',
      'unpaid',
      'paid',
      'blocked',
      'voided',
      'archived'
    )
  ),
  constraint monthly_invoice_issue_records_draft_lock_status_check check (
    draft_lock_status in (
      'locked_for_issue',
      'lock_blocked',
      'released_for_review',
      'archived'
    )
  ),
  constraint monthly_invoice_issue_records_invoice_number_status_check check (
    invoice_number_status in (
      'not_reserved',
      'ready_to_reserve',
      'reserved',
      'reservation_blocked',
      'voided'
    )
  ),
  constraint monthly_invoice_issue_records_pdf_generation_status_check check (
    pdf_generation_status in (
      'not_requested',
      'ready_to_generate',
      'generated_not_sent',
      'generation_blocked'
    )
  ),
  constraint monthly_invoice_issue_records_invoice_delivery_status_check check (
    invoice_delivery_status in (
      'not_sent',
      'sent_manually',
      'send_blocked'
    )
  ),
  constraint monthly_invoice_issue_records_payment_record_status_check check (
    payment_record_status in (
      'not_recorded',
      'unpaid',
      'paid',
      'manual_review',
      'voided'
    )
  ),
  constraint monthly_invoice_issue_records_invoice_number_format check (
    invoice_number is null or invoice_number ~ '^[A-Z0-9][A-Z0-9-]{2,63}$'
  ),
  constraint monthly_invoice_issue_records_reserved_number_present check (
    (invoice_number_status = 'reserved' and invoice_number is not null) or
    (invoice_number_status <> 'reserved' and invoice_number is null)
  ),
  constraint monthly_invoice_issue_records_numbered_status_has_number check (
    issue_record_status not in (
      'invoice_number_reserved',
      'pdf_generation_ready',
      'pdf_generated_not_sent',
      'sent_manually',
      'unpaid',
      'paid'
    ) or invoice_number_status = 'reserved'
  ),
  constraint monthly_invoice_issue_records_payment_after_manual_send check (
    payment_record_status not in ('unpaid', 'paid') or
    invoice_delivery_status = 'sent_manually'
  ),
  constraint monthly_invoice_issue_records_source_issue_review_summary_object check (
    jsonb_typeof(source_issue_review_summary) = 'object'
  ),
  constraint monthly_invoice_issue_records_safe_context_object check (
    jsonb_typeof(safe_issue_record_context) = 'object'
  ),
  constraint monthly_invoice_issue_records_source_surface_check check (
    source_surface in ('admin_api', 'admin_dashboard', 'migration', 'system')
  ),
  constraint monthly_invoice_issue_records_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint monthly_invoice_issue_records_safe_note_length check (
    safe_issue_record_note is null or length(safe_issue_record_note) <= 1000
  )
);

comment on table public.monthly_invoice_issue_records is
  'Admin-only monthly invoice issue record foundation. This stores controlled invoice workflow state only; it does not send PDFs, process payments, create payouts, call gateways, send notifications, or expose customer/driver auth.';

comment on column public.monthly_invoice_issue_records.invoice_number is
  'Admin-issued invoice number after approval only. No PDF, payment link, payout, or external delivery payload is stored here.';

comment on column public.monthly_invoice_issue_records.pdf_generation_status is
  'Local PDF generation status only. This does not store a PDF URL, send a PDF, or trigger an external delivery.';

comment on column public.monthly_invoice_issue_records.payment_record_status is
  'Manual payment record status only. This does not process card, external wallet, bank, payout, or gateway actions.';

comment on column public.monthly_invoice_issue_records.safe_issue_record_context is
  'Safe admin invoice issue context only. Do not store contact details, customer prices, payouts, payment links, PDF links, external notification payloads, auth tokens, parser/debug internals, proof/photo data, or internal finance notes.';

alter table public.monthly_invoice_issue_records
  add column if not exists issue_review_id uuid,
  add column if not exists draft_id uuid,
  add column if not exists customer_account text,
  add column if not exists billing_month text,
  add column if not exists issue_record_status text not null default 'draft_locked',
  add column if not exists draft_lock_status text not null default 'locked_for_issue',
  add column if not exists invoice_number text,
  add column if not exists invoice_number_status text not null default 'not_reserved',
  add column if not exists pdf_generation_status text not null default 'not_requested',
  add column if not exists invoice_delivery_status text not null default 'not_sent',
  add column if not exists payment_record_status text not null default 'not_recorded',
  add column if not exists source_issue_review_summary jsonb not null default '{}'::jsonb,
  add column if not exists safe_issue_record_note text,
  add column if not exists safe_issue_record_context jsonb not null default '{}'::jsonb,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists monthly_invoice_issue_records_review_key
  on public.monthly_invoice_issue_records (issue_review_id);

create unique index if not exists monthly_invoice_issue_records_invoice_number_key
  on public.monthly_invoice_issue_records (invoice_number)
  where invoice_number is not null;

create index if not exists monthly_invoice_issue_records_draft_id_idx
  on public.monthly_invoice_issue_records (draft_id);

create index if not exists monthly_invoice_issue_records_account_month_idx
  on public.monthly_invoice_issue_records (customer_account, billing_month);

create index if not exists monthly_invoice_issue_records_billing_month_idx
  on public.monthly_invoice_issue_records (billing_month);

create index if not exists monthly_invoice_issue_records_issue_status_idx
  on public.monthly_invoice_issue_records (issue_record_status);

create index if not exists monthly_invoice_issue_records_payment_status_idx
  on public.monthly_invoice_issue_records (payment_record_status);

create index if not exists monthly_invoice_issue_records_updated_at_idx
  on public.monthly_invoice_issue_records (updated_at);

alter table public.monthly_invoice_issue_records enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. A later approved server API/RLS stage must
-- define the admin/dispatcher access path before runtime production writes.
