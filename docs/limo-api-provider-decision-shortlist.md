# Limo API Provider Decision Shortlist

This is an API provider decision shortlist only. No API integration, migration file, schema change, Supabase command, payment API, bank API, notification sending, live location production behavior, flight status production behavior, invoice generation, statement generation, or production payment behavior is included.

## 1. Purpose

This document helps the owner choose future API providers before any implementation starts.

It turns the broader API integration plan into a simple shortlist for payments, PayNow, manual bank transfer, live location, maps, flight status, notifications, storage, and monitoring. It is for decision review only. It does not approve API integration, schema changes, migrations, Supabase commands, live production behavior, notification sending, invoice generation, statement generation, or production payment behavior.

## 2. Locked Decisions

- Stripe is the preferred future payment provider.
- PayNow should be reviewed through Stripe first.
- Bank wire and bank transfer remain manual-record only.
- No bank API is planned, recommended, or approved.
- No real API integration is approved yet.
- No production API behavior is approved yet.
- Pricing must be verified from official provider pricing pages before implementation.

## 3. Recommended Provider Shortlist

| Feature area | Recommended first choice | Backup option | Why this is safest | Pricing note | Risk level | Owner decision needed |
| --- | --- | --- | --- | --- | --- | --- |
| Payments | Stripe | HitPay | Stripe is already the preferred future provider and supports a mature card/payment workflow with server-side webhook patterns | Verify official Stripe pricing before implementation | High | Approve Stripe as first payment provider for sandbox planning later |
| PayNow | Review Stripe PayNow first | Manual PayNow QR/manual PayNow record | Keeps PayNow inside the same preferred payment provider if suitable, while preserving manual fallback | Verify Stripe PayNow availability and pricing before implementation | High | Decide whether PayNow should be Stripe-first or manual-only at launch |
| Manual bank transfer | Manual record only | Manual PayNow record | Avoids bank API risk and keeps bank reconciliation under owner/staff control | No API cost; manual checking effort remains | Low | Confirm bank transfer stays manual-record only |
| Driver live location | Browser Geolocation through secure driver job link | Server polling instead of realtime | Uses the driver's phone browser and avoids requiring a separate driver app | Browser Geolocation has no direct provider fee; hosting/realtime pricing must be verified | High | Approve later prototype only, not production behavior |
| Maps/geocoding/routing | Google Maps or Mapbox | HERE Maps | These are business-grade providers for address lookup, maps, routing, and live location display | Verify official provider pricing and Singapore address test results | Medium | Choose Google Maps or Mapbox after cost and address testing |
| Flight status | Test FlightAware, AeroDataBox, and Aviationstack | AirLabs or Cirium later | Avoids choosing blindly before testing Changi and Seletar coverage | Verify official pricing and coverage before implementation | High | Approve a flight API only after accuracy and cost review |
| WhatsApp notification | Internal app reminders first; WhatsApp later only | WhatsApp Cloud API or Twilio WhatsApp | Keeps sending disabled until message templates, costs, and consent are approved | Verify official WhatsApp/Twilio pricing before implementation | High | Decide later whether WhatsApp sending is needed |
| Email notification | Email later only for invoices/statements after approval | Resend, SendGrid, Postmark, or AWS SES | Avoids premature customer emails before invoice/statement policy is approved | Verify official provider pricing before implementation | Medium | Decide later whether email sending is needed |
| SMS notification | Avoid at first | Twilio SMS or local SMS provider | SMS can become costly and should be used only when truly needed | Verify official SMS pricing before implementation | Medium | Decide later whether SMS is worth the cost |
| File/photo storage later only | Supabase Storage later only | S3-compatible storage | Keeps storage close to future Supabase policies if OTS proof photos or receipts are approved | Verify Supabase Storage pricing and retention needs before implementation | Medium | Decide later whether photos/receipts should be stored |
| Error monitoring later only | Sentry later only if needed | Provider logs and Supabase logs | Adds production visibility only when the app needs a dedicated error-monitoring tool | Verify official Sentry pricing before implementation | Low | Decide later whether dedicated monitoring is needed |

## 4. Payment Decision

Recommended owner decision:

- Use Stripe first when payment API work is approved later.
- Review Stripe card payment later.
- Review Stripe PayNow first before considering any separate PayNow provider.
- Keep manual bank transfer as a manual record only.
- Do not add a bank API.

Why this is safest:

- It keeps online payments focused on one preferred provider first.
- It avoids multiple payment systems before the owner has approved production payment behavior.
- It keeps bank transfer simple and manual, which matches the owner's decision.
- It preserves manual statuses: pending, invoice sent, partial paid, paid, waived, refunded, and cancelled.
- It keeps payment reference, note, and received date required for manual payment updates.

No payment API is implemented or approved by this document.

## 5. Live Location Decision

Recommended owner decision:

- Use Browser Geolocation through a secure driver job link for any later prototype.
- Use Supabase Realtime or server polling later only after schema and security review.
- Use Google Maps or Mapbox for map display after pricing and Singapore address testing.
- Allow Arrival/MNG customer live location only through the scoped customer Driver Tracking panel after OTW and driver location sharing.
- Auto-end live location when POB is marked.

Why this is safest:

- It avoids requiring a separate driver app at the start.
- It keeps location sharing job-scoped instead of exposing general driver tracking.
- It lets the driver explicitly activate sharing.
- It keeps Arrival/MNG customer live location scoped to manual arrival readiness plus driver sharing, without claiming flight API/ETA monitoring is active.

No live location production behavior is implemented or approved by this document.

## 6. Flight Status Decision

Recommended owner decision:

- Test FlightAware, AeroDataBox, and Aviationstack for Changi and Seletar coverage before choosing.
- Consider AirLabs or Cirium later only if the first shortlist does not meet accuracy, timing, or reliability needs.
- Do not implement flight API behavior until cost and accuracy are approved.
- Avoid fake ETA or guessed flight status.

Why this is safest:

- Arrival/MNG jobs depend on reliable ETA changes.
- A wrong ETA can create real driver timing and customer-service problems.
- Testing coverage first avoids paying for a provider that does not fit Singapore operations.

No flight status production behavior is implemented or approved by this document.

## 7. Notification Decision

Recommended owner decision:

- Use internal app reminders first.
- Add WhatsApp sending later only after approval.
- Add email later for invoices/statements only after invoice and statement policy is approved.
- Use SMS only if truly needed because it can become expensive.

Why this is safest:

- It avoids accidental messages to customers or drivers.
- It avoids message-template, consent, and cost issues before the workflow is approved.
- It keeps the app useful internally before external sending is switched on.

No notification, WhatsApp, email, SMS, or push sending is implemented or approved by this document.

## 8. Maps Decision

Recommended owner decision:

- Treat Google Maps and Mapbox as the likely first choices.
- Use HERE Maps as a backup business-grade option if pricing, coverage, or routing needs make it a better fit.
- Make the final choice only after pricing review and Singapore address testing.
- Avoid free or unreliable geocoding for core operations unless the owner explicitly approves that risk.

Why this is safest:

- Pickup and dropoff addresses are operationally important.
- Live location and routing depend on reliable map display and address handling.
- Free geocoding can have limits, policy restrictions, or reliability issues that are risky for daily dispatch work.

No map, geocoding, or routing production behavior is implemented or approved by this document.

## 9. Security Rules

These rules should protect any future API provider work:

- API keys must be server-only unless a provider explicitly supplies a browser-safe publishable key.
- No API secrets should be committed.
- No secrets should be exposed in browser code.
- Webhooks must be verified before trusting payment, notification, flight, or provider events.
- Live location links must be job-scoped and expiring.
- Arrival/MNG customer live location stays scoped to the customer Driver Tracking panel and must not become a broad external tracking send.
- Driver payout must not be exposed.
- Private CRM notes must not leak into customer, driver, or public views.
- Public links must not expose all customer history.
- Browser/public client code must not directly write sensitive customer, payment, invoice, location, notification, or audit tables.

## 10. Recommended Implementation Order

1. Owner approves provider shortlist.
2. Schema impact review.
3. Migration planning only if needed.
4. Mock API adapter tests.
5. Stripe sandbox only.
6. Flight API sandbox/test only.
7. Driver live location protected prototype.
8. Notification sandbox only.
9. Production enablement only after owner approval.

## 11. Recommended Next Step

Review this shortlist with the owner first. Do not implement APIs yet.
