import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const routePath = "app/api/customer-live-location-map/route.ts";
const scaffoldHelperPath = "lib/customer-live-location-map-scaffold.ts";
const runtimeHelperPath = "lib/customer-live-location-map-runtime.ts";
const runnerPath = "scripts/run-customer-live-location-link-map-staging-evidence.mjs";
const guardScript =
  "scripts/test-customer-live-location-app-side-gate-readiness-guard.mjs";

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

const [ledger, preactivationSuite, route, scaffoldHelper, runtimeHelper, runner] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(scaffoldHelperPath, "utf8"),
    readFile(runtimeHelperPath, "utf8"),
    readFile(runnerPath, "utf8"),
  ]);

const ledgerSection = sectionBetween(
  ledger,
  "### Customer Live Location App-Side Gate Readiness Guard Lock",
);
const evidenceSection = sectionBetween(
  ledger,
  "### Customer Live Location Map Staging Evidence Record",
);

for (const phrase of [
  "This is a docs/test-only readiness lock for reducing Customer Live Location map runtime dependence on deploy-time Vercel gate flips after the completed staging evidence record.",
  "Customer Live Location remains disabled/not active by default; this lock does not activate customer live location, real GPS, customer-wide live map, provider sends, Vercel env changes, deploy, DB reads/writes, route/helper runtime changes, browser/dashboard automation, or production.",
  "Normal customer live-location evidence and future activation readiness should prefer app-side/admin-controlled gates where already supported instead of Vercel CLI, repeated redeploys, unclear dashboard env flips, or locally injected evidence env values as the only control path.",
  "Vercel CLI is not required for normal customer live-location evidence.",
  "Any future Vercel env or dashboard gate work must be separately approved, explicitly scoped by exact gate names, intended values, target environment, cleanup/rollback window, and post-rollback proof.",
  "App-side/admin-controlled runtime gates, once implemented for customer live location, must be disabled by default, admin/dispatcher-only for writes, same-origin protected, audited, scoped to explicit customer/account and booking references or a small approved allowlist, and rollbackable without a redeploy.",
  "No customer live map exposure may occur without same-origin customer headers, customer session token, account scope, booking scope, eligible service type, stale/offline handling, POB/completed stop behavior, no-forbidden-field proof, and explicit activation/evidence approval.",
  "MNG/Arrival, DEP/Departure, TRF/Transfer, and DSP/Hourly are eligible only through the scoped customer Driver Tracking panel after OTW and driver location sharing.",
  "Customer-visible output must not expose raw driver tokens, raw provider payloads, pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, admin internals, raw booking IDs, customer contact data, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.",
  "Future evidence must prove closed-by-default behavior, no Vercel CLI dependence, app-side/admin-controlled gate open/close where supported, blocked anonymous/wrong-customer/cross-origin access, single scoped customer map marker, stale/offline behavior, POB/completed rollback/stop behavior, cleanup zero rows, and no provider sends.",
  "This guard adds `scripts/test-customer-live-location-app-side-gate-readiness-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger app-side gate phrase ${phrase}`);
}

for (const phrase of [
  "Staging map gates were opened only for the bounded evidence window through Vercel dashboard project env",
  "Rollback proof: `PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ENABLED` was returned to a closed value and staging was redeployed closed.",
  "No real GPS capture occurred.",
  "No customer live map was broadly exposed.",
  "No provider call or provider send occurred.",
]) {
  assertIncludes(evidenceSection, phrase, `staging evidence context ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation app-side gate guard registration");
assertIncludes(
  preactivationSuite,
  "scripts/test-customer-live-location-map-runtime-guard.mjs",
  "customer map runtime guard remains registered",
);
assertIncludes(
  preactivationSuite,
  "scripts/test-customer-live-location-link-map-scaffold-guard.mjs",
  "customer link/map scaffold guard remains registered",
);

for (const fragment of [
  "isCustomerLiveLocationMapRequestBoundaryPresent(request)",
  "isCustomerLiveLocationMapRuntimeCandidateOpen()",
  "customer_live_location_map_boundary_blocked",
  "customer_live_location_map_method_blocked",
]) {
  assertIncludes(route, fragment, `route closed-boundary fragment ${fragment}`);
}

for (const fragment of [
  "customer-live-location-map-scaffold:v1",
  "customerVisible: false",
  "liveMapEnabled: false",
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "external_send: false",
  "customer-live-location-map-read",
  "readCustomerLiveLocationMapSessionToken",
  'request.headers.get("x-prestige-customer-session-token")?.trim() || ""',
]) {
  assertIncludes(scaffoldHelper, fragment, `scaffold closed/default fragment ${fragment}`);
}

for (const fragment of [
  "customer-live-location-map-runtime:v1",
  "driver_live_location_runtime_settings",
  "customer_access_accounts",
  "bookings",
  "readAppSideRuntimePolicy",
  "verifyCustomerBookingScope",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
  "x-prestige-customer-account-reference",
  "readCustomerLiveLocationMapSessionToken(request)",
  "customer_live_location_map_scope_blocked",
  "customer_live_location_map_admin_runtime_gate_closed",
  "customer_live_location_map_customer_auth_blocked",
  "customer_live_location_map_service_blocked",
  "booking_reference_label: \"scoped\"",
  "external_send: false",
  "gpsCaptureEnabled: false",
  "map_rendered: false",
]) {
  assertIncludes(runtimeHelper, fragment, `runtime scoped gate fragment ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ENABLED",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_MODE",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_SERVICE_CODES",
]) {
  assertIncludes(
    scaffoldHelper,
    fragment,
    `scaffold app-side gate state fragment ${fragment}`,
  );
}

for (const fragment of [
  "customer-live-location-link-map-staging-evidence-approved",
  "pre-window",
  "runtime-window",
  "post-rollback",
  "cleanup_zero_rows: true",
  "provider_send: false",
  "gps_activation: false",
  "customer_live_map: false",
]) {
  assertIncludes(runner, fragment, `runner guarded evidence fragment ${fragment}`);
}

const currentSources = `${route}\n${scaffoldHelper}\n${runtimeHelper}\n${runner}`;

for (const forbiddenPattern of [
  /\bnpx\s+vercel\b/i,
  /\bvercel\s+env\b/i,
  /\bvercel\s+--prod\b/i,
  /browser\.goto\(["']https:\/\/vercel/i,
  /dashboard automation/i,
]) {
  assertExcludes(
    currentSources,
    forbiddenPattern,
    "customer live-location source must not require Vercel CLI/dashboard automation",
  );
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
]) {
  assertExcludes(currentSources, forbiddenPattern, "customer live-location no-provider/no-GPS source");
}

for (const forbiddenPhrase of [
  "customer live location is active",
  "customer live map is active",
  "customer-wide live map is active",
  "all customers may track drivers",
  "all customers may track drivers",
  "provider sends are enabled",
  "Vercel CLI is required",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden customer app-side gate claim");
}

console.log("Customer live-location app-side gate readiness guard passed");
