# Customer-Facing Booking Page Separation Plan

This is a planning document only. It does not change app behavior, create routes, create records, create migrations, run Supabase commands, connect a real save flow, add payment or bank APIs, add Google Maps, add OpenAI or ChatGPT, send notifications, create invoices, create statements, create invoice numbers, or generate PDFs.

## Purpose

Prestige Limo Ops needs a clean separation between internal staff tools and any future customer-facing booking request page.

The current `/customers` page is an internal dispatcher/admin/staff area. It contains monthly billing, outstanding payments, customer folders, invoice and statement planning, mock saved booking visibility, payment/follow-up placeholders, and other staff-only controls. Customers must not see that page or any of those sections.

## Current Boundary

`/customers` remains internal dispatcher/admin/staff only.

It is not a customer booking form and should not be treated as a public customer page.

Before deployment, `/customers` must later require approved admin/staff authentication and access control. That auth work is not part of this planning stage.

## Future Customer-Facing Page Goal

Create a separate customer-safe booking request page later, using a route such as:

- `/book`
- `/customer-booking`

The future page should let a customer or booker submit a booking request without exposing internal operations, finance, mock workflow, or planning details.

The page should be clearly positioned as a request form, not an automatic confirmed booking.

## Content That Must Not Appear On The Customer Page

The customer-facing booking page must not show:

- Monthly billing.
- Outstanding payments.
- Invoices.
- Statements.
- Customer folder details.
- Admin/customer account management details.
- Mock saved booking visibility.
- Internal planning placeholders.
- Payment follow-up controls.
- Internal follow-up controls.
- Audit controls or audit wording.
- Supabase wording.
- Mock/local wording.
- Internal wording.
- Dispatcher/admin-only labels.
- Internal dispatcher/admin notes.
- Driver payout, pricing rules, or internal margin details.
- Invoice numbers.
- Statement/PDF generation.
- Payment API, bank API, notification, WhatsApp, email, SMS, or calendar sync controls.

## Customer-Safe Fields

The future customer-facing booking request form should contain only customer-safe fields:

- Customer/company name.
- Contact person.
- Phone number.
- Email address.
- Passenger name.
- Pickup date.
- Pickup time.
- Pickup location.
- Drop-off location.
- Type of service.
- Vehicle type.
- Number of passengers.
- Luggage.
- Extra stops.
- Flight number, if any.
- Special request or note.

Avoid internal labels such as billing month, billing status, payment method, customer folder, invoice prefix, audit, Supabase, mock, internal note, or admin note.

## Required Field Planning

For the future customer-facing request form, keep the required fields light enough for customer enquiry flexibility.

Planned required fields:

- Contact number.
- Passenger name.
- Pickup date.
- Pickup time.

Planned optional fields at first:

- Pickup location.
- Drop-off location.
- Vehicle type.
- Customer/company name.
- Contact person.
- Email address.
- Flight number.
- Type of service.
- Number of passengers.
- Luggage.
- Extra stops.
- Special request or note.

Why some fields stay optional:

- Customers may be checking availability before the full route is known.
- Hotel, VIP, event, and airport enquiries may start with partial details.
- Staff can follow up for missing pickup, drop-off, or vehicle preference before confirming.
- Optional fields reduce customer friction while still giving staff enough information to reply.

The customer-facing page should make optional fields clear, but it should not block a booking enquiry just because pickup location, drop-off location, or vehicle type is not known yet.

## Customer-Safe Type Of Service Options

Use customer-friendly service labels, separate from parser or dispatch internals:

- Airport Arrival.
- Airport Departure.
- Point-to-Point Transfer.
- Hourly / Disposal.
- Event / VIP Movement.
- Other / To Confirm.

Do not expose internal route codes such as MNG, DEP, TRF, or DSP on the customer-facing page.

## Customer-Safe Vehicle Options

Use customer-facing vehicle labels:

- Alphard / Vellfire.
- Mercedes Viano / V-Class.
- Hi-roof Minibus.
- Mercedes E-Class.
- Mercedes S-Class.

Do not expose internal vehicle codes on the customer-facing page.

## Mobile Layout Plan

The customer-facing page should be simple, compact, and mobile-first.

Layout rules:

- One clear booking request form, not a long admin dashboard.
- Compact fields with readable labels.
- Single-column layout on phones.
- Clean two-column grouping only on wider screens.
- No horizontal overflow.
- Touch targets must be easy to tap.
- Pickup and drop-off fields should be easy to reach.
- Any search/address helper should be compact and mobile-friendly.
- The submit/request button should stay visually separate from any helper text.
- Error or success feedback should appear near the request button and affected fields.
- The page should work on iPhone, iPad, Android phones, Samsung Internet, Chrome Android, Safari iOS, tablets, and desktop.

The page should follow the app-wide human-usage UI standard, but as a customer form instead of an internal operations table.

## Customer Safety Text

The future customer page should clearly explain:

- This submits a booking request only.
- The booking is not confirmed until Prestige Limo staff reply.
- Staff will review availability, service details, timing, and vehicle selection.
- Any price, payment, invoice, or final confirmation is handled separately by staff.

Suggested plain wording:

> Submit your booking request. Your booking is not confirmed until Prestige Limo staff replies.

## Customer-Safe Submit Behavior Plan

The future customer-facing submit button should be labelled:

- Submit Booking Request

The button should submit an enquiry/request only. It must not imply the booking is confirmed.

Initial request submit must not:

- Create an invoice number.
- Generate an invoice.
- Generate a statement.
- Generate a PDF.
- Trigger payment or bank behavior.
- Send a notification, WhatsApp message, email, or SMS.
- Create a calendar event.
- Sync to any calendar.

Any future real request save must be approved separately before implementation.

## Future Save Boundary

This planning stage does not approve real saving.

Future implementation must not connect the customer-facing form to real Supabase save until separately approved.

When real saving is approved later, it should be staged carefully:

1. Confirm the public-safe data contract.
2. Add tests first.
3. Add a safe server route or server action only after approval.
4. Validate required fields before save.
5. Create a request record only, not an invoice or payment record.
6. Show customer-safe success or error feedback.
7. Keep internal staff review separate from customer submission.

## Calendar Integration Later

Calendar integration is required later, but not in this stage.

Future calendar sync should happen only after:

- Real booking request save is separately approved.
- Staff review and booking confirmation workflow is approved.
- The correct calendar provider, permissions, and duplicate-event protection are approved.
- Browser tests prove customer submit does not create calendar events by accident.

This docs-only stage does not create calendar events, add Google Calendar API, add calendar keys, or add any calendar sync implementation.

## Future Auth Protection For Internal Pages

Before any deployment or public access, `/customers` must be protected as an internal staff/admin route.

Future auth planning should confirm:

- Who can access `/customers`.
- Which staff roles can view customer folders.
- Which staff roles can view payments, invoices, statements, and follow-ups.
- Customer-facing routes must never reuse internal dashboard payloads.
- Public customer routes must use a separate safe view or request contract.
- The customer page must not expose internal data.
- The customer page must not show mock, admin, dispatcher, or internal wording.
- Any future real booking request storage must be protected against duplicate submit.

## Testing Plan Before Implementation

Future tests for the customer-facing page should confirm:

- `/customers` remains internal dispatcher/admin/staff only.
- The customer booking page route exists only after approved implementation.
- The customer page exists at `/book` or `/customer-booking` after approved implementation.
- The customer page shows only customer-safe booking request fields.
- The customer page includes the `Submit Booking Request` button label.
- The customer page does not show monthly billing.
- The customer page does not show outstanding payments.
- The customer page does not show invoices or statements.
- The customer page does not show customer folder/admin details.
- The customer page does not show mock saved booking visibility.
- The customer page does not show internal planning placeholders.
- The customer page does not show payment/follow-up/admin controls.
- The customer page does not show internal terms such as invoice, outstanding payment, billing, admin, Supabase, mock, internal, statement, or payment follow-up.
- Pickup location is not mandatory at first.
- Drop-off location is not mandatory at first.
- Vehicle type is not mandatory at first.
- Submitting invalid customer-safe fields shows local validation feedback.
- Submit Booking Request does not create invoice, payment, calendar, statement, or PDF behavior.
- No real Supabase save happens until explicitly approved.
- No payment API or bank API is called.
- No Google Maps API is called.
- No OpenAI or ChatGPT API is called.
- No notification, WhatsApp, email, SMS, or calendar sync runs.
- No invoice, invoice number, statement, or PDF is created.
- Mobile checks pass with no horizontal overflow.
- Existing `/customers` tests remain protected.

## Explicit Non-Goals

This stage does not:

- Build `/book` or `/customer-booking`.
- Change `/customers`.
- Add auth.
- Connect any real save.
- Create customer, booking, payment, or audit records.
- Create migrations or change schema.
- Run Supabase commands.
- Add payment, bank, Google Maps, OpenAI, notification, email, SMS, WhatsApp, or calendar integrations.
- Create invoices, statements, invoice numbers, or PDFs.

## Safest Future Implementation Order

1. Commit this docs-only separation plan.
2. Plan `/customers` admin/staff auth separately.
3. Create a small customer-facing page shell only, with no save behavior.
4. Add browser tests proving no internal terms or sections appear.
5. Add local validation only.
6. Plan real request-save separately before any Supabase work.
7. Implement real request-save only after explicit approval and tests.
