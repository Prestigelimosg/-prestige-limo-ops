import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606070001_completed_booking_closeout_persistence.sql",
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
  "Stage 4A-434",
  "do not apply without explicit approval",
  "create table if not exists public.completed_booking_closeouts",
  "booking_reference text not null",
  "closeout_status text not null default 'not_started'",
  "completed_job_status text not null default 'not_confirmed'",
  "dsp_actual_hours_readiness text not null default 'not_applicable'",
  "extra_charges_readiness text not null default 'needs_review'",
  "billing_prep_readiness text not null default 'not_ready'",
  "safe_closeout_note text",
  "safe_closeout_context jsonb not null default '{}'::jsonb",
  "source_surface text not null default 'admin_api'",
  "actor_role text not null default 'admin'",
  "completed_booking_closeouts_booking_reference_key",
  "alter table public.completed_booking_closeouts enable row level security",
  "without public, customer, driver, anonymous, or",
  "broad authenticated policies",
]) {
  assertIncludes(migration, requiredText);
}

for (const closeoutStatus of [
  "not_started",
  "needs_review",
  "ready_for_billing_prep",
  "closed",
]) {
  assertIncludes(migration, `'${closeoutStatus}'`);
}

for (const completedJobStatus of [
  "not_confirmed",
  "completed",
  "completion_exception",
  "needs_review",
]) {
  assertIncludes(migration, `'${completedJobStatus}'`);
}

for (const readinessValue of [
  "not_applicable",
  "not_ready",
  "none",
  "needs_review",
  "ready",
  "blocked",
]) {
  assertIncludes(migration, `'${readinessValue}'`);
}

for (const sourceSurface of ["'admin_api'", "'admin_dashboard'", "'migration'", "'system'"]) {
  assertIncludes(migration, sourceSurface);
}

for (const actorRole of ["'admin'", "'dispatcher'", "'system'"]) {
  assertIncludes(migration, actorRole);
}

for (const requiredConstraint of [
  "constraint completed_booking_closeouts_reference_not_blank check",
  "constraint completed_booking_closeouts_closeout_status_check check",
  "constraint completed_booking_closeouts_completed_job_status_check check",
  "constraint completed_booking_closeouts_dsp_actual_hours_readiness_check check",
  "constraint completed_booking_closeouts_extra_charges_readiness_check check",
  "constraint completed_booking_closeouts_billing_prep_readiness_check check",
  "constraint completed_booking_closeouts_source_surface_check check",
  "constraint completed_booking_closeouts_actor_role_check check",
  "constraint completed_booking_closeouts_safe_context_object check",
  "constraint completed_booking_closeouts_safe_note_length check",
]) {
  assertIncludes(migration, requiredConstraint);
}

assertMatches(
  migration,
  /constraint completed_booking_closeouts_safe_context_object check \(\s*jsonb_typeof\(safe_closeout_context\) = 'object'\s*\)/,
  "Safe closeout context must be constrained to a JSON object.",
);
assertMatches(
  migration,
  /constraint completed_booking_closeouts_safe_note_length check \(\s*safe_closeout_note is null or length\(safe_closeout_note\) <= 1000\s*\)/,
  "Safe closeout note must have a bounded length.",
);
assertNotMatches(
  migration,
  /references\s+public\.bookings\s*\(\s*id\s*\)/i,
  "Completed closeout migration must not couple to historical bookings.id type differences.",
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
  "notification",
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
    `Forbidden completed closeout column present: ${forbiddenColumn}`,
  );
}

console.log("Admin completed booking closeout schema contract remains closed and backend-only.");
