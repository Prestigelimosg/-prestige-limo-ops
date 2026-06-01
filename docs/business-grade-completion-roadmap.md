# Business-Grade Completion Roadmap

## 1. Purpose

This roadmap explains how Prestige Limo Ops should move from the current protected mock/local prototype toward a business-grade production limo operations app.

This document is planning only. It does not approve or activate real Supabase, storage, API, auth, booking save/load, billing, invoice, PDF, payment, payout, notification, live location, maps, flight API, route API, parser learning, driver assignment, dispatch automation, audit trail, quote automation, pricing automation, or customer account behavior.

The current direction is to stop adding new mock feature workbenches. Future work should consolidate, plan, and carefully convert the existing protected prototype in staged batches.

## 2. Current Stable Protected Foundation

Treat these areas as stable checkpoints unless a real issue, failed check, or approved implementation stage requires a scoped change.

- Booking form and parser intake are protected by browser coverage and parser regression tests.
- Parser reliability is protected by parser examples, real-world fixtures, and `npm run test:parser`.
- Manual Extra Charges field and local preview are present as local UI/form-state only.
- The consolidated Extra Charges Control Center is clearly mock-only and protected by browser checks.
- Customer/public routes remain protected from internal/admin leakage.
- Driver demo and token-route protections remain covered by dedicated browser and safe-suite checks.
- Internal/admin dashboard workflows are currently mock/local/static and labeled as mock-only.
- Browser/mobile safety coverage protects route leakage, no horizontal overflow, and major workflow boundaries.
- `test:safe` checkpoint discipline is the main regression gate before and after commits.

## 3. Mock/Local/Static Areas Now Frozen

The recent mock workbench sector is complete for the current prototype phase. These areas should not be repeated with more tiny mock sections:

- Quote & Pricing Review.
- Operations Risk & SLA Watchlist.
- Booking Lifecycle Timeline & Internal Audit Readiness.
- Driver Assignment & Dispatch Readiness.
- Route & Itinerary Readiness.
- Airport Flight Monitoring & Pickup Readiness.
- Booking Intake Quality & Account Matching.
- Customer Account & Service Profile.
- Operations Handover & Shift Briefing.
- Fleet & Driver Readiness.
- Customer Service Recovery Communication.
- Replacement Vehicle & Service Recovery.
- Driver Job Completion & Exception Intake.
- Completed Job Closeout.
- Month-End Closeout.
- Finance Exception Resolution.
- Extra Charges mock/control areas.

These sections may later be consolidated, hidden behind an internal QA/dev toggle, or carefully converted into fewer production-grade operational panels. They should remain mock/local/static until a future stage explicitly approves real behavior.

## 4. Do Not Activate Yet

The following sectors are high-risk and should remain inactive until they receive explicit staged approval, design review, tests, and rollback planning:

- Supabase/database persistence.
- Auth/customer accounts.
- Real booking save/load.
- Real billing/monthly invoice.
- Invoice/PDF/payment links.
- Payouts/accounting/finance export.
- Driver assignment/dispatch persistence.
- Notifications/message sending.
- Live location/maps/flight/route APIs.
- Proof/photo upload.
- SLA/audit/quote/pricing automation.
- Parser learning or parser rule changes.

No future stage should activate any of these indirectly through a UI cleanup, mock consolidation, docs task, or test-only task.

## 5. Locked Customer Short-Notice Booking Rule

Customer-submitted bookings with a pickup time less than 24 hours away must not be directly confirmed by the customer app. These bookings must move to `Admin Review Required` so admin/dispatcher staff can review availability and confirm manually.

Customer-facing wording:

> “This booking is within 24 hours, so our team will review and confirm availability.”

Stage 4A-286 documents this rule only. It does not implement app behavior, booking save/load, customer confirmation blocking, notification, parser logic, API, storage, Supabase, or dispatch behavior. Future implementation must be separately approved, scoped, and protected by booking UI, customer route, browser/mobile, parser-boundary, and `test:safe` coverage.

## 6. Recommended Business-Grade Completion Path

Use staged batches. Each stage should be small, test-protected, reversible, and followed by one read-only checkpoint review.

### Stage A: Dashboard Consolidation / Hide-Or-Collapse Plan

Plan how to reduce the internal dashboard from many mock sections into fewer business-grade panels. Decide what stays visible, what moves behind a QA/dev toggle, and what can be archived as planning context.

Stage 4A-288 adds the dashboard information architecture plan to `docs/dashboard-consolidation-mock-section-hide-plan.md`. It keeps the next production direction focused on dashboard consolidation before real data, API, auth, billing, notification, or dispatch work.

No app behavior should change in the planning stage. A later implementation stage may hide or collapse mock sections only after the plan is approved.

### Stage B: Production Data Model Design Review Only

Review the core production entities before any migration work:

- Booking.
- Customer/account.
- Passenger/contact.
- Driver.
- Vehicle.
- Job lifecycle.
- Dispatch assignment.
- Completion/closeout.
- Invoice/payment.
- Audit event.

This should be design-only and should not create or apply Supabase migrations.

### Stage C: Supabase/Auth Design Review Only

Review future Supabase project boundaries, Row Level Security, staff/admin auth, customer auth, driver token access, service-role restrictions, backup/rollback expectations, and environment separation.

No Supabase commands, migrations, or auth implementation should happen in this stage.

### Stage D: Customer/Account And Booking Persistence Plan

Plan the first real persistence batch for customer/account and booking records. Define the minimum safe write path, read path, validation, rollback, and tests.

The first real implementation should be narrow: save/load only the approved booking/customer fields, with no billing, notification, driver assignment, or parser behavior changes.

### Stage E: Driver/Dispatch Persistence Plan

Plan driver and vehicle assignment persistence separately from booking persistence. Preserve the locked driver rule: dispatchers may intentionally assign the same driver to multiple bookings, and future conflict logic should warn only, not block or hide drivers.

No real driver acknowledgement, notification, live location, or schedule automation should be bundled into this stage.

### Stage F: Billing/Invoice/PDF/Payment Plan

Plan draft billing, invoice numbering, PDF generation, payment links, payouts, accounting, and finance export as separate approval gates.

Start with draft previews and test-mode workflows. Do not create real invoice numbers, payment links, statements, payouts, accounting records, or finance exports until approved.

### Stage G: Notifications/Message-Channel Plan

Plan customer and driver message channels as mock/log-only first. Define templates, approval steps, opt-in/consent, resend/failure handling, audit needs, and kill switches.

No real WhatsApp, SMS, email, Telegram, or customer notification sending should be enabled by default.

### Stage H: Live APIs And Uploads Plan

Plan flight API, maps/geocoding, traffic, route optimization, live location, proof/photo uploads, and file storage only after persistence/auth boundaries are clear.

Each provider should have cost controls, test/staging keys, fallback behavior, and no-live-call browser protections before activation.

### Stage I: Final Production Readiness Checklist

Before production launch, complete a final readiness checklist covering:

- Environment variables and secret handling.
- Staging validation.
- Supabase backups and rollback.
- Auth and role separation.
- Public/customer/driver route leakage checks.
- Parser regression checks.
- Mobile/no-horizontal-overflow checks.
- Billing/payment/notification disabled-by-default checks.
- Staff training and manual fallback.
- Explicit owner approval for each live switch.

## 7. Dashboard Cleanup Direction

The current internal/admin dashboard is now too mock-section-heavy for production. It has served its purpose as a safe exploration and protection surface, but it should not keep growing.

Stage 4A-287 counted 52 mock/local/static admin dashboard sections or panels. Stage 4A-288 uses that inventory to define a production dashboard hierarchy, with core operations visible first and frozen mock workbenches moved toward a collapsed internal QA/dev archive.

Future dashboard work should prefer one of these paths:

- Consolidate related mock workbenches into fewer operational panels.
- Hide mock-only QA sections behind an internal QA/dev toggle.
- Move mock-only planning examples into docs.
- Convert only the most important workflows into real production panels after data, auth, and tests are approved.

The production dashboard should be compact, role-aware, and operational. It should focus on the next action for dispatch/admin staff instead of displaying every mock workflow at once.

## 8. Parser Safety Plateau

Parser behavior should stay frozen unless there is a specific parser defect or an explicitly approved parser-improvement stage.

Any parser change must:

- Preserve existing real-world fixture behavior unless a business-approved correction is documented.
- Add or update regression tests for the exact parser scenario.
- Keep manual review separate from automatic parser behavior.
- Pass `npm run test:parser`.
- Pass `npm run test:safe`.

Parser learning, AI parser changes, automatic account linking, and production parser automation should not be bundled into unrelated app, dashboard, billing, dispatch, or Supabase work.

## 9. Required Checks For Future Commits

Keep the current checkpoint pattern for future implementation commits:

- `git status --short`
- `npm run test:booking-ui-browser`
- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:app-smoke-browser`
- `npm run test:mobile-usability-browser`
- `npm run test:safe`
- `git diff --check`
- `git status --short`
- Commit only if clean.
- Post-commit `npm run test:safe`.
- Final `git status --short`.

Do not change package scripts or `test:safe` membership without a separate explicit approval stage.

## 10. Recommended Next Safe Stage

Recommended next stage: Stage 4A-289 - Read-only route leakage boundary map.

Reason: the dashboard inventory and information architecture plan are now documented. Before any runtime collapse/hide implementation, the next safest step is to map the customer/public/driver route boundaries that must keep admin-only dashboard content, private driver details, finance details, mock QA/dev sections, Supabase/API/storage behavior, and notification/send behavior out of public surfaces.
