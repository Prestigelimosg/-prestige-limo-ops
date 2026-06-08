import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";

const migrationPath = path.join(
  process.cwd(),
  "supabase/migrations/202606080002_customer_driver_auth_foundation.sql",
);
const migration = await readFile(migrationPath, "utf8");
const normalized = migration.replace(/\s+/g, " ").toLowerCase();

function assertIncludes(value, label) {
  assert.ok(normalized.includes(value.toLowerCase()), `Missing auth foundation contract: ${label}`);
}

function assertMatches(pattern, label) {
  assert.match(migration, pattern, `Missing auth foundation pattern: ${label}`);
}

function assertNotMatches(pattern, label) {
  assert.doesNotMatch(migration, pattern, `Forbidden auth foundation pattern: ${label}`);
}

for (const requiredText of [
  "do not apply without explicit approval",
  "create table if not exists public.customer_access_accounts",
  "create table if not exists public.driver_access_accounts",
  "create table if not exists public.customer_driver_access_audit_events",
  "auth_user_id uuid not null",
  "customer_account_reference text not null",
  "driver_reference text not null",
  "account_status text not null default 'pending_setup'",
  "auth_provider text not null default 'supabase_auth'",
  "safe_display_label text not null",
  "safe_event_context jsonb not null default '{}'::jsonb",
  "alter table public.customer_access_accounts enable row level security",
  "alter table public.driver_access_accounts enable row level security",
  "alter table public.customer_driver_access_audit_events enable row level security",
  "without public, anonymous, broad authenticated",
  "later approved auth/RLS stage",
]) {
  assertIncludes(requiredText, requiredText);
}

for (const status of ["pending_setup", "active", "suspended", "revoked"]) {
  assertIncludes(`'${status}'`, `account status ${status}`);
}

for (const eventType of [
  "account_provisioned",
  "account_reviewed",
  "account_activated",
  "account_suspended",
  "account_revoked",
  "session_started",
  "session_blocked",
  "session_ended",
]) {
  assertIncludes(`'${eventType}'`, `audit event ${eventType}`);
}

for (const indexName of [
  "customer_access_accounts_auth_user_id_key",
  "customer_access_accounts_reference_key",
  "driver_access_accounts_auth_user_id_key",
  "driver_access_accounts_reference_key",
  "customer_driver_access_audit_surface_reference_idx",
  "customer_driver_access_audit_auth_user_id_idx",
]) {
  assertIncludes(indexName, indexName);
}

assertMatches(
  /constraint customer_driver_access_audit_context_object check \(\s*jsonb_typeof\(safe_event_context\) = 'object'\s*\)/,
  "safe event context must stay a JSON object",
);
assertMatches(
  /comment on column public\.customer_access_accounts\.auth_user_id is\s+'[^']*not a raw token, password, magic link, refresh token, JWT, session token, or secret\.'/i,
  "customer auth_user_id comment must exclude raw auth secrets",
);
assertMatches(
  /comment on column public\.driver_access_accounts\.safe_display_label is\s+'[^']*Do not store customer prices, billing, invoice\/payment details, payouts, PayNow payout details/i,
  "driver safe label comment must block customer finance exposure",
);

assertNotMatches(/\bcreate\s+policy\b/i, "no RLS policies created in foundation stage");
assertNotMatches(/\balter\s+policy\b/i, "no RLS policy edits in foundation stage");
assertNotMatches(/\bgrant\b/i, "no grants in foundation stage");
assertNotMatches(/\busing\s*\(\s*true\s*\)/i, "no broad RLS using true");
assertNotMatches(/\bwith\s+check\s*\(\s*true\s*\)/i, "no broad RLS check true");
assertNotMatches(/references\s+auth\.users/i, "no direct auth.users coupling before activation");
assertNotMatches(/references\s+public\.customers\s*\(\s*id\s*\)/i, "no customer id type coupling");
assertNotMatches(/references\s+public\.drivers\s*\(\s*id\s*\)/i, "no driver id type coupling");

for (const forbiddenColumn of [
  "raw_token",
  "session_token",
  "refresh_token",
  "jwt",
  "password",
  "magic_link",
  "otp",
  "cookie",
  "claims",
  "customer_price",
  "driver_payout",
  "paynow",
  "billing",
  "invoice",
  "payment",
  "pdf",
  "payout",
  "finance",
  "internal_admin_note",
  "parser_debug",
  "mock_archive",
  "service_role",
  "server_secret",
]) {
  assertNotMatches(
    new RegExp(`(?:add column if not exists\\s+|^\\s*)${forbiddenColumn}\\b\\s+(?:text|jsonb|uuid|bigint|integer|numeric|boolean|timestamptz)`, "im"),
    `forbidden auth foundation column ${forbiddenColumn}`,
  );
}

console.log("Customer/driver auth foundation schema contract tests passed.");
