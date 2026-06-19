# Admin Monthly Billing Queue Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing activation, invoice/PDF/payment/pricing/payout/auth/location/photo/calendar activation, month grouping activation, or new shims.

The admin-only Monthly Billing Queue Readiness and Monthly Billing Queue Exception workflow already exists in the current app. Do not rebuild it as a duplicate workflow.

## Existing Surfaces

- `app/page.tsx` owns the existing Monthly Billing Queue Readiness Review at `data-admin-monthly-billing-queue-readiness-review`.
- `app/page.tsx` owns the existing Monthly Billing Queue Exception Review at `data-admin-monthly-billing-queue-exception-review`.
- Existing billing-preparation sequencing feeds the monthly queue through local readiness state only.
- Existing Monthly Billing Queue to Month Grouping Sequencing keeps Month Grouping local fallback counts derived from the queue when no saved monthly billing group is loaded.
- These surfaces are local admin review controls only.
- They do not create invoices, PDFs, payment links, payout records, monthly billing groups, billing automation, accounting posts, notification sends, customer messages, driver notifications, auth changes, parser changes, Supabase writes, or live database access.
- The separate Monthly Billing Month Grouping Review and its read/action controls are not activated or changed by this lock.

## Existing Coverage

- `scripts/test-app-smoke-browser.mjs` covers both monthly billing queue surfaces across mobile and desktop viewports.
- `scripts/test-booking-ui-browser.mjs` covers the existing local control labels, status text, local-only boundary, and forbidden private text checks.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, readable rows/controls/notes, and no-horizontal-overflow behavior.
- `scripts/test-admin-closeout-billing-preparation-sequencing-guard.mjs` covers the existing closeout-to-billing preparation to monthly queue sequencing evidence.
- `scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs` covers the existing monthly queue to month grouping sequencing evidence.

## Existing Monthly Billing Queue to Month Grouping Sequencing

- Monthly Billing Queue ready state feeds Month Grouping local fallback counts only when no saved monthly billing group is loaded.
- Monthly Billing Queue blocked trips prevent Month Grouping from becoming grouped locally.
- Month Grouping still uses the existing Monthly Billing Month Grouping Review, read controls, billing readiness audit, and draft/review action controls.
- This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.

## Future Work Rule

Future work must reuse the existing Monthly Billing Queue Readiness and Exception workflow instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.

Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing monthly billing queue review controls.
Preserve the existing closeout-to-billing preparation to monthly queue derived-readiness sequence.
Preserve the existing monthly queue to month grouping derived-readiness sequence.

Still blocked without separate explicit approval:

- Adding a duplicate monthly billing queue readiness or monthly billing queue exception UI sector, button, card, route, helper, or shim.
- Activating invoice creation, PDF generation, payment links, payment collection, payout automation, billing automation, monthly grouping writes, accounting posting, provider sends, live location, auth, photo/proof, calendar behavior, parser-learning behavior, or DB writes.
- Moving this workflow into customer or driver surfaces.
- Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, or secrets.

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
