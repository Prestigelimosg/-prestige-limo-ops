alter table public.customer_invoice_records
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists reminder_send_count integer not null default 0,
  add column if not exists last_reminder_sent_at timestamptz,
  add column if not exists last_reminder_message_id text,
  add column if not exists thank_you_sent_at timestamptz,
  add column if not exists thank_you_message_id text;

alter table public.customer_invoice_records
  drop constraint if exists customer_invoice_records_payment_method_check,
  add constraint customer_invoice_records_payment_method_check
    check (payment_method is null or payment_method in ('Bank transfer', 'Card', 'Cash')),
  drop constraint if exists customer_invoice_records_reminder_send_count_check,
  add constraint customer_invoice_records_reminder_send_count_check
    check (reminder_send_count >= 0);

alter table public.customer_invoice_records enable row level security;

revoke all on public.customer_invoice_records from anon;
revoke all on public.customer_invoice_records from authenticated;
grant select, insert, update, delete on public.customer_invoice_records to service_role;

comment on column public.customer_invoice_records.payment_method is
  'Admin-confirmed customer payment method. Never used for driver payout or PayNow payout.';
comment on column public.customer_invoice_records.last_reminder_sent_at is
  'Latest successful customer payment reminder delivery timestamp from the existing invoice email lane.';
comment on column public.customer_invoice_records.thank_you_sent_at is
  'Successful one-time customer payment thank-you delivery timestamp from the existing invoice email lane.';
