import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const migrationPath =
  "supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql";
const guardScript =
  "scripts/test-driver-live-location-table-rls-migration-scaffold-guard.mjs";
const retentionGuardScript =
  "scripts/test-driver-live-location-table-rls-retention-contract-guard.mjs";
const helperPath = "lib/driver-live-location-scaffold.ts";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";

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

const [
  ledger,
  preactivationSuite,
  migration,
  helper,
  driverRoute,
  adminRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(migrationPath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Table/RLS Migration Scaffold Lock",
);

for (const phrase of [
  "This adds a disabled-by-default SQL migration scaffold for Driver Live Location table/RLS/retention storage.",
  "This migration scaffold is file-only and was not applied to any database in this lane.",
  "No DB read/write, GPS capture, coordinate collection, admin active-jobs map runtime, customer live map, env change, deploy, provider call, provider send, billing/payment/PDF/payout, parser, Save Booking, or `/api/admin-saved-bookings` behavior is activated.",
  "The future latest-position table is `driver_live_location_latest_positions`.",
  "The future bounded audit table is `driver_live_location_audit_events`.",
  "RLS is enabled for both tables with no public, customer, anonymous, broad authenticated, or direct driver policies in this scaffold.",
  "Direct grants to `anon` and `authenticated` are revoked in the scaffold.",
  "The latest-position table is one-row-per-driver-job-link through `driver_live_location_latest_positions_job_link_key`.",
  "The scaffold stores safe driver/job/location operational fields only and excludes raw driver job tokens, token hashes, cookies, JWTs, API keys, service-role keys, customer contact details, customer messages, pricing, payout, PayNow, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, and calendar data.",
  "A later separately approved route/helper evidence lane must prove server-side driver job token resolution, driver write isolation, admin read isolation, stale cleanup, evidence cleanup, zero temporary rows, rollback disabled state, and no customer live map before GPS capture or active map runtime is enabled.",
  "The later approved admin stale-pin DELETE may parse only its bounded booking reference and last-updated timestamp after the admin/dispatcher boundary and closed runtime gate checks; the driver route and scaffold helper still parse no request body.",
  "This lane adds `supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql`, `scripts/test-driver-live-location-table-rls-migration-scaffold-guard.mjs`, updates the table/RLS/retention contract guard for the new migration-scaffold state, and registers the new guard in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger migration scaffold phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation migration guard registration");
assertIncludes(preactivationSuite, retentionGuardScript, "preactivation retention guard registration");

for (const fragment of [
  "Created for review only; do not apply without explicit approval.",
  "create extension if not exists pgcrypto with schema extensions;",
  "create table if not exists public.driver_live_location_latest_positions",
  "create table if not exists public.driver_live_location_audit_events",
  "driver_job_link_id uuid not null references public.driver_job_links(id) on delete cascade",
  "booking_reference text not null",
  "latitude numeric(10, 7) not null",
  "longitude numeric(10, 7) not null",
  "accuracy_meters numeric(10, 2)",
  "heading_degrees numeric(6, 2)",
  "speed_meters_per_second numeric(8, 2)",
  "captured_at timestamptz not null",
  "stale_after timestamptz not null",
  "sharing_state text not null default 'active'",
  "safe_event_context jsonb not null default '{}'::jsonb",
  "alter table public.driver_live_location_latest_positions enable row level security;",
  "alter table public.driver_live_location_audit_events enable row level security;",
  "revoke all on table public.driver_live_location_latest_positions from anon, authenticated;",
  "revoke all on table public.driver_live_location_audit_events from anon, authenticated;",
  "driver_live_location_latest_positions_job_link_key",
  "driver_live_location_latest_positions_stale_after_idx",
  "driver_live_location_audit_events_evidence_reference_idx",
]) {
  assertIncludes(migration, fragment, `migration fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /create\s+policy/i,
  /grant\s+(?:select|insert|update|delete|all)/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch/i,
  /google\.maps|maps\.google|OneMap|ONEMAP|TELEGRAM_BOT_TOKEN|sendMail|sendSms|sendMessage/i,
]) {
  assertExcludes(migration, forbiddenPattern, "migration scaffold");
}

const latestTable = tableDefinition(migration, "driver_live_location_latest_positions");
const auditTable = tableDefinition(migration, "driver_live_location_audit_events");
const tableBodies = `${latestTable}\n${auditTable}`;

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
  assertExcludes(tableBodies, forbiddenPattern, "live-location table column bodies");
}

const runtimeScaffold = `${helper}\n${driverRoute}\n${adminRoute}`;

for (const fragment of [
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "external_send: false",
  "active_jobs: []",
  "{ status: 503 }",
]) {
  assertIncludes(runtimeScaffold, fragment, `runtime remains closed fragment ${fragment}`);
}

const adminDeleteStart = adminRoute.indexOf("export async function DELETE(request: Request)");
const adminDeleteEnd = adminRoute.indexOf("function safeFailureResponse()", adminDeleteStart);
assert.notEqual(adminDeleteStart, -1, "Admin stale-pin DELETE route must exist.");
assert.notEqual(adminDeleteEnd, -1, "Admin stale-pin DELETE route must end before the shared failure helper.");
const adminDeleteRoute = adminRoute.slice(adminDeleteStart, adminDeleteEnd);
const adminBoundaryCheck = adminDeleteRoute.indexOf("const boundary = requireAdminDispatcherBoundary(request);");
const adminClosedGateCheck = adminDeleteRoute.indexOf("if (!runtimeGateOpen())");
const adminBoundedBodyParser = adminDeleteRoute.indexOf("const body = await request.json().catch(() => null)");
assert.notEqual(adminBoundaryCheck, -1, "Admin stale-pin DELETE must check the admin boundary.");
assert.equal(
  adminBoundaryCheck < adminClosedGateCheck && adminClosedGateCheck < adminBoundedBodyParser,
  true,
  "Admin stale-pin DELETE must authenticate and fail closed before parsing its bounded request body.",
);
assert.equal(
  (adminRoute.match(/request\.json\(/g) ?? []).length,
  1,
  "Admin route must keep exactly one approved stale-pin JSON parser.",
);
assertExcludes(
  `${helper}\n${driverRoute}`,
  /request\.json/i,
  "driver live-location route and scaffold helper",
);

for (const forbiddenPattern of [
  /driver_live_location_latest_positions|driver_live_location_audit_events/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /FormData|arrayBuffer|blob\(/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(runtimeScaffold, forbiddenPattern, "runtime scaffold");
}

console.log("Driver live-location table/RLS migration scaffold guard passed");
