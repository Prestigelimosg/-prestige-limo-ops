# Customer Payments Workflow Design

This is a planning document only. It does not approve a migration, does not change app behavior, and does not add payment provider, bank, notification, Supabase, or production implementation work.

## 1. Purpose

Prestige Limo Ops should eventually keep bookings, customer folders, invoices, payment status, outstanding balances, and follow-up workflow in one internal place so dispatch and accounts can see what has been quoted, completed, requested, collected, and still owed.

The goal is operational control, not payment automation first. A dispatcher should be able to save a booking, link it to a customer, record the agreed payment terms, track whether money is outstanding after the job is completed, and follow up until the balance is settled. This reduces missed collections, duplicated spreadsheets, lost WhatsApp context, and unclear customer account history.

## 2. Customer Folder Concept

Each customer should have one internal folder or page that acts as the source of truth for that customer relationship.

The folder should contain:

- customer or company name
- primary and secondary contacts
- all bookings linked to the customer
- upcoming jobs
- completed jobs
- invoices
- payment history
- outstanding balance
- payment terms
- follow-up notes
- documents and receipts later, after a separate storage design is approved

Each customer folder should behave like a clean customer file. It must be easy to scan the customer/company details, contacts, all booking history, upcoming jobs, completed jobs, invoices, payment history, outstanding balance, follow-up notes, and later documents or receipts. All booking history should be clear and chronological, with enough filtering to find past jobs without turning the folder into a cluttered dashboard.

The customer folder should not be a public customer portal. It is an internal dispatcher/accounts view and should not expose unrelated customers, driver payout, private internal notes, or payment provider secrets.

## 3. Customers Dashboard Concept

The customers dashboard should be a single overview page for payment collection and account follow-up. It must stay clean, simple, and not messy. The core job is to help dispatch/accounts quickly locate a customer folder, see who owes money, and decide the next follow-up action.

It should show:

- total outstanding
- overdue amount
- paid this month
- customers with unpaid jobs
- customers needing follow-up today
- filters by Paid, Unpaid, Partial, Overdue, and Monthly Account

The dashboard should follow Zoho Invoice-style simplicity:

- search customer/company
- simple list or card layout
- outstanding amount
- overdue amount
- payment status
- next follow-up date
- open customer folder action

The dashboard should favor action lists over raw accounting complexity: who owes money, how much, which job created the balance, when it is due, and what follow-up is next.

## 4. Booking Payment Fields

Future booking payment tracking should plan for these fields:

- `quoted_price`: customer-facing agreed price for the booking
- `payment_method`: expected or actual collection method
- `payment_status`: current payment collection state
- `payment_terms`: due-on-completion, due-on-date, monthly account, prepaid, or other agreed terms
- `amount_paid`: amount collected so far
- `balance_due`: remaining amount owed
- `due_date`: date payment is expected
- `payment_reference`: bank transfer reference, receipt id, card reference, PayNow note, or manual note
- `payment_notes`: dispatcher/accounts notes specific to collection
- `last_follow_up_at`: last manual follow-up timestamp
- `next_follow_up_at`: next planned follow-up timestamp

The app should compute or validate `balance_due` from `quoted_price` minus valid recorded payments where possible, while still allowing controlled manual adjustment for waived, refunded, or corrected jobs.

## 5. Payment Statuses

Planned payment statuses:

- Unpaid
- Payment Requested
- Invoice Sent
- Partially Paid
- Paid
- Overdue
- Waived
- Refunded / Cancelled, if needed

Status changes should be explicit and auditable. A paid booking should stay visible in customer history even after it leaves the outstanding collection list.

## 6. Payment Methods

Planned payment methods:

- Card
- Bank Transfer
- PayNow/manual transfer
- Cash
- Monthly Account
- Complimentary/Waived

Payment method records should describe how the customer is expected to pay or did pay. They should not imply that a real payment provider integration exists until a later approved implementation stage.

## 7. Collection Rules

Core collection rules:

- completed job plus `balance_due` greater than zero equals Outstanding
- due date passed plus `balance_due` greater than zero equals Overdue
- monthly account jobs group into a customer statement
- paid bookings disappear from the outstanding list but remain in customer history
- partial payment keeps the remaining balance visible until fully settled, waived, refunded, or cancelled

Outstanding and overdue views should be derived from booking/payment state rather than manually maintained lists. Follow-up dates should make collection work visible before it is forgotten.

## 8. Customer Invoice Prefix and Running Numbers

Each customer must support a fixed invoice prefix. Invoice numbers must run sequentially under that customer's prefix.

Examples:

- UBS-0001, UBS-0002, UBS-0003
- RITZ-0001, RITZ-0002, RITZ-0003

Invoice number rules:

- invoice numbers must be unique
- invoice numbers must not be reused
- once issued, an invoice number should be immutable
- voided, cancelled, or refunded invoices should keep their issued invoice number and move by status, not deletion or reuse
- monthly account and customer statement workflow should still support grouped invoices or statements later

Changing a customer's invoice prefix must be protected by warning and design rules because it can make invoice history messy. A future implementation should require a deliberate internal action, show the existing issued sequence, explain that old invoices keep their original numbers, and prevent accidental prefix changes during normal dispatch/accounting work.

## 9. Manual-First Workflow

The first safe workflow should be manual-first:

1. Dispatcher parses and saves the booking.
2. Dispatcher links the booking to an existing customer or creates a new customer.
3. Dispatcher records quoted price, payment method, payment terms, and due date.
4. Dispatcher marks Payment Link Sent or Invoice Sent when a request is sent manually outside the app.
5. Dispatcher manually marks payment received after confirming funds.
6. Dispatcher records the payment reference and received date.
7. Dispatcher sets the next follow-up date when money is still outstanding.

No real payment API integration should be added in this stage. No card charge, PayNow request, bank API lookup, webhook, or notification should be sent by the app.

## 10. Future Automation Plan

Future automation should be planned only after the manual workflow, schema, RLS, and internal controls are approved.

Possible later stages:

- card webhook later, after payment provider selection and webhook security design
- bank transfer reconciliation later, after bank data access and matching rules are approved
- receipt upload later, after storage, retention, and access-control design
- automated reminders later, after notification copy, rate limits, opt-out behavior, and audit logging are approved

These are not part of this document's implementation scope.

## 11. Customer Dashboard UX

A simple dispatcher workflow should look like this:

1. Parse booking.
2. Save booking.
3. Link or create customer.
4. Set payment method and due date.
5. Complete job.
6. If unpaid, the job appears in Outstanding Payments.
7. Dispatcher marks payment requested, invoice sent, partial payment, paid, waived, or follow-up needed.
8. When collected, dispatcher marks paid and records the reference.
9. Customer folder updates automatically.

The customer dashboard should make missed payment collection difficult by showing outstanding balances, overdue balances, and follow-ups due today without requiring the dispatcher to remember individual jobs.

The dashboard should remain intentionally plain: searchable customer/company list, visible outstanding and overdue amounts, payment status, next follow-up date, and one clear action to open the individual customer folder. The individual customer folder is where full booking history, invoices, payment history, and notes belong.

## 12. Safety Rules

Customer payment and folder surfaces must not expose:

- driver payout
- internal notes not meant for customer/account work
- unrelated customer bookings
- private CRM data outside the active customer/account context
- bank details beyond what the dispatcher needs to verify and record payment
- payment provider secret keys

Future public-facing customer or payment views, if ever approved, must use a separate safe projection and should never reuse internal dashboard payloads.

## 13. Suggested Database Planning Only

No migration is approved by this document. These are planning targets for a later schema/RLS proposal:

### `customers`

Purpose: one row per customer/company/account.

Likely fields: customer name, company name, account type, fixed invoice prefix, next invoice sequence pointer, default payment terms, status, created timestamps, and internal ownership metadata.

### `customer_contacts`

Purpose: one or more contacts per customer.

Likely fields: customer id, contact name, phone, email, role, primary flag, and notes safe for internal account work.

### Booking Payment Fields or `booking_payments`

Purpose: represent quoted price, payment method, payment status, due date, amount paid, balance due, and payment references.

The simplest first implementation may add planned payment fields to bookings. A separate `booking_payments` table may be better if partial payments, multiple receipts, refunds, or detailed audit are needed from day one.

### `payment_events`

Purpose: immutable payment activity log for requested, invoice sent, partial paid, paid, waived, refunded, overdue, and follow-up events.

### `invoices` or `customer_statements`

Purpose: group monthly account jobs or invoice batches for customers that pay by statement.

Likely invoice fields: customer id, invoice prefix, invoice number, sequence number, status, issued date, due date, subtotal, total, amount paid, balance due, and immutable issued-number metadata. Invoice uniqueness should be enforced in the future schema, likely with customer/prefix/sequence constraints and a separate immutable invoice number display field.

### `follow_up_events`

Purpose: record manual collection follow-ups, notes, next follow-up date, and completion state.

RLS and access-control design must happen before any migration. Internal roles, service-role usage, customer isolation, and audit retention need explicit approval.

## 14. Testing Plan

Future tests should cover:

- customer dashboard loads
- customer dashboard stays clean and searchable
- customer folder shows only that customer's bookings
- customer folder shows all booking history clearly
- unpaid completed booking appears as outstanding
- paid booking disappears from outstanding
- partial payment shows balance due
- monthly account groups jobs into a statement view
- customer invoice prefix creates sequential invoice numbers
- invoice numbers are unique and not reused
- issued invoice numbers are immutable
- follow-up due today appears in the collection workflow
- no parser regression
- Driver Dispatch, Customer Copy, and Job Card copy unchanged
- no Supabase migration unless approved
- no payment provider API is called in manual-first stages
- no driver payout or unrelated customer bookings appear in customer payment views

## 15. Recommended Implementation Order

Recommended staged path:

1. Design doc.
2. Mock UI only for customer folders, outstanding payments, and manual payment states.
3. Schema/RLS proposal only.
4. Migration only after explicit approval.
5. Manual payment tracking with internal-only access.
6. Future payment provider integration only after a separate provider, webhook, reconciliation, and secrets-management design is approved.

The next safest coding step after this document is mock UI only for customer folders and outstanding payment review, still with no migration and no payment API.
