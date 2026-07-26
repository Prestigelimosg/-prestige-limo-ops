# Codex Handoff — DSP Billing, Driver Alerts, Calendar, And Invoice Acceptance

Date: 27 July 2026 (Asia/Singapore)

Project:

`/Users/sohyl/prestige-limo-ops`

## Mandatory startup for the next Codex

1. Read `/Users/sohyl/prestige-limo-ops/AGENTS.md` completely.
2. Read `/Users/sohyl/prestige-limo-ops/docs/current-implementation-ledger.md`, starting with the newest sections.
3. Run:

   ```sh
   git status --short --branch
   git log --oneline -10
   git fetch origin
   ```

4. Start any newly approved application task from a new `codex/` branch based on current `origin/main`.
5. Inspect and reproduce the exact reported defect in the approved runtime surface before changing code.
6. Repair only the established lane. Do not add a duplicate panel, button, route, helper, table, provider path, or persistence writer.
7. Follow `TEST → FIX → REVIEW → COMMIT` in one bounded pass, update the implementation ledger, update an appropriate focused guard, stage the bounded files, and run `npm run guard:staged-app-change` before committing an application change.

## Repository checkpoint

- Completed application-work branch: `codex/pickup-risk-pob-loading-state`
- Final application commit on that branch: `cae23014 fix: allow amended invoice email resend`
- This handoff document was created separately on `codex/add-dsp-billing-handoff`, based on current `origin/main`.
- The amended-invoice email repair was merged through PR #135.
- Main merge commit: `7e79ed3a3e6bfeda8ff1393103688d9528d38018`
- Production deployment for that merge passed Vercel.
- Do not continue new application work on either completed branch. Fetch current `origin/main` and create a new bounded branch for a newly approved task.

## Owner-confirmed final Production acceptance

The owner confirmed that the final email was received with the correct amount.

Exact accepted test record:

- Public booking reference: `10846`
- Internal booking reference: `ADM-20260725150239`
- Customer: `Mr. Jenn Bin Tan [Mr. Jenn Bin Tan]`
- Invoice: `JBT-0001`
- Admin-corrected DSP billing interval: `26 Jul 2026, 12:00–20:14`
- Accepted customer amount: `SGD520.00`
- Approved verification recipient: `willsglimo@gmail.com`
- Fresh Resend event ID: `d9dfc8e3-8af6-4bd0-b518-5187ecc741bc`
- Provider result: `Delivered`
- Owner result: email received with the correct amount

The obsolete 15-minute Driver JC monitoring automation for booking `10846` was deleted after this acceptance. Do not recreate it.

## Completed work — do not duplicate

### 1. DSP scheduled end is optional when making a booking

- A DSP / Hourly / Disposal booking does not require scheduled end date or end time.
- If Admin enters one half of the optional scheduled-end pair, both fields remain required.
- The app does not infer a scheduled end.
- Focused protection: `scripts/test-admin-dispatch-dsp-scheduled-end-invoice-wiring-guard.mjs`.

### 2. Driver one-hour pickup alert is an app push, independent of Calendar

- A verified assigned driver receives the established safe app update and device push when pickup enters the 60-to-61-minute window.
- Supabase Cron invokes the protected existing application route once per minute.
- Calendar is only an extra convenience and is not the alert dependency.
- The driver must enable browser/OS alerts once on the exact device.
- Android Production acceptance for booking `10846` proved a background push was received after Simon enabled alerts.
- The Driver Portal now restores `Job Alerts Enabled` from the existing local permission, service worker, and subscription instead of falsely reverting to `Enable Job Alerts`.
- Do not add Email, SMS, WhatsApp, Telegram, another scheduler, another push lane, or another subscription table.
- Focused protection includes:
  - `scripts/test-driver-one-hour-pickup-push-reminder-guard.mjs`
  - `scripts/test-driver-job-device-push-alert-guard.mjs`
  - `scripts/test-driver-job-page-browser.mjs`

### 3. Pickup-risk POB loading state

- The Dashboard no longer flashes a false red pickup-risk warning while Driver Reports/POB evidence is still loading.
- The established risk logic is preserved after loading.
- Commit: `2822fb75 fix: prevent false pickup risk while reports load`.
- Do not hide a real risk or redesign the risk card.

### 4. Driver details automatically update the existing Operations Calendar event

- The existing `Save & Acknowledge Job` persistence handoff automatically updates the same deterministic Operations Calendar event with verified driver name, contact, plate, and vehicle.
- No duplicate Calendar event is created.
- Admin `Update + Cal` remains a recovery/amendment action; it is not normally required merely to add acknowledged driver details.
- The personal Driver Calendar/OAuth workflow is separate and was not replaced.
- Final Production acceptance on booking `10845` showed one correct event, correct overnight time, plate-bearing title, driver/vehicle details, `Ready for Confirmation`, and green `Cal saved`.
- Booking `10846` was also verified with one correct Operations Calendar event containing Simon, `SNP9124S`, `97366292`, and `AVF`.
- Read the ledger section `Verified Driver Details To Operations Calendar Repair` before any Calendar work.

### 5. DSP customer price uses saved booking pickup to real persisted Driver JC

- The automatic interval starts at the saved canonical booking pickup and ends only at the real persisted Driver `Job Completed`/JC timestamp for the exact booking.
- Never infer JC from OTS, POB, scheduled end, current time, booking status, or Admin completion.
- The established calculation remains:
  - two-hour minimum;
  - 15-minute grace;
  - 16 minutes onward counts as the next whole hour;
  - verified traveller/company/Prestige customer-rate precedence;
  - existing surcharges.
- The original booking `10846` evidence was pickup `13:00` to real JC `19:14`, producing 374 elapsed minutes, six billable hours, and the temporary SGD390 proposal at SGD65/hour.
- A persisted JC fallback now reads the latest exact-booking completed Driver Report only when the auxiliary DSP summary lacks an end.
- The automatic result is only a review proposal. It does not save price, select a job, create/issue an invoice, send an email, or mark payment.
- Read the ledger sections:
  - `DSP Customer Billing Booking-Time To JC Repair`
  - `Exact-Customer Folder DSP Booking-Time To JC Repair`
  - `DSP Persisted JC Billing-Evidence Fallback Repair`

### 6. Admin may correct both DSP billing start and end

- Both billing start and billing end are editable only inside:

  `Customers → exact customer folder → 3 · Pending jobs for payment → Jobs not billed yet → exact job → Edit`

- Dispatch Driver Reports remains read-only evidence.
- Corrections are append-only, require a reason, and supersede only the customer billing interval.
- They do not rewrite booking pickup, scheduled end, Driver Reports, earlier DSP evidence, Calendar, or driver state.
- Saving a correction recalculates and refreshes the existing editable `Customer price (SGD)` input.
- The correction does not automatically save the final customer price or create/send an invoice.
- Focused protection includes:
  - `scripts/test-customer-folder-dsp-billing-time-correction-guard.mjs`
  - `scripts/test-admin-driver-job-dsp-actual-time-read-api-contract.mjs`
  - `scripts/test-customer-folder-price-review-guard.mjs`

### 7. Reviewed DSP corrections update one matching unpaid issued invoice

- `3 · Pending jobs for payment` and `2 · Total invoices` are now linked through the existing exact-customer workflow.
- After Admin explicitly saves a reviewed correction, the existing invoice PATCH path may refresh only one exact matching unpaid issued invoice.
- It preserves the invoice number, issue/due dates, Unpaid state, customer/traveller scope, unrelated lines, and layout while refreshing the exact line, total, balance, stored PDF, and email state.
- Paid invoices, ambiguous/multiple matches, quotations, drafts, credit notes, cross-customer records, stale amounts, and invalid ownership fail closed.
- If no matching unpaid invoice exists, no invoice is created automatically.
- Focused protection: `scripts/test-customer-folder-amended-unpaid-invoice-link-guard.mjs`.

### 8. An issued booking is excluded from `Jobs not billed yet`

- An exact booking already covered by an issued invoice no longer appears as invoice-eligible in `Jobs not billed yet`.
- Matching uses exact internal/public booking reference evidence, never names, labels, amount, passenger, route, or description text.
- Paid and unpaid issued invoices count as billed; drafts, quotations, and credit notes do not.
- The existing server-side duplicate-invoice `409` guard remains authoritative.
- Production acceptance showed invoice `JBT-0001` at SGD520 while booking `10846` was absent from `Jobs not billed yet`.
- Focused protection: `scripts/test-customer-folder-issued-invoice-eligibility-guard.mjs`.

### 9. Customer PDF lower layout

- The stored/customer PDF lower order is:

  `sign-off → fully visible Bank Details → Notes → Terms & Conditions`

- Only the existing shared PDF renderer was changed.
- The admin selected-job review retains its separately approved disclosure layout.
- Do not rearrange or duplicate the owner-locked invoice workflow or layout.

### 10. Amended invoice email resend

- The first approved resend of amended `JBT-0001` reproduced HTTP 502 and no new Resend event.
- Root cause: the normal invoice email reused its old invoice/recipient idempotency key even though the stored PDF payload had changed. Resend rejects the same key with a different payload during its retention window.
- The established one-request email route now hashes the exact serialized provider payload and includes that bounded version only in the normal invoice idempotency key.
- Identical retries remain deduplicated; an explicitly amended stored PDF gets a new key.
- Reminder and payment-thank-you idempotency behavior is unchanged.
- No second sender, provider request, retry queue, button, route, PDF renderer, or email lane was added.
- Code: `app/api/admin-customer-invoice-email/route.ts`
- Focused protection: `scripts/test-customer-invoice-amended-email-idempotency-guard.mjs`
- Commit: `cae23014 fix: allow amended invoice email resend`
- PR: `https://github.com/Prestigelimosg/-prestige-limo-ops/pull/135`

## Validation completed

The bounded repairs passed their focused guards plus the applicable locked invoice, DSP, Calendar, Driver, and privacy guards. The final invoice-email repair also passed:

- TypeScript
- focused ESLint
- Next.js Production build
- `git diff --check`
- `npm run guard:staged-app-change`
- Vercel Preview
- merged-main Vercel Production deployment
- signed-in Production customer-folder verification
- one owner-approved email send
- fresh provider `Delivered` evidence
- owner confirmation that the received PDF showed the correct SGD520 amount

Do not claim a new runtime works only because a source guard or build passes. Reproduce and verify the exact approved runtime surface.

## What was not done

- Invoice `JBT-0001` was not marked Paid.
- No payment, card charge, Stripe action, payout, PayNow payout, refund, waiver, or accounting action was performed.
- No payment reminder or payment thank-you email was sent.
- No additional invoice was created after the accepted `JBT-0001`.
- No Production test data was deleted.
- No customer, driver, booking, invoice, notification, Driver Report, Calendar event, provider configuration, environment value, schema, or Supabase record was broadly reset.
- No archived-job deletion or automatic Admin completion was added.
- No personal Driver Calendar workflow was redesigned or replaced.
- No new chat, message, notification, billing, invoice, Calendar, or Driver Job lane was added.
- No cleanup scope has been enumerated or approved record-by-record.

## Deferred owner intention: test-data cleanup after 1 August

The owner said that Codex test data inside the app should be removed after 1 August. This is not permission to perform a broad or immediate deletion.

The next safe cleanup step is read-only:

1. Fetch current `origin/main` and use a new bounded branch only if code or documentation must change.
2. Inventory the exact test bookings, customers, drivers, invoices, notifications, Driver Job Links, status evidence, Calendar/event links, and dependent records.
3. Separate test records from anything that may be real operational or provider state.
4. Identify the existing supported delete/edit controls and retention locks.
5. Present the exact proposed deletion set and dependency order to the owner.
6. Obtain explicit action-time approval before deleting or mutating any record.

Never use a broad recursive/database deletion, guessed identity, date-only filter, name-only match, or “all records before/after date” rule. Preserve required audit, invoice, payment, Driver Report, and privacy boundaries.

## Next recommended action

Stop here unless the owner approves a new exact task.

When work resumes, the recommended first task is the read-only test-data cleanup inventory. Do not mark `JBT-0001` Paid and do not delete anything merely to continue testing.
