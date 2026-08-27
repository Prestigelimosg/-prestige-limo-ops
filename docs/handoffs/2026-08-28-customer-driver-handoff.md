# Prestige Limo Ops — Customer and Driver Senior Engineer Handoff

## Context / Boundaries

Repository: `/Users/sohyl/prestige-limo-ops`.

Before doing anything, read `AGENTS.md` and `docs/current-implementation-ledger.md`, then run `git status --short --branch` and `git log --oneline -10`. The protected root checkout may be stale or dirty. Use a clean disposable current-main worktree and do not reset, clean, switch, or overwrite unrelated owner files.

Do not duplicate completed lanes. Start read-only, trace the complete existing lane, run its focused guard, reproduce the exact defect in the approved runtime, and obtain fresh exact Admin/Owner approval before any Driver or Customer native edit.

All Codex engineers are read-only by default for `driver-companion/` and `customer-companion/`. There is no permanent designated engineer. No agent may self-appoint, reuse or infer prior approval, automatically hand off authority, or treat another engineer's absence as permission. After fresh exact approval, the engineer whom the Admin/Owner permits may perform only that bounded task.

Public release is currently **HOLD — Admin completion and final cross-app regression required**. No new native build, App Store Connect write, review submission, or public release is authorized by this handoff.

## Done — Source, Merge, and Deployment Evidence

- Authoritative main at handoff creation: `69ebcf1a`.
- PR `#428` — Driver private-job copy cleanup:
  - source commit `1f0fc633`
  - merge commit `b47ea02c`
  - removed only the approved static explanatory noise, moved the existing `How this page works` disclosure intact to the bottom, preserved every handler, control, API, persistence, and privacy boundary, and verified the remote Driver page in Production.
  - Driver Build 17 consumes this remote page; no new Driver binary was required.
- PR `#429` — Driver/Customer Apple-native governance lock:
  - source commit `d3c6035e`
  - merge/current-main commit `69ebcf1a`
  - governance, ledger, and guard only; no native, runtime, package, build, provider, or data change.
- Customer Build 12 bundled the approved Customer changes: the false normal-tracking `about:blank` warning repair; the established composer, Trip Updates, and map order; Customer-only service labels `Arrival`, `Departure`, `City Transfer`, and `Hourly`; removal of the approved Message Driver explanatory sentence and redundant latest-updates sentence; and the active-principal audience repair for Admin/Driver-to-Customer messages. Booking, PA/Boss access, notifications, tracking, invoice, billing, Calendar, Admin, and Driver workflows remained in their established lanes.

## Exact Accepted TestFlight Baselines

### Customer

- Installed name: `Prestige SG`
- App Store record: `Prestige Limo Sg`
- Bundle: `sg.prestigelimo.customer`
- Version/build: `0.1.0 (12)`
- EAS project: `ce71ff91-7f71-4297-bcef-edf420f94316`
- Exact merge used for the binary: `4171a603010e9bf53ff6961225dd765d67370a8a`
- EAS build: `b2b97b87-8a7b-420c-9f93-22efcc699eee`
- EAS fingerprint: `1a29432e9f3bdee43e17d7ec57fa6fd0ba77b88a`
- Signed IPA SHA-256: `3fc78b198a71c8b53c9d91928d527a8e5220bb071225c79f9c26653a336fd267`
- App Store Connect app: `6802691447`
- Apple build: `b42ea290-492b-472f-bcd1-72a154d9523d`
- Internal group: `Owner Testing` / `c66d522b-c799-4134-be22-225a7192bf4a`
- Apple state: `VALID` and internal TestFlight testing. No external testing, App Review submission, or public release.

### Driver

- App/App Store Connect name: `Prestige SG Driver`
- Installed name: `Prestige Driver`
- Bundle: `sg.prestigelimo.drivercompanion`
- Version/build: `1.0.0 (17)`
- EAS project: `2a797181-d09d-4384-8d01-583456e83c3e`
- Exact merge used for the binary: `afa7ce6ea113146221d9fc0d6a4e316066049634`
- EAS build: `2e04a122-c005-47ef-9aba-e11eb5c03dbf`
- EAS fingerprint: `97e4dcc3893678949466cc12da09653032ae0684`
- Signed IPA SHA-256: `24e47f73455c5493376ae47e5017e4ae908477ed866c99911ac40c5b5a3ec34d`
- App Store Connect app: `6800706103`
- Apple build: `ca106e08-4f36-44d6-afe9-012d7a726680`
- Internal group: `Owner Testing` / `c0b20e3f-bb6b-45cc-8e31-c27519d8aa61`
- Apple state: `VALID` and internal TestFlight testing. No external testing, App Review submission, or public release.

## Physical Acceptance — Owner-Confirmed

### Driver Build 17

Passed:

- Return before 180 seconds: no Face ID prompt.
- Return at or after 180 seconds: exactly one Face ID prompt.
- App switcher/background: opaque privacy cover.
- Locked/stationary background GPS remained fresh for more than six minutes.
- Admin evidence showed current GPS; Customer showed a live map with a current timestamp and 9m accuracy.
- Customer live map rendered.
- Personal Driver Calendar action passed.
- POB passed.
- OTS Photo to Admin passed after delayed arrival. Do not call this unfixed.
- Admin-to-Driver in-app message appeared and the Driver app-icon badge appeared.
- Driver Alert Admin passed.
- Job Completed passed. Admin and Customer each received the JC in-app alert and app-icon badge.
- Driver-to-Customer message from temporary booking `10908` appeared on both PA and Boss Customer phones.

Do not overclaim:

- Notification tap/open/reset was not accepted for every Driver alert type.
- Generic/new-job Driver APNs and the one-hour pickup-reminder tap route remain unaccepted unless the owner provides separate evidence.
- Final physical visual confirmation of the post-PR `#428` copy cleanup was not separately recorded. Source, guards, merge, and Production deployment were verified.

### Customer Build 12

Passed:

- Customer live tracking map rendered with fresh Driver GPS.
- Driver-to-Customer message appeared on both PA and Boss.
- Admin-to-Customer message appeared on both PA and Boss.
- Boss tapped the Customer notification and it opened exact booking `10908` directly.
- Customer received the Job Completed in-app alert and app-icon badge.

Source and focused guards verify the following established behavior, but this handoff does not claim separate owner-confirmed physical acceptance for it:

- Return below 60 seconds skips Face ID.
- Return at or above 60 seconds requires one Face ID prompt.
- Cold launch, invalid/backwards timing, and cancellation remain locked.
- Opaque Customer app-switcher privacy cover.
- Customer badge reset-on-open/tap behavior beyond the observed alerts and exact deep link.

## QA Cleanup

### Booking 10906

- Exact QA booking `10906`, internal booking `229`, reference `QA-CUSTOMER-BADGE-20260827-001` was cleaned only after acceptance.
- Exact booking-specific artifacts were removed, including the booking/link, status evidence, live-location latest/audit data, 3,194 exact audit rows, OTS proof metadata/private Storage objects including the final zero-byte placeholder, booking-specific Admin/Customer notifications, and exact Operations/personal Calendar events.
- Final exact database, Storage-prefix, and Calendar residue checks were zero.
- Reusable QA company/customer/booker/traveller, PA/Boss principals/memberships/access/devices/sessions/subscriptions, verified Driver identity/access/enrollment/device, and reusable Calendar connection were preserved.

### Booking 10908

- One temporary pre-POB messaging/badge booking was created through the established UI for final message acceptance.
- After owner acceptance, exact booking `10908`, link/ack-safe temporary records, both test messages, exact Customer/Admin outbox rows, Admin alert/outbox, temporary GPS authorization, and exact test-only children were removed.
- Exact Operations Calendar event `prestigepg77pp8brr2fdgl289jndoo93posor0ibuc5ankl9aig` was removed as part of the approved cleanup.
- Zero exact residue was verified. Reusable QA and Driver records/subscriptions remained preserved.

Do not restore, rewind, or recreate booking `10906` or `10908`.

## Not Done / Untested

- Admin app is not complete. The owner expects further Admin work and this may take weeks.
- Final cross-app regression after Admin completion has not run.
- Customer Build 12's exact 60-second physical Face ID boundary and privacy-cover acceptance are not fully documented in the owner evidence above.
- Driver generic/new-job APNs, one-hour pickup-reminder tap route, and the complete tap/open/reset matrix remain unaccepted unless separately evidenced.
- No public App Store metadata has been completed or submitted.
- The App Store metadata/screenshot packet was started only as read-only research and then parked before any packet files were created. There is no packet directory to resume; prepare it fresh after final regression.
- No new Customer or Driver build is currently justified. Remote-page corrections already reached the accepted binaries through Production. Native changes require a newly reproduced native defect and fresh approval.

## Parked / Protected Workflows

- Customer and Driver Apple-native projects are owner-governed. All Codex engineers remain read-only until fresh exact Admin/Owner approval for one bounded task.
- Preserve Customer/Driver auth, PA/Boss scope, badges/alerts, messaging, GPS/tracking, Calendar consumers, privacy covers, Universal Links, build identities, and TestFlight groups.
- The entire invoice, billing, payment, PDF, email, numbering, and layout workflow is owner-locked. Do not touch it from Admin, Customer, Driver, messaging, GPS, or release work.
- Driver personal Google Calendar and automatic Driver ACK to Operations Calendar are separately owner-locked. Do not modify Calendar while diagnosing another lane.
- Driver Reports JC evidence must remain visible until explicit `Admin confirm completed`. Never auto-move a booking to Completed/History.
- Stripe remains parked and separate. It is not implemented in Customer Build 12 and must not be bundled into release work.
- Customers must never see Driver payout, PayNow payout, internal Admin notes, parser/debug internals, Admin finance, or QA/dev archive.
- Drivers must never see customer prices, billing/invoices/payments, payout/PayNow comparisons, or internal finance/Admin notes.

## Current App Store Connect Readiness

### TestFlight

- Customer Build 12: ready for existing internal `Owner Testing`.
- Driver Build 17: ready for existing internal `Owner Testing`.
- Both exact builds are validated, use no non-exempt encryption, and are selectable for the existing public version records.

### Public App Store

Both apps are **NOT READY** and also **HOLD — Admin completion and final cross-app regression required**.

Missing or undecided:

- Customer: required iPhone screenshots.
- Driver: required iPhone and 13-inch iPad screenshots.
- Description, keywords, Support URL, and copyright.
- Public build selection.
- App Review demo sign-in, review contact, and review notes.
- Primary category, Content Rights, and Age Rating.
- Privacy Policy URL and complete truthful App Privacy declarations. The live `/privacy` URL returns HTTP 200 but currently focuses on the optional Driver Google Calendar connection; it is not yet a complete Customer/Driver native-app privacy policy.
- Price schedule and country/region availability.
- DSA trader-status compliance/business-verification decision.
- Manual versus automatic release. App Store Connect currently shows automatic release selected; do not accept this by default.
- Apple Silicon Mac availability is currently checked and requires an explicit owner decision. Do not assume these iOS apps should be public on Mac.
- Accessibility declarations are not started. App Store Connect presents them as optional product-page information, not a proven submission blocker.

Global account state observed read-only: Free Apps Agreement active; Paid Apps Agreement not accepted. This does not block a free app but does block paid apps or in-app purchases.

No App Store Connect writes occurred: no metadata, privacy, ratings, category, pricing, availability, build selection, group/tester, external testing, review submission, phased release, or public release was changed.

## Next Safe Action

1. Continue Admin work separately under its own exact bounds. Do not reopen Customer/Driver native work without a newly reproduced defect and fresh owner approval.
2. When Admin is complete, run one read-only final cross-app regression covering Admin-to/from-Driver-to/from-Customer messages, alerts, badges, deep links, booking/dispatch/Driver Reports, GPS/tracking, privacy/Face ID boundaries, Calendar consumers, and privacy exclusions. Preserve the invoice and billing locks.
3. If that regression is green, prepare a fresh local metadata/screenshot/privacy packet for owner review only. Use clean, non-QA screenshots from the accepted binaries. Do not invent states or include private identities/internal data.
4. Obtain separate exact approval for App Store Connect metadata and build-selection writes. Validate all fields before any review submission.
5. Obtain another separate action-time approval for `Submit for Review`. Prefer manual release unless the owner explicitly chooses automatic release.

Current status: **Customer Build 12 and Driver Build 17 are accepted TestFlight baselines, but public release remains HOLD. No new builds are justified now.**
