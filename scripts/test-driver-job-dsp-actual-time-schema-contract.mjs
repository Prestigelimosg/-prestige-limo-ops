import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606100001_driver_job_dsp_actual_time_foundation.sql",
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
  "create table if not exists public.driver_job_dsp_actual_time_events",
  "booking_reference text not null",
  "driver_job_link_id uuid references public.driver_job_links(id) on delete set null",
  "event_type text not null",
  "occurred_at timestamptz not null default now()",
  "safe_event_note text",
  "safe_event_context jsonb not null default '{}'::jsonb",
  "source_surface text not null default 'driver_job_api'",
  "actor_role text not null default 'driver'",
  "create or replace view public.driver_job_dsp_actual_time_summaries",
  "dsp_started_at",
  "dsp_ended_at",
  "total_minutes",
  "actual_time_status",
  "driver_job_dsp_actual_time_events_one_start_per_link",
  "driver_job_dsp_actual_time_events_one_end_per_link",
  "alter table public.driver_job_dsp_actual_time_events enable row level security",
  "without public, customer, driver, anonymous, or",
  "broad authenticated policies",
  "Raw driver job tokens must never be stored or returned",
]) {
  assertIncludes(migration, requiredText);
}

for (const eventType of ["dsp_start", "dsp_end"]) {
  assertIncludes(migration, `'${eventType}'`);
}

for (const summaryStatus of ["complete", "started", "not_started"]) {
  assertIncludes(migration, `'${summaryStatus}'`);
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
  "constraint driver_job_dsp_actual_time_events_reference_not_blank check",
  "constraint driver_job_dsp_actual_time_events_event_type_check check",
  "constraint driver_job_dsp_actual_time_events_context_object check",
  "constraint driver_job_dsp_actual_time_events_note_length check",
  "constraint driver_job_dsp_actual_time_events_source_surface_check check",
  "constraint driver_job_dsp_actual_time_events_actor_role_check check",
]) {
  assertIncludes(migration, requiredConstraint);
}

assertMatches(
  migration,
  /constraint driver_job_dsp_actual_time_events_context_object check \(\s*jsonb_typeof\(safe_event_context\) = 'object'\s*\)/,
  "Safe DSP actual-time context must be constrained to a JSON object.",
);
assertMatches(
  migration,
  /constraint driver_job_dsp_actual_time_events_note_length check \(\s*safe_event_note is null or length\(safe_event_note\) <= 1000\s*\)/,
  "Safe DSP actual-time note must have a bounded length.",
);
assertMatches(
  migration,
  /create unique index if not exists driver_job_dsp_actual_time_events_one_start_per_link\s+on public\.driver_job_dsp_actual_time_events \(driver_job_link_id\)\s+where event_type = 'dsp_start' and driver_job_link_id is not null;/,
  "DSP actual-time evidence must prevent duplicate start events for the same driver job link.",
);
assertMatches(
  migration,
  /create unique index if not exists driver_job_dsp_actual_time_events_one_end_per_link\s+on public\.driver_job_dsp_actual_time_events \(driver_job_link_id\)\s+where event_type = 'dsp_end' and driver_job_link_id is not null;/,
  "DSP actual-time evidence must prevent duplicate end events for the same driver job link.",
);
assertMatches(
  migration,
  /extract\(epoch from \(\s*max\(occurred_at\) filter \(where event_type = 'dsp_end'\)\s*-\s*min\(occurred_at\) filter \(where event_type = 'dsp_start'\)\s*\)\) \/ 60/,
  "DSP actual-time summary must calculate total_minutes from saved start/end evidence.",
);
assertNotMatches(
  migration,
  /\braw_token\b|\btoken\s+text\b|\btoken_value\b|\bplain_token\b|\btoken_hash\b/i,
  "DSP actual-time migration must not store raw or hashed driver job tokens.",
);
assertNotMatches(
  migration,
  /references\s+public\.bookings\s*\(\s*id\s*\)/i,
  "DSP actual-time migration must not couple to historical bookings.id type differences.",
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
    `Forbidden DSP actual-time column present: ${forbiddenColumn}`,
  );
}

console.log("Driver job DSP actual-time schema contract remains closed and backend-only.");
