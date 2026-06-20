# Customer Voice Booking Draft Field-Fill Contract

This document records the docs/test-only contract for a future Customer Voice Booking Draft Field-Fill lane. It does not approve field-fill implementation, parser changes, `/api/ai-parse` usage, UI changes, new buttons, submit behavior changes, Save Booking changes, `/api/admin-saved-bookings` changes, new customer booking routes, audio storage, backend speech-to-text/provider integration, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, or new shims.

## Current Evidence

- Existing customer booking page/form: `app/book/page.tsx`.
- Existing compact Speak helper: one `type="button"` control beside the existing Portal link in the `/book` header action group.
- Existing customer booking adapter: `lib/customer-booking-request-adapter.ts`.
- Existing customer booking submit route: `POST /api/customer-booking-requests`.
- Existing `/book` submit call: `submitCustomerBookingRequest(form)`.
- Current Speak behavior is compact local transcript helper only.
- Current transcript is stored in local React state only.
- Current Speak behavior does not fill form fields.
- Current Speak behavior does not submit transcript or audio.
- Current Speak behavior does not call parser, API, speech-to-text, or provider routes.
- `specialRequest` exists in `/book` UI state but is not forwarded by the adapter and is not allowed in customer booking request persistence.
- `/api/ai-parse` remains admin/parser-shaped and includes fields such as `customerPriceOverride`, so it is not safe for public customer voice field-fill without separate owner approval.
- Existing WhatsApp transcript parsing and admin dispatcher intake draft-fill are not Customer Voice Booking Draft Field-Fill.

## Future Field-Fill Contract

- Customer Voice Booking Draft Field-Fill is a separate future lane from the existing Speak button.
- The existing compact Speak button remains input-helper-only until field-fill is separately approved.
- Field-fill must never auto-submit.
- Field-fill must never auto-confirm.
- Field-fill must never auto-dispatch.
- Customer must manually review and edit fields before submission.
- Customer must manually press Submit Booking Request / BOOK.
- Admin review remains required after submission.
- Existing submit path must remain `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- No transcript or audio may be submitted or stored unless separately approved.
- `specialRequest` remains local-only and excluded from submitted field-fill scope until separately approved.
- `/api/ai-parse` cannot be used for customer voice field-fill without separate owner approval.
- Admin parser/draft-fill cannot be reused directly for public customer voice.
- If parsing is uncertain, leave fields unchanged and show the transcript for manual review.
- Do not guess unsafe fields.
- No duplicate booking page, workflow, sector, card, route, helper, button, or shim may be introduced.

## Safe Future Targets

Future field-fill may target only these existing customer request fields after separate field-fill implementation approval:

- `companyName`
- `contactNo`
- `emailAddress`
- `passengerName`
- `pickupDate`
- `pickupTime`
- `flightNumber`
- `pickupLocation`
- `dropoffLocation`
- `serviceType`
- `vehicleType`
- `passengerCount`
- `luggage`
- `extraStops`

## Excluded Fields And Behavior

Future field-fill must exclude:

- pricing
- payout
- payment/PDF
- billing
- dispatch release
- driver acknowledgement
- admin internal status
- provider send fields
- auth/location/photo/calendar
- `customer_rates`
- `driver_payout_rules`
- internal/debug/secrets
- transcript/audio persistence
- `specialRequest` submission unless separately approved

## Example Future Phrase

Customer says: "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road."

Safe future mapping example, only after separate field-fill implementation approval:

- `passengerName`: Stanley
- `pickupDate`: 2 June
- `pickupTime`: 1000
- `pickupLocation`: 123 Orchard Road
- `dropoffLocation`: airport
- `flightNumber`: SQ123

If confidence is uncertain, the safe behavior is to leave fields unchanged and show the transcript for manual review.

## Future Test Expectations

Any future implementation must include browser/mobile coverage proving:

- Speak button remains `type="button"`.
- Field-fill does not submit.
- Manual Submit Booking Request / BOOK remains required.
- Customer review/edit remains required.
- Mobile layout does not overflow.
- Existing Portal link remains unchanged.
- Existing submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- No `/api/ai-parse`, admin parser, backend speech-to-text, provider send, audio storage, Save Booking, `/api/admin-saved-bookings`, payment/PDF, pricing, payout, dispatch, auth/location/photo/calendar, or shim behavior is activated.

## Guard

This contract is guarded by `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs` and registered in `scripts/test-preactivation-verification-suite.mjs`.
