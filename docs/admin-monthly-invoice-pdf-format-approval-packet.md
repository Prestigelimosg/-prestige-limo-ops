# Admin Monthly Invoice PDF Format Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime invoice format implementation, invoice creation, PDF generation, PDF storage, invoice sending, customer email, WhatsApp, SMS, provider send, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Invoice PDF Format is a future finance decision sub-lane. It remains blocked until explicit owner approval names this exact invoice/PDF-format-only lane.

## Separate Finance Sub-Lane

Invoice/PDF format approval is separate from:

- Invoice number reservation.
- Customer/company prefix and running-number policy.
- PDF generation.
- Invoice sending/delivery.
- Payment links/provider.
- Manual payment record/reconciliation.
- Payout/accounting/export.
- Billing automation.

Invoice/PDF format approval must not be bundled with runtime invoice creation, PDF generation, PDF storage, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.

## Required Format Decisions

Future invoice/PDF format approval requires explicit owner decisions for:

- Invoice versus statement naming.
- Header, footer, logo, company registration, and contact display.
- Invoice-number placement and reserved-number reference.
- Billing customer/company identity snapshot.
- Billing month and trip grouping display.
- Included row rules.
- Trip snapshot fields.
- Booking reference, service type, pickup, dropoff, date, time, vehicle, and passenger display.
- Rate, charge, adjustment, credit, waiting time, and discount display.
- Currency and rounding rules.
- Tax/GST treatment, including explicit no-GST wording if applicable.
- Payment terms and bank-transfer instruction reference.
- Internal-only fields to exclude.
- Customer-visible fields allowed.
- Driver-visible exclusion proof.
- Staff review and approval steps before generation.
- Generated-file name pattern, access, storage, retention, and redaction policy for any later PDF generation lane.

## Existing Boundaries Reused Or Preserved

Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only:

- `data-admin-monthly-invoice-number-reservation-action`
- `data-admin-monthly-invoice-pdf-readiness-action`
- `/api/admin-monthly-invoice-number-reservations`
- `/api/admin-monthly-invoice-issue-record-pdf-readiness`

Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

Existing PDF generation approval remains separate and must treat this format packet as a prerequisite decision packet, not as generation approval.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

## Required Future Runtime Approval

Future runtime work after this format decision requires separate owner approval with:

- Exact staging target and commit hash proof.
- The one named finance sub-lane being opened.
- Admin/dispatcher/finance role-boundary proof.
- Customer and driver privacy proof.
- Table, storage, and access-policy proof for only the named sub-lane.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Not Implied By Invoice PDF Format Approval

Future invoice/PDF format approval must not imply:

- Invoice creation.
- Invoice number assignment or sequence increment.
- PDF generation.
- PDF storage.
- Invoice sending/delivery.
- Customer email, WhatsApp, or SMS sending.
- Provider live send.
- Payment link creation.
- Payment provider activation.
- Payment recording.
- Customer portal billing/payment activation.
- Payout/accounting/export.
- Billing automation writes.

Each of those remains a separate finance sub-lane requiring later explicit owner approval.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Future invoice/PDF format, row rules, field snapshots, generated-file naming, access policy, storage policy, retention policy, audit payloads, and failure responses must prove those customer/driver privacy boundaries before any runtime work.

## Not Approved By This Packet

This packet does not approve runtime invoice format implementation, invoice creation, invoice number assignment, invoice prefix writes, sequence writes, PDF generation, PDF storage, invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
