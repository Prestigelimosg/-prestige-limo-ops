# Customer, Booking, And Invoice Test-Data Wipe Approval Packet

Status: completed Production test-data cleanup; replacement July fixture creation is now allowed

Recovery readiness: verified encrypted logical export and local restore proof remain available for a separately approved recovery

Prepared on 15 July 2026 SGT from a read-only, count-only inspection of the linked Prestige Limo Ops Supabase project and the established repository deletion lanes. No row values or personal data were read. Neither `CRON_SECRET` nor any other environment value was displayed, downloaded, or changed.

The historical preparation and dry-run evidence below is retained so later work can distinguish the completed cleanup from its earlier approval state. The completed execution evidence appears in `Approved Production Test-Data Cleanup Evidence`; no destructive executor route, helper, runner, or reusable wipe lane was added.

## Owner Classification And Timing

The owner declared on 15 July 2026 that all current customer, booking, invoice, and driver records are testing-only and may ultimately be cleaned before real operations begin. This is the owner's operational classification, not a legal conclusion and not an assumption about records outside those four domains.

The controlled Driver Details Email test is complete: one approved message reached the owner mailbox, Production returned to `Email gate off`, and no retry occurred. The owner subsequently approved a replacement-fixture plan: old test data may be cleaned before the first real monthly scheduler proof, provided a fresh controlled July fixture set is created through the established app afterward and retained until the proof finishes. This replaces the earlier fixture-preservation timing recommendation; it does not approve destructive execution yet.

The Production scheduler remains unchanged at 1 August 2026 at 08:00 SGT. The intended minimum eligible fixture set is two completed billing-ready July bookings for the same test customer plus at least one completed billing-ready July booking for a different test customer. The owner may create more clearly marked test bookings, but the exact eligible fixture set must be recorded before the run. If only those three bookings are eligible, the expected scheduler result is two internal `pending_admin_review` drafts: one two-trip customer group and one one-trip customer group. No invoice issue or customer email is expected.

If real operations begin before the scheduler proof finishes, this packet expires and the scope must be re-inventoried. Any genuine business or financial record found during revalidation must be excluded from this test-data wipe and reported for a separate owner decision.

## Read-Only Aggregate Inventory

This inventory records counts only. It does not identify a person, customer, driver, booking, recipient, invoice, object path, calendar event, credential, or configuration value.

### Customer And CRM Identity

- 95 customers; 48 have bookings and 5 have invoice records. 43 customers currently eligible for the existing exact-customer UI deletion have no blocking booking, invoice, or monthly-draft dependency.
- 99 customer contacts and 17 customer access accounts.
- 17 companies, 10 bookers, 18 travelers, and 5 saved addresses.
- 0 authentication users.

### Bookings And Booking Children

- 68 bookings: 24 `admin_review_required`, 5 `assigned`, 7 `cancelled`, 11 `completed`, 3 `confirmed`, 16 `draft`, and 2 `needs_review`.
- 18 completed/cancelled bookings are inside the existing booking deletion boundary; 50 bookings outside that deletion boundary require a separately reviewed cleanup.
- 119 route points, 5 service items, 7 completed-booking closeouts, and 0 workflow-status rows.
- 77 driver job links, 74 driver job status events, 2 DSP actual-time events, 0 bids, 0 bid offers, and 0 customer/driver access audit events.
- 82 customer/driver app-notification outbox rows and 32 admin app-notification outbox rows carrying booking scope.
- 3,603 driver live-location audit events, 0 latest-position rows, and 1 driver OTS photo-proof record.
- 130 audit-log rows carry booking, customer, or booking-reference scope.

### Invoice And Billing Artifacts

- 13 customer invoice records: 1 Paid, 12 Unpaid; delivery state is 7 sent, 5 not_sent, 1 blocked.
- 1 customer invoice sequence.
- 0 monthly billing draft plans.
- 0 monthly invoice drafts, trip links, draft-item reviews, billable-item price reviews, issue reviews, and issue records.

The invoice delivery states are database aggregates only; they neither prove nor disprove that an external provider action reached a real inbox. Sent email cannot be retracted by deleting database records.

### System, Driver, And Storage Boundaries

- 5 driver master rows. The owner has now classified all five as test-only, so they may enter the pre-1-August candidate wipe only after booking and driver-child dependencies are cleared and fresh action-time approval is recorded.
- 1 admin automation runtime setting, 2 admin device push subscriptions, 1 driver live-location runtime setting, 1 rate setting, and 1 company profile setting.
- 2 Storage objects in 1 bucket. Object paths and contents were not read. The single photo-proof database row does not justify assuming what either object contains.

## Earlier Read-Only Revalidation And Completed OTS Cleanup

After the controlled Driver Details Email proof completed, the latest fresh count-only Supabase inspection found 66 bookings: 23 `admin_review_required`, 5 `assigned`, 7 `cancelled`, 12 `completed`, 3 `confirmed`, 14 `draft`, and 2 `needs_review`. The database still contains 95 customers, 5 test-only drivers, 13 customer invoice records, 7 completed closeouts, zero monthly invoice drafts, 115 route points, 5 service items, 65 driver job links, 74 driver job status events, 82 customer/driver app-notification rows, 32 admin app-notification rows, 3,592 driver live-location audit events, zero latest-position rows, 130 audit-log rows, 2 DSP actual-time events, 1 DSP actual-time summary, 1 OTS proof row, and 2 Storage objects. Automation remains ON and was not changed.

The Supabase organization is on the Free plan. Supabase documents automatic daily backups for Pro, Team, and Enterprise projects and recommends that Free projects maintain their own logical exports. No recoverable restore point is assumed, and no backup, temporary branch, or data copy was created during this inspection.

At the pre-cleanup inspection checkpoint, both private Storage objects were classified without reading or recording their raw paths or contents. Both matched the established OTS image path and MIME boundaries. One was tied to the then-current OTS proof row and a current test booking; the second was an orphaned OTS artifact with no proof row and no current booking. Neither had been deleted at that inspection checkpoint; the completed cleanup is recorded immediately below.

### OTS Test Artifact Cleanup Evidence (2026-07-15)

The owner explicitly accepted that the two confirmed test images were not recoverable and approved their bounded removal. Both Storage API delete requests returned HTTP 200, and Storage lifecycle logs recorded the matching object-removal events. No raw object path, image, secret, token, cookie, environment value, or customer/driver private data was recorded in this packet.

The first post-delete database guard correctly aborted because it counted two objects still present in the private bucket. Read-only Storage logs and a normalized database classification then proved those two objects were new dashboard-created `.emptyFolderPlaceholder` markers, not photos: the verified state is 0 OTS image objects, 0 OTS proof rows, and 2 dashboard-created empty-folder placeholders. The single stale proof metadata row was deleted only after a guarded transaction required zero image objects, zero unexpected bucket objects, exactly two placeholders, exactly one proof row, and no proof row with a live Storage object.

Production verification loaded the exact former proof booking through the established admin lane and displayed `No OTS photo proof` with no `View photo` link. The private bucket, file limits, MIME limits, tables, schema, policies, OTS upload/read wiring, and customer visibility boundaries remain intact. The 66 bookings, 95 customers, 5 drivers, 13 invoice records, and single rate-setting row were unchanged; the Default-rate fingerprint remained unchanged and Automation remained ON. No booking, customer, driver, invoice, rate, calendar, Google Maps, customer/driver messaging, environment, Vercel deployment, external send, or configuration was changed.

This cleanup removes only the old OTS test artifacts. If later automated-system testing creates new OTS images or proof rows, those new artifacts require a fresh final inventory and cleanup after testing; this evidence must not be reused to assume future counts.

### Encrypted Logical Export And Restore Verification Evidence (2026-07-15)

After owner approval, Supabase CLI `2.109.1` exported separate roles, schema, and data SQL files from the existing linked Production project. The files were packaged and encrypted outside the repository as `prestige-limo-ops-logical-20260715-165835.tar.enc` using AES-256-CBC with PBKDF2-SHA256 and 600,000 iterations. The encryption key is held in macOS Keychain under the established local secret boundary. The encrypted archive and HMAC integrity sidecar both remain outside the repository with owner-only file permissions.

The encrypted archive is 3,806,240 bytes with SHA-256 `e247f411c9e0d3378d0cbe967e718cc2c0a02eba98d9dba31791b23069a80685`. HMAC verification, decrypt comparison, and the exact three-entry archive check passed. An offline schema-only check confirmed the expected `public.bookings` definition is present. Plaintext SQL working directories were permission-restricted and erased after each bounded attempt; all local restore containers and volumes were removed.

The first restore evidence remained correctly blocked. The downloaded-cluster `db start --from-backup` path was rejected as incompatible with this manual logical SQL archive after its local database contained no restored application tables. The documented sequential `psql` roles/schema/data path then rolled back one local transaction with SQLSTATE `42501`. Sanitized diagnosis proved the failing statement was the `data.sql` `COPY` header for `storage.buckets_vectors`, not a customer row or application table. The exact blocker was the unexpected `COPY` into `storage.buckets_vectors`; no raw row values or error log were printed or committed.

The local verification copy then omitted only the two current Supabase-documented Storage Vector exclusions, `storage.buckets_vectors` and `storage.vector_indexes`; the encrypted source archive remained byte-for-byte unchanged. One fresh local-only `psql` transaction restored roles, schema, and data successfully. All 40 restored public tables matched the dump's exact per-table row-count map, fingerprinted as SHA-256 `d38cb108b3d2456cc01871792f0ab886f7dec299e5e1b44dcbdd025da6f39610`. The restored protected counts were 66 bookings, 95 customers, 5 drivers, 13 invoice records, and 1 rate-setting row. All plaintext verification files, containers, and volumes were removed after the pass.

No destructive cleanup is authorized by this restore proof alone. Production, the encrypted source archive, Supabase/Vercel configuration, Automation, schedules, default rates, Storage, customer/driver messaging, calendar, Google Maps, invoice, payment, payout, and every external contact lane remain unchanged.

### Fresh Exact Dry-Run And Dedicated-Calendar Inventory (2026-07-15)

At 17:26:43 SGT, a new read-only Supabase query counted every proposed candidate table, the preserved configuration rows, authentication state, booking status groups, Storage classification, foreign keys, and candidate-table triggers. It returned aggregates and schema metadata only; no customer, driver, booking, invoice, object path, event title, recipient, credential, secret, or environment value was recorded. No database row, Storage object, calendar event, Automation setting, Vercel/Supabase configuration, deployment, message, or external action changed.

The exact current database scope is 35 candidate public tables:

- Identity and master test data: 95 `customers`, 99 `customer_contacts`, 17 `customer_access_accounts`, 17 `companies`, 10 `bookers`, 18 `travelers`, 5 `saved_addresses`, 5 `drivers`, and 0 `driver_access_accounts`.
- Booking test data: 66 `bookings`, 115 `booking_route_points`, 5 `booking_service_items`, 0 `booking_workflow_statuses`, 7 `completed_booking_closeouts`, and 130 `audit_logs`.
- Driver-job and booking-scoped test data: 65 `driver_job_links`, 74 `driver_job_status_events`, 2 `driver_job_dsp_actual_time_events`, 0 `driver_job_bids`, 0 `driver_job_bid_offers`, 0 `customer_driver_access_audit_events`, 82 `customer_driver_app_notification_outbox`, 32 `admin_app_notification_outbox`, 3,592 `driver_live_location_audit_events`, 0 `driver_live_location_latest_positions`, and 0 `driver_ots_photo_proofs`.
- Invoice test data: 13 `customer_invoice_records`, 1 `customer_invoice_sequences`, and zero rows in `monthly_billing_draft_plans`, `monthly_invoice_drafts`, `monthly_invoice_draft_trip_links`, `monthly_invoice_draft_item_reviews`, `monthly_invoice_billable_item_price_reviews`, `monthly_invoice_issue_reviews`, and `monthly_invoice_issue_records`.

The effective operational booking status counts remain 23 `admin_review_required`, 5 `assigned`, 7 `cancelled`, 12 `completed`, 3 `confirmed`, 14 `draft`, and 2 `needs_review`. These counts use `admin_internal_status` when present and the established legacy `status` only as its fallback; the legacy column alone is null on 41 rows and must not be represented as the current operational status. The 13 invoice records remain 1 Paid and 12 Unpaid, with delivery aggregates of 7 sent, 5 not_sent, and 1 blocked. Authentication remains empty: 0 users, 0 identities, 0 sessions, and 0 refresh tokens.

Storage remains normalized and outside the database-row wipe: 0 OTS image objects, 0 OTS proof rows, 2 empty-folder placeholders, and 0 unexpected bucket objects in the one preserved private bucket. The bucket, policies, file limits, MIME limits, and OTS application wiring remain preserved. Any later test upload invalidates this Storage count and requires another action-time inventory.

The preserved database/system state is exactly 1 `rate_settings` row, 1 `company_profile_settings` row, 1 `admin_automation_runtime_settings` row, 1 `driver_live_location_runtime_settings` row, 2 `admin_device_push_subscriptions` rows, and 1 Storage bucket. Automation is ON and was not changed. The current deletion-guard Default-rate fingerprint, computed from the current Default row while excluding only its created/updated timestamps, is `6fb76942290057e63f7fecf850e718d2`. That fingerprint is a guard for the later bounded operation; it is not a disclosure of price or payout values.

The fresh schema check again found 35 public foreign-key constraints and 0 non-internal candidate-table triggers. The constraints include `RESTRICT`, `NO ACTION`, `SET NULL`, and `CASCADE`, so a parent-only cascade is not a complete cleanup. Text booking references and other non-FK scopes still require explicit zero/orphan assertions.

The signed-in Google Calendar month views verified the dedicated `Prestige Ops Calendar` rather than the unrelated primary calendar. The bounded database window is current booking creation from 11 May through 11 July and canonical pickup from 15 June through 18 July. Within the corresponding full May, June, and July calendar views, plus the adjacent visible August days, there are 31 dedicated-calendar test-booking events: 3 in June and 28 in July, with 0 in May and 0 in the adjacent visible August days. No event title, passenger, location, reference, or other event content is recorded here. No calendar event was deleted, edited, or created, and the Calendar UI was returned to its July view.

#### Exact action-time maintenance and dependency plan

This is the reviewed future operation shape, not current authorization:

1. Obtain separate exact action-time approval for the database wipe, the Production maintenance window, temporarily turning Automation OFF, closing and later restoring the existing `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` kill switch with the required same-code Production redeployments, and any dedicated-calendar deletion. No environment value needs to be read or printed.
2. Before any destructive action, verify the encrypted archive/HMAC again, require the above counts and Default-rate fingerprint to match, require no new Storage image/proof/unexpected object, and require the 31-event dedicated-calendar count to match. Stop on any drift or any possible genuine record.
3. Turn Automation OFF, close the established persistence kill switch, redeploy the same approved Production code, and verify public/admin/customer/driver write paths fail closed while the site remains healthy. This is the write freeze; an operator promise alone is not sufficient.
4. In one guarded database transaction, clear the 35 candidate tables deepest-child-first: monthly invoice price/issue/item/trip children before draft parents; invoice records/sequences and billing plans; OTS/location/DSP/status/bid/notification/access-audit children before driver-job links; booking route/service/workflow/closeout/audit children before bookings; customer access/contact/address children before travelers/bookers/companies/customers; and drivers only after every booking/driver child is gone. Any count, fingerprint, or preserved-row mismatch rolls the transaction back.
5. Before restoring writes, require every approved candidate table and every text-reference orphan check to be zero. The 35 candidate tables must all finish at zero rows. Authentication must remain zero. Storage must remain 1 bucket, 2 placeholders, 0 images, and 0 unexpected objects. Preserved row counts must remain 1 rate setting, 1 company profile, 1 Automation setting, 1 live-location runtime setting, and 2 push subscriptions. The Default-rate fingerprint must remain `6fb76942290057e63f7fecf850e718d2`.
6. Dedicated-calendar deletion is a separate external action. If separately approved, it must target only the 31 verified events in `Prestige Ops Calendar`, after the owner either accepts that the test events are not recoverable or approves a separate calendar recovery copy. Database backup does not restore Google Calendar events.
7. Only after database, Storage, calendar, Production-health, and zero/orphan verification passes may the same persistence gate be restored through a same-code Production redeployment and Automation returned to ON. The owner then creates the replacement fixtures through the established app; no replacement record is created before this point.

The database transaction is the first rollback boundary. After commit, the verified encrypted logical export is the database recovery source, but any Production restore would be a separate manual high-impact operation requiring downtime and fresh owner approval; the Free project has no assumed PITR. Calendar deletion has no database rollback. These are material recovery limits, not reasons to skip the cleanup safeguards.

The exact next approval is therefore still a separate action-time approval. This dry run does not authorize a database write, Automation toggle, Production environment change, redeployment, calendar deletion, message, email, or other external action.

The earlier installed Google Calendar connector found zero matching `Prestige` events and zero matches for the approved Driver Details Email fixture in the authenticated primary calendar, but it did not expose the dedicated app calendar. The signed-in dedicated-calendar UI inventory above resolves that count-only gap. The earlier zero primary-calendar matches remain irrelevant to the 31 dedicated-calendar events and must not be represented as proof that the app calendar was empty.

### Approved Production Test-Data Cleanup Evidence (2026-07-15)

After the owner gave exact action-time approval, the encrypted archive and its Base64 HMAC sidecar were reverified without displaying or changing the Keychain-held encryption key. Automation was turned OFF through the established Production dashboard. The existing Sensitive `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED` gate was overridden closed without reading or downloading its former value, and the exact current Production build `df12b545` was redeployed as maintenance deployment `dpl_2GVp3UKL3J7q469wsLGYNpRpKeiZ`. Production remained HTTP 200.

The first guarded SQL attempt stopped before deletion because a PL/pgSQL record name and rate-row alias were ambiguous; its transaction rolled back completely. The corrected transaction locked the approved candidate and preserved tables, required every action-time count, Automation OFF, empty Auth state, Storage classification, preserved-row count, and Default-rate fingerprint to match, deleted deepest-child-first, and verified its postconditions before commit. A fresh independent query confirms all 35 approved candidate tables contain zero rows, including zero bookings, customers, drivers, customer invoice records, notification rows, access rows, booking children, driver-job children, live-location audit rows, and invoice/draft children.

Preserved state is unchanged: 1 rate setting, 1 company profile, 1 Automation setting, 1 driver live-location runtime setting, 2 admin push subscriptions, 1 private Storage bucket, 2 empty-folder placeholders, 0 Storage images, and 0 unexpected objects. Auth remains 0 users, 0 identities, 0 sessions, and 0 refresh tokens. The Default-rate fingerprint remains `6fb76942290057e63f7fecf850e718d2`; no price or payout value is recorded here.

The signed-in Calendar cleanup exposed a material dry-run counting limitation. The original DOM inventory counted 31 rendered event chips but omitted three events hidden behind Google Calendar's `3 more` overflow. Work stopped when this discrepancy became visible. The owner separately approved the corrected remainder; the actual dedicated-calendar scope was 34 events. All 34 test events were removed from `Prestige Ops Calendar`; final signed-in verification shows zero `Prestige Ops Calendar` events, the dedicated calendar itself still present, and the two unrelated holiday events untouched. No primary-calendar event or calendar wiring was removed.

The same Sensitive persistence gate was restored without displaying or downloading any secret or prior environment value. The same approved build was redeployed as Production deployment `dpl_Ejh8St1zomWmAPtbNNnfE5u5q6Uc`, which is Ready on `app.prestigelimo.sg` with HTTP 200. Automation is ON with the singleton setting `active`. The monthly scheduler remains unchanged at 1 August 2026 at 08:00 SGT.

No Email, WhatsApp, SMS, Telegram, invoice issue, payment, payout, customer/driver contact, or other external provider send occurred. Default rates, schemas, policies, Storage wiring, OTS wiring, Google Maps wiring, calendar wiring, booking persistence code, CRM identity lanes, and completed customer/driver messaging lanes remain intact. No Supabase branch, paid resource, branch merge, staging-source promotion, CRON_SECRET change, or different application code was deployed.

This cleanup evidence does not authorize any future bulk deletion. The owner may now create clearly marked replacement July test fixtures through the established app for the 1 August scheduler proof. Those new records and any new calendar or Storage artifacts require a fresh inventory and approval before any later cleanup.

## Live Dependency And Recovery Readiness

A fresh schema-metadata inspection found 35 public foreign-key constraints across the candidate wipe relationships. Several use `RESTRICT`, `NO ACTION`, or `SET NULL`, and multiple operational tables retain booking scope only as text. A parent-table cascade is therefore not a complete wipe. No non-internal database trigger is configured on any candidate wipe table, so the inspected database has no target-table trigger that would send or enqueue an external action during deletion.

Recovery readiness is now verified for the encrypted logical export. The pinned Supabase CLI ran through `npx` without being added to the application dependencies, and Docker was used only for isolated local dump/restore tooling. The existing database password was retrieved from macOS Keychain without printing it; it was not placed in the repository, documentation, command output, or chat.

The approved database recovery method now has both artifacts: the unchanged encrypted Supabase CLI roles/schema/data archive outside the repository and the successful local-only restore/count-map proof recorded above. No temporary Supabase branch or paid Supabase resource was created. This satisfies the recovery prerequisite only; it does not approve deletion.

Storage objects are not included in a database dump. For the old two confirmed test artifacts, the owner explicitly accepted that no recovery copy was required and their completed bounded cleanup is recorded above. Any future Storage artifact requires a fresh recovery decision before deletion. Dedicated Google Calendar cleanup remains a separately inventoried and separately approved external action.

## Existing Lanes And Duplicate Check

No duplicate bulk-cleanup lane exists. The established customer-profile action deletes one exact eligible customer only and intentionally blocks customers with bookings, invoices, monthly billing drafts, or monthly invoice drafts. The established saved-booking action is limited to its reviewed completed/cancelled and narrow draft boundaries. It is not a general active-booking or system-wide wipe.

The prepared cleanup must reuse verified relationships and dependency knowledge rather than add a second customer, booking, invoice, messaging, calendar, map, persistence, or CRM identity lane. No new UI, route, helper, database function, or runnable cleanup script is part of this packet.

## Candidate Test-Data Scope

Subject to a fresh count-only revalidation and exact action-time approval, the pre-1-August wipe may include:

- Customer and identity records: customer contacts and access accounts, saved addresses, travelers, bookers, companies, and customers.
- Booking records and children: route points, service items, workflow statuses, completed closeouts, booking-scoped notifications and audit rows, bids and offers, driver job links/status/actual-time records, live-location rows, OTS proof metadata, and bookings.
- Finance test artifacts: customer invoice records and sequences, monthly billing draft plans, monthly invoice drafts, their trip/review children, and issue records.
- The 5 test-only driver master rows after booking and driver-child dependencies are cleared.
- Any new OTS image objects or proof rows created during later automated-system testing, but only after a fresh inventory and separate final cleanup approval. The old two test images and one proof row are already removed and must not be targeted again.

String booking references and nullable relationships are not fully protected by database cascades. The cleanup cannot rely on customer or booking deletion alone to remove audit, notification, live-location, invoice, or Storage artifacts.

## Rows Preserved By This Packet

Preserve system and configuration rows, including Automation/runtime settings, push subscriptions, rate settings, and company profile settings. Preserve schema, migrations, policies, tables, sequences unrelated to test invoice numbering, application wiring, Google Maps wiring, Google Calendar wiring, customer/driver messaging, booking persistence, and CRM identity lanes.

## Execution Prerequisites

Execution must stop unless every item below is satisfied:

1. The owner reconfirms that real operations have not begun and that the fresh replacement-fixture set can be created and completed before 1 August 2026 at 08:00 SGT.
2. A fresh count-only inventory matches an exact proposed scope; any newly created or genuine record is excluded and reported.
3. The owner separately approves an exact write freeze and maintenance window. Public booking intake, admin/customer writes, schedulers, and Automation must not race the cleanup; any state or configuration change requires separate owner approval.
4. A recoverable database restore point is verified instead of assumed. [Supabase documents that Storage objects are not included in database backups](https://supabase.com/docs/guides/platform/backups), so any desired Storage recovery copy must be handled separately.
5. Any newly created Storage objects are mapped while database references still exist and are either confirmed as test artifacts or excluded. The old OTS artifacts are already removed and must not be counted again.
6. A separate read-only Google Calendar inventory determines whether test-booking events exist. Removing test calendar events is a separate external action requiring exact approval; database cleanup alone is not a complete calendar cleanup.
7. The owner accepts that historical backups and logs may retain pre-wipe data for their configured retention period and that previously sent external messages cannot be recalled by this operation.
8. An exact dry-run report, ordered dependency plan, rollback point, expected final counts, and action-time approval are recorded immediately before execution.
9. After zero-count and orphan verification, the owner creates clearly marked replacement test customers, drivers, and July bookings through the established app. At least two billing-ready completed July bookings must share one test customer and at least one must use a different test customer; all scheduler fixtures remain un-invoiced until the 1 August proof.

The owner must not create replacement test bookings until the wipe and zero-count/orphan verification are complete. Anything created earlier would either enter the deletion scope or require a new exclusion review and invalidate the current dry-run counts.

## Reviewed Execution Shape For Action-Time Approval

The bounded operation should first freeze writes and capture recovery evidence, then map external/Storage artifacts before their references are removed. It should clear the deepest finance and booking children before their parents, clear scoped orphan-prone reference rows explicitly, and remove customer/CRM identity parents only after all blockers are gone. No table, schema, policy, application lane, or preserved configuration row should be removed.

Zero-count verification must cover every approved table and artifact class, plus orphan checks for booking references, customer references, invoice references, driver-job links, Storage objects, and separately approved calendar events. Automation/intake restoration, if any, requires an explicit post-cleanup decision and a clean verification report.

## Exact Next Approval

The next approval is limited to a fresh count-only inventory and exact dry-run report for the proposed database cleanup, plus the dedicated-calendar inventory, maintenance/write-freeze window, Automation handling, exact preserved rows, any newly created Storage classification, rollback method, and expected zero-count/orphan assertions. The old two OTS test images and one proof row are already removed without a recovery copy under the owner's explicit approval; any newly created OTS artifacts require a fresh later decision. Only after that evidence may the owner give a separate exact action-time approval for one bounded pre-1-August cleanup execution. The scheduler date, code, cron, layouts, and wired lanes remain unchanged; the owner must not create the replacement bookings until cleanup verification passes.
