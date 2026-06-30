alter table public.customer_invoice_records
  add column if not exists document_type text not null default 'invoice',
  add column if not exists document_state text not null default 'issued',
  add column if not exists original_invoice_number text,
  add column if not exists credit_note_reason text;

alter table public.customer_invoice_records
  drop constraint if exists customer_invoice_records_invoice_number_check,
  drop constraint if exists customer_invoice_records_status_check;

alter table public.customer_invoice_records
  add constraint customer_invoice_records_invoice_number_check check (
    invoice_number ~ '^(INV|QUO|CN)-[0-9]{8}-[0-9]{4}$'
  ),
  add constraint customer_invoice_records_status_check check (
    status in ('Paid', 'Unpaid')
  ),
  add constraint customer_invoice_records_document_type_check check (
    document_type in ('invoice', 'quotation', 'credit_note')
  ),
  add constraint customer_invoice_records_document_state_check check (
    document_state in ('draft', 'issued')
  ),
  add constraint customer_invoice_records_credit_note_original_check check (
    document_type <> 'credit_note'
    or (
      original_invoice_number is not null
      and original_invoice_number ~ '^INV-[0-9]{8}-[0-9]{4}$'
    )
  );

create index if not exists customer_invoice_records_customer_document_created_idx
  on public.customer_invoice_records (customer_id, document_type, created_at desc);

comment on column public.customer_invoice_records.document_type is
  'Customer-facing billing document type: invoice, quotation, or credit_note.';

comment on column public.customer_invoice_records.document_state is
  'Billing document lifecycle state. Draft rows are admin-review only until issued.';

comment on column public.customer_invoice_records.original_invoice_number is
  'Original invoice number linked by a credit note. Paid invoices should not be edited or deleted.';
