# Customer Payment Supabase Migration Planning

This is a migration planning document only. No migration file, schema change, Supabase command, payment API, bank API, notification sending, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This document prepares a careful plan for future Supabase customer/payment schema and RLS work.

It uses the owner-approved safe defaults as planning input, but it does not approve creating a migration file, applying a migration, changing Supabase, adding production customer/payment tables, issuing invoice numbers, writing audit events, connecting payment or bank APIs, sending notifications, generating invoices, generating statements, or changing app behavior.

Migration creation and migration application remain separate future approvals.

## 2. Current Approved Defaults

Owner/admin has full control when production customer/payment work is approved later.

Dispatcher can:

- View customer folders.
- Link bookings to customers.
- Update normal collection follow-up.
- Record normal paid payment only with reference, note, and received date.
- Record normal partial payment only with amount, reference, note, and received date.

Dispatcher cannot:

- Waive balance.
- Refund payment.
- Cancel payment.
- Issue final invoice numbers.
- Change invoice prefix.
- Delete audit history.

Accounting/read-only user access is optional later. If added, it should be view-only and only for payment history when needed.

Invoice number defaults:

- Fixed customer prefix.
- Running number per customer.
- No invoice number reuse.
- Issued invoice numbers are immutable.
- No browser-side invoice number allocation.
- Future database/server allocation must be transaction-safe.

Audit history is append-only. Normal app use must not edit or delete audit events.

Keep disabled for now:

- Customer-facing payment links.
- Customer-facing invoice links.
- Real invoice generation.
- Real statement generation.
- Real statement sending.
- Payment provider APIs.
- Bank APIs.
- Webhooks.
- WhatsApp sending.
- Email sending.
- SMS sending.
- Notification sending.
- Document or receipt storage.

## 3. Tables To Include In Future Migration Plan

No table below is approved for migration yet. These are planning targets only.

### `customers`

- Purpose: Stores one internal customer, company, VIP account, hotel account, or billing account. This is the main folder record for customer details, payment terms, invoice prefix, and account status.
- Key columns to plan: `id`, `display_name`, `legal_name`, `account_type`, `invoice_prefix`, `payment_terms`, `status`, `is_confidential`, `created_by`, `updated_by`, `created_at`, `updated_at`, `archived_at`.
- Relationships: Parent table for contacts, booking links, payments, invoices, statements, follow-ups, document metadata later, and audit events.
- Sensitive data: Customer identity, billing terms, private account status, VIP/confidential flags, and internal account ownership.
- Indexes to plan: Unique invoice prefix, customer name search, account status, account type, confidential flag, and archived/active status.
- RLS intent: Owner/admin can manage through approved server routes. Dispatchers can read approved customer folders. Accounting/read-only can read only if later approved. No public client direct writes.

### `customer_contacts`

- Purpose: Stores billing, operations, concierge, booker, assistant, or account contacts linked to a customer.
- Key columns to plan: `id`, `customer_id`, `contact_type`, `name`, `role_title`, `phone`, `email`, `notes`, `is_primary_billing`, `is_primary_operations`, `created_by`, `updated_by`, `created_at`, `updated_at`, `archived_at`.
- Relationships: Belongs to `customers`. May be referenced by invoices, follow-ups, and future statement/contact workflows.
- Sensitive data: Names, phone numbers, email addresses, roles, and contact notes.
- Indexes to plan: `customer_id`, contact type, primary billing contact, primary operations contact, phone/email lookup where appropriate.
- RLS intent: Read scoped by customer access. Create/update should go through approved server routes. Contact changes should create audit events later.

### `customer_invoice_sequences`

- Purpose: Tracks the next safe invoice number for each customer prefix.
- Key columns to plan: `id`, `customer_id`, `invoice_prefix`, `next_sequence_number`, `last_issued_invoice_number`, `last_issued_at`, `locked_reason`, `created_at`, `updated_at`.
- Relationships: Belongs to `customers`. Used when creating future `invoices` and `payment_events`.
- Sensitive data: Sequence internals and locking state. These should not be public.
- Indexes to plan: Unique `customer_id`, unique invoice prefix, and lookup by updated time for audit review.
- RLS intent: No browser/client direct read-write access for allocation. Invoice sequence allocation should be service-role/server-only or database RPC later after approval.

### `booking_customer_links`

- Purpose: Links a booking to a customer folder without changing parser output.
- Key columns to plan: `id`, `booking_id`, `customer_id`, `link_status`, `match_source`, `match_confidence`, `match_reason`, `linked_by`, `linked_at`, `unlinked_by`, `unlinked_at`, `relink_reason`, `created_at`, `updated_at`.
- Relationships: Belongs to `customers` and the future/persisted booking record. Used by payments, invoices, and customer folder history.
- Sensitive data: Customer identity, booking linkage, match reasoning, and relink notes.
- Indexes to plan: `booking_id`, `customer_id`, active link status, unique active booking link if one active customer per booking is approved.
- RLS intent: Dispatchers may link bookings through approved server routes. Relinking should require owner/admin review. Reads must be scoped by customer and booking access.

### `booking_payments`

- Purpose: Stores manual payment state for each linked booking or invoice row.
- Key columns to plan: `id`, `booking_id`, `customer_id`, `invoice_id`, `payment_status`, `quoted_amount`, `amount_paid`, `balance_due`, `currency`, `due_date`, `received_date`, `payment_method`, `payment_reference`, `payment_note`, `last_updated_by`, `created_at`, `updated_at`.
- Relationships: Belongs to a customer and booking. May link to an invoice. Produces payment events when changed.
- Sensitive data: Amounts, payment references, collection notes, received dates, and manual confirmation details.
- Indexes to plan: `customer_id`, `booking_id`, `invoice_id`, payment status, due date, balance due, received date.
- RLS intent: Owner/admin can manage high-risk statuses through server routes. Dispatchers can record normal paid/partial only through server routes with required reference, note, and received date. No direct public client writes.

### `payment_events`

- Purpose: Stores append-only audit history for payment, invoice, statement, follow-up, and customer/account actions.
- Key columns to plan: `id`, `customer_id`, `booking_id`, `invoice_id`, `statement_id`, `event_type`, `actor_user_id`, `actor_role`, `event_at`, `old_value`, `new_value`, `amount`, `payment_reference`, `note`, `source_route`, `created_at`.
- Relationships: Belongs to customer and optionally booking, invoice, or statement.
- Sensitive data: Staff action history, old/new financial values, payment references, notes, and correction reasons.
- Indexes to plan: `customer_id`, `booking_id`, `invoice_id`, `statement_id`, event type, actor, event time.
- RLS intent: Append-only. No normal update/delete. Reads scoped by customer access. Inserts only through trusted server routes that already validated the action.

### `invoices`

- Purpose: Stores future issued invoice records after explicit approval.
- Key columns to plan: `id`, `customer_id`, `booking_id`, `booking_payment_id`, `invoice_prefix`, `sequence_number`, `invoice_number`, `invoice_status`, `issued_at`, `issued_by`, `due_date`, `subtotal_amount`, `tax_amount`, `total_amount`, `amount_paid`, `balance_due`, `voided_at`, `voided_by`, `void_reason`, `created_at`, `updated_at`.
- Relationships: Belongs to customer. May belong to booking and booking payment. May belong to future statements and audit events.
- Sensitive data: Invoice amounts, due dates, customer account linkage, void/refund/cancel reasons.
- Indexes to plan: Unique invoice number, unique invoice prefix plus sequence number, `customer_id`, `booking_id`, status, due date, issued date.
- RLS intent: Internal read only for authorized customers. Invoice creation and invoice number issue must be server-only. Issued invoice numbers must be immutable. No public client direct writes.

### `customer_statements`

- Purpose: Stores future monthly account statement groups after separate statement generation approval.
- Key columns to plan: `id`, `customer_id`, `statement_period_start`, `statement_period_end`, `statement_status`, `statement_number`, `statement_total`, `amount_paid`, `balance_due`, `generated_at`, `generated_by`, `approved_at`, `approved_by`, `sent_at`, `sent_by`, `created_at`, `updated_at`.
- Relationships: Belongs to customer. May include invoices or booking payments through a future statement membership plan. Produces audit events.
- Sensitive data: Monthly account totals, account period, statement status, approval/sending history.
- Indexes to plan: `customer_id`, statement period, statement status, generated date, statement number if numbering is later approved.
- RLS intent: Read scoped by customer access. Generation is server-only after separate approval. Sending remains disabled until separately approved.

### `follow_up_events`

- Purpose: Stores manual collection follow-up schedules, completion records, and notes.
- Key columns to plan: `id`, `customer_id`, `booking_id`, `invoice_id`, `booking_payment_id`, `follow_up_status`, `scheduled_for`, `completed_at`, `assigned_to`, `created_by`, `completed_by`, `note`, `created_at`, `updated_at`.
- Relationships: Belongs to customer and optionally booking, invoice, or booking payment. Should create payment/audit events when scheduled or completed.
- Sensitive data: Collection notes, staff assignment, payment follow-up timing, customer account context.
- Indexes to plan: `customer_id`, follow-up status, scheduled date, assigned user, invoice/payment linkage.
- RLS intent: Dispatchers can schedule/complete normal follow-ups through server routes. No notification sending is implied. Reads scoped by customer access.

### `document_receipts` Later Only

- Purpose: Later-only metadata for receipts, vouchers, invoice files, statement files, or supporting documents after separate storage approval.
- Key columns to plan later: `id`, `customer_id`, `booking_id`, `invoice_id`, `statement_id`, `document_type`, `storage_bucket`, `storage_path`, `file_name`, `mime_type`, `file_size`, `uploaded_by`, `uploaded_at`, `retention_status`, `archived_at`.
- Relationships: Belongs to customer and optionally booking, invoice, or statement. Must match future Supabase Storage policies if built.
- Sensitive data: Receipts, vouchers, invoices, statements, file paths, and uploaded documents.
- Indexes to plan later: `customer_id`, document type, invoice, statement, booking, upload date, retention status.
- RLS intent: Disabled for now. If approved later, table RLS and storage bucket policies must be designed together. No customer-facing document access without separate secure-link approval.

## 4. RLS Planning

Planned RLS behavior in plain English:

- Owner/admin access: can read authorized customer/payment records and perform high-risk actions only through approved server-side workflows.
- Dispatcher access: can read customer folders, link bookings, update normal follow-ups, and record normal paid/partial payments only through approved server routes with required reference, note, and received date.
- Dispatcher limits: cannot waive, refund, cancel, issue final invoice numbers, change invoice prefixes, or delete audit history.
- Accounting/read-only access: optional later; if approved, read-only payment/history access only.
- Service-role-only operations: sequence allocation, audit event creation, invoice creation, and other sensitive writes should happen only in trusted server routes or database functions after approval.
- No public client direct writes: browser code must not directly insert, update, or delete customer/payment tables.
- Customer isolation: every table that belongs to a customer must be scoped by `customer_id` so one customer folder cannot see another customer's invoices, payments, follow-ups, statements, documents, or audit events.
- No driver payout exposure: customer/payment tables and any future customer-safe view must not expose driver payout, driver compensation, or internal payout notes.
- No private CRM leakage: internal dispatch notes, private account notes, unrelated customer data, provider secrets, webhook data, and sensitive CRM content must not appear in customer/payment views unless explicitly approved for the role.
- Append-only audit events: payment events are the audit trail. Normal app use should allow inserts only, not edits or deletes.

## 5. Server-Only Route Planning

Future writes should go through server-only routes or server actions. Public client/browser code must not directly write customer/payment tables.

Future route planning, not implementation:

- Get customer dashboard summary: validates role, returns approved summary totals, outstanding counts, overdue counts, follow-up counts, and search data without exposing private finance-only fields beyond the user's role.
- Get customer folder: validates customer access, returns customer details, contacts, linked bookings, payment rows, invoices, follow-ups, statement preview data, and audit history based on role.
- Link booking to customer: validates booking access, customer access, active-link rules, relink rules, and required match reason; creates an audit event.
- Update manual payment status: validates role, allowed status transition, required reference/note/received date, balance math, and customer isolation; creates an audit event in the same logical operation.
- Create payment event: used internally by trusted server workflows so audit creation is consistent and append-only.
- Issue invoice number: validates owner/admin authority or future approved flow, allocates number transaction-safely, creates invoice metadata if approved, and creates an audit event.
- Get statement preview: read-only route that groups rows by customer and period, excludes paid rows from amount due, and does not generate/save/send/number a statement.
- Create statement later only after approval: disabled until separate approval for statement schema, numbering, generation, sending policy, and audit behavior.

## 6. Invoice Number Safety Planning

Invoice number planning:

- Each customer has a fixed invoice prefix.
- Running numbers are per customer/prefix.
- Allocation must be transaction-safe later.
- Issued invoice numbers are never reused.
- Issued invoice numbers are immutable.
- Browser/client-side code must never allocate invoice numbers.
- A database transaction, database RPC, or trusted server-only route with locking is likely needed later.
- Prefix changes require owner/admin approval, warning text, and an audit event.
- Prefix changes must not rewrite old invoice history.
- Voided, refunded, cancelled, or corrected invoices must keep their original issued invoice number.

## 7. Audit Event Planning

Audit events should be append-only. Each event should include actor, timestamp, old value, new value, reference, and note where applicable.

Planned event types:

- Payment requested.
- Invoice sent.
- Partial payment received.
- Payment received.
- Waived.
- Refunded.
- Follow-up scheduled.
- Follow-up completed.
- Invoice number issued.
- Statement generated later only.

Each event should also plan these fields:

- Customer id.
- Booking id, if linked.
- Invoice id, if linked.
- Statement id, if linked later.
- Actor user id.
- Actor role.
- Server route or source workflow.
- Event timestamp.
- Old value before the change.
- New value after the change.
- Payment reference or invoice reference where applicable.
- Required note or reason where applicable.

Corrections should become new audit events instead of editing old events.

## 8. Migration Creation Gate

Migration creation is still not approved.

Before any migration file is created, the owner must explicitly approve:

- Final schema.
- Final RLS rules.
- Final server route shape.
- Invoice sequence/RPC design.
- Audit event immutability.
- Rollback plan.
- Migration creation.

Approval of this document does not approve migration creation.

## 9. Migration Application Gate

Migration application is separate from migration creation.

Before applying any migration to Supabase, the owner must explicitly approve:

- Exact migration file.
- Rollback plan.
- Test plan.
- Backup/safety approach.
- Migration application.

Creating a migration file later must not be treated as permission to apply it.

Approval of this document does not approve migration application.

## 10. Testing Plan Before Migration Creation

Before migration creation is considered, future planning must be protected by these checks:

- Parser regression remains protected.
- Driver Dispatch copy remains unchanged.
- Customer Copy remains unchanged.
- Job Card copy remains unchanged.
- Customer folder isolation works.
- No unrelated invoices leak into another customer folder.
- No driver payout exposure appears in customer folders or customer-facing views.
- Paid rows are excluded from active collection due rows.
- Payment update creates an audit event.
- Invoice sequence uniqueness is transaction-safe.
- RLS blocks unauthorized access.
- No Supabase migration occurs unless explicitly approved.
- No payment API, bank API, or notification API is added unless separately approved.
- No WhatsApp, email, or SMS sending is added unless separately approved.
- Mobile/browser compatibility remains protected.

Mobile/browser compatibility means the app remains usable on iOS phones/tablets, Android phones/tablets including Korean and China-market devices, Safari iOS, Chrome Android, Samsung Internet, common Android WebView/Chrome-based browsers, tablet browsers, and desktop, with readable text, touch-friendly controls, and no horizontal overflow.

## 11. Recommended Next Step

Review this migration planning document first. Do not create migration files yet.

The safest next step after review is still docs-only: confirm whether this plan should become a final schema/RLS migration proposal. Migration creation, migration application, Supabase commands, production invoice numbering, production payment tracking, payment API, bank API, notification sending, real invoice generation, and real statement generation should wait for explicit separate approval.
