# Regular Customer Monthly Billing Workflow Plan

This is a workflow planning and acceptance checklist only. No app behavior change, migration file, schema change, Supabase command, payment API, bank API, notification sending, calendar sync implementation, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This document defines the protected regular monthly customer booking and billing workflow before implementation starts.

The goal is to make the next build steps clear, small, and safe: regular customer bookings should be entered internally, linked to the correct customer folder, tracked for monthly billing, and previewed for manual bank-transfer billing before any real invoice, payment, notification, calendar, or Stripe behavior is added.

## 2. Current Confirmed State

- The main dispatcher booking save already exists.
- A dedicated regular customer booking form does not exist yet.
- Customer linking is still mock-only.
- Edit, amend, and cancel workflow with audit protection does not exist yet.
- The monthly billing list is mock-only or not real-linked yet.
- Draft monthly invoice preview for bank transfer does not exist yet.
- Calendar sync planning is not created yet.
- Calendar sync implementation is not approved.
- Real invoice generation is not approved.
- Stripe is later only.
- Bank transfer remains manual-record only, with no bank API.

## 3. Approved Build Order

1. Internal customer booking form for regular customers
2. Edit / amend / cancel workflow with audit protection
3. Customer monthly billing booking list
4. Draft monthly invoice preview for bank transfer
5. Calendar sync planning
6. Calendar sync implementation only after explicit approval
7. Real invoice generation only after explicit approval
8. Stripe later

## 4. Internal Regular Customer Booking Form Plan

The regular customer booking form should be for internal dispatcher/admin use only. It is not customer-facing.

Required fields:

- Customer / account
- Booker / contact person
- Passenger name
- Pickup date
- Pickup time
- Pickup location
- Drop-off location
- Flight number if any
- Route type: Arrival/MNG, Departure/DEP, Transfer/TRF, Disposal/DSP/hourly
- Vehicle type
- Number of passengers
- Luggage
- Extra stops
- Customer reference / PO number if any
- Internal note
- Billing month
- Billing status default: unbilled / draft
- Payment method default: monthly bank transfer manual
- Link to customer folder

Planning notes:

- The form should be easy to use from phone, tablet, and desktop.
- Required fields should be obvious before saving.
- Regular customer selection should be deliberate, not guessed silently.
- The form should not expose driver payout or private CRM notes.
- The form should preserve existing parser booking save behavior.

## 5. Save/Link Behavior Plan

For regular customer bookings:

- New regular customer booking must save as a booking.
- It must link to the selected customer/account.
- It must appear in the customer folder.
- It must appear in the monthly billing list.
- It must not create an invoice number.
- It must not generate an invoice.
- It must not send a notification.
- It must not call a payment API.
- It must not use a bank API.
- It must preserve existing parser booking save behavior.

Important boundary:

- Saving a regular customer booking is not the same as issuing an invoice.
- Linking to a customer folder is not the same as creating a real payment record unless the future schema and route are explicitly approved.
- Bank transfer should remain a manual-record payment method only.

## 6. Edit/Amend/Cancel Workflow Plan

The edit, amend, and cancel workflow must protect booking history.

Rules:

- Dispatcher can amend normal booking details.
- Cancel does not delete the booking by default.
- Cancelled booking should be marked cancelled and remain visible in history.
- Every edit, amend, and cancel should create an audit entry later.
- Audit entry should record actor, timestamp, old value, new value, and reason/note.
- Important booking fields should not be silently overwritten.
- Audit history must not be deleted.
- Real audit persistence requires later schema/migration approval.

Fields that should be considered important:

- Customer/account link
- Pickup date and time
- Pickup and drop-off location
- Passenger name
- Route type
- Vehicle type
- Billing month
- Billing status
- Customer reference / PO number
- Cancellation reason

Safe behavior:

- Minor text corrections can be allowed, but they should still record what changed once audit persistence exists.
- Cancellation should keep the booking in the customer folder history.
- Reinstating a cancelled booking should require a visible reason/note later.

### Stage 4A-46 Detailed Edit/Amend/Cancel Plan

This section is planning only. It does not approve app behavior changes, schema changes, real saves, invoice generation, statement generation, PDF generation, payment APIs, bank APIs, notification sending, calendar sync, or real audit records.

Edit booking workflow:

- Who can edit: dispatcher/admin staff only. This workflow is internal and not customer-facing.
- Editable fields later: customer/account link, booker/contact person, passenger name, pickup date, pickup time, flight number, pickup location, drop-off location, route type, vehicle type, passenger count, luggage, extra stops, customer reference / PO number, billing month, billing status, payment method label, and internal note.
- Staff display: show the current booking, highlight changed fields, and place success/error feedback near the edit controls. After real save is approved, the booking row should show that it was edited, with the changed-by and changed-at details available to staff.
- Before real save is allowed: owner approval is required for the save route, permissions, validation rules, audit storage, tests, and any schema/migration work. Required fields must still be validated, customer selection must stay deliberate, and existing Save Booking + CRM behavior must remain protected.
- Monthly billing effect later: unbilled or draft rows should use the latest saved booking values. If a booking is already billed or paid, amount, customer, date, billing month, and cancellation-related edits should require extra staff review before they affect draft monthly billing.

Amend booking workflow:

- Difference from a simple edit: a simple edit is for small corrections before billing, such as spelling or missing details. An amendment is for a meaningful operational or billing change, such as date/time, route, vehicle, customer, billing month, amount-impacting details, or changes after confirmation.
- Amendment reason later: staff should be required to enter a short reason before saving an amendment.
- Old vs new display: show old value and new value side by side for each amended field, so staff can review the change before saving.
- Billing review: amended bookings should be easy to spot before monthly billing is finalized. If the amendment may affect the customer total, the row should stay in review/draft until staff confirms it.

Cancel booking workflow:

- Cancel status: cancellation should mark the booking as cancelled. It should not delete the booking.
- Cancellation reason: staff should choose or enter a reason, with a note for special cases.
- Cancellation fee / no-show fee planning only: the future UI may allow a manual fee or no-show fee review, but it must not charge, invoice, create a payment record, or call a bank/payment API automatically.
- Monthly billing effect later: cancelled bookings should remain visible in customer history and monthly billing review. The billing list should clearly show whether the cancelled row is excluded, included as a cancellation fee, or included as a no-show fee after approved rules are added.
- No automatic invoice/payment behavior: cancelling a booking must not create an invoice number, real invoice, statement, PDF, payment, refund, sending action, or bank/payment provider call.

Audit protection plan:

- Later implementation should keep a history of who changed what and when.
- The history should include action type, actor, timestamp, old value, new value, reason/note, and affected booking.
- For now, no real audit records should be created.
- Before implementation, add tests proving edits, amendments, cancellations, and reinstatements create the expected audit history only after audit persistence is explicitly approved.
- Tests should also prove cancelled bookings are not deleted and audit history is not hidden or overwritten.

Safety boundaries for this workflow:

- No real invoice generation.
- No invoice numbers.
- No PDF generation.
- No sending by WhatsApp, email, or SMS.
- No notification sending.
- No payment API, Stripe, PayNow, payment provider, or bank API.
- No calendar sync implementation.
- No Supabase schema change, migration, db push, or db reset until explicitly approved.
- Manual bank transfer remains manual-record only.
- No real customer, payment, or audit records should be created during planning/mock stages.

Future testing plan:

- Add browser smoke tests for edit, amend, cancel, and reinstate UI when implementation is approved.
- Add regression tests that existing Save Booking + CRM remains protected.
- Keep parser tests unchanged unless parser behavior is intentionally touched and approved.
- Keep mobile and no-horizontal-overflow checks in the protected test flow.
- Add Supabase write tests only after real customer booking save/linking is explicitly approved.
- Keep tests blocking invoice generation, statement generation, invoice numbers, PDF generation, sending, payment APIs, bank APIs, notification sending, and calendar sync until those items are separately approved.

## 7. Customer Monthly Billing Booking List Plan

The customer folder should show monthly billing bookings for the selected customer only.

The list should support:

- Filter by billing month.
- Statuses: unbilled, draft, billed, paid, cancelled.
- Monthly account customers.
- Paid/cancelled handling that is clear to staff.
- Open booking details from the list.
- Review customer reference / PO number if provided.
- Review manual bank-transfer payment method.

Safety rules:

- No unrelated customer booking leakage.
- No driver payout exposure.
- No private CRM leakage.
- Paid bookings should remain visible in history.
- Cancelled bookings should remain visible in history.
- Active amount-due views should make paid/cancelled handling clear.

## 8. Draft Monthly Invoice Preview For Bank Transfer Plan

The first monthly billing preview should be preview-only.

Rules:

- Manual bank transfer payment method.
- No real invoice number at this stage unless separately approved.
- No PDF generation unless separately approved.
- No sending unless separately approved.
- No bank API.
- Show booking rows, subtotal, adjustments, draft total, and notes.
- Clearly label as Draft Preview / Not Issued.
- Keep invoice generation separate and locked.

Draft preview should show:

- Customer/account name
- Billing month
- Included booking rows
- Pickup date/time
- Passenger or reference
- Route summary
- Customer reference / PO number if any
- Amount per booking
- Adjustment lines if any
- Draft subtotal
- Draft total
- Manual bank-transfer note
- Internal note, if safe for accounts

Locked behavior:

- Previewing a draft must not allocate an invoice number.
- Previewing a draft must not generate a real invoice.
- Previewing a draft must not create a PDF.
- Previewing a draft must not send WhatsApp, email, or SMS.
- Previewing a draft must not call Stripe, PayNow, payment provider, or bank APIs.

## 9. Calendar Sync Planning

Calendar planning is docs-only in this stage.

Future calendar sync, if approved later, should consider:

- Create/update calendar event when a regular customer booking is created or amended.
- Handle amendments.
- Handle cancellations.
- Prevent duplicate calendar events.
- Store and respect timezone.
- Use pickup date/time.
- Include customer name, passenger, route, and vehicle.
- Avoid exposing private CRM notes or driver payout.

Calendar sync implementation must be a separate task. It must not be implemented yet.

Calendar approval questions for later:

- Which calendar provider should be used?
- Which calendar should receive regular customer bookings?
- Who can create/update/cancel synced events?
- What details are safe to place in calendar event title and description?
- How should failed sync attempts be shown to staff?

## 10. Real Invoice And Stripe Gates

These gates remain locked:

- Real invoice generation is not approved.
- Statement generation is not approved.
- Stripe is later only.
- Payment API is not approved.
- Bank API is not approved.
- Manual bank transfer remains manual-record only.

Before real invoice generation:

- The owner must approve invoice numbering.
- The owner must approve draft-to-issued invoice rules.
- The owner must approve whether PDF generation is needed.
- The owner must approve whether invoices can be sent from the app.
- The owner must approve migration creation and migration application separately if schema is required.

Before Stripe:

- The owner must approve Stripe sandbox work.
- The owner must approve webhook security rules.
- The owner must approve payment status mapping.
- The owner must approve production payment behavior separately.

## 11. UI/Mobile Acceptance Checklist

The future UI must pass these checks:

- [ ] Works on iOS Safari.
- [ ] Works on Android Chrome and Samsung Internet.
- [ ] Works on tablets and desktop.
- [ ] Buttons are touch-friendly.
- [ ] No horizontal overflow.
- [ ] Error/success messages appear near the clicked button.
- [ ] Regular customer form is not desktop-only.
- [ ] Customer folder billing list is readable on mobile.
- [ ] Text remains readable on small phones.
- [ ] Long customer names, route names, and notes wrap cleanly.
- [ ] Tables or row lists remain usable without forcing page-level horizontal scrolling.

## 12. Test Acceptance Checklist

Future tests should protect:

- [ ] Parser regression remains protected.
- [ ] Existing Save Booking + CRM still works.
- [ ] Customer Match Suggestion mock behavior is not broken.
- [ ] Regular customer booking saves and links to selected customer.
- [ ] Booking appears only in the correct customer folder.
- [ ] Booking appears in the monthly billing list.
- [ ] Edit creates audit entry.
- [ ] Amend creates audit entry.
- [ ] Cancel marks cancelled without deleting.
- [ ] Draft invoice preview does not generate invoice number.
- [ ] Draft invoice preview does not send.
- [ ] No bank API.
- [ ] No payment API.
- [ ] No calendar sync unless explicitly approved.
- [ ] No driver payout exposure.
- [ ] No private CRM leakage.
- [ ] Mobile/browser compatibility remains protected.

Required command protection for future work:

- `npm run test:parser`
- `npm run lint`
- `npm run build`
- `npm run test:safe`
- `git diff --name-only -- lib/booking-parser.ts supabase`
- `git diff --name-only -- app lib supabase`, with expected output reviewed based on whether the task is docs-only or app work

## 13. Recommended Implementation Sequence After This Doc

1. Build internal regular customer booking form as mock/local or app-state first if needed.
2. Protect with browser tests.
3. Then connect/link to existing booking save only after scoped approval.
4. Add edit/amend/cancel audit UI next.
5. Add monthly billing list.
6. Add draft invoice preview.
7. Calendar sync planning separately.
8. Calendar implementation only after approval.
9. Real invoice generation only after approval.
10. Stripe later.

## 14. Recommended Next Step

Review this workflow plan first. Do not implement app behavior yet.

The safest next task after owner review is a small protected implementation design for the internal regular customer booking form, or a mock-only form prototype if the owner explicitly approves app behavior work. Calendar sync, real invoice generation, payment API, bank API, notifications, WhatsApp/email/SMS sending, Stripe, and production payment behavior should stay locked until separately approved.
