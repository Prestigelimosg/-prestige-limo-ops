<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Mandatory startup and no-duplicate workflow

Before proposing, testing, or editing a feature:

1. Read `docs/current-implementation-ledger.md` as the current implementation source of truth.
2. Run `git status --short --branch` and `git log --oneline -10` to identify the branch, uncommitted work, and recently completed fixes.
3. Search the existing app, routes, docs, and focused guard scripts for the requested workflow before proposing a new implementation.
4. Run the existing focused guard before changing the workflow. Treat documented behavior with a passing guard as already implemented unless the exact workflow is reproduced as broken in the approved runtime surface.
5. Do not add a second lane, panel, route, helper, button, or write path for an existing workflow. Repair the established lane in place and preserve its wired consumers.
6. Record every approved fix in the implementation ledger and protect it with a focused regression guard so later agents can distinguish completed work from a newly reproduced failure.
7. Before committing an application change, stage the bounded files and run `npm run guard:staged-app-change`. Do not commit until the staged application change includes both `docs/current-implementation-ledger.md` and an appropriate focused `scripts/test-*.mjs` guard update.

Follow TEST → FIX → REVIEW → COMMIT in one bounded pass. Do not claim runtime behavior works from source inspection or a passing guard alone.

# Verified workflow preservation lock

Everything recorded as completed, deployed, live, or verified in `docs/current-implementation-ledger.md` is an established workflow contract. Do not remove, rename, reorganize, broaden, redesign, reset, reimplement, or “improve” that behavior unless the exact workflow is first reproduced as broken in the approved runtime surface and the owner approves the bounded repair. If no defect is reproduced, make no application change.

Any approved repair must stay inside the existing lane and preserve its established UI location, controls, routes, API and persistence boundaries, consumers, privacy exclusions, and focused regression guards. Do not use an unrelated request as permission to alter another completed workflow.

The Dashboard `Today's Jobs` Driver Reports completion workflow is specifically locked: a persisted driver `Job Completed`/JC report remains visible evidence and must not automatically close the card, mark the saved booking completed, create a Completed / History fallback row, or enable archived-job deletion. Only the existing explicit `Admin confirm completed` action may move the saved booking to Completed / History. The card must remain visible and refreshable with OTW, OTS, POB, and JC evidence until that admin action succeeds. Preserve `scripts/test-admin-active-job-confirm-completed-guard.mjs`, `scripts/test-driver-completed-history-grouping-guard.mjs`, and the corresponding `scripts/test-booking-ui-browser.mjs` coverage.

The Driver Calendar system is a separate established workflow. Do not change its action, OAuth, event, credential, route, or UI behavior while diagnosing or repairing Driver Reports or admin completion.

# Owner-locked Pending Driver ACK Queue — do not duplicate

The Dispatch `Pending for Driver ACK Queue` replaces only the former selected-booking `Waiting for driver` header pill. Preserve one queue directly below the complete existing Dispatch Driver Job Link section. Driver Reports remains unchanged inside the Driver Job Link section above the queue. Do not restore the old pill or add another queue, acknowledgement panel, API, table, notification sender, push lane, route, or polling store.

Queue each current non-terminal operational booking only when its exact newest active Driver Job Link is not acknowledged. The queue must not require or display a known driver because the approved private-link acknowledgement workflow may collect the recipient's details after issuance. Key and clear rows by exact booking reference plus newest link record, never by driver ID, driver name, contact, plate, or Google account. One driver may have any number of different pending bookings. An acknowledgement on an older link must never clear a newer amendment row.

Preserve exact safe revision labels: no previous link is `New`, the same safe job-card revision is `Reissued`, a changed safe job-card revision is `Amendment`, and incomplete historic evidence is `Issued` rather than guessed. `Link issued` means created inside the app and must never imply external WhatsApp, Telegram, Email, or SMS delivery.

Do not auto-revoke or expire old Driver Job Links merely when a new or amended link is issued. The established explicit admin `Revoke Link` action remains the only revoke path. The owner-approved replacement-driver exception happens only after a newer link for the same booking is successfully acknowledged by a different verified driver: the existing acknowledgement persistence path expires only older still-active links bound to a different driver, without setting `revoked_at`, so the replaced driver cannot keep using the old token. An unacknowledged new link, a same-driver reissue, a newer link, another booking, and already expired/revoked links must remain untouched. Preserve the separate locked Calendar action that updates the same booking event.

The whole queue may pulse only while pending count is greater than zero and must support all pending rows without a fixed two-or-three-item cap. Keep the established collapsed Driver Reports disclosure, acknowledgement/OTW/OTS/POB/Job Completed/OTS-photo evidence, Dashboard Active Assigned Jobs, Live Dispatch, explicit `Admin confirm completed`, and Driver Calendar lane unchanged. Before any approved repair, run `scripts/test-pending-driver-ack-queue-guard.mjs`, `scripts/test-admin-driver-job-link-api-contract.mjs`, `scripts/test-admin-active-job-confirm-completed-guard.mjs`, and `scripts/test-driver-job-calendar-download-guard.mjs`.

Each pending row has one owner-approved `Close` control. `Close` dismisses only that exact newest-link alert from the current admin browser and must never revoke, expire, acknowledge, mutate, or disable the Driver Job Link or booking. The exact link remains usable by its recipient. Dismissal is stored locally by exact Driver Job Link ID so it survives refresh on that admin browser; never key it by booking reference or driver identity. A later new, amended, or reissued link has a different link ID and must appear as a fresh pending alert.

# Owner-locked Driver Calendar workflow — do not modify

The entire established personal Driver Calendar workflow is owner-locked. Do not remove, rename, rearrange, redesign, duplicate, replace, broaden, or “simplify” its acknowledgement gate, action, Google OAuth connection, encrypted credential reuse, event identity, update behavior, reporting shortcut, routes, persistence, UI, or privacy boundaries unless the owner explicitly requests a Calendar-specific change, the exact defect is first reproduced in the approved runtime surface, and the owner approves one bounded in-place repair.

Preserve this exact workflow:

- First job: `Save & Acknowledge Job` → `Add / Update Calendar` → approve Google once → return to the same private Driver Job page with the event saved.
- Future jobs: `Save & Acknowledge Job` → `Add / Update Calendar` with no repeated Google consent; reuse the same encrypted server-only Google connection for that verified driver.
- Amendments: acknowledge the amended private link → `Add / Update Calendar` → update the same event without a duplicate. The driver must not reconnect Google, delete the old event, or perform another approval under normal valid-credential operation.
- Reauthorization may occur only when the driver removes Prestige permission, changes Google account, Google permanently rejects the saved credential, or the stored connection is intentionally reset. Transient provider failures must not erase a usable connection or force consent.
- The driver enters/confirms name, contact, plate, and vehicle on the existing private page and never sees or types an internal driver ID. `Save & Acknowledge Job` is the one existing handoff that must bind the same hidden driver ID to the exact booking and link before Calendar runs. Reuse the booking's verified assignment first; only when both booking and link lack one may the acknowledgement reuse one exact-contact safe driver record or create one record containing only those four safe fields plus `availability_status`. Do not add an ID field, profile step, duplicate acknowledgement, or second Calendar lane.

One verified driver may have any number of different jobs. Calendar connection identity may be bound to the verified driver record, but event identity must remain the verified driver ID plus the exact stable booking reference. Never use driver name, phone, plate, acknowledgement text, or driver ID alone as event identity. Each different booking must create its own event; every amendment retaining the same booking reference must update only that event. Do not turn a booking amendment into a new booking reference merely to drive Calendar behavior.

The event must retain the latest private `Open Driver Job` link in its description and Google event source so opening the calendar event/title leads the driver back to the established OTW, OTS, POB, and Job Completed reporting page. Preserve one personal event per exact driver and booking, the current `Calendar saved`/`Update needed` states, no attendees, `sendUpdates=none`, and the separate admin Operations Calendar lane. The admin event and personal driver event are different established consumers and must not be mistaken for a personal-event duplicate.

Do not replace this workflow with `.ics`, a forced download, a Google event-template link, a subscription feed, an attendee invitation, or an admin/service-account personal-calendar substitute. Do not add another Calendar button, provider, connection table, credential lane, reporting page, or event-ID scheme. Google verification work may remove the unverified warning and 100-new-account cap for the approved scope, but it must not change this workflow or be bypassed by duplicating OAuth projects.

Before any approved Driver Calendar repair, read `docs/current-implementation-ledger.md` sections `Driver Personal Google Calendar Connection` and `Driver Calendar Credential Recovery And Callback Feedback`, then run `scripts/test-driver-job-calendar-download-guard.mjs` and `scripts/test-driver-job-page-browser.mjs`. If no Calendar defect is reproduced and specifically approved, make no Driver Calendar application change.

# Owner-locked automatic Driver ACK to Operations Calendar sync — do not break

The existing token-verified driver `Save & Acknowledge Job` must automatically continue its server-only, best-effort handoff after the exact booking and link have successfully persisted the driver's safe name, contact, plate, and vehicle. That handoff must re-read the exact booking and upsert the same deterministic Operations Calendar event through the established service-account writer. Admin must not normally click `Update + Cal` merely to add or refresh driver name, contact, plate, or vehicle.

Preserve the same-event booking-reference identity, plate-bearing title, safe Driver and Vehicle description lines, existing schedule/location/route/status content, popup reminders, no attendees, and `sendUpdates=none`. The handoff must never create a duplicate event, move Calendar ownership into the public Driver Job route, expose provider state, or roll back/block a successfully saved acknowledgement when Google Calendar is unavailable.

The existing admin `Update + Cal` action remains available for booking amendments, explicit recovery, or events created before this automatic handoff existed. Do not remove it, repurpose it as a required second step after acknowledgement, or use it to duplicate the automatic acknowledgement handoff. The separate personal Driver Calendar, its `Add / Update Calendar` action, OAuth connection, driver-plus-booking event identity, and private reporting shortcut remain unchanged.

Before any approved repair to this automatic Operations Calendar handoff, reproduce the exact failure in the approved runtime surface, read `docs/current-implementation-ledger.md` section `Verified Driver Details To Operations Calendar Repair`, and run `scripts/test-admin-booking-google-calendar-sync-api-contract.mjs`, `scripts/test-driver-job-details-admin-sync-guard.mjs`, `scripts/test-driver-job-status-persistence-api-contract.mjs`, and `scripts/test-driver-job-calendar-download-guard.mjs`. If the exact defect is not reproduced and approved, make no application change.

# Owner-locked DSP customer billing calculation — do not break

For DSP customer billing, elapsed time starts at the saved canonical booking pickup and ends only at the real persisted Driver `Job Completed`/JC timestamp for that exact booking. The calculation must never use Driver OTS, POB, scheduled DSP end, current time, booking status, or admin completion as the customer billing start/end or as an inferred JC.

Preserve the established two-hour minimum, 15-minute grace whole-hour rule, verified traveler/company/Prestige rate precedence, and existing customer surcharges. The Production acceptance for booking `10846` is the locked reference example: 13:00 booking pickup to 19:14 persisted JC is `374` minutes, which becomes `6` billable hours at SGD65/hour and therefore SGD390 before any separately persisted surcharge.

For DSP customer billing, apply the configured customer midnight surcharge exactly once whenever the verified billing interval overlaps the established Singapore midnight window from `23:00` through `06:59`, even when the saved pickup or corrected billing start is earlier and the service continues across midnight. A verified interval wholly outside that window receives no midnight surcharge. Use the same authoritative saved-pickup-to-JC or latest Admin-correction start/end pair that produced the billed duration; never infer midnight exposure from scheduled end, current time, booking status, invoice text, or another job. Booking `10894` is the locked crossing-midnight reference: corrected `21 Aug 2026 18:35 SGT` to `22 Aug 2026 03:19 SGT` is `524` minutes, `9` billable hours at SGD65/hour = SGD585, plus one configured SGD15 midnight surcharge = SGD600 before any other separately persisted surcharge.

The exact-customer folder result must remain a temporary review proposal until Admin confirms it through the existing controls. The app must never automatically save a customer price, select a job, create or issue an invoice, send an email, or record a payment from this calculation. Missing or invalid pickup, missing or invalid persisted JC, JC at/before pickup, implausible duration, or missing rate evidence must continue failing visibly to `Review required`; no amount or timestamp may be guessed.

Do not change or duplicate the existing customer folder, invoice preparation, invoice/PDF/email/payment, Driver Report, admin completion, personal Driver Calendar, Operations Calendar, payout, PayNow, schema, or provider lanes while preserving this calculation. Before any approved DSP customer billing repair, reproduce the exact failure in the approved runtime surface, read the implementation-ledger sections `DSP Customer Billing Booking-Time To JC Repair`, `Exact-Customer Folder DSP Booking-Time To JC Repair`, and `DSP Persisted JC Billing-Evidence Fallback Repair`, then run `scripts/test-customer-folder-price-review-guard.mjs`, `scripts/test-admin-dispatch-dsp-scheduled-end-invoice-wiring-guard.mjs`, `scripts/test-admin-driver-job-dsp-actual-time-read-api-contract.mjs`, and the locked invoice lifecycle guards. If the exact defect is not reproduced and approved, make no application change.

# Owner-locked Driver Reports evidence during Live Location cleanup

Live Dispatch GPS cleanup and Driver Reports evidence are separate workflows. Automatic or manual stale-pin cleanup may delete only exact `driver_live_location_latest_positions` rows and may change only the existing Live Dispatch Map marker/count presentation. It must never delete or alter `driver_job_status_events`, OTW/OTS/POB/Job Completed timestamps, the visible Driver Reports card, the saved booking completion state, or Completed / History membership.

A driver `Job Completed` report may remove the temporary GPS marker, but the report card and all timestamp evidence must remain visible and refreshable until the owner uses the existing explicit `Admin confirm completed` action. Preserve `scripts/test-admin-active-job-confirm-completed-guard.mjs`, `scripts/test-driver-completed-history-grouping-guard.mjs`, `scripts/test-driver-live-location-assigned-active-eligibility-guard.mjs`, and the corresponding booking UI browser coverage.

# Admin-Editable DSP Billing Time Correction — do not duplicate

The automatic DSP customer billing interval remains saved booking pickup → persisted Driver JC. Admin may correct both start and end only inside the existing exact-customer `Jobs not billed yet` exact-job Edit box. Do not add this control to Dispatch Driver Reports, a second customer panel, another billing or invoice page, or another route.

Corrections are append-only in the existing server-only DSP actual-time event lane and require a bounded safe reason. The latest valid Admin correction supersedes only the billing interval. Never update or delete the booking pickup, scheduled end, driver status events, earlier DSP timing events, or original Driver Reports evidence. Without a correction, billing continues using booking pickup → Driver JC. With a correction, every established customer billing consumer uses corrected start → corrected end and the same two-hour minimum, 15-minute grace whole-hour rule, verified rate precedence, and surcharges.

Saving the correction may recalculate only the visible in-memory proposal for that exact unbilled job. After a successful correction save, the same existing `Customer price (SGD)` input must refresh to that exact recalculated proposal so Admin cannot confirm the stale pre-correction draft. It must not automatically save a final price, select a job, create/issue/email an invoice or PDF, mark payment, write payout or PayNow, update Calendar, acknowledge/complete a job, or contact any customer or driver. Preserve `scripts/test-customer-folder-dsp-billing-time-correction-guard.mjs`, `scripts/test-admin-driver-job-dsp-actual-time-read-api-contract.mjs`, the customer-folder pricing guards, and the original Driver Reports evidence guards.

The exact-customer correction POST may rely on the configured verified Admin/Dispatcher server session without exposing its session token to browser JavaScript, but only after the existing admin purpose and same-origin `/customers` referer checks pass. Do not extend this exception to another route, method, origin, public/customer/driver surface, or unverified role.

# Linked Pending Jobs And Unpaid Invoice Amendment Refresh — do not duplicate

`3 · Pending jobs for payment` and `2 · Total invoices` are one linked exact-customer billing workflow. After Admin explicitly saves a reviewed amended-job price, the existing invoice PATCH lane may refresh only one single matching unpaid issued invoice containing that exact internal or public booking reference. It must keep the same invoice number, issue/due dates, Unpaid status, customer/traveller scope, unrelated line items, card-payment wording, and established layout while updating the exact line, total, balance, stored PDF, and email status for the regenerated document.

Paid invoices, quotations, credit notes, drafts, multiple matches, ambiguous or missing line matches, mismatched customer/booking ownership, stale concurrent amounts, invalid input, and cross-origin/public/customer/driver callers must fail closed without a write. If no matching unpaid invoice exists, no invoice is created automatically; the reviewed job continues through the existing invoice handoff. Never add a second invoice, route, button, panel, workbench, renderer, numbering scheme, email sender, payment action, schema, or migration for this link. Preserve `scripts/test-customer-folder-amended-unpaid-invoice-link-guard.mjs` and all locked invoice/DSP/privacy guards.

# Exact-Customer Issued-Invoice Eligibility Repair — do not duplicate

The existing exact-customer `Jobs not billed yet` lane must reconcile saved bookings with the existing guarded invoice read before offering selection or invoice preparation. Exclude a booking only when one exact same-customer stored record has document type `invoice`, document state `issued`, and carries that exact internal or public booking reference in the invoice reference or a line-item `bookingReference`. Paid and unpaid issued invoices both count as billed; quotations, credit notes, drafts, customer names, passenger names, descriptions, amounts, statuses, invoice numbers, pickup details, routes, and services never establish booking coverage.

If issued-invoice coverage cannot be read and verified, this lane must fail closed with a visible explanation and no invoice-eligible rows. Preserve the existing authoritative server duplicate-invoice `409` guard, approved section order and controls, amended unpaid-invoice refresh, invoice lifecycle/layout/PDF/email/payment/customer-portal consumers, and all customer/driver privacy boundaries. Do not add or move a route, helper, panel, button, table, workbench, writer, renderer, provider, schema, migration, or second invoice lane. Preserve `scripts/test-customer-folder-issued-invoice-eligibility-guard.mjs`, `scripts/test-customer-folder-amended-unpaid-invoice-link-guard.mjs`, and the locked invoice lifecycle guards.

# Owner-locked invoice workflow and final layout — do not modify

The entire established customer billing and invoice system is owner-locked. Do not remove, rename, rearrange, redesign, collapse, expand, simplify, duplicate, replace, or otherwise modify its workflow, layout, controls, routes, APIs, persistence, PDF renderer, email/download paths, payment-status handling, invoice numbering, customer/company identity scope, Company Profile inputs, or established consumers unless the owner explicitly requests an invoice-specific change, the exact invoice defect is first reproduced in the approved runtime surface, and the owner approves that bounded repair. An unrelated feature request, including AI or communications work, is never permission to change the invoice system.

Preserve the existing `/customers` Customer Billing Overview, exact-customer folder, saved-job selection, `Customer invoice layout` review, established Create Invoice workbench, preview, issue, download, email, Paid/Unpaid regeneration, and customer portal invoice consumers in their current lanes. Do not add a second invoice page, workbench, preview, renderer, route, table, helper, control, or write path.

The owner explicitly confirmed that the whole invoice system shown on the Mac at the existing exact-customer folder is correct. Treat that visible system as the approved baseline: `1 · Customer profile & invoice prefix` → `2 · Total invoices` → `3 · Pending jobs for payment` → `4 · Selected jobs invoice review` → `All booking history`. Preserve those sections, their order, their established controls, and their handoffs. The local `/customers/ubs` demonstration only identified the approved existing layout; do not hardcode UBS or expose mock/test records to customers.

The stored/customer PDF lower order remains locked as `sign-off → fully visible Bank Details → Notes → Terms & Conditions`. Notes must remain immediately below the complete Bank Details block, never above the sign-off or bank block. In the admin selected-job invoice review only, keep the sign-off visible, the closed `Bank Details` disclosure immediately below it, and one responsive bottom row containing the closed `Notes` and `Terms & Conditions` disclosures beside each other. Reuse those three existing headings and never add separate links, buttons, panels, routes, or duplicate content. The stored/customer PDF must continue printing all three sections fully, with Bank Details visible and no interactive disclosure. Preserve the approved logo, Company Profile content, line items, quantities, rates, totals, recipient controls, card-payment wording controls, and all current issue/download/email/payment-status behavior without rearranging any other layout.

The existing invoice Email action must retain one Resend request and deterministic duplicate protection. For a normal invoice send, its idempotency key must include a bounded hash of the exact outgoing provider payload as well as invoice and sorted-recipient identity: identical retries remain deduplicated, while an explicitly amended stored PDF receives a new key and can be sent without Resend's different-payload conflict. Do not remove idempotency, add a second sender or retry lane, expose the payload/hash, or change reminder and payment-thank-you key behavior when repairing this contract. Preserve `scripts/test-customer-invoice-amended-email-idempotency-guard.mjs`.

Before any approved invoice repair, read `docs/current-implementation-ledger.md` section `Owner-Approved Final Invoice Layout Restoration` and run `scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs`, `scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs`, and `scripts/test-customer-billing-document-lifecycle-guard.mjs`. If no invoice defect is reproduced and specifically approved, make no invoice application change.

# Unified Invoice Item Description Format Repair — owner-locked

Apply the same format to MNG, DEP, TRF, and DSP: one continuous uppercase, pipe-separated item description with compact 24-hour time. MNG is `ARRIVAL | DATE, TIME | FLIGHT | DROP-OFF | VEHICLE | PASSENGER | REF`; DEP is `DEPARTURE | DATE, TIME | FLIGHT | PICKUP | VEHICLE | PASSENGER | REF`; TRF is `CITY TRANSFER | DATE, TIME | PICKUP > DROP-OFF | VEHICLE | PASSENGER | REF`; and DSP is `HOURLY | DATE, START - END | VEHICLE | PASSENGER | REF`. A single time displays as `1200`; a DSP interval displays as `1200 - 2114`; `1200 TO 2114` is accepted Admin input and saves in the canonical dash form. Blank fields remain `NIL`. Vehicle code `AVF` and the exact legacy customer display `ALPHARD / VELLFIRE` render as `ALPHARD`.

Keep this format in the existing shared invoice line-description formatter used by the established pending-job selection, selected-jobs review, stored invoice, PDF/download, email attachment, and customer portal consumers. Section 2 may normalize the same complete format only for an exact booking-reference-linked DSP line when Admin explicitly saves an issued-invoice edit. Do not add another formatter, description lane, field, page, panel, route, writer, renderer, or migration. Preserve `scripts/test-customer-invoice-line-description-format.mjs`, `scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs`, and `scripts/test-customer-folder-issued-invoice-dsp-calculation-guard.mjs`.

# Owner-locked Issued-Invoice DSP Dispute Calculation Repair

Section 2 `Total invoices` is the established dispute-correction lane for an invoice that already exists or was already sent. Keep its existing selected-invoice table and in-place Edit control exactly where they are. For one exact booking-linked DSP line, changing the line's start and end time must recalculate the draft line amount through the established verified customer-rate precedence, DSP two-hour minimum, 15-minute grace rule, and existing customer surcharges before the same invoice is saved. The canonical disputed time range is `1200 - 2114`; `1200 TO 2114` is accepted as equivalent Admin input. Preserve the owner-locked item field order and uppercase layout.

This repair does not move an already invoiced job back into Section 3 or make it eligible for a duplicate invoice. Section 3 remains the established unbilled-job selection, exact-job Edit, DSP timing-correction, customer-price review, and invoice-preparation lane. Section 2 recalculation may read only the exact linked saved booking and existing verified rate setup; it must not update the saved booking, append a DSP correction event, alter Driver Reports evidence, or treat edited invoice text as a Driver JC record.

Saving keeps the same invoice number, issue/due dates, customer, payment status, line count, approved invoice/PDF layout, and existing customer-portal consumers. It regenerates the same stored PDF and resets only the normal invoice email-delivery state because the document changed. It must not automatically send or resend email, send a reminder, mark Paid/Unpaid, change payment method, create another invoice, charge a card, or touch payment, payout, PayNow, booking, Driver, Calendar, messaging, GPS, provider, schema, migration, or environment lanes. Preserve `scripts/test-customer-folder-issued-invoice-dsp-calculation-guard.mjs` and the existing issued-invoice edit, line-description, PDF/portal, lifecycle, email-idempotency, reminder/payment, DSP, and privacy guards.

# Pre-operation test-data permission

Until the owner explicitly declares that real operations have started, existing booking, driver, and customer records may be reused as test data because the owner will fully clean those records before live operations. Prefer reusing an existing test record over creating a duplicate, and keep every test scoped to the exact workflow under review.

This test-data permission does not authorize external sends or contacts without explicit action-time approval. It also does not authorize payment, payout, PayNow, invoice, billing, GPS, provider, authentication, environment, or Supabase configuration changes without the owner's specific approval. Customer and driver privacy boundaries remain mandatory, and testing must stop and report immediately when an issue is found.

# Verified PA identity implementation checkpoint

The operational admin booking persistence lane now supports nullable verified `company_id`, `booker_id`, and `traveler_id` fields already present in the established `bookings` schema. Do not recreate this persistence work, add another booking lane, or derive these IDs from names, email, phone, parser output, or display labels. The remaining work is explicit CRM selection and PA authentication/authorization on top of this existing identity persistence foundation.

Dispatch now has explicit verified company, PA/booker, and traveler selectors in the existing Booking Details section. They reuse the established rate-setup CRM list and operational save lane. Do not add a duplicate identity panel or infer selection from parser/display text.

The established allowlisted admin legacy-data route accepts PATCH from a verified same-origin admin/dispatcher server session so exact traveler `booker_id` links can be maintained. Do not broaden this exception to POST or DELETE, public/cross-origin callers, unsupported tables, or unsafe fields.

Customer access accounts have nullable verified `company_id` and unique non-null `booker_id` foundations. The legacy unique customer-account-reference index must remain until the existing `Copy + App Link` upsert is safely converted to booker identity. Never use company/account reference alone to authorize customer invoices or PA-private bookings.

Customer saved-booking reads support an additive verified `company_id + booker_id` scope. Both IDs are mandatory together; a partial pair must fail closed. Legacy sessions without either ID continue using the existing `customer_id` scope.

Reference-bearing customer sessions hydrate verified company/booker IDs only from the validated active `customer_access_accounts` row. Do not trust client-supplied identity IDs.

Customer invoice records have an additive nullable `booker_id` schema foundation. Do not enable customer booker-scoped invoice reads until invoice issuance persists verified `booker_id`; company/customer identity alone is never sufficient for PA-private invoices.

Admin invoice preparation carries nullable verified company/booker IDs from the exact saved booking. Do not infer these IDs from billing labels or account-scope display text.

Customer invoice list/PDF reads require validated access-account `customer_id + booker_id` whenever the active account has a booker. Never accept customer-supplied booker scope or fall back to company-wide invoices for a verified PA.

# Completed customer/driver messaging lane — do not duplicate

The customer/driver/admin in-app messaging workflow is implemented and live in the established lane. Before changing it, read `docs/current-implementation-ledger.md` sections `Single-Booking Customer/Driver Quick-Reply Production Activation`, `Today’s Jobs Admin-to-Driver Messages`, `Driver-to-Customer One-Tap Replies`, `Customer-to-Driver One-Tap Replies`, and `Today’s Jobs Unified Message History`, then run the focused guards named there.

Do not add another chat page, message panel, route, table, composer, notification format, customer session lane, driver-token lane, provider send, or polling path. Repair these established consumers in place:

- Admin: the existing `Messages` card inside Dashboard `Today’s Jobs`.
- Driver: the existing token-scoped Driver Job page and `/api/driver-job/[token]/quick-replies` plus token-scoped notification read.
- Customer: the existing authenticated My Bookings detail and `/api/customer-driver-quick-replies` plus `customer_app` notification read.
- Persistence/admin visibility: the existing `customer_driver_app_notification_outbox` and `/api/admin-customer-driver-app-notifications`.

Privacy remains mandatory: customers must never see Admin ↔ Driver messages; admin must see Customer ↔ Driver messages; customer reads remain `customer_app` only; driver reads remain `driver_app` only. Customer/driver replies stay fixed-template, exact-booking scoped, authenticated/link-bound, and blocked after POB/completion. No Email, WhatsApp, SMS, Telegram, or other external provider send is part of this lane.
