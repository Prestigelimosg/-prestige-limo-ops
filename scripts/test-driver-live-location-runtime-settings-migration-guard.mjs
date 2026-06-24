import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const migrationPath =
  "supabase/migrations/202606240002_driver_live_location_runtime_settings_foundation.sql";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const runnerPath = "scripts/run-driver-live-location-admin-runtime-gate-evidence.mjs";
const guardScript =
  "scripts/test-driver-live-location-runtime-settings-migration-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function tableDefinition(source, tableName) {
  const startNeedle = `create table if not exists public.${tableName} (`;
  const start = source.indexOf(startNeedle);
  assert.notEqual(start, -1, `Missing create table statement for ${tableName}`);

  const tail = source.slice(start + startNeedle.length);
  const end = tail.indexOf("\n);");
  assert.notEqual(end, -1, `Missing end of create table statement for ${tableName}`);

  return tail.slice(0, end);
}

const [ledger, preactivationSuite, migration, runtimeHelper, runner] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(runtimeHelperPath, "utf8"),
    readFile(runnerPath, "utf8"),
  ]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Runtime Settings Migration Scaffold Lock",
);

for (const phrase of [
  "This adds a file-only SQL migration scaffold for the missing `driver_live_location_runtime_settings` table.",
  "The migration is `supabase/migrations/202606240002_driver_live_location_runtime_settings_foundation.sql`.",
  "This migration scaffold was not applied to any database in this lane.",
  "No env change, deploy, DB read/write, GPS capture, admin active-jobs runtime, customer live map, provider call/send, Email/Telegram/WhatsApp/SMS, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work is activated.",
  "The table is a singleton keyed by `setting_name=driver_live_location_runtime`.",
  "Default state is closed: `setting_status=closed`, `driver_live_location_mode=closed`, capture disabled, admin map disabled, and no allowed job references.",
  "The table permits only explicit safe job references and rejects wildcard/all-driver/all-job references.",
  "RLS is enabled with no public, customer, anonymous, broad authenticated, or direct driver policies.",
  "`anon` and `authenticated` grants are revoked; only `service_role` is granted server-side table access.",
  "The future evidence pass must prove closed default state, explicit reference scoping, cleanup/zero-row proof, rollback/disable proof, and no customer live map before runtime evidence can be accepted.",
  "This guard adds `scripts/test-driver-live-location-runtime-settings-migration-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger runtime settings migration phrase ${phrase}`);
}

for (const forbiddenPhrase of [
  "runtime settings migration applied",
  "Driver Live Location is live",
  "GPS capture is active",
  "customer live map is active",
  "all drivers may be tracked",
  "provider sends are enabled",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden ledger claim");
}

assertIncludes(preactivationSuite, guardScript, "preactivation runtime settings guard registration");

for (const fragment of [
  "Created for review only; do not apply without explicit approval.",
  "create table if not exists public.driver_live_location_runtime_settings",
  "setting_name text primary key",
  "setting_status text not null default 'closed'",
  "driver_live_location_capture_enabled boolean not null default false",
  "admin_active_jobs_map_enabled boolean not null default false",
  "driver_live_location_mode text not null default 'closed'",
  "driver_live_location_allowed_job_references text[] not null default '{}'::text[]",
  "driver_live_location_stale_after_seconds integer not null default 300",
  "driver_live_location_retention_minutes integer not null default 120",
  "constraint driver_live_location_runtime_setting_singleton check",
  "setting_name = 'driver_live_location_runtime'",
  "setting_status in ('closed', 'active')",
  "driver_live_location_mode in ('closed', 'runtime')",
  "cardinality(driver_live_location_allowed_job_references) <= 50",
  "array_position(driver_live_location_allowed_job_references, null) is null",
  "driver_live_location_runtime_references_no_wildcards",
  "setting_status = 'active'",
  "or cardinality(driver_live_location_allowed_job_references) = 0",
  "alter table public.driver_live_location_runtime_settings enable row level security;",
  "revoke all on table public.driver_live_location_runtime_settings from anon, authenticated;",
  "grant select, insert, update, delete on table public.driver_live_location_runtime_settings to service_role;",
  "driver_live_location_runtime_settings_status_idx",
  "driver_live_location_runtime_settings_updated_at_idx",
]) {
  assertIncludes(migration, fragment, `runtime settings migration fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /create\s+policy/i,
  /grant\s+(?:select|insert|update|delete|all)[^;]+(?:anon|authenticated)/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch/i,
  /google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
]) {
  assertExcludes(migration, forbiddenPattern, "runtime settings migration scaffold");
}

const tableBody = tableDefinition(migration, "driver_live_location_runtime_settings");

for (const forbiddenPattern of [
  /\braw_?token\b/i,
  /\btoken_hash\b/i,
  /\bcookie\b/i,
  /\bjwt\b/i,
  /\bapi_key\b/i,
  /\bservice_role\b/i,
  /\bcustomer_(?:phone|email|contact|message)\b/i,
  /\bphone\b/i,
  /\bemail\b/i,
  /\bprice\b|\bpricing\b/i,
  /\bpayout\b|\bpaynow\b/i,
  /\bcustomer_rates\b|\bdriver_payout_rules\b/i,
  /\bbilling\b|\bpayment\b|\binvoice\b|\bpdf\b/i,
  /\binternal\b|\badmin_notes?\b|\bparser\b|\bdebug\b/i,
  /\bprovider_payload\b|\braw_provider\b/i,
  /\bots\b|\bphoto\b|\bstorage\b|\bcalendar\b/i,
]) {
  assertExcludes(tableBody, forbiddenPattern, "runtime settings table columns");
}

for (const fragment of [
  'const runtimeSettingsTable = "driver_live_location_runtime_settings";',
  'const runtimeSettingName = "driver_live_location_runtime";',
  "driver_live_location_allowed_job_references",
  "driver_live_location_stale_after_seconds",
  "driver_live_location_retention_minutes",
]) {
  assertIncludes(runtimeHelper, fragment, `runtime helper expects settings fragment ${fragment}`);
  assertIncludes(runner, fragment, `evidence runner expects settings fragment ${fragment}`);
}

console.log("Driver live-location runtime settings migration guard passed");
