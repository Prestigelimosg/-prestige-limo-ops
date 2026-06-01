# Stage 4A-317 - Admin Booking Persistence API/UI Acceptance Checklist

Stage 4A-317 is a docs-only acceptance checklist. It defines future acceptance criteria for an admin-only booking persistence API/UI prototype after the first Supabase booking foundation migration was applied and reviewed.

This checklist does not approve implementation. It does not change app behavior, parser behavior, browser tests, package scripts, Supabase files, migrations, API routes, auth, database connections, save/load behavior, runtime behavior, or mock workbenches.

## A. Planning-Only Guardrails

Stage 4A-317 does not do any of the following:

- Run Supabase commands.
- Create Supabase migrations.
- Execute Supabase migrations.
- Create API routes.
- Add auth implementation.
- Change database connection behavior.
- Change app behavior.
- Add booking save/load behavior.
- Add billing, payment, PDF, invoice, payout, or notification behavior.
- Activate driver workflow, live location, proof/photo upload, customer account, driver acknowledgement, dispatch automation, or storage behavior.
- Change parser behavior.
- Add parser learning.
- Change package scripts.
- Change `test:safe` membership.
- Add a new mock workbench.
- Change browser tests.
- Change runtime behavior.

## B. Selected Future API/UI Workflow

Selected future workflow:

Admin-only booking persistence API/UI prototype with strict route/no-leak/network/storage guards.

Future implementation should:

- Stay internal/admin-only.
- Use the already-applied booking foundation tables.
- Avoid exposing persisted data to public, customer, or driver routes.
- Avoid adding customer auth.
- Avoid adding driver token persistence.
- Avoid adding billing, payment, PDF, payout, or notification behavior.
- Avoid exposing customer price or driver payout.
- Avoid changing parser behavior.
- Avoid changing customer-facing booking behavior unless explicitly approved.

No API route, admin UI control, save/load behavior, auth, or runtime behavior is created in this stage.

## C. Future API Acceptance Criteria

A future admin-only booking persistence API, if explicitly approved later, must:

- Be narrow and internal/admin-only.
- Use only approved operational booking fields.
- Reject or ignore forbidden fields.
- Avoid exposing billing, payment, invoice, PDF, payout, PayNow payout, finance, notification, proof/photo, live-location, auth-link, parser-learning, QA/dev archive, or mock workbench data.
- Avoid being callable from public, customer, or driver routes unless a later approved auth/API stage explicitly allows it.
- Avoid returning internal audit details to public, customer, or driver routes.
- Avoid returning parser debug internals.
- Avoid returning customer price or quoted price.
- Avoid returning driver payout or PayNow payout.
- Preserve RLS expectations and avoid broad public policies.
- Be covered by browser/network guard tests in the same future implementation stage.

No API route is created in Stage 4A-317.

## D. Future Admin UI Acceptance Criteria

Future admin dashboard save/load UI, if explicitly approved later, must:

- Appear only on the admin/internal dashboard route `/`.
- Not appear on `/book`.
- Not appear on `/my-bookings`.
- Not appear on `/customers`.
- Not appear on `/driver-job-demo`.
- Not appear on `/driver-job/[token]`.
- Not disturb the collapsed QA/dev archive.
- Not add a new mock workbench.
- Keep production-useful admin content visible.
- Show action feedback near clicked controls.
- Avoid horizontal overflow on mobile.
- Avoid exposing pricing, finance, payout, billing, invoice, payment, or PayNow payout fields.
- Avoid exposing parser/debug internals.
- Avoid adding billing, payment, PDF, or notification actions.
- Avoid adding driver workflow, live-location, or proof/photo actions.

## E. Approved Future Data Scope

Future API/UI implementation may only use approved operational booking fields, such as:

- `booking_reference`.
- `source_channel`.
- `customer_id` where available.
- `pickup_datetime`.
- `pickup_location`.
- `dropoff_location`.
- `route_type`.
- `customer_display_name`.
- `contact_phone`.
- `contact_email`.
- `pax_count`.
- `luggage_count`.
- `vehicle_type_or_category`.
- `customer_facing_status`.
- `admin_internal_status`.
- `short_notice_review_status`.
- `parser_source_reference`.
- Route points/stops.
- Service items for child seat, extra stop, waiting time, and midnight charge.
- `created_at`.
- `updated_at`.
- Audit create/update record.

Manual Extra Charges, waiting time, extra stop, child seat, and midnight charge must remain internally distinct service items. They must not become pricing automation in the first API/UI implementation.

## F. Forbidden Future API/UI Data

Future API/UI implementation must not include:

- Customer price.
- Quoted price.
- Fare.
- Amount due.
- Billing total.
- Invoice amount.
- Invoice or statement data.
- Payment link.
- PDF output.
- Driver payout.
- PayNow payout.
- PayNow/private driver finance details.
- Payout comparison.
- Finance closeout.
- Notification send logs.
- WhatsApp, email, SMS, or Telegram send state.
- Proof/photo uploads.
- Live location.
- Customer account auth links.
- Parser learning/rule changes.
- QA/dev archive state/content.
- Mock workbench data.
- Public driver token persistence unless separately approved.
- Real driver acknowledgement workflow unless separately approved.

## G. Route Protection Acceptance Criteria

Future API/UI implementation must preserve these route boundaries:

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

## H. Short-Notice Booking API/UI Criteria

Future API/UI implementation must support the locked short-notice booking rule only when explicitly approved:

- Customer-submitted bookings under 24 hours before pickup become `Admin Review Required`.
- Customer-facing wording remains: "This booking is within 24 hours, so our team will review and confirm availability."
- The public/customer app must not directly confirm short-notice bookings.
- Admin/dispatcher may later see the operational review reason.
- Customers must not see dispatcher/admin internals.
- Tests should cover below 24 hours, exactly 24 hours, and above 24 hours when implemented.

Stage 4A-317 does not implement this rule.

## I. RLS And Database Safety Criteria

Future API/UI implementation must:

- Respect the applied migration foundation.
- Avoid adding broad public policies.
- Avoid adding customer, driver, or finance policies unless separately approved.
- Keep direct public, customer, and driver table access blocked.
- Use an approved narrow internal access path only after API/auth strategy is approved.
- Avoid requiring `supabase db reset`, `supabase db pull`, `supabase link`, or `supabase migration up`.
- Avoid modifying the applied migration file.
- Avoid requiring new migrations unless separately approved and reviewed.

## J. Test Requirements For Future API/UI Implementation

Future implementation must preserve and/or extend these checks:

- `npm run test:booking-ui-browser`.
- `npm run test:parser`.
- `npm run lint`.
- `npm run build`.
- `npm run test:app-smoke-browser`.
- `npm run test:mobile-usability-browser`.
- `npm run test:safe`.

Future implementation-specific tests should cover:

- Admin-only API/UI controls are not visible on public/customer/driver routes.
- No customer price leakage on `/book` or `/my-bookings`.
- No driver route customer-price leakage.
- No billing, invoice, payment, payout, or PayNow payout leakage.
- No Supabase/API/network calls outside the approved scope.
- No browser storage persistence outside the approved scope.
- Manual Extra Charges remain local or approved internal-only behavior only.
- Manual Extra Charges do not trigger unrelated traveler/customer lookup attribution issues.
- Short-notice `Admin Review Required` behavior if implemented.
- Manual Extra Charges remain internally distinct.
- Midnight charge remains internally distinct from waiting time and extra stops.
- No mobile horizontal overflow.
- Parser suite still passes.
- `test:safe` membership is not weakened.

## K. Future Implementation Failure Conditions

Future API/UI implementation must stop or fail if:

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

## L. Future Staged Implementation Sequence

Recommended next stages:

1. Stage 4A-318 - Read-only checkpoint review after admin booking persistence API/UI acceptance checklist.
2. Stage 4A-319 - Test-only admin booking persistence API/UI no-leak guard preparation, if needed.
3. Stage 4A-320 - Docs-only exact API route and admin UI implementation prompt.
4. Only after explicit approval, implement the smallest admin-only API/UI save/load prototype.

The next stage should be a read-only review, not API/UI implementation.
