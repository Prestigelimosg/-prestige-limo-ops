# Admin Monthly Payout Accounting Finance Export Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime payout/accounting/export implementation, export file generation, accounting provider integration, payout payment execution, PayNow activation or send/payment, bank API access, bank scraping, provider sends, invoice sending, PDF generation, payment links/provider, payment recording, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Payout Accounting Finance Export is a future finance-only sub-lane. It remains blocked until explicit owner approval names this exact payout-accounting-finance-export-only lane.

## Separate Finance Sub-Lane

Payout/accounting/finance export is separate from:

- Invoice number reservation.
- Customer/company prefix and running-number policy.
- Invoice/PDF format approval.
- PDF generation.
- Invoice sending/delivery.
- Payment links/provider.
- Manual payment record/reconciliation.
- Customer billing/payment activation.
- Driver payout rules runtime writes.
- PayNow payout activation.
- Bank API, bank scraping, or accounting provider integration.
- Billing automation.

Payout/accounting/finance export must not be bundled with invoice creation, PDF generation, invoice sending/delivery, payment links/provider, payment recording, provider sends, payout payment execution, PayNow send/payment, bank API access, accounting provider integration, customer messages, driver notifications, billing automation, or production activation.

## Business Rule To Preserve

Future payout/accounting/finance export work may only happen after staff has reviewed monthly billing/payment context and explicit finance-only access rules are approved.

Finance export must be internal/admin-finance only, audit-safe, correction-safe, and customer/driver-hidden. It must define exported fields, excluded fields, PayNow handling, accounting destination, export format, duplicate export prevention, correction/reversal workflow, audit requirements, rollback, and kill-switch behavior before runtime work.

This lane must not execute payouts, trigger PayNow sends/payments, call bank APIs, scrape bank data, post accounting entries to external providers, trust provider status, update customer payment status, or expose payout/accounting/export details to customers or drivers.

## Existing Boundaries Reused Or Preserved

Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only:

- `data-admin-monthly-invoice-number-reservation-action`
- `data-admin-monthly-invoice-pdf-readiness-action`
- `/api/admin-monthly-invoice-number-reservations`
- `/api/admin-monthly-invoice-issue-record-pdf-readiness`

Existing driver payout rules runtime guards remain separate and are not approval for month-end payout/accounting/export. `driver_payout_rules` covers company/traveler payout rule writes only; it does not generate finance exports, execute payouts, activate PayNow, call accounting providers, or expose accounting export data.

Existing manual payment reconciliation, payment links/provider, invoice sending, PDF generation, invoice prefix, and invoice/PDF format packets remain separate prerequisite or sibling lanes only. None of them approve payout/accounting/export runtime behavior.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

## Required Future Runtime Approval

Future runtime payout/accounting/finance export work requires explicit owner approval with:

- Exact staging target and commit hash proof.
- Finance-only role and actor-boundary decision.
- Exported fields decision.
- Excluded customer/driver/internal fields decision.
- PayNow handling decision.
- Accounting destination decision.
- Export format decision, such as CSV or accounting-system-ready file.
- Customer and driver visibility proof.
- Duplicate export prevention plan.
- Correction/reversal workflow decision.
- Audit event requirements.
- Accounting provider, bank API, bank scraping, payout payment execution, and PayNow activation absent-proof unless separately approved.
- Admin/dispatcher/finance role-boundary proof.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Not Implied By Payout Accounting Finance Export

Future payout/accounting/finance export approval must not imply:

- Invoice creation.
- Invoice number assignment or sequence increment.
- PDF generation.
- PDF storage.
- Invoice sending/delivery.
- Customer email, WhatsApp, or SMS sending.
- Payment link creation.
- Payment provider activation.
- Webhook status update activation.
- Manual payment recording.
- Customer payment status changes.
- Customer portal billing/payment activation.
- Driver payout rules runtime writes.
- Payout payment execution.
- PayNow payout activation or send/payment.
- Bank API access.
- Bank scraping.
- Accounting provider posting.
- Billing automation writes.

Each of those remains a separate finance sub-lane requiring later explicit owner approval.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Future payout/accounting/finance export design, export files, audit payloads, correction workflow, accounting destination payloads, failure responses, and finance review screens must prove those customer/driver privacy boundaries before any runtime work.

## Not Approved By This Packet

This packet does not approve runtime payout/accounting/export implementation, export file generation, CSV generation, accounting-system-ready file generation, accounting provider integration, accounting provider posting, payout payment execution, PayNow activation, PayNow send/payment, bank API access, bank scraping, payout automation, finance export, customer-visible finance changes, driver-visible finance changes, runtime manual payment recording, reconciliation persistence, customer payment status changes, payment provider setup, payment link creation, checkout session creation, webhook setup, live Stripe mode, live payment collection, invoice creation, invoice number assignment, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, billing automation, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
