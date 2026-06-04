# Supabase Schema / Data Model Plan

## 1. Purpose

Stage 4A-296 is documentation-only. It describes a future Supabase schema and data model for Prestige Limo Ops, but it does not create migrations, run Supabase commands, add API routes, implement auth, add save/load behavior, or activate any real persistence.

This plan follows the Stage 4A-294 production data/auth boundary plan. It is a map for later design and implementation stages, not approval to build or connect live data.

## 2. Planning-Only Guardrails

- No Supabase commands in this stage.
- No Supabase migrations in this stage.
- No API routes in this stage.
- No auth implementation in this stage.
- No booking save/load behavior in this stage.
- No customer account implementation in this stage.
- No billing, invoice, PDF, payment, payout, or notification behavior in this stage.
- No live location, maps, flight API, route/geocoding API, proof/photo upload, or storage behavior in this stage.
- No parser behavior changes.
- No parser learning.
- No runtime behavior changes.
- No new mock workbench.

Any future schema, RLS, API, auth, or persistence work must be explicitly approved in a later stage and protected by browser, parser, mobile, build, and `test:safe` checks.

## 3. Proposed Table List

| Table | Purpose | Key fields | Sensitive fields | Role visibility | Phase | Public exposure note |
| --- | --- | --- | --- | --- | --- | --- |
| `customers` | Customer account or company profile. | `id`, `account_name`, `customer_type`, `account_status`, `invoice_prefix`, `created_at`, `updated_at`. | Billing settings, account notes, internal status. | Admin, dispatcher where operationally needed, finance. Customer only own safe profile later. | First phase candidate. | Do not expose internal notes, billing settings, or unrelated accounts. |
| `customer_contacts` | Contacts attached to customer accounts. | `id`, `customer_id`, `name`, `role`, `phone`, `email`, `is_primary`, `created_at`, `updated_at`. | Phone, email, contact role, billing contact flag. | Admin/dispatcher; customer own contacts later; finance for billing contacts. | First phase candidate. | Do not expose contact lists to drivers or unrelated customers. |
| `bookings` | Core trip/request record. | `id`, `booking_reference`, `source_channel`, `customer_id`, `pickup_at`, `pickup_location`, `dropoff_location`, `route_type`, `flight_number`, `vehicle_type`, `pax_count`, `luggage_note`, `customer_status`, `admin_status`, `short_notice_review_status`, `parser_source_id`, `created_at`, `updated_at`. | Raw source reference, internal status, internal notes, customer contact details. | Admin/dispatcher; customer own safe fields later; driver assigned-job subset later; finance limited fields. | First phase candidate. | Public/customer routes must only show customer-safe booking fields. |
| `booking_route_points` | Multi-stop route structure. | `id`, `booking_id`, `sequence`, `point_type`, `address`, `terminal_note`, `stop_note`, `created_at`, `updated_at`. | Internal route notes, operational pickup notes. | Admin/dispatcher; customer own safe route; driver assigned-job route. | First phase candidate. | Do not expose internal routing notes to customer/driver surfaces. |
| `booking_service_items` | Extra stops, child seats, waiting time, midnight charge, and other service modifiers. | `id`, `booking_id`, `item_type`, `quantity`, `description`, `customer_visible_label`, `admin_note`, `created_at`, `updated_at`. | Admin note, pricing flags, review status. | Admin/dispatcher; customer safe summary later; finance when billing-approved. | First phase candidate with non-billing fields only. | Do not expose billing math or internal review notes. |
| `drivers` | Driver profile. | `id`, `name`, `phone`, `status`, `vehicle_preference`, `availability_note`, `created_at`, `updated_at`. | PayNow number, payout defaults, internal notes. | Admin/dispatcher; driver own safe profile later; finance for payout-approved data. | First phase candidate with sensitive fields protected. | Never expose driver payout or PayNow to customers. |
| `vehicles` | Vehicle inventory/profile. | `id`, `plate_number`, `model`, `capacity`, `vehicle_type`, `status`, `created_at`, `updated_at`. | Internal vehicle notes, owner/driver linkage. | Admin/dispatcher; driver assigned vehicle subset later. | First phase candidate. | Do not expose internal vehicle notes to customers. |
| `driver_assignments` | Booking-to-driver/vehicle assignment record. | `id`, `booking_id`, `driver_id`, `vehicle_id`, `assigned_by_user_id`, `assignment_status`, `assigned_at`, `created_at`, `updated_at`. | Assigned-by staff user, internal assignment notes, payout terms. | Admin/dispatcher; driver assigned-job subset; finance if payout-approved. | First phase candidate. | Driver route must only expose assigned job-safe details. |
| `job_status_events` | Timeline of job status changes. | `id`, `booking_id`, `assignment_id`, `status`, `event_at`, `source`, `actor_user_id`, `actor_driver_id`, `note`, `created_at`. | Staff actor, internal note, source tool. | Admin/dispatcher; driver/customer safe status subset later. | First phase candidate. | Customer/driver views must exclude internal notes and staff audit detail. |
| `driver_job_tokens` | Scoped driver access token metadata. | `id`, `booking_id`, `assignment_id`, `token_hash`, `expires_at`, `revoked_at`, `created_at`, `last_used_at`. | Token hash, usage metadata, revoke reason. | Admin/dispatcher; driver only through tokenized route. | Later first workflow candidate only after auth/token design. | Token route must stay single-job scoped and driver-safe. |
| `billing_accounts` | Finance settings for invoice/statement customers. | `id`, `customer_id`, `billing_name`, `billing_email`, `billing_terms`, `tax_or_registration_note`, `created_at`, `updated_at`. | Billing email, terms, tax/registration notes. | Admin/finance only, dispatcher limited if needed. | Later phase. | Never expose to drivers; customer only own billing after auth/billing approval. |
| `billing_records` | Billable line preparation for jobs. | `id`, `booking_id`, `customer_id`, `billing_account_id`, `record_status`, `service_period`, `review_flags`, `created_at`, `updated_at`. | Review flags, billing amounts, adjustment notes. | Admin/finance. | Later phase. | Do not expose to drivers or public/customer routes before billing approval. |
| `invoices` | Invoice or statement records. | `id`, `billing_account_id`, `invoice_number`, `invoice_status`, `issue_date`, `due_date`, `total_amount`, `pdf_file_id`, `created_at`, `updated_at`. | Invoice number, totals, PDF link, payment status. | Admin/finance; customer own invoices later after auth/billing approval. | Blocked for now. | No invoice/PDF/payment behavior until approved. |
| `payments` | Payment or manual payment records. | `id`, `invoice_id`, `customer_id`, `payment_method`, `payment_status`, `amount`, `received_at`, `reference`, `created_at`, `updated_at`. | Payment reference, method, amount, reconciliation notes. | Admin/finance; customer own payment status later. | Blocked for now. | No payment links or payment processing until approved. |
| `driver_payouts` | Driver payout review and payment records. | `id`, `driver_id`, `booking_id`, `assignment_id`, `payout_status`, `amount`, `paynow_reference`, `review_note`, `created_at`, `updated_at`. | PayNow reference, payout amount, review notes. | Admin/finance, limited dispatcher only if approved. | Blocked for now. | Never expose payout data to customers. |
| `audit_logs` | Internal audit trail. | `id`, `entity_type`, `entity_id`, `action`, `actor_user_id`, `source_route`, `before_snapshot`, `after_snapshot`, `created_at`. | Before/after values, actor user, internal source route. | Admin; finance for finance records; limited support views later. | First phase candidate with careful redaction. | Never expose internal audit details to customer or driver routes. |
| `notification_outbox` | Future message queue/log before sending. | `id`, `booking_id`, `recipient_type`, `channel`, `template_key`, `delivery_status`, `approved_by_user_id`, `created_at`, `sent_at`. | Recipient, channel, approval, delivery status, message payload. | Admin/dispatcher with approval; customer/driver never directly. | Blocked for now. | No WhatsApp/email/SMS/Telegram sending or logs until notification stage. |
| `files_or_proofs` | Future proof/photo/file metadata. | `id`, `booking_id`, `assignment_id`, `file_type`, `storage_path`, `uploaded_by_type`, `created_at`, `deleted_at`. | Storage path, uploader, proof content metadata. | Admin/dispatcher; driver upload/view only if approved later. | Blocked for now. | No storage or proof/photo upload until approved. |

## 4. Core First-Phase Schema Recommendation

The smallest safe first-phase schema, after future explicit approval, should focus on operational booking persistence without billing, notifications, uploads, or live provider behavior:

- `customers`
- `customer_contacts`
- `bookings`
- `booking_route_points`
- `booking_service_items`
- `drivers`
- `vehicles`
- `driver_assignments`
- `job_status_events`
- `audit_logs`

This set supports admin/staff operational records, route details, safe service item tracking, driver/vehicle assignment records, and basic auditability. It does not require billing automation, invoice numbers, payment links, payout processing, notification sending, live location, proof upload, or parser learning.

Keep these later-phase or blocked until separate approval:

- `driver_job_tokens` until token scope, expiry, revocation, and route tests are approved.
- `billing_accounts`, `billing_records`, `invoices`, `payments`, and `driver_payouts` until finance/RLS/billing stages are approved.
- `notification_outbox` until notification approval, templates, approval workflow, and no-send tests exist.
- `files_or_proofs` and any live-location table until storage, driver workflow, and privacy controls are approved.
- Parser learning or parser rules outside the database model until a dedicated parser stage approves them.

## 5. Booking Data Model

Future `bookings` data should include:

- Booking reference.
- Source/channel, such as admin form, public booking request, customer portal, or imported message.
- Customer/account link.
- Pickup date/time.
- Pickup location.
- Dropoff location.
- Route type.
- Route points/stops through `booking_route_points`.
- Flight details.
- Pax/luggage.
- Vehicle type.
- Child seat requirements.
- Extra stops.
- Waiting time review fields.
- Midnight charge review fields.
- Customer-facing status.
- Admin internal status.
- Short-notice review status.
- Parser/raw source reference, not raw parser learning.
- Created and updated timestamps.

Locked short-notice rule for future implementation:

- Customer-submitted bookings less than 24 hours before pickup must become `Admin Review Required`.
- Customer-facing wording remains simple: "This booking is within 24 hours, so our team will review and confirm availability."
- Admin/dispatcher can later see operational reason and review queue.
- Customer routes must not expose internal dispatcher/admin logic.
- This rule is not implemented in Stage 4A-296.

## 6. Customer Data Model

Future customer/account data should include:

- Customer account name.
- Customer type, such as corporate, hotel, agency, individual, or VIP.
- Billing contact relationship.
- Operational contact relationship.
- Phone and email through `customer_contacts`.
- Invoice prefix, if finance stage approves it later.
- Account status.
- Staff-only notes.
- Planned auth/user relationship in a later auth stage.

Boundary rules:

- Internal notes are staff-only.
- Billing fields are staff/finance-only until customer billing access is explicitly approved.
- Customer portal data must later show only authenticated customer-owned records.
- Customer account linking must wait for an auth/account plan or a separately approved admin-only workflow.

## 7. Driver And Vehicle Data Model

Future driver fields should include:

- Name.
- Phone.
- PayNow number.
- Status.
- Vehicle assignment preference.
- Internal notes.
- Availability notes.
- Created and updated timestamps.

Future vehicle fields should include:

- Plate number.
- Model.
- Capacity.
- Type/category.
- Status.
- Internal notes.
- Created and updated timestamps.

Boundary rules:

- Driver PayNow number is sensitive.
- Driver payout data is sensitive.
- Driver internal notes are staff-only.
- Customers must never see driver payout, PayNow, payout comparison, internal driver notes, or admin notes.
- Drivers must not see customer billing, company pricing, finance internals, or unrelated customer account details.

## 8. Assignment And Job Status Model

Future assignment/status tables:

- `driver_assignments`
- `job_status_events`
- `driver_job_tokens`

The assignment model should include:

- Booking relationship.
- Driver relationship.
- Vehicle relationship.
- Assigned-by staff user after auth exists.
- Assignment status.
- Assignment timestamps.
- Internal assignment note if approved and protected.

The job status model should include:

- OTW, OTS, POB, completed, cancelled, exception, and other status events.
- Event timestamp.
- Source, such as staff dashboard, driver token route, or future approved API.
- Actor relationship, such as staff user or driver.
- Internal note separated from customer/driver-safe status text.

The driver token model should include:

- Single booking/assignment scope.
- Token hash, never raw token storage.
- Expiry and revocation fields later.
- Last-used metadata later if approved.

Driver token route boundary:

- `/driver-job/[token]` must remain single-job scoped and driver-safe.
- It must not expose billing, payout, customer account, admin notes, parser debug, audit internals, or mock archive content.

## 9. Finance And Billing Model

Later-phase finance tables:

- `billing_accounts`
- `billing_records`
- `invoices`
- `payments`
- `driver_payouts`

Future finance data may include:

- Customer invoice/statement data.
- Manual payment records.
- Driver payout records.
- Month-end closeout status.
- Adjustment and review flags.
- Audit links.
- Role-restricted finance notes.

Finance guardrails:

- No billing, invoice, payment, PDF, payout, statement, or finance export behavior is implemented in Stage 4A-296.
- Finance data must be role-restricted later.
- Driver payout must never leak to customers.
- Customer billing must never leak to drivers.
- Invoice numbers, payment links, PDF files, accounting exports, and payout records require separate approval.

## 10. Notification And Proof/Live-Location Model

Later or blocked tables:

- `notification_outbox`
- `files_or_proofs`
- A possible future live-location table only after explicit approval.

Notification guardrails:

- No WhatsApp, email, SMS, Telegram, or customer notification sending in this stage.
- No notification logs should be persisted until a notification stage is approved.
- Future notification records should require approval state, template references, recipient role, channel, and audit linkage.

Proof/live-location guardrails:

- No proof/photo upload in this stage.
- No live location in this stage.
- No storage behavior in this stage.
- Future file/proof data must separate internal staff review, driver upload permissions, and customer-visible proof access if any.

## 11. Audit And Privacy Model

Future `audit_logs` should capture:

- Who changed a record.
- What changed.
- When it changed.
- Entity type and entity ID.
- Source route or tool.
- Staff/admin user once auth exists.
- Before/after values for sensitive changes later, with careful redaction rules.

Public view boundaries:

- `/` should be admin/staff-only later.
- `/customers` is staff-only despite its name.
- `/book` remains public/customer-safe.
- `/my-bookings` must later show customer-owned records only.
- `/driver-job/[token]` must remain single-job driver-safe only.
- The QA/dev archive is admin-only and must not be persisted as business data.

Customer and driver-safe views must exclude:

- Internal audit details.
- Staff user identities.
- Internal notes.
- Finance internals.
- Driver payout data.
- Customer billing data on driver views.
- Parser debug/raw review internals.
- Mock QA/dev archive content.

## 12. Data That Must Not Be Persisted Yet

These require later explicit approved implementation stages:

- QA/dev mock archive state/content.
- Mock workbench data.
- Parser learning/rule changes.
- Notification send logs.
- Invoice/PDF/payment outputs.
- Payout records.
- Live location.
- Proof/photo uploads.
- Customer account auth links.
- Real booking save/load.
- Any real Supabase data.

Stage 4A-296 does not persist any data. It only documents future boundaries.

## 13. Production Data/Auth Readiness Gate

Stage 4A-364 updates this schema plan with the final readiness gate before real backend work. It does not create migrations, run Supabase commands, add auth, add API routes, or persist data.

### Schema Work Must Wait For Access Boundaries

Before any table below becomes production data, the implementation stage must define the auth/RLS owner for each row and the route-safe fields allowed to leave the server.

| Future area | Required readiness before implementation |
| --- | --- |
| Customer accounts/auth | Customer identity, account membership, owned-record scoping, staff-only `/customers` boundary, and no unrelated customer data exposure. |
| Secure driver job tokens | One-job scope, token hash storage, expiry, revocation, last-used metadata, audit logging, and driver-safe DTO tests. |
| Real booking save/load | Approved operational fields, locked short-notice `Admin Review Required` behavior, parser/persistence separation, route leak tests, and rollback plan. |
| Admin/customer/driver role boundaries | Admin/staff, dispatcher, finance, customer, driver, public requester, and public token visitor roles mapped before RLS policies are applied. |
| RLS before real data | RLS enabled for customer, driver, finance, public/token, and staff paths before any production rows are exposed outside server-only admin code. |
| API routes before real writes | Server-side validation, auth/role checks, route-safe DTO responses, no service-role secret exposure, no raw table row leaks, and no notification/payment side effects. |
| Amend/cancel/driver assignment audit | `audit_logs` requirements for actor, entity, source route, before/after values, internal notes, and customer/driver redaction before production mutation workflows. |
| Customer/driver notifications | Separate approval for templates, consent, staff approval, delivery logging, retries/failures, and kill switches before `notification_outbox` or sending is used. |
| Invoice/payment/PDF | Separate finance approval for invoice numbers, PDFs, payment links, statements, payouts, PayNow payout details, accounting export, and customer/driver visibility. |

### Data Still Blocked

Do not add or persist these until their own explicit stages approve them:

- Supabase migrations, production writes, and production reads.
- Customer auth, driver auth, and secure driver token behavior.
- Billing records, invoices, payments, PDFs, payment links, payouts, PayNow payout details, payout comparisons, finance posting, and accounting export.
- Notification outbox entries, send logs, WhatsApp/email/SMS/Telegram behavior, and delivery state.
- Live location, proof/photo uploads, file storage, route/provider calls, and parser learning.
- Mock QA/dev archive content, parser/debug internals, internal admin notes, service-role secrets, or server-only secrets in browser-visible data.

### Recommended Schema Implementation Order

1. Auth and role model first: users, roles, claims/session shape, route ownership, server-only secret handling, and RLS ownership model.
2. Secure driver token model: `driver_job_tokens` with token hashes, expiry/revocation, usage audit, and single-job route-safe reads.
3. Booking/customer save/load: `customers`, `customer_contacts`, `bookings`, `booking_route_points`, and `booking_service_items` with approved operational fields only.
4. Amend/cancel/assignment audit: `audit_logs`, `driver_assignments`, and `job_status_events` for reviewed operational changes.
5. Notifications later: `notification_outbox` only after a notification stage approves safe templates, approval flow, delivery logs, and no-send tests.
6. Invoice/payment/PDF later: finance tables only after invoice/payment/PDF, payout, role visibility, and rollback approvals are complete.

## 14. Auth Role Model Implementation Plan

Stage 4A-365 is planning only. It defines the schema ownership and field visibility expectations for the first real auth phase, but it does not add auth code, create tables, create migrations, run Supabase commands, add API routes, or persist data.

### Future Role Ownership Model

| Role | Primary future table scope | Customer/driver-safe output boundary |
| --- | --- | --- |
| Admin / dispatcher | `customers`, `customer_contacts`, `bookings`, `booking_route_points`, `booking_service_items`, `drivers`, `vehicles`, `driver_assignments`, `job_status_events`, and internal `audit_logs`. | Can see operational booking details and internal review status. Finance-only fields should remain separate unless finance role is granted. |
| Customer | Own customer/account-linked `bookings`, safe `booking_route_points`, safe `booking_service_items`, own request/change/cancellation status, and customer-safe driver handoff status. | Must receive customer-safe DTOs only: no driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, internal audit detail, unrelated customer rows, or mock QA/dev archive content. |
| Driver | Assigned `bookings`, assigned `booking_route_points`, job-needed `booking_service_items`, assigned `driver_assignments`, and driver-safe `job_status_events` through assignment or secure token/session. | Must receive driver-safe DTOs only: no customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, unrelated customer account details, parser/debug internals, or mock QA/dev archive content. |
| Finance / admin billing | Later `billing_accounts`, `billing_records`, `invoices`, `payments`, `driver_payouts`, and finance-approved audit records. | Planned later for invoice/payment/payment-status views. Must not be bundled into customer or driver visibility. |

### Auth Sequence Impact On Schema

1. Admin/dispatcher login first.
   - Add staff user identity/role linkage before production operational records are exposed.
   - Make `created_by`, `updated_by`, `assigned_by_user_id`, and audit actor fields meaningful only after this role exists.

2. Customer account login later.
   - Add customer account membership/linking before `/my-bookings` reads production rows.
   - Customer-owned reads must be based on trusted membership, not browser-submitted customer IDs.

3. Secure driver token/session model next.
   - `driver_job_tokens` must store token hashes only.
   - Token/session reads must resolve to one assignment/job and return only driver-safe fields.

4. Finance/admin billing later.
   - Finance fields and finance tables stay blocked until billing/payment/PDF and payout visibility are separately approved.

### RLS And Field Readiness

- `bookings` must separate customer-facing status from admin internal status.
- `booking_service_items` must separate customer-safe labels from admin notes, pricing flags, and billing review fields.
- `driver_assignments` must separate assignment status from payout terms and internal assignment notes.
- `job_status_events` must separate safe status text from actor identity, source details, and internal notes.
- `audit_logs` must be internal by default and must not become a customer or driver data source.
- `driver_job_tokens` must never expose raw token values; token hash, usage metadata, expiry, and revocation details are internal.
- Finance tables remain role-restricted and later-phase only.

### Audit Data Requirements

Future schema work should support audit entries for:

- Booking creation: actor, source route/API, booking reference, customer/account link, source channel, short-notice status, and created status.
- Amend request: requester, booking, requested fields, previous safe values, requested values, review status, and staff decision later.
- Cancellation request: requester, booking, cancellation details, current status, review status, and staff decision later.
- Driver assignment: staff actor, booking, driver, vehicle, previous assignment, assignment status, and redacted internal reason/note.
- Driver status update: driver token/session or staff actor, assignment/job, status, event time, source route/API, and safe customer/driver status mapping.

### Schema Test Requirements Before Real Auth/Save/Load

- Role visibility tests for admin/dispatcher, customer, driver, and later finance/admin billing.
- Route-leak tests covering `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]`.
- Customer no-leak tests for driver payout, PayNow payout, admin notes, parser/debug internals, admin finance, and mock archive content.
- Driver no-leak tests for customer price, billing, invoice/payment, payout comparisons, PayNow payout details, finance notes, admin notes, and mock archive content.
- Browser secret tests proving service-role and server-only secrets never reach route payloads, page text, browser storage, logs, or bundles.
- Parser regression tests before and after persistence/auth work.
- Mobile/no-horizontal-overflow tests before and after customer or driver route changes.

## 15. Secure Driver Token Session Boundary Plan

Stage 4A-368 is planning only. It defines the schema/data-model expectations for future production `/driver-job/[token]` access, but it does not create tables, create migrations, run Supabase commands, add API routes, add driver auth, add customer auth, persist data, or change runtime behavior.

### Future Token Record Model

Future `driver_job_tokens` records should support:

- one booking/assignment scope per token;
- token hash storage only, never raw token storage;
- expiry timestamp;
- revocation timestamp and safe revoke reason if approved;
- created-by staff actor once staff auth/audit exists;
- last-used timestamp and usage metadata if approved;
- rotation/reissue metadata if needed later.

Token hashes, usage metadata, revocation details, and created-by actor fields are internal. They must not be exposed through browser-readable data, public route payloads, customer routes, driver pages, or direct RLS table reads.

### Driver-Safe DTO Boundary

A valid future token may resolve only to a single assigned job DTO containing safe operational fields:

- pickup date/time;
- pickup/drop-off and job-safe route details;
- job-needed service items;
- safe passenger/contact instructions if separately approved;
- status controls/status summary such as OTW, OTS, POB, and completed after future status-action approval.

The DTO must exclude customer price, billing, invoice/payment, driver payout, PayNow payout, payout comparisons, internal finance notes, internal admin notes, parser/debug internals, unrelated customer account data, other customers' jobs, other drivers' jobs, token hash metadata, service-role/server-only secrets, and mock QA/dev archive content.

### Validation And Audit Requirements

Before production driver-token reads or writes:

- Server code must verify job/assignment id, token hash, expiry, revocation state, and allowed action before returning job data.
- Raw tokens must never be stored in browser storage, page text, logs, route responses, or browser-readable tables.
- Expired, revoked, malformed, wrong-job, wrong-assignment, and unknown tokens must be blocked with safe no-secret responses.
- Driver status changes must create internal audit records with driver token/session actor, booking/assignment, status, event time, source route/API, and safe customer/driver status mapping.
- Audit before/after values, internal notes, actor internals, token metadata, and revocation details must remain admin/staff-only.

### Token Test Requirements

Future implementation must add tests proving:

- invalid tokens are blocked;
- expired tokens are blocked;
- revoked tokens are blocked;
- wrong-job and cross-assignment tokens are blocked;
- valid tokens return only one assigned job's driver-safe DTO;
- no customer price, billing, invoice/payment, payout, PayNow payout, finance notes, admin notes, parser/debug internals, service-role/server-only secrets, unrelated customer rows, other driver jobs, or mock QA/dev archive content leaks;
- mobile/no-horizontal-overflow protections continue to pass for `/driver-job/[token]`.

## 16. Booking / Customer Save-Load Implementation Plan

Stage 4A-369 is planning only. It defines the smallest safe future booking/customer save-load path, but it does not create tables, create migrations, run Supabase commands, add API routes, add production reads, add production writes, add customer auth, add driver auth, persist data, or change runtime behavior.

### Smallest Future Save-Load Sequence

1. Keep the admin/dispatcher auth boundary first.
   - Production save/load must start from authenticated admin/dispatcher server-side access.
   - Local/dev behavior may remain available only as an explicitly separated non-production path.

2. Add safe booking records.
   - Start with `bookings`, `booking_route_points`, and `booking_service_items` only for approved operational fields.
   - Keep parser output and parser/debug internals separate from persistence fields.

3. Add safe customer/account records.
   - Start with `customers` and `customer_contacts` for account display name and approved operational contact fields.
   - Do not add customer account login or self-service writes in the first save/load batch.

4. Admin-only create/update first.
   - Admin/dispatcher may create or update approved operational booking/customer fields after auth, RLS, API validation, audit, and rollback are approved.
   - Customer read-only access comes later and must use trusted customer account membership.

5. Driver token access later.
   - Driver token/session reads may only expose assigned job-safe DTOs after the secure driver token boundary is implemented.
   - Driver token access must not read raw booking/customer rows directly.

### Safe First-Write Fields

The first future save/load batch should be limited to:

- booking reference;
- source/channel if needed for operations;
- customer/account display name;
- approved passenger/contact safe details;
- pickup date/time;
- pickup/drop-off and route summary;
- service type;
- route points needed for dispatch;
- service items needed for operations, such as child seat, extra stop, or waiting-time review label without billing math;
- admin internal status and customer-facing safe status;
- short-notice review status;
- request, change, and cancellation review statuses;
- created/updated timestamps and later actor references after auth/audit exists.

### Fields Blocked From First Save-Load

Do not include these in the first save/load batch:

- pricing, customer charges, quote totals, invoice totals, or billing math;
- driver payout, PayNow payout, payout comparisons, payout defaults, or payout review fields;
- invoice, payment, PDF, Stripe, PayNow payout workflow, statement, finance export, or accounting fields;
- internal finance notes;
- internal admin notes unless a later audit/internal-note stage defines redaction and role rules;
- parser/debug internals, raw parser payloads, parser-learning fields, or mock QA/dev archive content;
- notification delivery records, message-send logs, WhatsApp/email/SMS/Telegram delivery state, or notification outbox rows;
- live location, proof/photo, storage paths, maps/geocoding/flight-provider payloads, or upload metadata.

### Required Audit Records Later

Before real mutation workflows are approved, schema planning must support internal audit records for:

- booking created;
- booking amended;
- booking cancelled;
- driver assigned;
- driver status updated.

Audit records must stay internal by default and must not become customer or driver DTO sources except for separately approved safe status summaries.

### RLS And API Requirements

- Admin/dispatcher can write only approved operational fields through server-side validated API routes.
- Customer can later read only their own safe booking/request fields through trusted account membership, not browser-submitted customer IDs.
- Driver token/session can later read only assigned job-safe fields through token/session validation, not raw table access.
- Service-role keys and server-only secrets must stay server-only and must never reach browser bundles, route payloads, page text, logs, or browser storage.
- API responses must return role-specific DTOs rather than raw Supabase rows.
- Unknown fields and blocked finance, payout, notification, parser/debug, proof/photo, live-location, and billing fields must be rejected.

### Save-Load Test Requirements

Before implementation, tests must prove:

- no customer price leak on public/customer/driver routes;
- no driver payout or PayNow payout leak on customer/driver routes;
- no service-role or server-only secret leak to browser-visible bundles, responses, storage, logs, or page text;
- route-leak coverage for `/book`, `/my-bookings`, `/customers`, `/driver-job-demo`, and `/driver-job/[token]`;
- parser regression coverage remains unchanged;
- mobile/no-horizontal-overflow coverage remains protected;
- invalid role/session requests are blocked safely;
- invalid, expired, revoked, or wrong-job driver token requests are blocked safely before driver production reads are enabled.

## 17. Audit Records / Rollback Implementation Plan

Stage 4A-370 is planning only. It defines audit record and rollback boundaries before any real booking/customer save-load implementation, but it does not create audit tables, create migrations, run Supabase commands, add API routes, add production reads, add production writes, add customer auth, add driver auth, persist data, or change runtime behavior.

### Audit Workflows To Support Later

Future audit planning must cover these mutation workflows before they become real:

- booking created;
- booking amended;
- booking cancelled;
- customer amend request reviewed;
- customer cancellation request reviewed;
- driver assigned;
- driver status updated;
- admin/dispatcher override.

Audit records are internal operational records by default. Customer and driver routes must not read raw audit rows or internal before/after values.

### Safe Audit Fields

The first audit model should store only safe operational metadata such as:

- actor role;
- action type;
- booking reference;
- before/after safe operational snapshot;
- reason or review note;
- timestamp;
- source surface.

The before/after snapshot should include approved operational status, route, pickup, assignment, and request-review values only. It must not become a place to store finance, payout, parser/debug, notification, proof/photo, or billing payloads.

### Blocked Audit Fields

The first audit implementation must reject or omit:

- pricing, customer charges, quote totals, invoice totals, or billing math;
- driver payout, PayNow payout, payout comparisons, payout defaults, and payout review fields;
- invoice, payment, PDF, Stripe, PayNow payout workflow, billing automation, statement, finance export, and accounting fields;
- internal finance notes;
- parser debug internals, raw parser payloads, parser-learning data, and mock QA/dev archive content;
- live location, proof/photo content, storage paths, maps/geocoding/flight-provider payloads, or upload metadata.

### Rollback Boundaries

Rollback should be an explicit admin/dispatcher-reviewed operation, not an automatic side effect.

- Rollback may restore approved safe operational fields only.
- Rollback must not send automatic customer notifications.
- Rollback must not send automatic driver notifications.
- Rollback must not create billing, payment, invoice, PDF, payout, PayNow payout, finance, accounting, proof/photo, live-location, parser-learning, or notification side effects.
- Rollback must not reverse billing/payment/payout state because those workflows are not part of the first save-load scope.
- Sensitive changes require manual admin review before a rollback action is accepted.
- Rollback responses must return route-safe DTOs, not raw audit rows or raw Supabase records.

### Audit And Rollback Test Requirements

Before audit or rollback implementation, tests must prove:

- an audit record is created for each approved future write path;
- customer and driver routes cannot see internal audit fields;
- public, customer, driver, anonymous, malformed staff, and invalid-role requests cannot write audit records;
- rollback cannot expose finance, payout, private driver, internal admin, parser/debug, billing/payment, invoice/PDF, proof/photo, live-location, or mock archive data;
- rollback cannot create automatic customer or driver notifications;
- route-leak coverage and mobile/no-horizontal-overflow coverage continue to pass.

### Still Blocked After Stage 4A-370

Real audit tables, rollback APIs, migrations, Supabase CLI commands, API routes, production reads, production writes, real save/load, customer auth, driver auth, notification sending, billing/payment/PDF behavior, Stripe, PayNow payout, finance automation, live location, proof/photo, parser-learning, payout behavior, and driver workflow automation remain blocked until later explicit implementation stages.

## 18. First Persistence API / RLS Contract Checklist

Stage 4A-371 is planning/checklist only. It defines the exact first booking/customer persistence API and RLS contract checklist before any real migration or API implementation, but it does not create tables, create migrations, run Supabase commands, add API routes, add production reads, add production writes, add real save/load, add customer auth, add driver auth, persist data, or change runtime behavior.

### First Future Admin-Only API Contract

The first future persistence API batch should be admin/dispatcher-only and should include only these operational contracts:

1. Create booking/customer operational snapshot.
   - Creates or links a safe customer/account display record.
   - Creates a safe operational booking snapshot with route, service, contact, and status fields.
   - Does not create invoice, payment, payout, notification, PDF, proof/photo, live-location, parser-learning, or finance records.

2. Update safe operational booking fields.
   - Updates approved operational fields only.
   - Does not accept pricing, payout, billing, invoice/payment, parser/debug, finance, notification, live-location, proof/photo, or mock archive fields.
   - Requires audit creation and rollback eligibility checks before future implementation.

3. Read admin operational records.
   - Returns admin/dispatcher operational DTOs only.
   - Does not return raw Supabase rows, service-role details, parser/debug internals, finance fields, payment fields, payout fields, private driver token metadata, or mock QA/dev archive content.

### Safe DTO Fields

The first contract may expose only route-safe operational fields such as:

- booking reference;
- customer/account display name;
- pickup date/time;
- pickup/drop-off and route summary;
- service type;
- passenger/contact safe details;
- admin internal status and customer-facing safe status;
- request, change, and cancellation review statuses.

Customer-safe DTOs and driver-safe DTOs are later contracts. They must not reuse admin DTOs directly.

### Validation Requirements

Future API validation must require:

- required booking/customer fields for create and update paths;
- safe enum/status values for admin internal status, customer-facing status, short-notice status, request review status, change review status, and cancellation review status;
- server-side rejection of unknown fields;
- server-side rejection of pricing, customer charge, payout, PayNow payout, invoice/payment, PDF, billing, finance, and accounting fields;
- server-side rejection of parser/debug internals, parser-learning fields, raw parser payloads, internal finance fields, private driver token metadata, mock QA/dev archive content, live-location fields, proof/photo fields, storage paths, and notification delivery fields.

### RLS Rules Required Before Implementation

Before implementation:

- admin/dispatcher writes must be allowed only after server-side role verification;
- customer read-only access to own safe booking/request fields must be planned as a later, separate role contract;
- driver token read-only access to assigned job-safe fields must be planned as a later, separate token contract;
- service-role keys must stay server-only and must never reach browser bundles, page text, route payloads, logs, browser storage, or test output;
- API handlers must return role-safe DTOs rather than raw table rows.

### Audit Requirements

Future create/update flows must create internal audit entries for:

- booking/customer snapshot created;
- safe operational booking fields updated;
- booking amended;
- booking cancelled;
- customer amend request reviewed;
- customer cancellation request reviewed;
- driver assigned;
- driver status updated.

Audit records must not expose blocked finance, pricing, payout, parser/debug, private driver, internal review, invoice/payment/PDF, proof/photo, live-location, notification, or mock archive fields to customer or driver routes.

### Rollback Acceptance Rules

Future rollback must be accepted only when:

- it restores safe operational fields only;
- it has manual admin/dispatcher review for sensitive changes;
- it does not send automatic customer notifications;
- it does not send automatic driver notifications;
- it does not reverse billing, payment, invoice, PDF, payout, PayNow payout, finance, accounting, proof/photo, live-location, parser-learning, or notification state;
- it returns route-safe DTOs only.

### Rejection Cases

The future implementation must reject:

- unauthenticated role access;
- invalid role access;
- invalid, expired, revoked, malformed, or wrong-job driver token access;
- wrong customer access to another customer/account record;
- wrong driver access to another assigned job;
- unsafe payloads containing blocked or unknown fields;
- browser-submitted service-role secrets, actor metadata, audit snapshots, raw token values, parser/debug payloads, finance fields, payout fields, invoice/payment/PDF fields, proof/photo fields, live-location fields, or notification delivery fields.

### Required Tests Before Real Implementation

Before real persistence implementation, tests must prove:

- no customer price leak;
- no driver payout or PayNow payout leak;
- no service-role or server-only secret browser leak;
- no public route admin/internal leak;
- parser regression tests still pass and parser behavior is unchanged;
- mobile/no-horizontal-overflow tests still pass;
- invalid role, invalid session, invalid token, wrong-customer, wrong-driver, and unsafe-payload rejection tests pass.

### Still Blocked After Stage 4A-371

Real persistence APIs, migrations, Supabase CLI commands, production reads, production writes, real save/load, customer auth, driver auth, notification sending, billing/payment/PDF behavior, Stripe, PayNow payout, finance automation, live location, proof/photo, parser-learning, payout behavior, and driver workflow automation remain blocked until later explicit implementation stages.

## 19. First Persistence Migration / API / RLS Implementation Draft

Stage 4A-372 consolidates the completed backend planning into one schema-focused first-persistence implementation draft. This is planning/docs only. It does not create tables, create migration files, run Supabase commands, add API routes, add production reads, add production writes, add real save/load, add customer auth, add driver auth, persist data, or change runtime behavior.

### Future First Tables And Safe Fields

The first approved migration should start with only these safe operational tables and fields:

| Future table | Safe first fields |
| --- | --- |
| `customers` | `id`, customer/account display name, safe account status if needed, created timestamp, updated timestamp, created/updated actor role metadata after auth is approved. |
| `customer_contacts` | `id`, `customer_id`, safe contact name/label, safe phone/email if operationally needed, primary contact marker, created timestamp, updated timestamp. |
| `bookings` | `id`, booking reference, `customer_id`, pickup date/time, pickup/drop-off/route summary, service type, passenger/contact safe details, `admin_internal_status`, `customer_facing_status`, `short_notice_review_status`, request/change/cancel review statuses, created timestamp, updated timestamp, created/updated actor role metadata. |
| `booking_route_points` | `id`, `booking_id`, sequence, safe point type, location text, pickup/drop-off/extra-stop marker, created timestamp, updated timestamp. |
| `booking_service_items` | `id`, `booking_id`, safe service item type, quantity/value if operational, safe service note, created timestamp, updated timestamp. |
| `audit_logs` | `id`, `booking_id` or booking reference, actor role, action type, timestamp, source surface, reason/review note, safe before/after operational snapshot, redaction marker. |

`customer_contacts`, `booking_route_points`, and `booking_service_items` may be omitted from the first migration only if the first `customers` and `bookings` tables still preserve the approved safe summary fields without adding blocked data.

### Fields Blocked From First Persistence

The first persistence batch must not include:

- customer pricing, customer charge, quote totals, invoice totals, or billing math;
- driver payout, PayNow payout, payout comparisons, payout defaults, or payout review fields;
- invoice, payment, PDF, Stripe, PayNow payout workflow, billing automation, statement, finance export, payment link, or accounting fields;
- internal finance notes;
- parser/debug internals, raw parser payloads, parser-learning fields, or mock archive / mock QA / dev workbench content;
- notification delivery records, notification outbox rows, send logs, WhatsApp/email/SMS/Telegram delivery state, or message-channel behavior;
- live location, proof/photo content, storage paths, maps/geocoding/flight-provider payloads, or upload metadata.

### RLS Policy Intention

- Admin/dispatcher can read/write safe operational fields only after server-side role verification.
- Customer read-only access to own safe booking/request fields is later and must be backed by trusted account membership.
- Driver token read-only access to assigned job-safe fields is later and must be backed by token hash, expiry, revocation, and job-scope validation.
- No public anonymous write access is included in the first persistence migration/API batch.
- Service-role keys stay server-only and must never reach browser bundles, page text, route payloads, logs, browser storage, or test output.
- RLS must be enabled before production use.
- Policies must be reviewed before API write activation.

### API Contract Intention

The first future API should be admin-only:

- create operational booking/customer snapshot;
- update safe operational booking fields;
- read operational records;
- no customer auth in the first batch;
- no driver auth in the first batch;
- no public write path;
- unsafe payloads rejected;
- invalid role/token/session rejected safely;
- responses return role-safe DTOs rather than raw rows.

### Audit And Rollback Requirements

Audit must cover booking created, booking amended, booking cancelled, customer amend request reviewed, customer cancellation request reviewed, driver assigned, driver status updated, and admin/dispatcher override.

Rollback must restore safe operational fields only, must not trigger customer notification, must not trigger driver notification, must not reverse billing/payment/payout state, and must require manual admin review for sensitive rollback.

### Validation, Rejection, And Test Requirements

Future validation must require approved fields and safe enum/status values, reject unknown fields, reject unsafe payloads, reject unauthenticated or invalid roles, reject invalid/wrong driver tokens, reject wrong customer/driver access, and reject any browser-submitted service-role secrets or blocked private data.

Required checks before real migration/API implementation:

- `npm run test:parser`;
- `npm run lint`;
- `npm run build`;
- `npm run test:booking-ui-browser`;
- `npm run test:driver-job-page-browser`;
- `npm run test:app-smoke-browser`;
- `npm run test:mobile-usability-browser`;
- `npm run test:safe`;
- route leak tests;
- no customer price leak;
- no driver payout leak;
- no service-role browser leak;
- invalid role/token rejection tests;
- mobile/no-horizontal-overflow tests.

### Next Real Migration Step

The next stage should be the first real migration implementation, step-by-step, only after William explicitly approves migration work. That stage should name the exact migration file, table columns, RLS policies, API validation contracts, audit linkage, rollback review handling, backup/export check, and test commands before any Supabase command is run.

## 20. Future Implementation Sequence

Recommended future stages after this readiness gate:

1. Admin/dispatcher auth implementation planning.
2. Secure driver token/session boundary planning.
3. Smallest approved booking/customer save-load implementation planning after auth and token boundaries are explicit.
4. Audit records and rollback boundary planning before mutation workflows.
5. First persistence API/RLS contract checklist before implementation.
6. Consolidated first persistence migration/API/RLS implementation draft.
7. First real migration implementation only after William explicitly approves migration work.
8. Notifications later.
9. Invoice/payment/PDF later.

Stage 4A-298 plans future migration, RLS, and API boundaries for this schema. It does not create migrations, run Supabase commands, add API routes, or activate persistence.

Stage 4A-300 plans future test guards for accidental Supabase/API/runtime calls before schema implementation. It does not change tests, package scripts, migrations, API routes, database connections, or persistence.

First real workflow candidates, ranked by safety:

1. First real migration implementation, step-by-step, only after William explicitly approves migration work.
2. First admin-only persistence API implementation after migration and RLS policies are reviewed.
3. Customer/driver read contracts later after admin-only persistence is stable.

The next stage should be the first real backend phase only if it explicitly preserves the readiness gate above.
