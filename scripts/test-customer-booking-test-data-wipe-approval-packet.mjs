import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";

const packetPath = "docs/customer-booking-test-data-wipe-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";

assert.equal(
  existsSync(packetPath),
  true,
  "Missing customer/booking test-data wipe approval packet.",
);

const [packet, ledger, suite] = await Promise.all([
  readFile(packetPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(suitePath, "utf8"),
]);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(
    source.includes(fragment),
    true,
    `Customer/booking test-data wipe approval packet missing ${label}.`,
  );
}

for (const fragment of [
  "# Customer, Booking, And Invoice Test-Data Wipe Approval Packet",
  "Status: prepared for pre-1-August replacement-fixture planning; destructive execution not approved",
  "Recovery readiness: verified encrypted logical export and local restore proof complete; destructive execution still not approved",
  "all current customer, booking, invoice, and driver records are testing-only",
  "No deletion occurred during this preparation pass.",
  "old test data may be cleaned before the first real monthly scheduler proof",
  "The Production scheduler remains unchanged at 1 August 2026 at 08:00 SGT.",
  "two completed billing-ready July bookings for the same test customer",
  "at least one completed billing-ready July booking for a different test customer",
  "expected scheduler result is two internal `pending_admin_review` drafts",
  "before real operations begin",
  "95 customers",
  "68 bookings",
  "24 `admin_review_required`",
  "5 `assigned`",
  "7 `cancelled`",
  "11 `completed`",
  "3 `confirmed`",
  "16 `draft`",
  "2 `needs_review`",
  "13 customer invoice records",
  "1 Paid, 12 Unpaid",
  "7 sent, 5 not_sent, 1 blocked",
  "43 customers currently eligible for the existing exact-customer UI deletion",
  "18 completed/cancelled bookings",
  "50 bookings outside that deletion boundary",
  "0 authentication users",
  "2 Storage objects in 1 bucket",
  "The controlled Driver Details Email test is complete",
  "66 bookings: 23 `admin_review_required`, 5 `assigned`, 7 `cancelled`, 12 `completed`, 3 `confirmed`, 14 `draft`, and 2 `needs_review`",
  "115 route points",
  "65 driver job links",
  "3,592 driver live-location audit events",
  "130 audit-log rows",
  "2 DSP actual-time events",
  "1 DSP actual-time summary",
  "5 test-only drivers",
  "Automation remains ON and was not changed",
  "Supabase organization is on the Free plan",
  "No recoverable restore point is assumed",
  "The pinned Supabase CLI ran through `npx` without being added to the application dependencies",
  "The existing database password was retrieved from macOS Keychain without printing it",
  "No non-internal database trigger is configured on any candidate wipe table",
  "must not create replacement test bookings until the wipe and zero-count/orphan verification are complete",
  "One was tied to the then-current OTS proof row and a current test booking",
  "second was an orphaned OTS artifact with no proof row and no current booking",
  "signed-in dedicated-calendar UI inventory above resolves that count-only gap",
  "The 5 test-only driver master rows",
  "No row values or personal data were read",
  "Storage objects are not included in database backups",
  "Any genuine business or financial record found during revalidation must be excluded from this test-data wipe and reported for a separate owner decision.",
  "Google Calendar",
  "Sent email cannot be retracted",
  "historical backups and logs",
  "write freeze and maintenance window",
  "separate owner approval",
  "Preserve system and configuration rows",
  "Zero-count verification",
  "No destructive SQL, executor route, helper, runner, deployment, configuration change, Automation toggle, external send, or data write is authorized or included.",
  "### OTS Test Artifact Cleanup Evidence (2026-07-15)",
  "0 OTS image objects, 0 OTS proof rows, and 2 dashboard-created empty-folder placeholders",
  "Both Storage API delete requests returned HTTP 200",
  "Default-rate fingerprint remained unchanged and Automation remained ON",
  "### Encrypted Logical Export And Restore Verification Evidence (2026-07-15)",
  "prestige-limo-ops-logical-20260715-165835.tar.enc",
  "The encrypted archive and HMAC integrity sidecar both remain outside the repository",
  "The exact blocker was the unexpected `COPY` into `storage.buckets_vectors`",
  "two current Supabase-documented Storage Vector exclusions",
  "All 40 restored public tables matched the dump's exact per-table row-count map",
  "66 bookings, 95 customers, 5 drivers, 13 invoice records, and 1 rate-setting row",
  "No destructive cleanup is authorized by this restore proof alone",
  "### Fresh Exact Dry-Run And Dedicated-Calendar Inventory (2026-07-15)",
  "35 candidate public tables",
  "31 dedicated-calendar test-booking events",
  "3 in June and 28 in July",
  "0 in May and 0 in the adjacent visible August days",
  "No calendar event was deleted",
  "0 OTS image objects, 0 OTS proof rows, 2 empty-folder placeholders, and 0 unexpected bucket objects",
  "35 public foreign-key constraints and 0 non-internal candidate-table triggers",
  "Automation is ON and was not changed",
  "`PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`",
  "separate exact action-time approval",
  "The 35 candidate tables must all finish at zero rows",
  "The Default-rate fingerprint must remain `6fb76942290057e63f7fecf850e718d2`",
]) {
  assertIncludes(packet, fragment);
}

for (const fragment of [
  "### Customer, Booking, And Invoice Test-Data Wipe Approval Packet",
  "The owner declared that all current customer, booking, and invoice records are testing-only.",
  "The owner replaced the previous after-1-August cleanup timing with a pre-1-August old-test-data wipe followed by fresh controlled July fixtures.",
  "The Production scheduler remains unchanged at 1 August 2026 at 08:00 SGT",
  "Recovery readiness is now verified for the encrypted logical export",
  "no candidate wipe table has a non-internal database trigger",
  "must not create the replacement bookings until cleanup verification passes",
  "two billing-ready completed July bookings for one test customer and at least one for a different test customer",
  "fresh count-only inspection found 95 customers, 66 bookings, 5 test-only drivers, 13 customer invoice records, 7 completed closeouts, zero monthly invoice drafts, 115 route points, 65 driver job links",
  "2 Storage objects, and 0 authentication users",
  "one is linked to the current OTS proof and a current test booking, while one is orphaned from both its proof row and booking",
  "Supabase organization is on the Free plan",
  "No deletion, write, configuration change, deployment, Automation toggle, external send, or customer/driver contact occurred.",
  "The owner requested removal of the external tax-retention wording.",
  "`docs/customer-booking-test-data-wipe-approval-packet.md`",
  "`scripts/test-customer-booking-test-data-wipe-approval-packet.mjs`",
  "### OTS Test Artifact Cleanup Evidence (2026-07-15)",
  "0 OTS image objects and 0 OTS proof rows",
  "two dashboard-created empty-folder placeholders",
  "### Encrypted Logical Export And Restore Verification Evidence (2026-07-15)",
  "encrypted roles/schema/data archive exists outside the repository",
  "All 40 public tables matched the dump's exact per-table row-count map",
  "restored protected counts were 66 bookings, 95 customers, 5 drivers, 13 invoice records, and 1 rate-setting row",
  "No Production row, schema, configuration, Automation state, deployment, or external lane changed",
  "### Fresh Cleanup Dry-Run And Dedicated Calendar Inventory (2026-07-15)",
  "31 dedicated `Prestige Ops Calendar` test-booking events",
  "35 candidate public tables",
  "The current deletion-guard Default-rate fingerprint is `6fb76942290057e63f7fecf850e718d2`",
  "No database row, Storage object, calendar event, Automation setting, environment value, deployment, message, or external action changed",
]) {
  assertIncludes(ledger, fragment, `ledger phrase ${fragment}`);
}

assertIncludes(
  suite,
  'script: "scripts/test-customer-booking-test-data-wipe-approval-packet.mjs"',
  "pre-activation suite registration",
);

for (const forbidden of [
  /\bdelete\s+from\b/i,
  /\btruncate\b/i,
  /\bdrop\s+table\b/i,
  /at least five years/i,
  /record-keeping requirement/i,
  /safest wipe timing remains after/i,
  /Execution is deferred until after the first real monthly scheduler proof/i,
  /No wipe approval should be requested now/i,
  /Execution approved now/i,
  /delete Production data now/i,
  /real operations have started/i,
]) {
  assert.doesNotMatch(packet, forbidden, `Packet contains forbidden executable or approval text: ${forbidden}`);
}

for (const forbiddenPath of [
  "scripts/run-customer-booking-test-data-wipe.mjs",
  "app/api/admin-customer-booking-test-data-wipe/route.ts",
]) {
  assert.equal(
    existsSync(forbiddenPath),
    false,
    `Deferred packet must not add an executable wipe path: ${forbiddenPath}`,
  );
}

console.log("customer/booking test-data wipe approval packet guard passed");
