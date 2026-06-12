import fs from "node:fs";
import assert from "node:assert/strict";

const routePath = "app/api/admin-flight-api-setup/route.ts";
const helperPath = "lib/admin-flight-api-setup-foundation.ts";

const route = fs.readFileSync(routePath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const combined = `${route}\n${helper}`;

const requiredFragments = [
  "adminFlightApiSetupFoundationVersion",
  "buildAdminFlightApiSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "flight_api_status",
  "provider_lookup_status",
  "live_eta_status",
  "admin_eta_monitoring_status",
  "driver_eta_notification_status",
  "customer_update_status",
  "mng_arrival_allowed_later",
  "disabled_not_arrival",
  "future_driver_eta_notification_minutes_before_pickup: 60",
  "admin_and_driver_only",
  "booking_ref",
  "flight_no",
  "airport_code",
  "service_code",
];

for (const fragment of requiredFragments) {
  assert.ok(combined.includes(fragment), `Missing admin flight setup API fragment: ${fragment}`);
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
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
];

for (const fragment of forbiddenFragments) {
  assert.ok(
    !combined.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden admin flight setup API fragment found: ${fragment}`,
  );
}

assert.ok(!route.includes("export async function POST"), "Route must not expose POST");
assert.ok(!route.includes("export async function PUT"), "Route must not expose PUT");
assert.ok(!route.includes("export async function PATCH"), "Route must not expose PATCH");
assert.ok(!route.includes("export async function DELETE"), "Route must not expose DELETE");

console.log("admin flight API setup API contract passed");
