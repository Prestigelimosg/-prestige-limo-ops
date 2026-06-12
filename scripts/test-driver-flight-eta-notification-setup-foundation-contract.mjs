import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/driver-flight-eta-notification-setup-foundation.ts", "utf8");

for (const fragment of [
  "driverFlightEtaNotificationSetupFoundationVersion",
  "buildDriverFlightEtaNotificationSetupFoundation",
  "setup_only",
  "notification_send_status",
  "disabled",
  "driver_app",
  "trip_update",
  "queued_later",
  "mng_arrival_only",
  "disabled_not_arrival",
  "customer_update_status",
  "future_minutes_before_pickup: 60",
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
  "telegram",
  "whatsapp",
  "email",
  "sms",
  "push",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) {
  assert.ok(!source.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);
}

console.log("driver flight ETA notification setup foundation contract passed");
