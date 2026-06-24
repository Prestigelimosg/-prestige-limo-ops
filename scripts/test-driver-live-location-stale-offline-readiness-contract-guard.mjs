import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-stale-offline-readiness-contract-guard.mjs";
const liveLocationScaffoldPath = "lib/driver-live-location-scaffold.ts";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const migrationPath =
  "supabase/migrations/202606240001_driver_live_location_table_rls_retention_foundation.sql";
const tableRlsContractGuardPath =
  "scripts/test-driver-live-location-table-rls-retention-contract-guard.mjs";
const tableRlsMigrationGuardPath =
  "scripts/test-driver-live-location-table-rls-migration-scaffold-guard.mjs";

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

const [
  ledger,
  preactivationSuite,
  scaffold,
  driverRoute,
  adminRoute,
  migration,
  tableRlsContractGuard,
  tableRlsMigrationGuard,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(liveLocationScaffoldPath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(migrationPath, "utf8"),
  readFile(tableRlsContractGuardPath, "utf8"),
  readFile(tableRlsMigrationGuardPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Stale/Offline Readiness Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future Driver Live Location stale/offline behavior.",
  "This lock does not activate GPS capture, live-location runtime, admin active-jobs map runtime, customer live map links, route/helper reads or writes, table writes, migration application, env changes, deploy, provider calls, provider sends, billing/payment/PDF/payout, or production activation.",
  "Current state remains closed: driver capture returns blocked/no-op, admin active-jobs returns no rows, customer visibility is false, and no stale/offline calculation is executed at runtime.",
  "Future stale/offline handling must use server-side persisted `captured_at` and `stale_after` values from `driver_live_location_latest_positions`, not browser local time, localStorage, demo/mock state, route text, or customer-visible status text.",
  "Future stale/offline threshold must be explicit through `PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`; if the threshold is missing or invalid, future runtime must fail closed instead of displaying a driver as live.",
  "Future admin active-jobs map must show stale/offline state instead of silently hiding a stale driver, pretending the driver is still live, or exposing a customer live map.",
  "Future stale/offline evidence must prove closed gates, fake/staging-safe rows first, active row shown as active, stale row shown as stale/offline, expired/stopped row excluded or marked stopped, wrong-driver blocked, wrong-admin blocked, cleanup zero temporary rows, rollback disabled, and no customer live map.",
  "Future stale/offline behavior must be scoped to the resolved driver job token and assigned job only; one driver's stale/offline state must not affect another driver/job.",
  "Future stale/offline implementation may not add indefinite polling, retry storm, scheduler, fallback send, provider send, queue, cron, blast, or background worker without separate owner approval.",
  "Future stale/offline fields must be limited to safe operational fields and must not include pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.",
  "This guard adds `scripts/test-driver-live-location-stale-offline-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger stale/offline phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation stale/offline guard registration");

for (const fragment of [
  "stale_after_seconds_configured",
  "PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS",
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "active_jobs: []",
]) {
  assertIncludes(scaffold, fragment, `closed scaffold fragment ${fragment}`);
}

const closedRuntimeSource = `${scaffold}\n${driverRoute}\n${adminRoute}`;

for (const fragment of [
  "{ status: 503 }",
  "sharing_state: \"inactive\"",
  "active_jobs: []",
  "map_rendered: false",
  "marker_count: 0",
]) {
  assertIncludes(closedRuntimeSource, fragment, `closed runtime fragment ${fragment}`);
}

for (const fragment of [
  "captured_at timestamptz not null",
  "stale_after timestamptz not null",
  "constraint driver_live_location_latest_stale_after_order check",
  "stale_after > captured_at",
  "sharing_state in ('active', 'paused', 'stopped', 'stale', 'expired')",
  "driver_live_location_latest_positions_stale_after_idx",
  "'position_stale'",
  "'position_expired'",
]) {
  assertIncludes(migration, fragment, `migration stale/offline fragment ${fragment}`);
}

for (const fragment of [
  "stale/offline thresholds",
  "stale cleanup",
  "zero matching temporary rows",
]) {
  assertIncludes(tableRlsContractGuard, fragment, `table/RLS contract guard fragment ${fragment}`);
}

for (const fragment of [
  "stale_after timestamptz not null",
  "driver_live_location_latest_positions_stale_after_idx",
  "stale cleanup",
]) {
  assertIncludes(tableRlsMigrationGuard, fragment, `table/RLS migration guard fragment ${fragment}`);
}

for (const forbiddenPhrase of [
  "stale/offline runtime is active",
  "GPS capture is active",
  "admin active-jobs map runtime is active",
  "customer live map is active",
  "threshold may be missing",
  "hide stale drivers silently",
  "pretend stale driver is live",
  "provider sends are approved",
  "billing is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden stale/offline activation claim");
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
  /google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
]) {
  assertExcludes(closedRuntimeSource, forbiddenPattern, "closed stale/offline runtime");
}

console.log("Driver live-location stale/offline readiness contract guard passed");
