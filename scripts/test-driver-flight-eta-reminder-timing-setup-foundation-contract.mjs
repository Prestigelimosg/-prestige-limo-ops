import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/driver-flight-eta-reminder-timing-setup-foundation.ts", "utf8");

for (const fragment of [
  "driverFlightEtaReminderTimingSetupFoundationVersion",
  "buildDriverFlightEtaReminderTimingSetupFoundation",
  "setup_only",
  "scheduler_status",
  "reminder_send_status",
  "disabled",
  "mng_arrival_flight_eta",
  "mng_arrival_only",
  "future_minutes_before_pickup: 60",
  "future_resend_attempts_before_admin_escalation: 2",
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

console.log("driver flight ETA reminder timing setup foundation contract passed");
