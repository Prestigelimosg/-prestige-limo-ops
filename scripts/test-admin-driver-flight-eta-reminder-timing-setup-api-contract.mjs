import fs from "node:fs";
import assert from "node:assert/strict";

const route = fs.readFileSync("app/api/admin-driver-flight-eta-reminder-timing-setup/route.ts", "utf8");
const helper = fs.readFileSync("lib/driver-flight-eta-reminder-timing-setup-foundation.ts", "utf8");
const combined = `${route}\n${helper}`;

for (const fragment of [
  "buildDriverFlightEtaReminderTimingSetupFoundation",
  "driverFlightEtaReminderTimingSetupFoundationVersion",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "scheduler_status",
  "reminder_send_status",
  "future_minutes_before_pickup: 60",
  "future_resend_attempts_before_admin_escalation: 2",
  "get_replacement_driver",
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

console.log("admin driver flight ETA reminder timing setup API contract passed");
