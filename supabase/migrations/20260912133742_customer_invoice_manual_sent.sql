-- Manual confirmation belongs to this invoice/PDF version, never to email delivery.
-- Additive only: no row backfill, policy, grant, payment or booking change.
ALTER TABLE public.customer_invoice_records
  ADD COLUMN IF NOT EXISTS manually_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS manually_sent_pdf_sha256 text;
