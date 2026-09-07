-- Owner-approved on 2026-09-07: atomic issued-booking coverage in the existing invoice table.
-- Preserves the existing invoice table, writer, numbering, PDF and financial fields.
begin;
set local lock_timeout = '5s';
create or replace function public.enforce_customer_invoice_issued_booking_coverage()
returns trigger
language plpgsql
volatile
security invoker
set search_path = pg_catalog, public
as $$
declare
  requested_references text[];
  booking_aliases text[];
  previous_references text[];
begin
  -- Only the newly enabled account invoice path uses standard numbering.
  -- Registered Traveller and legacy Hotel issuance keep their existing reservation contract.
  if new.traveler_id is not null or new.booker_id is null then
    return new;
  end if;

  if coalesce(new.document_type, 'invoice') <> 'invoice'
     or coalesce(new.document_state, 'issued') <> 'issued' then
    return new;
  end if;

  select array_agg(distinct candidate order by candidate)
  into requested_references
  from (
    select nullif(btrim(new.reference), '') as candidate
    union all
    select nullif(btrim(item->>'bookingReference'), '')
    from jsonb_array_elements(case when jsonb_typeof(new.line_items) = 'array' then new.line_items else '[]'::jsonb end) as item
  ) requested
  where candidate is not null;

  -- Keep ordinary edits to an existing issued invoice working even if an old
  -- booking has since been deleted. Only changed coverage needs revalidation.
  if tg_op = 'UPDATE' and old.customer_id = new.customer_id
     and old.traveler_id is null and old.booker_id is not null
     and coalesce(old.document_type, 'invoice') = 'invoice'
     and coalesce(old.document_state, 'issued') = 'issued' then
    select array_agg(distinct candidate order by candidate)
    into previous_references
    from (
      select nullif(btrim(old.reference), '') as candidate
      union all
      select nullif(btrim(item->>'bookingReference'), '')
      from jsonb_array_elements(case when jsonb_typeof(old.line_items) = 'array' then old.line_items else '[]'::jsonb end) item
    ) previous
    where candidate is not null;
    if previous_references is not distinct from requested_references then
      return new;
    end if;
  end if;

  -- A waiting transaction must re-read coverage after the previous issuer commits.
  -- Reject a stale fixed snapshot instead of relying on process-local locks.
  if current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception using errcode = '40001', message = 'Invoice booking coverage requires a fresh transaction snapshot.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('customer_invoice_records:issued:' || new.customer_id, 0));

  -- Only exact saved booking/public references establish coverage, never display text.
  select array_agg(distinct alias.reference)
  into booking_aliases
  from public.bookings booking
  cross join lateral (values (booking.booking_reference), (booking.public_booking_reference::text)) alias(reference)
  where booking.customer_id::text = new.customer_id
    and (booking.booking_reference = any(requested_references)
      or booking.public_booking_reference::text = any(requested_references))
    and nullif(alias.reference, '') is not null;

  if coalesce(cardinality(booking_aliases), 0) = 0 then
    raise exception using errcode = '23514', message = 'Invoice booking coverage could not be verified.';
  end if;

  if exists (
    select 1 from public.customer_invoice_records existing
    where existing.id is distinct from new.id
      and existing.customer_id = new.customer_id
      and coalesce(existing.document_type, 'invoice') = 'invoice'
      and coalesce(existing.document_state, 'issued') = 'issued'
      and (existing.reference = any(booking_aliases) or exists (
        select 1 from jsonb_array_elements(case when jsonb_typeof(existing.line_items) = 'array' then existing.line_items else '[]'::jsonb end) item
        where item->>'bookingReference' = any(booking_aliases)
      ))
  ) then
    raise exception using errcode = '23505',
      constraint = 'customer_invoice_records_issued_booking_coverage',
      message = 'Invoice already contains one or more selected jobs.';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_customer_invoice_issued_booking_coverage() from public;
create trigger customer_invoice_records_issued_booking_coverage
before insert or update of customer_id, booker_id, traveler_id, reference, line_items, document_type, document_state
on public.customer_invoice_records
for each row execute function public.enforce_customer_invoice_issued_booking_coverage();
commit;

-- Rollback (no invoice data deletion):
-- begin;
-- drop trigger customer_invoice_records_issued_booking_coverage on public.customer_invoice_records;
-- drop function public.enforce_customer_invoice_issued_booking_coverage();
-- commit;
