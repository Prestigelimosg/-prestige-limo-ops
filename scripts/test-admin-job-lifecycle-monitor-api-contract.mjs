import fs from "node:fs";
import assert from "node:assert/strict";

const routePath = "app/api/admin-job-lifecycle-monitor/route.ts";
const helperPath = "lib/admin-job-lifecycle-monitor.ts";

const route = fs.readFileSync(routePath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const combined = `${route}\n${helper}`;

const requiredRouteFragments = [
  "buildAdminJobLifecycleMonitor",
  "adminJobLifecycleMonitorVersion",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function POST",
  "toMonitorInput",
  "safeString",
  "billing_readiness_status",
  "monthly_invoice_draft_id",
  "monthly_invoice_draft_status",
  "lifecycle",
  "ok: true",
];

for (const fragment of requiredRouteFragments) {
  assert.ok(route.includes(fragment), `Missing route fragment: ${fragment}`);
}

const requiredLifecycleFragments = [
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

for (const fragment of requiredLifecycleFragments) {
  assert.ok(combined.includes(fragment), `Missing lifecycle fragment: ${fragment}`);
}

const forbiddenFragments = [
  "createClient",
  "supabase",
  "fetch(",
  "sendMessage",
  "getUpdates",
  "telegram",
  "whatsapp",
  "twilio",
  "wati",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
  "live_location",
  "photo_upload",
  "process.env.TELEGRAM",
  "process.env.WHATSAPP",
  "process.env.META",
  "process.env.TWILIO",
];

for (const fragment of forbiddenFragments) {
  assert.ok(!combined.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment found: ${fragment}`);
}

assert.ok(!route.includes("export async function PUT"), "Route must not expose PUT");
assert.ok(!route.includes("export async function PATCH"), "Route must not expose PATCH");
assert.ok(!route.includes("export async function DELETE"), "Route must not expose DELETE");

console.log("admin job lifecycle monitor API contract passed");
