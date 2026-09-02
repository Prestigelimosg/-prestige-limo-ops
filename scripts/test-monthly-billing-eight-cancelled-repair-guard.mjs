import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260902021000_monthly_billing_eight_cancelled_repair.sql";
const rollbackPath =
  "supabase/rollback-plans/20260902021000_monthly_billing_eight_cancelled_repair_rollback.sql";
const guardPath = "scripts/test-monthly-billing-eight-cancelled-repair-guard.mjs";

const [migration, rollback, grouping, page, customerBookings, ledger, suite] =
  await Promise.all([
    readFile(migrationPath, "utf8"),
    readFile(rollbackPath, "utf8"),
    readFile("lib/admin-monthly-billing-grouping-read.ts", "utf8"),
    readFile("app/page.tsx", "utf8"),
    readFile("lib/customer-portal-saved-bookings-adapter.ts", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

const targets = [
  [183, "10861", "ADM-20260802030237", "2026-08-03T12:25:01.55Z"],
  [185, "10863", "ADM-20260802090431", "2026-08-02T12:59:32.123Z"],
  [191, "10869", "ADM-20260804041103", "2026-08-05T00:35:34.356Z"],
  [198, "10876", "ADM-20260807103534", "2026-08-19T10:20:56.973Z"],
  [202, "10880", "ADM-20260809014748", "2026-08-19T10:20:33.101Z"],
  [203, "10881", "ADM-20260809014847", "2026-08-19T10:21:06.023Z"],
  [211, "10889", "ADM-20260815011440", "2026-08-16T02:46:27.37Z"],
  [219, "10897", "ADM-20260821154132", "2026-08-28T15:17:42.633Z"],
];

for (const [rowId, publicRef, bookingRef, originalUpdatedAt] of targets) {
  for (const source of [migration, rollback]) {
    for (const fragment of [String(rowId), `'${publicRef}'`, `'${bookingRef}'`]) {
      assert.ok(source.includes(fragment), `Missing ${publicRef} identity: ${fragment}`);
    }
  }
  assert.ok(rollback.includes(originalUpdatedAt), `Missing ${publicRef} rollback timestamp`);
}

for (const fragment of [
  "set transaction isolation level serializable",
  "monthly_billing_eight_cancelled_precondition_drift",
  "monthly_billing_eight_cancelled_dependency_drift",
  "monthly_billing_eight_cancelled_affected_row_count_mismatch",
  "monthly_billing_eight_cancelled_protected_booking_drift",
  "monthly_billing_eight_cancelled_protected_dependency_drift",
  "monthly_billing_eight_cancelled_postcondition_failed",
  "before_dependencies_hash",
  "after_dependencies_hash",
  "b76180ef9dbf9b5c9e26cacb5093c6c9",
  "70cfb10dd464f5fe6a2cf5eb6f465d79",
  "status='cancelled'",
  "admin_internal_status='cancelled'",
  "customer_facing_status='cancelled'",
  "cancellation_review_status='cancelled'",
  "request_review_status='pending_review'",
  "change_review_status is null",
  "2026-09-02T02:10:00Z",
  "customer_invoice_records",
  "monthly_billing_draft_plans",
  "monthly_invoice_drafts",
  "customer_access_accounts",
  "driver_job_links",
  "driver_job_status_events",
  "driver_job_dsp_actual_time_events",
  "driver_live_location_audit_events",
  "driver_ots_photo_proofs",
  "admin_app_notification_outbox",
  "customer_driver_app_notification_outbox",
]) {
  assert.ok(migration.includes(fragment), `Missing guarded cancellation contract: ${fragment}`);
}

for (const fragment of [
  "monthly_billing_eight_cancelled_rollback_precondition_drift",
  "monthly_billing_eight_cancelled_rollback_affected_row_count_mismatch",
  "monthly_billing_eight_cancelled_rollback_postcondition_failed",
  "status='completed'",
  "admin_internal_status='completed'",
  "customer_facing_status='completed'",
  "cancellation_review_status=null",
]) {
  assert.ok(rollback.includes(fragment), `Missing rollback CAS contract: ${fragment}`);
}

const updatedTables = (source) =>
  [...source.matchAll(/update\s+public\.([a-z_]+)/gi)].map(([, table]) => table);
assert.deepEqual(updatedTables(migration), ["bookings"]);
assert.deepEqual(updatedTables(rollback), ["bookings"]);

for (const source of [migration, rollback]) {
  assert.doesNotMatch(source, /insert\s+into\s+public\./i);
  assert.doesNotMatch(source, /delete\s+from\s+public\./i);
  assert.doesNotMatch(source, /alter\s+table\s+public\./i);
  assert.doesNotMatch(source, /update\s+public\.(customers|companies|bookers|travelers|customer_contacts)/i);
  assert.doesNotMatch(source, /update\s+public\.(customer_invoice_records|monthly_billing_draft_plans|monthly_invoice_drafts|customer_access_accounts)/i);
  assert.doesNotMatch(source, /update\s+public\.(driver_job_links|driver_job_status_events|driver_job_dsp_actual_time_events|driver_live_location_audit_events|driver_ots_photo_proofs)/i);
  assert.doesNotMatch(source, /update\s+public\.(admin_app_notification_outbox|customer_driver_app_notification_outbox)/i);
  assert.doesNotMatch(source, /company_id\s*=|booker_id\s*=|traveler_id\s*=|driver_id\s*=/i);
}

assert.ok(grouping.includes('.eq("admin_internal_status", "completed")'));
assert.ok(page.includes('return "Cancelled"'));
assert.ok(customerBookings.includes('return "Cancelled"'));
assert.ok(ledger.includes("Monthly Billing Eight-Booking Owner-Confirmed Cancellation Repair"));
assert.ok(ledger.includes(guardPath));
assert.ok(suite.includes(guardPath));

console.log("Monthly Billing eight-booking cancellation repair guard passed.");
