# Operator Live App Handoff Checklist

Checkpoint: `01fc2ee8 Hide names from WhatsApp job cards`

Use this as the daily Prestige admin runbook. It is not a feature approval, not a deployment plan, and not permission to send messages, reserve invoice numbers, charge cards, create payouts, or change GPS/live-location outside the existing app controls.

Current live checkpoint: `01fc2ee8`. `main` and `staging` are aligned to this checkpoint.

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
3. Treat `Job Card Preview` as the privacy-safe WhatsApp group job card. It hides passenger/traveller, customer/company/account, booker, and contact names.
4. Driver Dispatch, Customer Copy, Driver Job Link copy, booking fields, and operational admin lists may still show needed names for daily operations.
5. Use the driver job link only for the correct driver/job. Copy/share it manually through the approved staff channel.
6. Review Customer Copy before using any customer-facing message action.
7. Email customer/driver-details sends only through the existing approved Email row when it is enabled and the recipient is correct.
8. WhatsApp and SMS controls are disabled/setup-only unless separately activated later.
9. Customer In-App and Driver In-App actions are explicit admin clicks only; they are not automatic broadcasts.

## 3. Messaging And Alerts

1. Telegram controls are manual-copy only.
2. The app does not open a Telegram tab and does not perform a Telegram provider send.
3. A phone number alone is not enough for Telegram delivery; a Telegram bot `chat_id` would be required for provider sending, which is not active in this workflow.
4. Admin email alerts are internal only and go to `info@prestigelimo.sg`.
5. Admin email alerts trigger for new booking requests and customer amendment/cancellation requests.
6. Admin email alerts do not send customer or driver messages.
7. Customer amendment/cancellation requests do not change bookings, calendar, or CRM until admin reviews and applies the action.

## 4. Live Location Workflow

1. Driver opens the secure Driver Job Link and clicks `Share Location`.
2. Admin views current shared location in Dispatch Live Driver Map / the same-window admin map flow.
3. This is current-location monitoring for dispatch; do not promise WhatsApp-style external smooth tracking.
4. When the job is done, driver clicks `Stop Sharing`; admin refreshes and confirms the marker is gone.
5. Close the live map/runtime controls when live tracking for selected jobs is finished.

## 5. Amendment Workflow

1. Customer submits an edit/cancel request from the portal; the booking and calendar do not change automatically.
2. Admin reviews the request in Admin App Notifications.
3. Use `Review` to compare the request with the saved booking.
4. Use `Apply + Cal` only when the change is approved and should update the saved booking plus the existing Google Calendar event.
5. Use `Reject` when the request should not be applied.
6. Calendar duplicate rule: make changes in Prestige and use `Update + Cal` or `Apply + Cal`; do not create a separate manual calendar event for the same booking reference.

## 6. Closeout And Invoice Workflow

1. After a completed job, review the Completed Trip Closeout controls.
2. Mark the job ready only when closeout/billing readiness is correct. `Ready Locally` means admin has reviewed it for billing prep.
3. Go to `Customers & Invoices` > `Unbilled Customers`.
4. Use `Prepare` to load one billable customer/job into Send Invoice Workbench.
5. Review CRM billing account, amount, due date, service, line item(s), card/fee status, and customer/account before `Preview`.
6. `Preview` is review-only; it does not issue a number.
7. `Issue` stores the invoice and starts PDF download. Use only when final.
8. Invoice `Issue`, invoice number reservation, PDF/email, `Paid` / `Unpaid`, and Credit Note actions are high-consequence. Use them only after final admin review.
9. Use row `Email` only after the issued invoice and recipient are approved.
10. Use `Paid` or `Unpaid` only after checking the real payment status outside the app.
11. Use `Credit` only for a correct paid invoice that needs a credit note.
12. Use `Archive` only for the approved test invoice cleanup case shown by the app; do not archive real customer invoices casually.

## 7. Customer Portal Workflow

1. In `Customers & Invoices`, use `Invite` to create/copy a customer portal link for the correct customer account.
2. Share the link manually through the approved staff channel.
3. Use `Revoke` when portal access should stop.
4. Customer portal shows customer-safe bookings and invoice folders only.
5. Portal invoice PDFs come from stored issued invoice records.
6. If a portal invoice/PDF is missing, check the admin Billing Documents row first; do not create a replacement invoice unless approved.

## 8. Invoice Prefix Workflow

1. Open the customer folder and use `Invoice Prefix Settings`.
2. If no prefix exists, admin may save a 2-12 character uppercase prefix for that customer/account.
3. Once saved or auto-created, the prefix is locked for that customer/account.
4. Locked prefix means future monthly customer invoice numbers use `PREFIX-0001`, lifetime sequence.
5. Changing customer/company name does not rename the prefix.
6. Do not click `Reserve Number` unless William explicitly approves reserving a live invoice number.
7. If no admin prefix was set, the app can auto-generate one for that customer/account when the approved reservation path is used.

## 9. Safety Boundaries

- No auto-charge, no auto-deduct, no Stripe/payment link, and no bank/payment record is created by previewing or preparing invoices.
- No payout, PayNow payout, payout comparison, or driver compensation action is created by dispatch, closeout, invoice, or portal views.
- No WhatsApp, SMS, or Telegram send is live unless separately enabled and approved.
- Customer-side edit/cancel requests do not directly change bookings, CRM, invoices, payments, providers, GPS/live-location, or Google Calendar.
- Prestige is the source of truth. Google Calendar reflects approved Prestige saves/updates; Google Calendar edits do not flow back into Prestige.
- Cleanup fake/test bookings only by exact booking references and tied rows; no broad deletion.
- Customers must not see driver payout, PayNow payout, internal admin/finance notes, parser/debug internals, mock QA/dev archive text, tokens, or secrets.
- Drivers must not see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance/admin notes, parser/debug internals, mock QA/dev archive text, tokens, or secrets.
