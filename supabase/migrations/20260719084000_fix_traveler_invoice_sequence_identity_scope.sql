-- Repair the existing verified-traveller invoice reservation lane in place.
-- A customer display label is document metadata, not identity evidence. Prefix
-- ownership is resolved only from the already-verified PA/booker + traveller pair.

set search_path = public, extensions;

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
   where sequence.booker_id = p_booker_id
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
  'Server-only reservation for one verified PA/booker + traveller sequence. Customer display labels are document metadata and never identity evidence. It does not create an invoice, PDF, email, payment link, payment, payout, or notification.';
