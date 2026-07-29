# Codex Handoff — Email AI Identity Repair And OTIS Invoice Send

Date: 29 July 2026 (Asia/Singapore)

Project:

`/Users/sohyl/prestige-limo-ops`

## Owner scope lock

The owner approved only the established Email AI customer-identity, exact-customer Section 4 job correction, and existing invoice-send lane needed to invoice booking `10845`.

Preserve these instructions:

- Do not duplicate, redesign, move, or broaden any wired lane.
- Do not change the approved invoice layout, section order, PDF renderer, numbering, email sender, payment handling, or customer/driver privacy boundaries.
- Preserve the exact folder order:

  `1 · Customer profile & invoice prefix → 2 · Total invoices → 3 · Pending jobs for payment → 4 · Selected jobs invoice review → All booking history`

- Email AI must distinguish a new customer from one exact repeated verified customer. It must not infer CRM identity from matching display text, email, or phone.
- Admin must correct an incorrect or missing Email AI customer, company, booker, traveller, job detail, or displayed price through the established Section 4 job editor.
- The missing-traveller boundary was not removed globally. The existing Section 4 correction path now allows Admin to create and link only the one missing traveller beneath an already-selected verified company and booker.
- `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` is the existing CRM identity/contact write kill switch, not a second or duplicate lane. The repair reused its established gated route. Do not add another environment flag, CRM writer, route, or identity panel.
- The owner explicitly approved locking the Otis invoice prefix because the current app test data is planned for removal after 1 August 2026.
- That cleanup statement does not authorize a broad wipe. Any later deletion must target exact approved records and preserve all locked operational workflows.

## Mandatory startup for the next Codex

1. Read `/Users/sohyl/prestige-limo-ops/AGENTS.md` completely.
2. Read `/Users/sohyl/prestige-limo-ops/docs/current-implementation-ledger.md`, beginning with:
   - `Email AI Customer Identity Review And Section 4 Correction`
   - `Unified Invoice Item Description Format Repair`
   - `Owner-Approved Existing Invoice Lane Restoration`
   - `Admin Customer Invoice Prefix Settings Lane`
   - `Customer Folder Compact Selected-Job Invoice Review`
3. Read this handoff and the earlier untracked handoff:

   `docs/codex-handoff-2026-07-28-invoice-pending-jobs-inspection.md`

4. Run:

   ```sh
   git fetch origin --prune
   git status --short --branch
   git log --oneline -10
   ```

5. Search the established lane and run its focused guard before proposing or changing application code.
6. Do not resend `OTIS-0001`, create another invoice for booking `10845`, mark it paid, edit it, or delete its records without new exact action-time approval.
7. Do not treat the completed Production send as permission to modify another invoice, Email AI, CRM, booking, payment, messaging, Calendar, driver, or provider lane.

## Current Git and release state

After `git fetch origin --prune`:

- Current local branch:

  `codex/fix-email-ai-customer-identity`

- Local HEAD:

  `3f2c922e docs: record traveler invoice acceptance`

- Fetched `origin/main`:

  `138a3079 Merge pull request #150 from Prestigelimosg/codex/fix-dsp-invoice-description-format`

- Fetched `origin/staging`:

  `eb4c5b7a`

- At the start of handoff drafting, the current branch was three commits ahead of `origin/main`:
  - `fc473f1e fix: review Email AI customer identity before invoicing`
  - `6407b39c fix: unblock missing traveler invoice review`
  - `3f2c922e docs: record traveler invoice acceptance`
- Before this handoff was published, no fetched remote branch contained those three commits.
- The owner then explicitly approved pushing the existing branch with those three approved commits and this documentation handoff.
- Remote branch `origin/codex/fix-email-ai-customer-identity` now preserves that bounded history.
- The commits are still not merged into `origin/main` or `origin/staging`.
- Application commit `6407b39c`, which includes parent commit `fc473f1e`, was nevertheless directly deployed to Production and accepted there.
- Production deployment:

  `dpl_BvDtrvkpTvkGGtW2hNGGBhAXyhPm`

- Deployment state recorded in the ledger:

  `READY`

- This handoff is documentation only. Committing and pushing it does not change Production.
- Do not merge, redeploy, or rewrite these commits without the owner's exact approval.

## What was implemented

### 1. Email AI new/repeated/ambiguous customer review

Commit `fc473f1e` repaired the established Email AI review handoff in place:

- `Review in Dispatch` → `Create Job Card` compares parsed passenger and available company/booker evidence with the existing verified CRM read.
- `Repeated customer` appears only for one exact verified company-booker-traveller chain.
- `New customer` appears when no verified traveller name matches.
- `Ambiguous customer` appears when a name match does not resolve to one exact chain.
- A repeated match is applied only after Admin uses the existing `Use repeated customer` confirmation.
- Email AI intake provenance remains in the existing server-only `parser_source_reference`.
- No mailbox/header gate, classifier, OpenAI call, booking writer, CRM writer, table, schema, migration, or notification lane was duplicated.

### 2. Existing Section 4 exact-job editing

Commit `fc473f1e` added one inline `Edit job` action to the existing `4 · Selected jobs invoice review` table:

- It edits only the exact selected saved booking.
- It reuses the established guarded exact-booking PATCH.
- Admin can correct verified company, PA/booker, traveller, customer label, booker contact/email, passenger, pickup date/time, route, service, and displayed price.
- After a save, price returns to `Review required`; Admin must explicitly confirm the displayed price through the existing price-review handoff.
- It does not create, issue, email, regenerate, or mark an invoice paid.

### 3. Missing verified traveller correction

Commit `6407b39c` repaired only the remaining Section 4 missing-traveller case:

- Production reproduced booking `10845` with company `CODEX CUSTOMER REBOOKING TEST`, booker `William Test`, passenger `Otis JULY`, and proposed price SGD70.
- No matching verified Otis traveller existed, so Section 4 correctly failed closed instead of assigning `William Test Traveller`.
- The existing Section 4 `Save corrected job` action now creates only the missing traveller under the already-selected exact company and booker, links that traveller to the booker through the existing allowlisted PATCH, and saves the same booking.
- It does not create a company or booker.
- Mismatched ownership, missing company/booker, unsafe calls, disabled CRM writes, failed writes, and failed readback remain blocked.
- No second route, table, schema, migration, writer, identity panel, or invoice lane was added.

## What was deployed and Production-verified

### 1. Traveller identity repair

Signed-in owner-Mac Chrome on:

`https://app.prestigelimo.sg/customers/150`

verified:

- The existing Section 4 action created and linked only traveller `Otis JULY`.
- The traveller remained beneath company `CODEX CUSTOMER REBOOKING TEST` and booker `William Test`.
- Booking `10845` retained that exact verified chain after a full Production reload.
- The job retained the SGD70 proposal.
- The missing-traveller blocker was gone.
- Only the established explicit customer-price confirmation remained.
- No invoice, PDF, email, payment, customer contact, driver contact, or unrelated record was created during this identity acceptance.
- Browser warnings and errors were empty.

### 2. Owner-approved OTIS prefix lock

Through the existing Section 1 invoice-prefix control:

- The exact Otis invoice-prefix row initially showed `Status: Not set`.
- Admin saved prefix `OTIS`.
- Production then showed:
  - prefix `OTIS`;
  - `Status: Locked`;
  - `Last number: None` before invoice creation.
- No invoice number was consumed by locking the prefix alone.
- No code, environment setting, or second numbering lane was added.

### 3. Owner-approved invoice creation and one email send

Using only the established Section 3 selection, Section 4 review, invoice Edit field, recipient control, and Send action:

- Exact booking/reference: `10845`
- Service: TRF
- Traveller/Bill To: `Otis JULY`
- Customer/company: `CODEX CUSTOMER REBOOKING TEST`
- Confirmed amount: SGD70
- Recipient checked in the UI: `willsglimo@gmail.com`
- Card payment remained unchecked.
- The initial preview incorrectly ended the route with `NIL`.
- Admin corrected only the outgoing invoice line through the existing invoice Edit field to:

  `CITY TRANSFER | 30 JUL 2026, 0100 | ORCHARD HOTEL SINGAPORE > CODEX AUTO PREP TEST DROPOFF - CHANGI AIRPORT | ALPHARD | OTIS JULY | REF 10845`

- The amount remained SGD70.
- The established Send action was confirmed once.
- Production then showed one stored invoice:
  - invoice number `OTIS-0001`;
  - issue date `29 Jul 2026`;
  - due date `05 Aug 2026`;
  - total SGD70;
  - balance SGD70;
  - list status `Pending`;
  - stored document status `Unpaid`;
  - reference `10845`;
  - the corrected non-`NIL` line description;
  - Email action disabled as `Emailed`.
- Final Production feedback was:

  `Create Invoice OTIS-0001 emailed to willsglimo@gmail.com.`

- Browser warnings and errors were empty.
- The completed Production page was left open on the owner's Mac as a deliverable.

This proves that the app created the stored invoice and recorded the one email action as successful. It does not independently prove recipient-inbox delivery.

## Failures and recovery during the invoice send

Do not hide or repeat these:

1. The first Chrome Send interaction became stuck on the native confirmation dialog and timed out.
   - Vercel request evidence showed no invoice-create POST and no invoice-email POST.
   - No invoice or email was created by that failed interaction.
2. A clean retry reached the existing invoice-create route but returned HTTP 409 because the traveller invoice prefix had not yet been set.
   - The UI still showed no invoice and no provider send.
3. The owner then explicitly approved locking Otis.
4. After `OTIS` was locked through the existing Section 1 control, one final Send action succeeded and created `OTIS-0001`.

Do not retry either failed attempt. The successful invoice now exists.

## Test and review evidence

The ledger records these checks for the two application commits:

- Focused guard:

  `scripts/test-email-ai-customer-identity-section-four-guard.mjs`

- Missing-traveller link boundary protection:

  `scripts/test-admin-legacy-traveler-link-patch-boundary-guard.mjs`

- Focused Email AI, CRM identity persistence/selectors, invoice handoff/separation/amendment, stored PDF/portal, TypeScript, and Next.js Production build checks passed locally.
- Local visible browser acceptance on `/customers/ubs` used an intercepted browser-only fixture and performed no real save.
- Production owner-Mac Chrome verified the exact real downstream correction on booking `10845`.
- Production owner-Mac Chrome then verified the exact prefix lock, invoice creation, corrected stored line, status, amount, recipient action, and clean browser console.

Do not claim that a real incoming Email AI message exercised every new/repeated/ambiguous classification branch in Production. The Production acceptance covered the exact saved Email AI booking and downstream identity/invoice workflow.

## What was not done

- The three approved Email AI/Section 4 commits and this handoff were pushed only to `origin/codex/fix-email-ai-customer-identity`.
- They were not merged into `origin/main` or `origin/staging`.
- No PR was created for these three commits.
- No additional deployment was performed after the successful invoice send; the send was a Production data/provider action, not an application deployment.
- No second invoice was created for booking `10845`.
- `OTIS-0001` was not resent, reminded, edited after send, marked paid, marked unpaid again, voided, credited, or deleted.
- Recipient inbox delivery and Resend provider-event delivery were not separately inspected. The authoritative evidence available here is the stored Production invoice row, disabled `Emailed` action, and success feedback.
- The source booking record was not edited during the final invoice-line correction. Only the outgoing/stored invoice description was corrected through the existing invoice Edit field.
- No card-payment action, Stripe action, charge, refund, payout, PayNow action, or accounting write occurred.
- No customer or driver message was sent outside the one approved invoice email.
- No broad test-data cleanup was performed. Booking `10845`, traveller `Otis JULY`, locked prefix `OTIS`, and invoice `OTIS-0001` still exist unless a later exact read proves otherwise.
- The owner's statement that app test data will be removed after 1 August is not itself an exact deletion plan or approval for a broad wipe.
- No real incoming Email AI email was sent merely to test the new/repeated/ambiguous customer classifier.
- End-to-end GroundBooker forwarding from exact sender `transzend@groundbooker.com`, original recipient `info@prestigelimo.sg`, into private mailbox `booking@prestigelimo.sg` was not verified in this pass.
- No blanket `info@` forwarding rule was added or approved.
- No change was made to `PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED` during the prefix lock or invoice send.
- No invoice layout, PDF layout, section order, recipient control, numbering algorithm, sender, payment workflow, portal consumer, schema, or migration was changed by the final send.

## Existing files that must not be mistaken for this handoff's work

At handoff creation, the worktree already contained user-owned untracked files:

- `docs/codex-handoff-2026-07-28-invoice-pending-jobs-inspection.md`
- `tmp/pdfs/JBT-0001-final.pdf`
- `tmp/pdfs/JBT-0001-final.png`

The owner separately approved committing and pushing this new handoff:

- `docs/codex-handoff-2026-07-29-email-ai-otis-invoice-send.md`

It is the only formerly untracked file included in the handoff commit. Do not delete, overwrite, stage, or commit the unrelated untracked PDF evidence or earlier handoff automatically.

## Wired lanes left untouched

- Invoice section order and approved customer-folder layout
- Issued-invoice in-place Edit lane
- Pending-job selection and price confirmation
- Stored PDF renderer and customer portal invoice consumer
- Invoice numbering and prefix algorithm
- Email idempotency, reminder, payment-status, and thank-you actions
- GroundBooker exact-sender/private-mailbox gate
- Email AI classifier/provider/mailbox intake beyond the narrow identity review handoff
- Dispatch booking persistence outside the exact verified identity fields
- CRM rates, pricing precedence, driver payout, PayNow, and internal finance
- Dashboard Driver Reports and explicit `Admin confirm completed`
- Pending Driver ACK queue and private Driver Job Links
- Driver personal Google Calendar and OAuth
- automatic Driver ACK to Operations Calendar sync
- Dispatch `Update + Cal`
- customer/driver/admin in-app messaging
- customer portal authentication and booking requests
- GPS/live location, OTS photo, providers, schemas, and migrations

## Exact safe continuation

The next Codex should stop until the owner gives one exact next task.

If asked about `OTIS-0001`:

1. Read it first through the existing exact-customer invoice lane.
2. Treat `OTIS-0001` as already created and emailed once.
3. Do not create a replacement invoice or resend it.
4. Obtain new exact action-time approval before any reminder, resend, same-record edit, payment-status change, credit note, deletion, or cleanup.

If asked to clean test data after 1 August:

1. Produce an exact record-by-record deletion proposal first.
2. Include booking/customer/company/booker/traveller/invoice/prefix dependencies and any portal or provider consequences.
3. Exclude every real or uncertain record.
4. Obtain explicit approval for the exact targets immediately before deletion.
5. Never run a broad table wipe, migration rollback, recursive delete, or workflow reset.

If asked to merge the pushed branch:

1. Reconcile current `origin/main` and the direct Production deployment first.
2. Run the focused guards and staged-app guard on the exact diff.
3. Do not redeploy merely because the application commit is absent from `main`; Production already ran `6407b39c`.
4. The push is complete. Obtain separate exact approval for PR creation, merge, and any deployment.

## Handoff document status

- Documentation only.
- No application code was changed while drafting it.
- No Production record, provider, environment, schema, or deployment was changed while drafting it.
- Committed on `codex/fix-email-ai-customer-identity`.
- Pushed to `origin/codex/fix-email-ai-customer-identity`.
- Unmerged.
- Undeployed.
