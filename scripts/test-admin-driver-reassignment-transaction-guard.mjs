import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, persistence, adapter, sender, migration] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/admin-booking-persistence.ts", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  readFile("lib/driver-device-push-notification.ts", "utf8"),
  readFile(
    "supabase/migrations/20260831124441_admin_driver_reassignment_transaction.sql",
    "utf8",
  ),
]);

function includes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

const retiredCopy = ["Job", "cancel,", "do", "not", "proceed."].join(" ");
for (const source of [app, persistence, adapter, sender, migration]) {
  assert.equal(
    source.includes(retiredCopy),
    false,
    "Retired cancellation wording must never be implemented.",
  );
}

for (const fragment of [
  "create or replace function public.apply_admin_driver_reassignment(",
  "security invoker",
  "set search_path = ''",
  "from public.bookings",
  "for update",
  "from public.drivers",
  "lower(btrim(availability_status)) <> 'inactive'",
  "driver_id = v_new_driver_id",
  "driver_name = v_new_driver_name",
  "driver_contact = v_new_driver_contact",
  "driver_plate_number = v_new_driver_plate_number",
  "update public.driver_job_links",
  "link_status = 'expired'",
  "booking_reference = v_booking_reference",
  "driver_id = v_previous_driver_id",
  "link_status = 'active'",
  "revoked_at is null",
  "expires_at > v_now",
  "insert into public.customer_driver_app_notification_outbox",
  "'Job reassigned, do not proceed.'",
  "'driver_reassignment'",
  "insert into public.audit_logs",
  "revoke execute on function public.apply_admin_driver_reassignment",
  "from public, anon, authenticated",
  "grant execute on function public.apply_admin_driver_reassignment",
  "to service_role",
]) {
  includes(migration, fragment, "transactional reassignment SQL");
}

assert.doesNotMatch(
  migration,
  /set\s+revoked_at\s*=/i,
  "Reassignment expiry must preserve revoked_at unchanged.",
);
assert.doesNotMatch(
  migration,
  /delete\s+from\s+public\.(?:driver_job_links|driver_job_status_events)/i,
  "Reassignment must preserve Driver Job Link and Driver Report history.",
);

for (const fragment of [
  'update_mode?: "driver_assignment";',
  '"update_mode"',
  'updateMode === "driver_assignment"',
]) {
  includes(persistence, fragment, "assignment-only update contract");
}

for (const fragment of [
  'input.update_mode === "driver_assignment"',
  '.rpc("apply_admin_driver_reassignment"',
  "sendDriverDevicePushAlertForAppUpdate(",
  'workflow_area: "driver_reassignment"',
  'safe_message: "Job reassigned, do not proceed."',
]) {
  includes(adapter, fragment, "server-only transactional adapter");
}

for (const fragment of [
  '"Job reassigned, do not proceed."',
  'input.workflow_area === "driver_reassignment"',
  "resolveReassignedDriverNotificationTarget(",
  "sendPayloadToDriverSubscriptions(",
]) {
  includes(sender, fragment, "existing Driver push sender reassignment branch");
}

for (const fragment of [
  'update_mode: assignmentOnly ? "driver_assignment" : undefined',
  "await refreshDashboardDriverJobLinksRead([updatedBookingReference])",
]) {
  includes(app, fragment, "Dispatch assignment and queue refresh wiring");
}

console.log("Admin Driver reassignment transaction guard passed.");
