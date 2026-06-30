# Billing Documents Operator Checklist

Live handoff check: 2026-06-30 on `https://app.prestigelimo.sg` in Mac Chrome.

## Boundaries

- Do not use Vercel, env, DB, provider, GPS, Stripe, payment-link, payout, or schema actions from this checklist.
- Do not click `Email` unless the invoice email send is explicitly approved for that customer and recipient.
- Treat `Paid`, `Unpaid`, `Convert`, and `Credit` as real document actions. Click them only when the billing decision is final.
- Customer portal invoice folders must not show driver payout, PayNow payout details, internal admin/finance notes, parser/debug internals, mock QA/dev archive text, Stripe checkout, or payment-intent details.

## Admin Billing Documents

1. Open `Customers & Invoices`.
2. In `Billing Documents`, confirm compact action buttons are visible: `PDF`, `Email`, `Paid` or `Unpaid`, `Quote`, `Convert`, and `Credit` where applicable.
3. Use the pager to reach older documents. The live handoff check confirmed page 2 exposed older invoices such as `INV-20260629-0003` and `INV-20260629-0002`.

## Issue Quote

1. Prepare the customer row in the invoice workbench.
2. Set the document selector to `Quotation`.
3. Use `Preview` first and review customer, route, amount, notes, and terms.
4. Use `Issue` only when the quote is ready to store.
5. Use `PDF` to download the quotation for review or sharing outside the app workflow.

## Convert Quote To Invoice

1. Find the stored quotation row in `Billing Documents`.
2. Confirm the row is the correct customer, reference, amount, and document number.
3. Click `Convert` only when the customer accepted the quote.
4. Confirm a new invoice row appears. The quote should remain a quote record.

## Download PDF

1. Click `PDF` on the target quotation, invoice, or credit note row.
2. Open the downloaded file and confirm the document type, customer, amount, bank details, notes, and terms are correct.
3. Do not use PDF download as proof that email was sent.

## Email Invoice

1. Send email only after explicit approval for that invoice and recipient.
2. Confirm the document is the correct stored invoice.
3. Click `Email` only once.
4. After sending, check the row status for the email indicator.

## Mark Paid Or Unpaid

1. Confirm payment status against the actual payment record outside this app.
2. Click `Paid` only after payment is confirmed.
3. Click `Unpaid` only when reversing an incorrect paid mark.
4. Recheck that the invoice moved to the expected customer portal folder.

## Create Credit Note

1. Use `Credit` only on the correct paid invoice.
2. Confirm the invoice number, customer, and amount before clicking.
3. After creation, confirm the new `CN-...` row appears and links back to the original invoice.
4. The original invoice should remain `Paid`.

## Customer Portal Check

1. Open the customer's portal link from the customer finder.
2. Open `Invoices`.
3. Confirm folders are present: `Quotations`, `Unpaid Invoices`, `Paid Invoices`, and `Credit Notes`.
4. Confirm the expected documents appear in the correct folders.
5. Scan the page for forbidden customer-visible text: payout, PayNow payout, internal notes, finance notes, parser/debug, mock archive, Stripe checkout, payment intent, secrets, or provider internals.
