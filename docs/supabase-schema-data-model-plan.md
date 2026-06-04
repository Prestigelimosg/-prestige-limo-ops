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

## 16. Future Implementation Sequence

Recommended future stages after this readiness gate:

1. Admin/dispatcher auth implementation planning.
2. Secure driver token/session boundary planning.
3. Smallest approved booking/customer save/load implementation after auth boundaries are explicit.
4. Amend/cancel/assignment audit implementation.
5. Notifications later.
6. Invoice/payment/PDF later.

Stage 4A-298 plans future migration, RLS, and API boundaries for this schema. It does not create migrations, run Supabase commands, add API routes, or activate persistence.

Stage 4A-300 plans future test guards for accidental Supabase/API/runtime calls before schema implementation. It does not change tests, package scripts, migrations, API routes, database connections, or persistence.

First real workflow candidates, ranked by safety:

1. Admin/dispatcher auth boundary implementation.
2. Secure driver token model boundary planning.
3. Admin/customer booking persistence with strict tests after auth/RLS planning is accepted.

The next stage should be the first real backend phase only if it explicitly preserves the readiness gate above.
