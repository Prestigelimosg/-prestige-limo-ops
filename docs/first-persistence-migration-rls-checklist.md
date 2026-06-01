# Stage 4A-310 - First Persistence Migration/RLS Checklist

Stage 4A-310 is planning/checklist only. It prepares the future migration and Row Level Security review for the selected admin-only booking persistence prototype, but it does not create migrations, run Supabase commands, add API routes, add auth, connect to a database, save or load data, or change runtime behavior.

This checklist does not approve implementation. Any future migration, RLS policy, API route, Supabase command, auth work, or save/load behavior must be separately approved, reviewed, tested, and followed by a read-only checkpoint review.

## A. Planning-Only Guardrails

Stage 4A-310 does not do any of the following:

- Run Supabase commands.
- Create Supabase migrations.
- Execute Supabase migrations.
- Add API routes.
- Add auth implementation.
- Change database connection behavior.
- Change app behavior.
- Add booking save/load behavior.
- Add billing, payment, PDF, invoice, payout, or notification behavior.
- Activate driver workflow, live location, proof/photo upload, customer updates, driver acknowledgement, dispatch automation, or storage behavior.
- Change parser behavior.
- Add parser learning.
- Change package scripts.
- Change `test:safe` membership.
- Add a new mock workbench.
- Change browser tests.
- Change runtime behavior.

## B. Selected Future Workflow

Selected future workflow:

Admin-only booking persistence prototype with strict route/no-leak/network/storage guards.

This checklist prepares only that future workflow. It does not authorize implementation, migration creation, migration execution, API route creation, Supabase connection work, auth work, save/load behavior, or UI changes in this stage.

## C. Minimum Future Migration Scope Checklist

Smallest future first migration scope, only after explicit approval:

- `customers`, if needed for admin-only customer reference.
- `customer_contacts`, if needed for operational contact separation.
- `bookings`.
- `booking_route_points`.
- `booking_service_items`.
- `audit_logs`.

Optional later, only if explicitly approved:

- `drivers`.
- `vehicles`.
- `driver_assignments`.
- `job_status_events`.

Do not include in the first migration scope:

- `billing_accounts`.
- `billing_records`.
- `invoices`.
- `payments`.
- `driver_payouts`.
- `notification_outbox`.
- `files_or_proofs`.
- Live location tables.
- Parser learning tables.
- QA/dev archive tables.
- Mock workbench tables.

## D. Proposed Future Table Checklist

### 1. customers

Purpose:

- Store admin-only customer/account references needed to attach an operational booking to a known account later.

Minimum fields to consider later:

- `id`.
- `display_name`.
- `customer_type`.
- `account_status`.
- `created_at`.
- `updated_at`.

Fields that must not be included:

- Customer price or quoted price.
- Billing account terms, invoice prefixes, statements, payment links, or finance closeout data.
- Auth user links unless a future auth/customer-account stage explicitly approves them.
- QA/dev archive state or mock workbench data.

Sensitive fields:

- Internal account status and any operational account labels.

Route visibility:

- Admin/internal only for the first prototype.
- No public/customer route visibility unless a future customer portal/auth stage explicitly approves it.

RLS notes:

- Future Admin/Owner and Dispatcher roles may read/write approved operational customer reference data.
- Customer role should not be introduced for this first admin-only prototype unless auth is separately approved.

Test implications:

- Public/customer/driver routes must not expose customer account internals.
- Browser/network guards must confirm no public route calls an unapproved customer persistence API.

### 2. customer_contacts

Purpose:

- Separate operational contacts from customer/account records when a booking includes a booker, passenger, phone, or email.

Minimum fields to consider later:

- `id`.
- `customer_id`.
- `display_name`.
- `contact_role`.
- `phone`.
- `email`.
- `created_at`.
- `updated_at`.

Fields that must not be included:

- Auth identity links.
- Billing contacts for invoicing unless a future billing stage explicitly approves them.
- Payment details.
- Notification delivery state.
- Parser learning metadata.

Sensitive fields:

- Phone and email.
- Contact role where it reveals internal account handling.

Route visibility:

- Admin/internal only for the first prototype.
- Customer-owned views require future auth and ownership rules before any exposure.

RLS notes:

- Future Admin/Owner and Dispatcher roles may read/write approved operational contact data.
- Public unauthenticated users must not read stored contact records.

Test implications:

- `/book`, `/my-bookings`, `/driver-job-demo`, and `/driver-job/[token]` must not leak private customer/account contact internals.

### 3. bookings

Purpose:

- Store the core admin-only operational booking record for the first persistence prototype.

Minimum fields to consider later:

- `id`.
- `booking_reference`.
- `source_channel`.
- `customer_id`, if `customers` is approved for the same scope.
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
- `created_at`.
- `updated_at`.

Fields that must not be included:

- Customer price or quoted price unless a future quote/payment stage explicitly approves it.
- Billing records, invoice fields, payment fields, payment links, or PDF output references.
- Driver payout, PayNow payout, payout comparisons, or private driver finance details.
- Notification send logs or delivery state.
- Public driver token persistence.
- Parser learning/rule-change data.

Sensitive fields:

- Customer name/contact.
- Admin internal status.
- Short-notice review status.
- Parser source reference.

Route visibility:

- Admin/internal only for the first prototype.
- `/book` remains public/customer-safe and must not read stored admin bookings.
- `/my-bookings` remains customer-safe and must not show other customers' data.
- `/driver-job/[token]` remains single-job driver-safe only and must not read admin-only booking data unless a later driver-token stage approves a scoped view.

RLS notes:

- Future Admin/Owner and Dispatcher roles may read/write approved operational booking data.
- Finance, Customer, Driver, Public requester, and Public driver-token visitor should have no default first-prototype access.

Test implications:

- No customer price leakage.
- No admin/internal leakage on public/customer/driver routes.
- Network and storage guards must confirm only approved admin-only calls occur later.

### 4. booking_route_points

Purpose:

- Store pickup, dropoff, stops, and waypoints as ordered operational route points attached to a booking.

Minimum fields to consider later:

- `id`.
- `booking_id`.
- `point_type` such as `pickup`, `dropoff`, `stop`, or `waypoint`.
- `sequence_order`.
- `location_text`.
- `timing_note`.
- `created_at`.
- `updated_at`.

Fields that must not be included:

- Route/geocoding API results unless a future route/geocoding stage explicitly approves them.
- Maps, traffic, optimization, live-location, or proof/photo data.
- Customer price, driver payout, or billing totals.

Sensitive fields:

- Pickup/dropoff text and timing notes can reveal private trip details.

Route visibility:

- Admin/internal only for the first prototype.
- Driver-safe route basics require separate approval before driver-token exposure.

RLS notes:

- Access should follow the parent booking.
- Public/customer/driver access should be denied by default in the first admin-only prototype.

Test implications:

- Public and driver routes must not gain unapproved persisted route data.
- Mobile and browser route leakage tests must continue to pass.

### 5. booking_service_items

Purpose:

- Store operational service items that must remain internally distinct, such as child seat, extra stop, waiting time, and midnight charge.

Minimum fields to consider later:

- `id`.
- `booking_id`.
- `service_item_type` such as `child_seat`, `extra_stop`, `waiting_time`, or `midnight_charge`.
- `quantity`.
- `unit_or_block_count`.
- `internal_note`.
- `created_at`.
- `updated_at`.

Fields that must not be included:

- Customer price.
- Quoted price.
- Driver payout.
- PayNow payout.
- Billing total.
- Invoice line total.
- Payment status.

Sensitive fields:

- Internal notes.
- Service details that affect future billing or payout review.

Route visibility:

- Admin/internal only for the first prototype.
- Public/customer/driver routes must not infer pricing or finance from these records.

RLS notes:

- Access should follow the parent booking.
- Finance access is not needed for first operational persistence unless separately approved.

Test implications:

- Tests must keep Manual Extra Charges distinct from pricing automation.
- Midnight charge must remain distinct from waiting time and extra stops.
- No billing, payout, PayNow payout, or price leakage should appear.

### 6. audit_logs

Purpose:

- Track approved create/update actions for admin-only booking persistence.

Minimum fields to consider later:

- `id`.
- `entity_type`.
- `entity_id`.
- `action`.
- `source_route_or_tool`.
- `actor_placeholder`, only if auth is not approved yet and a temporary internal/system actor label is explicitly approved.
- `created_at`.
- `internal_note`.

Fields that must not be included:

- Public/customer-visible audit notes.
- Billing/payment/PDF/payout audit details unless a future finance stage explicitly approves them.
- Notification delivery logs.
- Parser learning/rule-change data.

Sensitive fields:

- Internal notes.
- Actor/source route details.
- Before/after values if a later stage adds them for sensitive changes.

Route visibility:

- Admin/internal only.
- No customer or driver route exposure.

RLS notes:

- Future Admin/Owner may read audit logs.
- Dispatcher access should be limited to operational audit details if approved.
- Customer, Driver, Public requester, and Public driver-token visitor should have no first-prototype access.

Test implications:

- Public/customer/driver routes must not leak audit details, internal notes, or source tooling.

## E. Fields Explicitly Blocked From First Migration Checklist

The first migration checklist must block:

- Customer price or quoted price unless a future quote/payment stage explicitly approves it.
- Billing records.
- Invoice/statement fields.
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

## F. RLS Planning Checklist

Future role categories for RLS planning:

- Admin / Owner.
- Dispatcher / Operations Staff.
- Finance / Admin Billing.
- Customer.
- Driver.
- Public unauthenticated booking requester.
- Public driver-token visitor.

For the first migration checklist:

- Admin/Owner may eventually read/write approved operational booking data.
- Dispatcher may eventually read/write approved operational booking data.
- Finance should not be needed for first operational booking persistence unless separately approved.
- Customer role should not be introduced in the first admin-only prototype unless auth is explicitly approved.
- Driver role should not be introduced in the first admin-only prototype unless driver persistence is explicitly approved.
- Public unauthenticated requester must not read admin data.
- Public driver-token visitor must not access admin-only persisted booking data.

Actual RLS policy SQL is not written in this stage. Future policy SQL must be drafted, reviewed, and approved in a later migration/RLS implementation stage.

## G. Route Privacy Checklist

Future implementation must preserve:

- `/` as the admin/internal dashboard.
- `/book` as public/customer-safe.
- `/my-bookings` as customer-safe and not showing other customers' data.
- `/customers` as internal staff-only despite the name.
- `/driver-job-demo` as demo/local.
- `/driver-job/[token]` as single-job driver-safe only.
- QA/dev archive as admin-only and not persisted as business data.

Future migration/RLS must not enable leakage of:

- Customer price on public/customer/driver routes.
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

## H. Short-Notice Booking Checklist

Future migration/RLS planning must account for:

- A `short_notice_review_status` field or equivalent admin review field.
- Customer-submitted bookings under 24 hours before pickup becoming `Admin Review Required`.
- Locked customer wording remaining: "This booking is within 24 hours, so our team will review and confirm availability."
- Public/customer app behavior never directly confirming short-notice bookings.
- Admin/dispatcher access to an operational review reason later.
- Customers never seeing dispatcher/admin internals.
- Tests covering below 24 hours, exactly 24 hours, and above 24 hours when implemented.

Stage 4A-310 does not implement this rule.

## I. Future API Boundary Checklist

No API route is created in this stage.

For future planning only, a narrow admin-only API may be considered later for approved booking persistence, but it must:

- Be explicitly approved.
- Be auth-protected or otherwise internally guarded.
- Avoid exposing billing, payout, PayNow payout, invoice, PDF, notification, parser debug, mock archive, or finance fields.
- Not be callable from public/customer/driver routes unless explicitly approved.
- Be covered by browser/network guard tests.
- Preserve `test:safe`.

Public/customer API, driver token API, finance API, notification API, proof/photo API, and live-location API remain blocked.

## J. Future Test Checklist

Future implementation must preserve and/or extend:

- `npm run test:booking-ui-browser`.
- `npm run test:parser`.
- `npm run lint`.
- `npm run build`.
- `npm run test:app-smoke-browser`.
- `npm run test:mobile-usability-browser`.
- `npm run test:safe`.

Future implementation-specific tests should cover:

- Admin-only persistence controls not visible on public/customer/driver routes.
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

## K. Migration Review Checklist For Future Stages

Before any future real migration:

- Confirm Supabase project/context.
- Write migration in a separate approved stage.
- Review SQL before running.
- Verify RLS plan before exposing data.
- Verify rollback approach.
- Verify staging/test environment first where possible.
- Run full checks before and after commit.
- Run post-commit `test:safe`.
- Keep final git status clean.

Do not run any Supabase command in this stage.

## L. Failure Conditions For Future Implementation

Future implementation must stop or fail if:

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

## M. Recommended Next Stage

Recommended next stage:

Stage 4A-311 - Read-only checkpoint review after first persistence migration/RLS checklist.

Reason: this checklist should be reviewed before any migration file, Supabase command, API route, auth, or save/load behavior is approved.
