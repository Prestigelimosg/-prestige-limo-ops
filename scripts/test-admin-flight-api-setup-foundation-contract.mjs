import fs from "node:fs";
import assert from "node:assert/strict";

const sourcePath = "lib/admin-flight-api-setup-foundation.ts";
const source = fs.readFileSync(sourcePath, "utf8");

const requiredFragments = [
  "adminFlightApiSetupFoundationVersion",
  "buildAdminFlightApiSetupFoundation",
  "setup_only",
  "flight_api_status",
  "provider_lookup_status",
  "live_eta_status",
  "admin_eta_monitoring_status",
  "driver_eta_notification_status",
  "driver_eta_acknowledgement_status",
  "customer_update_status",
  "disabled",
  "mng_arrival_allowed_later",
  "disabled_not_arrival",
  "mng_arrival_eta_monitoring",
  "manual_review_only",
  "future_driver_eta_notification_minutes_before_pickup: 60",
  "admin_and_driver_only",
  "Flight ETA monitoring is for MNG/Arrival jobs only.",
];

for (const fragment of requiredFragments) {
  assert.ok(source.includes(fragment), `Missing flight setup fragment: ${fragment}`);
}

const forbiddenFragments = [
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "/api/",
  "process.env",
  "aviationstack",
  "flightaware",
  "flightstats",
  "flightradar",
  "opensky",
  "aeroapi",
  "cirium",
  "airlabs",
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
];

for (const fragment of forbiddenFragments) {
  assert.ok(
    !source.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden flight setup fragment found: ${fragment}`,
  );
}

console.log("admin flight API setup foundation contract passed");
