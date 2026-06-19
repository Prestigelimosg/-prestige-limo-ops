# Admin Billing Payment Finance Activation Split Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime implementation, UI/API behavior change, env change, DB read/write, provider send, production deploy, Save Booking route change, `/api/admin-saved-bookings` change, parser change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card addition, or new shim.

Billing/payment is complete only up to the activation stop. The existing setup-only boundaries stay on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

## Split Runtime Lanes

Future finance runtime work must be split into exactly one separately approved sub-lane per task:

- Invoice number reservation readiness.
- Invoice/PDF format approval.
- PDF generation.
- Invoice sending/delivery.
- Payment links/provider.
- Manual payment record/reconciliation.
- Payout/accounting/finance export.

Payout/accounting/finance export is separate from customer billing/payment. It must not be bundled with invoice/PDF generation, invoice sending, payment links/provider, or manual customer payment recording.

## Required Approval For Any Future Lane

Each future runtime lane requires explicit owner approval naming exactly one sub-lane before implementation. Approval must include:

- Exact staging target and commit hash.
- Env gate names only, with no values or secrets.
- Table, RLS, storage, and access-policy proof for only the named sub-lane.
- Admin/dispatcher/finance role-boundary proof.
- Customer and driver privacy proof.
- Rollback, kill-switch, and manual recovery plan.
- One bounded evidence window and stop conditions.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

## Current Blocked Runtime State

Existing billing/payment setup remains planned-only and blocked:

- `invoicePdfEnabled` stays false.
- `invoiceSendingEnabled` stays false.
- `paymentLinksEnabled` stays false.
- `payoutAutomationEnabled` stays false.
- `productionAutoBillingEnabled` stays false.
- `paymentProviderConfigured` stays false.
- `liveBillingEnabled` stays false.
- `auditWriteEnabled` stays false.
- `external_send` stays false.

Existing missing requirements remain:

- `invoice_pdf_generation_approval`
- `invoice_sending_approval`
- `payment_provider`
- `payment_links_approval`
- `payout_automation_approval`
- `production_auto_billing_approval`
- `live_billing_approval`

## Lane-Specific Gates

Before PDF generation, owner approval must define invoice/statement format, invoice-number rules, included rows, tax/GST treatment, adjustment rules, staff review steps, generated-file access/storage, customer/month selection, rollback, and proof that private driver payout, CRM internals, parser/debug internals, and admin finance cannot leak.

Before invoice sending/delivery, owner approval must define channel, recipients, copy/template, opt-out or manual-send policy, audit logging, failure/retry handling, and proof that provider sends remain disabled until the exact lane is approved.

Before payment links/provider, owner approval must define test-mode scope, provider, secret-handling plan, webhook security, idempotency, payment-status mapping, failure states, disabled-by-default production posture, and rollback.

Before manual payment record/reconciliation, owner approval must define who can record payments, what evidence can be stored, what customer-visible fields are allowed, audit requirements, correction workflow, and rollback.

Before payout/accounting/finance export, owner approval must define finance-only role access, exported fields, PayNow handling, accounting destination, customer/driver visibility proof, and rollback. This lane remains separate from customer invoice/payment work.

## Not Approved By This Packet

This packet does not approve invoice creation, PDF generation, PDF storage, invoice sending, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, finance export, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
