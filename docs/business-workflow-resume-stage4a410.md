# Stage 4A-410 - Business Workflow Resume Recommendation

Stage 4A-410 resumes app/business workflow planning after production admin persistence verification and closeout. It does not change app behavior, does not run Supabase commands, does not read or write a live database, and does not approve another production persistence stage.

## Current App State Reviewed

- Admin dashboard `/` already has booking intake, parser/manual review, customer-safe copy, driver dispatch copy, driver assignment fields, booking status controls, and the admin booking persistence panel.
- Admin booking persistence now supports admin save/load/update through the server-only admin-gated route, but production persistence remains default OFF outside approved verification windows.
- Customer booking request submission exists at `/book` through `/api/customer-booking-requests`, with customer-safe wording and admin-review status fields. It still depends on approved persistence enablement and does not directly confirm bookings.
- Admin customer request review already appears inside the persistence panel when loaded records include customer requests. It includes request filtering, priority ordering, internal review decisions, short-notice review state, and a clear no-customer-contact/no-driver-dispatch boundary.
- Driver job pages and status routes already provide mock/safe acknowledgement, OTW, OTS, POB, and Job Completed workflow coverage. Production driver job links remain disabled until a later secure token/RLS stage.
- Monthly billing preparation has planning coverage, but billing, invoice, payment, PDF, payout, and accounting behavior remain blocked.

## Recommended Next Bigger Bounded Workflow

Build the next approved app/business step as an admin-only **Confirmed Booking To Dispatch Release** workflow.

This should connect existing operational surfaces instead of starting another Supabase write stage:

- Start from an applied admin operational snapshot or a reviewed customer booking request.
- Show a compact dispatcher release checklist for one booking: required trip fields, customer/request review status, short-notice clearance, assigned driver name/contact/plate, customer copy readiness, driver dispatch copy readiness, and driver job link readiness.
- Let staff mark the booking as ready for manual dispatch only after the checklist is satisfied.
- Keep the first implementation admin-only and UI/local-state only unless William separately approves a narrow persistence update.
- Reuse existing driver assignment fields, copy previews, status labels, and driver job link mock boundaries.
- Preserve customer-safe and driver-safe visibility rules.

Why this is the best next step: production persistence has been verified, but staff still need a reliable operational bridge from "request or saved booking exists" to "dispatcher can safely release this job to a driver." This has more practical limo-operations value than another database verification stage and is less risky than customer auth, driver token persistence, notifications, billing, PDF, payment, payout, or live location.

## Approved Now

- Documenting the next workflow direction.
- Reviewing existing admin/customer/driver workflow code and docs.
- Adding focused docs/test evidence for the recommendation.
- Planning a later UI-only/admin-only implementation stage.

## Still Blocked

- Supabase CLI, raw SQL, migrations, dashboard fixes, live save/load, production writes, or broad production reads.
- Customer auth, customer RLS, driver auth, driver token persistence, or production driver status writes.
- Real customer confirmation, real driver dispatch, notification sending, WhatsApp, SMS, email, Telegram, live location, proof/photo upload, or flight/map APIs.
- Billing, payment, invoice, statement, PDF, payout, PayNow payout, accounting, finance export, or monthly billing activation.
- Parser-learning, parser rule changes, or parser/debug internals exposure.

## Later Implementation Guardrails

A later implementation stage should be explicitly approved and should stay bounded to one admin dashboard workflow. It should not change public/customer/driver route behavior except for route-leak tests. It should include browser coverage proving the release checklist is admin-only, no customer price or driver payout leaks, no billing/payment/PDF/payout controls appear, no notifications are sent, no live DB write happens by default, and mobile/no-horizontal-overflow remains clean.

Recommended focused checks for that later stage:

- `npm run test:booking-ui-browser`
- `npm run test:driver-job-page-browser`
- `npm run test:mobile-usability-browser`
- `npm run test:app-smoke-browser`
- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:safe`
