import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const paths = {
  account: "lib/admin-account-auth.ts",
  client: "app/admin-sign-in/admin-sign-in-form.tsx",
  ledger: "docs/current-implementation-ledger.md",
  migration: "supabase/migrations/20260821133448_admin_auth_pin_attempt_protection.sql",
  preactivation: "scripts/test-preactivation-verification-suite.mjs",
  route: "app/api/admin-auth/session/route.ts",
};

const source = Object.fromEntries(await Promise.all(
  Object.entries(paths).map(async ([key, path]) => [key, await readFile(path, "utf8")]),
));
const normalizedMigration = source.migration.replace(/\s+/g, " ");

for (const phrase of [
  "create table if not exists public.admin_auth_pin_attempts",
  "auth_user_id uuid primary key references auth.users(id) on delete cascade",
  "failed_attempt_count integer not null",
  "window_started_at timestamptz not null",
  "locked_until timestamptz",
  "enable row level security",
  "revoke all on table public.admin_auth_pin_attempts from public, anon, authenticated, service_role",
  "reserve_admin_auth_pin_attempt",
  "clear_admin_auth_pin_attempt",
  "security definer",
  "revoke all on function public.reserve_admin_auth_pin_attempt(uuid) from public, anon, authenticated",
  "grant execute on function public.reserve_admin_auth_pin_attempt(uuid) to service_role",
  "revoke all on function public.clear_admin_auth_pin_attempt(uuid) from public, anon, authenticated",
  "grant execute on function public.clear_admin_auth_pin_attempt(uuid) to service_role",
]) {
  assert.ok(normalizedMigration.includes(phrase), `Admin PIN attempt migration missing: ${phrase}`);
}

for (const phrase of [
  "signInWithPassword",
  "reserve_admin_auth_pin_attempt",
  "clear_admin_auth_pin_attempt",
  "normalizedAdminPin",
  'const adminAccountSignInEmail = "info@prestigelimo.sg"',
  '.eq("auth_email", adminAccountSignInEmail)',
  '.eq("account_status", "active")',
  "signOut({ scope: \"local\" })",
]) {
  assert.ok(source.account.includes(phrase), `Admin PIN verifier missing: ${phrase}`);
}
for (const forbidden of ["signInWithOtp", "verifyOtp", "requestAdminAccountOtp", "verifyAdminAccountOtp"]) {
  assert.equal(source.account.includes(forbidden), false, `Retired Admin OTP helper remains: ${forbidden}`);
}

for (const phrase of [
  'body.action !== "sign_in"',
  '["action", "pin"]',
  "signInAdminAccountWithPin",
  'reason: "invalid_credentials"',
  "issueAdminAccountSession",
]) {
  assert.ok(source.route.includes(phrase), `Admin PIN route missing: ${phrase}`);
}
for (const forbidden of ["request_code", "verify_code", "token", "email"]) {
  assert.equal(source.route.includes(forbidden), false, `Retired Admin OTP route field remains: ${forbidden}`);
}

for (const phrase of [
  'type="password"',
  'inputMode="numeric"',
  'autoComplete="current-password"',
  'pattern="[0-9]{6}"',
  "Enter 6-digit Admin PIN",
  "pin.length !== 6",
]) {
  assert.ok(source.client.includes(phrase), `Admin PIN form missing: ${phrase}`);
}
for (const forbidden of ["Send 6-digit code", "one-time-code", "request_code", "verify_code", "setEmail", "setToken"]) {
  assert.equal(source.client.includes(forbidden), false, `Retired Admin OTP UI remains: ${forbidden}`);
}
for (const forbidden of [
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_PUBLISHABLE_KEY",
  "PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET",
  "info@prestigelimo.sg",
]) {
  assert.equal(source.client.includes(forbidden), false, `Admin PIN client must not expose ${forbidden}`);
}
for (const [key, forbidden] of [
  ["account", "console."],
  ["route", "console."],
  ["route", "URLSearchParams"],
  ["route", "searchParams"],
  ["client", "localStorage"],
  ["client", "sessionStorage"],
]) {
  assert.equal(source[key].includes(forbidden), false, `${key} must not expose the PIN through ${forbidden}`);
}

assert.ok(
  source.preactivation.includes("scripts/test-admin-pin-sign-in-guard.mjs"),
  "Admin PIN guard must run in preactivation verification",
);
for (const phrase of [
  "Admin Six-Digit PIN Sign-In Repair (2026-08-21)",
  "durable server-only attempt protection",
  "scripts/test-admin-pin-sign-in-guard.mjs",
]) {
  assert.ok(source.ledger.includes(phrase), `Admin PIN ledger checkpoint missing: ${phrase}`);
}

console.log("Admin six-digit PIN sign-in guard passed.");
