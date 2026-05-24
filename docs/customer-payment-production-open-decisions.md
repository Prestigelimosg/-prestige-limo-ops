# Customer Payment Production Open Decisions

This is a decision checklist only. No migration, schema change, Supabase command, payment API, bank API, notification sending, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This checklist must be reviewed with the user before any production customer/payment implementation starts.

Its job is to make the business and technical approval points explicit before any Supabase migration, schema change, RLS policy, invoice sequence, audit event, payment API, bank API, notification, WhatsApp/email/SMS sending, real invoice generation, real statement generation, or production payment behavior is created.

Approval of this checklist does not approve implementation. It only confirms what decisions still need a clear yes/no answer.

## 2. Current Protected Mock State

The current customer/payment workflow is protected as mock-only:

- `/customers` is a search-first dashboard.
- `/customers` does not show all customer rows before a search.
- `Outstanding Payments Review` shows mock outstanding payment rows.
- Mock manual payment controls can simulate Mark Invoice Sent, Record Partial Payment, Mark Paid, and Waive Balance.
- `Mock Payment Event Log` records local mock payment actions only.
- `Collection Follow-up Queue` shows mock follow-up rows for outstanding balances.
- `Mock Follow-up Event Log` records local mock follow-up actions only.
- `Monthly Account Statement Preview` groups mock monthly-account balance-due rows for preview only.
- `Mock Statement Preview Log` records local mock statement preview actions only.
- Customer folders show `Payment Collection Detail`.
- `Payment Collection Detail` is selected-customer-only.
- UBS, Ritz Carlton, and Individual VIP Customer folders must not leak each other's active collection rows.
- Paid rows stay in customer history but are excluded from active collection due rows.
- Local mock payment, follow-up, and statement preview actions reset on refresh and are not persisted.

The protected mock workflow does not write customer/payment rows to Supabase and does not create payment records, invoice records, statement records, bank records, notification records, webhook records, or production customer/payment behavior.

## 3. Decisions The User Must Approve Before Migration

- [ ] Who can view customers: decide whether every dispatcher can see every customer, only assigned customers, or only customers within a future business scope.
- [ ] Who can create/edit customers: decide whether this is admin-only, finance-admin-only, or allowed for dispatchers through a reviewed server route.
- [ ] Who can link bookings to customers: decide whether dispatchers can link/unlink bookings, whether admin approval is needed for relinks, and whether one booking can have only one active customer link.
- [ ] Who can mark paid/partial/waived/refunded: decide which roles can record ordinary payments and which roles can perform high-risk actions such as waiver, refund, cancellation, or correction.
- [ ] Who can issue invoice numbers: decide whether dispatchers can issue numbers, only admins can issue numbers, or dispatchers can request issuance for admin/finance approval.
- [ ] Who can view payment history: decide whether dispatchers, admins, accounting reviewers, and read-only users can see full payment history, payment references, notes, and audit events.
- [ ] Whether read-only/accounting users are needed: decide if finance needs a non-editing role for review, export, reconciliation, or audit checks.
- [ ] Whether customer-facing links will ever exist: decide whether any customer can ever open an invoice, statement, or payment view, and if yes, approve a separate safe public projection.
- [ ] Whether any customer documents/receipts should be stored: decide if receipts, vouchers, invoice PDFs, statement PDFs, or supporting files should be stored later, and under what access rules.
- [ ] How long payment/audit records should be kept: decide retention for payment events, invoices, statements, follow-up notes, references, documents, and archived customers.

## 4. Schema Decisions

- [ ] `customers`: stores one internal customer/company/account folder. Decide required fields, invoice prefix rules, account status, payment terms, who owns the customer, and whether VIP/confidential flags are needed.
- [ ] `customer_contacts`: stores billing, operations, concierge, booker, or account contacts for a customer. Decide which contact types exist, which fields are required, whether one primary billing contact is required, and who can edit contact details.
- [ ] `customer_invoice_sequences`: stores the next invoice number for each customer prefix. Decide whether there is exactly one sequence per customer, how prefixes are protected, and how sequence failures/retries should be handled.
- [ ] `booking_customer_links`: links bookings to customer folders without changing parser output. Decide if one booking can have one active customer, how relinks work, and what match reason/audit detail must be stored.
- [ ] `booking_payments`: stores manual payment status, quoted price, amount paid, balance due, due date, method, reference, notes, and follow-up dates. Decide whether this is separate from bookings from day one or whether a simpler first version is allowed.
- [ ] `payment_events`: stores immutable payment/audit history. Decide required event types, old/new value shape, actor information, correction rules, and whether events can ever be deleted for legal/retention reasons.
- [ ] `invoices`: stores issued invoice numbers, customer/booking links, amounts, due dates, status, void/refund details, and immutable issued-number metadata. Decide when invoice records are created and which fields can never be edited.
- [ ] `customer_statements`: stores monthly account statement groups by customer and period after approval. Decide whether statements have their own numbers, whether they include invoice rows or booking rows, and when generated statements become immutable.
- [ ] `follow_up_events`: stores manual collection follow-up schedules, completions, and notes. Decide which follow-up states exist and whether follow-up rows create audit events.
- [ ] `document_receipts` later only: stores metadata for receipts, vouchers, invoices, statements, and other documents after separate storage approval. Decide storage buckets, retention, access rules, download rules, and audit requirements before building it.

## 5. RLS/Security Decisions

- [ ] Dispatcher/admin access: decide exactly what dispatchers and admins can read and mutate for customers, contacts, payments, invoices, statements, follow-ups, and documents.
- [ ] Read-only/accounting access: decide whether accounting reviewers can read all customers, only finance fields, payment references, contact data, audit events, and exportable data.
- [ ] Service-role server-only operations: confirm service-role credentials are used only in trusted server routes/actions and never in browser code.
- [ ] No public client direct writes: confirm browser clients cannot directly insert, update, or delete customer/payment tables.
- [ ] Cross-customer isolation: confirm every customer folder, invoice, payment, follow-up, statement, document, and audit query is scoped by authorized `customer_id`.
- [ ] Audit event immutability: confirm audit events are append-only for normal workflows and corrections become new events instead of edits.
- [ ] Preventing driver payout exposure: confirm customer/payment views and any future customer-facing views never expose driver payout or driver compensation fields.
- [ ] Preventing private CRM leakage: confirm private CRM notes, unrelated customer data, internal dispatch notes, and sensitive contact/payment details only appear to approved internal roles.

## 6. Invoice Sequence Decisions

- [ ] Fixed invoice prefix per customer: decide whether every customer must have a fixed prefix before any invoice can be issued.
- [ ] Running number per customer: decide whether numbering is per customer prefix and whether examples such as `UBS-0001` and `RITZ-0001` are the required format.
- [ ] No reuse: confirm issued invoice numbers are never reused, even after void, refund, cancellation, or correction.
- [ ] Immutable issued numbers: confirm issued invoice number, prefix, and sequence number cannot be changed by ordinary edits.
- [ ] Transaction-safe allocation: approve a transaction/RPC/server-only design that prevents two users from receiving the same next number.
- [ ] Whether prefix changes are allowed: decide whether prefix changes are banned after first issue or allowed only by admin/finance with warning and audit.
- [ ] No client-side invoice number allocation: confirm the browser must never calculate the next invoice number from local state or by reading the current max.

## 7. Manual Payment Workflow Decisions

- [ ] Allowed statuses: approve the production status list, such as Unpaid, Payment Requested, Invoice Sent, Partially Paid, Paid, Overdue, Waived, Refunded, and Cancelled.
- [ ] Payment methods: approve allowed methods, such as Card, Bank Transfer, PayNow/manual transfer, Cash, Monthly Account, Complimentary, or Waived, without implying payment API integration.
- [ ] Partial payment rules: decide how partial amounts reduce balance due, whether multiple partial payments are allowed, and what reference/note is required.
- [ ] Waiver rules: decide who can waive a balance, whether a reason is mandatory, and whether waiver needs admin/finance approval.
- [ ] Refund/cancelled handling: decide whether refunded and cancelled are needed now, how they affect balance due, and whether they require stricter approval.
- [ ] Due date rules: decide default due dates by customer type, booking type, payment terms, and monthly account cycle.
- [ ] Overdue rules: decide when overdue starts, whether overdue is derived automatically, and whether overdue can be manually overridden.
- [ ] Required payment reference fields: decide whether payment reference is mandatory for paid/partial/refunded states and what counts as an acceptable manual reference.
- [ ] Required payment note fields: decide when notes are mandatory, especially for waiver, refund, cancellation, correction, and partial payment.
- [ ] Who records payment updates: decide which role records ordinary updates and which role approves high-risk changes.

## 8. Audit Trail Decisions

- [ ] Payment requested: decide what actor, timestamp, booking, customer, amount, due date, and note should be recorded.
- [ ] Invoice sent: decide whether this records a manual external send, an approved app-generated invoice later, or both.
- [ ] Partial payment received: decide what amount, remaining balance, method, reference, received date, and actor must be captured.
- [ ] Payment received: decide what makes a payment final and whether payment reference is mandatory.
- [ ] Waived: decide required approval, reason, old balance, new balance, and actor fields.
- [ ] Refunded: decide whether refunds are in scope, what reference is required, and who can approve them.
- [ ] Follow-up scheduled: decide required follow-up date, note, owner, and customer/booking/invoice link.
- [ ] Follow-up completed: decide required completion note and whether it changes payment status.
- [ ] Invoice number issued: decide what sequence state, invoice number, actor, and customer/booking link must be recorded.
- [ ] Statement generated later only: decide later whether statement generation creates audit events and what statement membership/totals are captured.
- [ ] Who can view audit events: decide whether dispatchers, admins, finance, and read-only users see full audit history or redacted audit views.
- [ ] Whether audit events can ever be edited or deleted: decide whether normal workflows block edits/deletes and whether legal/retention exceptions need a separate admin-only process.

## 9. Statement Decisions

- [ ] Monthly account grouping by customer and period: decide how statement periods are chosen and whether grouping is by booking date, completion date, invoice date, or due date.
- [ ] Paid rows excluded from amount due: confirm fully paid rows do not increase amount due, while still optionally appearing in support/history detail if approved.
- [ ] Statement number future-only: confirm statement numbers are not issued until statement schema, RLS, numbering, and generation rules are approved.
- [ ] Statement generation approval: decide who can generate statements and when a preview becomes a real statement record.
- [ ] Statement sending approval: decide if sending is ever allowed from the app, who approves it, and what customer-facing copy/policy is needed.
- [ ] No WhatsApp/email/SMS sending until separately approved: confirm statements do not send messages, emails, SMS, WhatsApp, or notifications until a separate notification plan is approved.

## 10. Server Route Decisions

Future customer/payment writes should go through server-only routes or server actions. Public client code must not directly write customer/payment tables.

- [ ] Get customer dashboard summary: decide role checks, customer scope, aggregate fields, and whether any finance-only data is hidden.
- [ ] Get customer folder: decide route shape, customer access validation, included contacts, bookings, invoices, payments, follow-ups, statements, and audit events.
- [ ] Link booking to customer: decide validation for booking access, customer access, one-active-link rules, relink rules, and audit events.
- [ ] Update manual payment status: decide allowed transitions, role checks, required references/notes, balance validation, and audit event creation.
- [ ] Create payment event: decide whether this is only internal to trusted workflows or exposed as a route for approved actions.
- [ ] Issue invoice number: decide transaction/RPC shape, locking, retry behavior, audit event creation, and immutable invoice fields.
- [ ] Get statement preview: decide whether preview is read-only, how rows are selected, and how paid rows are excluded from amount due.
- [ ] Create statement later only after approval: decide generation route, statement numbering, period locking, audit event creation, and sending block.

## 11. Migration Approval Gate

No migration may be created until all of these are true:

- [ ] User approves the customer/payment schema.
- [ ] User approves RLS policy shape.
- [ ] User approves server route shape.
- [ ] User approves invoice sequence/RPC shape.
- [ ] User approves audit immutability.
- [ ] User approves rollback plan.
- [ ] User explicitly says migration creation is approved.
- [ ] User explicitly says migration application is approved.

Migration creation approval and migration application approval are separate approvals. Creating a migration file does not approve applying it to Supabase.

## 12. Testing Approval Gate

Before production customer/payment work can be considered ready, the protection checks must cover:

- [ ] Parser regression remains protected.
- [ ] Driver Dispatch copy remains unchanged.
- [ ] Customer Copy remains unchanged.
- [ ] Job Card copy remains unchanged.
- [ ] Customer folder isolation works.
- [ ] No unrelated invoices leak into another customer folder.
- [ ] No driver payout exposure appears in customer folders or customer-facing views.
- [ ] Paid rows are excluded from active collection due rows.
- [ ] Payment update creates an audit event.
- [ ] Invoice sequence uniqueness is transaction-safe.
- [ ] RLS blocks unauthorized access to customers, contacts, booking links, payments, invoices, statements, follow-ups, documents, and audit events.
- [ ] RLS blocks public client direct writes.
- [ ] No Supabase migration occurs unless explicitly approved.
- [ ] No payment API, bank API, webhook, notification, WhatsApp, email, or SMS API is added unless separately approved.
- [ ] No real invoice generation occurs unless explicitly approved.
- [ ] No real statement generation occurs unless explicitly approved.
- [ ] Mobile/browser compatibility remains protected across iOS phones/tablets, Android phones/tablets including Korean and China-market devices, Safari iOS, Chrome Android, Samsung Internet, common Android WebView/Chrome-based browsers, tablet browsers, and desktop.
- [ ] Responsive layout, readable text, touch-friendly buttons, no horizontal overflow, and browser compatibility remain covered by browser/mobile tests.

## 13. Recommended Next Step

Review this checklist with the user first. Do not create migrations yet.

The safest next step is to answer the open decisions in this document, then decide whether the next protected task should remain docs-only or move to Supabase schema/RLS migration planning only. Real production migration, schema changes, invoice numbering, payment tracking, payment APIs, bank APIs, notification sending, real invoice generation, and real statement generation should wait for explicit separate approval.
