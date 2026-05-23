# Customer Payment Schema and RLS Proposal

This is a proposal only. No migration, schema change, Supabase command, payment API, bank API, notification sending, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This proposal turns the current customer/payment planning documents into a concrete review target before any production implementation. It is meant to help the business and engineering review the future Supabase schema shape, RLS policy boundaries, server-only route design, invoice sequence safety, manual payment tracking, audit events, customer folder isolation, and production approval gates.

Nothing in this document authorizes a database migration, Supabase schema change, payment provider integration, bank integration, notification sending, real invoice generation, real statement generation, or production payment workflow.

## 2. Current Protected Mock State

The protected customer/payment workflow is currently mock-only and local-only:

- `/customers` is a search-first dashboard.
- `/customers` does not show all customer rows by default.
- The dashboard shows `Outstanding Payments Review`.
- The dashboard has mock manual payment controls: Mark Invoice Sent, Record Partial Payment, Mark Paid, and Waive Balance.
- `Mock Payment Event Log` records local mock payment actions only.
- `Collection Follow-up Queue` shows outstanding collection follow-up rows.
- `Mock Follow-up Event Log` records local mock follow-up actions only.
- `Monthly Account Statement Preview` groups monthly-account balance-due rows for preview only.
- `Mock Statement Preview Log` records local mock statement preview actions only.
- Customer folders show `Payment Collection Detail`.
- `Payment Collection Detail` is selected-customer-only.
- UBS, Ritz Carlton, and Individual VIP Customer folders must not leak each other's active collection rows.
- Paid rows stay visible in history but are excluded from active collection due rows.
- Local mock actions reset on refresh and are not persisted.

The current mock workflow does not write to Supabase and does not create payment records, invoice records, statement records, bank records, notification records, webhook records, or production customer/payment records.

## 3. Proposed Production Roles

Roles are proposed for review only. Exact auth source, role storage, and mapping to Supabase JWT claims remain unresolved.

### Dispatcher

Purpose:
- Read assigned operational customer folders.
- Review outstanding balances and follow-ups.
- Link bookings to customers where allowed.
- Request or record manual payment status changes only through approved server routes.

Open decisions:
- Whether all dispatchers can see all customers or only scoped customers.
- Whether dispatchers can issue invoice numbers or only request invoice issue.
- Whether dispatchers can waive or refund balances.

### Admin

Purpose:
- Full internal access to customer/payment records.
- Manage customers, contacts, invoice prefixes, payment statuses, follow-ups, statements, and audit review.
- Approve protected actions such as prefix changes, voids, waivers, and refunds.

Open decisions:
- Whether admin role is a single role or split into operations admin and finance admin.
- Whether admin can edit contacts directly from the client or only through server routes.

### Read-only / Accounting Reviewer

Purpose:
- Read customer folders, invoices, statements, payment status, and audit events.
- Support finance review without mutation rights.

Open decisions:
- Whether this role can export records.
- Whether this role can see contact details, internal notes, and documents.

### Service Role

Purpose:
- Used only by trusted server-side operations.
- Performs transaction-safe invoice sequence allocation.
- Performs validated writes after role checks.
- Creates append-only audit events.

Rules:
- Public client code must not use service-role credentials.
- Service-role usage should be limited to server routes or server actions with strict validation.
- Every service-role mutation should record an audit event where applicable.

## 4. Proposed Tables

All tables below are proposal-only. No SQL is included and no migration is approved.

### `customers`

Purpose:
- Store one internal customer/company folder per customer or company.
- Provide stable customer identity for bookings, invoices, payments, follow-ups, and statements.

Key columns:
- `id`
- `display_name`
- `legal_name`
- `account_type`
- `invoice_prefix`
- `payment_terms`
- `status`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Sensitive columns:
- Internal account notes.
- Private billing terms.
- VIP or confidential account flags.

Public-safe columns, if any:
- None for the current internal-only app.
- Future customer-facing links would need a separate approved public-safe projection.

RLS expectations:
- Dispatcher/admin can read authorized customers.
- Admin can create/update customers through server routes.
- Prefix changes require elevated approval and audit.
- No public client direct writes.

Indexes:
- Primary key on `id`.
- Unique index on `invoice_prefix`.
- Search index on normalized `display_name` and `legal_name`.
- Optional index on `status` and `account_type`.

Audit requirements:
- Create, update, status change, invoice prefix change, and merge/archive events should be audited.
- Prefix changes must include old and new prefix and must not rewrite issued history.

### `customer_contacts`

Purpose:
- Store customer folder contacts separately from booking passengers.
- Support billing, operations, concierge, booker, and account contacts.

Key columns:
- `id`
- `customer_id`
- `contact_type`
- `name`
- `phone`
- `email`
- `whatsapp`
- `notes`
- `is_primary`
- `created_at`
- `updated_at`
- `created_by`
- `updated_by`

Sensitive columns:
- Phone numbers.
- Email addresses.
- WhatsApp numbers.
- Contact notes.

Public-safe columns, if any:
- None by default.
- Public-safe contact fields require explicit customer-facing link approval.

RLS expectations:
- Dispatcher/admin can read contacts for authorized customers.
- Admin or approved dispatcher can create/update contacts through server routes.
- Contact rows must be scoped by `customer_id`.

Indexes:
- Index on `customer_id`.
- Optional index on `contact_type`.
- Optional uniqueness rule for one primary billing contact per customer, if approved.

Audit requirements:
- Contact create, update, primary contact change, and delete/archive should be audited.
- Sensitive contact changes should include actor and timestamp.

### `customer_invoice_sequences`

Purpose:
- Track transaction-safe running invoice numbers per customer prefix.
- Prevent duplicate or reused invoice numbers.

Key columns:
- `id`
- `customer_id`
- `invoice_prefix`
- `next_number`
- `last_issued_number`
- `locked_at`
- `created_at`
- `updated_at`

Sensitive columns:
- Sequence state and lock metadata.

Public-safe columns, if any:
- None.

RLS expectations:
- Dispatcher/admin may read sequence summary only if needed.
- No public client writes.
- Sequence allocation must happen in a server-side transaction or RPC.
- Service role performs allocation after role checks.

Indexes:
- Unique index on `customer_id`.
- Unique index on `invoice_prefix`.
- Index on `updated_at` for audit review.

Audit requirements:
- Every invoice number issued must create an immutable audit event.
- Sequence allocation failure, retry, and rollback handling should be logged server-side.

### `booking_customer_links`

Purpose:
- Link bookings to customers without overloading booking parser output.
- Preserve selected-customer folder isolation.

Key columns:
- `id`
- `booking_id`
- `customer_id`
- `link_status`
- `match_source`
- `match_confidence`
- `linked_by`
- `linked_at`
- `unlinked_by`
- `unlinked_at`
- `note`

Sensitive columns:
- Match reason and notes.
- Internal linking decisions.

Public-safe columns, if any:
- None.

RLS expectations:
- Dispatcher/admin can read links for authorized bookings and customers.
- Dispatcher/admin can link or unlink only through server routes.
- No cross-customer leakage through joins.

Indexes:
- Index on `booking_id`.
- Index on `customer_id`.
- Unique active link per booking, if one booking can belong to only one customer.
- Index on `link_status`.

Audit requirements:
- Link, unlink, relink, and match override events must be audited.
- Old customer and new customer should be recorded for relinks.

### `booking_payments`

Purpose:
- Store manual payment status and balance information for customer-linked bookings.
- Support unpaid, invoice-sent, partially paid, paid, overdue, waived, refunded, and cancelled states.

Key columns:
- `id`
- `booking_id`
- `customer_id`
- `invoice_id`
- `payment_status`
- `quoted_price`
- `amount_paid`
- `balance_due`
- `payment_method`
- `payment_reference`
- `payment_notes`
- `due_date`
- `received_at`
- `recorded_by`
- `last_follow_up_at`
- `next_follow_up_at`
- `created_at`
- `updated_at`

Sensitive columns:
- Payment reference.
- Payment notes.
- Manual receipt details.
- Actor and timing metadata.

Public-safe columns, if any:
- None for internal-only.
- A future customer-facing payment status view would need a separate approved safe projection.

RLS expectations:
- Dispatcher/admin can read payment records for authorized customers.
- Writes must go through server-only routes.
- Paid, waived, refunded, and cancelled actions require role checks.
- No direct public client writes.

Indexes:
- Index on `customer_id`.
- Index on `booking_id`.
- Index on `payment_status`.
- Index on `due_date`.
- Index on `next_follow_up_at`.
- Composite index on `customer_id, payment_status`.

Audit requirements:
- Every manual status or amount change must create a payment event.
- Old and new values must be captured for status, amount paid, balance due, due date, and reference changes.

### `payment_events`

Purpose:
- Provide immutable audit history for payment, invoice, statement, and follow-up actions.

Key columns:
- `id`
- `customer_id`
- `booking_id`
- `booking_payment_id`
- `invoice_id`
- `statement_id`
- `event_type`
- `actor_id`
- `actor_role`
- `event_at`
- `old_value`
- `new_value`
- `reference`
- `note`
- `created_at`

Sensitive columns:
- Old/new values.
- Reference and note.
- Actor details.

Public-safe columns, if any:
- None.

RLS expectations:
- Dispatcher/admin can read events for authorized customers.
- Events are append-only.
- No update/delete from public client.
- Server routes create events after validating the action.

Indexes:
- Index on `customer_id`.
- Index on `booking_id`.
- Index on `invoice_id`.
- Index on `statement_id`.
- Index on `event_type`.
- Index on `event_at`.

Audit requirements:
- This table is the audit source.
- Events must be immutable.
- Corrections should be new events, not edits to existing events.

### `invoices`

Purpose:
- Store issued invoice numbers and invoice metadata after explicit approval.
- Support immutable invoice numbers and customer-specific prefixes.

Key columns:
- `id`
- `customer_id`
- `booking_id`
- `invoice_number`
- `invoice_prefix`
- `sequence_number`
- `invoice_status`
- `amount`
- `balance_due`
- `issued_at`
- `issued_by`
- `due_date`
- `voided_at`
- `voided_by`
- `note`
- `created_at`
- `updated_at`

Sensitive columns:
- Amounts.
- Notes.
- Void reason.
- Actor metadata.

Public-safe columns, if any:
- None by default.
- Future customer-facing invoice views require explicit approval.

RLS expectations:
- Dispatcher/admin can read invoices for authorized customers.
- Invoice creation requires server route and sequence allocation.
- Issued invoice numbers are immutable.
- No public client direct writes.

Indexes:
- Unique index on `invoice_number`.
- Composite unique index on `invoice_prefix, sequence_number`.
- Index on `customer_id`.
- Index on `booking_id`.
- Index on `invoice_status`.
- Index on `due_date`.

Audit requirements:
- Invoice number issued, status changed, voided, corrected, and linked/unlinked events must be audited.
- Issued invoice number must never be reused.

### `customer_statements`

Purpose:
- Group monthly-account jobs or invoices by `customer_id` and period.
- Support statement preview first, then generated statement records only after approval.

Key columns:
- `id`
- `customer_id`
- `statement_number`
- `statement_period_start`
- `statement_period_end`
- `statement_status`
- `total_amount`
- `amount_due`
- `generated_at`
- `generated_by`
- `sent_at`
- `sent_by`
- `note`
- `created_at`
- `updated_at`

Sensitive columns:
- Amounts.
- Statement notes.
- Sent metadata.

Public-safe columns, if any:
- None by default.
- Future customer-facing statement links require separate approval.

RLS expectations:
- Dispatcher/admin can read statements for authorized customers.
- Statement generation requires server route approval.
- Statement sending is not allowed until notification policy is approved.
- Rows must be scoped by `customer_id`.

Indexes:
- Index on `customer_id`.
- Index on statement period.
- Unique index on `statement_number` if statement numbering is approved.
- Index on `statement_status`.

Audit requirements:
- Statement previewed, generated, corrected, sent, and cancelled events should be audited.
- Generated statement totals must exclude fully paid rows from amount due.

### `follow_up_events`

Purpose:
- Track manual collection follow-up scheduling and completion.
- Preserve collection history without sending notifications by default.

Key columns:
- `id`
- `customer_id`
- `booking_id`
- `booking_payment_id`
- `invoice_id`
- `statement_id`
- `follow_up_type`
- `status`
- `scheduled_for`
- `completed_at`
- `actor_id`
- `note`
- `created_at`
- `updated_at`

Sensitive columns:
- Follow-up notes.
- Actor metadata.
- Customer contact context.

Public-safe columns, if any:
- None.

RLS expectations:
- Dispatcher/admin can read follow-ups for authorized customers.
- Dispatcher/admin can schedule or complete follow-ups through server routes.
- No automated message sending without separate notification approval.
- No cross-customer leakage through payment or statement joins.

Indexes:
- Index on `customer_id`.
- Index on `scheduled_for`.
- Index on `status`.
- Index on `booking_payment_id`.

Audit requirements:
- Follow-up scheduled, rescheduled, completed, cancelled, and note-added events must be audited.
- Notification-related fields should remain unused until notification policy is approved.

### `document_receipts` Later Only

Purpose:
- Later-only storage metadata for receipts, vouchers, invoices, and statement documents.
- Not part of the first production implementation unless explicitly approved.

Key columns:
- `id`
- `customer_id`
- `booking_id`
- `invoice_id`
- `statement_id`
- `document_type`
- `storage_bucket`
- `storage_path`
- `uploaded_by`
- `uploaded_at`
- `retention_until`
- `note`

Sensitive columns:
- Storage path.
- Document metadata.
- Retention details.
- Uploaded-by metadata.

Public-safe columns, if any:
- None by default.

RLS expectations:
- Storage policies and table RLS must be designed together.
- Dispatcher/admin can read documents for authorized customers only.
- Upload/delete requires server-side validation and retention rules.

Indexes:
- Index on `customer_id`.
- Index on `booking_id`.
- Index on `invoice_id`.
- Index on `statement_id`.
- Index on `document_type`.

Audit requirements:
- Upload, replace, archive, delete, and access-link creation must be audited.
- Document retention and deletion policy must be approved before implementation.

## 5. Customer Folder Isolation Model

Production customer folders must prevent cross-customer leakage by design:

- All folder queries must be scoped by `customer_id`.
- Booking links must be scoped by `customer_id`.
- Payment records must be scoped by `customer_id`.
- Follow-up records must be scoped by `customer_id`.
- Invoice records must be scoped by `customer_id`.
- Statement records must be scoped by `customer_id`.
- Document metadata must be scoped by `customer_id`.
- Customer folders must not expose driver payout.
- Customer folders must not expose private CRM/internal data beyond what authorized dispatcher/admin roles are allowed to see.
- Customer contacts must remain separate from booking passengers where needed.
- UBS/Ritz/VIP-style isolation tests must verify that unrelated invoices never appear in another customer's folder.

Server queries should prefer explicit `customer_id` filters and should not rely on client-side filtering for security. Any dashboard aggregate should be built from authorized customer scopes only.

## 6. Manual Payment Status Model

Proposed statuses:

- Unpaid
- Payment Requested
- Invoice Sent
- Partially Paid
- Paid
- Overdue
- Waived
- Refunded
- Cancelled, if needed

Proposed fields:

- `quoted_price`
- `amount_paid`
- `balance_due`
- `payment_method`
- `payment_reference`
- `payment_notes`
- `due_date`
- `received_at`
- `recorded_by`
- `last_follow_up_at`
- `next_follow_up_at`

Behavior expectations:

- Completed job plus balance due should appear as outstanding.
- Due date passed plus balance due should appear as overdue.
- Partial payment should keep the balance visible.
- Paid bookings should leave active collection due views but remain in customer history.
- Waived/refunded/cancelled statuses require clear audit events and role approval.
- Monthly account rows can be grouped into statements later.

## 7. Payment Event Audit Model

Payment events should be immutable and append-only. Corrections should create new events rather than editing or deleting old events.

Proposed event types:

- payment requested
- invoice sent
- partial payment received
- payment received
- waived
- refunded
- follow-up scheduled
- follow-up completed
- invoice number issued
- statement previewed/generated later

Each event should include:

- actor
- actor role
- timestamp
- customer id
- booking id, when applicable
- booking payment id, when applicable
- invoice id, when applicable
- statement id, when applicable
- old value, where applicable
- new value, where applicable
- reference
- note
- immutable event history rules

Audit requirements:

- No event updates from the public client.
- No event deletes except possibly admin-only retention handling after explicit policy approval.
- Every manual payment status update must produce a matching event.
- Every invoice number issue must produce a matching event.
- Every statement generation must produce a matching event if statement generation is later approved.

## 8. Invoice Sequence Proposal

Invoice safety rules:

- Each customer has a fixed invoice prefix.
- Invoice numbers run sequentially per prefix.
- Issued invoice numbers are unique.
- Issued invoice numbers are immutable.
- Issued invoice numbers are never reused.
- Prefix changes do not rewrite issued history.
- Voided, refunded, cancelled, or corrected invoices keep their original issued invoice number.
- No client-side invoice number allocation is allowed.

Production sequence allocation likely requires:

- A trusted server-only route or server action.
- A database transaction or RPC.
- Row-level locking or equivalent transaction safety on the customer sequence row.
- Audit event creation in the same trusted workflow.
- Clear retry behavior if two users request an invoice number at the same time.

The first production implementation should not issue numbers from browser-only code or local state.

## 9. Statement Proposal

Monthly account statement rules:

- Statement grouping should be by `customer_id` and statement period.
- Fully paid rows should be excluded from amount due.
- Paid rows may remain visible in history or support detail if approved.
- Statement preview can calculate proposed grouping before generation.
- Statement number allocation is future-only.
- Generated statement records require explicit approval.
- No statement sending is allowed until notification and customer-facing policy is approved.
- No payment link or provider workflow is implied by a statement.

The current mock `Monthly Account Statement Preview` should remain a preview model only until schema, RLS, numbering, generation, and sending policy are approved.

## 10. RLS Proposal

This section describes policy shape only, not SQL.

### `customers`

- Dispatcher/admin read: can read authorized customers.
- Dispatcher/admin write: admin only, through server route; dispatcher writes only if explicitly approved.
- Service role: can create/update after server route validation.
- Public client direct writes: blocked.
- Cross-customer leakage: blocked through role/customer scope.

### `customer_contacts`

- Dispatcher/admin read: can read contacts for authorized customers.
- Dispatcher/admin write: server route only, with role checks.
- Service role: can write after validating customer access.
- Public client direct writes: blocked.
- Cross-customer leakage: contacts must be joined by scoped `customer_id`.

### `customer_invoice_sequences`

- Dispatcher/admin read: limited read if needed for folder display.
- Dispatcher/admin write: blocked from direct writes.
- Service role: allocates numbers in transaction/RPC only.
- Public client direct writes: blocked.
- Cross-customer leakage: sequence rows scoped by `customer_id`; prefix uniqueness enforced.

### `booking_customer_links`

- Dispatcher/admin read: can read links for authorized bookings/customers.
- Dispatcher/admin write: link/unlink through server routes only.
- Service role: can mutate after validating booking and customer access.
- Public client direct writes: blocked.
- Cross-customer leakage: links must not expose unrelated customer ids or bookings.

### `booking_payments`

- Dispatcher/admin read: can read authorized customer payment records.
- Dispatcher/admin write: server route only.
- Service role: validates status transition and creates audit event.
- Public client direct writes: blocked.
- Cross-customer leakage: all queries scoped by `customer_id` and authorized booking link.

### `payment_events`

- Dispatcher/admin read: can read events for authorized customers.
- Dispatcher/admin write: no direct writes.
- Service role: append-only event creation after validated action.
- Public client direct writes: blocked.
- Cross-customer leakage: events scoped by `customer_id`.
- Append-only behavior: no update/delete for normal users.

### `invoices`

- Dispatcher/admin read: can read authorized customer invoices.
- Dispatcher/admin write: server route only for issue/status change.
- Service role: creates invoices after sequence allocation.
- Public client direct writes: blocked.
- Cross-customer leakage: invoices scoped by `customer_id`.
- Immutable fields: issued invoice number, prefix, and sequence number.

### `customer_statements`

- Dispatcher/admin read: can read authorized customer statements.
- Dispatcher/admin write: server route only after statement approval.
- Service role: creates statements after validating customer and period.
- Public client direct writes: blocked.
- Cross-customer leakage: statement rows and included invoice rows scoped by `customer_id`.

### `follow_up_events`

- Dispatcher/admin read: can read follow-ups for authorized customers.
- Dispatcher/admin write: server route only.
- Service role: creates or completes follow-ups after validation.
- Public client direct writes: blocked.
- Cross-customer leakage: follow-ups scoped by `customer_id`.

### `document_receipts`

- Dispatcher/admin read: can read document metadata for authorized customers only.
- Dispatcher/admin write: server route only after storage policy approval.
- Service role: validates storage path and customer scope.
- Public client direct writes: blocked.
- Cross-customer leakage: table RLS and storage policies must align.

## 11. Server-only Route Proposal

Future server-only routes or server actions may include:

- get customer dashboard summary
- get customer folder
- link booking to customer
- update manual payment status
- create payment event
- issue invoice number
- get statement preview
- create statement later only after approval

Route rules:

- Public client must not directly write customer/payment tables.
- Server routes must validate actor role, customer scope, booking scope, and requested transition.
- Server routes must create audit events for write actions.
- Service role must stay server-side only.
- Payment provider, bank, webhook, notification, WhatsApp, email, and SMS integrations are not included in this proposal.

## 12. Testing Plan Before Any Migration

Required tests before production migration or implementation:

- Parser regression remains protected.
- Driver Dispatch copy remains unchanged.
- Customer Copy remains unchanged.
- Job Card copy remains unchanged.
- Customer folder isolation works.
- Unrelated invoices do not leak into another customer folder.
- Driver payout is not exposed in customer folders or customer-facing views.
- Private CRM data is not exposed outside authorized dispatcher/admin views.
- Paid rows are excluded from active collection due rows.
- Partial, unpaid, overdue, invoice-sent, and monthly-account balance-due rows are included where expected.
- Payment update creates an audit event.
- Invoice sequence uniqueness is transaction-safe.
- Issued invoice numbers are immutable.
- RLS blocks unauthorized customer, invoice, payment, statement, follow-up, and document access.
- RLS blocks public client direct writes.
- No Supabase migration occurs unless explicitly approved.
- No payment API is added unless separately approved.
- No bank API is added unless separately approved.
- No notification, WhatsApp, email, or SMS API is added unless separately approved.
- No real invoice generation occurs unless explicitly approved.
- No real statement generation occurs unless explicitly approved.
- Mobile/browser compatibility remains protected across iOS phones/tablets, Android phones/tablets including Korean and China-market devices, Safari iOS, Chrome Android, Samsung Internet, common Android WebView/Chrome-based browsers, tablet browsers, and desktop.
- Responsive layout, readable text, touch-friendly buttons, no horizontal overflow, and browser compatibility remain covered by browser/mobile tests.

## 13. Production Approval Gates

Before any production work, the user must explicitly approve:

- customer/payment schema
- RLS policies
- server route design
- invoice sequence/RPC design
- audit event immutability rules
- customer-facing link policy
- migration creation
- migration application
- payment integration
- bank integration
- notification integration
- WhatsApp/email/SMS sending policy
- real invoice generation
- real statement generation

Approval for this proposal does not automatically approve migrations, schema changes, Supabase commands, payment provider integration, bank integration, notification sending, real invoice generation, real statement generation, or production payment behavior.

## 14. Recommended Next Step

Review this proposal with the user first. Do not create migrations until the schema, RLS policy shape, server-only route design, invoice sequence/RPC design, audit event immutability, customer-facing link policy, migration scope, and integration boundaries are explicitly approved.

The next protected task should remain docs-only unless the user explicitly approves moving to a migration proposal. Real production payment implementation should wait until after schema/RLS approval, migration approval, and separate approval for any payment, bank, webhook, notification, WhatsApp, email, or SMS integration.
