# Stage 4A-298 - Supabase Migration / RLS / API Plan

Stage 4A-298 is documentation-only. It plans future migration ordering, Row Level Security boundaries, and API route categories for Prestige Limo Ops, but it does not create migrations, run Supabase commands, add API routes, add auth, change database connections, add save/load behavior, or activate real persistence.

## A. Planning-Only Guardrails

- No Supabase commands in this stage.
- No Supabase migrations in this stage.
- No API routes in this stage.
- No auth implementation in this stage.
- No database connection changes in this stage.
- No booking save/load behavior in this stage.
- No billing, invoice, PDF, payment, payout, or notification behavior in this stage.
- No live location, maps, flight API, route/geocoding API, proof/photo upload, or storage behavior in this stage.
- No parser behavior changes.
- No parser learning.
- No runtime behavior changes.
- No new mock workbench.

Any migration, RLS, API, auth, or persistence implementation must be separately approved in a later stage and protected by parser, booking UI, browser route leakage, mobile usability, build, and `test:safe` checks.

## B. Future Migration Sequence Plan

Future migrations should be planned in small, reviewable batches. No migration is created or run in Stage 4A-298.

1. Core identity/reference tables
   - `customers`
   - `customer_contacts`
   - `drivers`
   - `vehicles`

2. Core booking tables
   - `bookings`
   - `booking_route_points`
   - `booking_service_items`

3. Dispatch/status tables
   - `driver_assignments`
   - `job_status_events`
   - `driver_job_tokens`

4. Audit table
   - `audit_logs`

5. Later finance tables
   - `billing_accounts`
   - `billing_records`
   - `invoices`
   - `payments`
   - `driver_payouts`

6. Later/blocked notification and proof tables
   - `notification_outbox`
   - `files_or_proofs`
   - possible live-location table only after explicit approval

The first real implementation batch should avoid finance, billing, invoices, payments, payouts, notifications, proof uploads, live location, and parser learning because those areas carry higher privacy, customer-facing, regulatory, accounting, operational, and leakage risk. They need separate role design, route tests, rollback planning, and explicit approval before any schema or runtime work.

## C. RLS Role Model Planning

Future RLS planning should account for these role categories:

- Admin / Owner
- Dispatcher / Operations Staff
- Finance / Admin Billing
- Customer
- Driver
- Public unauthenticated booking requester
- Public driver-token visitor

Actual auth, role assignment, claims, RLS policies, and database grants are not implemented in this stage.

## D. Table-By-Table RLS Planning Matrix

| Table | Admin / Owner access | Dispatcher access | Finance access | Customer access | Driver access | Public/token access | Notes / risks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `customers` | Full internal read/write later. | Read/write operational customer fields later. | Read billing-relevant customer fields later. | Own safe profile only after auth. | None. | None. | Do not expose unrelated accounts or internal notes. |
| `customer_contacts` | Full internal read/write later. | Read/write operational contacts later. | Read billing contacts later. | Own account contacts only after auth. | None. | None. | Do not expose customer contact lists to drivers or public routes. |
| `bookings` | Full internal read/write later. | Read/write operational booking fields later. | Read finance-relevant fields later. | Own customer-safe booking fields only after auth. | Assigned job-safe subset only later. | Public requester create only after approved API; token view single job only. | Customers must only access their own bookings; drivers must not see billing, payout, account, or internal notes. |
| `booking_route_points` | Full read/write later. | Read/write route details later. | Limited read if invoice support needs route summary. | Own customer-safe route summary only. | Assigned job route needed for trip only. | Token route single-job route only. | Internal pickup notes and routing notes must be redacted from public/customer/driver views. |
| `booking_service_items` | Full read/write later. | Read/write operational service items later. | Read billing-approved service items later. | Own customer-safe extras summary only. | Assigned job operational extras only. | Token route job-safe extras only. | Pricing flags, finance notes, and review notes are not public. |
| `drivers` | Full internal read/write later. | Read/write operational driver profile fields later. | Read payout-approved driver fields later. | None. | Own safe profile only after auth. | None. | PayNow, payout defaults, and internal notes must never leak to customers. |
| `vehicles` | Full internal read/write later. | Read/write operational vehicle fields later. | Limited read if needed. | None. | Assigned vehicle subset only later. | Token route assigned vehicle-safe subset only. | Internal vehicle notes are staff-only. |
| `driver_assignments` | Full read/write later. | Read/write assignment status later. | Read payout-relevant assignments only after payout approval. | None by default; customer may see driver-safe assignment summary after approval. | Own assigned jobs only. | Token route single assigned job only. | Driver assignment internals and payout terms are not customer-visible. |
| `job_status_events` | Full read/write later. | Create/read operational status events later. | Read finance-relevant completion status later. | Own customer-safe status subset only. | Assigned job-safe status subset only. | Token route single-job status subset only. | Staff actors, internal notes, and audit source details must be redacted. |
| `driver_job_tokens` | Full internal management later. | Create/revoke only after token workflow approval. | None unless audit support needs read. | None. | Access only through token route, not direct table access. | Single-job token-scoped access only. | Tokens must expire or be revocable later; token hashes and usage metadata are sensitive. |
| `billing_accounts` | Full read/write later. | Limited read only if approved. | Full finance read/write later. | Own billing account only after auth/billing approval. | None. | None. | Customer billing must never leak to drivers. |
| `billing_records` | Full read/write later. | Limited operational read only if approved. | Full finance read/write later. | Own billing summary only after auth/billing approval. | None. | None. | Do not expose billing records before billing stage. |
| `invoices` | Full read/write later. | None or limited status only if approved. | Full finance read/write later. | Own invoices only after auth/billing approval. | None. | None. | Invoice number, PDF, payment status, and totals are sensitive. |
| `payments` | Full read/write later. | None or limited status only if approved. | Full finance read/write later. | Own payment status only after auth/payment approval. | None. | None. | No payment link or payment processing until explicit approval. |
| `driver_payouts` | Full read/write later. | Limited visibility only if approved. | Full finance read/write later. | None. | Own payout view only if a future driver payout stage approves it. | None. | Driver payout must never leak to customers. |
| `audit_logs` | Full internal read later. | Limited operational audit read later. | Finance audit read for finance records later. | None. | None. | None. | Internal admin notes, before/after values, and actor details must never leak to customers or drivers. |
| `notification_outbox` | Full read/write only after notification stage. | Queue/review only after notification approval. | Limited billing notices only after approval. | None. | None. | None. | No WhatsApp, email, SMS, Telegram, send, or log persistence until notification stage. |
| `files_or_proofs` | Full read/write only after storage/proof stage. | Read/write approved proof files later. | Limited read if billing dispute support approved. | Own safe files only if approved. | Upload/view assigned job proofs only if approved. | None. | No storage path, proof/photo upload, or file metadata persistence until approved. |

QA/dev archive content must not be persisted as business data. Mock archive state, mock workbench data, and mock labels should remain internal/admin-only and outside future production RLS policies.

## E. Future API Route Boundary Plan

No API route is created in Stage 4A-298. Future API categories should be planned with explicit route ownership, auth, RLS, no-leak tests, and rollback notes.

1. Public customer booking request API
   - Possible future path: `/api/customer-booking-request` or similar.
   - May later create customer-submitted booking requests.
   - Must support `Admin Review Required` for short-notice bookings.
   - Must not expose admin internals, dispatcher notes, parser debug, pricing internals, payout, mock archive content, or Supabase implementation details.

2. Admin booking management API
   - Admin/staff only.
   - May later create, update, and read internal booking data.
   - Must be auth-protected before real data exists.
   - Must keep parser behavior separate from persistence behavior.

3. Customer portal API
   - Customer-owned bookings only.
   - Must not expose admin notes, driver payout, internal pricing, parser debug, audit details, or mock archive content.
   - Requires auth or a secure access flow before implementation.

4. Driver job token API
   - Token-scoped single-job access only.
   - Must not expose billing, payout, customer account, internal notes, audit details, admin-only panels, or mock archive content.
   - Token expiry and revocation should be planned before production use.

5. Finance API
   - Finance/admin only.
   - Invoices, payments, statements, payout records, and month-end closeout remain blocked until an explicit billing/payment stage.
   - Must prevent customer billing from leaking to drivers and driver payout from leaking to customers.

6. Notification API/outbox API
   - Blocked until an explicit notification stage.
   - No WhatsApp, email, SMS, Telegram, message-channel send, or delivery persistence in this stage.

7. Proof/photo/live-location API
   - Blocked until an explicit driver workflow/storage/live-location stage.
   - No proof upload, file storage, live location, maps, flight API, route API, or geocoding behavior in this stage.

## F. Short-Notice Booking Rule API/RLS Planning

The locked 24-hour rule applies to future customer-submitted bookings:

- Customer-submitted bookings less than 24 hours before pickup should become `Admin Review Required`.
- Customer-facing wording stays: "This booking is within 24 hours, so our team will review and confirm availability."
- Public/customer API must not directly accept or confirm short-notice bookings.
- Admin/dispatcher can later see the operational review reason and review queue.
- Customer routes should not expose internal dispatcher/admin logic.
- Do not implement this rule in Stage 4A-298.

## G. Migration Safety Rules For Future Stages

Before any real migration stage:

- Migration must be explicit and separately approved.
- Supabase CLI and project context must be confirmed before commands.
- Migration SQL must be reviewed before running.
- RLS policies must be planned before exposing data.
- No public/customer/driver data route should ship without leakage tests.
- No billing, payment, PDF, invoice, payout, or finance tables should be activated until a billing stage approves them.
- No notification, proof/photo, file storage, or live-location tables should be activated until their approved stages.
- Rollback plan should be documented before running real migrations.
- Test environment or staging should be used before production.
- Required checks and post-commit `test:safe` should pass around any approved implementation.

## H. Test Guard Recommendations Before Real Supabase/API Work

Future implementation stages should add or preserve guards for:

- Browser tests confirming public routes do not leak admin/internal content.
- Driver token tests confirming single-job safe data only.
- Customer portal tests confirming customer-owned data only.
- No unintended Supabase REST calls on public routes before approved implementation.
- No accidental `fetch`, XHR, `sendBeacon`, or WebSocket calls.
- No notification sends or delivery logs.
- No billing, payment, invoice, PDF, payout, or accounting behavior.
- Parser regression tests remaining protected.
- `test:safe` passing before and after any approved implementation.
- Final `git status --short` remaining clean.

Stage 4A-300 plans these future test guards before any migration, RLS, API, auth, save/load, or persistence implementation. It does not change tests, package scripts, Supabase commands, migrations, API routes, database connections, or runtime persistence.

## I. Data Not Allowed In First Real Persistence Stage

The first persistence implementation must still block:

- QA/dev mock archive state/content.
- Mock workbench data.
- Parser learning/rule changes.
- Notification send logs.
- Invoice/PDF/payment outputs.
- Payout records.
- Live location.
- Proof/photo uploads.
- Customer account auth links unless an auth stage is approved.
- Real billing/month-end finance data.
- Real notification delivery state.

## J. Production Data/Auth Readiness Gate

Stage 4A-364 keeps this document as planning only and adds the entry gate for the next real backend phase. No migration, Supabase command, RLS policy, API route, auth implementation, or production persistence is created here.

### Required Order Before Real Writes

1. Auth and role model first
   - Define admin/owner, dispatcher, finance, customer, driver, public booking requester, and public driver-token visitor roles.
   - Decide claims/session shape and route ownership before any production table is exposed.
   - Keep service-role keys server-only and never browser-visible.

2. Secure driver token model
   - Define one-token-to-one-job scope.
   - Store token hashes only, not raw tokens.
   - Plan expiry, revocation, last-used metadata, audit logging, and driver-route no-leak tests before using production rows.

3. Booking/customer save/load
   - Start with approved operational booking/customer fields only.
   - Keep customer-facing short-notice requests in `Admin Review Required`.
   - Do not include billing, invoices, payments, payouts, notifications, proof/photo, live location, or parser learning.

4. Amend/cancel/assignment audit records
   - Define audit rows before production amend, cancellation, or driver assignment changes can mutate booking records.
   - Keep before/after values, actor identity, source route, and internal notes admin/staff-only.

5. Notifications later
   - Keep notification APIs and `notification_outbox` blocked until a separate notification stage approves templates, staff approval, retry/failure handling, consent, delivery logging, and kill switches.

6. Invoice/payment/PDF later
   - Keep invoice numbers, payment links, PDFs, statements, payouts, PayNow payout details, accounting records, and finance export blocked until a separate finance stage approves role boundaries and rollback.

### API/RLS Gate Conditions

- Every production write route must be auth-protected or explicitly public-request scoped.
- Every route must return a route-safe DTO rather than raw table rows.
- RLS must be enabled and tested before customer, driver, finance, or public routes touch production tables.
- Public/customer/driver routes must continue to block admin notes, parser/debug internals, mock QA/dev archive content, pricing on customer/public pages unless approved, and all payout/finance data.
- Browser tests must protect route leakage, no unintended Supabase/API calls, no notification sends, no storage writes, and mobile/no-horizontal-overflow behavior.
- Rollback and staging validation must be documented before running migrations or production writes.

### Still Blocked

Supabase CLI commands, migrations, production writes, production reads, real auth, real secure tokens, real notifications, invoice/payment/PDF behavior, live location, proof/photo, parser learning, and finance/payout behavior remain blocked until a later explicit implementation stage approves them.

## K. Recommended Future Sequence

Recommended future stages after this readiness gate:

1. Auth and role model implementation planning.
2. Secure driver token model planning.
3. Smallest approved booking/customer save/load implementation.
4. Amend/cancel/assignment audit implementation.
5. Notification outbox planning and implementation later.
6. Invoice/payment/PDF planning and implementation later.

First real workflow candidates, ranked by safety:

1. Auth and role model boundary implementation.
2. Secure driver token model boundary implementation.
3. Admin/customer booking persistence with strict route and no-leak tests.

The next stage should be the first real backend phase only if it explicitly preserves the readiness gate above.
