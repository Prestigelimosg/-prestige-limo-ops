# Admin Monthly Invoice Manual Payment Reconciliation Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime manual payment recording, reconciliation persistence, customer payment status changes, bank API access, bank scraping, automatic reconciliation, payment provider setup, payment link creation, invoice sending, PDF generation, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Invoice Manual Payment Reconciliation is a future finance sub-lane. It remains blocked until explicit owner approval names this exact manual-payment-reconciliation-only lane.

## Separate Finance Sub-Lane

Manual payment record/reconciliation is separate from:

- Invoice number reservation.
- Customer/company prefix and running-number policy.
- Invoice/PDF format approval.
- PDF generation.
- Invoice sending/delivery.
- Payment links/provider.
- Payout/accounting/export.
- Billing automation.
- Customer portal billing/payment activation.
- Bank API, bank scraping, or automatic reconciliation.

Manual payment record/reconciliation must not be bundled with invoice creation, PDF generation, invoice sending/delivery, payment links/provider, provider sends, payout/accounting/export, billing automation, customer messages, driver notifications, bank API access, automatic reconciliation, or production activation.

## Business Rule To Preserve

Future manual payment record/reconciliation work may only happen after staff confirms funds outside the app through an approved business process.

Manual payment recording must be staff-entered, auditable, and correction-safe. It must define who can record payments, what payment evidence can be stored, what customer-visible fields are allowed, how partial payments, paid, waived, refunded, reversal, and manual reference correction states work, and how mistakes are corrected without rewriting history.

Bank wire/transfer remains manual-record only. This lane must not add bank API access, bank scraping, automatic matching, automatic paid status, provider status trust, or payment-link status trust.

## Existing Boundaries Reused Or Preserved

Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only:

- `data-admin-monthly-invoice-number-reservation-action`
- `data-admin-monthly-invoice-pdf-readiness-action`
- `/api/admin-monthly-invoice-number-reservations`
- `/api/admin-monthly-invoice-issue-record-pdf-readiness`

The existing Customer Payments Workflow Design remains planning-only and does not approve a migration, app behavior change, payment provider, bank, notification, Supabase, or production implementation work.

The existing Regular Customer Monthly Billing Workflow Plan keeps bank wire/transfer manual-record only and says no bank API, bank scraping, or automatic reconciliation is approved.

Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit payment request or receipt sending approval.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

## Required Future Runtime Approval

Future runtime manual payment record/reconciliation work requires explicit owner approval with:

- Exact staging target and commit hash proof.
- Staff role and actor-boundary decision.
- Payment evidence fields decision.
- Customer-visible fields decision.
- Payment status mapping decision.
- Partial payment, paid, waived, refunded, reversal, and correction workflow decision.
- Manual reference correction workflow.
- Audit event requirements.
- Duplicate-record and retry safety plan.
- Bank API, bank scraping, and automatic reconciliation absent-proof.
- Admin/dispatcher/finance role-boundary proof.
- Customer and driver privacy proof.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Not Implied By Manual Payment Reconciliation

Future manual payment record/reconciliation approval must not imply:

- Invoice creation.
- Invoice number assignment or sequence increment.
- PDF generation.
- PDF storage.
- Invoice sending/delivery.
- Customer email, WhatsApp, or SMS sending.
- Payment link creation.
- Payment provider activation.
- Webhook status update activation.
- Bank API access.
- Bank scraping.
- Automatic reconciliation.
- Automatic paid status.
- Customer portal billing/payment activation.
- Payout/accounting/export.
- Billing automation writes.

Each of those remains a separate finance sub-lane requiring later explicit owner approval.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Future manual payment record/reconciliation design, evidence payloads, audit payloads, correction workflow, customer-safe status fields, and failure responses must prove those customer/driver privacy boundaries before any runtime work.

## Not Approved By This Packet

This packet does not approve runtime manual payment recording, reconciliation persistence, customer payment status changes, bank API access, bank scraping, automatic reconciliation, payment provider setup, payment link creation, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
