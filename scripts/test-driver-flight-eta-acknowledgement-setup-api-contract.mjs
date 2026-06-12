import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/driver-job/[token]/flight-eta-acknowledgement-setup/route.ts", "utf8");
const helper = fs.readFileSync("lib/driver-flight-eta-acknowledgement-setup-foundation.ts", "utf8");
const combined = `${route}\n${helper}`;

for (const fragment of [
  "buildDriverFlightEtaAcknowledgementSetupFoundation",
  "driverFlightEtaAcknowledgementSetupFoundationVersion",
  "export async function GET",
  "token",
  "setup_only",
  "acknowledgement_status",
  "driver_action_status",
  "resend_status",
  "admin_escalation_status",
  "mng_arrival_only",
  "future_resend_attempts_before_admin_escalation: 2",
  "get_replacement_driver",
]) {
  assert.ok(combined.includes(fragment), `Missing fragment: ${fragment}`);
}

for (const fragment of [
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
]) {
  assert.ok(!combined.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);
}

console.log("driver flight ETA acknowledgement setup API contract passed");
