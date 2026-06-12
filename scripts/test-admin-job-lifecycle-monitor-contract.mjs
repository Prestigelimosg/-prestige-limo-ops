import fs from "node:fs";
import assert from "node:assert/strict";
import { buildAdminJobLifecycleMonitor } from "../lib/admin-job-lifecycle-monitor.ts";

const source = fs.readFileSync("lib/admin-job-lifecycle-monitor.ts", "utf8");

const requiredFragments = [
  "adminJobLifecycleMonitorVersion",
  "buildAdminJobLifecycleMonitor",
  "job_card_created",
  "driver_assigned",
  "driver_acknowledged",
  "driver_otw",
  "driver_ots",
  "passenger_on_board",
  "job_completed",
  "billing_ready",
  "monthly_billing_linked",
  "attention_required",
];

for (const fragment of requiredFragments) {
  assert.ok(source.includes(fragment), `Missing lifecycle fragment: ${fragment}`);
}

const partialLifecycle = buildAdminJobLifecycleMonitor({
  booking_ref: "PLO-LIFECYCLE-MISSING",
  driver_id: "42",
  job_card_created_at: "2026-06-12T08:00:00.000Z",
});

assert.equal(partialLifecycle.status, "attention_required");
assert.deepEqual(partialLifecycle.missing_checkpoints, [
  "driver_acknowledged",
  "driver_otw",
  "driver_ots",
  "passenger_on_board",
  "job_completed",
  "billing_ready",
  "monthly_billing_linked",
]);
assert.deepEqual(
  partialLifecycle.checkpoints.map((checkpoint) => checkpoint.label),
  [
    "Job Card Created",
    "Driver Assigned",
    "Driver Acknowledged",
    "OTW",
    "OTS",
    "POB",
    "Job Completed",
    "Billing Ready",
    "Monthly Billing / Invoice Draft Linked",
  ],
);

const completeLifecycle = buildAdminJobLifecycleMonitor({
  billing_readiness_status: "ready",
  booking_ref: "PLO-LIFECYCLE-COMPLETE",
  driver_acknowledged_at: "2026-06-12T08:05:00.000Z",
  driver_id: "42",
  driver_otw_at: "2026-06-12T08:10:00.000Z",
  driver_ots_at: "2026-06-12T08:30:00.000Z",
  job_card_created_at: "2026-06-12T08:00:00.000Z",
  job_completed_at: "2026-06-12T09:30:00.000Z",
  monthly_invoice_draft_id: "draft-safe-001",
  passenger_on_board_at: "2026-06-12T08:45:00.000Z",
});

assert.equal(completeLifecycle.status, "complete");
assert.deepEqual(completeLifecycle.missing_checkpoints, []);

const forbiddenFragments = [
  "fetch(",
  "createClient",
  "supabase",
  "sendMessage",
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
  "live_location",
  "photo",
  "process.env",
];

for (const fragment of forbiddenFragments) {
  assert.ok(!source.includes(fragment), `Forbidden fragment found: ${fragment}`);
}

assert.ok(!source.includes("/api/"), "Helper must not define or call an API route");
assert.ok(!source.includes("POST"), "Helper must remain read-only");
assert.ok(!source.includes("PATCH"), "Helper must remain read-only");
assert.ok(!source.includes("DELETE"), "Helper must remain read-only");

console.log("admin job lifecycle monitor contract passed");
