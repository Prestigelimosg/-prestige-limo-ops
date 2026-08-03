-- Verified traveller invoice separation and prefix ownership.
-- Extends the existing customer invoice sequence and stored invoice lanes in place.
-- It does not create invoices, send email, activate Stripe, create payment links,
-- record payments, create payouts, or expose customer/driver finance data.

set search_path = public, extensions;

alter table public.customer_invoice_sequences
  add column if not exists booker_id bigint references public.bookers(id) on delete set null,
  add column if not exists traveler_id bigint references public.travelers(id) on delete set null;

alter table public.customer_invoice_records
  add column if not exists traveler_id bigint references public.travelers(id) on delete set null;

drop index if exists public.customer_invoice_sequences_account_key;

create unique index if not exists customer_invoice_sequences_legacy_account_key
  on public.customer_invoice_sequences (customer_account)
  where traveler_id is null;

create unique index if not exists customer_invoice_sequences_traveler_key
  on public.customer_invoice_sequences (traveler_id)
  where traveler_id is not null;

create index if not exists customer_invoice_sequences_booker_traveler_idx
  on public.customer_invoice_sequences (booker_id, traveler_id)
  where traveler_id is not null;

create index if not exists customer_invoice_records_booker_traveler_created_idx
  on public.customer_invoice_records (booker_id, traveler_id, created_at desc)
  where booker_id is not null and traveler_id is not null;

alter table public.customer_invoice_sequences
  drop constraint if exists customer_invoice_sequences_verified_traveler_scope_check,
  add constraint customer_invoice_sequences_verified_traveler_scope_check check (
    (traveler_id is null and booker_id is null) or
    (traveler_id is not null and booker_id is not null)
  );

alter table public.customer_invoice_records
  drop constraint if exists customer_invoice_records_invoice_number_check,
  add constraint customer_invoice_records_invoice_number_check check (
    invoice_number ~ '^((INV|QUO|CN)-[0-9]{8}-[0-9]{4}|[A-Z0-9]{2,12}-[0-9]{4,})$'
  ),
  drop constraint if exists customer_invoice_records_credit_note_original_check,
  add constraint customer_invoice_records_credit_note_original_check check (
    (
      document_type = 'credit_note'
      and original_invoice_number is not null
      and original_invoice_number ~ '^(INV-[0-9]{8}-[0-9]{4}|[A-Z0-9]{2,12}-[0-9]{4,})$'
    )
    or
    (
      document_type <> 'credit_note'
      and original_invoice_number is null
    )
  );

comment on column public.customer_invoice_sequences.traveler_id is
  'Verified traveller ownership for one locked lifetime invoice prefix. Null only for the preserved legacy account sequence.';

comment on column public.customer_invoice_sequences.booker_id is
  'Verified PA/booker that owns the traveller sequence. Names and email addresses are never identity evidence.';

comment on column public.customer_invoice_records.traveler_id is
  'Verified traveller billed by this invoice. The recipient email may belong to the shared PA/booker.';

create or replace function public.reserve_customer_invoice_number(
  p_customer_account text,
  p_booker_id bigint,
  p_traveler_id bigint,
  p_actor_role text default 'admin',
  p_actor_label text default null
)
returns table (
  invoice_number text,
  invoice_prefix text,
  invoice_sequence_number integer
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_customer_account text := btrim(coalesce(p_customer_account, ''));
  v_sequence public.customer_invoice_sequences%rowtype;
  v_sequence_number integer;
  v_invoice_number text;
begin
  if v_customer_account = '' or p_booker_id is null or p_booker_id <= 0 or p_traveler_id is null or p_traveler_id <= 0 then
    raise exception 'verified_traveler_invoice_identity_required';
  end if;

  if not exists (
    select 1
      from public.travelers as traveler
     where traveler.id = p_traveler_id
       and traveler.booker_id = p_booker_id
  ) then
    raise exception 'verified_traveler_invoice_identity_mismatch';
  end if;

  select sequence.*
    into v_sequence
    from public.customer_invoice_sequences as sequence
   where sequence.customer_account = v_customer_account
     and sequence.booker_id = p_booker_id
     and sequence.traveler_id = p_traveler_id
   for update;

  if not found then
    raise exception 'traveler_invoice_prefix_required';
  end if;

  if v_sequence.sequence_status <> 'active' then
    raise exception 'traveler_invoice_sequence_not_active';
  end if;

  if v_sequence.invoice_prefix !~ '^[A-Z0-9]{2,12}$' or v_sequence.invoice_prefix in ('INV', 'QUO', 'CN') then
    raise exception 'traveler_invoice_prefix_malformed';
  end if;

  v_sequence_number := v_sequence.next_sequence_number;
  v_invoice_number := v_sequence.invoice_prefix || '-' || lpad(v_sequence_number::text, 4, '0');

  update public.customer_invoice_sequences as sequence
     set next_sequence_number = v_sequence_number + 1,
         last_reserved_sequence_number = v_sequence_number,
         last_reserved_invoice_number = v_invoice_number,
         last_reserved_at = now(),
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else sequence.actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where sequence.id = v_sequence.id;

  return query
  select
    v_invoice_number::text,
    v_sequence.invoice_prefix::text,
    v_sequence_number::integer;
end;
$$;

revoke all on function public.reserve_customer_invoice_number(text, bigint, bigint, text, text)
  from public, anon, authenticated;
grant execute on function public.reserve_customer_invoice_number(text, bigint, bigint, text, text)
  to service_role;

comment on function public.reserve_customer_invoice_number(text, bigint, bigint, text, text) is
  'Server-only reservation for one verified traveller invoice sequence. It does not create an invoice, PDF, email, payment link, payment, payout, or notification.';

-- The existing monthly account-level lane must not combine traveller-owned
-- sequences. Its established function is replaced only to match the new
-- partial legacy index and to fail closed when traveller prefixes exist.
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
  v_requested_invoice_prefix text := upper(btrim(coalesce(p_invoice_prefix, '')));
  v_invoice_prefix text;
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

  if v_requested_invoice_prefix !~ '^[A-Z0-9]{2,12}$' then
    raise exception 'invoice_prefix_malformed';
  end if;

  if exists (
    select 1
      from public.customer_invoice_sequences as traveler_sequence
     where traveler_sequence.customer_account = v_customer_account
       and traveler_sequence.traveler_id is not null
  ) then
    raise exception 'traveler_invoice_sequence_required';
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
    v_requested_invoice_prefix,
    1,
    p_safe_sequence_note,
    case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else 'system' end,
    p_actor_label,
    'admin_api'
  )
  on conflict (customer_account) where traveler_id is null do nothing;

  select sequence.*
    into v_sequence
    from public.customer_invoice_sequences as sequence
   where sequence.customer_account = v_customer_account
     and sequence.traveler_id is null
   for update;

  if not found then
    raise exception 'invoice_sequence_missing';
  end if;

  if v_sequence.sequence_status <> 'active' then
    raise exception 'invoice_sequence_not_active';
  end if;

  v_invoice_prefix := v_sequence.invoice_prefix;

  if v_invoice_prefix !~ '^[A-Z0-9]{2,12}$' then
    raise exception 'invoice_prefix_malformed';
  end if;

  v_sequence_number := v_sequence.next_sequence_number;
  v_invoice_number := v_invoice_prefix || '-' || lpad(v_sequence_number::text, 4, '0');

  update public.monthly_invoice_issue_records as issue_record
     set invoice_number = v_invoice_number,
         invoice_prefix = v_invoice_prefix,
         invoice_sequence_number = v_sequence_number,
         invoice_number_status = 'reserved',
         issue_record_status = 'invoice_number_reserved',
         invoice_number_reserved_at = now(),
         safe_issue_record_context = coalesce(issue_record.safe_issue_record_context, '{}'::jsonb) ||
           jsonb_build_object(
             'invoice_number_status', 'Invoice number reserved by approved sequence API.',
             'next_action', 'Review invoice issue readiness before any PDF, payment, or send step.'
           ),
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else issue_record.actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where issue_record.id = p_issue_record_id
     and issue_record.customer_account = v_customer_account
     and issue_record.billing_month = v_billing_month
     and issue_record.draft_lock_status = 'locked_for_issue'
     and issue_record.invoice_number is null
     and issue_record.invoice_number_status in ('not_reserved', 'ready_to_reserve');

  if not found then
    raise exception 'issue_record_not_reservable';
  end if;

  update public.customer_invoice_sequences as sequence
     set next_sequence_number = v_sequence_number + 1,
         last_reserved_sequence_number = v_sequence_number,
         last_reserved_invoice_number = v_invoice_number,
         last_reserved_at = now(),
         safe_sequence_note = p_safe_sequence_note,
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else sequence.actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where sequence.id = v_sequence.id;

  return query
  select
    p_issue_record_id::uuid,
    v_invoice_number::text,
    v_invoice_prefix::text,
    v_sequence_number::integer,
    'reserved'::text;
end;
$$;
