# Stage 4A-300 - Supabase API Runtime Test Guard Plan

Stage 4A-300 is documentation-only. It plans future test safety guards for accidental Supabase, API, browser storage, billing, payment, PDF, notification, parser, and route-leakage behavior, but it does not add or modify tests, package scripts, app behavior, API routes, Supabase files, migrations, auth, database connections, save/load behavior, or persistence.

## A. Planning-Only Guardrails

- No test files are edited in this stage.
- No package scripts are edited in this stage.
- No Supabase commands are run in this stage.
- No Supabase migrations are created in this stage.
- No API routes are added in this stage.
- No auth implementation is added in this stage.
- No database connection changes are made in this stage.
- No booking save/load behavior is added in this stage.
- No billing, invoice, PDF, payment, payout, or notification behavior is added in this stage.
- No live location, maps, flight API, route/geocoding API, proof/photo upload, or storage behavior is added in this stage.
- No parser behavior changes are made.
- No parser learning is added.
- No runtime behavior changes are made.
- No new mock workbench is added.

Any future test guard implementation must be separately approved, bounded, and followed by the full required check sequence and post-commit `test:safe`.

## B. Existing Safety Coverage To Preserve

The current safety chain must keep passing:

- `npm run test:booking-ui-browser`
  - Protects customer booking UI behavior, booking form visibility, route-specific booking surfaces, and customer-safe wording.
- `npm run test:parser`
  - Protects parser regressions, field extraction, date/time parsing, route parsing, contact separation, company/booker/passenger separation, own-company handling, and parser safety fixtures.
- `npm run lint`
  - Protects static code quality and catches invalid code before build or browser checks.
- `npm run build`
  - Protects production compilation and route rendering.
- `npm run test:app-smoke-browser`
  - Protects admin, public, customer, and driver route boundaries; collapsed QA/dev archive behavior; driver token route safety; and no accidental integration leakage visible in the browser.
- `npm run test:mobile-usability-browser`
  - Protects mobile layout, touch usability, no-horizontal-overflow behavior, route leakage boundaries, and collapsed archive behavior on smaller screens.
- `npm run test:safe`
  - Combines the project safety chain and must continue to include the booking UI, parser, lint, build, app smoke, mobile usability, and related safety checks already approved for the app.

Future stages must not weaken, rename, bypass, or remove these checks without a separate explicit approval stage.

## C. Accidental Supabase/API Runtime Guard Plan

Future approved test-only stages should add guards that fail when unapproved runtime integration appears, especially on public/customer/driver routes.

Guard coverage should detect accidental:

- Supabase REST calls.
- Supabase client initialization on public, customer, or driver routes before approval.
- `/rest/v1` network calls.
- Supabase storage bucket calls.
- `fetch` calls to unapproved internal APIs.
- XHR calls.
- `navigator.sendBeacon` calls.
- WebSocket connections.
- API route creation or API route use before approval.

These guards should be added only in a future approved test-implementation stage. This stage does not add the guards or change runtime behavior.

## D. Browser Storage Persistence Guard Plan

Future browser tests should detect accidental persistence through:

- `localStorage`.
- `sessionStorage`.
- cookies.
- IndexedDB.
- Cache Storage.
- persisted QA/dev archive state.
- persisted mock workbench state.
- persisted booking save/load state before approval.
- persisted customer account or auth links before approval.

UI-only mock state should remain local React state unless a future approved stage explicitly authorizes persistence. The collapsed QA/dev archive should not persist open/closed state as production data.

## E. Billing/Payment/PDF/Notification Guard Plan

Future tests should detect accidental finance or communication behavior, including:

- invoice generation.
- PDF generation.
- payment link creation.
- billing record creation.
- payout record creation.
- accounting export.
- WhatsApp, email, SMS, or Telegram sends.
- notification outbox writes.
- message-channel delivery status.
- `payment sent`, `quote sent`, or similar send-complete wording on public/customer/driver routes.

Billing, payment, PDF, payout, accounting, and notification behavior remains blocked until explicit future approved stages.

## F. Route Leakage Guard Plan

Future route leakage tests must preserve no internal/admin leakage on:

- `/book`
- `/my-bookings`
- `/customers`
- `/driver-job-demo`
- `/driver-job/[token]`
- the public driver token/demo route covered by existing tests

The protected leakage categories are:

- admin dashboard panels.
- QA/dev archive labels and content.
- mock workbench labels.
- billing, payment, PDF, invoice, and accounting details.
- driver payout and PayNow details.
- internal driver notes.
- internal admin notes.
- parser/manual review internals.
- Supabase, API, and storage wording.
- notification, send, and message-channel wording.
- private customer/account data.
- finance, month-end, receivables, and closeout data.

`/customers` remains an internal staff route despite its customer-facing name, but it must still avoid admin dashboard mock sprawl, driver-demo content, and public-route leakage patterns.

## G. Driver Token Route Guard Plan

Future `/driver-job/[token]` guards should require:

- single-job scoped access only.
- job-card-safe information only.
- no billing data.
- no payout data.
- no PayNow details.
- no customer account internals.
- no admin notes.
- no finance data.
- no mock archive content.
- no public exposure of internal API details.
- no live location or proof upload behavior unless a future approved driver workflow stage adds and protects it.

Driver token views must stay narrow: enough information to perform the assigned trip, not a path to admin, customer account, billing, payout, or QA/dev content.

## H. Customer Booking And Short-Notice Guard Plan

Future tests for the locked 24-hour customer short-notice rule should confirm:

- Customer-submitted bookings under 24 hours before pickup become `Admin Review Required`.
- Customer-facing wording remains: "This booking is within 24 hours, so our team will review and confirm availability."
- The public/customer app does not directly confirm short-notice bookings.
- Customer routes do not expose dispatcher/admin internal logic.
- Admin/dispatcher review context is kept internal.

This stage does not implement the short-notice rule. The rule remains planning-only until a future approved implementation stage.

## I. Parser Safety Guard Plan

Parser behavior must remain frozen during non-parser stages.

Future guard rules:

- Parser regression tests must pass before and after any approved implementation.
- Parser learning and parser rule changes remain blocked unless a dedicated parser stage approves them.
- Public email/company inference protections must remain intact.
- Prestige Transport own-company protections must remain intact.
- Phone/contact separation must remain intact.
- Route/address parsing must remain intact.
- Date/time parsing must remain intact.
- Passenger, booker, and company separation must remain intact.
- Vehicle parsing protections must remain intact.
- Any parser change requires dedicated fixtures, review, and explicit approval.

Persistence, dashboard, billing, dispatch, route, and notification work must not smuggle parser behavior changes into unrelated stages.

## J. Package Script And test:safe Guard Plan

Future package-script protections:

- Do not weaken `test:safe`.
- Do not remove existing browser, parser, mobile, build, or lint checks from `test:safe`.
- Do not silently rename safety scripts.
- Do not bypass safety scripts with narrower substitutes.
- Any package-script change must be explicit, justified, reviewed, and separately approved.
- Commit-stage required checks and post-commit `npm run test:safe` should remain required when committing.

The safety chain should become stricter only through approved stages, not looser by convenience.

## K. First Future Test-Implementation Candidates

Recommended future test-only implementation candidates, ranked by safety:

1. Add explicit no-unapproved-Supabase/API/network guard coverage to app smoke/browser tests.
2. Add public/customer/driver route storage-persistence guard coverage.
3. Add stronger driver token no-leakage guard coverage before any token data persistence.
4. Add short-notice booking behavior tests only when the implementation stage is approved.
5. Add billing/payment/PDF/notification guards before any finance or notification implementation.

These candidates are not implemented in Stage 4A-300.

## L. Failure Criteria For Future Real Implementation

Future implementation should fail if:

- Any public/customer/driver route makes unapproved Supabase or API calls.
- Any public/customer/driver route exposes admin, mock, finance, payout, or internal data.
- Any browser storage persistence appears before approval.
- Any billing, payment, PDF, payout, accounting, or notification behavior appears before approval.
- Any parser behavior changes outside a parser stage.
- Any `test:safe` membership is weakened.
- Any Supabase command, migration, or API route appears without explicit approval.
- Any short-notice customer booking is directly confirmed instead of going to `Admin Review Required`.
- Any new mock workbench is added.

## M. Recommended Future Sequence

Recommended future stages after this plan:

1. Stage 4A-301 - Read-only checkpoint review after test safety guard plan.
2. Stage 4A-302 - Docs-only first real persistence acceptance criteria.
3. Stage 4A-303 - Read-only checkpoint review after first real persistence acceptance criteria.
4. Stage 4A-304 - Test-only guard implementation for no accidental Supabase/API/runtime calls.
5. Stage 4A-305 - Read-only checkpoint review after test-only guards.
6. Stage 4A-306 - Docs-only first persistence implementation plan with exact files and no commands.
7. Only after explicit approval, implement the smallest real persistence workflow.

Stage 4A-302 defines acceptance criteria before any first real persistence implementation. It does not change schema, migrations, API routes, tests, package scripts, runtime behavior, or persistence.

First real workflow candidates, ranked by safety:

1. Admin-only booking persistence prototype with strict route, no-leak, network, and storage guards.
2. Customer booking request save with `Admin Review Required` short-notice support.
3. Customer account linking only after auth plan is approved.

The next stage should be read-only review, not implementation.
