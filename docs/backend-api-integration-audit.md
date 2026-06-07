# Backend API Integration Audit

Last reviewed: 2026-06-07

Scope: admin/customer/driver API route integration status in the app UI. This is a planning and verification checklist only; it does not approve Supabase migrations, broad production writes, invoice/PDF/payment/payout/notification behavior, or customer/driver auth activation.

## Current Integrated Routes

| API route | Current UI/API integration status | Remaining forward work |
| --- | --- | --- |
| `/api/admin-bookings` | Integrated in the admin dashboard save/load/update controls through the guarded admin persistence path. | Continue tightening full production admin workflows; no broad write expansion without approval. |
| `/api/admin-booking-workflow-statuses` | Integrated for existing dispatch release and driver acknowledgement workflow controls. | Connect additional existing workflow controls only when the control already has a real backend need. |
| `/api/admin-completed-booking-closeouts` | Integrated for the existing completed trip closeout control. | Expand closeout fields only through existing UI controls and contract tests. |
| `/api/admin-driver-job-statuses` | Integrated read-only in the existing Day-of-Trip Dispatch Monitor. | Keep read-only; driver auth/token changes stay separate. |
| `/api/admin-app-notifications` | Backend foundation added for admin/dispatcher in-app notification outbox read/create through guarded API only; one fake production row was saved, loaded, exactly deleted, and verified absent. | Add an existing admin notification surface later; external notification sending remains blocked. |
| `/api/admin-monthly-billing-groups` | Integrated read-only in the existing Monthly Billing Month Grouping Review surface. | Keep read-only grouping as the source for later billing preparation. |
| `/api/admin-monthly-billing-draft-plans` | Integrated in the existing Monthly Billing Month Grouping Review surface for guarded read and draft-plan save from saved grouped counts. | Do not turn this into invoice generation; keep it as pre-invoice planning. |
| `/api/admin-monthly-invoice-drafts` | Integrated in the existing Monthly Billing Month Grouping Review surface for guarded read and draft-prep create/refresh. | Invoice number/PDF/payment/payout remain blocked until separately approved. |
| `/api/admin-monthly-invoice-draft-trip-candidates` | Integrated behind the existing draft-prep create path to link saved completed trips safely. | Add visible candidate review only if it replaces existing local-only billing review behavior, not as another mock section. |
| `/api/admin-map-location-search` | Integrated in the existing admin OneMap route assist surface. | Keep OneMap read-only unless a later approved workflow persists route metadata. |
| `/api/admin-map-route-estimates` | Integrated in the existing admin OneMap route assist surface. | Keep route estimates non-notifying and non-persistent unless later approved. |
| `/api/admin-legacy-data/rest/v1/[table]` | Used only by the legacy admin data shim path. | Retire once all legacy shim usage is replaced by typed server APIs. |
| `/api/ai-parse` | Integrated in the existing parser assist flow. | Parser learning and external AI behavior remain blocked unless separately approved. |
| `/api/customer-booking-requests` | Integrated in the public booking request page. | Customer auth/RLS activation remains a separate approval boundary. |
| `/api/driver-job/[token]` | Integrated in the driver job page read path. | Production token/link hardening remains separate from admin UI work. |
| `/api/driver-job/[token]/status` | Integrated in the driver job page status update path. | Driver auth and notification integrations remain separate approval boundaries. |

## Still Blocked

- No Supabase migration apply without explicit approval.
- No broad production writes.
- No invoice generation, invoice number assignment, PDF creation, payment, payout, or PayNow behavior.
- No Telegram, WhatsApp, email, SMS, or customer/driver notification sending.
- No customer auth activation or driver auth activation.
- No parser learning or external parser behavior changes.

## Next Forward Integration Candidates

1. Replace remaining legacy admin data shim reads with typed server APIs where a typed API already exists.
2. Connect additional existing workflow status controls only when they support a real backend lifecycle step.
3. Add visible monthly invoice trip candidate review only as a real saved-data review surface, not a mock/readiness section.
4. Prepare customer/driver auth and RLS activation plans, but stop before activation until explicitly approved.
