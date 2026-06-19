# Admin Completed Trip Closeout Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, new live reads, DB writes beyond the existing guarded completed closeout API path, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Existing Workflow

The admin-only Day-of-Trip Completion Handoff and Completed Trip Closeout Review workflow already exists in the current app. Do not rebuild it as a duplicate workflow.

Existing runtime surfaces:

- `app/page.tsx` owns the existing local Day-of-Trip Completion Handoff at `data-admin-day-of-trip-completion-handoff`.
- `app/page.tsx` owns the existing Completed Trip Closeout Review at `data-admin-completed-trip-closeout-review`.
- `app/page.tsx` owns the existing completed closeout save/load path through `/api/admin-completed-booking-closeouts`.
- The existing closeout route is guarded by the admin/dispatcher boundary and supports closeout GET and status-only POST save/load behavior.
- The existing helper is `lib/admin-completed-booking-closeout-persistence.ts`.
- The existing persistence guard rejects finance, invoice, payment, PDF, payout, PayNow, notification, auth, live location, photo/proof, parser/debug, internal note, secret, mock QA, and dev archive fields.

Existing coverage:

- `scripts/test-app-smoke-browser.mjs` covers the Day-of-Trip Completion Handoff and Completed Trip Closeout Review across mobile and desktop viewports.
- `scripts/test-booking-ui-browser.mjs` covers guarded completed closeout GET/POST shape, existing closeout review save feedback, and forbidden request body fields.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile completion handoff, completed closeout review, completed-closeout API boundary, and no-horizontal-overflow behavior.
- `scripts/test-admin-completed-booking-closeout-api-contract.mjs` covers the guarded completed closeout API contract.
- `docs/backend-api-integration-audit.md` records `/api/admin-completed-booking-closeouts` as integrated for the existing completed trip closeout control.

## Forward Rule

Future work must reuse the existing Completion Handoff and Completed Trip Closeout Review instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.

If the owner explicitly approves a runtime improvement later, it must stay bounded to the existing admin dashboard closeout workflow and:

- Reuse the existing completion handoff, completed closeout review, and `/api/admin-completed-booking-closeouts` route.
- Keep completed closeout status-only unless a separate explicit approval changes that boundary.
- Keep invoice, PDF, payment, payout, PayNow payout, and billing automation blocked unless separately approved.
- Stay compact and colocated with the current dispatch/admin workflow controls.
- Keep Save Booking + CRM on `POST /api/admin-bookings`.
- Keep `/api/admin-saved-bookings` separate and unchanged.
- Keep customer and driver routes unchanged unless the task is route-leak testing.
- Keep customer-safe and driver-safe visibility rules.

## Still Blocked

- Adding a new Completion Handoff or Completed Trip Closeout Review UI sector, button, card, route, helper, or shim.
- Expanding completed closeout into invoice/PDF/payment/payout/billing automation.
- Opening new persistence gates or executing new live DB writes outside the existing guarded completed closeout API path.
- Real driver dispatch notification or provider sending.
- Real customer confirmation or customer messaging.
- Customer auth/RLS or driver auth/token persistence.
- Live location, OTS photo upload/storage, calendar sync, flight/map providers, parser-learning, or parser rule changes.

The correct forward action is to stabilize or extend the existing workflow only after explicit owner approval, not to create a parallel workflow.

## Privacy Boundary

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
