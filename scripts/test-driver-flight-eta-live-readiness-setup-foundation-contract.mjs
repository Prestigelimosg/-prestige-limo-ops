import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/driver-flight-eta-live-readiness-setup-foundation.ts", "utf8");

for (const fragment of [
  "driverFlightEtaLiveReadinessSetupFoundationVersion",
  "buildDriverFlightEtaLiveReadinessSetupFoundation",
  "setup_only",
  "flightaware_aeroapi",
  "provider_token_status",
  "not_configured",
  "external_lookup_status",
  "live_eta_lookup_status",
  "scheduler_status",
  "driver_notification_status",
  "resend_automation_status",
  "admin_alert_status",
  "replacement_driver_action_status",
  "mng_arrival_only",
  "customer_update_status",
  "future_minutes_before_pickup: 60",
  "future_no_ack_attempts_before_escalation: 2",
  "get_replacement_driver",
]) assert.ok(source.includes(fragment), `Missing fragment: ${fragment}`);

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
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) assert.ok(!source.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);

console.log("driver flight ETA live readiness setup foundation contract passed");
