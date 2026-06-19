# Admin Monthly Invoice Sending Delivery Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider send, payment links/provider, payment recording, payout/accounting/export, billing automation, env changes, DB read/write execution, migrations, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Invoice Sending Delivery is a future finance sub-lane. It remains blocked until explicit owner approval names this exact invoice-sending/delivery-only lane.

## Separate Finance Sub-Lane

Invoice sending/delivery is separate from:

- Invoice number reservation.
- Customer/company prefix and running-number policy.
- PDF generation.
- Payment links/provider.
- Payment recording.
- Payout/accounting/export.
- Billing automation.

Invoice sending/delivery must not be bundled with PDF generation, payment links/provider, payment recording, payout/accounting/export, billing automation, provider activation, customer messages, driver notifications, or production activation.

## Business Rule To Preserve

Future invoice sending/delivery may only happen after an invoice number has already been reserved and a PDF artifact has been generated through its own separately approved PDF-generation lane.

Draft invoices, previews, grouping, billing preparation, issue record review, invoice-number reservation, and PDF-readiness review must not send invoices or notify customers.

PDF generation approval must not imply invoice sending/delivery approval.

Payment links/provider approval must not be bundled into invoice sending/delivery approval.

## Existing Boundaries Reused Or Preserved

Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only:

- `data-admin-monthly-invoice-number-reservation-action`
- `data-admin-monthly-invoice-pdf-readiness-action`
- `/api/admin-monthly-invoice-number-reservations`
- `/api/admin-monthly-invoice-issue-record-pdf-readiness`

Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit invoice delivery approval.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

## Required Future Runtime Approval

Future runtime invoice sending/delivery requires explicit owner approval with:

- Exact staging target and commit hash proof.
- Channel decision.
- Recipient decision.
- Copy/template decision.
- Attachment/link policy decision.
- Opt-out or manual-send policy decision.
- Audit logging decision.
- Failure/retry handling decision.
- Provider-send disabled-until-approved proof.
- Admin/dispatcher/finance role-boundary proof.
- Customer and driver privacy proof.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Not Implied By Invoice Sending Delivery

Future invoice sending/delivery approval must not imply:

- PDF generation.
- Payment link creation.
- Payment provider activation.
- Payment recording.
- Customer portal billing/payment activation.
- Payout/accounting/export.
- Billing automation writes.
- Provider live sends outside the exact approved invoice delivery channel.

Each of those remains a separate finance sub-lane requiring later explicit owner approval.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Future invoice sending/delivery design, template, recipients, attachments, links, audit payloads, and failure responses must prove those customer/driver privacy boundaries before any runtime work.

## Not Approved By This Packet

This packet does not approve runtime invoice sending, invoice delivery, customer email, WhatsApp, SMS, provider sends, PDF generation, PDF storage, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, DB reads/writes, migrations, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
