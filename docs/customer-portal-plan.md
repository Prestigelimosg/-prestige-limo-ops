# Customer Portal Plan

This is a planning document only. It does not build a portal, add authentication, create records, create migrations, run Supabase commands, connect real reads or writes, add payment or bank APIs, add notifications, create invoices, create statements, create invoice numbers, add calendar sync, generate PDFs, or change parser behavior.

## Purpose

Prestige Limo Ops needs a future customer portal where individual customers can view and manage their own booking information.

The portal should let customers check upcoming bookings, review completed bookings, open booking details, and request changes without exposing staff-only operations data.

## Route Separation

The app should keep three separate areas:

- `/book` is the public booking request form.
- `/customers` is the internal dispatcher/admin/staff dashboard only.
- The future customer portal, using a route such as `/portal`, `/customer-portal`, or `/my-bookings`, is a private customer login area.

Customers must never see the `/customers` internal admin sections. The portal must not reuse staff dashboard wording, staff controls, billing review tools, payment follow-up tools, or planning placeholders.

## Customer Portal Core Features

Future portal features should include:

- Upcoming bookings list.
- Completed bookings and booking history list.
- Individual booking detail view.
- Request edit or amendment to an upcoming booking.
- Request cancellation later, only if the workflow is approved.
- Booking status labels such as Requested, Pending Staff Review, Confirmed, Completed, and Cancelled.
- Clear messaging that customer edits, amendments, and cancellations are requests until staff approves them.

The portal should not automatically confirm changes. Prestige Limo staff must review and approve or reject requested changes.

## Customer-Safe Data Only

The portal should show only customer-safe booking details:

- Pickup date and time.
- Pickup location.
- Drop-off location.
- Type of service.
- Vehicle type.
- Passenger name.
- Flight number, if any.
- Special request or note, only when customer-facing.
- Booking status.
- Driver details later only when staff releases them.
- Live-location link later only when secure and approved.

The portal must not show:

- Internal staff notes.
- Driver payout.
- Internal pricing rules.
- Margin or profit.
- Outstanding payment review tools.
- Invoice admin controls.
- Supabase wording.
- Internal wording.
- Mock wording.
- Staff-only planning placeholders.
- Other customers' data.

## Auth And Security Planning

Real portal implementation must require secure customer authentication before deployment.

Security requirements for later implementation:

- Customers must only access their own bookings.
- Booking IDs must not be publicly guessable.
- The portal must not expose a shared global customer list.
- Access should use secure customer-specific links or a proper customer login.
- Sessions should expire or otherwise be protected later.
- Real auth must be planned and approved before it is built.

This docs-only stage does not implement authentication.

## Edit And Amend Request Workflow

Customers should only be able to request changes for their own upcoming bookings.

Customer-safe change request fields may include:

- Pickup date and time.
- Pickup location.
- Drop-off location.
- Passenger name.
- Flight number.
- Type of service.
- Vehicle type request.
- Special note.

Requested changes must not be automatically confirmed. Staff should review the original values and requested new values before approving or rejecting the request.

Later implementation should prepare for audit history showing who requested what and when. This stage does not create real audit records.

## Completed Bookings

Completed bookings should be view-only by default.

Customers should not edit completed bookings. They may later view history and possibly request an invoice or receipt, but invoice, payment, statement, and PDF behavior should remain separate and require explicit approval before implementation.

## Mobile And Search-First UI

The customer portal should follow the app-wide human-usage UI standard.

Portal layout requirements:

- Use search-first behavior when a customer may have many bookings.
- Use compact rows, not giant card stacks.
- Use tabs or filters for Upcoming, Completed, and Cancelled bookings.
- Show a maximum of 10 visible suggestions or results by default where applicable.
- Use pagination or View more after 10 results.
- No horizontal overflow.
- Touch-friendly controls.
- Readable text on mobile.
- Works on iPhone, iPad, Android Chrome, Samsung Internet, Safari iOS, tablet, and desktop.
- Feedback appears near the clicked control.

## Future Implementation Stages

Recommended safe order:

1. Complete and commit this docs-only plan.
2. Build a mock/local customer portal UI only.
3. Add browser tests proving no internal data leaks.
4. Create an auth and security plan.
5. Add real authentication only after explicit approval.
6. Add real customer-booking read access only after explicit approval.
7. Add edit/amend request storage only after explicit approval.
8. Add notifications, calendar, payment, invoice, statement, and PDF behavior later only as separately approved stages.

## Testing Plan

Future tests should protect:

- Customer portal route loads.
- Portal does not show internal, admin, mock, Supabase, billing, or payment-review wording.
- Upcoming bookings and completed bookings are separated.
- Customer can only see their own mock bookings in the mock stage.
- Edit/amend request is mock/local only at first.
- Completed bookings are read-only.
- No Supabase save happens until approved.
- No payment, bank, invoice, statement, PDF, notification, or calendar behavior is added.
- Mobile and no-horizontal-overflow checks pass.
- `/book` remains customer-facing.
- `/customers` remains internal staff-only.

## Explicit Non-Goals For This Stage

This stage does not include:

- Portal implementation.
- Authentication implementation.
- Real Supabase reads or writes.
- Customer records.
- Booking records.
- Edit or amendment records.
- Audit records.
- Invoice, payment, statement, or PDF behavior.
- Notifications.
- Calendar sync.
- Parser changes.
- Migrations.
