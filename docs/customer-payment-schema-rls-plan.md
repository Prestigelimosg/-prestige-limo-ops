# Customer Payment Schema and RLS Plan

This document is planning only. It does not approve a migration, does not change the Supabase schema, does not change app behavior, and does not add payment provider, bank, notification, webhook, or production payment implementation work.

## 1. Purpose

Prestige Limo Ops needs a safe future design for customer folders, invoices, manual payment tracking, outstanding balances, follow-ups, audit events, and invoice number safety before any database or production payment work begins.

The goal is manual operational control first. Dispatch and accounts should eventually be able to link a booking to a customer, issue or record a safe invoice number, record manual payment status, track balances, schedule follow-ups, and preserve a clear audit trail. This plan exists to define the shape of that future work before any migration, schema change, payment API, bank API, notification sending, or production behavior is approved.

## 2. Current Protected Mock State

The current protected app state is mock-only for customer/payment work:

- The main app has a `Customers & Payments` entry point.
- `/customers` has a searchable customer dropdown/list that does not show all customers by default.
- Customer folders exist for UBS, Ritz Carlton, and Individual VIP Customer.
- Customer folders show mock customer details, contacts, invoice examples, invoices, booking history, payment history, follow-up notes, and collection rules.
- Customer Match Suggestion after booking parse is mock-only and requires dispatcher confirmation.
- Outstanding Payments Review on `/customers` is mock-only/read-only.
- Paid mock rows are excluded from Outstanding Payments Review but remain in customer history.
- No payment API, bank API, notification, Supabase write, webhook, or production payment behavior exists in the customer/payment mock UI.
- No real invoice generation, customer creation, payment mutation, or payment reconciliation exists.

## 3. Proposed Future Tables, Planning Only

No table below is approved for migration. These are planning targets for later review.

### `customers`

Purpose:
One row per customer, company, or billing account. This is the root record for customer folders, invoice numbering, payment terms, and account status.

Likely columns:
- `id`
- `display_name`
- `company_name`
- `account_type`
- `status`
- `default_payment_terms`
- `invoice_prefix`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`

Sensitive columns:
- Internal account notes, billing restrictions, ownership metadata, and any fields that identify account handling rules not meant for public display.

Public-safe columns, if any:
- A future customer-facing projection might expose only a display name and invoice display identity, but no public customer view is approved.

RLS expectations:
- Dispatcher/admin users can read customer records needed for internal operations.
- Customer records must not be readable across tenants or unrelated operating scopes if multi-tenant access is introduced.
- Public clients should not write directly to this table.
- Mutations should go through server-only routes with role checks.

Audit requirements:
- Customer creation and material customer field changes should create audit events.
- Changes to `invoice_prefix`, `status`, and payment terms require explicit audit records.

### `customer_contacts`

Purpose:
Store one or more billing, booking, operations, or concierge contacts for a customer while keeping contacts separate from individual booking passengers when needed.

Likely columns:
- `id`
- `customer_id`
- `contact_name`
- `role`
- `phone`
- `email`
- `is_primary`
- `safe_notes`
- `created_at`
- `created_by`
- `updated_at`
- `updated_by`

Sensitive columns:
- Phone numbers, email addresses, internal notes, billing-contact roles, and any personal data.

Public-safe columns, if any:
- None by default. A separate customer-facing projection would be required later.

RLS expectations:
- Only authorized dispatcher/admin users can read or update contacts.
- Contacts must be filtered by customer access.
- Public clients should not directly insert, update, or delete contacts.

Audit requirements:
- Create/update/delete contact changes should be auditable.
- Primary contact changes should record old and new values.

### `customer_invoice_sequences`

Purpose:
Track the next invoice sequence for each fixed customer invoice prefix. This protects unique, never-reused invoice numbers.

Likely columns:
- `id`
- `customer_id`
- `invoice_prefix`
- `next_sequence_number`
- `last_issued_invoice_number`
- `status`
- `created_at`
- `updated_at`

Sensitive columns:
- Internal sequence metadata and status flags.

Public-safe columns, if any:
- Issued invoice display numbers may be safe in invoice views, but sequence internals are not public.

RLS expectations:
- Sequence rows should not be updated directly by browser clients.
- Invoice number allocation should happen only through a server-side route or transaction-safe database RPC after explicit approval.
- Only authorized roles can issue invoice numbers.

Audit requirements:
- Every invoice number allocation must create an immutable `payment_events` or invoice audit event.
- Prefix changes must not rewrite issued invoice history.

### `booking_payments` or `booking_payment_fields`

Purpose:
Represent manual payment state for a booking. The simplest future implementation may add controlled payment fields to bookings. A separate `booking_payments` table is safer if partial payments, multiple receipts, refunds, or detailed audit are needed from day one.

Likely columns:
- `id`
- `booking_id`
- `customer_id`
- `payment_status`
- `payment_method`
- `quoted_price`
- `amount_paid`
- `balance_due`
- `due_date`
- `payment_reference`
- `payment_notes`
- `last_follow_up_at`
- `next_follow_up_at`
- `received_at`
- `recorded_by`
- `created_at`
- `updated_at`

Sensitive columns:
- Payment references, manual notes, amounts, follow-up dates, actor identity, and billing details.

Public-safe columns, if any:
- A future customer-safe invoice view might expose invoice number, status, amount due, and due date. This requires a separate projection and is not approved here.

RLS expectations:
- Only authorized dispatcher/admin users can read and update payment state.
- Updates must be scoped to accessible bookings and customers.
- Public clients should not write directly to payment records.
- Server routes should validate allowed status transitions.

Audit requirements:
- Every status, amount, method, due date, reference, and follow-up change must create an immutable payment event with old and new values when applicable.

### `payment_events`

Purpose:
Immutable event history for manual payment tracking, invoice issuance, follow-ups, adjustments, and later statement generation.

Likely columns:
- `id`
- `customer_id`
- `booking_id`
- `invoice_id`
- `statement_id`
- `event_type`
- `actor_id`
- `actor_role`
- `occurred_at`
- `old_value`
- `new_value`
- `note`
- `reference`
- `metadata`
- `created_at`

Sensitive columns:
- Actor identity, old/new values, notes, payment references, metadata, and internal operational context.

Public-safe columns, if any:
- None by default. Any public audit view would need a separate redacted projection.

RLS expectations:
- Events are append-only for authorized server routes.
- Dispatcher/admin users can read events for customers they are allowed to access.
- Browser clients should not directly insert, update, or delete events.
- No user should edit or delete historical events through ordinary app flows.

Audit requirements:
- This table is the audit log.
- Events should be immutable after creation.
- Deletion should be blocked or limited to tightly controlled retention/legal workflows approved later.

### `invoices`

Purpose:
Store issued invoice records with immutable invoice numbers, due dates, totals, statuses, and links to booking/customer payment state.

Likely columns:
- `id`
- `customer_id`
- `booking_id`
- `invoice_prefix`
- `sequence_number`
- `invoice_number`
- `status`
- `issued_at`
- `issued_by`
- `due_date`
- `subtotal`
- `total`
- `amount_paid`
- `balance_due`
- `voided_at`
- `voided_by`
- `created_at`
- `updated_at`

Sensitive columns:
- Amounts, status, issued actor, void actor, internal notes, customer linkage, and billing details.

Public-safe columns, if any:
- A future customer-facing invoice could expose invoice number, issue date, due date, line summary, total, amount paid, and balance due through a separate safe route.

RLS expectations:
- Internal users can read invoices for accessible customers.
- Invoice creation and issued-number allocation must go through server-only logic.
- Issued invoice numbers must not be mutable through client updates.
- Public access is not approved.

Audit requirements:
- Invoice number issued, invoice status changes, voids, refunds, and balance changes must create events.
- Old invoice numbers must remain visible after void/cancel/refund.

### `customer_statements`

Purpose:
Group monthly account jobs or invoice batches into a statement for customers that pay by billing cycle.

Likely columns:
- `id`
- `customer_id`
- `statement_number`
- `period_start`
- `period_end`
- `status`
- `issued_at`
- `issued_by`
- `total`
- `amount_paid`
- `balance_due`
- `created_at`
- `updated_at`

Sensitive columns:
- Statement totals, customer linkage, period details, actor identity, and internal statement status.

Public-safe columns, if any:
- Future customer-safe statement PDFs or views require separate approval and projection.

RLS expectations:
- Internal dispatcher/admin read access only until a customer-facing design is approved.
- Statement generation should be server-side only.
- Statement rows must not leak jobs from unrelated customers.

Audit requirements:
- Statement generated, statement updated, statement paid, and statement voided events should be immutable.
- Statement membership should be auditable.

### `follow_up_events`

Purpose:
Track manual collection follow-ups, planned reminders, completed follow-ups, and notes without sending notifications automatically.

Likely columns:
- `id`
- `customer_id`
- `booking_id`
- `invoice_id`
- `payment_event_id`
- `status`
- `scheduled_for`
- `completed_at`
- `completed_by`
- `note`
- `created_at`
- `created_by`
- `updated_at`

Sensitive columns:
- Notes, actor identity, customer linkage, schedule details, and collection context.

Public-safe columns, if any:
- None by default.

RLS expectations:
- Authorized dispatcher/admin users can read and manage internal follow-ups.
- Follow-ups must be scoped to accessible customers.
- No notification sending is implied by a follow-up row.

Audit requirements:
- Follow-up scheduled, changed, completed, or cancelled events should be recorded.
- Notes should not be silently overwritten without event history.

### `document_receipts` Later Only

Purpose:
Represent receipt uploads, customer documents, vouchers, statement PDFs, or invoice PDFs after a separate storage, retention, and access-control design is approved.

Likely columns:
- `id`
- `customer_id`
- `booking_id`
- `invoice_id`
- `statement_id`
- `storage_path`
- `document_type`
- `display_name`
- `uploaded_by`
- `uploaded_at`
- `retention_status`

Sensitive columns:
- Storage path, document contents, receipt details, uploaded actor, customer linkage, and retention status.

Public-safe columns, if any:
- None until a separate safe download/view projection is approved.

RLS expectations:
- Storage policies and table RLS must be designed together.
- Public bucket access should not be assumed.
- Server routes should mediate access where possible.

Audit requirements:
- Upload, download/access if required, replacement, retention change, and deletion events need audit planning.

## 4. Customer Folder Rules

- One customer folder should exist per customer, company, or account.
- The folder is an internal dispatcher/accounts view, not a public customer portal.
- All booking history for the selected customer should be visible only to authorized dispatcher/admin users.
- Customer folder queries must not leak unrelated customer bookings.
- Driver payout must not appear in customer folders or customer payment views.
- Private CRM data must not appear unless it is safe and necessary for account work.
- Customer contacts should be separated from booking passengers where needed.
- A booking can have a booker, passenger, traveler, and customer account that are not the same person.
- Customer folder data should be fetched through server-side access checks, not direct unaudited public client writes.

## 5. Invoice Prefix and Running Number Rules

- Each customer has a fixed invoice prefix.
- Invoice numbers run sequentially per customer prefix.
- Examples: `UBS-0001`, `UBS-0002`, `RITZ-0001`, `VIP-0001`.
- Invoice numbers must be unique.
- Invoice numbers must never be reused.
- An issued invoice number is immutable.
- Voided, cancelled, refunded, or corrected invoices keep their issued invoice number.
- Prefix changes require warning/protection and should not rewrite issued history.
- Prefix changes should show the current issued sequence and explain that old invoices keep old numbers.
- Production sequence allocation must be transaction-safe.
- Sequence allocation should likely happen in one server-side operation or database RPC that locks or atomically advances the sequence.
- Browser clients should never compute the next invoice number by reading the current max and incrementing locally.

## 6. Manual Payment Tracking Rules

Future manual-first fields:

- `payment_status`
- `payment_method`
- `quoted_price`
- `amount_paid`
- `balance_due`
- `due_date`
- `payment_reference`
- `payment_notes`
- `last_follow_up_at`
- `next_follow_up_at`
- `received_at`
- `recorded_by`

Future status behavior:

- `Unpaid`: no payment recorded and balance remains due.
- `Payment Requested`: dispatcher recorded that a manual request was sent outside the app.
- `Invoice Sent`: dispatcher recorded that an invoice was sent outside the app or by future approved invoice workflow.
- `Partially Paid`: one or more manual payments were recorded but balance remains due.
- `Paid`: balance is zero and collection is complete.
- `Overdue`: due date passed while balance remains due.
- `Waived`: authorized user intentionally waived the balance.
- `Refunded / Cancelled`: optional status if a future workflow needs refund/cancel handling.

Rules:

- Manual payment status changes must be explicit.
- Paid, waived, refunded, and cancelled transitions need stronger role checks than ordinary follow-up edits.
- `balance_due` should be computed or validated from quoted price minus recorded payments where possible.
- Manual adjustments must preserve an audit event with reason and actor.
- Payment references should describe manual confirmation, not imply bank or payment provider integration.

## 7. Outstanding and Overdue Rules

- Completed job plus balance due equals Outstanding.
- Due date passed plus balance due equals Overdue.
- Partial payment keeps the remaining balance visible.
- Paid booking disappears from Outstanding Payments Review but remains in customer history.
- Monthly account jobs can be grouped into customer statements later.
- Outstanding and overdue views should be derived from payment state, not manually maintained lists.
- Follow-up dates should make collection work visible before it is forgotten.

## 8. Payment Event Audit Trail

Planned audit event types:

- `payment_requested`
- `invoice_sent`
- `payment_received`
- `partial_payment_received`
- `waived`
- `refunded`
- `follow_up_scheduled`
- `follow_up_completed`
- `invoice_number_issued`
- `statement_generated` later

Each event should include:

- actor
- actor role or permission context
- timestamp
- customer id
- booking id, invoice id, or statement id where applicable
- old value and new value where applicable
- note or reason
- reference, such as manual transfer reference or receipt id
- immutable event history

Audit rules:

- Events are append-only.
- Event history should not be edited by normal app workflows.
- Corrections should create new correction events instead of rewriting old events.
- Status changes without an event should be treated as invalid in production design.

## 9. RLS and Security Questions Before Migration

Unresolved decisions before any migration:

- How dispatcher/admin auth is identified.
- Which roles can create or update customers.
- Which roles can create or update customer contacts.
- Which roles can link bookings to customers.
- Which roles can issue invoice numbers.
- Which roles can mark payments paid, waived, refunded, or cancelled.
- Which roles can update follow-up dates and notes.
- Whether service role is used only in server routes.
- How RLS prevents cross-customer data leakage.
- How RLS ties bookings, customers, invoices, and payment records together.
- How audit events are protected from editing or deletion.
- Whether customer-facing links will ever exist.
- What safe projection would be used if customer-facing links are approved later.
- Retention policy for payment events, receipts, statements, and documents.
- Whether invoice number sequence allocation uses a database transaction, RPC, or server route with row locking.
- How sequence allocation failure is handled without issuing duplicate numbers.
- Whether finance/account roles need stricter permissions than dispatch roles.

## 10. API and Server Design, Planning Only

Future server-only routes or server actions may eventually cover:

- Get customer dashboard summary.
- Get customer folder.
- Link booking to customer.
- Update manual payment status.
- Create payment event.
- Issue invoice number.
- Generate monthly statement later.

Server design expectations:

- Public client code must not write directly to Supabase customer, invoice, payment, sequence, or audit tables.
- Server routes must validate user role and customer/booking access.
- Server routes must create audit events in the same logical operation as payment changes.
- Invoice number issuance must be transaction-safe.
- Payment provider integrations are future only.
- Bank integrations are future only.
- Webhooks are future only.
- Provider secrets are not introduced by this plan.
- Notification sending is future only and requires separate copy, rate-limit, opt-out, and audit design.

## 11. Testing Plan Before Migration or Implementation

Required tests before any production implementation:

- Parser regression remains protected.
- Driver Dispatch, Customer Copy, and Job Card copy remain unchanged.
- Customer dashboard loads.
- Customer folder shows only selected customer bookings.
- Customer folder does not expose unrelated customers.
- Customer/payment views do not expose driver payout or private CRM data.
- Invoice prefix sequence uniqueness is protected.
- Invoice numbers are never reused.
- Issued invoice number is immutable.
- Paid booking is excluded from Outstanding Payments Review.
- Partial, overdue, unpaid, invoice-sent, and monthly-account balance-due rows are included.
- Audit event is created on manual payment update.
- Audit event captures actor, timestamp, old value, new value, note/reference where applicable.
- No Supabase migration is created unless explicitly approved.
- No payment API is added unless explicitly approved.
- No bank API is added unless explicitly approved.
- No notification sending is added unless explicitly approved.
- Mobile usability still passes.
- Protected parser/Supabase diff remains empty when a task is not approved to touch those areas.

## 12. Recommended Implementation Order

Recommended order:

1. Docs-only schema/RLS plan.
2. Review and approval.
3. Mock manual payment status UI only.
4. Schema/RLS proposal only.
5. Migration only after explicit approval.
6. Server-side manual payment tracking.
7. Audit event persistence.
8. Invoice sequence enforcement.
9. Future payment provider integration only after separate approval.

The next implementation stage should stay small and protected. Mock UI can prove dispatcher workflow ergonomics before any database or payment risk is introduced.

## 13. Final Recommendation

The safest next coding step after this document is mock manual payment status tracking UI only, still local/mock only. It should not write to Supabase, should not create migrations, should not add payment provider or bank integration, should not send notifications, and should not change parser, driver workflow, Driver Dispatch copy, Customer Copy, or Job Card copy.

If the business wants to settle security boundaries before more mock UI, the alternative next step is a schema/RLS proposal review only. Real production payment implementation should wait until manual workflow, RLS, audit event design, invoice sequence allocation, and approval controls are reviewed and explicitly approved.
