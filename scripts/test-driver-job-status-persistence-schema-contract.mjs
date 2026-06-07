import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606070004_driver_job_status_persistence_foundation.sql",
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
  "do not apply without explicit approval",
  "create table if not exists public.driver_job_links",
  "create table if not exists public.driver_job_status_events",
  "booking_reference text not null",
  "token_hash text not null",
  "link_status text not null default 'active'",
  "expires_at timestamptz not null",
  "safe_link_context jsonb not null default '{}'::jsonb",
  "status_value text not null",
  "status_source text not null default 'driver_job_api'",
  "safe_status_note text",
  "safe_status_context jsonb not null default '{}'::jsonb",
  "occurred_at timestamptz not null default now()",
  "driver_job_links_token_hash_key",
  "driver_job_status_events_booking_reference_idx",
  "alter table public.driver_job_links enable row level security",
  "alter table public.driver_job_status_events enable row level security",
  "without public, customer, driver, anonymous, or",
  "broad authenticated policies",
  "Raw tokens must never be stored or returned",
]) {
  assertIncludes(migration, requiredText);
}

for (const linkStatus of ["active", "expired", "revoked"]) {
  assertIncludes(migration, `'${linkStatus}'`);
}

for (const statusValue of [
  "acknowledged",
  "driver_otw",
  "ots",
  "pob",
  "completed",
  "needs_call",
]) {
  assertIncludes(migration, `'${statusValue}'`);
}

for (const sourceSurface of [
  "'driver_job_api'",
  "'admin_api'",
  "'admin_dashboard'",
  "'migration'",
  "'system'",
]) {
  assertIncludes(migration, sourceSurface);
}

for (const actorRole of ["'driver'", "'admin'", "'dispatcher'", "'system'"]) {
  assertIncludes(migration, actorRole);
}

for (const requiredConstraint of [
  "constraint driver_job_links_reference_not_blank check",
  "constraint driver_job_links_token_hash_not_blank check",
  "constraint driver_job_links_status_check check",
  "constraint driver_job_links_source_surface_check check",
  "constraint driver_job_links_actor_role_check check",
  "constraint driver_job_links_safe_context_object check",
  "constraint driver_job_status_events_reference_not_blank check",
  "constraint driver_job_status_events_status_value_check check",
  "constraint driver_job_status_events_status_source_check check",
  "constraint driver_job_status_events_source_surface_check check",
  "constraint driver_job_status_events_actor_role_check check",
  "constraint driver_job_status_events_safe_context_object check",
  "constraint driver_job_status_events_safe_note_length check",
]) {
  assertIncludes(migration, requiredConstraint);
}

assertMatches(
  migration,
  /constraint driver_job_links_safe_context_object check \(\s*jsonb_typeof\(safe_link_context\) = 'object'\s*\)/,
  "Safe link context must be constrained to a JSON object.",
);
assertMatches(
  migration,
  /constraint driver_job_status_events_safe_context_object check \(\s*jsonb_typeof\(safe_status_context\) = 'object'\s*\)/,
  "Safe status context must be constrained to a JSON object.",
);
assertMatches(
  migration,
  /constraint driver_job_status_events_safe_note_length check \(\s*safe_status_note is null or length\(safe_status_note\) <= 1000\s*\)/,
  "Safe status note must have a bounded length.",
);
assertMatches(
  migration,
  /create unique index if not exists driver_job_links_token_hash_key\s+on public\.driver_job_links \(token_hash\)/,
  "Driver job link tokens must be unique by hash.",
);
assertNotMatches(
  migration,
  /\braw_token\b|\btoken\s+text\b|\btoken_value\b|\bplain_token\b/i,
  "Migration must not store raw driver job tokens.",
);
assertNotMatches(
  migration,
  /references\s+public\.bookings\s*\(\s*id\s*\)/i,
  "Driver job status migration must not couple to historical bookings.id type differences.",
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
  "billing",
  "billing_amount",
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
    `Forbidden driver status persistence column present: ${forbiddenColumn}`,
  );
}

console.log("Driver job status persistence schema contract remains closed and backend-only.");
