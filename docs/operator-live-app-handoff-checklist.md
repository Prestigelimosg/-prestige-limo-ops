# Operator Live App Handoff Checklist

Checkpoint: `c3b92d59 Clarify admin failure feedback`

Use this as the daily Prestige admin runbook. It is not a feature approval, not a deployment plan, and not permission to send messages, reserve invoice numbers, charge cards, create payouts, or change GPS/live-location outside the existing app controls.

## 1. New Booking Workflow

1. Customer submits through `/book`, or staff enters the booking in the admin Dispatch form.
2. In admin, load/review the booking details before saving: customer, passenger, contact, date/time, pickup, drop-off, service, vehicle, pax, flight, and notes.
3. If `Billing Identity Review` appears, stop and confirm the correct billing customer/account before continuing.
4. Click `Save + CRM` only after the booking details and billing identity are correct.
5. Confirm the success message says the operational booking was saved and Google Calendar auto-synced.
6. Treat Prestige as the source of truth. If a booking changes later, edit in Prestige and use `Update + Cal`; do not rely on Google Calendar edits to update Prestige.

## 2. Dispatch Workflow

1. Open the saved booking in Dispatch.
2. Assign or confirm driver name, contact, plate, vehicle, and job card details.
3. Use the driver job link only for the correct driver/job. Copy/share it manually through the approved staff channel.
4. Review Customer Copy before using any customer-facing message action.
5. Email customer/driver-details sends only through the existing approved Email row when it is enabled and the recipient is correct.
6. WhatsApp and SMS controls are disabled/setup-only unless separately activated later.
7. Customer In-App and Driver In-App actions are explicit admin clicks only; they are not automatic broadcasts.

## 3. Live Location Workflow

1. Add the saved booking to the admin Active Jobs Map/runtime only when live tracking is needed.
2. Driver opens the secure job link and clicks `Share Location`.
3. Admin watches the same-window map for active markers.
4. Use `Driver Pin` as the fallback when the embedded map is unavailable or the driver marker is not visible.
5. When the job is done, driver clicks `Stop Sharing`; admin refreshes and confirms the marker is gone.
6. Use `Close all` when live tracking for selected jobs is finished.

## 4. Amendment Workflow

1. Customer submits an edit/cancel request from the portal; the booking and calendar do not change automatically.
2. Admin reviews the request in Admin App Notifications.
3. Use `Review` to compare the request with the saved booking.
4. Use `Apply + Cal` only when the change is approved and should update the saved booking plus the existing Google Calendar event.
5. Use `Reject` when the request should not be applied.
6. Calendar duplicate rule: make changes in Prestige and use `Update + Cal` or `Apply + Cal`; do not create a separate manual calendar event for the same booking reference.

## 5. Closeout And Invoice Workflow

1. After a completed job, review the Completed Trip Closeout controls.
2. Mark the job ready only when closeout/billing readiness is correct. `Ready Locally` means admin has reviewed it for billing prep.
3. Go to `Customers & Invoices` > `Unbilled Customers`.
4. Use `Prepare` to load one billable customer/job into Send Invoice Workbench.
5. Review amount, due date, service, line item, card/fee status, and customer/account before `Preview`.
6. `Preview` is review-only; it does not issue a number.
7. `Issue` stores the invoice and starts PDF download. Use only when final.
8. Use row `Email` only after the issued invoice and recipient are approved.
9. Use `Paid` or `Unpaid` only after checking the real payment status outside the app.
10. Use `Credit` only for a correct paid invoice that needs a credit note.
11. Use `Archive` only for the approved test invoice cleanup case shown by the app; do not archive real customer invoices casually.

## 6. Customer Portal Workflow

1. In `Customers & Invoices`, use `Invite` to create/copy a customer portal link for the correct customer account.
2. Share the link manually through the approved staff channel.
3. Use `Revoke` when portal access should stop.
4. Customer portal shows customer-safe bookings and invoice folders only.
5. Portal invoice PDFs come from stored issued invoice records.
6. If a portal invoice/PDF is missing, check the admin Billing Documents row first; do not create a replacement invoice unless approved.

## 7. Invoice Prefix Workflow

1. Open the customer folder and use `Invoice Prefix Settings`.
2. If no prefix exists, admin may save a 2-12 character uppercase prefix for that customer/account.
3. Once saved or auto-created, the prefix is locked for that customer/account.
4. Locked prefix means future monthly customer invoice numbers use `PREFIX-0001`, lifetime sequence.
5. Changing customer/company name does not rename the prefix.
6. Do not click `Reserve Number` unless William explicitly approves reserving a live invoice number.
7. If no admin prefix was set, the app can auto-generate one for that customer/account when the approved reservation path is used.

## 8. Safety Boundaries

- No auto-charge, no auto-deduct, no Stripe/payment link, and no bank/payment record is created by previewing or preparing invoices.
- No payout, PayNow payout, payout comparison, or driver compensation action is created by dispatch, closeout, invoice, or portal views.
- No WhatsApp, SMS, or Telegram send is live unless separately enabled and approved.
- Customer-side edit/cancel requests do not directly change bookings, CRM, invoices, payments, providers, GPS/live-location, or Google Calendar.
- Prestige is the source of truth. Google Calendar reflects approved Prestige saves/updates; Google Calendar edits do not flow back into Prestige.
- Customers must not see driver payout, PayNow payout, internal admin/finance notes, parser/debug internals, mock QA/dev archive text, tokens, or secrets.
- Drivers must not see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, mock QA/dev archive text, tokens, or secrets.
