# Backend API Integration Audit

Last reviewed: 2026-06-10

Scope: production-readiness status for every `app/api` route in the current app. This is an integration and boundary audit only; it does not approve Supabase migrations, broad production writes, invoice/PDF/payment/payout behavior, external notification sending, parser learning, or customer/driver auth activation.

## Current Route Inventory

| API route | Current integration status | Remaining forward work |
| --- | --- | --- |
| `/api/admin-app-notifications` | Admin/dispatcher internal app outbox foundation is guarded by the admin boundary; monthly billing draft prep can create a safe internal outbox event. | Keep internal only; do not add Telegram, WhatsApp, SMS, email, or customer/driver sending without explicit approval. |
| `/api/admin-booking-workflow-statuses` | Integrated for existing dispatch release and driver acknowledgement workflow controls. | Connect only additional existing lifecycle controls that have a real backend need. |
| `/api/admin-bookings` | Integrated in the admin dashboard save/load/update controls through the guarded admin persistence path. | Continue tightening full production admin workflows; no broad write expansion without approval. |
| `/api/admin-completed-booking-closeouts` | Integrated for the existing completed trip closeout control. | Expand closeout fields only through existing UI controls and contract tests. |
| `/api/admin-customer-driver-app-notifications` | Admin/dispatcher API for safe customer/driver app outbox rows; guarded from anonymous, customer, and driver referers. | Keep as internal app outbox only; no external notification sending. |
| `/api/admin-driver-job-bid-offers` | Guarded admin foundation for driver bid offer persistence. | Driver bidding remains blocked from runtime driver access until approved driver auth exists. |
| `/api/admin-driver-job-dsp-actual-time-summaries` | Integrated read-only into billing review for DSP actual time summaries. | Keep read-only and admin-only; do not expose driver payout or customer pricing. |
| `/api/admin-driver-job-links` | Integrated with existing driver job link create/load/revoke controls. | Keep token generation and revocation inside guarded admin APIs. |
| `/api/admin-driver-job-statuses` | Integrated read-only in the existing Day-of-Trip Dispatch Monitor. | Keep read-only for admin monitoring; driver token writes stay on the tokenized route. |
| `/api/admin-legacy-data/rest/v1/[table]` | Used only by the legacy admin data shim path. | Retire once all legacy shim usage is replaced by typed server APIs. |
| `/api/admin-map-location-search` | Integrated in the existing admin OneMap route assist surface. | Keep OneMap read-only unless a later approved workflow persists route metadata. |
| `/api/admin-map-route-estimates` | Integrated in the existing admin OneMap route assist surface. | Keep route estimates non-notifying and non-persistent unless later approved. |
| `/api/admin-monthly-billing-draft-plans` | Integrated in the existing Monthly Billing Month Grouping Review surface for guarded read and draft-plan save from saved grouped counts. | Do not turn this into invoice generation; keep it as pre-invoice planning. |
| `/api/admin-monthly-billing-groups` | Integrated read-only in the existing Monthly Billing Month Grouping Review surface. | Keep read-only grouping as the source for later billing preparation. |
| `/api/admin-monthly-invoice-billable-item-price-reviews` | Integrated in the existing monthly billing review path for guarded billable item price review. | Keep as admin-only review data; do not expose customer price to drivers. |
| `/api/admin-monthly-invoice-draft-item-reviews` | Integrated in the existing monthly billing review path for guarded draft item review save/load. | Keep as draft review only; no invoice issue or sending side effects. |
| `/api/admin-monthly-invoice-draft-trip-candidates` | Integrated behind the existing draft-prep create path to link saved completed trips safely. | Add visible candidate review only if it replaces existing local-only billing behavior with saved data. |
| `/api/admin-monthly-invoice-drafts` | Integrated in the existing Monthly Billing Month Grouping Review surface for guarded read and draft-prep create/refresh; successful draft prep creates a safe admin app outbox event. | Invoice number/PDF/payment/payout remain blocked until separately approved. |
| `/api/admin-monthly-invoice-issue-record-pdf-readiness` | Integrated as a guarded PDF-readiness status boundary for issue records. | This is readiness only; do not generate PDFs or send invoices from this route. |
| `/api/admin-monthly-invoice-issue-records` | Integrated in the existing monthly billing review path for guarded issue-record save/load/update. | Keep as admin-only issue records; no payment, invoice delivery, or PDF generation. |
| `/api/admin-monthly-invoice-issue-reviews` | Integrated in the existing monthly billing review path for guarded issue review save/load. | Keep as review state only; issue records and invoice numbers remain separate guarded steps. |
| `/api/admin-monthly-invoice-number-reservations` | Integrated in the existing monthly billing review path for guarded invoice number reservation. | Reservation is not invoice sending; do not create PDFs, payment records, or delivery events. |
| `/api/ai-parse` | Integrated in the existing parser assist flow. | Parser learning and external parser behavior remain blocked unless separately approved. |
| `/api/customer-app-notifications` | Deliberately blocked with customer-auth-required responses; no Supabase client is created. | Activate only after approved customer auth/RLS work. |
| `/api/customer-booking-requests` | Integrated in the public booking request page. | Customer auth/RLS activation remains a separate approval boundary. |
| `/api/customer-booking-statuses` | Integrated in the saved customer booking status lookup with secure customer-purpose headers and server session-token boundary. | Keep customer-safe fields only; no pricing, billing, invoice, payment, payout, parser, or admin note data. |
| `/api/driver-job-bids` | Deliberately blocked from runtime driver access until approved driver auth exists. | Activate only after driver auth and bid workflow approval. |
| `/api/driver-job/[token]` | Integrated in the driver job page read path. | Production token/link hardening remains separate from admin UI work. |
| `/api/driver-job/[token]/issue-alert` | Integrated in the driver job page issue-alert flow. | Keep alert content safe and internal; no external notification sending. |
| `/api/driver-job/[token]/notifications` | Integrated in the driver job page for safe app notifications; PATCH now scopes updates to booking-wide rows or the verified driver link id before writing. | Keep driver-visible fields safe; no billing, invoice, payout, PayNow, or internal note exposure. |
| `/api/driver-job/[token]/status` | Integrated in the driver job page status update path. | Driver auth and broader notification integrations remain separate approval boundaries. |

## Still Blocked

- No Supabase migration apply without explicit approval.
- No broad production writes.
- No invoice generation, invoice number assignment beyond guarded reservation, PDF creation, payment, payout, or PayNow behavior.
- No Telegram, WhatsApp, email, SMS, or customer/driver notification sending.
- No customer auth activation or driver auth activation.
- No parser learning or external parser behavior changes.
- No customer or driver exposure of internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

## Next Forward Integration Candidates

1. Replace remaining legacy admin data shim reads with typed server APIs where a typed API already exists.
2. Connect additional existing workflow status controls only when they support a real backend lifecycle step.
3. Move customer app notifications from blocked to readable only after approved customer auth and RLS activation.
4. Move driver bidding from blocked to runtime access only after approved driver auth and bidding workflow boundaries.
