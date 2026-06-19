# Admin Monthly Invoice PDF Generation Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime implementation, actual PDF generation, invoice creation, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB read/write, provider send, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Invoice PDF Generation is a future finance sub-lane. It remains blocked until explicit owner approval names this exact PDF-generation-only lane.

## Separate Finance Sub-Lane

PDF generation is separate from:

- Invoice number reservation.
- Invoice sending.
- Payment links/provider.
- Payment recording.
- Payout/accounting/export.

PDF generation must not be bundled with invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.

## Current Readiness Boundary

Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only.

- Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.
- Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.
- Existing guarded routes stay `/api/admin-monthly-invoice-number-reservations` and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

## Required Future Runtime Approval

Future runtime PDF generation requires explicit owner approval with:

- Exact staging target and commit hash proof.
- PDF format decision.
- Included invoice row decision.
- Tax/GST handling decision.
- Admin-only access boundary proof.
- Storage, access, and retention decision.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Not Implied By PDF Generation

Future PDF generation approval must not imply:

- Invoice sending.
- Payment link creation.
- Customer email, WhatsApp, or SMS sending.
- Provider live send.
- Payment recording.
- Payout/accounting/export.
- Billing automation writes.

Each of those remains a separate finance sub-lane requiring later explicit owner approval.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Generated PDF design, storage, access, and retention must prove those customer/driver privacy boundaries before any future runtime work.

## Not Approved By This Packet

This packet does not approve PDF file creation, PDF storage, invoice sending, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
