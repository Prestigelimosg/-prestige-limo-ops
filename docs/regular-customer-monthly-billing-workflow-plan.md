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

### Stage 4A-48 Real Save/Linking Plan — Planning Only

This section is planning only. It does not approve app behavior changes, schema changes, migrations, Supabase commands, real booking saves, real customer records, payment records, audit records, invoice generation, invoice numbers, statements, PDFs, sending, payment APIs, bank APIs, Stripe, PayNow, notifications, WhatsApp, email, SMS, or calendar sync.

Current state:

- The regular customer form and monthly billing list on `/customers` are still mock/local only.
- Local rows reset on page refresh.
- Draft invoice preview is mock/local only.
- Edit, amend, and cancel row controls are mock/local only.
- No Supabase write exists for this regular customer form/list yet.

Future real save goal:

- Allow staff to save a regular customer booking into the real booking system later.
- Link the saved booking to the selected customer folder.
- Keep monthly billing grouping clear by customer and billing month.
- Keep invoice number creation separate from booking save/linking.
- Keep payment and bank transfer handling manual-record only.

Data that must be saved later, subject to approved schema/data mapping:

- Customer/account id.
- Booker/contact person.
- Passenger name.
- Pickup date.
- Pickup time.
- Pickup location.
- Drop-off location.
- Route type.
- Vehicle type.
- Passenger count.
- Luggage.
- Extra stops.
- Flight number, if any.
- Customer reference / PO.
- Billing month.
- Billing status.
- Payment method.
- Internal staff note.
- Source: regular customer form.
- Created by / updated by, later if auth exists.

Customer linking rules:

- Only link to an existing known customer account when staff select it.
- Do not auto-create a real customer account without separate approval.
- Do not infer the customer folder from free text during this stage.
- Customer invoice prefix should stay stable and customer-specific later.
- No invoice number should be created during booking save.

Save behavior safety plan:

- Future implementation should have a clear Save Regular Booking button, separate from mock preview.
- Show staff a confirmation before the first real save.
- Show success or error feedback near the save button.
- Prevent duplicate save from double-clicking.
- Keep mock preview and real save visibly different.
- Show the saved booking in the customer folder and monthly billing list only after save succeeds.

Audit and edit/amend/cancel relation:

- Real save must prepare for future audit history.
- For now, no real audit record should be created.
- Later edit, amend, and cancel should operate on saved booking ids only.
- Mock row controls should not pretend to edit real bookings.

Monthly billing relation:

- Saved regular bookings should become eligible for monthly billing review.
- Billing status should start as unbilled/draft unless staff explicitly change it later.
- Cancelled, no-show, and fee behavior should be reviewed before invoice preview.
- No invoice number, real invoice, PDF, statement, or sending should happen during save/linking.

Supabase planning only:

- Do not create migrations now.
- Before implementation, inspect existing booking/customer tables and types.
- Any schema change must be separately approved.
- Do not run Supabase db push or Supabase db reset.
- Prefer small staged implementation:
  1. Plan schema/data mapping.
  2. Add tests.
  3. Implement a save API or server action only after approval.
  4. Protect duplicate save and error handling.
  5. Browser-test customer folder visibility.

Required tests before future implementation:

- Parser tests remain unchanged unless parser behavior is touched.
- Regular customer form validation still works.
- Mock preview still works.
- Real save button cannot save an invalid booking.
- Successful save creates exactly one booking record.
- Saved booking links to the correct customer.
- No invoice number is created.
- No payment or bank API is called.
- No notification, calendar, or PDF behavior is added.
- Duplicate click does not create a duplicate booking.
- Customer folder shows the saved booking correctly.
- Mobile and no-horizontal-overflow checks still pass.

Explicit non-goals:

- No real invoice generation.
- No invoice numbers.
- No statement or PDF generation.
- No sending.
- No payment API, bank API, Stripe, or PayNow.
- No notification, WhatsApp, email, or SMS sending.
- No calendar sync.
- No customer auto-create.
- No migration without separate approval.
- No parser change.

### Stage 4A-52 Real Save Confirmation/Approval Plan — Planning Only

This section is planning only. It does not approve app behavior changes, schema changes, migrations, Supabase commands, real booking saves, real customer records, payment records, audit records, invoice generation, invoice numbers, statements, PDFs, sending, payment APIs, bank APIs, Stripe, PayNow, notifications, WhatsApp, email, SMS, or calendar sync.

Current state:

- Save Regular Booking is still mock/local only.
- Mock Save Confirmation — Not Active is still mock/local only.
- No booking is saved.
- No customer folder is linked.
- No Supabase write exists for the regular customer form/list.
- No invoice number, audit record, payment, notification, calendar, statement, or PDF is created.

Future real confirmation goal:

- Staff should review all important booking details before a real save is allowed.
- Real save must require a clear confirmation step.
- Confirmation must be separate from the mock booking preview and mock invoice preview.
- Confirmation must not create invoice numbers.
- Confirmation must not trigger payment, bank, notification, calendar, statement, or PDF behavior.

Staff review checklist before future real save:

- Selected customer/account.
- Booker/contact person.
- Passenger name.
- Pickup date.
- Pickup time.
- Pickup location.
- Drop-off location.
- Route type.
- Vehicle type.
- Passenger count.
- Luggage.
- Extra stops.
- Flight number, if any.
- Customer reference / PO.
- Billing month.
- Billing status.
- Payment method.
- Internal staff note.

Approval rules:

- Staff must see a clear Review before save panel before any future real save.
- Staff must confirm intentionally before a real save runs.
- Invalid bookings must never reach final confirmation.
- Real save must not happen silently.
- Duplicate double-click save must be blocked.
- If saving fails, show a clear local error near the save button.
- If saving succeeds, show a clear local success message near the save button.

Customer linking rules:

- Only link to an existing selected customer account.
- Do not auto-create real customer accounts without separate approval.
- Do not infer customer folder from free text at this stage.
- Customer invoice prefix should stay stable and customer-specific later.
- No invoice number should be created during booking save.

Audit planning:

- Later real save should prepare for audit history.
- Audit should record who saved, what was saved, and when.
- For now, no real audit records should be created.
- Future edit, amend, and cancel workflows should operate only on saved booking ids.

Monthly billing relation:

- Saved regular bookings should become eligible for monthly billing review.
- Billing status should start as unbilled/draft unless staff explicitly change it later.
- Cancelled, no-show, and fee behavior should be reviewed before invoice preview.
- No real invoice, invoice number, statement, PDF, or sending should happen during save confirmation.

Supabase planning only:

- Do not create migrations now.
- Before implementation, inspect existing booking/customer tables and types.
- Any schema change must be separately approved.
- Do not run Supabase db push or Supabase db reset.
- Future implementation should be staged:
  1. Confirm data mapping.
  2. Add tests first.
  3. Implement a save API or server action only after approval.
  4. Protect duplicate save.
  5. Handle save success and error safely.
  6. Browser-test saved booking visibility in the customer folder and monthly billing list.

Required tests before future implementation:

- Parser tests remain unchanged unless parser behavior is touched.
- Regular customer form validation still works.
- Mock preview still works.
- Mock confirmation remains mock until real implementation is explicitly approved.
- Invalid booking cannot reach real confirmation.
- Successful real save creates exactly one booking record.
- Duplicate click does not create a duplicate booking.
- Saved booking links to the correct customer.
- No invoice number is created.
- No payment or bank API is called.
- No notification, calendar, or PDF behavior is added.
- Customer folder shows the saved booking correctly.
- Mobile and no-horizontal-overflow checks still pass.

Explicit non-goals:

- No real invoice generation.
- No invoice numbers.
- No statement or PDF generation.
- No sending.
- No payment API, bank API, Stripe, or PayNow.
- No notification, WhatsApp, email, or SMS sending.
- No calendar sync.
- No customer auto-create.
- No migration without separate approval.
- No parser change.
- No real Supabase save in this stage.

### Stage 4A-54 Real Save Data Mapping and Test Contract — Planning Only

This section is planning only. It does not approve app behavior changes, parser changes, schema changes, migrations, Supabase commands, real booking saves, real customer records, payment records, audit records, invoice generation, invoice numbers, statements, PDFs, sending, payment APIs, bank APIs, Stripe, PayNow, notifications, WhatsApp, email, SMS, or calendar sync.

Current state:

- Regular customer save is still mock/local only.
- Mock Save Confirmation — Not Active is still mock/local only.
- Future Saved Booking Visibility — Mock Only is passive.
- No real Supabase save exists for the regular customer form/list.
- No booking, customer, payment, or audit record is created.
- No invoice number, statement, PDF, sending, payment, bank, notification, or calendar behavior exists.

Future data mapping goal:

- Define how regular customer form data should map into a future real booking record.
- Keep invoice generation separate from booking save.
- Keep payment and bank transfer handling manual-record only.
- Keep customer folder linking explicit and safe.
- Avoid changing parser behavior unless a separate parser task is explicitly approved.

Planned source fields from the regular customer form:

- Selected customer/account id: the existing customer account chosen by staff.
- Booker/contact person: the person or team requesting the ride.
- Passenger name: the traveler or lead guest for the booking.
- Pickup date: the service date.
- Pickup time: the staff-entered pickup time.
- Pickup location: the starting point.
- Drop-off location: the destination or final stop.
- Route type: Arrival/MNG, Departure/DEP, Transfer/TRF, Disposal/DSP/hourly, or later approved route type.
- Vehicle type: the requested vehicle category.
- Passenger count: the number of passengers.
- Luggage: luggage notes or count, if supplied.
- Extra stops: any planned intermediate stops.
- Flight number if any: flight reference for airport bookings.
- Customer reference / PO: customer reference, purchase order, or billing note.
- Billing month: the month used for monthly billing review.
- Billing status: the planned billing state, normally unbilled/draft at first.
- Payment method: normally monthly bank transfer manual unless staff choose an approved manual option.
- Internal staff note: internal operational notes that should not be customer-facing.
- Source: regular customer form.

Planned derived/internal fields:

- Created timestamp.
- Updated timestamp.
- Created by / updated by later if auth exists.
- Saved booking id after successful save.
- Customer folder/customer account link.
- Monthly billing eligibility flag or equivalent.
- Audit-ready metadata later.
- Duplicate-save protection token or equivalent later.

Validation contract before future save:

- Customer/account must be selected from known accounts.
- Passenger name is required.
- Pickup date is required.
- Pickup time is required.
- Pickup location is required.
- Drop-off location is required unless a later approved route type allows an exception.
- Route type is required.
- Vehicle type is required.
- Billing month is required.
- Invalid form data must not reach real final confirmation.
- Invalid form data must not call Supabase.
- Duplicate double-click must not create two records.

Customer linking contract:

- Link only to an existing selected customer account.
- Do not auto-create customer accounts in this stage.
- Do not infer customer account from free text.
- Keep customer invoice prefix separate from booking save.
- Do not create an invoice number during booking save.

Future save contract:

- Show a review panel before save.
- Require intentional confirmation.
- Create exactly one booking record on successful save.
- Link the booking to the selected customer.
- Show local success or error feedback near the save button.
- Keep the saved booking visible in the customer folder and monthly billing list only after save succeeds.
- Never create invoice number, payment, bank, notification, calendar, or PDF behavior during save.

Test contract before implementation:

- Invalid form cannot save.
- Invalid form cannot show final real confirmation.
- Valid confirmation calls the future save exactly once.
- Duplicate click creates only one booking.
- Saved booking links to the selected customer.
- Invoice number remains Not created.
- No payment or bank API is called.
- No notification, calendar, or PDF behavior is added.
- No real audit record is created until audit implementation is approved.
- Customer folder and monthly billing visibility appear after successful save.
- Mock preview and mock confirmation remain protected until replaced by approved real behavior.
- Mobile and no-horizontal-overflow checks still pass.
- Parser tests remain unchanged unless parser behavior is touched.

Supabase planning boundaries:

- Do not create migrations now.
- Do not run Supabase commands.
- Before implementation, inspect existing booking/customer tables and types.
- Any schema change must be separately approved.
- Future implementation must be small and staged:
  1. Confirm data mapping.
  2. Add tests first.
  3. Implement a save API or server action only after approval.
  4. Protect duplicate save.
  5. Browser-test saved booking visibility.
  6. Commit only after checks pass.

Explicit non-goals:

- No real Supabase save in this stage.
- No migration.
- No parser change.
- No real invoice.
- No invoice number.
- No statement.
- No PDF.
- No sending.
- No payment or bank API.
- No notification, WhatsApp, email, or SMS.
- No calendar sync.
- No customer auto-create.
- No real audit record.

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

## 15. Stage 4A-155 Mock Billing To Real Billing Transition Checklist

This section is documentation only. It does not approve app behavior, parser behavior, Supabase behavior, migrations, invoice generation, PDF generation, payment links, Stripe, PayNow, bank API behavior, notification sending, customer auth, or storage persistence.

### Current Mock/Local Monthly Billing UI Pieces

The internal `/customers` regular customer monthly billing area currently includes these mock/local pieces:

- Billing quick filter: filters currently visible local mock monthly billing rows by all rows, no-match test state, billing month, or billing status.
- Empty state/reset: shows compact mock/local empty copy when the quick filter leaves zero visible rows, and resets the local quick filter back to all mock rows.
- Row detail view: opens one compact inline mock/local detail panel for a selected visible mock billing row, using row data already available on the page.
- Visible summary: summarizes currently visible mock monthly billing rows after the local quick filter, including visible count, active quick filter, billing month grouping, and status grouping.

### Allowed Mock Behavior Now

These pieces may only:

- Read local mock row data already present on `/customers`.
- Change page-local visibility, selection, filter state, and mock-only feedback.
- Show mock/local labels, counts, row details, grouping, and reset affordances.
- Close stale local detail panels when filters change.
- Support browser tests for empty state, reset, detail view, visible summary, route isolation, storage safety, and mobile/no-horizontal-overflow.

### Not Allowed Now

These pieces must not:

- Save monthly billing rows.
- Link real customer billing records.
- Create or reserve invoice numbers.
- Generate invoices, statements, PDFs, payment links, or payment requests.
- Call Stripe, PayNow, bank APIs, payment APIs, maps, calendar, notification, WhatsApp, email, SMS, Telegram, or other network APIs.
- Write to Supabase, localStorage, sessionStorage, IndexedDB, cookies, files, or browser storage.
- Permanently change, add, remove, reorder, or mark row data.
- Change customer payment status.
- Expose internal mock controls on `/book`, `/my-bookings`, public driver token pages, or driver demo pages.

### Future Real Billing Readiness Gates

Before any future real billing behavior is implemented, all of these must be true:

- A docs/readiness review confirms which stage is approved and which behaviors remain locked.
- The data model is reviewed against existing booking/customer/payment planning docs.
- Tests are designed before implementation for success, failure, duplicate action, route isolation, storage safety, mobile layout, and no unintended API calls.
- Real billing work is split into small phases. A booking save/linking phase must not also issue invoices, generate PDFs, send payment links, or change payment status.
- Parser reliability remains protected. Unrelated parser changes are forbidden, and parser tests must continue to pass.
- Protected mock/customer/payment/browser boundaries remain in place and are not weakened.
- `test:safe` membership and package scripts remain unchanged unless a separate explicit test-safety task approves changes.

### Supabase Save/Linking Gates

Before any real Supabase save or customer billing linking:

- Existing schema, RLS, route boundaries, and customer/payment docs must be reviewed.
- A data mapping must define booking id, customer id, billing month, billing status, payment method, audit fields, and failure behavior.
- Any Supabase migration must be separately proposed, reviewed, and explicitly approved before creation or application.
- No Supabase db push, db reset, or migration application may run during planning or mock UI work.
- Tests must prove a real save creates exactly the expected record, links only to the selected customer, blocks duplicate saves, handles errors clearly, and does not create invoice numbers, PDFs, payment links, notifications, or payment status changes.

### Invoice Numbering Gates

Before any real invoice number is created:

- Customer invoice prefixes and running numbers must be planned, reviewed, and tested.
- Uniqueness, immutability, void/cancel handling, sequence gaps, retry behavior, and concurrent issuance must be covered.
- Booking save/linking must stay separate from invoice issuance.
- Tests must prove invoice numbers are not created by mock UI, filters, detail panels, visible summaries, draft previews, saves, or resets unless a future approved invoice-issuance action is intentionally run.

### PDF/Invoice Generation Gates

Before any invoice, statement, or PDF generation:

- The owner must approve invoice/statement format, numbering rules, included row rules, tax/GST treatment if any, adjustment rules, and staff review steps.
- Draft preview and issued invoice must remain separate states.
- Generated output must be tested for selected customer only, selected billing period only, correct rows, no unrelated customer leakage, and no private driver payout or CRM leakage.
- Browser tests must prove generation is not triggered by quick filters, empty reset, row detail view, visible summary, or draft preview unless the future approved action explicitly does so.

### Stripe/Payment Link Gates

Before Stripe or payment link behavior:

- Stripe test-mode planning must be approved separately.
- Payment status mapping, webhook security, idempotency, failure states, secret handling, and production-disabled defaults must be reviewed.
- Payment links must not be created by monthly billing filters, summaries, row details, draft previews, or booking save/linking.
- Tests must prove no payment provider, payment link, webhook, or production payment behavior runs unless the approved payment-link action is explicitly used.

### Manual Bank Transfer Rule

Bank wire/transfer remains manual record only. Staff may later record a transfer reference after confirming funds outside the app, but the app must not call a bank API, scrape bank data, auto-reconcile transactions, or mark a customer paid from mock billing UI.

### Customer Payment Status Rule

Customer payment status must not be changed by the mock quick filter, empty state/reset, row detail view, visible summary, or draft preview. Any future payment-status change must be explicit, audited, customer-scoped, tested, and separately approved.

### Not Implemented Yet

- Real monthly billing save.
- Real customer billing linking.
- Real invoice numbers.
- Real invoice/PDF generation.
- Payment links.
- Stripe integration.
- PayNow API.
- Bank API.
- Email, WhatsApp, or SMS notifications.
- Telegram notifications.
- Customer auth or portal billing permissions.
- Supabase billing schema or migrations.

### Future Implementation Order

- [ ] Complete docs/readiness review and confirm the exact approved stage.
- [ ] Review data model, RLS, customer folder boundaries, invoice prefix/running-number rules, and audit expectations.
- [ ] Propose Supabase migration only after explicit approval; do not apply migrations during planning.
- [ ] Define the mock-to-real save boundary so booking save/linking cannot issue invoices, generate PDFs, send payment links, or change payment status.
- [ ] Add or update tests before implementation.
- [ ] Implement the smallest approved real behavior.
- [ ] Run parser, lint, build, browser checks, and mobile/no-horizontal-overflow checks before and after.
- [ ] Confirm protected routes do not expose internal billing controls.
- [ ] Commit only scoped files.
- [ ] Run post-commit `npm run test:safe`.

This checklist does not claim the app is production-ready. It documents the locked boundary between the current mock/local `/customers` monthly billing UI and any future real billing implementation.

## 16. Stage 4A-157 Future Billing Data Model Review — Docs Only

This section is planning documentation only. It does not create a schema, migration, Supabase table, route, API, invoice, PDF, payment link, payment provider integration, bank integration, notification behavior, parser behavior, app behavior, or storage persistence.

The goal is to define safe future data boundaries before any real monthly billing save, customer billing linking, invoice numbering, payment-status change, or Supabase work is approved.

### Proposed Future Entities

#### Regular Customers

- Purpose: represent the internal customer, company, hotel, or account that owns bookings, contacts, billing profiles, invoice history, and payment records.
- Key fields to consider: customer id, account display name, company/legal name, account type, active/inactive status, primary contact id, internal owner, created/updated timestamps, and safe internal notes.
- Immutable after invoice creation: customer id and the customer identity attached to an issued invoice should not be rewritten. Legal/display name corrections after issuance should preserve the issued invoice snapshot.
- Requires audit history: merges, deactivation, customer identity corrections, ownership changes, and any change that affects billing scope.
- Must not be controlled by mock UI: mock `/customers` billing filters, detail panels, summaries, and resets must not create, rename, merge, delete, activate, deactivate, or relink real customers.

#### Customer Billing Profiles

- Purpose: store customer-specific billing settings separate from the customer identity, so operational contacts can change without accidentally changing invoice rules.
- Key fields to consider: customer id, billing contact, billing email/phone, default payment terms, billing currency, manual bank-transfer instructions reference, invoice prefix, tax/GST treatment if later approved, billing cycle preference, and status.
- Immutable after invoice creation: invoice prefix and billing rules used on an issued invoice should be preserved as invoice snapshots. Changing future billing settings must not rewrite issued documents.
- Requires audit history: invoice prefix changes, payment terms changes, billing contact changes, tax/GST setting changes, and billing profile activation/deactivation.
- Must not be controlled by mock UI: mock monthly billing UI must not edit real billing profiles, change invoice prefixes, alter payment terms, or set a customer as ready for real invoicing.

#### Customer Monthly Billing Periods

- Purpose: represent one customer's monthly billing review window before any real invoice or statement is issued.
- Key fields to consider: customer id, billing month, period start, period end, review status, draft subtotal, adjustments, currency, reviewed by, reviewed at, locked at, issued invoice id if later approved, and notes.
- Immutable after invoice creation: customer id, period boundaries, included line-item set, final totals, and issued invoice link should not be rewritten after issuance. Corrections should use amendment, credit, void, or replacement workflows after approval.
- Requires audit history: period creation, review status changes, lock/unlock decisions, included/excluded line changes, amount adjustments, and issuance linkage.
- Must not be controlled by mock UI: mock quick filters, empty states, detail panels, and visible summaries must not create billing periods, lock periods, mark periods reviewed, issue periods, or alter period totals.

#### Monthly Billing Line Items

- Purpose: represent each booking, charge, adjustment, cancellation fee, no-show fee, or approved credit that may appear inside a monthly billing period.
- Key fields to consider: customer id, booking id, billing period id, service date/time, passenger/account label, pickup/drop-off summary, vehicle/service type, description, quantity, unit amount, line total, inclusion status, source type, adjustment reason, and staff note.
- Immutable after invoice creation: booking link, description snapshot, service date, billed amount, inclusion status, and issued invoice relationship should remain fixed for issued invoices.
- Requires audit history: inclusion/exclusion, amount edits, cancellation/no-show fee treatment, manual adjustments, credit lines, and corrections after review.
- Must not be controlled by mock UI: mock UI must not add, remove, reorder, persist, or permanently change line items, and must not change customer payment status from line review.

#### Invoice Number Sequences And Prefixes

- Purpose: protect invoice number uniqueness, customer prefix rules, running numbers, and issued-number immutability before any real invoice creation.
- Key fields to consider: customer id or global scope, prefix, next sequence number, last issued sequence, sequence status, effective date, created by, updated by, lock/version field, and issued-number format.
- Immutable after invoice creation: issued invoice number, prefix, sequence number, customer relationship, and issued timestamp must not be reused or rewritten.
- Requires audit history: prefix creation, prefix change, sequence reservation, sequence issuance, void/cancel treatment, retry handling, and any manual sequence correction.
- Must not be controlled by mock UI: mock billing UI must not reserve, preview-as-issued, increment, reset, or create real invoice numbers. Invoice numbers must not exist until prefix/running-number rules are approved and tested.

#### Payment Records And Manual Bank Transfer Records

- Purpose: record real customer payment events only after staff confirm payment outside the app, including manual bank transfer references when approved.
- Key fields to consider: customer id, invoice id or billing period id, payment method, payment status, amount, currency, received date, manual reference, staff-confirmed flag, recorded by, notes, and reversal/waiver fields if later approved.
- Immutable after invoice creation: payment record id, original amount, received date, method, and reference should not be silently overwritten. Corrections should use audited adjustment or reversal events.
- Requires audit history: payment requested, invoice sent, partial payment, paid, waived, refunded, manual reference correction, reversal, and follow-up state changes.
- Must not be controlled by mock UI: mock UI must not mark real rows paid, partially paid, unpaid, overdue, waived, refunded, or payment requested. Bank wire/transfer remains manual-record only; no bank API, scraping, auto-reconciliation, or automatic paid status.

#### Audit Events

- Purpose: provide an immutable operational trail for billing-sensitive changes across customers, billing profiles, monthly periods, line items, invoice sequences, invoices, and payment records.
- Key fields to consider: event id, entity type, entity id, customer id, actor id, event type, before/after summary, reason, created at, request/source id, and related invoice/payment/billing-period ids.
- Immutable after invoice creation: audit events should be append-only. Existing audit records should not be edited to rewrite history.
- Requires audit history: every billing-sensitive change should create an event, especially status changes, invoice issuance, sequence changes, payment status changes, line adjustments, and manual transfer references.
- Must not be controlled by mock UI: mock UI must not create real audit records or present local mock activity as persisted audit history.

### Locked Safety Rules

- Mock `/customers` UI must not write real billing data.
- Customer payment status must not be changed by mock UI.
- Invoice numbers must not be generated until prefix and running-number rules are planned, approved, and tested.
- Bank transfer remains manual-record only; no bank API, bank scraping, or automatic reconciliation.
- Stripe and payment links remain future only and require explicit approval.
- Supabase migrations require explicit approval before creation and separate explicit approval before application.
- Parser reliability remains protected, and unrelated parser changes are forbidden.
- Future billing data must stay scoped to the selected customer and must not leak into `/book`, `/my-bookings`, public driver token pages, or driver demo pages.
- No storage persistence is approved by this planning section.

### Open Questions Before Future Implementation

- What customer invoice prefix format should be used for companies, hotels, individual VIPs, and renamed customers?
- Should running numbers reset yearly, reset monthly, or never reset?
- Should numbering be per customer, per billing profile, or company-wide?
- How should amendments, cancellations, no-shows, credits, and waived rows affect monthly billing periods and issued invoices?
- How should paid, partially paid, unpaid, overdue, waived, refunded, and manual bank transfer statuses be recorded without allowing mock UI to change them?
- Which staff roles can create, review, lock, issue, adjust, void, or mark billing records paid?
- What audit trail detail is required for billing profile changes, line-item edits, invoice issuance, payment recording, and manual reference corrections?
- What export, statement, invoice PDF, or customer-facing document requirements are needed later, and what data must be snapshotted at issue time?
- What RLS, service-role route, and server-only boundaries are required before any Supabase write is allowed?
- What duplicate-action, retry, and concurrency behavior is required for invoice number issuance?

### Conservative Future Implementation Sequence

- [ ] Complete this docs-only review and keep current `/customers` billing UI mock/local.
- [ ] Approve the future data model boundaries and open-question answers.
- [ ] Prepare a Supabase migration plan only after explicit approval.
- [ ] Create and apply any migration only after separate explicit approval.
- [ ] Add test fixtures before real save/linking work, including duplicate, invalid, and cross-customer safety cases.
- [ ] Define the mock-to-real save boundary so save/linking cannot issue invoices, generate PDFs, send payment links, or change payment status.
- [ ] Add protected browser tests for route isolation, no unintended network/API calls, no storage persistence, and mobile/no-horizontal-overflow.
- [ ] Run parser, lint, build, targeted browser tests, and `npm run test:safe` before and after implementation.
- [ ] Commit only scoped files for each approved phase.
- [ ] Run post-commit `npm run test:safe`.

This review does not claim real billing works now and does not claim the app is production-ready. It only documents future data model boundaries and safety questions for a later approved implementation.
