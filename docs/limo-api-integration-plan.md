# Limo API Integration Plan

This is an API integration planning document only. No API integration, migration file, schema change, Supabase command, payment API, bank API, notification sending, live location production behavior, flight status production behavior, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This document plans the future external APIs that Prestige Limo Ops may need before any real implementation starts. It is meant to help the owner review payment, live location, map, flight status, notification, storage, and monitoring choices in plain business terms.

This document does not approve any API integration, Supabase migration, schema change, live production behavior, notification sending, invoice generation, statement generation, or production payment workflow.

## 2. Current Locked Decisions

- Stripe will be used later for payment integration if the owner approves payment API work.
- PayNow support should be considered through Stripe if it is available, suitable for Singapore payments, and approved by the owner.
- Bank wire and bank transfer will be manual-record only.
- No bank API integration is planned or recommended.
- No real API integration is approved yet.
- No production payment behavior is approved yet.
- No live location behavior or notification sending is approved yet.
- No flight status API is approved yet.

Pricing notes in this document are planning notes only. Pricing must be verified from each official provider pricing page before implementation.

## 3. API Categories Needed For The Limo App

| API category | What it does | Why Prestige Limo Ops needs it | Recommended starting choice | Alternative choices | Estimated pricing / pricing note | Risk level | Implementation timing |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Payment API | Collects card or supported online payments | Lets customers pay without manual reconciliation later | Stripe later, after approval | HitPay, PayPal | Pricing must be verified from official provider pricing page before implementation | High | Later only, after schema/security approval |
| Manual bank transfer option, no bank API | Records bank transfer as a manual payment method | Supports bank wire without connecting to bank systems | Manual record only | Manual PayNow QR, manual bank transfer reference | No API cost; owner must manage manual checking | Low | Keep available as manual workflow |
| Driver live location | Shares driver phone location for active jobs | Helps dispatcher and some customers see driver progress | Browser Geolocation through secure driver job link plus Supabase Realtime later | Server polling | Browser API has no direct provider cost; Realtime/platform pricing must be verified | High | Later protected prototype only |
| Maps / geocoding / routing | Converts addresses, displays maps, estimates route time | Helps validate pickup/dropoff and show live location | Google Maps or Mapbox after pricing review | HERE Maps, limited OpenStreetMap/Nominatim | Pricing must be verified from official provider pricing page before implementation | Medium | Before live location production |
| Driver notification | Sends job reminders or updates to drivers | Helps drivers receive changes quickly | Internal app reminders first | WhatsApp Cloud API, Twilio WhatsApp, SMS | Pricing must be verified before implementation | High | Sending disabled until approval |
| Customer notification | Sends customer updates | Useful for future confirmations, links, invoices, statements | No sending now; owner approval later | WhatsApp, email, SMS | Pricing must be verified before implementation | High | Later only |
| Flight status tracking | Gets latest flight ETA and status | Arrival/MNG jobs need reliable ETA updates | One reliable flight API after Changi/Seletar coverage test | FlightAware, AeroDataBox, Aviationstack, AirLabs, Cirium | Pricing and airport coverage must be verified before implementation | High | Later only after accuracy/cost approval |
| Email sending | Sends future invoices, statements, or internal alerts | Useful for formal customer/accounting communication | Email provider later only | Resend, SendGrid, Postmark, AWS SES | Pricing must be verified before implementation | Medium | Later only after sending approval |
| SMS sending | Sends urgent short messages | Useful only if WhatsApp/app reminders are not enough | Avoid at first unless truly needed | Twilio SMS or local provider | Usually cost-sensitive; pricing must be verified | Medium | Later only |
| WhatsApp sending | Sends driver/customer WhatsApp messages | Practical for Singapore transport operations if approved | WhatsApp Cloud API or Twilio later | Manual WhatsApp outside app | Pricing and account approval requirements must be verified | High | Later only after approval |
| Push notification later only | Sends app/browser push alerts | Could reduce SMS/WhatsApp cost later | Defer | Web Push, mobile app push | Pricing depends on platform and architecture | Medium | Later only |
| File/document storage later only | Stores OTS proof photos, receipts, or customer documents | Supports proof, receipts, and future audit needs | Supabase Storage later only if approved | S3-compatible storage | Pricing must be verified before implementation | Medium | Later only |
| Analytics/error monitoring later only | Tracks errors and reliability | Helps catch production issues safely | Sentry later only if needed | Provider logs, Supabase logs | Pricing must be verified before implementation | Low | Later only |

## 4. Payment API Plan

Stripe is the preferred future payment provider for Prestige Limo Ops. The likely first payment methods to review are:

- Stripe Cards.
- Stripe PayNow, if suitable for Singapore payments.
- Manual bank transfer and manual PayNow records, without any bank API.

Bank transfer must remain manual-record only. The app may later record that money was received by bank transfer, but it must not connect to bank systems or pull bank data.

Manual payment statuses are still needed even if Stripe is added later:

- Pending.
- Invoice sent.
- Partial paid.
- Paid.
- Waived.
- Refunded.
- Cancelled.

Payment reference, note, and received date should remain required for manual payment updates.

Payment API implementation is not approved yet.

| Option | Good fit | Possible limitation | Pricing note | Recommended fit |
| --- | --- | --- | --- | --- |
| Stripe | Cards, hosted checkout, webhooks, possible Singapore PayNow support | Requires careful webhook verification and server-only handling | Pricing must be verified from official Stripe pricing page before implementation | Preferred future provider |
| HitPay | Singapore-friendly payments and PayNow-style local payment options | Provider fit, accounting flow, and API behavior must be reviewed | Pricing must be verified from official HitPay pricing page before implementation | Backup option if Stripe PayNow is unsuitable |
| PayPal | Familiar to some customers | May not be ideal for local business account workflow and manual reconciliation | Pricing must be verified from official PayPal pricing page before implementation | Not recommended as first choice |
| Manual PayNow QR / manual bank transfer | Simple, no payment API needed | Owner/admin must manually confirm payment and record reference | No API cost; manual checking effort remains | Keep as manual fallback |

## 5. PayNow / QR Plan

A manual static PayNow QR can be displayed or attached later if the owner wants that workflow. This would still require staff to manually check payment and record it in the app.

A dynamic PayNow QR for the exact amount should only be implemented if the chosen provider or API safely supports it. Stripe PayNow should be reviewed before deciding whether PayNow should be handled through Stripe.

The app must not generate real PayNow QR codes until the owner separately approves that feature.

Future payment method labels may include:

- PayNow manual.
- PayNow via Stripe.
- Bank transfer manual.
- Card via Stripe.
- Cash.
- Other manual reference.

## 6. Driver Live Location Plan

Driver live location should start with the simplest safe model:

- Driver opens a secure driver job link on their phone.
- Driver explicitly activates live location.
- Browser Geolocation API reads location from the driver phone, only after permission.
- Supabase Realtime or server polling may update the dispatcher/customer view later.
- Google Maps, Mapbox, or HERE may display the map later.

Rules for job types:

- For DEP, TRF, and hourly jobs, the customer can receive a live location link 30 minutes before pickup if the owner approves customer live links.
- For Arrival/MNG jobs, customer live location is not used.
- Live location should auto-end when POB is marked.
- Driver statuses must include OTW, OTS, POB, and JC/Job Completed.
- OTS photo proof can be added later for Arrival/MNG jobs if approved.

No live location production behavior is implemented in this task.

| Option | Good for | Possible limitation | Pricing note | Recommended fit |
| --- | --- | --- | --- | --- |
| Browser Geolocation + Supabase Realtime | Driver phone location without a separate driver app | Requires secure job links, permission handling, battery care, and expiry rules | Browser API has no direct provider cost; Supabase usage pricing must be verified | Recommended starting prototype later |
| Google Maps Platform | Mature maps, geocoding, routing, traffic | Can become costly if usage grows | Pricing must be verified from official Google pricing page before implementation | Strong business-grade map option |
| Mapbox | Good map display and developer controls | Coverage, routing, and pricing must be reviewed for Singapore operations | Pricing must be verified from official Mapbox pricing page before implementation | Good alternative to Google |
| HERE Maps | Strong enterprise mapping/routing option | Developer complexity and pricing fit must be reviewed | Pricing must be verified from official HERE pricing page before implementation | Good enterprise alternative |

## 7. Driver/Customer Notification Plan

Possible future notification providers:

- WhatsApp Cloud API.
- Twilio WhatsApp.
- SMS provider such as Twilio.
- Email provider such as Resend, SendGrid, Postmark, or AWS SES.
- Push notifications later only.

Recommended practical starting approach:

- Use internal app reminders first.
- Add WhatsApp sending later only after owner approval.
- Add email later for invoices/statements only after owner approval.
- Use SMS only if truly needed because it can become expensive.
- Do not implement any sending now.

No WhatsApp, email, SMS, push notification, or production notification behavior is implemented in this task.

## 8. Flight Status API Plan

Arrival/MNG jobs need reliable flight ETA and status updates. A future flight integration should:

- Use a real flight data API, not guessed or fake flight status.
- Notify dispatcher and driver when ETA changes, after notification rules are approved.
- Require the driver to acknowledge the updated ETA.
- Be tested for Singapore Changi and Seletar coverage before implementation.

| Option | What it is good for | Possible limitation | Pricing note / must verify | Recommended fit for Prestige Limo Ops |
| --- | --- | --- | --- | --- |
| FlightAware AeroAPI | Established flight tracking API | Cost and coverage must be tested for local operating needs | Pricing must be verified from official FlightAware pricing page | Strong candidate if Singapore coverage is reliable |
| Aviationstack | Simple aviation data API | Accuracy, refresh timing, and coverage must be tested | Pricing must be verified from official Aviationstack pricing page | Candidate for evaluation |
| AeroDataBox | Flight data through API marketplace/direct provider | Limits, latency, and commercial fit must be reviewed | Pricing must be verified from official provider or marketplace page | Candidate for evaluation |
| AirLabs | Aviation data with broad API categories | Coverage and update timing must be tested | Pricing must be verified from official AirLabs pricing page | Candidate for evaluation |
| Cirium / FlightStats | Enterprise-grade aviation data | Likely higher cost and sales-led pricing | Pricing must be verified directly with provider | Later option if enterprise reliability is needed |

Recommended conservative approach:

- Pick one reliable flight data API only after testing Singapore/Changi/Seletar coverage.
- Do not implement flight API behavior until the owner approves cost, accuracy, and operational rules.

## 9. Maps/Geocoding/Routing Plan

Maps, geocoding, and routing may be needed for:

- Pickup/dropoff validation.
- Route time estimates.
- Driver/customer map display.
- Live location display.
- Future pricing logic using distance/time, but not yet.

| Option | Good for | Possible limitation | Pricing note | Recommended fit |
| --- | --- | --- | --- | --- |
| Google Maps Platform | Business-grade geocoding, maps, routing, traffic | Usage can become costly | Pricing must be verified from official Google pricing page | Strong first choice if budget fits |
| Mapbox | Flexible maps and routing | Needs local coverage and pricing review | Pricing must be verified from official Mapbox pricing page | Strong alternative |
| HERE Maps | Enterprise routing and location services | Needs implementation and pricing review | Pricing must be verified from official HERE pricing page | Good enterprise option |
| OpenStreetMap/Nominatim | Limited lookup or fallback use | Free/public services may have limits and reliability concerns | Usage policy must be verified before any production use | Not recommended for core business operations unless approved |

Business-grade production should not rely on free or unreliable geocoding for core operations unless the owner explicitly approves that risk.

## 10. Recommended API Stack For Prestige Limo Ops

- Payments: Stripe later; manual bank transfer record only; no bank API.
- PayNow: Review Stripe PayNow first; do not build custom QR generation yet.
- Live location: Browser Geolocation plus secure driver job link plus Supabase Realtime later.
- Maps: Google Maps or Mapbox, with final choice after pricing review.
- Flight status: Compare FlightAware, AeroDataBox, and Aviationstack first; final choice after Singapore coverage testing.
- Notifications: WhatsApp Cloud API or Twilio later; email provider later; SMS only if truly needed.
- Storage: Supabase Storage later only for OTS photo proof and receipts if approved.
- Monitoring: Sentry later only if needed.

## 11. Environment Variables / Secrets Planning

Likely future environment variables may include:

- `STRIPE_SECRET_KEY`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `MAPS_API_KEY`
- `NEXT_PUBLIC_MAPS_BROWSER_KEY`, only if the selected maps provider supports browser-restricted public keys safely
- `FLIGHT_API_KEY`
- `WHATSAPP_API_TOKEN`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_MESSAGING_SERVICE_SID`
- `EMAIL_PROVIDER_API_KEY`
- `SMS_PROVIDER_API_KEY`
- `SENTRY_DSN`, later only

No keys should be committed.

No API secrets should be exposed in browser/client code. Browser-safe publishable keys must still be restricted by provider controls whenever possible.

## 12. Security And Privacy Rules

- Driver live location must be job-scoped.
- Customer live location links must expire.
- Arrival/MNG customer live location must stay disabled.
- Driver payout must not be exposed through customer, driver, or public links.
- Private CRM notes must not be exposed through customer, driver, or public links.
- Public links must not expose all customer history.
- API webhooks must be verified before trusting any payment, notification, or provider event.
- Server-only routes must handle sensitive writes.
- Browser/public client code must not directly write sensitive customer, payment, invoice, location, notification, or audit tables.

## 13. Data Model Impact To Review Before Migration

Future schema planning may need to support:

- Payment method.
- Payment provider.
- Payment reference.
- Provider transaction id.
- Manual bank transfer reference.
- Live location session.
- Driver status events.
- OTS photo proof later.
- Flight number.
- Flight status provider.
- Latest ETA.
- Notification event log.
- Webhook event log.
- API audit event log.

This is planning only. No migrations are created by this document.

## 14. Testing Plan Before Any API Implementation

Before any API implementation, these checks must stay protected:

- Parser regression remains protected.
- Driver Dispatch / Customer Copy / Job Card copy unchanged.
- Customer folder isolation.
- No driver payout exposure.
- No private CRM leakage.
- No fake payment success.
- No fake flight status.
- Live location link is job-scoped.
- Customer live location disabled for Arrival/MNG.
- Driver location auto-ends at POB.
- Notification sending disabled unless explicitly approved.
- API keys are server-only.
- Mobile/browser compatibility remains protected.

## 15. Recommended Implementation Order

1. Docs-only API decision approval.
2. Final API provider selection.
3. Schema impact review.
4. Migration creation only after explicit approval.
5. Mock API adapter tests.
6. Stripe sandbox only.
7. Flight API sandbox/test only.
8. Driver live location protected prototype.
9. Notification sandbox only.
10. Production enablement only after owner approval.

## 16. Recommended Next Step

Review this API plan first with the owner. Do not implement APIs yet.
