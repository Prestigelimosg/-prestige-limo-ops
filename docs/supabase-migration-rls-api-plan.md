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

## K. Auth Role Model Implementation Plan

Stage 4A-365 is planning only. It defines how the first real auth and role model should be implemented later, but it does not add auth code, API routes, migrations, RLS policies, Supabase commands, production writes, browser storage, or runtime behavior.

### Role Visibility Rules

| Role | Can see later | Must not see |
| --- | --- | --- |
| Admin / dispatcher | Operational booking details, customer/account operations data, booking request review, amend/cancel review, driver/vehicle assignment review, job status, and internal audit summaries. | Finance-only fields unless also finance-approved; no automatic notification/payment/PDF/payout powers. |
| Customer | Own customer-safe booking/request rows, request received/pending status, change/cancellation request status, customer-safe driver handoff status, and support handoff wording. | Driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, unrelated customer data, internal audit detail, and mock QA/dev archive content. |
| Driver | Assigned job details, route, pickup/drop-off, timing, passenger-safe instructions, service items needed for the job, and driver-safe status controls/status history. | Customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, unrelated customer account details, parser/debug internals, and mock QA/dev archive content. |
| Finance / admin billing | Later invoice/payment/payment-status views, finance review, payout review, and month-end closeout after finance RLS approval. | Customer/driver public surfaces; finance powers should not be bundled into dispatcher/customer/driver roles by default. |

### Future Auth Sequence

1. Admin/dispatcher login first.
   - Protect internal dashboard and staff customer folder routes before production records are exposed.
   - Establish server-only session/role checks for internal operational API routes.

2. Customer account login later.
   - Scope customer portal reads/writes to owned customer/account records.
   - Keep public booking request intake customer-safe and request-only.

3. Secure driver token/session model after role rules are clear.
   - Implement token hash storage, expiry, revocation, usage audit, and single-job route-safe DTOs before production driver job reads.

4. Finance/admin billing later.
   - Add only after invoice/payment/PDF, payout, finance RLS, and no-leak tests are separately approved.

### RLS Readiness Requirements

- RLS must exist before production rows are exposed to customer, driver, finance, public, or token routes.
- Policies must use trusted server/auth claims, not browser-supplied IDs.
- Admin/dispatcher policies must be separated from future finance/admin billing policies for payout, PayNow, invoice/payment, and finance notes.
- Customer policies must enforce customer account membership and own-booking scope.
- Driver policies must enforce assignment or valid token/session scope and must not expose raw token metadata.
- Public booking requester policies, if approved later, must create request records only and must not read internal tables.
- Service-role access must be server-only and limited to route handlers or server modules that return route-safe DTOs.

### API Route Requirements Before Real Writes

- Each write route must name the allowed role, allowed fields, validation schema, route-safe response DTO, audit event, and rollback behavior before implementation.
- Unknown fields, internal notes, parser/debug payloads, finance fields, payout fields, and billing/payment/PDF fields must be rejected unless the route is explicitly approved for that role.
- Customer and driver responses must never return raw table rows.
- Public/customer APIs must preserve the short-notice `Admin Review Required` rule and customer-safe wording.
- Driver APIs must be single-job scoped and must not expose customer price, billing, invoice/payment, payout, PayNow payout, finance notes, internal admin notes, or mock archive content.
- API errors must not leak Supabase SQL, service-role credentials, parser internals, internal notes, or private IDs that are not route-safe.

### Audit Requirements Before Mutation Workflows

Audit planning is required before these future writes:

| Workflow | Minimum future audit fields |
| --- | --- |
| Booking creation | Actor role/user or public requester source, source route/API, booking reference, customer/account link if any, source channel, short-notice review status, created status, and safe created-field summary. |
| Amend request | Requester role/user, target booking, requested field set, previous safe values, requested values, review status, source route/API, and later staff decision. |
| Cancellation request | Requester role/user, target booking, cancellation reason/details, current booking status, review status, source route/API, and later staff decision. |
| Driver assignment | Staff actor, target booking, driver/vehicle assignment, previous assignment if any, assignment status, reason/note, and customer/driver redaction marker. |
| Driver status update | Driver token/session or staff actor, booking/assignment, status value, event time, source route/API, customer-safe status mapping, and internal note redaction marker. |

Audit rows are internal by default. Customer and driver routes may show safe status summaries only.

### Test Requirements Before Real Auth/Save/Load

- Route-leak tests for `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]`.
- Role visibility tests for admin/dispatcher, customer, driver, and future finance/admin billing.
- Customer no-leak tests for driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, and mock QA/dev archive content.
- Driver no-leak tests for customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, and mock QA/dev archive content.
- Browser secret tests proving service-role and server-only secrets never reach browser-visible bundles, responses, storage, logs, or page text.
- API tests proving route-safe DTOs and validation of forbidden fields.
- Parser regression tests proving auth/save/load changes do not modify parser behavior.
- Mobile/no-horizontal-overflow tests for customer, driver, and admin emergency-use surfaces.
- `test:safe` before and after commit.

## L. Admin Dispatcher Auth Boundary Scaffold

Stage 4A-366 adds the first implementation scaffold for the admin/dispatcher auth boundary. This is not real auth yet and does not add customer auth, driver auth, migrations, Supabase commands, new API routes, broad persistence, notification sending, payment/invoice/PDF behavior, or production writes.

### Current Boundary Shape

- The existing `/api/admin-bookings` route now resolves access through a shared server-side admin/dispatcher boundary helper.
- Current local/dev admin dashboard access remains available so the internal dashboard is not locked out during the transition.
- The boundary still requires the existing same-origin internal dashboard request shape and admin booking purpose header.
- Blocked requests return a stable safe message and do not expose service-role credentials, session internals, claims, cookies, private tokens, Supabase SQL, or server-only details.
- The helper records the current mode as a local admin dashboard scaffold so future real auth has one obvious replacement point.

### Future Replacement Point

When real admin/dispatcher auth is explicitly approved, the local scaffold should be replaced by a server-side session/claims check that:

- validates an authenticated staff user;
- maps the staff user to `admin` or `dispatcher`;
- rejects customer, driver, public, and anonymous actors;
- preserves route-safe response DTOs and safe error messages;
- keeps `SUPABASE_SERVICE_ROLE_KEY` and all server-only secrets out of browser bundles, page text, storage, logs, and route responses;
- records actor identity for later booking creation, amend request, cancellation request, driver assignment, and driver status update audits.

## M. Recommended Future Sequence

Recommended future stages after this readiness gate:

1. Admin/dispatcher session and role resolver foundation for existing internal routes.
2. Secure driver token/session boundary planning.
3. Smallest approved booking/customer save/load implementation after auth boundaries are explicit.
4. Amend/cancel/assignment audit implementation.
5. Notification outbox planning and implementation later.
6. Invoice/payment/PDF planning and implementation later.

First real workflow candidates, ranked by safety:

1. Admin/dispatcher session and role resolver foundation.
2. Secure driver token/session boundary planning.
3. Admin/customer booking persistence with strict route and no-leak tests after auth/RLS planning is accepted.

The next stage should be the first real backend phase only if it explicitly preserves the readiness gate above.

## N. Admin Dispatcher Session Role Resolver

Stage 4A-367 extends the admin/dispatcher boundary into a small session and role resolver foundation. This remains a bounded internal server-side boundary. It does not add customer auth, driver auth, migrations, Supabase commands, new API routes, broad persistence, notification sending, payment/invoice/PDF behavior, driver workflow automation, or production write expansion.

### Resolver Shape

- `/api/admin-bookings` remains protected by the shared admin/dispatcher boundary.
- Local/dev dashboard access remains the default so the current internal admin dashboard and tests continue to work.
- The helper has an opt-in `PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE=server-session-token` path for future internal-server deployment tests.
- That opt-in path reads only non-`NEXT_PUBLIC_` server values for the expected session token, actor label, and allowed role.
- Allowed roles are limited to `admin` and `dispatcher`; customer and driver roles are not accepted here.
- Blocked responses keep the stable safe message and must not expose session tokens, claims, cookies, Supabase SQL, service-role credentials, server-only secrets, or private IDs.

### Future Supabase Auth Plug-In Point

When real Supabase staff auth is explicitly approved, replace the temporary server-session-token resolver with a server-side Supabase session/claims verifier that:

- validates an authenticated staff user;
- maps the user to `admin` or `dispatcher`;
- rejects customer, driver, public, anonymous, expired, or malformed sessions;
- returns only route-safe actor context to API handlers;
- keeps service-role credentials server-only;
- writes audit actor metadata only after the audit table and RLS plan are approved.

### Still Blocked After Stage 4A-367

Real customer auth, real driver auth, migrations, Supabase CLI commands, broad booking/customer persistence, notifications, payment/invoice/PDF behavior, PayNow payout, billing automation, live-location, proof/photo, parser-learning, and driver workflow automation remain blocked.

## O. Secure Driver Token Session Boundary Plan

Stage 4A-368 is planning only. It defines the future secure driver token/session boundary for production `/driver-job/[token]` access, but it does not implement driver auth, customer auth, migrations, Supabase commands, API routes, production reads, production writes, notification sending, live location, proof/photo, billing, payout, payment, parser-learning, or runtime behavior.

### Driver Token Boundary Shape

- Each future driver token must be scoped to one assigned job or assignment.
- A token must not grant access to other customer jobs, other drivers' jobs, customer account folders, admin dashboard data, finance data, parser/debug internals, or mock QA/dev archive content.
- Tokens must expire or be revocable before production use.
- Tokenized access should only allow assigned job view/status actions after a later approved implementation stage.
- Current local/demo `/driver-job/[token]` behavior should keep working until the production token route is explicitly implemented.

### Future Driver-Safe Visibility

A valid future driver token may return only a route-safe driver job DTO with fields such as:

- pickup date/time;
- pickup/drop-off and job-safe route details;
- service items needed to perform the job;
- safe passenger/contact instructions if separately approved;
- assigned vehicle/driver-safe handoff details if already approved for driver view;
- status controls such as OTW, OTS, POB, and completed after future status-write approval.

The token route must never expose customer price, billing, invoice/payment, driver payout, PayNow payout, payout comparison, internal finance notes, internal admin notes, parser/debug internals, unrelated customer account details, other jobs, other drivers' jobs, service-role/server-only secrets, private IDs that are not route-safe, or mock QA/dev archive content.

### Future Server-Side Validation Requirements

Before production driver-token access is implemented:

- Store only a token hash server-side; never store the raw token in browser-readable data or route payloads.
- Resolve token access server-side by verifying job/assignment id, token hash, expiry, revocation state, and allowed status/action.
- Keep raw token values out of logs, page text, browser storage, route responses, and database rows exposed to RLS clients.
- Reject expired, revoked, malformed, wrong-job, wrong-assignment, already-rotated, or unknown tokens with safe no-secret responses.
- Audit every approved driver status change with token/session actor, job/assignment, status, event time, source route/API, and safe customer/driver status mapping.
- Keep audit before/after values, internal notes, actor internals, token hash metadata, and revocation details admin/staff-only.

### Future Test Requirements

Before any real driver-token reads or writes:

- Invalid token requests are blocked safely.
- Expired token requests are blocked safely.
- Revoked token requests are blocked safely.
- Wrong-job or cross-assignment token requests are blocked safely.
- Driver route payloads do not include customer price, billing, invoice/payment, payout, PayNow payout, finance notes, admin notes, parser/debug internals, service-role/server-only secrets, private token metadata, unrelated customer rows, other driver jobs, or mock QA/dev archive content.
- Status controls remain mobile/PWA-friendly and do not create notification, live-location, proof/photo, billing, payout, payment, or parser-learning side effects.
- Public/customer/admin route-leak tests and mobile/no-horizontal-overflow tests continue to pass.

### Still Blocked After Stage 4A-368

Real driver auth, real customer auth, real secure token generation/validation, migrations, Supabase CLI commands, production driver job reads, production status writes, notification sending, payment/invoice/PDF behavior, PayNow payout, billing automation, live-location, proof/photo, parser-learning, and driver workflow automation remain blocked until later explicit implementation stages.

## P. Booking / Customer Save-Load Implementation Plan

Stage 4A-369 is planning only. It defines the smallest safe future booking/customer save-load implementation path, but it does not add API routes, migrations, Supabase commands, production reads, production writes, customer auth, driver auth, notification sending, billing/payment/PDF behavior, payout behavior, live location, proof/photo, parser-learning, or runtime behavior.

### Smallest Future Sequence

1. Admin/dispatcher auth boundary first.
   - Production save/load must require a trusted server-side admin/dispatcher role.
   - The current local/dev boundary must remain clearly separated from future production writes.

2. Safe booking table/model first.
   - Start with `bookings`, `booking_route_points`, and `booking_service_items`.
   - Store approved operational fields only.
   - Keep parser behavior and parser/debug payloads separate from persistence.

3. Safe customer/account table/model alongside booking records.
   - Start with `customers` and `customer_contacts`.
   - Use account display name and approved operational contact details only.
   - Do not add customer auth, self-service account edits, or customer writes in the first batch.

4. Admin-only create/update first.
   - Admin/dispatcher creates and updates approved operational booking/customer fields through server-side validation.
   - Customer read-only access is later and must use trusted account membership and route-safe DTOs.

5. Driver token access later.
   - Driver token/session access is limited to assigned job-safe DTOs after token validation exists.
   - Driver token routes must never read or return raw customer/account rows.

### Approved First-Write Field Set

The first future save/load API should allow only fields such as:

- booking reference;
- source/channel if operationally needed;
- customer/account display name;
- approved passenger/contact safe details;
- pickup date/time;
- pickup/drop-off and route summary;
- route points needed for dispatch;
- service type;
- service items needed for operations;
- admin internal status;
- customer-facing safe status;
- short-notice review status;
- request, change, and cancellation review statuses;
- created/updated timestamps and actor metadata after auth/audit is approved.

### Blocked Fields For First Save-Load

The first save/load stage must reject or omit:

- pricing, customer charges, quote totals, invoice totals, or billing math;
- driver payout, PayNow payout, payout comparisons, payout defaults, and payout review fields;
- invoice, payment, PDF, Stripe, PayNow payout workflow, billing automation, statement, finance export, and accounting fields;
- internal finance notes;
- internal admin notes until a later redaction/audit stage approves storage and visibility;
- parser/debug internals, raw parser payloads, parser-learning data, and mock QA/dev archive content;
- notification delivery records, notification outbox rows, send logs, WhatsApp/email/SMS/Telegram delivery state, or message-channel behavior;
- live location, proof/photo, storage paths, map/geocoding/flight-provider payloads, or upload metadata.

### Required Audit Planning Before Mutations

Audit rows must be planned before these writes become real:

| Workflow | Required later audit scope |
| --- | --- |
| Booking created | Staff actor, source route/API, booking reference, customer/account link, source channel, short-notice review status, created status, and safe created-field summary. |
| Booking amended | Staff actor or requester, booking, amended field set, previous safe values, new values, review status, source route/API, and redaction marker. |
| Booking cancelled | Staff actor or requester, booking, cancellation reason/details, prior booking status, new review/status value, source route/API, and redaction marker. |
| Driver assigned | Staff actor, booking, driver/vehicle assignment, previous assignment if any, assignment status, reason/note redaction, and customer/driver visibility marker. |
| Driver status updated | Driver token/session or staff actor, booking/assignment, status value, event time, source route/API, customer-safe status mapping, and internal note redaction marker. |

Audit rows are internal by default. Customer and driver routes may receive only separately approved safe status summaries.

### Future RLS And API Requirements

- Admin/dispatcher can write approved operational booking/customer fields only after server-side role checks.
- Customer can later read only own safe booking/request fields through trusted account membership.
- Driver token/session can later read only assigned job-safe fields after token hash, expiry, revocation, and job-scope validation.
- Public booking request intake remains request-only and must preserve short-notice admin review behavior.
- Service-role keys stay server-only and must never be exposed to browser bundles, page text, browser storage, logs, or route payloads.
- API handlers must return role-safe DTOs, not raw Supabase table rows.
- RLS policies must be tested before any customer, driver, public, or finance route touches production tables.

### Future Test Requirements

Before real save/load implementation:

- No customer price leak tests for public/customer/driver routes.
- No driver payout or PayNow payout leak tests for customer/driver routes.
- No service-role or server-only secret leak tests for browser-visible bundles, responses, storage, logs, and page text.
- Public route-leak tests for `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]`.
- Parser regression tests proving persistence does not change parser behavior.
- Mobile/no-horizontal-overflow tests for customer, driver, and admin emergency-use surfaces.
- Invalid role/session tests proving public, customer, driver, anonymous, and malformed staff access cannot write admin records.
- Invalid, expired, revoked, and wrong-job driver token tests before production driver reads are enabled.

### Still Blocked After Stage 4A-369

Real save/load, migrations, Supabase CLI commands, API routes, production reads, production writes, customer auth, driver auth, notification sending, billing/payment/PDF behavior, Stripe, PayNow payout, finance automation, live location, proof/photo, parser-learning, payout behavior, and driver workflow automation remain blocked until later explicit implementation stages.

## Q. Audit Records / Rollback Implementation Plan

Stage 4A-370 is planning only. It defines audit record and rollback API/RLS boundaries before any real booking/customer save-load implementation, but it does not create audit tables, create migrations, run Supabase commands, add API routes, add production reads, add production writes, add real save/load, add customer auth, add driver auth, notification sending, billing/payment/PDF behavior, payout behavior, live location, proof/photo, parser-learning, or runtime behavior.

### Future Audit Coverage

Future write paths must create internal audit records for approved mutations such as:

| Workflow | Future audit requirement |
| --- | --- |
| Booking created | Actor role, action type, booking reference, safe created-field snapshot, reason/source if applicable, timestamp, and source surface. |
| Booking amended | Actor role, action type, booking reference, before/after safe operational snapshot, review reason or note, timestamp, and source surface. |
| Booking cancelled | Actor role, action type, booking reference, before/after safe status snapshot, cancellation reason or review note, timestamp, and source surface. |
| Customer amend request reviewed | Staff actor role, action type, booking reference, request review decision, before/after safe request status snapshot, review note, timestamp, and source surface. |
| Customer cancellation request reviewed | Staff actor role, action type, booking reference, cancellation review decision, before/after safe request status snapshot, review note, timestamp, and source surface. |
| Driver assigned | Staff actor role, action type, booking reference, before/after safe assignment status snapshot, reason or review note, timestamp, and source surface. |
| Driver status updated | Driver token/session or staff actor role, action type, booking reference, before/after safe driver status snapshot, timestamp, and source surface. |
| Admin/dispatcher override | Admin/dispatcher actor role, override action type, booking reference, before/after safe operational snapshot, required reason/review note, timestamp, and source surface. |

Audit rows must remain internal by default. Customer and driver APIs may receive only separately approved customer-safe or driver-safe status summaries, never raw audit rows.

### Safe Audit Field Boundary

The first audit implementation should allow only:

- actor role;
- action type;
- booking reference;
- before/after safe operational snapshot;
- reason or review note;
- timestamp;
- source surface.

The snapshot must be composed server-side from approved operational fields. API handlers must reject browser-submitted audit snapshots that include unknown, private, finance, parser/debug, notification, or file/storage fields.

### Blocked Audit Field Boundary

The first audit implementation must not store or return:

- pricing, customer charges, quote totals, invoice totals, or billing math;
- driver payout, PayNow payout, payout comparisons, payout defaults, or payout review fields;
- invoice, payment, PDF, Stripe, PayNow payout workflow, billing automation, finance export, accounting, statement, or payment-link fields;
- internal finance notes;
- parser debug internals, raw parser payloads, parser-learning data, or mock QA/dev archive content;
- live location, proof/photo content, storage paths, map/geocoding/flight-provider payloads, or upload metadata.

### Rollback RLS/API Boundary

Rollback must be planned as a separate explicit staff-reviewed operation, not as an automatic companion to writes.

- Admin/dispatcher roles may request rollback only after server-side role checks, validation, and audit lookup are approved.
- Rollback restores safe operational fields only.
- Rollback must not expose raw audit rows, raw Supabase rows, private driver details, finance notes, parser/debug internals, service-role secrets, or server-only details.
- Rollback must not send automatic customer or driver notifications.
- Rollback must not create billing, invoice, PDF, payment, Stripe, PayNow payout, driver payout, finance, accounting, live-location, proof/photo, parser-learning, or notification side effects.
- Rollback must not reverse billing/payment/payout state because those workflows remain out of scope.
- Sensitive overrides require a manual admin/dispatcher reason or review note.
- Rollback responses must return role-safe DTOs only.

### Future Audit/Rollback Test Requirements

Before implementation, tests must prove:

- audit records are created for each approved future write path;
- customer and driver routes cannot see internal audit fields or raw before/after snapshots;
- public, customer, driver, anonymous, malformed staff, and invalid-role requests cannot write audit records;
- rollback cannot expose pricing, payout, PayNow payout, invoice/payment/PDF, finance notes, internal admin notes, private driver data, parser/debug internals, live-location, proof/photo, or mock archive content;
- rollback cannot send customer or driver notifications and cannot trigger billing/payment/payout side effects;
- route-leak tests and mobile/no-horizontal-overflow tests remain protected.

### Still Blocked After Stage 4A-370

Real audit tables, rollback APIs, migrations, Supabase CLI commands, API routes, production reads, production writes, real save/load, customer auth, driver auth, notification sending, billing/payment/PDF behavior, Stripe, PayNow payout, finance automation, live location, proof/photo, parser-learning, payout behavior, and driver workflow automation remain blocked until later explicit implementation stages.
