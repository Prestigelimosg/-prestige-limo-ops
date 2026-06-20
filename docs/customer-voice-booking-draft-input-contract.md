# Customer Voice Booking Draft Input Contract

This document records the bounded Customer Voice Booking Draft Input contract. It now approves only one compact browser-local Speak helper beside the existing `/book` Portal link. It does not approve UI sectors, endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, dispatch activation, audio recording/storage, speech-to-text provider integration, or new shims.

## Current Evidence

- Existing customer booking page/form: `app/book/page.tsx`.
- Existing compact Speak helper: one `type="button"` control beside the existing Portal link in the `/book` header action group.
- Existing customer booking adapter: `lib/customer-booking-request-adapter.ts`.
- Existing customer booking submit route: `POST /api/customer-booking-requests`.
- Existing `/book` flow uses structured customer request fields: passenger, date, time, pickup, drop-off, service, vehicle, pax, luggage, and extra stops.
- Existing `/book` submit uses `submitCustomerBookingRequest(form)` to post to `/api/customer-booking-requests`.
- Customer booking requests map to customer-facing `Request Received` and internal admin `Admin Review Required` review state.
- Parser/draft-fill exists in the admin dispatcher intake, not the customer `/book` page.
- Existing WhatsApp transcript parsing is not Customer Voice Booking Draft Input.
- `/api/ai-parse` is not safe to expose or reuse for customer voice without separate owner approval and a future guard proving a safe customer draft parser path.

## Future Contract

- Customer Voice Booking Draft Input is an input helper only.
- The approved Speak control must stay compact and placed beside the existing Portal link inside the existing `/book` customer booking page/form header.
- Do not add a new sector, giant card, duplicate booking page, duplicate booking workflow, duplicate route, duplicate helper, or new shim for the first version.
- Voice transcript may only fill a bounded local draft transcript helper or existing safe customer booking request fields if a future parser/draft-fill lane is separately approved.
- Customer must review and edit the draft before submission.
- Customer must manually press BOOK / Submit Booking Request.
- Admin review remains required after submission.
- Speaking alone must not create a booking.
- No auto-submit.
- No auto-confirm.
- No auto-dispatch.
- No Dispatch Release activation.
- No Driver Acknowledgement activation.
- No audio storage in the first version.
- No customer/traveler memory writes in the first version.
- No speech-to-text provider integration in the first version.
- Browser `SpeechRecognition` or browser-only dictation must include an unsupported-browser fallback and must not require backend audio storage.
- Parser/draft-fill from voice requires separate owner approval unless a future guard proves a safe customer draft parser path.
- `/api/ai-parse` cannot be exposed or reused for customer voice without separate owner approval.
- Existing `/book` submit route must be reused: `POST /api/customer-booking-requests`.
- Save Booking + CRM must remain untouched.
- `POST /api/admin-bookings` must remain untouched.
- `/api/admin-saved-bookings` must remain untouched.
- No pricing, payout, payment, PDF, invoice, billing, finance, PayNow payout, customer price, driver payout, provider send, auth, location, photo, calendar, parser/debug, internal admin note, service-role, token, secret, mock QA, or dev archive fields may be added to the customer voice path.

## Example Future Flow

Customer says: "Stanley needs a pickup on 2 June 1000hrs from home to airport SQ123. He stays at 123 Orchard Road."

Future safe behavior:

1. The spoken text becomes visible transcript/draft text.
2. Safe customer booking fields may be filled only through an approved draft parser path.
3. The customer reviews and edits the visible details.
4. The customer manually presses BOOK / Submit Booking Request.
5. Admin reviews the submitted request before confirmation.

## Not Approved

- Adding another Speak button.
- Adding another voice UI sector, card, page, route, helper, workflow, or shim.
- Runtime behavior beyond the one browser-local transcript helper.
- Parser changes.
- `/api/ai-parse` changes.
- Save Booking route changes.
- `/api/admin-saved-bookings` changes.
- New customer booking route.
- Audio recording/storage.
- Speech-to-text provider integration.
- Provider send.
- Env changes.
- DB read/write.
- Production deploy.
- Pricing/payout/payment/PDF activation.
- Dispatch activation.
- Auth/location/photo/calendar activation.
- New shims.

## Guard

This contract is guarded by `scripts/test-customer-voice-booking-draft-input-contract.mjs` and `scripts/test-customer-voice-booking-speak-button-ui-guard.mjs`, both registered in `scripts/test-preactivation-verification-suite.mjs`.
