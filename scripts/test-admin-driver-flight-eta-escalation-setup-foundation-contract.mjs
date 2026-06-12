import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/admin-driver-flight-eta-escalation-setup-foundation.ts", "utf8");

for (const fragment of [
  "adminDriverFlightEtaEscalationSetupFoundationVersion",
  "buildAdminDriverFlightEtaEscalationSetupFoundation",
  "setup_only",
  "admin_alert_status",
  "notification_send_status",
  "disabled",
  "admin_app",
  "system_notice",
  "mng_arrival_flight_eta",
  "driver_flight_eta_no_ack_admin_escalation",
  "mng_arrival_only",
  "disabled_not_arrival",
  "future_no_ack_attempts_before_escalation: 2",
  "get_replacement_driver",
  "customer_update_status",
]) {
  assert.ok(source.includes(fragment), `Missing fragment: ${fragment}`);
}

for (const fragment of [
  "fetch(",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "/api/",
  "process.env",
  "sendMessage",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) {
  assert.ok(!source.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);
}

console.log("admin driver flight ETA escalation setup foundation contract passed");
