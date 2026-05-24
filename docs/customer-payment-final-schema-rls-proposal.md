# Customer Payment Final Schema/RLS Proposal

This is a final schema/RLS proposal only. No migration file, schema change, Supabase command, payment API, bank API, notification sending, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This document is the final plain-English review proposal before the owner decides whether migration creation should be approved later.

It turns the approved customer/payment defaults and migration planning document into one reviewable schema, RLS, server-route, invoice-number, and audit-event proposal. It does not approve creating a migration file. It does not approve applying a migration. It does not change Supabase, app behavior, invoice behavior, statement behavior, payment behavior, bank behavior, or notification behavior.

Migration creation and migration application remain separate future approvals.

## 2. Approved Business Defaults

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

Accounting/read-only access is optional later. If added, it should be view-only and only for payment history when needed.

Invoice numbers use:

- Fixed customer prefix.
- Running number per customer.
- No invoice number reuse.
- Immutable issued numbers.
- No browser-side allocation.

Audit history is append-only. Normal app use must not edit or delete audit events.

These items stay disabled for now:

- Customer-facing payment links.
- Customer-facing invoice links.
- Real invoice generation.
- Real statement generation or sending.
- Payment provider APIs.
- Bank APIs.
- Webhooks.
- WhatsApp, email, or SMS sending.
- Document or receipt storage.

## 3. Final Proposed Tables

No table in this section is approved for migration yet. The fields below describe the future table shape in plain English only. No SQL is included.

### `customers`

- Purpose: Stores one internal customer, company, VIP account, hotel account, or billing account. This becomes the main customer folder record.
- Plain-English fields/columns: Customer id, display name, legal name, account type, invoice prefix, payment terms, account status, confidential/VIP flag, who created it, who last updated it, creation time, update time, and archive time if retired.
- Important relationships: Parent record for contacts, booking links, payment rows, invoice rows, statement rows, follow-up rows, document metadata later, and audit events.
- Sensitive data: Customer identity, billing terms, private account status, confidential flags, and internal account ownership.
- Indexing/search needs: Search by customer name, unique invoice prefix, account type, active/archived status, and confidential status.
- RLS/security intent: Owner/admin can manage through approved server workflows. Dispatchers can read approved customer folders. Accounting/read-only can read only if approved later. Browser code must not directly write this table.
- What must be tested later: Customer search, customer folder access, prefix uniqueness, archive behavior, role-based read access, blocked unauthorized writes, and no cross-customer leakage.

### `customer_contacts`

- Purpose: Stores billing, operations, concierge, booker, assistant, or account contacts linked to a customer.
- Plain-English fields/columns: Contact id, customer id, contact type, contact name, job title or role, phone, email, WhatsApp/contact number if approved, notes, primary billing flag, primary operations flag, creator, updater, creation time, update time, and archive time.
- Important relationships: Belongs to one customer. May be referenced by future invoice, follow-up, or statement workflows.
- Sensitive data: Names, phone numbers, emails, roles, and contact notes.
- Indexing/search needs: Find contacts by customer, contact type, primary billing contact, primary operations contact, and phone/email where appropriate.
- RLS/security intent: Reads follow the same customer access rules. Creates and updates should go through approved server workflows. Contact changes should create audit events later.
- What must be tested later: Contact visibility by customer, blocked access to unrelated customer contacts, primary contact rules, contact update audit events, and no public/client direct writes.

### `customer_invoice_sequences`

- Purpose: Tracks the next safe invoice number for each fixed customer prefix.
- Plain-English fields/columns: Sequence id, customer id, invoice prefix, next sequence number, last issued invoice number, last issued time, lock or hold reason if needed, creation time, and update time.
- Important relationships: Belongs to one customer. Used when future invoices and invoice-number audit events are approved.
- Sensitive data: Sequence internals, locking state, and allocation history.
- Indexing/search needs: Unique customer sequence, unique invoice prefix, and lookup by update time for audit review.
- RLS/security intent: No browser/client direct read-write access for allocation. Invoice number allocation should be service-role/server-only or database transaction/RPC later after approval.
- What must be tested later: No duplicate sequence rows, no duplicate invoice numbers, transaction-safe allocation, blocked client writes, owner/admin-only prefix changes, and audit event creation when a number is issued.

### `booking_customer_links`

- Purpose: Links a booking to a customer folder without changing parser output.
- Plain-English fields/columns: Link id, booking id, customer id, link status, match source, match confidence, match reason, who linked it, linked time, who unlinked it, unlinked time, relink reason, creation time, and update time.
- Important relationships: Belongs to one customer and one booking record. Used by customer folder history, payment rows, invoices, and statements.
- Sensitive data: Customer identity, booking linkage, match reasoning, and relink notes.
- Indexing/search needs: Lookup by booking, lookup by customer, active link status, and unique active booking link if one booking may have only one active customer.
- RLS/security intent: Dispatchers may link bookings through approved server workflows. Relinking should require owner/admin review. Reads must be scoped by both booking and customer access.
- What must be tested later: Booking links stay customer-scoped, relinks are audited, one-active-link rule if approved, no parser behavior changes, and no unrelated customer folder receives a booking.

### `booking_payments`

- Purpose: Stores manual payment state for each linked booking or invoice row.
- Plain-English fields/columns: Payment id, booking id, customer id, invoice id if linked, payment status, quoted amount, amount paid, balance due, currency, due date, received date, payment method, payment reference, payment note, who last updated it, creation time, and update time.
- Important relationships: Belongs to one customer and one booking. May link to one invoice. Produces audit events when changed.
- Sensitive data: Amounts, payment references, collection notes, received dates, and manual confirmation details.
- Indexing/search needs: Lookup by customer, booking, invoice, payment status, due date, balance due, and received date.
- RLS/security intent: Owner/admin can manage high-risk statuses through server workflows. Dispatchers can record normal paid/partial only through server workflows with required reference, note, and received date. Browser code must not directly write this table.
- What must be tested later: Paid rows leave active collection due rows, paid rows remain in history, partial payments update balance correctly, high-risk statuses are owner/admin-only, payment references/notes/dates are required, and audit events are created.

### `payment_events`

- Purpose: Stores append-only audit history for payment, invoice, statement, follow-up, and customer/account actions.
- Plain-English fields/columns: Event id, customer id, booking id if linked, invoice id if linked, statement id if linked later, event type, actor user id, actor role, event time, old value, new value, amount, payment or invoice reference, note, source server route, and creation time.
- Important relationships: Belongs to one customer and may also belong to a booking, invoice, statement, or payment row.
- Sensitive data: Staff action history, old/new financial values, payment references, notes, correction reasons, and internal workflow source.
- Indexing/search needs: Lookup by customer, booking, invoice, statement, event type, actor, and event time.
- RLS/security intent: Append-only. Normal app use cannot update or delete events. Reads are scoped by customer access. Inserts happen only through trusted server workflows that already validated the action.
- What must be tested later: Events cannot be edited or deleted through normal app flows, payment updates create events, high-risk actions create events, unauthorized users cannot read unrelated events, and old/new values are captured.

### `invoices`

- Purpose: Stores future issued invoice records after explicit approval.
- Plain-English fields/columns: Invoice id, customer id, booking id if linked, booking payment id if linked, invoice prefix, sequence number, full invoice number, invoice status, issue time, issued by, due date, subtotal amount, tax amount if needed, total amount, amount paid, balance due, voided time, voided by, void reason, creation time, and update time.
- Important relationships: Belongs to one customer. May belong to one booking and one booking payment row. May later be grouped into statements and audit events.
- Sensitive data: Invoice amounts, due dates, customer account linkage, void/refund/cancel reasons, and issued actor details.
- Indexing/search needs: Unique invoice number, unique prefix plus sequence number, customer lookup, booking lookup, invoice status, due date, and issued date.
- RLS/security intent: Internal read only for authorized customers. Invoice creation and invoice number issue must be server-only. Issued invoice numbers must be immutable. Browser code must not directly write this table.
- What must be tested later: Unique invoice numbers, immutable issued numbers, no number reuse after void/refund/cancel, blocked dispatcher invoice issuance, no browser-side allocation, and no unrelated invoice leakage.

### `customer_statements`

- Purpose: Stores future monthly account statement groups after separate statement generation approval.
- Plain-English fields/columns: Statement id, customer id, statement period start, statement period end, statement status, statement number if later approved, statement total, amount paid, balance due, generated time, generated by, approved time, approved by, sent time, sent by, creation time, and update time.
- Important relationships: Belongs to one customer. May include invoices or booking payments through a future statement membership design. Produces audit events when generated later.
- Sensitive data: Monthly account totals, account period, statement status, approval history, and sending history.
- Indexing/search needs: Lookup by customer, statement period, statement status, generated date, and statement number if statement numbering is later approved.
- RLS/security intent: Reads are scoped by customer access. Statement generation is server-only after separate approval. Sending remains disabled until separately approved.
- What must be tested later: Paid rows are excluded from amount due, statement preview does not create a real statement, customer isolation works, no sending occurs without approval, and generation creates audit events only after approval.

### `follow_up_events`

- Purpose: Stores manual collection follow-up schedules, completion records, assignments, and notes.
- Plain-English fields/columns: Follow-up id, customer id, booking id if linked, invoice id if linked, booking payment id if linked, follow-up status, scheduled date/time, completed time, assigned user, created by, completed by, note, creation time, and update time.
- Important relationships: Belongs to one customer and may belong to a booking, invoice, or booking payment row. Should create audit events when scheduled or completed.
- Sensitive data: Collection notes, staff assignment, payment follow-up timing, and customer account context.
- Indexing/search needs: Lookup by customer, follow-up status, scheduled date, assigned user, invoice link, and payment link.
- RLS/security intent: Dispatchers can schedule and complete normal follow-ups through approved server workflows. No notification sending is implied. Reads are scoped by customer access.
- What must be tested later: Follow-ups are customer-scoped, no notifications are sent, schedule/complete actions create audit events, follow-up queue excludes paid rows where appropriate, and unauthorized users cannot see unrelated follow-ups.

### `document_receipts` Later Only

- Purpose: Later-only metadata for receipts, vouchers, invoice files, statement files, or supporting documents after separate storage approval.
- Plain-English fields/columns: Document id, customer id, booking id if linked, invoice id if linked, statement id if linked, document type, storage bucket, storage path, file name, file type, file size, uploaded by, uploaded time, retention status, and archive time.
- Important relationships: Belongs to one customer and may belong to a booking, invoice, or statement. Must match future Supabase Storage policies if built.
- Sensitive data: Receipts, vouchers, invoices, statements, storage paths, file names, and uploaded documents.
- Indexing/search needs: Lookup by customer, document type, invoice, statement, booking, upload date, and retention status.
- RLS/security intent: Disabled for now. If approved later, table RLS and storage bucket policies must be designed together. No customer-facing document access without separate secure-link approval.
- What must be tested later: Storage policies match table policies, unrelated customers cannot access documents, no public links exist without approval, retention/archive rules work, and document metadata does not leak private files.

## 4. Final RLS Proposal

RLS should be designed in plain terms around roles, customer isolation, and server-only writes.

- Owner/admin permissions: owner/admin can read authorized customer/payment records and perform high-risk actions only through approved server-side workflows.
- Dispatcher permissions: dispatcher can read customer folders, link bookings, update normal follow-ups, and record normal paid/partial payment only through approved server routes with required reference, note, and received date.
- Dispatcher restrictions: dispatcher cannot waive, refund, cancel, issue final invoice numbers, change invoice prefixes, or delete audit history.
- Optional accounting/read-only permissions: if approved later, this role can view payment/history information only and cannot update customer, payment, invoice, sequence, or audit records.
- Service-role/server-only operations: sequence allocation, audit event creation, invoice creation, and other sensitive writes should happen only in trusted server routes or database functions after approval.
- No public client direct writes: browser code must not directly insert, update, or delete customer/payment tables.
- Customer id isolation: every table that belongs to a customer must be scoped by `customer_id`, so one customer folder cannot see another customer's invoices, payments, follow-ups, statements, documents, or audit events.
- No driver payout exposure: customer/payment tables and future customer-safe views must not expose driver payout, driver compensation, or internal payout notes.
- No private CRM leakage: internal dispatch notes, private account notes, unrelated customer data, provider secrets, webhook data, and sensitive CRM content must not appear in customer/payment views unless explicitly approved for the role.
- Append-only audit events: payment events are the audit trail. Normal app use should allow inserts only, not edits or deletes.
- No delete/edit for audit history: audit history should not be edited or deleted by owner/admin, dispatcher, accounting/read-only, or browser workflows. Any future retention/legal exception needs separate approval.

## 5. Final Server-Only Route Proposal

Future writes should go through server-only routes or server actions. Browser/public client code must not directly write customer/payment tables.

Future route proposal, not implementation:

- Get customer dashboard summary: validates role and customer scope, then returns approved summary totals, outstanding counts, overdue counts, follow-up counts, and search data without exposing driver payout or private finance-only fields beyond the user's role.
- Get customer folder: validates customer access, then returns customer details, contacts, linked bookings, payment rows, invoices, follow-ups, statement preview data, and audit history based on role.
- Link booking to customer: validates booking access, customer access, active-link rules, relink rules, and required match reason, then creates an audit event.
- Update manual payment status: validates role, allowed status transition, required reference/note/received date, balance math, and customer isolation, then creates an audit event in the same logical operation.
- Create payment event: used internally by trusted server workflows so audit creation is consistent and append-only.
- Issue invoice number: validates owner/admin authority or future approved flow, allocates number transaction-safely, creates invoice metadata if approved, and creates an audit event.
- Get statement preview: read-only route that groups rows by customer and period, excludes paid rows from amount due, and does not generate, save, send, or number a statement.
- Create statement later only after approval: disabled until separate approval for statement schema, numbering, generation, sending policy, and audit behavior.

## 6. Invoice Number Final Proposal

Invoice number rules should be strict because mistakes can create accounting confusion.

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

## 7. Audit Event Final Proposal

Audit events should be append-only. Each event should include:

- Actor.
- Timestamp.
- Old value.
- New value.
- Reference.
- Note.

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

Each event should also include the customer id, booking id if linked, invoice id if linked, statement id if linked later, actor role, source server route or workflow, and required reason where applicable.

Corrections should become new audit events instead of editing old events.

## 8. Disabled Items

These remain disabled:

- Customer-facing payment links.
- Customer-facing invoice links.
- Real invoice generation.
- Real statement generation/sending.
- Payment provider API.
- Bank API.
- Webhooks.
- WhatsApp/email/SMS sending.
- Document/receipt storage.
- Supabase migration creation.
- Supabase migration application.

Each disabled item needs separate approval, planning, testing, and safety gates before implementation.

## 9. Migration Creation Approval Gate

Migration creation is still not approved.

Before any migration file is created, the owner must explicitly approve:

- This final schema/RLS proposal.
- Final server route shape.
- Invoice sequence/RPC design.
- Audit event immutability.
- Rollback plan.
- Migration creation.

Approval of this document does not approve migration creation.

## 10. Migration Application Approval Gate

Migration application is separate from migration creation.

Before applying any migration to Supabase, the owner must explicitly approve:

- Exact migration file.
- Rollback plan.
- Test plan.
- Backup/safety approach.
- Migration application.

Creating a migration file later must not be treated as permission to apply it.

Approval of this document does not approve migration application.

## 11. Testing Plan Before Migration Creation

Before migration creation is considered, future migration work must be protected by these checks:

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

## 12. Recommended Next Step

Review this final proposal first. Do not create migration files yet.

The safest next step after review is still protected approval work: decide whether the owner explicitly approves this final schema/RLS proposal and whether a separate future task may draft a migration file. Migration creation, migration application, Supabase commands, production invoice numbering, production payment tracking, payment API, bank API, notification sending, real invoice generation, and real statement generation must wait for explicit separate approval.
