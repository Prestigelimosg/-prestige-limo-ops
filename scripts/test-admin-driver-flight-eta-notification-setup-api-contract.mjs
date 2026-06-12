import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/admin-driver-flight-eta-notification-setup/route.ts", "utf8");
const helper = fs.readFileSync("lib/driver-flight-eta-notification-setup-foundation.ts", "utf8");
const combined = `${route}\n${helper}`;

for (const fragment of [
  "buildDriverFlightEtaNotificationSetupFoundation",
  "driverFlightEtaNotificationSetupFoundationVersion",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "notification_send_status",
  "driver_app",
  "trip_update",
  "queued_later",
  "mng_arrival_only",
  "disabled_not_arrival",
  "customer_update_status",
  "future_minutes_before_pickup: 60",
  "booking_reference",
  "driver_job_link_id",
  "flight_no",
  "service_code",
]) {
  assert.ok(combined.includes(fragment), `Missing fragment: ${fragment}`);
}

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
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) {
  assert.ok(!combined.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);
}

console.log("admin driver flight ETA notification setup API contract passed");
