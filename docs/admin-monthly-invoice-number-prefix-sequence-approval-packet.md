# Admin Monthly Invoice Number Prefix Sequence Approval Packet

## Status

This packet is docs/test-only. It does not approve runtime invoice number generation, invoice prefix writes, sequence writes, DB read/write execution, env changes, migrations, PDF generation, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider send, production deploy, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sector/card/button additions, or new shims.

Admin Monthly Invoice Customer Prefix Running Number is a future finance sub-lane. It remains blocked until explicit owner approval names this exact customer/company prefix and running-number lane.

## Separate Finance Sub-Lane

Customer/company invoice prefix and running-number policy is separate from:

- PDF generation.
- Invoice sending.
- Payment links/provider.
- Payment recording.
- Payout/accounting/export.
- Billing automation.

This lane must not be bundled with PDF generation, invoice sending, payment links/provider, payment recording, payout/accounting/export, billing automation, provider sends, customer messages, driver notifications, or production activation.

## Business Rule To Preserve

Admin sets and approves a unique invoice prefix code for each billing customer/company.

Future runtime may auto-generate the next running invoice number for that billing customer/company only when invoice-number reservation is explicitly approved through the existing reservation boundary.

Draft invoices, previews, grouping, billing preparation, and PDF-readiness review must not assign final invoice numbers.

PDF generation later must use an already-reserved invoice number.

## Prefix And Sequence Rules

- Prefixes are admin-controlled and unique per billing customer/company.
- Running sequences are scoped to the billing customer/company.
- Future implementation must prevent duplicate invoice numbers with transaction-safe unique-constraint proof.
- Future implementation must never reuse voided or cancelled invoice numbers.
- Customer/company name changes must not silently change the assigned prefix.
- Invoice number format requires explicit owner decision before runtime, including whether to use `PREFIX-0001` or `PREFIX-YYYY-0001`.
- Yearly reset versus lifetime running sequence requires explicit owner decision before runtime.

## Existing Boundary Reused

The existing invoice-number reservation boundary remains the source of truth:

- Existing UI control: `data-admin-monthly-invoice-number-reservation-action`.
- Existing route: `/api/admin-monthly-invoice-number-reservations`.
- Existing RPC boundary: `reserve_monthly_invoice_number_for_issue_record`.
- Existing PDF-readiness review control: `data-admin-monthly-invoice-pdf-readiness-action`.

This packet does not add a duplicate UI sector/card/button, route, helper, or shim.

Existing finance setup routes stay setup-only and blocked/no-live on `admin-billing-payment-readiness-preview-setup` and `admin-billing-payment-action-disabled-setup`.

## Required Future Runtime Approval

Future runtime approval for this lane requires:

- Exact staging target and commit hash proof.
- Table and policy proof for the customer/company prefix and sequence tables only.
- Admin-only boundary proof.
- Transaction and unique-constraint proof.
- Duplicate prevention proof.
- Voided/cancelled invoice number non-reuse proof.
- Customer/company rename prefix immutability proof.
- Invoice number format decision.
- Yearly reset versus lifetime sequence decision.
- Rollback and kill-switch proof.
- One bounded evidence window.
- Env gate names only, with no env values or secrets printed.

## Privacy Boundaries

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.

Future invoice-number runtime work must prove customer/driver public surfaces cannot expose finance/internal/payout fields.

## Not Approved By This Packet

This packet does not approve runtime invoice number generation, invoice prefix assignment or update, sequence increment execution, DB reads/writes, migrations, PDF generation, PDF storage, invoice sending, provider sends, payment links, payment provider setup, webhook setup, payment recording, payout automation, accounting export, finance export, billing automation, customer-visible finance changes, driver-visible finance changes, env changes, production deployment, Save Booking route changes, `/api/admin-saved-bookings` changes, parser changes, pricing/payout activation, auth/location/photo/calendar activation, UI sectors/cards/buttons, or new shims.
