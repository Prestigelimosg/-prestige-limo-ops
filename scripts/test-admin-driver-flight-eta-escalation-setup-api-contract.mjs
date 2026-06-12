import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/admin-driver-flight-eta-escalation-setup/route.ts", "utf8");
const helper = fs.readFileSync("lib/admin-driver-flight-eta-escalation-setup-foundation.ts", "utf8");
const combined = `${route}\n${helper}`;

for (const fragment of [
  "buildAdminDriverFlightEtaEscalationSetupFoundation",
  "adminDriverFlightEtaEscalationSetupFoundationVersion",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "admin_alert_status",
  "notification_send_status",
  "admin_app",
  "system_notice",
  "driver_flight_eta_no_ack_admin_escalation",
  "future_no_ack_attempts_before_escalation: 2",
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

console.log("admin driver flight ETA escalation setup API contract passed");
