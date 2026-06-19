# Admin Monthly Billing Month Grouping Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes beyond existing approved admin API routes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, billing automation, invoice creation, PDF generation or sending, payment/pricing/payout/auth/location/photo/calendar activation, or new shims.

The admin-only Monthly Billing Month Grouping workflow already exists in the current app. Do not rebuild it as a duplicate workflow.

## Existing Surfaces

- `app/page.tsx` owns the existing Monthly Billing Month Grouping Review at `data-admin-monthly-billing-month-grouping-review`.
- `app/page.tsx` owns the existing saved monthly billing grouping read controls at `data-admin-monthly-billing-month-grouping-read-controls`.
- `app/page.tsx` owns the existing completed-booking billing-readiness audit action at `data-admin-completed-booking-billing-readiness-audit-action`.
- `app/page.tsx` owns the existing monthly billing draft-plan, invoice draft-prep, item-review, billable price review, issue-review, issue-record, invoice-number reservation, and PDF-review readiness action controls within the same existing Monthly Billing Month Grouping Review.
- The saved monthly billing grouping read path is `GET /api/admin-monthly-billing-groups`, backed by `lib/admin-monthly-billing-grouping-read.ts`.
- Existing Monthly Billing Queue to Month Grouping Sequencing feeds local queue readiness into Month Grouping only when no saved monthly billing group is loaded.
- These surfaces are admin-only operational review and preparation controls.
- They do not create invoices, generate PDFs, send PDFs, collect payment, automate payouts, activate billing automation, send notifications, send customer messages, send driver notifications, change auth, change parser behavior, or change Save Booking behavior.

## Existing Coverage

- `scripts/test-app-smoke-browser.mjs` covers the Monthly Billing Month Grouping Review across mobile and desktop viewports, including local controls, read-only boundary text, compact layout, readable rows/controls/notes, and forbidden private text checks.
- `scripts/test-booking-ui-browser.mjs` covers the existing local review controls, guarded read calls, draft/review action buttons, saved grouping pagination/filtering, and no unexpected Load Booking call shape changes.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile layout, read filters, pagination controls, readable rows/controls/notes, and no-horizontal-overflow behavior.
- Dedicated API contract tests already exist for the guarded monthly billing grouping read and monthly billing draft/review routes.
- `scripts/test-admin-monthly-billing-queue-month-grouping-sequencing-guard.mjs` covers this queue-to-grouping boundary.
- `scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs` covers this draft/invoice sequencing boundary.

## Existing Monthly Billing Queue to Month Grouping Sequencing

- Month Grouping can mark grouped locally only when the existing Monthly Billing Queue is ready locally or a saved admin group is ready.
- Blocked queue trips and blocked saved trips remain blockers for Month Grouping readiness.
- The existing Month Grouping review, saved grouping read controls, completed-booking billing-readiness audit action, and draft/review action controls are reused.
- This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.

## Existing Monthly Billing Month Grouping to Draft Plan / Invoice Review Sequencing

- Saved monthly billing grouping is the prerequisite for draft plan and invoice draft-prep actions.
- A saved invoice draft with linked trips is the prerequisite for item review.
- A saved item review and reviewed amount are prerequisites for billable price review.
- An approved billable price review is the prerequisite for issue review.
- A saved issue review is the prerequisite for issue record creation.
- A locked draft issue record is the prerequisite for invoice-number reservation.
- A reserved invoice number on a locked issue record is the prerequisite for PDF-review readiness.
- The existing Month Grouping review reuses `data-admin-monthly-billing-draft-plan-save-action`, `data-admin-monthly-invoice-draft-save-action`, `data-admin-monthly-invoice-draft-item-review-save-action`, `data-admin-monthly-invoice-billable-price-review-save-action`, `data-admin-monthly-invoice-issue-review-save-action`, `data-admin-monthly-invoice-issue-record-save-action`, `data-admin-monthly-invoice-number-reservation-action`, and `data-admin-monthly-invoice-pdf-readiness-action`.
- The existing guarded admin routes are reused: `/api/admin-monthly-billing-draft-plans`, `/api/admin-monthly-invoice-drafts`, `/api/admin-monthly-invoice-draft-item-reviews`, `/api/admin-monthly-invoice-billable-item-price-reviews`, `/api/admin-monthly-invoice-issue-reviews`, `/api/admin-monthly-invoice-issue-records`, `/api/admin-monthly-invoice-number-reservations`, and `/api/admin-monthly-invoice-issue-record-pdf-readiness`.
- This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.
- `scripts/test-admin-monthly-billing-draft-invoice-sequencing-guard.mjs` covers this draft/invoice sequencing boundary.

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
