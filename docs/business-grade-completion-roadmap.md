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

Stage 4A-302 adds docs-only first real persistence acceptance criteria in `docs/first-real-persistence-acceptance-criteria.md`. It does not edit app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, or persistence. Real implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-303 read-only checkpoint review.

Stage 4A-304 patches customer/driver price visibility boundaries. Customer-facing pricing stays hidden unless a future quote/payment display stage is approved, and driver routes must stay free of customer price, billing, payout, PayNow payout, and finance details. It does not edit app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, or persistence, and the next safe stage should be Stage 4A-305 read-only checkpoint review.

Stage 4A-308 adds a docs-only first persistence implementation plan with exact future files and no commands in `docs/first-persistence-implementation-plan.md`. It does not edit app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, or persistence. Real implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-309 read-only checkpoint review.

Stage 4A-310 adds a docs-only exact migration/RLS checklist for the admin-only booking persistence prototype in `docs/first-persistence-migration-rls-checklist.md`. It does not edit app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, or persistence. Real implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-311 read-only checkpoint review.

Stage 4A-317 adds a docs-only admin booking persistence API/UI acceptance checklist in `docs/admin-booking-persistence-api-ui-acceptance-checklist.md`. It does not edit app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, or persistence behavior. Real admin save/load API/UI implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-318 read-only checkpoint review.

Stage 4A-321 adds a docs-only exact admin booking persistence API/UI implementation prompt in `docs/admin-booking-persistence-api-ui-implementation-prompt.md`. It does not edit app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, or persistence behavior. Real admin save/load API/UI implementation remains blocked until later approved stages, and the next safe stage should be Stage 4A-322 read-only checkpoint review.

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

Stage 4A-302 adds docs-only first real persistence acceptance criteria and keeps app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior unchanged.

Stage 4A-308 adds a docs-only first persistence implementation plan with exact future file boundaries, allowed/excluded data scope, route protections, short-notice requirements, and future test requirements. It keeps app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior unchanged.

Stage 4A-310 adds a docs-only exact migration/RLS checklist for the selected admin-only booking persistence prototype. It keeps app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior unchanged while real implementation remains blocked until later approved stages.

Stage 4A-317 adds a docs-only admin booking persistence API/UI acceptance checklist after the migration apply was verified. It keeps app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior unchanged while future admin save/load API/UI implementation remains blocked until later approved stages.

Stage 4A-321 adds a docs-only exact admin booking persistence API/UI implementation prompt after the no-leak guards were implemented and reviewed. It keeps app behavior, tests, package scripts, Supabase files, migrations, API routes, auth, save/load behavior, billing, payment, notification, and runtime behavior unchanged while future admin save/load API/UI implementation remains blocked until later approved stages.

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

## 11. Production Data/Auth Readiness Gate

Stage 4A-364 adds the final docs-only readiness gate before any real Supabase, auth, customer, driver, or booking save/load work starts. This gate does not approve migrations, Supabase commands, API routes, production writes, customer auth, driver auth, secure driver tokens, notifications, invoice/payment/PDF behavior, live location, proof/photo upload, parser learning, or runtime app behavior.

### A. Gate Purpose

The next real backend phase may start only after the owner explicitly approves a bounded implementation stage and the stage names the exact data, auth, API, RLS, rollback, route-leak, mobile, parser, and `test:safe` checks it will use.

This readiness gate exists to keep the transition from protected local/mock UI to real data safe. It is not a shortcut around auth, RLS, route isolation, or privacy review.

### B. Must Be True Before Real Data/Auth Work Starts

- Auth and role model must be designed first: admin/owner, dispatcher, finance, customer, driver, public booking requester, and public driver-token visitor.
- Admin dashboard `/` and `/customers` must be staff-only before real internal records are exposed.
- Customer account access must be scoped to the authenticated customer's own safe records before `/my-bookings` reads production data.
- Driver job access must use a single-job secure-token model before `/driver-job/[token]` reads production data.
- RLS policies must exist before any customer, driver, finance, or public route can read or write production tables.
- API routes that write production data must validate input, apply role checks, rely on server-only Supabase credentials, and return only route-safe fields.
- Real booking save/load must start with operational fields only and must keep parser behavior separate from persistence behavior.
- Amend/cancel/driver-assignment changes must have audit trail requirements before production writes.
- Notification boundaries must remain no-send until a later notification stage approves templates, consent/approval flow, delivery logging, retry behavior, and kill switches.
- Invoice/payment/PDF boundaries must remain disabled until a later finance stage approves invoice numbering, payment links, PDF storage, customer visibility, and accounting rollback.

### C. Still Blocked Until Explicit Approval

- Supabase migrations and all Supabase CLI commands.
- Production writes, production reads, RLS policy application, and database grants.
- Real customer auth, driver auth, staff auth, secure customer accounts, and secure driver token behavior.
- Real notification sending through WhatsApp, email, SMS, Telegram, or any other channel.
- Invoice, payment, PDF, Stripe, PayNow payout, driver payout automation, payout comparison, finance posting, and accounting export.
- Live location, route/provider calls, proof/photo upload, file storage, and parser learning.
- Browser storage persistence for operational/admin/customer/driver state.
- Any exposure of service-role secrets, server-only secrets, internal admin notes, parser/debug internals, mock QA/dev archive content, customer pricing on public/customer pages, or payout/finance details on customer/driver pages.

### D. Recommended Implementation Order

1. Auth and role model first: define users, roles, claims/session shape, route ownership, server-only secret handling, and staff/customer/driver access boundaries.
2. Secure driver token model: define single-job scope, token hashing, expiry, revocation, audit fields, and no-leak browser tests before reading real driver jobs.
3. Booking/customer save/load: implement the smallest operational booking/customer persistence path with approved fields only, no billing, no notifications, and no parser behavior changes.
4. Amend/cancel audit records: add staff-reviewed request, change, cancellation, and driver-assignment audit records before these actions mutate production bookings.
5. Notifications later: start as approval-gated outbox/log-only, then add real sending only after consent, template, failure, and kill-switch controls are approved.
6. Invoice/payment/PDF later: start as finance-only draft/review data, then add invoice numbers, PDFs, payment links, payouts, and accounting export in separately approved stages.

### E. First Backend Stage Entry Criteria

The next real backend stage should be a narrow implementation, not another mock or UI polish pass. It must name the exact files, routes, tables, fields, RLS policies, API validation, rollback plan, no-leak tests, and post-commit checks before work starts.

Recommended next real backend phase: auth and role model implementation planning, followed by secure driver token design. Real booking/customer save/load should wait until those access boundaries are explicit.

## 12. Stage 4A-365 - Auth Role Model Implementation Plan

Stage 4A-365 is documentation-only. It turns the readiness gate into a practical first backend phase plan for auth and role boundaries. It does not implement auth, add API routes, add save/load behavior, create migrations, run Supabase commands, add browser storage, send notifications, activate billing/payment/PDF behavior, change parser behavior, or change runtime app behavior.

### A. Future Roles

1. Admin / Dispatcher
   - First real login role to implement.
   - Owns internal operations: booking intake, booking review, operational customer records, driver/vehicle review, assignment review, status review, amend/cancel review, and audit review.
   - Can see operational booking details needed to run dispatch.
   - Should not automatically receive finance powers unless the user also has the future finance/admin billing role.

2. Customer
   - Later login role after admin/dispatcher auth is stable.
   - Can see only their own customer-safe booking requests, confirmed bookings, request status, change/cancellation request status, driver handoff status, and support handoff wording.
   - Must not see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, unrelated customer records, mock QA/dev archive content, or internal audit details.

3. Driver
   - Later secure-token/session model after role rules are clear.
   - Can see only assigned job details needed to perform the trip: pickup date/time, pickup/drop-off, route, passenger-safe instructions, service items needed for the job, and driver-safe status controls.
   - Must not see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, unrelated customer account details, mock QA/dev archive content, or parser/debug internals.

4. Finance / Admin Billing
   - Planned later, not part of the first auth implementation.
   - Can be introduced for invoice/payment/payment-status views, finance review, payout review, and month-end closeout only after finance RLS and route boundaries are approved.
   - Must remain separate from customer and driver surfaces.

### B. Future Auth Sequence

1. Admin/dispatcher login first.
   - Protect `/`, `/customers`, and internal operational API routes before real internal records are exposed.
   - Keep customer and driver routes unchanged until their own auth/token stages.

2. Customer account login later.
   - Scope `/my-bookings` to authenticated customer-owned records only.
   - Keep `/book` public/customer-safe for request intake unless a later stage explicitly changes the flow.

3. Secure driver token/session model after role rules are clear.
   - Keep `/driver-job/[token]` single-job scoped.
   - Use token hash storage, expiry, revocation, usage audit, and driver-safe DTOs before production driver job reads.

4. Finance/admin billing role later.
   - Add only after invoice/payment/PDF and payout boundaries have their own approval.

### C. RLS Readiness Before Real Writes

- Every production table must have an owner role and route-safe visibility rule before it stores real data.
- RLS must be enabled and tested before customer, driver, finance, or public/token access is allowed.
- Admin/dispatcher policies must not silently grant finance-only fields unless the finance role is present.
- Customer policies must scope by customer account membership and never by browser-supplied IDs alone.
- Driver policies must scope by assignment or valid token/session and never expose raw token rows.
- Service-role usage must stay server-only and must never be exposed to browser code, logs, route payloads, or test output.

### D. API Requirements Before Real Writes

- API routes must require the correct auth role, except for explicitly approved public request intake.
- API routes must validate input on the server and reject unknown or unsafe fields.
- API routes must return route-safe DTOs, not raw table rows.
- API routes must keep parser behavior separate from persistence behavior.
- API routes must not create notification, invoice, payment, PDF, payout, live-location, proof/photo, or parser-learning side effects.
- API errors must not expose Supabase internals, service-role secrets, SQL details, parser debug, or internal notes.

### E. Audit Requirements

Before real mutation workflows, audit coverage must be planned for:

- Booking creation: actor, source route/API, created booking reference, customer/account link, source channel, short-notice review status, and safe before/after summary.
- Amend request: requester role, target booking, requested fields, previous customer-safe values, requested values, review status, and staff decision later.
- Cancellation request: requester role, target booking, reason/details, current booking status, review status, and staff decision later.
- Driver assignment: staff actor, booking, driver/vehicle assignment, previous assignment if any, assignment status, and reason/notes with customer/driver redaction.
- Driver status update: driver/token or staff actor, assignment/job, status value, event time, source route, and customer/driver-safe status mapping.

Audit entries must stay internal by default. Customer and driver routes should receive safe status summaries only, never internal before/after values, staff identities, admin notes, finance notes, or parser/debug internals.

### F. Tests Required Before Real Auth/Save/Load

- Route-leak tests for `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]`.
- Role visibility tests for admin/dispatcher, customer, driver, and future finance/admin billing.
- Customer route tests proving no customer price appears unless a future approved quote/payment stage allows it.
- Driver route tests proving no customer price, invoice/payment, payout, PayNow payout, finance notes, internal admin notes, or mock archive content leaks.
- Customer route tests proving no driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock archive content leaks.
- Browser checks proving no service-role or server-only secret reaches the browser.
- Parser regression tests proving auth/save/load work did not change parser behavior.
- Mobile/no-horizontal-overflow tests for customer and driver PWA-first surfaces and admin tablet/phone emergency use.
- `npm run test:safe` before and after every approved implementation commit.

### G. Next Backend Step

The next different backend step should be admin/dispatcher auth boundary implementation planning or an explicitly approved admin/dispatcher auth implementation stage. Secure driver token planning should follow after the staff auth boundary is explicit. Real booking/customer save/load should still wait until admin/dispatcher auth and driver token boundaries are explicit.

## 13. Stage 4A-366 - Admin Dispatcher Auth Boundary Scaffold

Stage 4A-366 adds the first safe admin/dispatcher auth boundary scaffold. It does not add real auth, customer auth, driver auth, migrations, Supabase commands, new API routes, broad persistence, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime customer/driver behavior.

### A. Boundary Added

- `/api/admin-bookings` now resolves access through a shared server-side admin/dispatcher boundary helper.
- Current local/dev admin dashboard behavior remains available.
- The scaffold separates the current local admin surface from the future authenticated admin/dispatcher surface.
- Blocked requests keep safe response wording and do not expose service-role credentials, server-only secrets, session internals, claims, cookies, private tokens, Supabase SQL, or parser/debug details.

### B. Next Backend Step

Recommended next stage: implement the real admin/dispatcher session and role check for existing internal routes, still without customer auth, driver auth, migrations, broad persistence, notifications, or billing/payment behavior.

Reason: the local scaffold now gives the future auth stage a clear replacement point. The next distinct backend boundary is a real staff session/role resolver before production internal records, secure driver token reads, or real booking/customer save/load expand further.

## 14. Stage 4A-367 - Admin Dispatcher Session Role Resolver

Stage 4A-367 extends the admin/dispatcher boundary into a server-side session and role resolver foundation. It still does not add customer auth, driver auth, migrations, Supabase commands, new API routes, broad persistence, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime customer/driver behavior.

### A. Resolver Added

- `/api/admin-bookings` continues to use the shared admin/dispatcher boundary.
- Local/dev admin dashboard access remains the default so current internal operations and tests still run.
- A disabled-by-default server-session-token mode can resolve only `admin` or `dispatcher` roles from non-`NEXT_PUBLIC_` server-side values.
- Customer and driver roles are not accepted by this boundary.
- Blocked public/non-admin access keeps the stable safe response and does not reveal service-role credentials, server-only secrets, session tokens, claims, cookies, Supabase SQL, parser/debug details, or private IDs.
- Future real Supabase staff auth should replace the temporary server-session-token resolver with a server-side session/claims verifier.

### B. Next Backend Step

Recommended next stage: secure driver token model boundary planning for production driver-job access, without implementing driver auth, migrations, production reads/writes, notifications, live-location, proof/photo, or payout behavior.

Reason: the staff/admin server boundary now has a small resolver foundation. The next distinct backend boundary is the driver token model plan before any production driver job reads or driver-facing persistence expands.

## 15. Stage 4A-368 - Secure Driver Token Session Boundary Plan

Stage 4A-368 adds the secure driver token/session boundary plan for future production `/driver-job/[token]` access. It is planning only and does not add real driver auth, customer auth, migrations, Supabase commands, API routes, production reads, production writes, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime behavior.

### A. Boundary Planned

- Future driver tokens must be scoped to one assigned job or assignment.
- Future token records must store token hashes only, never raw token values in browser-readable data.
- Future production access must verify job/assignment id, token hash, expiry, revocation, and allowed status/action server-side.
- Valid future tokens may show only driver-safe pickup/date/time, route/job details, approved passenger/contact instructions, and status controls such as OTW, OTS, POB, and completed.
- Driver tokens must never expose customer price, billing, invoice/payment, driver payout, PayNow payout, payout comparisons, finance notes, internal admin notes, parser/debug internals, unrelated customer rows, other drivers' jobs, private token metadata, service-role/server-only secrets, or mock QA/dev archive content.
- Future driver status changes must be audited before production status writes are approved.
- Current local/demo driver page behavior remains unchanged until a later explicit implementation stage.

### B. Next Backend Step

Recommended next stage: smallest approved booking/customer save/load implementation planning, using the now-explicit admin/dispatcher and driver-token boundaries as prerequisites, still without migrations, Supabase commands, production writes, notifications, billing/payment/PDF, payouts, live location, proof/photo, customer auth, or driver auth unless that stage explicitly approves and scopes them.

Reason: the staff/admin boundary and driver-token boundary are now documented. The next distinct backend step is to define the minimal safe booking/customer persistence plan around approved operational fields, route-safe DTOs, audit needs, rollback, and no-leak tests before any real data work begins.

## 16. Stage 4A-369 - Booking Customer Save-Load Implementation Plan

Stage 4A-369 adds the smallest safe booking/customer save-load implementation plan. It is planning only and does not add real save/load, customer auth, driver auth, migrations, Supabase commands, API routes, production reads, production writes, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime behavior.

### A. Save-Load Path Planned

- Production save/load must start behind the admin/dispatcher auth boundary.
- The first future persistence batch should use safe booking/customer models only: booking reference, customer/account display name, pickup date/time, pickup/drop-off/route summary, service type, approved passenger/contact details, admin/customer-facing safe statuses, and request/change/cancel review statuses.
- Admin/dispatcher create/update comes first after auth, RLS, API validation, audit, rollback, and tests are approved.
- Customer read-only access comes later and must be scoped to own safe booking/request fields.
- Driver token access comes later and must be scoped to assigned job-safe fields only.
- First save/load must block pricing/customer charges, driver payout, PayNow payout, invoice/payment/PDF, finance notes, parser/debug internals, notification delivery records, live location, proof/photo, payout behavior, and mock QA/dev archive content.
- Future audit planning must cover booking created, booking amended, booking cancelled, driver assigned, and driver status updated.

### B. Next Backend Step

Recommended next stage: audit record and rollback planning for booking create/amend/cancel, driver assignment, and driver status updates, still without migrations, Supabase commands, API routes, production writes, customer auth, driver auth, notifications, billing/payment/PDF, payouts, live location, proof/photo, or parser-learning.

Reason: the minimal save-load field boundary is now explicit. The next distinct backend prerequisite is defining audit and rollback shape before any real mutation workflow is approved.

## 17. Stage 4A-370 - Audit Rollback Implementation Plan

Stage 4A-370 adds the audit records and rollback implementation plan before real booking/customer save-load work. It is planning only and does not add real audit tables, rollback APIs, save/load behavior, customer auth, driver auth, migrations, Supabase commands, API routes, production reads, production writes, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime behavior.

### A. Audit And Rollback Boundary Planned

- Future audit records must cover booking created, booking amended, booking cancelled, customer amend request reviewed, customer cancellation request reviewed, driver assigned, driver status updated, and admin/dispatcher override.
- Safe audit fields are limited to actor role, action type, booking reference, before/after safe operational snapshot, reason or review note, timestamp, and source surface.
- First audit storage must block pricing, driver payout, PayNow payout, invoice/payment/PDF, internal finance notes, parser/debug internals, live-location content, proof/photo content, and mock QA/dev archive content.
- Rollback restores safe operational fields only and requires manual admin/dispatcher review for sensitive changes.
- Rollback must not send customer or driver notifications and must not create billing, payment, invoice, PDF, payout, PayNow payout, finance, accounting, proof/photo, live-location, parser-learning, or notification side effects.
- Customer and driver routes must never read raw audit rows, internal before/after values, internal review notes, finance/private fields, parser/debug internals, or mock QA/dev archive content.

### B. Next Backend Step

Recommended next stage: define the exact first booking/customer persistence API and RLS contract checklist, including route DTOs, validation schemas, safe table fields, audit creation expectations, rollback acceptance rules, role/token rejection cases, and no-leak/mobile/parser checks, still without running Supabase commands or creating migrations until that later implementation stage is explicitly approved.

Reason: auth, driver-token, save-load, audit, and rollback boundaries are now planned. The next distinct backend step should turn those plans into an exact implementation contract for the first approved persistence batch before any database or API work begins.

## 18. Stage 4A-371 - First Persistence API RLS Contract Checklist

Stage 4A-371 adds the first booking/customer persistence API and RLS contract checklist before any real migration or API implementation. It is planning/checklist only and does not add real persistence APIs, save/load behavior, customer auth, driver auth, migrations, Supabase commands, production reads, production writes, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime behavior.

### A. Contract Checklist Added

- First future admin-only API contracts are limited to create booking/customer operational snapshot, update safe operational booking fields, and read admin operational records.
- Safe DTO fields are limited to booking reference, customer/account display name, pickup date/time, pickup/drop-off/route summary, service type, passenger/contact safe details, admin/customer-facing safe statuses, and request/change/cancel review statuses.
- Future validation must require approved fields and safe enum/status values while rejecting pricing, payout, PayNow payout, payment, invoice, PDF, billing, finance, parser/debug, live-location, proof/photo, notification, and mock QA/dev archive fields.
- RLS requirements keep admin/dispatcher writes behind server-side role verification, customer own-record reads as a later safe contract, driver token reads as a later assigned-job contract, and service-role keys server-only.
- Future write paths must create audit entries for create/update/amend/cancel, customer request reviews, driver assignment, and driver status update without exposing blocked finance/private fields to customer or driver routes.
- Rollback acceptance is limited to safe operational fields only, with manual admin review, no automatic notification, and no billing/payment/payout reversal.
- Rejection cases cover unauthenticated roles, invalid roles, invalid tokens, wrong customer/driver access, unsafe payloads, and browser-submitted server-only/private fields.
- Required future tests cover no customer price leak, no driver payout leak, no service-role browser leak, no public route admin leak, parser regression, mobile/no-horizontal-overflow, and invalid role/token rejection.

### B. Next Backend Step

Recommended next stage: create the exact migration/RLS implementation draft for the first admin-only booking/customer persistence batch, still as a planning artifact unless explicitly approved to implement. It should name table columns, RLS policy names, server-only API validation contracts, audit linkage, rollback review handling, and the exact tests required before any Supabase command or migration is run.

Reason: the API/RLS contract is now explicit. The next distinct backend step is to turn the contract into an implementation-ready migration/RLS draft before real database work begins.

## 19. Stage 4A-372 - First Persistence Migration API RLS Implementation Draft

Stage 4A-372 consolidates the completed backend planning into one first-persistence migration/API/RLS implementation draft. It is planning/docs only and does not create migration files, run Supabase commands, add API routes, add production reads, add production writes, add real save/load, add customer auth, add driver auth, notifications, billing, invoices, payments, PDFs, payouts, live location, proof/photo, parser-learning, or runtime behavior.

The earlier backend planning stages are complete and should not be repeated as separate new tasks: production data/auth readiness gate, auth role model implementation plan, admin dispatcher auth boundary scaffold, admin dispatcher session role resolver, secure driver token/session boundary plan, booking/customer save-load implementation plan, audit rollback implementation plan, and first persistence API/RLS contract checklist.

### A. Consolidated Draft Added

- First future tables are `customers`, `customer_contacts` if needed, `bookings`, `booking_route_points` if needed, `booking_service_items` if needed, and `audit_logs`.
- Safe fields are limited to booking reference, customer/account display name, customer contact safe details, pickup date/time, pickup/drop-off/route summary, service type, passenger/contact safe details, admin/customer-facing safe statuses, short-notice review status, request/change/cancel review statuses, safe route points/service items, and audit actor/action/timestamp/source/safe before-after snapshot fields.
- First persistence explicitly blocks customer pricing, customer charge, driver payout, PayNow payout, invoice/payment/PDF, billing automation, internal finance notes, parser/debug internals, live location, proof/photo, notification delivery records, and mock archive / mock QA / dev workbench content.
- Intended RLS behavior: admin/dispatcher read/write safe operational fields only after role verification, customer own safe reads later, driver assigned-job token reads later, no public anonymous writes, service-role key server-only, RLS enabled before production use, and policies reviewed before API write activation.
- Intended API behavior: admin-only create operational booking/customer snapshot, admin-only update safe operational booking fields, admin-only read operational records, no customer auth in first batch, no driver auth in first batch, no public write path, unsafe payloads rejected, and invalid role/token rejected.
- Audit and rollback boundaries cover booking created/amended/cancelled, customer amend/cancellation request reviewed, driver assignment, driver status update, and admin/dispatcher override. Rollback restores safe operational fields only and does not trigger customer notification, driver notification, or billing/payment/payout reversal.
- Migration safety checklist blocks `supabase db reset`, destructive table drops, public anonymous writes, broad RLS bypass, service-role browser exposure, unreviewed migrations, unreviewed API-write policies, and production writes without a backup/export plan.
- Test checklist includes parser, lint, build, booking UI browser, driver job browser, app smoke browser, mobile usability browser, `test:safe`, route leak tests, no customer price leak, no driver payout leak, no service-role browser leak, invalid role/token rejection tests, and mobile/no-horizontal-overflow tests.

### B. Duplicate Planning Clarified

The consolidated draft is now the single path for the first real persistence phase. Older sections remain as supporting history and guardrails, but their previous "next step" recommendations are no longer active instructions.

### C. Next Real Migration Step

The next task is ready to be the first real migration implementation, step-by-step, only after William explicitly approves migration work.

Recommended exact next stage: "Stage 4A-373 First real admin-only persistence migration step-by-step." It should create the approved migration file only after re-verifying the clean checkpoint, name the exact table DDL for the first safe tables, define RLS policy names in the migration or companion notes as approved, avoid destructive commands, avoid `supabase db reset`, avoid API routes/runtime behavior, and run the full parser/lint/build/browser/`test:safe` checks before committing.

## 20. Stage 4A-373 - First Admin-Only Persistence Migration File

Stage 4A-373 creates the first admin-only booking/customer persistence migration file:

`supabase/migrations/202606040001_first_admin_booking_customer_persistence.sql`

This stage creates the migration file only. The migration has not been applied, no Supabase command has been run, no API route has been added, and no runtime save/load behavior has been added.

### A. Migration File Created

- Tables included: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, and `audit_logs`.
- Safe first fields cover customer/account display, safe contact details, booking reference, pickup/drop-off route details, service type, passenger/contact safe details, safe review/status fields, source surface, safe route points, safe service items, safe audit actor/action/source/reason fields, and safe before/after audit snapshots.
- RLS is enabled on all six tables.
- No public anonymous policies are created.
- Access remains closed until a later approved server-side API/role stage.
- The migration file includes comments that service-role credentials must stay server-only and never be exposed to browsers.

### B. Blocked Fields Remain Out

The first migration file does not add customer price/charge, driver payout, PayNow payout, invoice/payment/PDF, billing automation, internal finance notes, parser/debug internals, live-location, proof/photo, notification delivery records, or mock archive / mock QA / dev workbench content.

### C. Next Migration Step

Recommended exact next stage: "Stage 4A-374 Review and apply first admin-only persistence migration." This must happen only after William explicitly approves the exact Supabase command. Before applying, review the existing migration history and target database state, then run the approved migration command without destructive reset/pull/link behavior.
