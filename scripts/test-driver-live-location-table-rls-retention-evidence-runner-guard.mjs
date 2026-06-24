import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-driver-live-location-table-rls-retention-evidence.mjs";
const guardScript =
  "scripts/test-driver-live-location-table-rls-retention-evidence-runner-guard.mjs";
const migrationPath =
  "supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql";
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

const [ledger, preactivationSuite, runner, migration, driverRoute, adminRoute] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(runnerPath, "utf8"),
    readFile(migrationPath, "utf8"),
    readFile(driverRoutePath, "utf8"),
    readFile(adminRoutePath, "utf8"),
  ]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Table/RLS Evidence Runner Guard Lock",
);

for (const phrase of [
  "This adds a disabled-by-default runner scaffold for future Driver Live Location table/RLS/retention evidence.",
  "The runner is `scripts/run-driver-live-location-table-rls-retention-evidence.mjs`.",
  "The runner is not executed by this commit, no migration was applied, and no database read/write occurred.",
  "The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_APPROVED=driver-live-location-table-rls-retention-evidence-approved` before any phase runs.",
  "The runner requires `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_PHASE` to be one of `pre-window`, `db-window`, or `post-rollback`.",
  "The runner is staging-only by default and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_TARGET_URL` or its default.",
  "`pre-window` and `post-rollback` prove the driver capture and admin active-jobs routes are blocked/closed without database access.",
  "`db-window` requires env names only: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY`, `PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE`, `PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID`, and `PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE`.",
  "Future `db-window` evidence may write exactly one fake latest-position row and one fake audit row for a staging-safe driver job link, then must clean them up and prove zero matching rows remain.",
  "Future proof must show anonymous table access is blocked, service-role fixture cleanup succeeds, routes are closed before and after the window, no customer live map is enabled, and no provider sends occur.",
  "The runner output is normalized and must not print Supabase URLs, service-role keys, anon keys, driver job tokens, row IDs, booking references, private customer data, coordinates from real users, cookies, JWTs, API keys, or env values.",
  "This runner does not open gates, edit Vercel env, deploy, apply migrations, activate GPS capture, activate admin active-jobs map runtime, activate customer live map links, call Google Maps/OneMap/FlightAware, send provider messages, or touch billing/payment/PDF/payout.",
  "A future evidence pass still requires separate owner approval for migration application state, staging-safe driver job target, DB evidence window, cleanup/zero-row proof, rollback/disable proof, docs evidence recording, and staging promotion.",
  "This guard adds `scripts/test-driver-live-location-table-rls-retention-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger evidence runner phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation runner guard registration");

for (const fragment of [
  'const approvalEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_APPROVED";',
  'const expectedApproval = "driver-live-location-table-rls-retention-evidence-approved";',
  'const phaseEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_PHASE";',
  'const allowedPhases = new Set(["pre-window", "db-window", "post-rollback"]);',
  'const targetUrlEnvName = "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_TARGET_URL";',
  'const defaultTargetUrl = "https://prestige-limo-ops-staging.vercel.app";',
  'parsed.hostname !== "prestige-limo-ops-staging.vercel.app"',
  '"SUPABASE_URL"',
  '"SUPABASE_SERVICE_ROLE_KEY"',
  '"SUPABASE_ANON_KEY"',
  '"PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE"',
  '"PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_DRIVER_JOB_LINK_ID"',
  '"PRESTIGE_DRIVER_LIVE_LOCATION_EVIDENCE_BOOKING_REFERENCE"',
]) {
  assertIncludes(runner, fragment, `runner required config fragment ${fragment}`);
}

for (const fragment of [
  "/api/driver-job/",
  "/live-location",
  "/api/admin-active-jobs-map-locations",
  "driver_live_location_capture_route_not_closed",
  "admin_active_jobs_map_route_not_blocked_or_closed",
  "expectAnonBlocked",
  "driver_live_location_table_anon_access_not_blocked",
  "fake_latest_rows_written: 1",
  "fake_audit_rows_written: 1",
  "cleanup_zero_rows: true",
  "driver_live_location_fixture_cleanup_failed",
  ".from(latestTable)",
  ".from(auditTable)",
  ".upsert(latestPayload, { onConflict: \"driver_job_link_id\" })",
  ".delete().eq(\"evidence_reference\", evidenceReference)",
  "secrets_printed: false",
]) {
  assertIncludes(runner, fragment, `runner evidence fragment ${fragment}`);
}

for (const fragment of [
  "Created for review only; do not apply without explicit approval.",
  "create table if not exists public.driver_live_location_latest_positions",
  "create table if not exists public.driver_live_location_audit_events",
  "alter table public.driver_live_location_latest_positions enable row level security;",
  "alter table public.driver_live_location_audit_events enable row level security;",
  "revoke all on table public.driver_live_location_latest_positions from anon, authenticated;",
  "revoke all on table public.driver_live_location_audit_events from anon, authenticated;",
]) {
  assertIncludes(migration, fragment, `migration scaffold fragment ${fragment}`);
}

for (const fragment of [
  "{ status: 503 }",
  "buildDriverLiveLocationCaptureScaffoldResponse",
  "buildAdminActiveJobsMapScaffoldResponse",
]) {
  assertIncludes(`${driverRoute}\n${adminRoute}`, fragment, `routes remain closed fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /console\.log\s*\([^)]*process\.env/i,
  /console\.log\s*\([^)]*(?:SUPABASE|SERVICE_ROLE|ANON_KEY|TOKEN|COOKIE|JWT|BOOKING_REFERENCE|DRIVER_JOB_LINK_ID)/i,
  /VERCEL_|vercel\s+(?:env|--prod|deploy)|npx\s+vercel/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /Set-Cookie|cookies\(|localStorage|sessionStorage/i,
]) {
  assertExcludes(runner, forbiddenPattern, "driver live-location table/RLS evidence runner");
}

for (const forbiddenPhrase of [
  "Driver Live Location table/RLS evidence is complete",
  "GPS capture is active",
  "admin active-jobs map is live",
  "customer live map is approved",
  "migration application is complete",
  "provider sends are approved",
  "billing is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden runner ledger claim");
}

console.log("Driver live-location table/RLS/retention evidence runner guard passed");
