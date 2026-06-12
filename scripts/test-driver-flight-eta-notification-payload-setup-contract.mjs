import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/driver-flight-eta-notification-payload-setup.ts", "utf8");

for (const fragment of [
  "driverFlightEtaNotificationPayloadSetupVersion",
  "buildDriverFlightEtaNotificationPayloadSetup",
  "setup_only",
  "driver_app",
  "trip_update",
  "driver_flight_eta_60min_before_pickup",
  "mng_arrival_flight_eta",
  "mng_arrival_only",
  "disabled_not_arrival",
  "notification_send_status",
  "customer_update_status",
  "future_minutes_before_pickup: 60",
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

console.log("driver flight ETA notification payload setup contract passed");
