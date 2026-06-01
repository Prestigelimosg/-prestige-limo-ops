# Stage 4A-308 - First Persistence Implementation Plan

Stage 4A-308 is documentation-only. It plans the future first real persistence implementation with exact file boundaries and no commands, but it does not edit app behavior, parser behavior, browser tests, package scripts, Supabase files, migrations, API routes, auth, database connections, save/load behavior, or runtime behavior.

This plan does not approve implementation. Any future persistence work must be separately approved, scoped to one bounded implementation batch, protected by route/no-leak/network/storage tests, followed by one read-only checkpoint review, and verified with the full required check sequence plus post-commit `test:safe`.

## A. Planning-Only Guardrails

Stage 4A-308 does not do any of the following:

- Run Supabase commands.
- Create Supabase migrations.
- Add API routes.
- Add auth implementation.
- Change app behavior.
- Add booking save/load behavior.
- Add billing, invoice, PDF, payment, payout, or notification behavior.
- Activate driver workflow, live location, proof/photo upload, customer update, driver acknowledgement, dispatch automation, or storage behavior.
- Change parser behavior.
- Add parser learning.
- Change package scripts.
- Change `test:safe` membership.
- Add a new mock workbench.
- Change browser tests.
- Change runtime behavior.

## B. Selected First Persistence Workflow

Selected future first persistence workflow:

Admin-only booking persistence prototype with strict route/no-leak/network/storage guards.

This is the safest first real persistence candidate because:

- It can remain behind the internal admin dashboard.
- It avoids public customer account and auth complexity.
- It avoids driver token persistence complexity.
- It avoids billing, payment, PDF, payout, notification, and finance risk.
- It avoids customer-facing price display.
- It can use a narrow booking data subset.
- It can be protected by the existing and newly added browser guards.
- It leaves `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]` unchanged unless a future stage explicitly approves otherwise.

This selection is a planning recommendation only. It does not authorize implementation in this stage.

## C. Exact Future Implementation File Plan

The following files and categories may be considered only in a later explicitly approved implementation stage. They must not be edited in Stage 4A-308.

Allowed future app/runtime files, only after approval:

- `app/page.tsx`, only if the admin dashboard needs save/load UI controls.
- A future narrow internal API route file, only if API routes are explicitly approved for that stage.
- A future Supabase client/server helper file, only if Supabase connection work is explicitly approved.
- A future migration file, only after a reviewed migration/RLS checklist and explicit approval.

Allowed future test files, only in the same approved implementation stage:

- `scripts/test-app-smoke-browser.mjs`.
- `scripts/test-mobile-usability-browser.mjs`.
- `scripts/test-booking-ui-browser.mjs`, only if booking UI persistence controls are touched.
- `package.json`, only if an explicit test script change is separately approved. The default should be no package script changes and no `test:safe` membership changes.

Files and areas that should remain untouched in the first persistence implementation unless separately approved:

- Parser files.
- Parser tests.
- Billing, payment, PDF, invoice, payout, and accounting files.
- Notification files.
- Driver workflow, live location, and proof/photo upload files.
- Customer account and auth files.
- Public driver token route behavior, except for no-leak test coverage if the approved stage requires it.
- Docs, unless the approved implementation stage explicitly includes a tiny implementation note.

This section is a future file plan only. It does not authorize touching any of these files now.

## D. Future Data Scope

Allowed future first-persistence data candidates, only after approval:

- Booking reference.
- Source/channel.
- Pickup date/time.
- Pickup location.
- Dropoff location.
- Route points/stops.
- Passenger/customer display name.
- Contact phone/email when provided.
- Pax/luggage.
- Vehicle type/category.
- Child seat, extra stops, waiting time, and midnight charge fields as internally distinct service items.
- Customer-facing status.
- Admin internal status.
- Short-notice review status.
- Created/updated timestamps.
- Audit create/update record.

Excluded from first persistence:

- Customer price or quoted price unless a future approved quote/payment stage explicitly allows it.
- Billing records.
- Invoices/statements.
- Payment links.
- PDF outputs.
- Driver payout records.
- PayNow payout details.
- PayNow/private driver finance details.
- Notification send logs.
- Proof/photo uploads.
- Live location.
- Customer account auth links.
- Parser learning/rule changes.
- QA/dev archive state/content.
- Mock workbench data.
- Finance/month-end closeout records.
- Real driver acknowledgement workflow.
- Public driver token persistence unless separately approved.

## E. Future Supabase/Migration/API Sequence

Any real implementation later must be split, reviewed, and explicitly approved. The safest sequence is:

1. Create a docs-only exact migration/RLS checklist for the selected admin-only booking persistence prototype.
2. Run a read-only checkpoint review of that checklist.
3. Create a migration only after explicit approval.
4. Review the migration before running any Supabase command.
5. Add a narrow API route only after explicit approval.
6. Add admin-only UI controls only after the API/data path is approved.
7. Add or update tests in the same approved implementation stage.
8. Run the full required checks before commit and post-commit `test:safe`.

Stage 4A-308 does not create the checklist, migration, API route, UI controls, tests, Supabase command, or persistence behavior.

## F. Route Protection Requirements

Future implementation must preserve these route boundaries:

- `/` remains the admin/internal dashboard.
- `/book` remains public/customer-safe.
- `/my-bookings` remains customer-safe and must not show other customers' data.
- `/customers` remains internal staff-only despite the name.
- `/driver-job-demo` remains demo/local.
- `/driver-job/[token]` remains single-job driver-safe only.
- QA/dev archive remains admin-only and must not be persisted as business data.

Future implementation must not leak:

- Customer price on public, customer, or driver routes.
- Billing, payment, PDF, invoice, or accounting details.
- Driver payout or PayNow payout.
- Internal driver notes.
- Internal admin notes.
- Parser/manual review internals.
- Supabase, API, or storage wording on public routes unless explicitly approved and safe.
- Notification, send, or message-channel wording.
- Private customer/account data.
- Finance, month-end, or closeout data.
- Mock QA/dev archive labels/content.

## G. Short-Notice Booking Requirement

Future first persistence implementation must plan for the locked short-notice booking rule:

- Customer-submitted bookings under 24 hours before pickup become `Admin Review Required`.
- Customer-facing wording remains: "This booking is within 24 hours, so our team will review and confirm availability."
- The public/customer app must not directly confirm short-notice bookings.
- Admin/dispatcher may later see the operational review reason.
- Customers must not see dispatcher/admin internals.
- Tests should cover below 24 hours, exactly 24 hours, and above 24 hours when this rule is implemented.

Stage 4A-308 does not implement this rule.

## H. Future Test Requirements

Future implementation must preserve and/or extend these checks:

- `npm run test:booking-ui-browser`.
- `npm run test:parser`.
- `npm run lint`.
- `npm run build`.
- `npm run test:app-smoke-browser`.
- `npm run test:mobile-usability-browser`.
- `npm run test:safe`.

Future implementation-specific tests should cover:

- Admin-only persistence controls are not visible on public/customer/driver routes.
- No customer price leakage on `/book` or `/my-bookings`.
- No driver route customer-price leakage.
- No billing, invoice, payment, payout, or PayNow payout leakage.
- No Supabase/API/network calls outside the approved scope.
- No browser storage persistence outside the approved scope.
- Short-notice `Admin Review Required` behavior if implemented.
- Manual Extra Charges remain internally distinct.
- Midnight charge remains internally distinct from waiting time and extra stops.
- No mobile horizontal overflow.
- Parser suite still passes.
- `test:safe` membership is not weakened.

## I. Failure Conditions For Future Implementation

Future first persistence implementation must stop or fail if:

- Any public/customer/driver route leaks customer price, payout, billing, finance, admin notes, parser internals, or mock archive content.
- Any app file outside the approved scope is touched.
- Parser behavior changes outside an approved parser stage.
- A Supabase command, migration, or API route appears without explicit approval.
- Browser storage persistence appears before approval.
- Billing, payment, PDF, payout, or notification behavior appears before approval.
- Driver payout or PayNow payout leaks to customers.
- Customer billing leaks to drivers.
- A short-notice customer booking is directly confirmed instead of becoming `Admin Review Required`.
- `test:safe` membership is weakened.
- A protected check fails.
- The working tree is not clean after the stage.

## J. Recommended Next Stage

Recommended next stage:

Stage 4A-309 - Read-only checkpoint review after first persistence implementation plan.

Reason: this exact future implementation plan should be reviewed before any migration checklist, Supabase command, API route, auth, save/load implementation, or runtime behavior is activated.
