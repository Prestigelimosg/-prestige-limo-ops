# Stage 4A-321 - Admin Booking Persistence API/UI Implementation Prompt

Stage 4A-321 is a docs-only implementation prompt. It defines the exact future boundaries for the smallest admin-only booking persistence API/UI save-load prototype after the Supabase booking foundation migration was applied and after no-leak guards were added and reviewed.

This prompt does not approve implementation. It does not change app behavior, parser behavior, browser tests, package scripts, Supabase files, migrations, API routes, auth, database connections, save/load behavior, runtime behavior, or mock workbenches.

## A. Planning-Only Guardrails

Stage 4A-321 does not do any of the following:

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

## B. Future Implementation Objective

Future implementation objective:

Admin-only booking persistence API/UI prototype with strict route/no-leak/network/storage guards.

The future implementation should create the smallest safe admin-only save/load prototype using the already-applied database foundation.

The future implementation must not:

- Expose persistence controls on public, customer, or driver routes.
- Add customer auth.
- Add customer portal persistence.
- Add driver token persistence.
- Add billing, payment, PDF, payout, or notification behavior.
- Add pricing or payout fields.
- Change parser behavior.
- Change public booking behavior unless explicitly approved.

## C. Exact Future File Plan

These files may be considered only in a later explicitly approved implementation stage.

Allowed future files after explicit approval:

- `app/page.tsx`
  - Only for minimal admin dashboard save/load controls.
  - Controls must appear only on `/`.
  - Success/error feedback must appear near the clicked control.
  - Public, customer, and driver route behavior must not change.
- A future narrow internal API route file, for example:
  - `app/api/admin-bookings/route.ts`.
  - `app/api/admin-booking/route.ts`.
  - The exact final path must be selected in the future implementation stage.
  - The route must be internal/admin-only by design.
  - The route must reject forbidden fields.
- A future Supabase server/helper file, only if needed and explicitly approved, for example:
  - `lib/admin-booking-persistence.ts`.
  - `lib/supabase-admin-bookings.ts`.
  - It must not expose browser/public Supabase access.
- Test files in the same future implementation stage:
  - `scripts/test-app-smoke-browser.mjs`.
  - `scripts/test-mobile-usability-browser.mjs`.
  - `scripts/test-booking-ui-browser.mjs` if admin booking UI behavior is touched.

Files that must remain untouched unless separately approved:

- Parser files.
- Parser tests.
- `package.json`.
- Supabase migrations.
- Billing, payment, PDF, invoice, payout, and finance files.
- Notification files.
- Driver workflow, live location, and proof/photo upload files.
- Customer account/auth files.
- Public driver token route behavior except no-leak tests.

This section is a future plan only. It does not authorize touching those files in Stage 4A-321.

## D. Future API Route Acceptance Criteria

The future API route must:

- Be narrow and internal/admin-only.
- Use only approved operational booking fields.
- Reject or ignore forbidden fields.
- Avoid exposing billing, payment, invoice, PDF, payout, PayNow payout, finance, notification, proof/photo, live-location, auth-link, parser-learning, QA/dev archive, or mock workbench data.
- Not be callable from `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, or `/driver-job/[token]`.
- Not return customer price or quoted price.
- Not return driver payout or PayNow payout.
- Not return parser debug internals.
- Not return internal audit details to public, customer, or driver routes.
- Preserve RLS expectations and avoid broad public policies.
- Be covered by browser/network guard tests in the same future implementation stage.

No API route is created in Stage 4A-321.

## E. Future Admin UI Acceptance Criteria

The future admin UI must:

- Appear only on the admin/internal dashboard route `/`.
- Not appear on `/book`.
- Not appear on `/my-bookings`.
- Not appear on `/customers`.
- Not appear on `/driver-job-demo`.
- Not appear on `/driver-job/[token]`.
- Not disturb the collapsed QA/dev archive.
- Not add a new mock workbench.
- Keep production-useful admin content visible.
- Keep controls compact and not giant-card-heavy.
- Show action feedback near clicked controls.
- Avoid horizontal overflow on mobile.
- Avoid exposing pricing, finance, payout, billing, invoice, payment, or PayNow payout fields.
- Avoid exposing parser/debug internals.
- Avoid adding billing, payment, PDF, or notification actions.
- Avoid adding driver workflow, live-location, or proof/photo actions.

## F. Approved Future Data Scope

The future prototype may only persist approved operational booking fields:

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
- Service items for:
  - Child seat.
  - Extra stop.
  - Waiting time.
  - Midnight charge.
- `created_at`.
- `updated_at`.
- Audit create/update record.

Manual Extra Charges, waiting time, extra stop, child seat, and midnight charge must remain internally distinct service items. They must not become pricing automation in the first API/UI implementation.

## G. Forbidden Future API/UI Data

The future implementation must not include:

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

## H. Route Protection Criteria

The future implementation must preserve:

- `/` as the admin/internal dashboard.
- `/book` as public/customer-safe.
- `/my-bookings` as customer-safe and not showing other customers' data.
- `/customers` as internal staff-only despite the name.
- `/driver-job-demo` as demo/local.
- `/driver-job/[token]` as single-job driver-safe only.
- QA/dev archive as admin-only and not persisted as business data.

The future implementation must not leak:

- Customer price on public, customer, or driver routes.
- Billing, payment, PDF, invoice, or accounting details.
- Driver payout or PayNow payout.
- Internal driver notes.
- Internal admin notes.
- Parser/manual review internals.
- Supabase, API, or storage wording on public routes unless explicitly approved and safe.
- Notification, send, or channel wording.
- Private customer/account data.
- Finance, month-end, or closeout data.
- Mock QA/dev archive labels/content.
- Admin booking persistence controls or wording on public, customer, or driver routes.

## I. Short-Notice Booking Criteria

The future implementation must preserve the locked short-notice rule.

Customer-submitted bookings under 24 hours before pickup must become:

`Admin Review Required`

Customer-facing wording must remain:

> "This booking is within 24 hours, so our team will review and confirm availability."

The public/customer app must not directly confirm short-notice bookings.

Admin/dispatcher may later see the operational review reason.

Customers must not see dispatcher/admin internals.

Tests should cover:

- Below 24 hours.
- Exactly 24 hours.
- Above 24 hours.

Only implement this rule in a future approved implementation stage if explicitly included.

## J. RLS And Database Safety Criteria

The future implementation must:

- Respect the already-applied migration foundation.
- Avoid modifying the applied migration file.
- Avoid adding broad public policies.
- Avoid adding customer, driver, or finance policies unless separately approved.
- Keep direct public, customer, and driver table access blocked.
- Use an approved narrow internal access path only after API/auth strategy is approved.
- Avoid requiring `supabase db reset`.
- Avoid requiring `supabase db pull`.
- Avoid requiring `supabase link`.
- Avoid requiring `supabase migration up`.
- Avoid requiring new migrations unless separately approved and reviewed.

## K. Test Requirements For Future Implementation

The future implementation must preserve and/or extend these checks:

- `npm run test:booking-ui-browser`.
- `npm run test:parser`.
- `npm run lint`.
- `npm run build`.
- `npm run test:app-smoke-browser`.
- `npm run test:mobile-usability-browser`.
- `npm run test:safe`.

Future implementation-specific tests must cover:

- Admin-only persistence controls are not visible on `/book`.
- Admin-only persistence controls are not visible on `/my-bookings`.
- Admin-only persistence controls are not visible on `/customers`.
- Admin-only persistence controls are not visible on `/driver-job-demo`.
- Admin-only persistence controls are not visible on `/driver-job/[token]`.
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

## L. Future Implementation Command Sequence

The future implementation stage must run, before commit:

```bash
git status --short
npm run test:booking-ui-browser
npm run test:parser
npm run lint
npm run build
npm run test:app-smoke-browser
npm run test:mobile-usability-browser
npm run test:safe
git diff --check
git status --short
```

If all checks pass, commit only approved changed files.

After commit, run:

```bash
npm run test:safe
git status --short
```

## M. Future Implementation Failure Conditions

The future implementation must stop or fail if:

- Any public/customer/driver route leaks customer price, payout, billing, finance, admin notes, parser internals, or mock archive content.
- Any app file outside approved scope is touched.
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

## N. Recommended Next Stage

Recommended next stage:

Stage 4A-322 - Read-only checkpoint review after exact admin booking persistence API/UI implementation prompt.

Reason: this prompt should be reviewed before any API route, app save/load behavior, auth, billing, payment, notification, driver workflow, or runtime implementation is approved.
