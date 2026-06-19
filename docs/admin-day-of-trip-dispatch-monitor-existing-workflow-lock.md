# Admin Day-of-Trip Dispatch Monitor Existing Workflow Lock

This document is docs/test-only. It does not approve runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads beyond the existing guarded admin read path, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Existing Workflow

The admin-only Day-of-Trip Dispatch Monitor already exists in the current app. Do not rebuild it as a duplicate workflow.

Existing runtime surfaces:

- `app/page.tsx` owns the existing compact Day-of-Trip Dispatch Monitor at `data-admin-day-of-trip-dispatch-monitor`.
- `app/page.tsx` owns the existing local progress controls at `data-admin-day-of-trip-dispatch-monitor-option`.
- `app/page.tsx` owns the existing saved driver status readout at `data-admin-driver-job-status-readout`.
- The existing saved driver status route is `/api/admin-driver-job-statuses`.
- The existing route is GET-only and read-only for admin monitoring.
- The existing helper is `lib/admin-driver-job-status-read.ts`.
- Driver token writes stay on the tokenized driver job route, not this admin monitor route.
- Existing OTW, OTS, POB, and Completed local progress controls remain blocked until Driver Acknowledgement is acknowledged through the gated Driver Acknowledgement follow-up outcome.

Existing coverage:

- `scripts/test-app-smoke-browser.mjs` covers the Day-of-Trip Dispatch Monitor, saved driver status readout, compact layout, route boundary, and no-horizontal-overflow behavior across mobile and desktop viewports.
- `scripts/test-booking-ui-browser.mjs` covers the guarded saved booking load GET to `/api/admin-driver-job-statuses`, the safe request shape, and the existing readout rendering.
- `scripts/test-mobile-usability-browser.mjs` covers compact mobile Day-of-Trip Dispatch Monitor controls, rows, saved driver status readout, and no-horizontal-overflow boundaries.
- `docs/backend-api-integration-audit.md` records `/api/admin-driver-job-statuses` as integrated read-only in the existing Day-of-Trip Dispatch Monitor.
- `scripts/test-admin-day-of-trip-dispatch-monitor-driver-ack-boundary-guard.mjs` covers the Driver Acknowledgement prerequisite before local day-of-trip progress can advance beyond reminder/needs-call states.

## Forward Rule

Future work must reuse the existing Day-of-Trip Dispatch Monitor instead of adding another UI sector, card, button, route, helper, or shim for the same purpose.

If the owner explicitly approves a runtime improvement later, it must stay bounded to the existing admin dashboard Day-of-Trip Dispatch Monitor and:

- Reuse the existing monitor, saved driver status readout, and `/api/admin-driver-job-statuses` read route.
- Preserve the gated Driver Acknowledgement prerequisite before local OTW, OTS, POB, and Completed progress controls can advance.
- Keep the admin route read-only for monitoring unless a separate explicit approval changes that boundary.
- Keep driver token writes on the tokenized driver job route.
- Stay compact and colocated with the current dispatch/admin workflow controls.
- Keep Save Booking + CRM on `POST /api/admin-bookings`.
- Keep `/api/admin-saved-bookings` separate and unchanged.
- Keep customer and driver routes unchanged unless the task is route-leak testing.
- Keep customer-safe and driver-safe visibility rules.

## Still Blocked

- Adding a new Day-of-Trip Dispatch Monitor UI sector, button, card, route, helper, or shim.
- Adding writes, provider sends, or direct live database access outside the existing guarded admin read path.
- Real driver dispatch notification or provider sending.
- Real customer confirmation or customer messaging.
- Customer auth/RLS or driver auth/token persistence.
- Billing, invoice, payment, PDF, payout, PayNow payout, accounting, or finance automation.
- Live location, OTS photo upload/storage, calendar sync, flight/map providers, parser-learning, or parser rule changes.

The correct forward action is to stabilize or extend the existing workflow only after explicit owner approval, not to create a parallel workflow.

## Privacy Boundary

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.
