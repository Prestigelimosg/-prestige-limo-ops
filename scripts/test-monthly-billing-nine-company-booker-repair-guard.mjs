import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260902084500_monthly_billing_nine_company_booker_repair.sql";
const guardPath = "scripts/test-monthly-billing-nine-company-booker-repair-guard.mjs";

const [migration, ledger, suite] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

for (const fragment of [
  "set transaction isolation level serializable",
  "monthly_billing_nine_precondition_drift",
  "monthly_billing_nine_dependency_drift",
  "monthly_billing_nine_affected_row_count_mismatch",
  "monthly_billing_nine_protected_row_drift",
  "monthly_billing_nine_postcondition_failed",
  "driver_job_links",
  "driver_job_status_events",
  "completed_booking_closeouts",
  "driver_job_dsp_actual_time_events",
  "admin_app_notification_outbox",
  "customer_driver_app_notification_outbox",
  "customer_invoice_records",
  "monthly_billing_draft_plans",
  "monthly_invoice_drafts",
  "customer_access_accounts",
  "customer_rates = '{}'::jsonb",
  "md5((to_jsonb(b) - 'company_id' - 'booker_id')::text)",
]) {
  assert.ok(migration.includes(fragment), `Missing nine-booking repair contract: ${fragment}`);
}

const targets = [
  [175, "10853", "ADM-20260801124129", 160, "null", 32, 36],
  [179, "10857", "ADM-20260802004935", 163, "null", 31, 24],
  [180, "10858", "ADM-20260802005743", 164, "null", 60, 38],
  [184, "10862", "ADM-20260802085532", 167, "30", 30, 29],
  [194, "10872", "ADM-20260805004012", 161, "42", 42, 35],
  [199, "10877", "ADM-20260808023039-OUT", 180, "46", 46, 31],
  [200, "10878", "ADM-20260808023039-RET", 180, "46", 46, 31],
  [212, "10890", "ADM-20260815035252", 161, "42", 42, 35],
  [218, "10896", "ADM-20260820083526", 190, "51", 51, 34],
];

for (const [rowId, publicRef, bookingRef, customerId, currentCompany, targetCompany, targetBooker] of targets) {
  for (const fragment of [
    String(rowId),
    `'${publicRef}'`,
    `'${bookingRef}'`,
    String(customerId),
    String(targetCompany),
    String(targetBooker),
  ]) {
    assert.ok(migration.includes(fragment), `Missing target ${publicRef} fragment: ${fragment}`);
  }
  if (currentCompany === "null") assert.match(migration, new RegExp(`'${publicRef}'[\\s\\S]{0,220}null`));
}

const persistentUpdates = [...migration.matchAll(/update\s+public\.([a-z_]+)/gi)].map(
  ([, table]) => table,
);
assert.deepEqual(persistentUpdates, ["bookings"]);
assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
assert.doesNotMatch(migration, /insert\s+into\s+public\./i);
assert.doesNotMatch(migration, /alter\s+table\s+public\./i);
assert.doesNotMatch(migration, /update\s+public\.(customers|companies|bookers|travelers|customer_contacts)/i);
assert.doesNotMatch(migration, /update\s+public\.(customer_invoice_records|monthly_billing_draft_plans|monthly_invoice_drafts|customer_access_accounts)/i);
assert.doesNotMatch(migration, /update\s+public\.(driver_job_links|driver_job_status_events|admin_app_notification_outbox|customer_driver_app_notification_outbox)/i);
assert.doesNotMatch(migration, /traveler_id\s*=/i);

assert.ok(ledger.includes("Monthly Billing Nine-Booking Company + Booker Production Repair"));
assert.ok(ledger.includes("10877"));
assert.ok(ledger.includes("10890"));
assert.ok(ledger.includes("Customer `174` remains untouched"));
assert.ok(ledger.includes(guardPath));
assert.ok(suite.includes(guardPath));

console.log("Monthly Billing nine-booking Company + Booker repair guard passed.");
