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

Stage 4A-290 adds the mock-section collapse/hide UI plan. The next production direction is to collapse or hide frozen mock workbenches behind an internal QA/dev archive before any real data, API, auth, billing, notification, dispatch, or parser work.

Stage 4A-291 defines QA/dev archive acceptance criteria. Future runtime implementation should be UI-only, bounded, and test-protected; mock workbenches remain frozen and real data/API/auth/billing/payment work remains blocked until later approved stages.

Stage 4A-294 adds the production data/auth boundary plan after the collapsed archive implementation and read-only checkpoint review. The next production direction is boundary planning before any real Supabase, API, auth, booking save/load, customer account, billing, payment, notification, or driver workflow implementation.

Stage 4A-296 adds a docs-only Supabase schema/data model plan in `docs/supabase-schema-data-model-plan.md`. It does not run Supabase commands, create migrations, add API routes, or activate real persistence. Real implementation remains blocked until later explicitly approved stages, and the next safe stage should be Stage 4A-297 read-only checkpoint review.

Stage 4A-298 adds docs-only Migration / RLS / API planning in `docs/supabase-migration-rls-api-plan.md`. It does not run Supabase commands, create migrations, add API routes, or activate persistence. Real implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-299 read-only checkpoint review.

Stage 4A-300 adds a docs-only test safety guard plan in `docs/supabase-api-runtime-test-guard-plan.md` for accidental Supabase/API/runtime calls. It does not edit tests, package scripts, app behavior, Supabase files, migrations, API routes, or persistence. Real implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-301 read-only checkpoint review.

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

Stage 4A-290 defines the collapse/hide UI plan for those frozen sections. Runtime implementation must be separate, explicitly approved, and protected by browser/mobile route leakage checks, parser checks, build/lint, and post-commit `test:safe`.

Stage 4A-291 defines the acceptance criteria for that future UI-only archive implementation. It keeps the next implementation bounded to reorganizing existing mock/local/static sections, with no new mock workbench and no real Supabase, API, auth, billing, payment, notification, dispatch, or parser behavior.

Stage 4A-292 implemented the collapsed internal QA/dev archive shell and Stage 4A-293 verified it with a read-only checkpoint review. Stage 4A-294 now plans production data/auth boundaries before any real persistence, account, billing, payment, notification, or driver workflow work.

Future dashboard work should prefer one of these paths:

- Consolidate related mock workbenches into fewer operational panels.
- Hide mock-only QA sections behind an internal QA/dev toggle.
- Move mock-only planning examples into docs.
- Convert only the most important workflows into real production panels after data, auth, and tests are approved.

The production dashboard should be compact, role-aware, and operational. It should focus on the next action for dispatch/admin staff instead of displaying every mock workflow at once.

## 8. Stage 4A-294 - Production Data/Auth Boundary Plan

Stage 4A-294 is documentation-only. It plans future production data and auth boundaries after the collapsed QA/dev archive was implemented and verified. It does not change runtime behavior and does not activate real Supabase, auth, API routes, data persistence, billing, invoice, PDF, payment, payout, notification, live location, maps, flight, route, parser learning, customer account, booking save/load, or driver workflow behavior.

### A. Why This Plan Is Needed

Before real production data features are built, Prestige Limo Ops needs clear boundaries for:

- Admin/staff operational data.
- Customer-visible booking data.
- Driver-visible job data.
- Finance-sensitive billing, payment, invoice, accounting, and payout data.
- Public booking request data.
- Mock/local-only QA archive data.
- Future Supabase-saved production data.

This stage is planning only. Real storage, auth, API, billing, payment, PDF, notification, dispatch persistence, customer account, and Supabase work remains blocked until a future explicit implementation stage.

### B. Future Role Model

1. Admin / Owner
   - Full internal operational view.
   - Customer accounts, drivers, vehicles, rates, finance, billing, payout, audit, and review powers.
   - Access to the internal QA/mock archive for QA and planning only.

2. Dispatcher / Operations Staff
   - Booking intake, parser/manual review, driver assignment review, customer update readiness, and operational job status.
   - Limited finance visibility only if needed for dispatch decisions.
   - No automatic billing, payment, payout, notification, or persistence powers unless separately approved.

3. Customer
   - Own booking requests, own confirmed bookings, simple status, and customer-safe wording only.
   - No driver payout, internal driver notes, admin workbench, parser debug, finance internals, or QA/mock archive content.

4. Driver
   - Assigned job details needed to perform the trip: timing, pickup/dropoff, route basics, approved contact/job details, and simple status.
   - No customer billing, company pricing, payout comparison, admin notes, customer account details, finance internals, or mock archive content.

5. Finance / Admin Billing
   - Future invoice, statement, payment follow-up, payout review, month-end closeout, and accounting review.
   - Sensitive and role-protected later; no real finance workflow is activated in this stage.

Actual auth and role implementation is not part of Stage 4A-294.

### C. Route Ownership Plan

| Route | Current/future owner | Boundary |
| --- | --- | --- |
| `/` | Admin/internal dashboard | Contains operational admin content and the collapsed QA/dev archive. Should require admin/staff auth later. |
| `/book` | Public/customer booking request | No admin internals. Future short-notice rule must show simple customer wording only. |
| `/my-bookings` | Customer portal | Should later require customer identity/auth or a secure access flow. Must show only customer-owned booking information. |
| `/customers` | Internal staff customer/payments dashboard | Requires admin/staff auth later despite the customer-facing route name. Must not be treated as a public customer portal. |
| `/driver-job-demo` | Demo/public driver surface | Remains demo/mock/local and must not expose admin, billing, payout, or archive content. |
| `/driver-job/[token]` | Public driver token route | Should expose only job-card-safe driver information for one scoped job. Must never expose admin, finance, billing, payout, customer account, or mock archive content. |

### D. Data Visibility Matrix

| Data category | Admin/owner | Dispatcher | Customer | Driver | Finance | Notes / future rule |
| --- | --- | --- | --- | --- | --- | --- |
| Booking ID/reference | Visible | Visible | Own booking only | Assigned job only | Visible | Future auth required for customer/driver scoping. |
| Customer name/contact | Visible | Visible for operations | Own profile/booking only | Only approved job contact info | Visible if billing-related | Customer PII must be scoped by role. |
| Pickup date/time | Visible | Visible | Own booking only | Assigned job only | Visible if billing-related | Customer and driver views can show safe operational timing. |
| Pickup/dropoff/route | Visible | Visible | Own booking only | Assigned job only | Visible if billing-related | Route details must not include internal notes. |
| Flight details | Visible | Visible | Own booking only | Assigned job only | Usually hidden unless invoice support needs it | No flight API activation yet. |
| Pax/luggage/vehicle type | Visible | Visible | Own booking only | Assigned job only | Limited if billing-related | Safe to expose when scoped to own booking/job. |
| Child seat / extra stop / waiting time / midnight charge | Visible | Visible | Customer-safe summary only | Job-relevant details only | Visible when finance-approved | Charges remain local/mock until billing approval. |
| Quoted customer price | Visible | Limited if operationally needed | Own quote only after approval | Hidden | Visible | Must not leak to unrelated customers or drivers. |
| Driver payout | Visible | Limited if approved for dispatcher role | Hidden | Own payout only if a future payout stage approves it | Visible | Never leak payout to customers. |
| Driver PayNow number | Visible | Limited if needed | Hidden | Own profile only after auth approval | Visible if payout-approved | Highly sensitive; role-protect before persistence. |
| Internal notes | Visible | Visible if operational | Hidden | Hidden | Limited if finance-relevant | Must never leak to customer or driver routes. |
| Parser raw text/debug output | Visible for staff QA | Limited/manual review only | Hidden | Hidden | Hidden | Parser behavior remains frozen unless a parser stage approves changes. |
| Customer copy | Visible | Visible | Own booking-safe copy | Hidden unless driver-safe subset is approved | Hidden unless billing support needs it | Keep customer wording simple and non-internal. |
| Driver dispatch copy | Visible | Visible | Hidden | Assigned job only | Hidden | Must exclude customer billing and admin notes. |
| Job card copy | Visible | Visible | Customer-safe subset only | Assigned job-safe subset only | Limited | Split by route and role, not one universal copy. |
| Invoice/payment/PDF fields | Visible after approval | Usually hidden or limited | Own invoices/payments only after auth/billing approval | Hidden | Visible | No billing/payment/PDF behavior yet. |
| Supabase IDs / audit metadata | Visible for admin/debug only | Hidden unless operationally needed | Hidden | Hidden | Visible if audit-approved | Future-auth-required and not customer/driver-facing. |
| Mock QA/dev archive content | Visible only in admin/internal archive | Hidden by default unless staff QA access approved | Hidden | Hidden | Hidden | Mock/local-only for now; never public/customer/driver-visible. |

### E. Data Persistence Boundary

Future Supabase persistence may be considered only after explicit approval for:

- Bookings.
- Customers.
- Drivers.
- Vehicles.
- Assignments.
- Job statuses.
- Customer account links.
- Billing records.
- Invoices/statements.
- Payments or manual payment records.
- Payout records.
- Audit logs.

The following must not be persisted yet:

- QA/dev mock archive state or content.
- Mock workbench data.
- Parser learning or parser rule changes.
- Notification send logs unless a notification stage is approved.
- Billing, payment, invoice, PDF, or statement outputs unless a billing stage is approved.
- Live location, route traces, proof photos, or file uploads unless a driver workflow/storage stage is approved.

No Supabase commands, schema changes, API routes, or migrations happen in Stage 4A-294.

### F. Future Auth Boundary Requirements

Before any real customer, driver, admin, or finance data goes live:

- Admin dashboard `/` must be auth-protected.
- `/customers` must be staff-only.
- Customer portal must show only the authenticated customer's bookings.
- Driver token route must be scoped to a single job and should later expire or be revocable.
- Finance data must be role-restricted.
- Driver payout data must never leak to customers.
- Customer billing data must never leak to drivers.
- Internal admin notes must never leak to customers or drivers.
- Mock QA/dev archive must remain admin-only, collapsed by default, and hidden from public/customer/driver routes.

### G. Short-Notice Booking Rule Data Boundary

The locked 24-hour customer booking rule should later be handled as a customer-submitted booking boundary:

- The rule applies to customer-submitted bookings.
- Less than 24 hours before pickup should become `Admin Review Required`.
- Customer-facing wording should stay simple:

> “This booking is within 24 hours, so our team will review and confirm availability.”

- Admin/dispatcher can later see the operational reason and review queue.
- Customer routes should not expose internal dispatcher/admin logic.
- Do not implement this rule in Stage 4A-294.

### H. Recommended Real Workflow Sequence After This Plan

Recommended sequence after Stage 4A-294:

1. Stage 4A-295 - Read-only checkpoint review after production data/auth boundary plan.
2. Stage 4A-296 - Docs-only Supabase schema/data model plan.
3. Only after explicit approval, implement one smallest safe real workflow, such as:
   - Real customer booking request save with `Admin Review Required` support.
   - Admin-only booking persistence.
   - Customer account linking plan before implementation.

The next stage should still be a read-only review, not immediate real Supabase implementation.

Stage 4A-296 adds the docs-only Supabase schema/data model plan. It keeps all Supabase commands, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior blocked until later approved stages.

Stage 4A-298 adds docs-only Migration / RLS / API planning and keeps real migrations, RLS policies, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior blocked until later approved stages.

Stage 4A-300 adds docs-only test safety guard planning for accidental Supabase/API/runtime calls. It keeps test files, package scripts, app behavior, Supabase files, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior unchanged.

## 9. Parser Safety Plateau

Parser behavior should stay frozen unless there is a specific parser defect or an explicitly approved parser-improvement stage.

Any parser change must:

- Preserve existing real-world fixture behavior unless a business-approved correction is documented.
- Add or update regression tests for the exact parser scenario.
- Keep manual review separate from automatic parser behavior.
- Pass `npm run test:parser`.
- Pass `npm run test:safe`.

Parser learning, AI parser changes, automatic account linking, and production parser automation should not be bundled into unrelated app, dashboard, billing, dispatch, or Supabase work.

## 10. Required Checks For Future Commits

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

## 11. Recommended Next Safe Stage

Recommended next stage: Stage 4A-301 - Read-only checkpoint review after test safety guard plan.

Reason: Stage 4A-300 is a docs-only test safety guard plan. A read-only checkpoint should confirm the guard recommendations, route leakage protections, parser safety boundaries, package-script/test:safe protections, and no-runtime-change guardrails before any test implementation or real persistence workflow is selected.
