import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync("lib/driver-flight-eta-acknowledgement-setup-foundation.ts", "utf8");

for (const fragment of [
  "driverFlightEtaAcknowledgementSetupFoundationVersion",
  "buildDriverFlightEtaAcknowledgementSetupFoundation",
  "setup_only",
  "acknowledgement_status",
  "driver_action_status",
  "disabled",
  "mng_arrival_only",
  "disabled_not_arrival",
  "mng_arrival_flight_eta",
  "future_required_before_otw: true",
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
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) {
  assert.ok(!source.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);
}

console.log("driver flight ETA acknowledgement setup foundation contract passed");
