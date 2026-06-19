# Admin Monthly Billing Queue Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, month grouping activation, or new shims.

The admin-only Monthly Billing Queue Readiness and Monthly Billing Queue Exception workflow already exists in the current app. Do not rebuild it as a duplicate workflow.

## Existing Surfaces

- `app/page.tsx` owns the existing Monthly Billing Queue Readiness Review at `data-admin-monthly-billing-queue-readiness-review`.
- `app/page.tsx` owns the existing Monthly Billing Queue Exception Review at `data-admin-monthly-billing-queue-exception-review`.
- These surfaces are local admin review controls only.
- They do not create invoices, PDFs, payment links, payout records, monthly billing groups, billing automation, accounting posts, notification sends, customer messages, driver notifications, auth changes, parser changes, Supabase writes, or live database access.
- The separate Monthly Billing Month Grouping Review and its read/action controls are not activated or changed by this lock.

## Existing Coverage

- `scripts/test-app-smoke-browser.mjs` covers both monthly billing queue surfaces across mobile and desktop viewports.
- `scripts/test-booking-ui-browser.mjs` covers the existing local control labels, status text, local-only boundary, and forbidden private text checks.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, readable rows/controls/notes, and no-horizontal-overflow behavior.

## Future Work Rule

Future work must reuse the existing Monthly Billing Queue Readiness and Exception workflow instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.

Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing monthly billing queue review controls.

Still blocked without separate explicit approval:

- Adding a duplicate monthly billing queue readiness or monthly billing queue exception UI sector, button, card, route, helper, or shim.
- Activating invoice creation, PDF generation, payment links, payment collection, payout automation, billing automation, monthly grouping writes, accounting posting, provider sends, live location, auth, photo/proof, calendar behavior, parser-learning behavior, or DB writes.
- Moving this workflow into customer or driver surfaces.
- Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, or secrets.

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
