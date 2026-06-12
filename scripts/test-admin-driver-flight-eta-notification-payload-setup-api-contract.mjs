import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/admin-driver-flight-eta-notification-payload-setup/route.ts", "utf8");
const helper = fs.readFileSync("lib/driver-flight-eta-notification-payload-setup.ts", "utf8");
const combined = `${route}\n${helper}`;

for (const fragment of [
  "buildDriverFlightEtaNotificationPayloadSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "driver_app",
  "trip_update",
  "driver_flight_eta_60min_before_pickup",
  "future_minutes_before_pickup: 60",
]) assert.ok(combined.includes(fragment), `Missing fragment: ${fragment}`);

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "sendMessage",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) assert.ok(!combined.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);

console.log("admin driver flight ETA notification payload setup API contract passed");
