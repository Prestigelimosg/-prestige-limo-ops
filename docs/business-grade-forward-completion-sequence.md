# Business-Grade Forward Completion Sequence

This document is docs/test-only. It does not approve or activate runtime implementation, UI/API behavior change, UI sectors, buttons, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, or new shims.

## Current Direction

Prestige Limo Ops should move forward from the current protected foundation toward a business-grade limo operations app by completing the business workflow in the order already proven by the repo:

1. Preserve the admin-only booking persistence and production verification evidence already recorded in the existing persistence evidence docs.
2. Do not repeat completed persistence, RLS, staging, or production verification unless a new runtime/deploy/env change creates a fresh reason.
3. Keep production persistence default OFF outside approved verification or activation windows.
4. Treat customer auth/RLS, driver auth/token persistence, notifications, billing, payment, PDF, payout, live location, OTS photo proof, calendar, provider sending, parser changes, and production launch as later separately approved gates.
5. The next runtime direction, if the owner explicitly approves runtime work, is the admin-only Confirmed Booking To Dispatch Release workflow described in `docs/business-workflow-resume-stage4a410.md`.

## Next Approved Work Without New Feature Approval

Without a new explicit owner approval, allowed work remains:

- Read-only code/docs audit.
- Local tests and smokes.
- Docs clarification.
- Docs/test-only guard hardening.
- Bug fixes for already-approved behavior.
- Review and commit.

These activities may identify blockers, but they must not silently convert into feature implementation.

## Next Runtime Work If Explicitly Approved

The next sensible business-grade runtime task is admin-only Confirmed Booking To Dispatch Release, bounded to one existing admin workflow. It should:

- Reuse existing booking intake, customer request review, assigned driver, customer copy readiness, driver dispatch copy readiness, and driver job link readiness surfaces.
- Stay compact and colocated with similar admin dispatch controls.
- Start UI/local-state only unless the owner separately approves narrow persistence.
- Show one booking readiness checklist before manual dispatch release.
- Keep Save Booking + CRM on `POST /api/admin-bookings`.
- Keep `/api/admin-saved-bookings` separate and unchanged.
- Avoid new public/customer/driver behavior in the same pass.

This is not approved by this document. It is only the forward direction to ask about when runtime implementation becomes allowed.

## Blockers That Must Stay Visible

- Runtime implementation needs explicit owner approval naming the feature.
- Customer auth/RLS is not activated.
- Driver auth/token persistence is not activated.
- Production driver job links and production driver status writes remain disabled until a later secure token/RLS gate.
- Notifications and provider sending remain disabled/no-live.
- Billing, invoice, payment, PDF, payout, PayNow payout, accounting, and finance automation remain blocked.
- Live location, GPS capture, OTS photo upload/storage, calendar sync, flight/map providers, parser-learning, and parser rule changes remain blocked.

No future task should hide these as "done" merely because planning or evidence exists.

## Testing And Staging Policy

Testing and staging are still required. Use them at the correct layer:

- Docs/test-only locks need focused local guard tests, preactivation suite coverage when registered, lint if code/test files changed, and diff checks.
- Runtime or UI behavior changes need local tests, browser/mobile coverage as relevant, and staging smoke before the change is considered clean.
- Activation or live workflow changes need staging first, explicit owner approval, rollback proof, and then the narrow live verification named in that approval.

Do not run staging smoke just to move backward over already-smoked checkpoints. Do run it after a new deploy-relevant runtime change.

## Privacy And Scope Rules

Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive data.

Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive data.

This sequence preserves those boundaries while moving the app toward a practical operations flow instead of adding disconnected features.
