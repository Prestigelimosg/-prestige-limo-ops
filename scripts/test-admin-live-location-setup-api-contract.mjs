import fs from "node:fs";
import assert from "node:assert/strict";

const routePath = "app/api/admin-live-location-setup/route.ts";
const helperPath = "lib/admin-live-location-setup-foundation.ts";

const route = fs.readFileSync(routePath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const combined = `${route}\n${helper}`;

const requiredFragments = [
  "adminLiveLocationSetupFoundationVersion",
  "buildAdminLiveLocationSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "live_location_status",
  "driver_capture_status",
  "customer_map_status",
  "admin_map_status",
  "disabled",
  "booking_ref",
  "service_code",
  "pickup_at",
];

for (const fragment of requiredFragments) {
  assert.ok(combined.includes(fragment), `Missing live-location setup API fragment: ${fragment}`);
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
  "sendMessage",
  "telegram",
  "whatsapp",
  "twilio",
  "wati",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
  "photo_upload",
  "process.env",
];

for (const fragment of forbiddenFragments) {
  assert.ok(
    !combined.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden live-location API fragment found: ${fragment}`,
  );
}

assert.ok(!route.includes("export async function POST"), "Route must not expose POST");
assert.ok(!route.includes("export async function PUT"), "Route must not expose PUT");
assert.ok(!route.includes("export async function PATCH"), "Route must not expose PATCH");
assert.ok(!route.includes("export async function DELETE"), "Route must not expose DELETE");

console.log("admin live-location setup API contract passed");
