import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const closeoutMigrationPath =
  "supabase/migrations/20260902100000_monthly_billing_twenty_one_closeout_repair.sql";
const dspMigrationPath =
  "supabase/migrations/20260902100100_monthly_billing_10857_dsp_closeout_repair.sql";
const guardPath = "scripts/test-monthly-billing-action-queue-production-repair-guard.mjs";

const [app, browser, closeoutMigration, dspMigration, ledger, suite] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("scripts/test-admin-monthly-billing-dashboard-review-recheck-browser.mjs", "utf8"),
  readFile(closeoutMigrationPath, "utf8"),
  readFile(dspMigrationPath, "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
  readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
]);

for (const fragment of [
  ".filter(adminMonthlyBillingDashboardJobIsActionable)",
  "need Monthly Billing action for",
  "No completed jobs need Monthly Billing action for this month.",
  "data-admin-monthly-billing-dashboard-review-booking",
]) {
  assert.ok(app.includes(fragment), `Missing action-queue contract: ${fragment}`);
}

for (const forbidden of [
  "handleAdminMonthlyBillingDashboardBookingResolve",
  "adminMonthlyBillingDashboardRowKey",
  "resolvedRowKeys",
  "data-admin-monthly-billing-dashboard-resolve-booking",
  'pendingAction: "review" | "resolve"',
]) {
  assert.equal(app.includes(forbidden), false, `Retired Resolve path returned: ${forbidden}`);
}

for (const fragment of [
  "nonActionableReferencesAbsent: true",
  "resolveAbsent: true",
  'labels: ["Needs review", "Unpaid", "Needs review"]',
  "unexpectedMutationCount: mutationRequests.length",
  "protectedLaneRequestCount: protectedLaneRequests.length",
]) {
  assert.ok(browser.includes(fragment), `Missing action-queue browser evidence: ${fragment}`);
}

const closeoutRefs = [
  "ADM-20260801124129","ADM-20260802005743","ADM-20260802085532",
  "ADM-20260802100539","ADM-20260802124426","ADM-20260804050652-OUT",
  "ADM-20260804050652-RET","ADM-20260805004012","ADM-20260805140858",
  "ADM-20260808023039-OUT","ADM-20260808023039-RET","ADM-20260809051726",
  "ADM-20260810024005","ADM-20260811112554","ADM-20260815035252",
  "ADM-20260820083526","ADM-20260826031005","ADM-20260828055053",
  "ADM-20260828060134-OUT","ADM-20260829032714","ADM-20260830124434-OUT",
];

assert.equal(new Set(closeoutRefs).size, 21);
for (const reference of closeoutRefs) {
  assert.ok(closeoutMigration.includes(`'${reference}'`), `Missing closeout target ${reference}`);
}

for (const fragment of [
  "set transaction isolation level serializable",
  "monthly_billing_closeout_booking_precondition_drift",
  "monthly_billing_closeout_record_precondition_drift",
  "monthly_billing_closeout_affected_row_count_mismatch",
  "monthly_billing_closeout_protected_row_drift",
  "monthly_billing_closeout_postcondition_failed",
  "ready_for_billing_prep",
  "Admin marked completed job billing ready from Completed / History.",
  "Ready Locally from the existing Completed Trip Closeout Review control.",
  "Continue customer billing preparation review after closeout.",
  "customer_invoice_records",
  "monthly_billing_draft_plans",
  "monthly_invoice_drafts",
  "customer_access_accounts",
  "driver_job_links",
  "driver_job_status_events",
  "driver_job_dsp_actual_time_events",
  "admin_app_notification_outbox",
  "customer_driver_app_notification_outbox",
]) {
  assert.ok(closeoutMigration.includes(fragment), `Missing guarded 21-closeout evidence: ${fragment}`);
}

for (const fragment of [
  "set transaction isolation level serializable",
  "monthly_billing_10857_booking_precondition_drift",
  "monthly_billing_10857_evidence_precondition_drift",
  "monthly_billing_10857_affected_row_count_mismatch",
  "monthly_billing_10857_protected_row_drift",
  "monthly_billing_10857_postcondition_failed",
  "ADM-20260802004935",
  "2026-08-01T04:00:00.000Z",
  "2026-08-01T06:00:00.000Z",
  "Owner instructed saved pickup plus exactly two hours for Monthly Billing review.",
  "admin_billing_time_correction",
  "ready_for_billing_prep",
]) {
  assert.ok(dspMigration.includes(fragment), `Missing guarded 10857 evidence: ${fragment}`);
}

const persistentTables = (source) => [
  ...source.matchAll(/insert\s+into\s+public\.([a-z_]+)/gi),
].map(([, table]) => table);

assert.deepEqual(persistentTables(closeoutMigration), ["completed_booking_closeouts"]);
assert.deepEqual(persistentTables(dspMigration), [
  "driver_job_dsp_actual_time_events",
  "completed_booking_closeouts",
]);

for (const source of [closeoutMigration, dspMigration]) {
  assert.doesNotMatch(source, /update\s+public\./i);
  assert.doesNotMatch(source, /delete\s+from\s+public\./i);
  assert.doesNotMatch(source, /alter\s+table\s+public\./i);
  assert.doesNotMatch(source, /insert\s+into\s+public\.(bookings|customers|companies|bookers|travelers|customer_invoice_records|monthly_billing_draft_plans|monthly_invoice_drafts|customer_access_accounts|driver_job_links|driver_job_status_events|admin_app_notification_outbox|customer_driver_app_notification_outbox)/i);
}

assert.ok(ledger.includes("Monthly Billing Action Queue And Exact-Booking Review"));
assert.ok(ledger.includes("Monthly Billing Completed Closeout And 10857 DSP Production Repair"));
assert.ok(ledger.includes(guardPath));
assert.ok(suite.includes(guardPath));

console.log("Monthly Billing action queue and Production repair guard passed.");
