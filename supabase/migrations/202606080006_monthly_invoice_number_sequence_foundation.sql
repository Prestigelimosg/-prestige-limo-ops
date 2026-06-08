-- Monthly invoice number sequence foundation.
-- Created for review only; do not apply without explicit approval.
-- This migration prepares transaction-safe, per-account invoice number
-- reservation only. It does not generate PDFs, send invoices, process
-- payments, create payouts, call payment gateways, send notifications,
-- activate customer auth, activate driver auth, or expose public policies.

create extension if not exists pgcrypto with schema extensions;

set search_path = public, extensions;

create table if not exists public.customer_invoice_sequences (
  id uuid primary key default gen_random_uuid(),
  customer_account text not null,
  invoice_prefix text not null,
  next_sequence_number integer not null default 1,
  last_reserved_sequence_number integer,
  last_reserved_invoice_number text,
  last_reserved_at timestamptz,
  sequence_status text not null default 'active',
  safe_sequence_note text,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_invoice_sequences_customer_account_not_blank check (
    length(btrim(customer_account)) > 0
  ),
  constraint customer_invoice_sequences_prefix_format check (
    invoice_prefix ~ '^[A-Z0-9]{2,12}$'
  ),
  constraint customer_invoice_sequences_next_positive check (
    next_sequence_number > 0
  ),
  constraint customer_invoice_sequences_last_sequence_positive check (
    last_reserved_sequence_number is null or last_reserved_sequence_number > 0
  ),
  constraint customer_invoice_sequences_last_number_format check (
    last_reserved_invoice_number is null or
    last_reserved_invoice_number ~ '^[A-Z0-9]{2,12}-[0-9]{4,}$'
  ),
  constraint customer_invoice_sequences_status_check check (
    sequence_status in ('active', 'on_hold', 'archived')
  ),
  constraint customer_invoice_sequences_source_surface_check check (
    source_surface in ('admin_api', 'migration', 'system')
  ),
  constraint customer_invoice_sequences_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint customer_invoice_sequences_safe_note_length check (
    safe_sequence_note is null or length(safe_sequence_note) <= 1000
  )
);

comment on table public.customer_invoice_sequences is
  'Admin-only per-account invoice sequence foundation. Each customer/account has one fixed prefix and its own running number. This does not create PDFs, send invoices, process payments, create payouts, or notify customers/drivers.';

comment on column public.customer_invoice_sequences.invoice_prefix is
  'Fixed invoice prefix for this customer/account. Prefix changes must be handled only by a later approved audit-controlled workflow.';

comment on column public.customer_invoice_sequences.next_sequence_number is
  'Next sequence number to reserve under this customer/account prefix. Allocation is performed only by the approved server RPC.';

alter table public.customer_invoice_sequences
  add column if not exists customer_account text,
  add column if not exists invoice_prefix text,
  add column if not exists next_sequence_number integer not null default 1,
  add column if not exists last_reserved_sequence_number integer,
  add column if not exists last_reserved_invoice_number text,
  add column if not exists last_reserved_at timestamptz,
  add column if not exists sequence_status text not null default 'active',
  add column if not exists safe_sequence_note text,
  add column if not exists source_surface text not null default 'admin_api',
  add column if not exists actor_role text not null default 'admin',
  add column if not exists actor_label text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.monthly_invoice_issue_records
  add column if not exists invoice_prefix text,
  add column if not exists invoice_sequence_number integer,
  add column if not exists invoice_number_reserved_at timestamptz;

comment on column public.monthly_invoice_issue_records.invoice_prefix is
  'Per-account invoice prefix reserved by the approved server sequence RPC only.';

comment on column public.monthly_invoice_issue_records.invoice_sequence_number is
  'Per-account running sequence number reserved by the approved server sequence RPC only.';

comment on column public.monthly_invoice_issue_records.invoice_number_reserved_at is
  'Timestamp for server-side invoice number reservation. This does not send, PDF, payment, payout, or notify.';

create unique index if not exists customer_invoice_sequences_account_key
  on public.customer_invoice_sequences (customer_account);

create unique index if not exists customer_invoice_sequences_prefix_key
  on public.customer_invoice_sequences (invoice_prefix);

create index if not exists customer_invoice_sequences_status_idx
  on public.customer_invoice_sequences (sequence_status);

create index if not exists customer_invoice_sequences_updated_at_idx
  on public.customer_invoice_sequences (updated_at);

create unique index if not exists monthly_invoice_issue_records_prefix_sequence_key
  on public.monthly_invoice_issue_records (invoice_prefix, invoice_sequence_number)
  where invoice_prefix is not null and invoice_sequence_number is not null;

alter table public.customer_invoice_sequences enable row level security;

-- RLS is intentionally enabled without public, customer, driver, anonymous, or
-- broad authenticated policies. The server-only admin/dispatcher API uses the
-- service role and existing boundary checks; no client policy is approved here.

create or replace function public.reserve_monthly_invoice_number_for_issue_record(
  p_issue_record_id uuid,
  p_customer_account text,
  p_billing_month text,
  p_invoice_prefix text,
  p_actor_role text default 'admin',
  p_actor_label text default null,
  p_safe_sequence_note text default null
)
returns table (
  issue_record_id uuid,
  invoice_number text,
  invoice_prefix text,
  invoice_sequence_number integer,
  invoice_number_status text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_customer_account text := btrim(coalesce(p_customer_account, ''));
  v_invoice_prefix text := upper(btrim(coalesce(p_invoice_prefix, '')));
  v_billing_month text := btrim(coalesce(p_billing_month, ''));
  v_sequence public.customer_invoice_sequences%rowtype;
  v_sequence_number integer;
  v_invoice_number text;
begin
  if v_customer_account = '' then
    raise exception 'customer_account_required';
  end if;

  if v_billing_month !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
    raise exception 'billing_month_malformed';
  end if;

  if v_invoice_prefix !~ '^[A-Z0-9]{2,12}$' then
    raise exception 'invoice_prefix_malformed';
  end if;

  insert into public.customer_invoice_sequences (
    customer_account,
    invoice_prefix,
    next_sequence_number,
    safe_sequence_note,
    actor_role,
    actor_label,
    source_surface
  )
  values (
    v_customer_account,
    v_invoice_prefix,
    1,
    p_safe_sequence_note,
    case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else 'system' end,
    p_actor_label,
    'admin_api'
  )
  on conflict (customer_account) do nothing;

  select *
    into v_sequence
    from public.customer_invoice_sequences
   where customer_account = v_customer_account
   for update;

  if not found then
    raise exception 'invoice_sequence_missing';
  end if;

  if v_sequence.sequence_status <> 'active' then
    raise exception 'invoice_sequence_not_active';
  end if;

  if v_sequence.invoice_prefix <> v_invoice_prefix then
    raise exception 'invoice_prefix_mismatch';
  end if;

  v_sequence_number := v_sequence.next_sequence_number;
  v_invoice_number := v_invoice_prefix || '-' || lpad(v_sequence_number::text, 4, '0');

  update public.monthly_invoice_issue_records
     set invoice_number = v_invoice_number,
         invoice_prefix = v_invoice_prefix,
         invoice_sequence_number = v_sequence_number,
         invoice_number_status = 'reserved',
         issue_record_status = 'invoice_number_reserved',
         invoice_number_reserved_at = now(),
         safe_issue_record_context = coalesce(safe_issue_record_context, '{}'::jsonb) ||
           jsonb_build_object(
             'invoice_number_status', 'Invoice number reserved by approved sequence API.',
             'next_action', 'Review invoice issue readiness before any PDF, payment, or send step.'
           ),
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where id = p_issue_record_id
     and customer_account = v_customer_account
     and billing_month = v_billing_month
     and draft_lock_status = 'locked_for_issue'
     and invoice_number is null
     and invoice_number_status in ('not_reserved', 'ready_to_reserve');

  if not found then
    raise exception 'issue_record_not_reservable';
  end if;

  update public.customer_invoice_sequences
     set next_sequence_number = v_sequence_number + 1,
         last_reserved_sequence_number = v_sequence_number,
         last_reserved_invoice_number = v_invoice_number,
         last_reserved_at = now(),
         safe_sequence_note = p_safe_sequence_note,
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where id = v_sequence.id;

  return query
  select
    p_issue_record_id,
    v_invoice_number,
    v_invoice_prefix,
    v_sequence_number,
    'reserved'::text;
end;
$$;

comment on function public.reserve_monthly_invoice_number_for_issue_record(
  uuid,
  text,
  text,
  text,
  text,
  text,
  text
) is
  'Server-only admin/dispatcher function to reserve one per-account invoice number for one locked issue record. It does not generate PDFs, send invoices, process payments, create payouts, or notify customers/drivers.';
