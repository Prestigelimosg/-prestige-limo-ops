# Stripe Test-Mode Payment-Link Workflow Plan

## 1. Purpose

This is a future Stripe test-mode payment-link workflow plan only. It is not an implementation.

Use this plan before building any real Stripe API, payment-link, checkout, webhook, invoice, customer billing, or production payment behavior. The goal is to make the future payment workflow safe, staff-reviewed, testable, and clearly separated from the current mock/local app surfaces.

## 2. Current Hard Boundary

- No real Stripe API call now.
- No real payment link now.
- No checkout session now.
- No webhook now.
- No live Stripe mode now.
- No automatic charging now.
- No invoice/PDF generation now.
- No bank API now.
- PayNow/bank transfer remains manual-record only.
- No Supabase schema or RLS change now.
- No app behavior change now.
- No parser change now.

This document does not create payment records, payment links, checkout sessions, invoices, PDFs, webhook routes, API routes, Supabase rows, customer notifications, or customer-facing payment behavior.

## 3. Current App Payment Status

The current app has protected planning and mock/local payment surfaces only.

- `/customers` has mock/local customer payment, monthly billing, draft invoice preview, statement preview, payment review, and collection follow-up planning surfaces.
- The internal dashboard has protected admin workflows for dispatch, bookings, drivers, rates, and mock/local operational placeholders.
- `/book` is customer-facing and mock/local. It collects booking request details for staff review, but it does not create real bookings or payments.
- `/my-bookings` is a mock/local customer portal. It lets customers view mock booking history and submit request-only booking or change requests.
- No real payment provider is connected in this stage.
- Stripe is planned as the preferred future card/payment-link provider because the business already has a Stripe account.
- PayNow and bank transfer remain manual-record only.

## 4. Stripe Test-Mode Workflow Overview

Future Stripe work should start with staff-reviewed test mode, not live payment collection.

Planned workflow:

1. Staff reviews the booking, customer, and amount first.
2. Staff chooses the booking, customer invoice, draft billing row, or payment item that needs payment.
3. The app prepares a draft payment-link preview.
4. Staff checks the customer name, booking reference, amount, currency, description, and contact details.
5. Staff confirms the draft details.
6. A Stripe test-mode payment link is created only after separate explicit approval for real Stripe test-mode API work.
7. The customer receives a link only after staff review and only after a separately approved sending workflow exists.
8. Payment status is not trusted until a verified Stripe webhook flow exists later.
9. Live mode requires separate explicit approval after test mode, webhook verification, staff training, and rollback planning.

The first future milestone should be a mock/local preview UI that proves the staff review flow without contacting Stripe.

## 5. Staff Review Requirements

Before any future payment link is created or sent, staff must review:

- Customer name.
- Booking reference.
- Pickup date/time.
- Job type.
- Amount.
- Currency.
- Description.
- Customer email/phone if used later.
- Payment due date if used later.
- Whether the booking or monthly billing row already has a payment link.
- Whether the customer has already paid by PayNow, bank transfer, card, or another method.
- Whether the link is a duplicate or replacement link.

Staff must manually review the payment details before sending. The app should help prevent accidental double payment links by showing existing draft links, sent links, paid statuses, expired links, and manual payment notes later.

## 6. Stripe Test Mode Checklist

- [ ] Use Stripe test keys only.
- [ ] Use Stripe test cards only.
- [ ] Never use live keys in staging.
- [ ] Keep the Stripe secret key server-side only later.
- [ ] Keep the Stripe publishable key environment-based later.
- [ ] Treat the publishable key as public but still avoid hardcoding it.
- [ ] Require a Stripe webhook secret later.
- [ ] Store keys and webhook secrets in environment variables only.
- [ ] Put no keys in git.
- [ ] Put no keys in screenshots, docs, chat, or commits.
- [ ] Rotate keys if any key is exposed.
- [ ] Keep test and live mode clearly separated.
- [ ] Confirm staff understands that test mode does not collect real money.

## 7. Payment Link Data Checklist

Future payment-link planning should define these fields before any real API work:

- Customer name.
- Booking ID/reference.
- Invoice/draft billing reference later.
- Amount.
- Currency.
- Description.
- Due date if needed later.
- Internal notes.
- Stripe payment link ID later.
- Stripe checkout/session reference later only if needed.
- Payment status later.
- Created by staff user later.
- Created timestamp later.
- Sent timestamp later.
- Paid timestamp later.
- Expired/cancelled timestamp later.
- Manual payment override note later.
- Audit log reference later.

Payment link data must stay tied to staff-reviewed booking or customer billing context. It should not be created from public pages without separate approval.

## 8. Manual PayNow/Bank Transfer Plan

- No bank API.
- PayNow/bank transfer remains manual-record only.
- Staff can later mark payment received manually.
- Manual receipt records must be audit logged later.
- Staff should record method, date received, amount, reference, and note later.
- No automatic bank reconciliation unless separately approved.
- Driver PayNow number remains driver detail information only and must not trigger payment, payout, bank, invoice, or reconciliation behavior.

Manual payment records should be reviewed in the Supabase payment schema/RLS plan before they become real data.

## 9. Webhook Plan For Later

Stripe webhooks are required before the app can trust payment status updates.

Future webhook rules:

- Webhook signature verification is required.
- Webhook route must be server-side only.
- Webhook secret must be stored in environment variables only.
- Payment status updates happen only after a verified event.
- Duplicate webhook events must be handled safely.
- Failed, expired, cancelled, unpaid, paid, refunded, and disputed states must be planned.
- Webhook retries must not create duplicate payment records.
- Staff-facing audit logs should show what event changed the payment status.
- Public pages must not be able to fake payment status.

There is no webhook behavior in this docs-only stage.

## 10. Supabase/RLS Considerations Later

Before any real Stripe payment data is saved, the Supabase schema and RLS design must be reviewed.

Future review areas:

- Payment records table review later.
- Payment link table/relation later.
- Booking to payment record relationship later.
- Customer to payment record relationship later.
- Invoice/draft billing to payment link relationship later.
- RLS required before public/customer access.
- Customer must only see their own payment records later.
- Staff/admin can manage payment records later.
- Public booking pages must not create unrestricted payment rows.
- Audit logs for payment link creation, payment status changes, manual payment notes, failed payments, refunds, and staff overrides.
- Safe handling for deleted, cancelled, amended, or duplicate bookings.

No Supabase migration, schema change, RLS policy change, or storage behavior is added in this stage.

## 11. Customer Communication Plan

Payment-link communication should start mock/log-only before any real sending.

Future communication rules:

- Staff reviews before sending a payment link.
- Staff chooses the communication channel later.
- WhatsApp, SMS, and email integrations require separate approval.
- Message templates must be reviewed before live sending.
- Customer contact details must be checked before sending.
- Sent timestamp and staff user should be audit logged later.
- Failed sends and resend attempts must be tracked later.
- No real notification sending now.
- No customer self-payment page exists yet unless separately approved later.

Payment links should not be auto-sent immediately after creation until staff-reviewed sending behavior is explicitly approved.

## 12. Invoice/PDF Relationship

Future invoice and payment-link work must stay carefully staged.

- Draft invoice preview comes first.
- No real invoice number generation now.
- Payment links can later be associated with a draft invoice, booking, monthly billing row, or customer payment item.
- Real invoice/PDF behavior requires separate approval.
- Avoid sending invoice/PDF automatically.
- Avoid issuing immutable invoice numbers until the invoice numbering policy is approved.
- Avoid mixing test-mode Stripe payments with real invoice records.

This stage does not generate invoices, statements, PDFs, invoice numbers, receipts, or payment documents.

## 13. Security Checklist

- [ ] Use environment variables for all Stripe keys and webhook secrets.
- [ ] Keep Stripe secret key server-side only.
- [ ] Verify webhook signatures before trusting payment events.
- [ ] Add role-based staff access before real payment management.
- [ ] Add audit logs for staff actions and webhook status changes.
- [ ] Keep secrets out of git.
- [ ] Keep secrets out of docs, screenshots, chat, and commits.
- [ ] Keep the Supabase `service_role` key out of frontend code.
- [ ] Do not expose public unrestricted payment records.
- [ ] Test in staging before live.
- [ ] Prepare a rollback plan before real payment behavior.
- [ ] Prepare a manual fallback if Stripe is unavailable.
- [ ] Confirm live mode requires separate explicit approval.

## 14. Testing Checklist

Required checks for this docs-only stage and future Stripe stages:

- [ ] `npm run test:parser`
- [ ] `npm run lint`
- [ ] `npm run build`
- [ ] `npm run test:app-smoke-browser`
- [ ] `npm run test:mobile-usability-browser`
- [ ] `npm run test:safe`
- [ ] No real Stripe calls in mock mode.
- [ ] No payment link created without staff action.
- [ ] No live key used in test mode.
- [ ] No webhook accepted without signature verification later.
- [ ] No public page can create payment records unless approved.
- [ ] Browser tests for customer/staff payment surfaces later.
- [ ] Mobile/no-horizontal-overflow.
- [ ] Parser regression tests still pass before and after payment work.
- [ ] No Supabase writes from public pages unless approved.
- [ ] No notification sends in mock mode.

## 15. Future Staged Implementation Order

a. Docs-only Stripe test-mode payment-link workflow plan.  
b. Mock/local payment-link preview UI.  
c. Test-only protection that preview creates no real Stripe call.  
d. Docs-only Stripe webhook/security plan.  
e. Real Stripe test-mode environment variable checklist only after approval.  
f. Real Stripe test-mode payment-link API only after approval.  
g. Stripe webhook test-mode only after approval.  
h. Staff-reviewed sending workflow only after approval.  
i. Live mode only after separate explicit approval.

Each stage should be small, tested, and separately approved. Test mode approval does not approve live mode.

## 16. Approval Gates

Separate explicit approval is required for:

- Stripe test-mode API.
- Stripe webhook route.
- Stripe live mode.
- Sending payment links to customers.
- Supabase payment schema/RLS changes.
- Invoice/PDF generation.
- Notification sending.
- Auth/RBAC.
- Customer portal payment visibility.
- Manual PayNow/bank transfer record persistence.
- Refund, dispute, or cancellation handling.

Approval for one gate does not approve the others.

## 17. Final Readiness Checklist

### Ready to build Stripe test-mode only when all are true

- [ ] Plan reviewed.
- [ ] Stripe test keys available.
- [ ] Environment variable handling confirmed.
- [ ] Webhook verification plan reviewed.
- [ ] Staff review workflow approved.
- [ ] Supabase payment schema/RLS plan reviewed.
- [ ] Parser tests passing.
- [ ] App tests passing.
- [ ] Explicit approval received.

If any item is not ready, continue with docs-only or mock/local planning and do not connect Stripe.
