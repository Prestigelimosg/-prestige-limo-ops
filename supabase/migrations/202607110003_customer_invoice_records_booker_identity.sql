-- Additive PA identity foundation for customer invoice isolation.
-- Existing invoice reads/writes remain unchanged until booker-aware application
-- contracts are deployed and verified.

alter table if exists public.customer_invoice_records
  add column if not exists booker_id bigint references public.bookers(id) on delete restrict;

create index if not exists customer_invoice_records_customer_booker_created_idx
  on public.customer_invoice_records (customer_id, booker_id, created_at desc)
  where booker_id is not null;

comment on column public.customer_invoice_records.booker_id is
  'Verified PA/booker owner for customer invoice authorization. Company/customer identity alone must not authorize PA-private invoices.';
