# Admin Monthly Billing Month Grouping Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes beyond existing approved admin API routes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing automation, invoice creation, PDF generation or sending, payment/pricing/payout/auth/location/photo/calendar activation, or new shims.

The admin-only Monthly Billing Month Grouping workflow already exists in the current app. Do not rebuild it as a duplicate workflow.

## Existing Surfaces

- `app/page.tsx` owns the existing Monthly Billing Month Grouping Review at `data-admin-monthly-billing-month-grouping-review`.
- `app/page.tsx` owns the existing saved monthly billing grouping read controls at `data-admin-monthly-billing-month-grouping-read-controls`.
- `app/page.tsx` owns the existing completed-booking billing-readiness audit action at `data-admin-completed-booking-billing-readiness-audit-action`.
- `app/page.tsx` owns the existing monthly billing draft-plan, invoice draft-prep, item-review, billable price review, issue-review, issue-record, invoice-number reservation, and PDF-review readiness action controls within the same existing Monthly Billing Month Grouping Review.
- The saved monthly billing grouping read path is `GET /api/admin-monthly-billing-groups`, backed by `lib/admin-monthly-billing-grouping-read.ts`.
- These surfaces are admin-only operational review and preparation controls.
- They do not create invoices, generate PDFs, send PDFs, collect payment, automate payouts, activate billing automation, send notifications, send customer messages, send driver notifications, change auth, change parser behavior, or change Save Booking behavior.

## Existing Coverage

- `scripts/test-app-smoke-browser.mjs` covers the Monthly Billing Month Grouping Review across mobile and desktop viewports, including local controls, read-only boundary text, compact layout, readable rows/controls/notes, and forbidden private text checks.
- `scripts/test-booking-ui-browser.mjs` covers the existing local review controls, guarded read calls, draft/review action buttons, saved grouping pagination/filtering, and no unexpected Load Booking call shape changes.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, read filters, pagination controls, readable rows/controls/notes, and no-horizontal-overflow behavior.
- Dedicated API contract tests already exist for the guarded monthly billing grouping read and monthly billing draft/review routes.

## Future Work Rule

Future work must reuse the existing Monthly Billing Month Grouping Review instead of adding another UI sector, card, button cluster, route, helper, or shim for the same purpose.

Allowed future work, only after explicit owner approval, must stay compact and colocated with the existing monthly billing month grouping review controls.

Still blocked without separate explicit approval:

- Adding a duplicate monthly billing month grouping, billing readiness audit, monthly billing draft plan, monthly invoice draft-prep, invoice item review, billable price review, issue review, issue record, invoice-number reservation, or PDF-readiness UI sector, button, card, route, helper, or shim.
- Activating invoice creation, PDF generation, PDF sending, payment links, payment collection, payout automation, billing automation, accounting posting, provider sends, live location, auth, photo/proof, calendar behavior, parser-learning behavior, or unapproved DB writes.
- Moving this workflow into customer or driver surfaces.
- Exposing customer price, driver payout, PayNow payout details, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, mock QA/dev archive, or secrets.

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
