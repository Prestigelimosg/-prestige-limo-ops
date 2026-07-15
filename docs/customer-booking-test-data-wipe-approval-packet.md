# Customer, Booking, And Invoice Test-Data Wipe Approval Packet

Status: prepared; execution deferred and not approved

Prepared on 15 July 2026 SGT from a read-only, count-only inspection of the linked Prestige Limo Ops Supabase project and the established repository deletion lanes. No row values or personal data were read. Neither `CRON_SECRET` nor any other environment value was displayed, downloaded, or changed.

No deletion occurred during this preparation pass. No destructive SQL, executor route, helper, runner, deployment, configuration change, Automation toggle, external send, or data write is authorized or included.

## Owner Classification And Timing

The owner declared on 15 July 2026 that all current customer, booking, and invoice records are testing-only and may ultimately be cleaned before live operations. This is the owner's operational classification, not a legal conclusion and not an assumption about records outside those three domains.

The safest timing is after the controlled Driver Details Email test and after the first real monthly scheduler proof due on 1 August 2026 at 08:00 SGT, then before real operations begin. Those proofs still need exact, approved test fixtures. Deleting their fixtures now would weaken or prevent the remaining runtime evidence.

If real operations begin before both proofs finish, this packet expires and the scope must be re-inventoried. Any genuine business or financial record found during revalidation must be excluded from the wipe and retained under the applicable record-keeping requirement. [IRAS states that companies must retain relevant business records for at least five years](https://www.iras.gov.sg/taxes/corporate-income-tax/basics-of-corporate-income-tax/record-keeping-requirements).

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

- 5 driver master rows. The owner declaration above did not classify driver master data, so these rows are outside the prepared wipe until separately classified and approved.
- 1 admin automation runtime setting, 2 admin device push subscriptions, 1 driver live-location runtime setting, 1 rate setting, and 1 company profile setting.
- 2 Storage objects in 1 bucket. Object paths and contents were not read. The single photo-proof database row does not justify assuming what either object contains.

## Existing Lanes And Duplicate Check

No duplicate bulk-cleanup lane exists. The established customer-profile action deletes one exact eligible customer only and intentionally blocks customers with bookings, invoices, monthly billing drafts, or monthly invoice drafts. The established saved-booking action is limited to its reviewed completed/cancelled and narrow draft boundaries. It is not a general active-booking or system-wide wipe.

The prepared cleanup must reuse verified relationships and dependency knowledge rather than add a second customer, booking, invoice, messaging, calendar, map, persistence, or CRM identity lane. No new UI, route, helper, database function, or runnable cleanup script is part of this packet.

## Candidate Test-Data Scope

Subject to a fresh count-only revalidation and exact action-time approval, the later wipe may include:

- Customer and identity records: customer contacts and access accounts, saved addresses, travelers, bookers, companies, and customers.
- Booking records and children: route points, service items, workflow statuses, completed closeouts, booking-scoped notifications and audit rows, bids and offers, driver job links/status/actual-time records, live-location rows, OTS proof metadata, and bookings.
- Finance test artifacts: customer invoice records and sequences, monthly billing draft plans, monthly invoice drafts, their trip/review children, and issue records.
- The 2 Storage objects only after both are mapped and explicitly confirmed as test artifacts.

String booking references and nullable relationships are not fully protected by database cascades. A later cleanup cannot rely on customer or booking deletion alone to remove audit, notification, live-location, invoice, or Storage artifacts.

## Rows Preserved By This Packet

Preserve system and configuration rows, including Automation/runtime settings, push subscriptions, rate settings, company profile settings, and the existing driver master rows, unless a later packet separately classifies and approves them. Preserve schema, migrations, policies, tables, sequences unrelated to test invoice numbering, application wiring, Google Maps wiring, Google Calendar wiring, customer/driver messaging, booking persistence, and CRM identity lanes.

## Execution Prerequisites

Execution must stop unless every item below is satisfied:

1. Both remaining runtime proofs have finished and the owner reconfirms that real operations have not begun.
2. A fresh count-only inventory matches an exact proposed scope; any newly created or genuine record is excluded and reported.
3. The owner separately approves an exact write freeze and maintenance window. Public booking intake, admin/customer writes, schedulers, and Automation must not race the cleanup; any state or configuration change requires separate owner approval.
4. A recoverable database restore point is verified instead of assumed. [Supabase documents that Storage objects are not included in database backups](https://supabase.com/docs/guides/platform/backups), so any desired Storage recovery copy must be handled separately.
5. Both Storage objects are mapped while database references still exist and are either confirmed as test artifacts or excluded.
6. A separate read-only Google Calendar inventory determines whether test-booking events exist. Removing test calendar events is a separate external action requiring exact approval; database cleanup alone is not a complete calendar cleanup.
7. The owner accepts that historical backups and logs may retain pre-wipe data for their configured retention period and that previously sent external messages cannot be recalled by this operation.
8. An exact dry-run report, ordered dependency plan, rollback point, expected final counts, and action-time approval are recorded immediately before execution.

## Reviewed Execution Shape For Later Approval

The later bounded operation should first freeze writes and capture recovery evidence, then map external/Storage artifacts before their references are removed. It should clear the deepest finance and booking children before their parents, clear scoped orphan-prone reference rows explicitly, and remove customer/CRM identity parents only after all blockers are gone. No table, schema, policy, application lane, or preserved configuration row should be removed.

Zero-count verification must cover every approved table and artifact class, plus orphan checks for booking references, customer references, invoice references, driver-job links, Storage objects, and separately approved calendar events. Automation/intake restoration, if any, requires an explicit post-cleanup decision and a clean verification report.

## Exact Next Approval

No wipe approval should be requested now. After the Driver Details Email test and 1 August scheduler proof pass, present the refreshed counts, exact retained fixtures (normally none), exact preserved rows, Storage/calendar classification, verified restore point, maintenance-window controls, rollback method, and zero-count assertions. The owner can then approve or reject one bounded cleanup execution without changing application layouts or wiring.
