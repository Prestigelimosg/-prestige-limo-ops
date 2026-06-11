import fs from "node:fs";
import assert from "node:assert/strict";

const sourcePath = "lib/admin-live-location-setup-foundation.ts";
const source = fs.readFileSync(sourcePath, "utf8");

const requiredFragments = [
  "adminLiveLocationSetupFoundationVersion",
  "buildAdminLiveLocationSetupFoundation",
  "setup_only",
  "live_location_status",
  "disabled",
  "driver_capture_status",
  "customer_map_status",
  "admin_map_status",
  "allowed_later",
  "disabled_for_customer",
  "future_customer_window_minutes_before_pickup: 30",
  "future_pob_auto_stop_minutes_after_pob: 5",
  "future_otw_trigger",
];

for (const fragment of requiredFragments) {
  assert.ok(source.includes(fragment), `Missing setup fragment: ${fragment}`);
}

const forbiddenFragments = [
  "navigator.geolocation",
  "watchPosition",
  "getCurrentPosition",
  "fetch(",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "/api/",
  "sendMessage",
  "telegram",
  "whatsapp",
  "twilio",
  "wati",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
  "process.env",
];

for (const fragment of forbiddenFragments) {
  assert.ok(
    !source.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden live-location setup fragment found: ${fragment}`,
  );
}

console.log("admin live-location setup foundation contract passed");
