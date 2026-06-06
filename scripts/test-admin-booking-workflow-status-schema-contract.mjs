import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606060001_admin_booking_workflow_status_persistence.sql",
);

function assertIncludes(text, expected, message = `Missing required text: ${expected}`) {
  assert.ok(text.includes(expected), message);
}

function assertMatches(text, pattern, message = `Missing required pattern: ${pattern}`) {
  assert.match(text, pattern, message);
}

function assertNotMatches(text, pattern, message = `Forbidden pattern present: ${pattern}`) {
  assert.doesNotMatch(text, pattern, message);
}

const migration = await readFile(migrationPath, "utf8");

for (const requiredText of [
  "Stage 4A-427",
  "do not apply without explicit approval",
  "create table if not exists public.booking_workflow_statuses",
  "booking_reference text not null",
  "workflow_area text not null",
  "status_value text not null",
  "status_label text",
  "source_surface text not null default 'admin_api'",
  "actor_role text not null default 'admin'",
  "safe_status_context jsonb not null default '{}'::jsonb",
  "booking_workflow_statuses_reference_area_key",
  "alter table public.booking_workflow_statuses enable row level security",
  "without public, customer, driver, anonymous, or",
  "broad authenticated policies",
]) {
  assertIncludes(migration, requiredText);
}

for (const workflowArea of [
  "admin_booking_review",
  "dispatch_release",
  "driver_acknowledgement",
  "driver_job_progress",
  "day_of_trip_exception",
  "dispatch_recovery",
  "trip_completion",
  "closeout_review",
]) {
  assertIncludes(migration, `'${workflowArea}'`);
}

for (const statusValue of [
  "not_started",
  "needs_review",
  "ready",
  "released",
  "pending_acknowledgement",
  "acknowledged",
  "no_response_needs_call",
  "otw",
  "ots",
  "pob",
  "completed",
  "exception_open",
  "recovery_review",
  "closed",
]) {
  assertIncludes(migration, `'${statusValue}'`);
}

for (const sourceSurface of ["'admin_api'", "'admin_dashboard'", "'migration'", "'system'"]) {
  assertIncludes(migration, sourceSurface);
}

for (const actorRole of ["'admin'", "'dispatcher'", "'system'"]) {
  assertIncludes(migration, actorRole);
}

assertMatches(
  migration,
  /constraint booking_workflow_statuses_safe_context_object check \(\s*jsonb_typeof\(safe_status_context\) = 'object'\s*\)/,
  "Safe context must be constrained to a JSON object.",
);
assertNotMatches(
  migration,
  /references\s+public\.bookings\s*\(\s*id\s*\)/i,
  "Workflow status migration must not couple to historical bookings.id type differences.",
);
assertNotMatches(migration, /\bcreate\s+policy\b/i);
assertNotMatches(migration, /\balter\s+policy\b/i);
assertNotMatches(migration, /\bgrant\b/i);
assertNotMatches(migration, /\busing\s*\(\s*true\s*\)/i);
assertNotMatches(migration, /\bwith\s+check\s*\(\s*true\s*\)/i);

for (const forbiddenColumn of [
  "customer_price",
  "customer_charge",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "amount_due",
  "invoice",
  "invoice_number",
  "payment",
  "payment_link",
  "pdf",
  "pdf_link",
  "stripe",
  "paynow",
  "pay_now",
  "driver_payout",
  "payout",
  "payout_comparison",
  "finance",
  "finance_note",
  "notification_delivery",
  "send_state",
  "send_log",
  "whatsapp_send",
  "sms_send",
  "email_send",
  "telegram",
  "proof",
  "photo",
  "live_location",
  "auth_link",
  "customer_auth",
  "driver_auth",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "parser_learning",
  "parser_debug",
  "mock_archive",
  "mock_qa",
  "dev_workbench",
  "service_role",
  "server_secret",
]) {
  assertNotMatches(
    migration,
    new RegExp(`(?:add column if not exists\\s+|^\\s*)${forbiddenColumn}\\b\\s+(?:text|jsonb|uuid|bigint|integer|numeric|boolean|timestamptz)`, "im"),
    `Forbidden production workflow status column present: ${forbiddenColumn}`,
  );
}

console.log("Admin booking workflow status schema contract remains closed and backend-only.");
