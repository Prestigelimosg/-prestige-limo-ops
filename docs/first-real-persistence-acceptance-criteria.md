# Stage 4A-302 - First Real Persistence Acceptance Criteria

Stage 4A-302 is documentation-only. It defines acceptance criteria for a future first real persistence workflow, but it does not add or modify tests, package scripts, app behavior, API routes, Supabase files, migrations, auth, database connections, save/load behavior, or persistence.

## A. Planning-Only Guardrails

- No app behavior changes in this stage.
- No test files are edited in this stage.
- No package scripts are edited in this stage.
- No Supabase commands are run in this stage.
- No Supabase migrations are created in this stage.
- No API routes are added in this stage.
- No auth implementation is added in this stage.
- No database connection changes are made in this stage.
- No save/load behavior is added in this stage.
- No billing, invoice, PDF, payment, payout, or notification behavior is added in this stage.
- No parser behavior changes are made.
- No parser learning is added.
- No runtime behavior changes are made.
- No new mock workbench is added.

Any future persistence implementation must be separately approved, scoped to one bounded workflow, and followed by the full required check sequence plus post-commit `test:safe`.

## B. Recommended First Persistence Candidate

Recommended first real persistence workflow:

1. Admin-only booking persistence prototype with strict route/no-leak/network/storage guards.
2. Customer booking request save with `Admin Review Required` short-notice support.
3. Customer account linking only after auth plan is approved.

Candidate 1 is the safest first step because:

- It can remain behind the internal admin dashboard.
- It avoids public customer auth complexity.
- It avoids driver token persistence complexity.
- It avoids billing, payment, PDF, payout, notification, and finance risk.
- It can be protected by existing admin, public, customer, and driver route tests.
- It can use a small subset of booking data.
- It can leave customer-facing behavior unchanged.

This is a recommendation only. It is not an implementation approval.

## C. First Persistence Scope Boundaries

The smallest acceptable future first-persistence scope should save only the minimum operational booking data needed for an admin-only prototype.

Allowed future first-persistence data candidates, only after approval:

- booking reference.
- source/channel.
- pickup date/time.
- pickup location.
- dropoff location.
- route points/stops.
- passenger/customer display name.
- contact phone/email when provided.
- pax/luggage.
- vehicle type/category.
- child seat, extra stops, waiting time, and midnight charge fields as internally distinct service items.
- customer-facing status.
- admin internal status.
- short-notice review status.
- created/updated timestamps.
- audit record for create/update.

Data excluded from first persistence:

- customer price, quoted price, or customer-facing pricing amounts unless a future approved quote/payment stage explicitly includes them.
- billing records.
- invoices/statements.
- payment links.
- PDF outputs.
- driver payout records.
- PayNow payout details and private driver finance details.
- notification send logs.
- proof/photo uploads.
- live location.
- customer account auth links.
- parser learning/rule changes.
- QA/dev archive state/content.
- mock workbench data.
- finance/month-end closeout records.
- real driver acknowledgement workflow unless separately approved.

## D. Short-Notice Booking Acceptance Criteria

Future implementation of the locked 24-hour rule must satisfy:

- Customer-submitted bookings under 24 hours before pickup become `Admin Review Required`.
- Customer-facing wording remains: "This booking is within 24 hours, so our team will review and confirm availability."
- The public/customer app must not directly confirm short-notice bookings.
- Admin/dispatcher can later see the operational review reason.
- Customer routes must not expose dispatcher/admin internal logic.
- Future implementation must include tests for below 24 hours, exactly 24 hours, and above 24 hours if that rule is implemented.

This stage does not implement the rule.

## E. Customer / Driver Price Visibility Acceptance Criteria

Future first-persistence implementation must keep pricing and finance private by default:

- Customer-facing routes must not show price or pricing amounts unless a future approved customer-facing quote/payment stage explicitly allows it.
- Customer portal routes must not show prices by default.
- Public booking request routes must not show prices by default.
- Drivers must not see customer price.
- Drivers must not see customer billing, invoice/payment details, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive content.
- Customers must not see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive content.
- Pricing and finance must remain admin/internal or finance-role only by default.
- Quoted customer price is excluded from first real persistence unless a future approved quote/payment stage explicitly includes it.
- Driver payout and PayNow payout details are excluded from first real persistence.
- The public driver token route must remain job-card-safe only and must not expose pricing, payout, billing, finance, PayNow payout, or internal admin details.
- Any existing PayNow display on public driver, demo, or token routes is a future watch item to review in a separately approved test/code stage. This docs-only stage does not change that behavior.

## F. Route And Data Leakage Acceptance Criteria

Future first-persistence implementation must preserve these route boundaries:

- `/` remains the admin/internal dashboard.
- `/book` remains public/customer-safe.
- `/my-bookings` must not show other customers' data.
- `/customers` remains internal staff-only despite the name.
- `/driver-job-demo` remains demo/local.
- `/driver-job/[token]` remains single-job driver-safe only.
- QA/dev archive remains admin-only and not persisted as business data.

Future first persistence must not leak:

- admin dashboard panels.
- QA/dev archive labels/content.
- mock workbench labels/content.
- customer-facing pricing amounts unless a future approved quote/payment stage explicitly allows them.
- customer price on driver routes.
- billing, payment, PDF, invoice, and accounting details.
- driver payout or PayNow payout.
- internal driver notes.
- internal admin notes.
- parser/manual review internals.
- Supabase, API, or storage wording on public routes unless explicitly approved and safe.
- notification, send, or message-channel wording.
- private customer/account data.
- finance, month-end, receivables, or closeout data.

## G. Supabase/API/Network Acceptance Criteria

Future implementation must satisfy:

- Supabase use must be explicitly approved in that future stage.
- Migration must be separately approved before commands run.
- API routes must be separately approved before they are added.
- Public/customer/driver routes must not make unapproved Supabase/API calls.
- No accidental `/rest/v1`, storage bucket, `fetch`, XHR, `sendBeacon`, or WebSocket calls should appear outside approved scope.
- Browser tests must guard against unapproved network calls.
- Any API route must be narrow, named, documented, and route-protected.
- Any public/customer API must never expose admin internals, payout, billing, parser debug details, or mock archive content.
- Any driver token API must stay single-job scoped and driver-safe.

## H. Browser Storage Acceptance Criteria

Future implementation must not use browser persistence unless explicitly approved:

- no `localStorage`.
- no `sessionStorage`.
- no cookies.
- no IndexedDB.
- no Cache Storage.
- no persisted QA/dev archive state.
- no persisted mock workbench state.
- no persisted booking draft/save state unless approved.
- no persisted customer account/auth links unless an auth stage is approved.

If future UI state is needed, it should remain local React state unless explicitly approved.

## I. Parser Acceptance Criteria

Parser boundaries for first persistence:

- Parser behavior must not change during first persistence implementation unless the stage explicitly includes parser work.
- Parser output may be saved only as approved source/reference fields, not as parser learning.
- Parser learning/rule changes remain blocked.
- Existing parser regression suite must pass before and after implementation.
- Public email/company inference protections must remain intact.
- Prestige Transport own-company protections must remain intact.
- Phone/contact separation must remain intact.
- Route/address parsing must remain intact.
- Date/time parsing must remain intact.
- Passenger, booker, and company separation must remain intact.
- Vehicle parsing protections must remain intact.

## J. Audit Acceptance Criteria

Future first persistence should include an audit approach only inside the approved scope:

- who created/updated a record, once auth exists.
- what changed.
- when it changed.
- source route/tool.
- before/after values for sensitive fields later.
- audit details must not leak to customers or drivers.
- audit log persistence requires explicit approved schema/API implementation.

If auth does not exist yet, a future prototype may need a temporary internal/system actor label, but only if that stage explicitly approves it.

## K. Test Acceptance Criteria Before Implementation

These checks must continue to pass before any approved first-persistence implementation:

- `npm run test:booking-ui-browser`
- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:app-smoke-browser`
- `npm run test:mobile-usability-browser`
- `npm run test:safe`

Future implementation-specific tests should cover:

- admin-only persistence controls are not visible on public/customer/driver routes.
- no public route admin/internal leakage.
- no customer-facing pricing amount leakage on `/book`.
- no customer-facing pricing amount leakage on `/my-bookings` unless future quote/payment display is approved.
- no driver route customer-price leakage.
- no driver route billing, invoice, payment, payout, or PayNow payout leakage.
- no customer route driver payout, PayNow payout, or admin finance leakage.
- no public driver token route PayNow payout detail leakage.
- pricing and finance remain admin/internal or finance-role only.
- no driver token billing, payout, PayNow payout, customer account, or internal-note leakage.
- no unapproved Supabase/API/network calls outside scope.
- no browser storage persistence outside scope.
- short-notice booking behavior if implemented.
- manual Extra Charges remain internally distinct.
- midnight charge remains internally distinct from waiting time and extra stops.
- no mobile horizontal overflow.
- parser suite still passes.
- `test:safe` membership is not weakened.

## L. Failure Criteria For Future Implementation

Future first real persistence implementation should fail if:

- Any public/customer/driver route exposes admin, mock, finance, payout, or internal data.
- Any customer-facing route shows pricing amounts without an approved quote/payment stage.
- Any driver route shows customer price.
- Any driver route shows billing, invoice, payment, payout, or PayNow payout details.
- Any customer route shows driver payout, PayNow payout, admin finance, or internal notes.
- Any new mock workbench is added.
- Any parser behavior changes outside an approved parser stage.
- Any Supabase command, migration, or API route appears without explicit approval.
- Any browser storage persistence appears before approval.
- Any billing, payment, PDF, payout, accounting, or notification behavior appears before approval.
- Any driver payout or PayNow payout leaks to customers.
- Any customer billing leaks to drivers.
- Any short-notice customer booking is directly confirmed instead of going to `Admin Review Required`.
- Any `test:safe` membership is weakened.
- Any protected check fails.
- Working tree is not clean after the stage.

## M. Future Implementation Sequence

Recommended future stages after this docs plan:

1. Stage 4A-303 - Read-only checkpoint review after first real persistence acceptance criteria.
2. Stage 4A-304 - Docs-only customer/driver price visibility boundary patch.
3. Stage 4A-305 - Read-only checkpoint review after customer/driver price visibility boundary patch.
4. Stage 4A-306 - Test-only guard implementation for no accidental Supabase/API/runtime calls.
5. Stage 4A-307 - Read-only checkpoint review after test-only guards.
6. Stage 4A-308 - Docs-only first persistence implementation plan with exact files and no commands.
7. Only after explicit approval, implement the smallest real persistence workflow.

The next stage should be read-only review, not implementation.
