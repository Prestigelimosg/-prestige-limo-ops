# Customer Payment Owner Decision Answer Sheet

This is an owner decision answer sheet only. No migration, schema change, Supabase command, payment API, bank API, notification sending, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This answer sheet is for the owner to approve business rules before any production customer/payment database work starts.

Approving this sheet does not create a migration, change Supabase, turn on payments, send notifications, generate invoices, or generate statements. It only records the owner's preferred rules so the next planning step can stay safe.

## 2. Current Safe Mock State

The app is still in a safe mock state for customer/payment work:

- `/customers` dashboard is mock/local only.
- Customer folders are mock/local only.
- Manual payment buttons are mock/local only.
- Follow-up and statement preview are mock/local only.
- Mock actions reset on refresh and are not saved.
- No real invoices exist yet.
- No real statements exist yet.
- No real payment collection exists yet.
- No WhatsApp, email, SMS, or notification sending exists yet.
- No customer/payment Supabase writes exist yet.

## 3. Access Role Decisions

### Owner/admin access

- Decision question: Should owner/admin users have full control over customer folders, payment status, invoice numbers, audit history, and future high-risk actions?
- Recommended default for Prestige Limo Ops: Yes. Owner/admin should have full control.
- Why this is safest: A small business needs one trusted role that can approve sensitive account changes and fix mistakes.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Dispatcher access

- Decision question: Should dispatchers be allowed to view customer folders, link bookings, and update normal collection follow-ups?
- Recommended default for Prestige Limo Ops: Yes, but dispatchers should not control high-risk actions.
- Why this is safest: Dispatchers need daily operational access, but waivers, refunds, cancellations, and invoice number changes affect accounts and should stay restricted.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Accounting/read-only access

- Decision question: Is an accounting or read-only role needed for reviewing payment history without changing records?
- Recommended default for Prestige Limo Ops: Add this role only if the business needs finance review or external bookkeeping support.
- Why this is safest: Read-only access helps accounts check records without risking accidental edits.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Who can view customer folders

- Decision question: Who can open and view customer folders?
- Recommended default for Prestige Limo Ops: Owner/admin and dispatchers can view customer folders. Accounting/read-only can view them only if needed.
- Why this is safest: It keeps daily operations practical while avoiding unnecessary access to customer details.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Who can create/edit customers

- Decision question: Who can create or edit customer/company records?
- Recommended default for Prestige Limo Ops: Owner/admin only at first. Dispatcher can suggest or request changes later if approved.
- Why this is safest: Customer records affect invoices, payment terms, and account history, so accidental edits can become messy.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Who can link bookings to customers

- Decision question: Who can link a booking to a customer folder?
- Recommended default for Prestige Limo Ops: Dispatchers may link bookings to customers, with audit history. Relinking should require owner/admin review.
- Why this is safest: Dispatchers know the booking context, but relinking can move payment history between customers if not controlled.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Who can view payment history

- Decision question: Who can view customer payment history, references, and collection notes?
- Recommended default for Prestige Limo Ops: Owner/admin can view all. Dispatchers can view operational payment status. Accounting/read-only can view if needed.
- Why this is safest: Payment history is useful for operations, but references and notes may be sensitive.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Who can view audit history

- Decision question: Who can view audit history showing who changed payment, invoice, and follow-up records?
- Recommended default for Prestige Limo Ops: Owner/admin can view all audit history. Accounting/read-only can view if needed. Dispatchers can view only practical operational history if approved.
- Why this is safest: Audit history can contain sensitive staff and account details.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 4. Payment Update Decisions

### Mark Paid

- Decision question: Who can mark a booking or invoice as paid?
- Recommended default for Prestige Limo Ops: Dispatcher may mark paid only after confirming payment and entering a reference, note, and received date.
- Why this is safest: It supports daily work while keeping proof of why the payment was marked paid.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Record Partial Payment

- Decision question: Who can record a partial payment?
- Recommended default for Prestige Limo Ops: Dispatcher may record normal partial payment only with amount, reference, note, and received date.
- Why this is safest: Partial payments affect the remaining balance, so the record needs enough detail for follow-up.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Mark Waived

- Decision question: Who can waive a balance?
- Recommended default for Prestige Limo Ops: Owner/admin only.
- Why this is safest: Waiving money owed is a high-risk accounting decision.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Mark Refunded

- Decision question: Who can mark a payment as refunded?
- Recommended default for Prestige Limo Ops: Owner/admin only.
- Why this is safest: Refunds change money records and may need outside proof.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Mark Cancelled

- Decision question: Who can mark a payment or invoice as cancelled?
- Recommended default for Prestige Limo Ops: Owner/admin only for financial cancellation. Dispatchers may mark job cancellation only if that workflow is approved separately.
- Why this is safest: Cancelled financial records can affect balances, statements, and invoice history.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Payment reference required

- Decision question: Should a payment reference be required for paid, partial, and refunded states?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: A reference helps prove where the money came from, such as bank transfer note, receipt number, PayNow note, or manual confirmation.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Payment notes required

- Decision question: Should payment notes be required for paid, partial, waived, refunded, cancelled, or corrected states?
- Recommended default for Prestige Limo Ops: Yes for partial, waived, refunded, cancelled, and correction. Short notes are also recommended for paid.
- Why this is safest: Notes explain the decision later if the owner or accountant needs to check the record.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Received date required

- Decision question: Should a received date be required when recording paid or partial payment?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: The received date is needed for monthly review, customer follow-up, and accounting checks.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 5. Invoice Number Decisions

### Fixed customer invoice prefix

- Decision question: Should each customer have a fixed invoice prefix, such as `UBS` or `RITZ`?
- Recommended default for Prestige Limo Ops: Yes, one fixed prefix per customer.
- Why this is safest: It keeps customer invoice history easy to search and understand.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Running number per customer

- Decision question: Should invoice numbers run separately for each customer prefix, such as `UBS-0001`, `UBS-0002`, and `RITZ-0001`?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It keeps each customer's invoice sequence clean and avoids one mixed number list for all customers.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### No reuse

- Decision question: Should issued invoice numbers ever be reused?
- Recommended default for Prestige Limo Ops: No. Never reuse issued invoice numbers.
- Why this is safest: Reusing invoice numbers can confuse customers, records, and accounting checks.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Issued invoice numbers cannot be changed

- Decision question: Can an issued invoice number be edited after it is issued?
- Recommended default for Prestige Limo Ops: No.
- Why this is safest: Once issued, the number should remain part of permanent history, even if the invoice is voided, cancelled, or refunded.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Prefix changes require warning/owner approval

- Decision question: Can a customer invoice prefix be changed after invoices already exist?
- Recommended default for Prestige Limo Ops: Only with owner/admin approval, clear warning, and audit history.
- Why this is safest: Prefix changes can make old and new invoice history confusing.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### No browser/client-side invoice number allocation

- Decision question: Should the browser ever decide the next invoice number?
- Recommended default for Prestige Limo Ops: No.
- Why this is safest: Browser-side numbering can create duplicates if two people issue invoices at the same time.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Transaction-safe allocation required later

- Decision question: Should future invoice number allocation be transaction-safe on the server or database side?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It prevents duplicate numbers and protects the invoice sequence.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 6. Statement Decisions

### Monthly account statement grouping

- Decision question: Should monthly account jobs be grouped by customer and period for statement preview later?
- Recommended default for Prestige Limo Ops: Yes, preview later only.
- Why this is safest: It helps monthly account review without creating real statements too early.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Paid rows excluded from amount due

- Decision question: Should fully paid rows be excluded from statement amount due?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: Paid rows can stay in history, but they should not increase what the customer owes.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Statement numbers future-only

- Decision question: Should statement numbers stay disabled until statement rules are approved separately?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: Statement numbering needs the same care as invoice numbering.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Statement generation requires separate approval

- Decision question: Should real statement generation require separate owner approval?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: Previewing a statement is low risk. Creating a real statement record is a production finance action.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Statement sending requires separate approval

- Decision question: Should sending statements by WhatsApp, email, SMS, or any other method require separate approval?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: Sending customer-facing finance messages needs approved wording, recipient rules, and mistake controls.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 7. Customer-Facing Link Decisions

### Customer-facing payment links

- Decision question: Should customers ever receive app-generated payment links?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: Payment links need security, expiry, customer identity checks, and payment provider approval.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Customer-facing invoice links

- Decision question: Should customers ever receive app-generated invoice links?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: Invoice links may expose customer and booking details if not carefully limited.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Customer booking/payment history access

- Decision question: Should customers be able to view booking or payment history through a public link?
- Recommended default for Prestige Limo Ops: No, not now.
- Why this is safest: Internal folders may contain notes and data that should not be public.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Link expiry/security rules

- Decision question: If customer-facing links are approved later, should they require expiry and security rules?
- Recommended default for Prestige Limo Ops: Yes, if links are ever approved.
- Why this is safest: Expiring secure links reduce the risk of old links exposing private customer information.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 8. Notification And Integration Decisions

### WhatsApp sending

- Decision question: Should the app send WhatsApp messages?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: WhatsApp sending needs approved copy, recipient checks, logs, and mistake controls.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Email sending

- Decision question: Should the app send emails?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: Email sending needs approved templates, sender setup, delivery checks, and audit history.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### SMS sending

- Decision question: Should the app send SMS messages?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: SMS can cost money and reach customers immediately, so it needs separate approval.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Payment provider API

- Decision question: Should the app connect to Stripe, HitPay, PayPal, PayNow API, or another payment provider?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: Provider integration needs credentials, webhook security, reconciliation rules, and error handling.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Bank API

- Decision question: Should the app connect to a bank API?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: Bank data access is sensitive and should wait until manual payment tracking is working safely.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Webhooks

- Decision question: Should the app receive payment or bank webhooks?
- Recommended default for Prestige Limo Ops: Keep disabled for now.
- Why this is safest: Webhooks can change records automatically and need strict security before production use.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 9. Audit Trail Decisions

### Payment requested event

- Decision question: Should the system record an audit event when payment is requested?
- Recommended default for Prestige Limo Ops: Yes, later when production payment tracking is approved.
- Why this is safest: It shows who requested payment, when, for which customer and booking.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Invoice sent event

- Decision question: Should the system record an audit event when an invoice is marked sent?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It helps prove when the customer was asked to pay, even if sending happened outside the app.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Partial payment received event

- Decision question: Should the system record an audit event when partial payment is received?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It protects the remaining balance and explains why the booking is still partly outstanding.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Payment received event

- Decision question: Should the system record an audit event when full payment is received?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It creates proof of who marked the record paid and what reference was used.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Waived event

- Decision question: Should the system record an audit event when a balance is waived?
- Recommended default for Prestige Limo Ops: Yes, owner/admin only.
- Why this is safest: Waiving money owed should always have a permanent reason and actor.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Refunded event

- Decision question: Should the system record an audit event when a refund is marked?
- Recommended default for Prestige Limo Ops: Yes, owner/admin only.
- Why this is safest: Refunds affect money records and may need later checking.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Follow-up scheduled event

- Decision question: Should the system record an audit event when a follow-up is scheduled?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It makes collection follow-up visible and prevents forgotten balances.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Follow-up completed event

- Decision question: Should the system record an audit event when a follow-up is completed?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: It shows what collection action was taken and when.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Invoice number issued event

- Decision question: Should the system record an audit event when an invoice number is issued?
- Recommended default for Prestige Limo Ops: Yes.
- Why this is safest: Invoice numbers should be permanent and traceable.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Statement generated event later only

- Decision question: Should statement generation create an audit event later if real statements are approved?
- Recommended default for Prestige Limo Ops: Yes, later only.
- Why this is safest: A real statement is a customer account record and should be traceable.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Audit events edited/deleted

- Decision question: Can audit events ever be edited or deleted through normal app use?
- Recommended default for Prestige Limo Ops: No. Audit events should be append-only and cannot be edited or deleted.
- Why this is safest: The audit trail is useful only if old events cannot be quietly changed.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 10. Data Retention And Document Decisions

### Store receipts/documents later

- Decision question: Should receipts, vouchers, invoice PDFs, statement PDFs, or other documents be stored later?
- Recommended default for Prestige Limo Ops: Not yet.
- Why this is safest: Document storage needs access rules, retention rules, and storage security first.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Payment record retention

- Decision question: How long should payment records be kept?
- Recommended default for Prestige Limo Ops: Keep long-term unless the owner approves a clear retention rule.
- Why this is safest: Payment records support customer account history and accounting checks.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Audit record retention

- Decision question: How long should audit records be kept?
- Recommended default for Prestige Limo Ops: Keep long-term unless the owner approves a clear retention rule.
- Why this is safest: Audit records explain what happened if there is a dispute or mistake.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

### Archive old customer data

- Decision question: Can old customer data be archived?
- Recommended default for Prestige Limo Ops: Yes, archive later if needed, but do not delete payment or audit history without owner approval.
- Why this is safest: Archiving keeps daily screens clean while preserving important history.
- Owner answer: [ ] Approved / [ ] Not approved / [ ] Change needed
- Notes:

## 11. Migration Approval Decisions

No migration may be created or applied until these are approved:

- [ ] Owner approved schema.
- [ ] Owner approved RLS/security rules.
- [ ] Owner approved server route design.
- [ ] Owner approved invoice sequence/RPC design.
- [ ] Owner approved audit event immutability.
- [ ] Owner approved rollback plan.
- [ ] Owner explicitly approved migration creation.
- [ ] Owner explicitly approved migration application.

Migration creation and migration application are two separate approvals.

Creating a migration file means preparing a database change file. Applying a migration means changing the actual Supabase database. The owner must approve both separately.

## 12. Testing Approval Decisions

These checks must pass before any production customer/payment work is considered safe:

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
- [ ] RLS blocks unauthorized access.
- [ ] No Supabase migration occurs unless explicitly approved.
- [ ] No payment API, bank API, notification API, WhatsApp, email, or SMS sending is added unless separately approved.
- [ ] Mobile/browser compatibility remains protected.

Mobile/browser compatibility means the app remains usable on iOS phones/tablets, Android phones/tablets including Korean and China-market devices, Safari iOS, Chrome Android, Samsung Internet, common Android WebView/Chrome-based browsers, tablet browsers, and desktop.

## 13. Final Owner Approval Section

Owner final answer:

- [ ] I approve these defaults.
- [ ] I want changes before migration planning.
- [ ] I do not approve production schema work yet.

Owner notes:

Approved by:

Date:

## 14. Recommended Next Step

Review this answer sheet with the owner first. Do not create migrations yet.

After the owner marks answers, the safest next protected task is still planning-only: turn the approved answers into a Supabase schema/RLS migration plan. Real migration creation, migration application, invoice numbering, payment tracking, payment API, bank API, notification sending, real invoice generation, and real statement generation should wait for explicit separate approval.
