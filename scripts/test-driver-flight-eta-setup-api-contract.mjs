import fs from "node:fs";
import assert from "node:assert/strict";

const routePath = "app/api/driver-job/[token]/flight-eta-setup/route.ts";
const route = fs.readFileSync(routePath, "utf8");

const requiredFragments = [
  "buildAdminFlightApiSetupFoundation",
  "export async function GET",
  "token",
  "token_scoped",
  "setup.status",
  "setup.live_eta_status",
  "driver_eta_notification_status",
  "driver_eta_acknowledgement_status",
  "future_driver_eta_notification_minutes_before_pickup",
  "customer_update_status",
];

for (const fragment of requiredFragments) {
  assert.ok(route.includes(fragment), `Missing driver flight ETA setup fragment: ${fragment}`);
}

const forbiddenFragments = [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "sendMessage",
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
  "admin_eta_monitoring_status",
];

for (const fragment of forbiddenFragments) {
  assert.ok(
    !route.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden driver flight ETA setup fragment found: ${fragment}`,
  );
}

console.log("driver flight ETA setup API contract passed");
