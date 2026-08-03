-- Cover the verified traveller foreign key used by stored invoice lifecycle checks.
-- This does not broaden access or create a customer-visible read policy.

create index if not exists customer_invoice_records_traveler_idx
  on public.customer_invoice_records (traveler_id)
  where traveler_id is not null;
