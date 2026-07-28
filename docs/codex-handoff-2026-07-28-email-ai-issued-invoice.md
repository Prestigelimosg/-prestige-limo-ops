# Codex Handoff — Email AI And Issued Invoice Editing

Date: 28 July 2026 (Asia/Singapore)

Project:

`/Users/sohyl/prestige-limo-ops`

## Mandatory startup for the next Codex

1. Read `/Users/sohyl/prestige-limo-ops/AGENTS.md` completely.
2. Read `/Users/sohyl/prestige-limo-ops/docs/current-implementation-ledger.md`, starting with:
   - `Issued Invoice In-Place Edit Repair`
   - `Private Semantic Email AI Intake`
3. Run:

   ```sh
   git status --short --branch
   git log --oneline -10
   git fetch origin
   ```

4. Start any newly approved application task from a new `codex/` branch based on current `origin/main`.
5. Inspect and reproduce the exact reported defect on the approved runtime surface before changing code.
6. Repair only the established lane. Do not add another page, panel, button, route, table, AI intake, notification sender, invoice writer, or Calendar path.
7. Follow `TEST → FIX → REVIEW → COMMIT` in one bounded pass. Update the implementation ledger and an appropriate focused guard, stage the bounded files, and run `npm run guard:staged-app-change` before committing an application change.

## Current repository and release checkpoint

- Current remote main at handoff creation: `6a93f1e0a850cb67a7f568d738bc7ca920afee95`
- Email AI admin-review completion: PR #143, merged as `0f7c82f10ccf32d2d20d34ab488d839b07c93832`
- Issued invoice in-place edit repair: PR #144, merged as `6a93f1e0a850cb67a7f568d738bc7ca920afee95`
- Invoice repair Production deployment:
  - Deployment ID: `dpl_4fAt4M3ppXyWAdrtH8EQWVDVVB14`
  - Deployment URL: `https://prestige-limo-ops-staging-fj7py7uhx-prestigelimosgs-projects.vercel.app`
  - Production alias: `https://app.prestigelimo.sg`
  - State: `READY`
- This handoff is documentation-only. It must not be treated as a new application release.

## What is completed and deployed — do not duplicate

### 1. Private Email AI intake

- The background Email AI reads only mailbox `booking@prestigelimo.sg`.
- It accepts only the exact sender/Return-Path `info@prestigelimo.sg`.
- It uses AI to classify the allowed incoming email by meaning rather than relying on one fixed layout.
- Only these actionable results enter the existing Dashboard `Booking Requests` review feed:
  - confirmed booking;
  - amendment;
  - cancellation.
- Enquiry, unrelated, uncertain, and failed results stay outside the app. Admin reads and answers those in the original mailbox.
- The lane does not create an email draft, reply to a customer, or send an email.
- Supabase Cron invokes the protected intake once per minute. Only a qualifying allowed email sent to the model incurs Email AI token usage.
- A newly queued actionable result reuses the established Admin device-push sender and contributes to the existing Dashboard alert badge.
- Already queued records appear after the app refreshes; old records do not replay an event-time device push.

### 2. Existing Admin review and booking handoff

- The one established flow is:

  `Dashboard Booking Requests → Review in Dispatch → Create Job Card → Save + CRM`

- App-form requests and Email AI records remain visibly source-labelled in the same review sector.
- After every linked booking has saved successfully, only the exact originating Email AI intake row is marked reviewed.
- That exact row then disappears from Booking Requests and the same badge count decreases.
- Opening Review, creating a draft card, a validation failure, failed persistence, or a partially saved linked return trip does not close the intake.
- The live parser defect for:

  `Trip organizer: Mr. Kim, Hyun Soo, +65 98156017`

  was repaired narrowly. The established Dispatch fields now resolve:
  - Booker: `Mr Kim, Hyun Soo`
  - Booker contact: `+65 98156017`
  - Passenger: `Pui Yu Chan`
  - Pax: `4`

### 3. Compact Email AI token usage

- One compact `Email AI` monthly token tile is displayed beside the existing `Saved` tile.
- It reads the already stored current Singapore-month Email AI input and output token usage.
- Loading or refreshing the tile does not call OpenAI and does not consume AI tokens.
- The tile does not show a fictitious “tokens remaining” balance because API use is usage-based.
- It covers background Email AI only. It does not include the separate press-to-run Ask AI usage.

### 4. Every stored issued invoice can be edited in place

- Every stored issued invoice row now has one compact `Edit` action inside the existing exact-customer `2 · Total invoices` section.
- The inline editor supports:
  - changing existing line descriptions;
  - changing line amounts;
  - adding or removing lines within the established four-line limit;
  - cancelling without a write;
  - saving only after explicit confirmation.
- Save updates the same stored invoice. It preserves:
  - invoice number;
  - issue and due dates;
  - exact customer scope;
  - booking/reference metadata;
  - route and service metadata;
  - current Paid or Unpaid status.
- Save recalculates the total and balance and regenerates the same stored PDF through the existing renderer.
- Because the outgoing document changed, Save resets only the normal invoice email-delivery state. It does not send the email.
- Paid issued invoices can be edited and remain Paid. The existing separate `Mark unpaid` action remains unchanged.
- Stale, missing, cross-customer, draft, quotation, credit-note, malformed, empty, and over-limit requests fail closed.
- No second invoice page, workbench, renderer, table, numbering lane, or API path was added.

## Production and local verification completed

### Email AI

- The actionable-only Production routing was verified in signed-in owner-Mac Chrome.
- The original enquiry email remained in the mailbox and did not appear in the app.
- The exact Email AI review → Create Job Card → successful Save + CRM workflow was exercised by the Mac browser suite.
- The saved intake row disappeared and the badge decreased by one.
- The complete browser run reported zero test errors, zero console errors, zero blocked Supabase requests, and zero blocked Supabase mutation requests.
- The full safe test chain, TypeScript, and Production build passed for the final Email AI repair.

### Issued invoice Edit

- Production invoice `DEEP-0001` displayed the new `Edit` action.
- The editor loaded the two stored lines:
  - booking `10827`, SGD70;
  - booking `10826`, SGD85.
- Add, Remove, Cancel, and Save controls were visible.
- The owner-Mac Production check used `Cancel`, after which the editor closed and the stored row remained `SGD155 · Pending`.
- Chrome reported zero console errors.
- The Pending and Paid editor paths, Add/Remove/Cancel behavior, TypeScript, Production build, staged-app guard, and all applicable focused invoice guards passed.
- No real invoice edit was saved during Production verification.

Focused invoice protection includes:

- `scripts/test-customer-folder-issued-invoice-edit-guard.mjs`
- `scripts/test-customer-folder-issued-invoice-eligibility-guard.mjs`
- `scripts/test-customer-folder-amended-unpaid-invoice-link-guard.mjs`
- `scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs`
- `scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs`
- `scripts/test-customer-billing-document-lifecycle-guard.mjs`
- `scripts/test-customer-invoice-amended-email-idempotency-guard.mjs`

## What has not been done

- No real issued invoice edit was saved after deployment.
- No invoice email, reminder, payment thank-you, or other external customer message was sent.
- No invoice was marked Paid or Unpaid during this work.
- No card charge, Stripe action, refund, payout, PayNow payout, or accounting write was performed.
- WhatsApp AI reading and automatic customer replies were not implemented.
- Email AI does not draft or answer enquiries. Enquiries remain intentionally outside the app for manual Admin handling.
- Customer `Add to Calendar` / customer Calendar work remains parked.
- Stripe and customer payment-link work remains parked.
- Google OAuth final verification remains separate and was not completed here.
- Native iPhone home-screen badge behavior was not implemented or verified. The completed Email AI alert is the existing web-app Admin device-push and Dashboard badge lane.
- The six Google Search Console Soft 404 examples were diagnosed but deliberately left unchanged at the owner's direction. No website SEO route was modified.
- No Production test data was deleted.

## Action-time approval still required

Obtain the owner's explicit approval immediately before any real financial or external write, including:

- saving a real invoice amendment;
- sending or resending an invoice;
- sending a reminder or payment thank-you;
- marking an invoice Paid or Unpaid;
- charging, refunding, paying out, or changing PayNow/payment state;
- sending any real customer or driver message;
- changing provider, environment, Calendar, Google, Supabase, mailbox, or Cron configuration.

Do not treat source code, a focused guard, or a local/browser dry run as permission for one of these live actions.

## Established workflows left untouched

- Driver ACK queue and private Driver Job Links
- Driver Reports and explicit `Admin confirm completed`
- personal Driver Calendar and OAuth
- automatic Driver ACK to Operations Calendar sync
- Dispatch `Update + Cal`
- DSP pickup-to-real-JC customer billing
- Admin DSP billing-time correction
- customer/driver/admin in-app messaging
- invoice section order, final PDF layout, email sender, reminder, and payment controls
- customer and driver privacy boundaries

Customers must never receive driver payout, PayNow payout, internal notes, parser/debug details, Admin finance, or test/archive material. Drivers must never receive customer price, billing, invoice/payment, payout, PayNow, internal finance, or Admin notes.

## Exact files changed by the last application repair

The issued-invoice edit repair changed only:

- `app/api/admin-customer-invoices/route.ts`
- `app/customers/[customerId]/customer-invoice-folder-panel.tsx`
- `lib/customer-invoice-record-persistence.ts`
- `scripts/test-customer-folder-issued-invoice-edit-guard.mjs`
- `scripts/test-preactivation-verification-suite.mjs`
- `docs/current-implementation-ledger.md`

Do not reopen those files merely because they were recently changed. Reproduce and obtain approval for a new exact defect first.

## Next recommended action

Stop here until the owner gives one exact next task.

If the owner wants to prove the issued-invoice Save path in Production, first choose one exact test invoice and obtain explicit action-time approval for the exact revised lines and total. Save once, then verify the same invoice number, Paid/Unpaid state, regenerated PDF, customer view, and absence of an automatic email. Do not use a real customer invoice without explicit approval.

If the owner reports a new Email AI failure, first obtain the exact email subject/time and inspect the existing intake classification, cursor, queued/reviewed state, Dashboard source label, and device-push evidence read-only. Do not add another email lane or widen the mailbox/sender privacy boundary.
