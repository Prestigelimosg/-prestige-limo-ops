create table if not exists public.customer_invoice_records (
  id uuid primary key default gen_random_uuid(),
  invoice_number text not null unique,
  invoice_date_key text not null,
  customer_id text not null,
  customer_name text not null,
  customer_email text,
  status text not null default 'Unpaid',
  amount_cents integer not null,
  amount_label text not null,
  billing_month_label text not null,
  issue_date_iso timestamptz not null,
  issue_date_label text not null,
  due_date_label text not null,
  reference text not null,
  route text not null,
  service text not null,
  line_items jsonb not null default '[]'::jsonb,
  pdf_base64 text not null,
  pdf_sha256 text not null,
  pdf_content_type text not null default 'application/pdf',
  pdf_filename text not null,
  email_delivery_status text not null default 'not_sent',
  email_message_id text,
  email_sent_at timestamptz,
  source_surface text not null default 'admin_api',
  actor_role text not null default 'admin',
  actor_label text not null default 'Admin dashboard',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint customer_invoice_records_status_check check (status in ('Paid', 'Unpaid')),
  constraint customer_invoice_records_amount_check check (amount_cents > 0 and amount_cents <= 100000000),
  constraint customer_invoice_records_invoice_date_key_check check (invoice_date_key ~ '^[0-9]{8}$'),
  constraint customer_invoice_records_invoice_number_check check (
    invoice_number ~ '^INV-[0-9]{8}-[0-9]{4}$'
  ),
  constraint customer_invoice_records_email_delivery_status_check check (
    email_delivery_status in ('not_sent', 'sent', 'blocked', 'failed')
  ),
  constraint customer_invoice_records_source_surface_check check (
    source_surface in ('admin_api', 'migration', 'system')
  ),
  constraint customer_invoice_records_actor_role_check check (
    actor_role in ('admin', 'dispatcher', 'system')
  ),
  constraint customer_invoice_records_public_text_length_check check (
    char_length(customer_id) <= 160
    and char_length(customer_name) <= 180
    and coalesce(char_length(customer_email), 0) <= 180
    and char_length(amount_label) <= 40
    and char_length(billing_month_label) <= 80
    and char_length(issue_date_label) <= 80
    and char_length(due_date_label) <= 80
    and char_length(reference) <= 160
    and char_length(route) <= 600
    and char_length(service) <= 160
    and char_length(pdf_filename) <= 180
    and char_length(actor_label) <= 180
  ),
  constraint customer_invoice_records_pdf_check check (
    pdf_content_type = 'application/pdf'
    and char_length(pdf_base64) <= 1500000
    and pdf_sha256 ~ '^[a-f0-9]{64}$'
  )
);

create index if not exists customer_invoice_records_customer_status_created_idx
  on public.customer_invoice_records (customer_id, status, created_at desc);

create index if not exists customer_invoice_records_date_key_idx
  on public.customer_invoice_records (invoice_date_key);

alter table public.customer_invoice_records enable row level security;

revoke all on public.customer_invoice_records from anon;
revoke all on public.customer_invoice_records from authenticated;
grant select, insert, update, delete on public.customer_invoice_records to service_role;
