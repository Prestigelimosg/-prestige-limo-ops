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

Do not auto-revoke old Driver Job Links when a new or amended link is issued. Only the established explicit admin `Revoke Link` action may revoke a link. Preserve the owner workflow in which admin resends an amended active link, the driver acknowledges it, and the separate locked Calendar action updates the same booking event.

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

# Owner-locked Driver Reports evidence during Live Location cleanup

Live Dispatch GPS cleanup and Driver Reports evidence are separate workflows. Automatic or manual stale-pin cleanup may delete only exact `driver_live_location_latest_positions` rows and may change only the existing Live Dispatch Map marker/count presentation. It must never delete or alter `driver_job_status_events`, OTW/OTS/POB/Job Completed timestamps, the visible Driver Reports card, the saved booking completion state, or Completed / History membership.

A driver `Job Completed` report may remove the temporary GPS marker, but the report card and all timestamp evidence must remain visible and refreshable until the owner uses the existing explicit `Admin confirm completed` action. Preserve `scripts/test-admin-active-job-confirm-completed-guard.mjs`, `scripts/test-driver-completed-history-grouping-guard.mjs`, `scripts/test-driver-live-location-assigned-active-eligibility-guard.mjs`, and the corresponding booking UI browser coverage.

# Owner-locked invoice workflow and final layout — do not modify

The entire established customer billing and invoice system is owner-locked. Do not remove, rename, rearrange, redesign, collapse, expand, simplify, duplicate, replace, or otherwise modify its workflow, layout, controls, routes, APIs, persistence, PDF renderer, email/download paths, payment-status handling, invoice numbering, customer/company identity scope, Company Profile inputs, or established consumers unless the owner explicitly requests an invoice-specific change, the exact invoice defect is first reproduced in the approved runtime surface, and the owner approves that bounded repair. An unrelated feature request, including AI or communications work, is never permission to change the invoice system.

Preserve the existing `/customers` Customer Billing Overview, exact-customer folder, saved-job selection, `Customer invoice layout` review, established Create Invoice workbench, preview, issue, download, email, Paid/Unpaid regeneration, and customer portal invoice consumers in their current lanes. Do not add a second invoice page, workbench, preview, renderer, route, table, helper, control, or write path.

The owner explicitly confirmed that the whole invoice system shown on the Mac at the existing exact-customer folder is correct. Treat that visible system as the approved baseline: `1 · Customer profile & invoice prefix` → `2 · Total invoices` → `3 · Pending jobs for payment` → `4 · Selected jobs invoice review` → `All booking history`. Preserve those sections, their order, their established controls, and their handoffs. The local `/customers/ubs` demonstration only identified the approved existing layout; do not hardcode UBS or expose mock/test records to customers.

The stored/customer PDF lower order remains locked as `Notes → sign-off → fully visible Bank Details → Terms & Conditions`. In the admin selected-job invoice review only, keep the sign-off visible, the closed `Bank Details` disclosure immediately below it, and one responsive bottom row containing the closed `Notes` and `Terms & Conditions` disclosures beside each other. Reuse those three existing headings and never add separate links, buttons, panels, routes, or duplicate content. The stored/customer PDF must continue printing all three sections fully, with Bank Details visible and no interactive disclosure. Preserve the approved logo, Company Profile content, line items, quantities, rates, totals, recipient controls, card-payment wording controls, and all current issue/download/email/payment-status behavior without rearranging any other layout.

Before any approved invoice repair, read `docs/current-implementation-ledger.md` section `Owner-Approved Final Invoice Layout Restoration` and run `scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs`, `scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs`, and `scripts/test-customer-billing-document-lifecycle-guard.mjs`. If no invoice defect is reproduced and specifically approved, make no invoice application change.

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
