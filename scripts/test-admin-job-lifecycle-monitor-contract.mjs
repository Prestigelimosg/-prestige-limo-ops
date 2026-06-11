import fs from "node:fs";
import assert from "node:assert/strict";

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
