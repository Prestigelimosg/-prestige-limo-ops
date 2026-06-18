# Admin Driver Acknowledgement Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Existing Workflow

The admin-only Driver Acknowledgement workflow already exists in the current app. Do not rebuild it as a duplicate workflow.

Existing runtime surfaces:

- `app/page.tsx` owns the existing compact Driver Acknowledgement Readiness surface at `data-admin-driver-acknowledgement-readiness`.
- `app/page.tsx` owns the existing mark-ready control at `data-admin-driver-acknowledgement-mark-ready`.
- `app/page.tsx` owns the existing Driver Acknowledgement Follow-up tracker at `data-admin-driver-acknowledgement-follow-up`.
- The existing workflow status route is `/api/admin-booking-workflow-statuses`.
- The existing workflow area is `driver_acknowledgement`.
- The existing saved status label is `Driver acknowledgement ready`.

Existing coverage:

- `scripts/test-app-smoke-browser.mjs` covers Driver Acknowledgement readiness and follow-up across mobile and desktop viewports.
- `scripts/test-booking-ui-browser.mjs` covers the guarded workflow-status GET/POST shape for driver acknowledgement and verifies forbidden finance, notification, parser, secret, and token fields are absent from request bodies.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile Driver Acknowledgement readiness/follow-up and no-horizontal-overflow boundaries.
- `scripts/test-admin-booking-workflow-status-api-contract.mjs` covers the guarded workflow-status API contract.

## Forward Rule

Future work must reuse the existing Driver Acknowledgement workflow instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.

If the owner explicitly approves a runtime improvement later, it must stay bounded to the existing admin dashboard Driver Acknowledgement workflow and:

- Reuse the existing readiness, follow-up, and workflow-status API route.
- Stay compact and colocated with the current dispatch/admin workflow controls.
- Keep Save Booking + CRM on `POST /api/admin-bookings`.
- Keep `/api/admin-saved-bookings` separate and unchanged.
- Keep customer and driver routes unchanged unless the task is route-leak testing.
- Keep customer-safe and driver-safe visibility rules.

## Still Blocked

- Adding a new Driver Acknowledgement UI sector, button, card, route, helper, or shim.
- Opening persistence gates or executing new live DB writes.
- Real driver dispatch notification or provider sending.
- Real customer confirmation or customer messaging.
- Customer auth/RLS or driver auth/token persistence.
- Billing, invoice, payment, PDF, payout, PayNow payout, accounting, or finance automation.
- Live location, OTS photo upload/storage, calendar sync, flight/map providers, parser-learning, or parser rule changes.

The correct forward action is to stabilize or extend the existing workflow only after explicit owner approval, not to create a parallel workflow.

## Privacy Boundary

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
