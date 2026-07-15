# Customer, Booking, And Invoice Test-Data Wipe Approval Packet

Status: prepared for pre-1-August replacement-fixture planning; destructive execution not approved

Prepared on 15 July 2026 SGT from a read-only, count-only inspection of the linked Prestige Limo Ops Supabase project and the established repository deletion lanes. No row values or personal data were read. Neither `CRON_SECRET` nor any other environment value was displayed, downloaded, or changed.

No deletion occurred during this preparation pass. No destructive SQL, executor route, helper, runner, deployment, configuration change, Automation toggle, external send, or data write is authorized or included.

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

## Latest Read-Only Revalidation

After the controlled Driver Details Email proof completed, the latest fresh count-only Supabase inspection found 66 bookings: 23 `admin_review_required`, 5 `assigned`, 7 `cancelled`, 12 `completed`, 3 `confirmed`, 14 `draft`, and 2 `needs_review`. The database still contains 95 customers, 5 test-only drivers, 13 customer invoice records, 7 completed closeouts, zero monthly invoice drafts, 115 route points, 5 service items, 65 driver job links, 74 driver job status events, 82 customer/driver app-notification rows, 32 admin app-notification rows, 3,592 driver live-location audit events, zero latest-position rows, 1 OTS proof row, and 2 Storage objects. Automation remains ON and was not changed.

The Supabase organization is on the Free plan. Supabase documents automatic daily backups for Pro, Team, and Enterprise projects and recommends that Free projects maintain their own logical exports. No recoverable restore point is assumed, and no backup, temporary branch, or data copy was created during this inspection.

Both private Storage objects were classified without reading or recording their raw paths or contents. Both match the established OTS image path and MIME boundaries. One is tied to the current OTS proof row and a current test booking; the second is an orphaned OTS artifact with no proof row and no current booking. Both are candidate test artifacts, but neither was deleted.

The installed Google Calendar connector found zero matching `Prestige` events and zero matches for the approved Driver Details Email fixture in the authenticated primary calendar. The app's separately documented `Prestige Ops Calendar` remains unverified because that dedicated calendar was not exposed by the connector. Zero primary-calendar matches must not be represented as proof that the dedicated app calendar contains no test events.

## Existing Lanes And Duplicate Check

No duplicate bulk-cleanup lane exists. The established customer-profile action deletes one exact eligible customer only and intentionally blocks customers with bookings, invoices, monthly billing drafts, or monthly invoice drafts. The established saved-booking action is limited to its reviewed completed/cancelled and narrow draft boundaries. It is not a general active-booking or system-wide wipe.

The prepared cleanup must reuse verified relationships and dependency knowledge rather than add a second customer, booking, invoice, messaging, calendar, map, persistence, or CRM identity lane. No new UI, route, helper, database function, or runnable cleanup script is part of this packet.

## Candidate Test-Data Scope

Subject to a fresh count-only revalidation and exact action-time approval, the pre-1-August wipe may include:

- Customer and identity records: customer contacts and access accounts, saved addresses, travelers, bookers, companies, and customers.
- Booking records and children: route points, service items, workflow statuses, completed closeouts, booking-scoped notifications and audit rows, bids and offers, driver job links/status/actual-time records, live-location rows, OTS proof metadata, and bookings.
- Finance test artifacts: customer invoice records and sequences, monthly billing draft plans, monthly invoice drafts, their trip/review children, and issue records.
- The 5 test-only driver master rows after booking and driver-child dependencies are cleared.
- The 2 mapped OTS Storage objects only in the final separately approved execution window.

String booking references and nullable relationships are not fully protected by database cascades. The cleanup cannot rely on customer or booking deletion alone to remove audit, notification, live-location, invoice, or Storage artifacts.

## Rows Preserved By This Packet

Preserve system and configuration rows, including Automation/runtime settings, push subscriptions, rate settings, and company profile settings. Preserve schema, migrations, policies, tables, sequences unrelated to test invoice numbering, application wiring, Google Maps wiring, Google Calendar wiring, customer/driver messaging, booking persistence, and CRM identity lanes.

## Execution Prerequisites

Execution must stop unless every item below is satisfied:

1. The owner reconfirms that real operations have not begun and that the fresh replacement-fixture set can be created and completed before 1 August 2026 at 08:00 SGT.
2. A fresh count-only inventory matches an exact proposed scope; any newly created or genuine record is excluded and reported.
3. The owner separately approves an exact write freeze and maintenance window. Public booking intake, admin/customer writes, schedulers, and Automation must not race the cleanup; any state or configuration change requires separate owner approval.
4. A recoverable database restore point is verified instead of assumed. [Supabase documents that Storage objects are not included in database backups](https://supabase.com/docs/guides/platform/backups), so any desired Storage recovery copy must be handled separately.
5. Both Storage objects are mapped while database references still exist and are either confirmed as test artifacts or excluded.
6. A separate read-only Google Calendar inventory determines whether test-booking events exist. Removing test calendar events is a separate external action requiring exact approval; database cleanup alone is not a complete calendar cleanup.
7. The owner accepts that historical backups and logs may retain pre-wipe data for their configured retention period and that previously sent external messages cannot be recalled by this operation.
8. An exact dry-run report, ordered dependency plan, rollback point, expected final counts, and action-time approval are recorded immediately before execution.
9. After zero-count and orphan verification, the owner creates clearly marked replacement test customers, drivers, and July bookings through the established app. At least two billing-ready completed July bookings must share one test customer and at least one must use a different test customer; all scheduler fixtures remain un-invoiced until the 1 August proof.

## Reviewed Execution Shape For Action-Time Approval

The bounded operation should first freeze writes and capture recovery evidence, then map external/Storage artifacts before their references are removed. It should clear the deepest finance and booking children before their parents, clear scoped orphan-prone reference rows explicitly, and remove customer/CRM identity parents only after all blockers are gone. No table, schema, policy, application lane, or preserved configuration row should be removed.

Zero-count verification must cover every approved table and artifact class, plus orphan checks for booking references, customer references, invoice references, driver-job links, Storage objects, and separately approved calendar events. Automation/intake restoration, if any, requires an explicit post-cleanup decision and a clean verification report.

## Exact Next Approval

The next action-time approval must name the recovery method, exact maintenance window and Automation handling, final count-only deletion scope, exact preserved rows, Storage/calendar classification, rollback method, and zero-count/orphan assertions. Only after that review may the owner approve one bounded pre-1-August cleanup execution. The scheduler date, code, cron, layouts, and wired lanes remain unchanged; fresh replacement fixtures are created only after cleanup verification succeeds.
