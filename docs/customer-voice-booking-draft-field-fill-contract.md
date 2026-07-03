# Customer Voice Booking Draft Field-Fill Contract

This document records the approved bounded Customer Voice Booking Draft Field-Fill implementation contract. It approves only browser-local input-helper field fill from the existing Speak transcript into existing `/book` fields; it does not approve parser changes, `/api/ai-parse` usage, submit behavior changes, Save Booking changes, `/api/admin-saved-bookings` changes, new customer booking routes, audio storage, backend speech-to-text/provider integration, provider sends, env changes, DB read/write, production deploy, pricing/payout/payment/PDF activation, dispatch activation, auth/location/photo/calendar activation, or new shims.

## Current Evidence

- Existing customer booking page/form: `app/book/page.tsx`.
- Existing compact Speak helper: one `type="button"` control beside the existing Portal link in the `/book` header action group.
- Existing customer booking adapter: `lib/customer-booking-request-adapter.ts`.
- Existing customer booking submit route: `POST /api/customer-booking-requests`.
- Existing `/book` submit call: `submitCustomerBookingRequest(form)`.
- Current Speak behavior is compact local transcript helper with local draft field-fill.
- Current transcript is stored in local React state/ref only.
- Current field-fill uses only the browser-local transcript and fills only empty safe fields.
- Current field-fill does not overwrite customer-entered fields.
- Current field-fill does not submit transcript or audio.
- Current field-fill does not call parser, API, speech-to-text, or provider routes.
- `specialRequest` exists in `/book` UI state but is not forwarded by the adapter and is not allowed in customer booking request persistence.
- `/api/ai-parse` remains admin/parser-shaped and includes fields such as `customerPriceOverride`, so it is not safe for public customer voice field-fill without separate owner approval.
- Existing WhatsApp transcript parsing and admin dispatcher intake draft-fill are not Customer Voice Booking Draft Field-Fill.

## Field-Fill Contract

- Customer Voice Booking Draft Field-Fill is local input-helper-only inside the existing `/book` customer booking page/form.
- The existing compact Speak button remains the only Speak control and remains beside the existing Portal link.
- Field-fill must never auto-submit.
- Field-fill must never auto-confirm.
- Field-fill must never auto-dispatch.
- Customer must manually review and edit fields before submission.
- Customer must manually press Submit Booking Request / BOOK.
- Admin review remains required after submission.
- Existing submit path must remain `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- No transcript or audio may be submitted or stored unless separately approved.
- `specialRequest` remains local-only and excluded from submitted field-fill scope unless separately approved.
- `/api/ai-parse` cannot be used for customer voice field-fill without separate owner approval.
- Admin parser/draft-fill cannot be reused directly for public customer voice.
- If parsing is uncertain, leave fields unchanged and show the transcript for manual review.
- Do not guess unsafe fields.
- No duplicate booking page, workflow, sector, card, route, helper, button, or shim may be introduced.

## Approved Local Targets

The local field-fill implementation may target only these existing safe customer request fields when the field is empty:

- `passengerName`
- `pickupDate`
- `pickupTime`
- `flightNumber`
- `pickupLocation`
- `dropoffLocation`

The broader customer request submit allowlist remains:

- `companyName`
- `contactNo`
- `emailAddress`
- `passengerName`
- `pickupDate`
- `pickupTime`
- `flightNumber`
- `pickupLocation`
- `dropoffLocation`
- `returnTripRequested`
- `returnPickupDate`
- `returnPickupTime`
- `returnFlightNumber`
- `returnPickupLocation`
- `returnDropoffLocation`
- `serviceType`
- `vehicleType`
- `passengerCount`
- `luggage`
- `extraStops`

## Excluded Fields And Behavior

Field-fill must exclude:

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

## Example Phrase

Customer says: "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road."

Safe local mapping:

- `passengerName`: Stanley
- `pickupDate`: unchanged because 2 June has no year
- `pickupTime`: 10:00
- `pickupLocation`: 123 Orchard Road
- `dropoffLocation`: airport
- `flightNumber`: SQ123

If confidence is uncertain, the safe behavior is to leave fields unchanged and show the transcript for manual review.

## Test Expectations

The implementation must include guard coverage proving:

- Speak button remains `type="button"`.
- Portal link remains unchanged.
- Field-fill does not submit.
- Manual Submit Booking Request / BOOK remains required.
- Customer review/edit remains required.
- Field-fill fills only empty safe fields and does not overwrite customer-entered fields.
- Mobile layout does not overflow.
- Existing submit path remains `submitCustomerBookingRequest(form)` to `POST /api/customer-booking-requests`.
- No `/api/ai-parse`, admin parser, backend speech-to-text, provider send, audio storage, Save Booking, `/api/admin-saved-bookings`, payment/PDF, pricing, payout, dispatch, auth/location/photo/calendar, or shim behavior is activated.

## Guard

This contract is guarded by `scripts/test-customer-voice-booking-draft-field-fill-contract.mjs`, `scripts/test-customer-voice-booking-draft-field-fill-ui-guard.mjs`, and `scripts/test-preactivation-verification-suite.mjs`.
