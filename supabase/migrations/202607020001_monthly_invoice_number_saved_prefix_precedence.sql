-- Monthly invoice number saved-prefix precedence.
-- Approved customer/account prefix rows win over the browser fallback prefix.
-- If no prefix row exists yet, the approved server RPC creates one from the
-- provided auto-generated fallback and starts the running number at -0001.
-- This does not create invoice records, generate PDFs, send invoices, process
-- payments, create payouts, notify users, or activate customer/driver auth.

set search_path = public, extensions;

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
  on conflict (customer_account) do nothing;

  select cis.*
    into v_sequence
    from public.customer_invoice_sequences as cis
   where cis.customer_account = v_customer_account
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

  update public.monthly_invoice_issue_records as mir
     set invoice_number = v_invoice_number,
         invoice_prefix = v_invoice_prefix,
         invoice_sequence_number = v_sequence_number,
         invoice_number_status = 'reserved',
         issue_record_status = 'invoice_number_reserved',
         invoice_number_reserved_at = now(),
         safe_issue_record_context = coalesce(mir.safe_issue_record_context, '{}'::jsonb) ||
           jsonb_build_object(
             'invoice_number_status', 'Invoice number reserved by approved sequence API.',
             'next_action', 'Review invoice issue readiness before any PDF, payment, or send step.'
           ),
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else mir.actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where mir.id = p_issue_record_id
     and mir.customer_account = v_customer_account
     and mir.billing_month = v_billing_month
     and mir.draft_lock_status = 'locked_for_issue'
     and mir.invoice_number is null
     and mir.invoice_number_status in ('not_reserved', 'ready_to_reserve');

  if not found then
    raise exception 'issue_record_not_reservable';
  end if;

  update public.customer_invoice_sequences as cis
     set next_sequence_number = v_sequence_number + 1,
         last_reserved_sequence_number = v_sequence_number,
         last_reserved_invoice_number = v_invoice_number,
         last_reserved_at = now(),
         safe_sequence_note = p_safe_sequence_note,
         actor_role = case when p_actor_role in ('admin', 'dispatcher', 'system') then p_actor_role else cis.actor_role end,
         actor_label = p_actor_label,
         source_surface = 'admin_api',
         updated_at = now()
   where cis.id = v_sequence.id;

  return query
  select
    p_issue_record_id::uuid as issue_record_id,
    v_invoice_number::text as invoice_number,
    v_invoice_prefix::text as invoice_prefix,
    v_sequence_number::integer as invoice_sequence_number,
    'reserved'::text as invoice_number_status;
end;
$$;
