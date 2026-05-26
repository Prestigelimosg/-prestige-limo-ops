# API Integration Cost, Security, and Rollout Plan

## 1. Purpose

This document is a future API integration plan for the Prestige Limo Ops app. It is not an implementation, and it does not connect the app to any new real service.

The goal is to give the business a clear, staged path for adding production APIs later without accidentally changing booking, customer, driver, payment, parser, or Supabase behavior now.

## 2. Current App Status

- The booking parser is protected and business-critical. Parser behavior must remain covered by regression tests before and after any future API work.
- The internal dashboard exists and supports operational staff workflows, including booking management, driver assignment, rates, customer copy, and driver dispatch copy.
- `/book` is customer-facing and currently mock/local for booking requests.
- `/my-bookings` is a mock/local customer portal with protected booking lists, pagination, request-change behavior, and customer-safe wording.
- `/customers` is an internal staff/admin area with mock/local customer payment, draft invoice, monthly statement, and collection workflow previews.
- The driver job link and driver demo are protected mock/local workflows for job acknowledgement, driver details, PayNow number, OTW, OTS, POB, Job Completed, mock reminders, mock OTS photo proof, and mock live-location state.
- Replacement car/driver placeholders are mock/local only and are protected from leaking into customer-facing or public driver surfaces.
- No real external APIs are added in this stage.

## 3. API Categories Needed Later

The business-grade app will likely need these API categories later:

- Supabase production setup.
- Stripe payment links and card payments.
- PayNow and bank transfer manual payment records.
- Maps, address autocomplete, geocoding, and routing.
- WhatsApp notifications.
- SMS notifications.
- Email notifications.
- Flight ETA and flight status.
- Customer and driver live location.
- Calendar export or calendar sync.
- Invoice, PDF, and statement generation.
- AI parser or assistant support.

Each category must be planned, approved, tested, and rolled out separately.

## 4. Stripe Plan

The business already has a Stripe account. Stripe should be treated as the preferred future provider for card payments and payment links.

Future Stripe work should start in Stripe test mode only. The first Stripe milestone should not automatically charge customers. Staff should review the booking, customer, amount, payment description, and due date before any payment link is created or sent.

Later Stripe implementation must require:

- Stripe test mode before live mode.
- Staff review before sending a payment link.
- No automatic charging at first.
- Webhook signature verification before trusting payment events.
- No secret keys in the repository.
- Environment variables only for keys and webhook secrets.
- Separate live-mode approval before any real customer payment link or charge is created.

## 5. PayNow And Bank Transfer Plan

PayNow and bank transfer should remain manual-record only for now.

There should be no bank API integration in the near term. Staff can later record that a PayNow or bank transfer payment was received, but that should be a manual staff action. The app should not automatically reconcile bank transactions unless the business explicitly approves that as a separate future project.

The driver PayNow number field is driver detail information only. It must not create payment, bank, payout, reconciliation, invoice, or transfer behavior.

## 6. Supabase Production Plan

Future Supabase production work should be handled as a staged security project, not as a quick connection.

The production plan should cover:

- Create and configure a production Supabase project.
- Review the current schema and confirm which tables are production-ready.
- Review Row Level Security policies before public or customer-facing reads/writes are enabled.
- Separate staff/admin access from customer and driver access.
- Configure backups and recovery expectations.
- Add audit logs for important staff actions.
- Use environment variables for Supabase URL and keys.
- Use staging before live production.
- Confirm rollback steps before launch.

No Supabase command is run in this docs-only stage.

## 7. Maps, Address, And Routing Plan

Maps and routing can improve booking accuracy, route review, and pricing support, but they can also create cost risk if heavily used.

Future maps work should cover:

- Address autocomplete.
- Geocoding for pickup and drop-off addresses.
- Distance and estimated travel time.
- Route preview for dispatcher review.
- Airport, hotel, terminal, and known-location support.
- Later pricing/rate support using distance, zone, or duration.
- Manual fallback if the maps provider is unavailable or the address cannot be resolved.

The first version should be mock/manual-first. Real provider calls should only be added after cost limits, usage monitoring, and billing ownership are clear.

## 8. Notifications Plan

Future notification channels may include WhatsApp, SMS, and email.

Notification planning should cover:

- Driver reminders.
- Customer booking updates.
- Dispatch alerts.
- Payment follow-up reminders.
- Consent and opt-in requirements.
- Message audit trail.
- Staff review for sensitive or billable messages.
- Mock/log-only mode before real sending.

No WhatsApp, SMS, email, or notification sending is added in this stage.

## 9. Flight ETA And Status Plan

Flight ETA support is important for arrival and meet-and-greet jobs, but the app must not invent or fake flight timing.

Future flight work should cover:

- Arrival and MNG workflow support.
- Latest flight ETA display.
- Driver acknowledgement of the latest ETA.
- Delayed, early, cancelled, and unknown flight states.
- Manual dispatcher fallback if the API fails.
- Clear source and update time for any flight data shown.

No real flight API is added in this stage.

## 10. Live Location Plan

Live location must be secure, job-scoped, and time-limited.

Future live-location work should cover:

- Secure job-scoped driver live location.
- Driver consent and clear start/end state.
- Customer live location only for allowed job types later.
- Arrival/MNG should not expose customer live location.
- DEP, TRF, and hourly jobs can use a customer live link only when it is secure and allowed.
- Live location should auto-end after POB later.
- Link expiry, privacy rules, and audit trail.

No real live location is added in this stage.

## 11. Invoice, PDF, And Statement Plan

Future billing should start with reviewable drafts before real invoice generation.

Invoice and statement planning should cover:

- Draft invoice preview first.
- No real invoice number generation until approved.
- Customer monthly billing later.
- Stable customer prefixes later.
- PDF generation later.
- Staff review before sending or finalizing.
- Immutable invoice number rules after approval.

No invoice, PDF, or statement generation is added in this stage.

## 12. Calendar Sync Plan

Calendar integration should start carefully because duplicate events can confuse dispatch.

Future calendar work should start with one-way calendar export or one-way sync. The app should avoid accidental duplicate events, especially if a booking is edited or reassigned. Google Calendar or any other calendar integration should require explicit approval before implementation.

No calendar sync is added in this stage.

## 13. AI Parser And Assistant Plan

The parser is business-critical and must not be replaced by AI.

AI can assist only after strict mock/test boundaries are in place. Any AI output should be reviewed by staff before it becomes booking data. Parser regression tests must remain mandatory before and after any AI assistant work.

Future AI work should be limited to assistive workflows such as suggesting extracted fields, highlighting missing details, or drafting staff notes. The deterministic parser remains the source of protected parsing behavior.

## 14. Cost Planning Table

Exact prices are not hardcoded here. Provider pricing can change, so current official pricing must be verified before implementation.

| API / Service | Purpose | Possible provider | Expected billing type | Cost risk level | Free/test mode available? | Must verify latest official pricing before implementation | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Supabase | Production database, auth later, storage only if approved, audit data | Supabase | Monthly tier plus usage-based database, bandwidth, storage, and edge function costs | Medium | Yes, limited free/test usage may be available | Verify current official pricing before implementation. | Review schema, RLS, backups, and staging before live. |
| Stripe | Card payments and payment links | Stripe | Transaction fees and possible payment method fees | Medium | Yes, test mode is available | Verify current official pricing before implementation. | Preferred provider because the business already has a Stripe account. |
| PayNow/manual bank transfer | Manual payment received records | Manual staff workflow, bank portal outside app | No app API billing if manual-record only | Low | Not applicable | Verify current official pricing before implementation. | No bank API now; no automatic reconciliation unless separately approved. |
| Google Maps or alternative maps provider | Address autocomplete, geocoding, routing, route preview | Google Maps, Mapbox, HERE, or equivalent | Per request, monthly usage, or usage credits | High | Usually some test or credit-based usage may be available | Verify current official pricing before implementation. | Add usage caps and manual fallback before live. |
| WhatsApp Business / Meta Cloud API | Customer and driver WhatsApp notifications | Meta Cloud API or approved WhatsApp Business provider | Per conversation, per message, or provider plan | Medium | Sandbox or test setup may be available | Verify current official pricing before implementation. | Consent, templates, and audit trail required. |
| SMS provider such as Twilio or equivalent | SMS reminders and alerts | Twilio or equivalent | Per SMS, country-specific rates, possible monthly number fees | High | Test credentials may be available | Verify current official pricing before implementation. | Singapore and overseas SMS costs must be checked. |
| Email provider such as SendGrid/Mailgun/Resend or equivalent | Booking emails, payment follow-ups, receipts later | SendGrid, Mailgun, Resend, or equivalent | Monthly tier plus volume-based sending | Medium | Free/test tier may be available | Verify current official pricing before implementation. | Domain setup, SPF, DKIM, DMARC, and unsubscribe rules matter. |
| Flight status provider | Arrival ETA and flight status | Aviationstack, FlightAware, Cirium, AeroDataBox, or equivalent | Monthly plan or per request | High | Trial may be available | Verify current official pricing before implementation. | Must show source/update time and provide manual fallback. |
| Live location/maps | Driver live map and customer live link later | Maps provider plus browser geolocation and secure app endpoint | Map usage, requests, and possible hosting costs | High | Test mode depends on provider | Verify current official pricing before implementation. | Must be job-scoped, private, expiring, and auditable. |
| Calendar API | Calendar export or sync | Google Calendar API or Microsoft Graph | Usually free API quota plus account/workspace costs | Low to Medium | Test projects are available | Verify current official pricing before implementation. | Start one-way to avoid duplicate operational events. |
| PDF generation library/service | Invoice, statement, or job PDF later | Browser-based PDF, server library, or hosted PDF service | Open-source library may be free; hosted service may charge per document or monthly | Medium | Local/test generation may be available | Verify current official pricing before implementation. | No real invoice numbers or PDFs until approved. |
| AI parser/assistant | Assist staff with extraction, notes, or checks | OpenAI or equivalent | Token-based usage, model-dependent | Medium to High | Test usage depends on provider/account | Verify current official pricing before implementation. | Must not replace the protected parser; staff review required. |

## 15. Security Plan

Future integrations must follow these security rules:

- Use environment variables for all service keys and secrets.
- Never commit secret keys, webhook secrets, private tokens, or production credentials.
- Verify webhook signatures before trusting Stripe or other provider callbacks.
- Use Supabase Row Level Security for all production tables.
- Use role-based access for staff, customer, and driver surfaces.
- Keep public pages from writing sensitive production data unless explicitly approved and protected.
- Add audit logs for payment, notification, dispatch, invoice, driver, and customer changes.
- Use staging and test mode before live mode.
- Define rollback steps for each integration before launch.
- Rotate keys if a secret is suspected to be exposed.

## 16. Testing Plan

Future API work should include tests for:

- No real API calls in mock mode.
- No payment is created without staff action.
- No notification sends in mock mode.
- No Supabase writes from public pages unless explicitly approved.
- Parser regression tests before and after API work.
- Browser smoke tests for customer, staff, and driver flows.
- Mobile and no-horizontal-overflow checks.
- Stripe webhook tests when Stripe is later added.
- Public/private page security tests.
- Role-based access tests for staff-only workflows.
- Failure fallback tests when an external provider is unavailable.

## 17. Recommended Implementation Order

a. Docs-only plan.
b. Production environment checklist.
c. Supabase schema/RLS review plan.
d. Stripe test-mode payment-link plan.
e. Mock payment-link preview UI.
f. Real Stripe test-mode integration only after approval.
g. Notification mock/log-only planning.
h. Flight API planning.
i. Maps/geocoding planning.
j. Live location planning.
k. Invoice/PDF planning.
l. Calendar sync planning.
m. AI assistant planning.

## 18. Hard Boundaries

- No real APIs now.
- No real Stripe call now.
- No real payment link now.
- No bank API now.
- No WhatsApp/SMS/email send now.
- No live location now.
- No flight API now.
- No calendar sync now.
- No invoice/PDF generation now.
- No parser changes now.
- No Supabase migration/schema change now.
