# Admin Monthly Invoice Payment Links Provider Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime payment link creation, payment provider setup, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice sending, PDF generation, payment recording, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Invoice Payment Links Provider is a future finance sub-lane. It remains blocked until explicit owner approval names this exact payment-links/provider-only lane.

## Separate Finance Sub-Lane

Payment links/provider is separate from:

- Invoice number reservation.
- Customer/company prefix and running-number policy.
- Invoice/PDF format approval.
- PDF generation.
- Invoice sending/delivery.
- Manual payment record/reconciliation.
- Payout/accounting/export.
- Billing automation.
- Customer portal billing/payment activation.

Payment links/provider must not be bundled with invoice creation, PDF generation, invoice sending/delivery, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.

## Business Rule To Preserve

Future payment links/provider work may only happen after staff has reviewed the customer, booking or monthly billing context, amount, currency, description, duplicate-link risk, payment status, and invoice or draft billing relationship.

Future payment link creation must start in test mode only unless a later explicit live-mode approval is granted. Test mode approval must not imply live mode, customer sending, payment status trust, webhook status updates, payment recording, invoice/PDF generation, or customer portal payment activation.

Payment links must not be auto-sent immediately after creation. Sending payment links to customers remains part of a separately approved invoice sending/delivery or customer-message lane.

## Existing Boundaries Reused Or Preserved

Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only:

- `data-admin-monthly-invoice-number-reservation-action`
- `data-admin-monthly-invoice-pdf-readiness-action`
- `/api/admin-monthly-invoice-number-reservations`
- `/api/admin-monthly-invoice-issue-record-pdf-readiness`

The existing Stripe Test-Mode Payment-Link Workflow Plan remains planning-only and does not create payment records, payment links, checkout sessions, invoices, PDFs, webhook routes, API routes, Supabase rows, customer notifications, or customer-facing payment behavior.

Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit payment-link sending approval.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

## Required Future Runtime Approval

Future runtime payment links/provider work requires explicit owner approval with:

- Exact staging target and commit hash proof.
- Test-mode scope decision.
- Provider decision.
- Secret-handling plan.
- Webhook security plan.
- Idempotency and duplicate-link prevention plan.
- Payment-status mapping decision.
- Failure, expired, cancelled, unpaid, paid, refunded, and disputed state handling.
- Disabled-by-default production posture.
- Staff review and confirmation requirement.
- No auto-send proof.
- Admin/dispatcher/finance role-boundary proof.
- Customer and driver privacy proof.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Not Implied By Payment Links Provider

Future payment links/provider approval must not imply:

- Invoice creation.
- Invoice number assignment or sequence increment.
- PDF generation.
- PDF storage.
- Invoice sending/delivery.
- Customer email, WhatsApp, or SMS sending.
- Provider live send outside the exact approved payment provider lane.
- Webhook status update activation.
- Payment recording.
- Customer portal billing/payment activation.
- Payout/accounting/export.
- Billing automation writes.
- Stripe live mode.

Each of those remains a separate finance sub-lane requiring later explicit owner approval.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Future payment-link/provider design, provider payloads, webhook payloads, audit payloads, customer link surfaces, staff review screens, and failure responses must prove those customer/driver privacy boundaries before any runtime work.

## Not Approved By This Packet

This packet does not approve runtime payment link creation, payment provider setup, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
