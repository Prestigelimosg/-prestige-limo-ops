# Saved-job combo implementation scope

Status: implemented locally on `codex/saved-job-combo`; not deployed, migrated, enabled or device-verified.

Owner-approved inputs: select already-saved jobs for the same customer; a small Add trip picker inside existing Dispatch Assigned Driver / Pool controls; no new sector; one whole-package Pool acceptance; one Create Link; one Save & Acknowledge; separate calendar events and reminders per trip. Owner uses the existing payout override or default rates; no additional payout setup. Do not generate new bookings or interpret Add trip as a booking-entry form.

## Invariants

- Exact customer account ownership is authoritative. A matching company name is insufficient. Preserve each booking's customer/company/booker/traveller identifiers and invoice eligibility.
- Membership uses exact saved booking references. Selecting a job cannot copy it, save it again, assign it, publish it, create a link, or send a notification.
- Group membership, current booking revisions, chosen vehicle, total payout and invited audience constitute the offer. Assignment must succeed for all included trips or none. Selected and wider Pool modes retain their current first-valid-acceptance rule. Direct assignment must validate the same complete set.
- Direct assignment accepts an empty override and preserves each trip's existing override/default rate. An explicitly entered whole-package override is counted once on the primary booking; included trips carry zero plus an internal inclusion marker. Pool retains its existing fixed offer amount: fixed-job defaults may populate that same field, while an hourly rate is never guessed into a fixed total. Do not invent equal splits or prorated refunds. Customer charges remain independent.
- Pool acceptance is not acknowledgement. One explicit combined acknowledgement must persist the exact current member links and verified driver details together. An old acceptance or acknowledgement cannot approve a later changed membership.
- One group entry must remain usable after an earlier trip completes. Existing single-booking completion expires links and the native opener rejects terminal bookings; those behaviours must remain unchanged for ordinary jobs while group entry resolves a remaining eligible trip.
- Per-trip reporting, messages, photos, location eligibility and explicit Admin completion remain scoped to each booking. Completing one trip cannot complete, hide, acknowledge or clear another trip.
- One existing personal Calendar action must save one deterministic driver-plus-booking event for every trip. First consent is shared; retries must update existing events. Partial failures remain visible. Operations Calendar remains a separate existing consumer.
- Pickup reminders remain per exact booking and pickup time. Initial combo delivery and pending-ACK reminders must not multiply into one identical alert per member. Notification taps must resolve the intended trip. Do not equate provider acceptance with device receipt.
- Access must cover the final trip and the established post-trip window. The ordinary 96-hour reader limits and the SQL seven-day creation bound currently differ and must be reconciled only for verified combo access; changing just one writer is insufficient.
- Changes after posting require revalidation of the whole group. No silent additions, removals, payout changes or reassignment. Cancellation must retain real per-trip evidence and must not invent a prorated payout or customer refund.
- Customer invoices remain individual exact-booking lines using the existing four-job limit and identity checks. Each DSP uses its own booked pickup to persisted JC or existing explicit billing correction. No invoice creation, issue, email, payment or customer-price write is implicit in a combo operation.

## Existing integration points

1. `app/page.tsx` and `app/admin-driver-pool-control.tsx`: existing Dispatch assignment, payout and Pool controls. Add trip belongs here; Booking Details and Save + CRM do not become batch-entry controls.
2. `/api/admin-driver-job-bid-offers` and `lib/driver-pool-fast-accept.ts`: authenticated Pool publication, selection/widening, cancellation and recipient-safe reads.
3. Existing Pool publisher and acceptance SQL: single-booking row locking, revision check, driver/device/vehicle eligibility, schedule conflicts and first winner. Multi-member acceptance cannot be implemented as independent HTTP requests.
4. `lib/admin-driver-job-link-persistence.ts`: stable sealed-token reuse, safe revision comparison, delivery reservation and native alert handoff.
5. `lib/driver-job-status-persistence.ts`: exact token/link/driver checks, atomic ACK writer, older-driver supersession and per-trip status writes.
6. `lib/driver-portal-jobs.ts`, `/api/driver-native-job-open/[jobKey]`, and the existing remote Driver pages: My Jobs grouping and group entry without an Admin WhatsApp click.
7. `lib/driver-google-calendar.ts`, `lib/driver-job-calendar-event.ts`, and `lib/driver-one-hour-pickup-reminder.ts`: per-trip event identity, OAuth reuse, event retry and scheduled pickup alert identities.
8. Existing Admin ACK Queue projection: stable group display with exact member-link evidence retained beneath the group operation; no second queue or polling store.
9. Existing payout readers and Operations Calendar payout display: package total must not be multiplied or replaced by default per-trip rates. No payout or PayNow action is authorized by feature preparation.

Further payout inspection: there is no implemented monthly payout-accounting export to extend. `docs/admin-monthly-payout-accounting-export-approval-packet.md` explicitly records that lane as future, blocked and finance-only; its focused guard excludes a live export implementation. Existing payout-rule editing and booking/Pool payout values do exist. Do not reopen the parked export lane or describe it as a verified live payout ledger. Combo work concerns the agreed dispatch amount and its safe display/persistence, not payout execution or a new finance system.

Default amendment policy for implementation: membership selection is editable before publication. After publication, any membership or payout change must invalidate the old offer revision and require the package to be reviewed/reoffered; after acceptance, do not silently retain acceptance of changed terms. A cancelled trip retains its original reporting evidence, and any revised total remains an explicit Admin entry in the same payout control. No automatic refund, split or additional payment is inferred.

## Baseline verification on 23 September 2026

Isolated checkout `/private/tmp/prestige-combo-20260923`, branch `codex/saved-job-combo`, verified remote main `49629636af2eb7fe55c71a3ac624092ea96c1fd9`. The protected root checkout was not edited. Locked dependencies installed only in the isolated checkout.

Passing unchanged-source checks:

- Pending Driver ACK Queue guard.
- Admin Driver Job Link API contract.
- Explicit Admin active-job confirm-completed guard.
- Personal Driver Calendar guard.
- Driver Pool Admin selection guard.
- Customer folder multi-job invoice handoff guard.
- Stored invoice/PDF/portal guard.
- Customer billing document lifecycle guard.
- Existing disposable PostgreSQL Pool suite, including selected/all audiences, exact recipients, stale and replay rejection, fixed payout, cancellation, privacy, and simultaneous first-accept and overlapping-job races.

The first PostgreSQL launch was blocked by sandbox shared-memory permissions. The same synthetic-only suite subsequently passed with the approved local-process permission. It used a Unix socket and no Production database or provider. These are baseline results, not proof of a working combo.

## Required acceptance before release

Test same-day and cross-day groups through all-driver Pool, selected-driver Pool and direct assignment; one winner across the entire group; stale membership and concurrent assignment rejection; response-loss retries; default rates or one explicit package override counted once; one delivery into My Jobs; one combined ACK and queue clearance; first-trip completion preserving remaining-trip access; first-time and reused Google consent; partial Calendar failure/retry without duplicates; separate pickup reminders; changed/cancelled trips; revoked/reassigned access; unchanged single-job controls and exact-customer invoices. Verify actual receipt and operation on both QA phones before claiming device acceptance.


## Local implementation and verified boundaries

- Existing Dispatch Assigned Driver / Pool control contains one small **Add trip**. Its dialog lists paginated eligible saved trips for the exact same customer/company/booker. The first saved job stays selected. Select one member only on a draft to remove the combo without deleting bookings. No booking creation is implicit.
- `20260923024634_saved_job_combo.sql` adds private membership/revision records and transactional wrappers around existing Pool, link, ACK and reassignment functions. Booking locks make acceptance and acknowledgement all-or-nothing. Ordinary ungrouped records retain their existing writers. Grouped operational fields/route/service rows cannot bypass the wrapper through an old single-job write. Independent customer-price and billing fields remain writable through their existing approved lanes.
- Pool closes at the earliest trip, including when it is not the first selected job. Both selected and wider audiences use the existing recipients and sender. All trips are checked for vehicle and schedule conflicts. Direct assignment has the same complete-member validation.
- Create Link persists each exact trip's sealed capability in one transaction and returns one primary URL. The existing delivery reservation/sender is called once; failed persistence sends nothing and response-loss retry recovers the same URL without a duplicate send. My Jobs groups the package. Driver sees the vehicle Combo heading and individual service/date/weekday/time/route and safe requirements.
- One Save & Acknowledge persists all current member links and driver details together. The existing Admin queue displays one primary alert. Operations Calendar continues its same-event update for each booking after successful ACK. Separate personal Calendar events use the existing consent, encrypted connection and driver-plus-booking identity. A partial provider failure remains visible and retries update already-created events. Pickup alerts remain per booking; ACK reminders use one primary link.
- A completed entry may navigate to the next active trip only after persisted completion evidence is verified. Mutating routes never silently redirect onto another trip. Combo access covers the last trip plus 96 hours, capped at 370 days. Ordinary link limits remain unchanged. Revoke affects only the exact package link batch; replacement expires old access for the whole package.
- Initial version limits: 2–100 trips; membership editable only before posting. Posted terms cannot change silently. Use the existing cancellation/review controls before reoffering eligible work. Changing a package after reporting/location sharing begins is rejected; there is no automatic partial cancellation, price allocation or refund. An existing link continues to later trips, but creating/reissuing a complete package after one member is terminal is rejected. These limits must be stated before live use.

## Verification on 23 September 2026

Passed local focused suites:

- `test-saved-job-combo-sql.mjs`: real disposable PostgreSQL; same-customer selection, stale/member conflict rejection, simultaneous winners, all/selected audiences, optional default payout, direct assignment, atomic link/ACK rollback and retry, earliest-trip expiry, grouped write protection, replacement/revoke/cancel/draft dissolution, RLS/function permissions. No live database connection.
- `test-saved-job-combo-link-delivery.mjs`: actual production adapter and token encryption; one atomic link call, saved-trip safe payloads, one primary delivery reservation/send, no send on failure, stable retry. Provider and persistence are synthetic.
- `test-saved-job-combo-access.mjs`: actual capability validation, safe projection, driver/customer/revision/batch matching, expired/completed navigation and revoked/reassigned rejection.
- `test-saved-job-combo-calendar.mjs`: actual Calendar writer with synthetic DB/provider; one consent/connection, three deterministic events and reminders, partial failure/retry without duplicates, retained credential on transient failure.
- `test-saved-job-combo-browser.mjs`: actual localhost Admin and Driver pages with synthetic API responses; saved-trip picker, one membership mutation, three-row cards at 390/412px, one ACK request, one whole-package Pool acceptance, My Jobs grouping, no horizontal overflow/customer finance or uncaught browser exceptions. Images `/private/tmp/prestige-combo-local-390.png` and `412.png` are **local browser screenshots, not phone screenshots**.
- Existing focused Pool, link API/production adapter, ACK/status/details sync, queue, explicit Admin completion, completed-history/GPS, personal/Operations Calendar, pickup reminders, customer-price review and invoice lifecycle/PDF guards pass. Only the existing Pool guard's synthetic `combo:null` binding and new conditional button label were adjusted to cover the extension.
- Production build and TypeScript pass. Changed-file ESLint has zero errors; existing warnings remain.
- Known pre-existing broad-suite limit: `test-driver-job-page-browser.mjs` stops at its obsolete expectation that the acceptance receipt survives Refresh. `HEAD` already clears that receipt; the ledger previously records the same failure. This unrelated assertion and application behaviour were left unchanged. Do not call that broad suite passed.

## Release and device acceptance remaining

No Production schema/config/code write, QA booking creation, physical phone test or cleanup has occurred for this feature. The implementation is gated by the new server flag `PRESTIGE_DRIVER_COMBO_ENABLED=true`; it requires the accompanying migration before enabling.

Release sequence: review the exact staged commit and migration; apply only this migration; deploy the reviewed web/API build with the flag off; enable the flag in the release that contains the implementation. No native APK/Apple project change or build is required. Do not publish to real drivers during QA.

Use existing QA driver45 (Pixel), driver46 (mirrored iPhone) and customer192 only after fresh verification of those identities and current device binding. Test same-day and cross-day packages through selected Pool, all Pool and direct assignment. Before all-Pool publication, prove the eligible vehicle roster contains only QA recipients; if it does not, stop that send rather than changing real drivers. Confirm on each phone: receive in My Jobs without WhatsApp, one ACK and one Admin queue removal, separate Calendar events/reminders, and remaining-trip entry after first completion. Capture actual phone screenshots and keep a precise record of newly created booking/group/link/event IDs.

After acceptance passes, remove only those QA records and their exact generated dependencies, preserving QA accounts and all real records. Cleanup must account for group membership write guards and existing Calendar events; do not claim calendar cleanup from deleting database rows. The historical 11020–11024 QA records were already cleaned and must not be cleaned again.

Rollback before QA records exist: leave the flag off or revert the web release; additive private tables may remain. After groups exist, disabling/reverting alone does not safely dissolve them: old writers are intentionally blocked from splitting a group. Resolve only the exact QA package records first and retain the verified build for any real package. Never blanket-delete or reset bookings, memberships, links, accounts or Calendar events.
