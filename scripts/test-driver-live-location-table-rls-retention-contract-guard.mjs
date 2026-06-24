import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-table-rls-retention-contract-guard.mjs";
const disabledScaffoldGuard =
  "scripts/test-driver-live-location-disabled-scaffold-guard.mjs";
const helperPath = "lib/driver-live-location-scaffold.ts";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const futureLatestTable = "driver_live_location_latest_positions";
const futureAuditTable = "driver_live_location_audit_events";

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
  disabledScaffoldGuardSource,
  helper,
  driverRoute,
  adminRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(disabledScaffoldGuard, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Table/RLS/Retention Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future Driver Live Location table/RLS/retention evidence.",
  "This lock does not create migrations, tables, RLS policies, coordinate storage, GPS capture, runtime DB reads/writes, admin active-jobs map runtime, customer live map links, env changes, deploy, provider calls, or production activation.",
  "`driver_live_location_latest_positions` is the future latest-position state table name only; it is not created in this lane.",
  "`driver_live_location_audit_events` is the future bounded audit-event table name only; it is not created in this lane.",
  "Future latest-position rows are limited to driver job link reference, booking reference, driver display label, assigned job label, job status, vehicle/plate label if assigned, latitude, longitude, accuracy meters, heading degrees, speed meters per second, captured at, stale after, sharing state, source surface, evidence reference when applicable, and updated at.",
  "Future audit-event rows are limited to event type, driver job link reference, booking reference, occurred at, safe event context, source surface, actor role, evidence reference when applicable, and created at.",
  "Future driver write isolation must resolve the current driver job token server-side, must not accept arbitrary booking references from the browser, and must allow writes only for the resolved active assigned driver job.",
  "Future admin read isolation must require the internal admin/dispatcher boundary, same-origin admin surface, and gate approval before any active-jobs map rows are read.",
  "Future direct table access must block anonymous, customer, wrong-driver, wrong-token, and non-admin paths through RLS or equivalent database policy proof.",
  "Future retention must prefer one latest-position row per active sharing driver/job plus bounded audit events, not unbounded coordinate history.",
  "Future stale cleanup must define stale/offline thresholds, retention minutes, evidence row cleanup, and zero matching temporary rows after evidence.",
  "Future evidence must prove closed gates, fake/staging-safe rows first, wrong-driver blocked, wrong-admin blocked, forbidden fields absent, cleanup zero rows, rollback disabled, and no customer live map.",
  "Future table rows must not contain raw driver job tokens, token hashes, cookies, JWTs, API keys, service-role keys, customer contact details, customer messages, pricing, payout, PayNow, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.",
  "This guard keeps the current disabled scaffold closed until a separately approved table/RLS migration scaffold is reviewed and promoted.",
  "This guard adds `scripts/test-driver-live-location-table-rls-retention-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger table/RLS phrase ${phrase}`);
}

for (const fragment of [
  "`PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`",
  "`PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_MODE`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`",
]) {
  assertIncludes(ledgerSection, fragment, `ledger env name ${fragment}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation table/RLS guard registration");
assertIncludes(
  preactivationSuite,
  disabledScaffoldGuard,
  "preactivation disabled scaffold guard remains registered",
);
assertIncludes(disabledScaffoldGuardSource, "Driver Live Location Disabled Scaffold Implementation");

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
  assertIncludes(runtimeScaffold, fragment, `current scaffold remains closed fragment ${fragment}`);
}

for (const forbiddenPattern of [
  new RegExp(futureLatestTable, "i"),
  new RegExp(futureAuditTable, "i"),
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /request\.json|FormData|arrayBuffer|blob\(/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP/i,
  /TELEGRAM_BOT_TOKEN|messages\.create|sendMail\s*\(|sendSms\s*\(|sendMessage\s*\(/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /raw_token|token_hash|internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(runtimeScaffold, forbiddenPattern, "current runtime scaffold");
}

console.log("Driver live-location table/RLS/retention contract guard passed");
