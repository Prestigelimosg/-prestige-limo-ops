import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const routePath = "app/api/customer-live-location-map/route.ts";
const helperPath = "lib/customer-live-location-map-scaffold.ts";
const runnerPath = "scripts/run-customer-live-location-link-map-staging-evidence.mjs";
const guardScript = "scripts/test-customer-live-location-link-map-scaffold-guard.mjs";

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

function exportedMethods(source) {
  return [...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)]
    .map((match) => match[1])
    .sort();
}

const [ledger, preactivationSuite, route, helper, runner] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(runnerPath, "utf8"),
]);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Live Location Link/Map Scaffold Guard Lock",
);
const runnerWithoutDenylist = runner.replace(
  /const forbiddenSafeTextPattern =[\s\S]*?;\n\nclass EvidenceFailure/,
  "class EvidenceFailure",
).replace(
  /function assertNoForbiddenRuntimeFields[\s\S]*?\n}\n\nfunction assertSafeClosedBody/,
  "function assertSafeClosedBody",
);

for (const phrase of [
  "This adds a disabled-by-default Customer Live Location link/map scaffold and evidence runner.",
  "The customer map route is `GET /api/customer-live-location-map` and remains closed by default.",
  "The scaffold helper is `lib/customer-live-location-map-scaffold.ts`.",
  "The disabled runner is `scripts/run-customer-live-location-link-map-staging-evidence.mjs`.",
  "No runtime activation occurred, no env was changed, no database read/write occurred, no GPS capture was activated, no provider send occurred, and no customer live map was exposed.",
  "The route requires same-origin customer headers and a customer session token before returning even the closed scaffold response.",
  "Anonymous, cross-origin, missing-session, and write-method access must remain blocked.",
  "Even with a customer boundary, the default response is closed/no-op with `customerVisible false`, `liveMapEnabled false`, `gpsCaptureEnabled false`, `locationStorageEnabled false`, `external_send false`, and zero markers.",
  "If future gates are accidentally opened before runtime evidence setup is ready, the route must fail safely with `customer_live_location_map_runtime_config_not_ready`, `customer_live_location_map_runtime_gate_closed`, or `customer_live_location_map_scope_blocked`.",
  "Future eligible service families remain DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY only; MNG/Arrival remains blocked unless separately approved.",
  "Future evidence must prove customer/account/booking scope, no link for Arrival/MNG, same-customer access only, wrong-customer blocked, stale/offline handling, POB/completed stop behavior, cleanup zero rows, rollback disabled, and no provider sends.",
  "Future customer-visible fields are limited to safe trip label/status, driver sharing state, stale/offline state, last updated time, and map marker context required for tracking.",
  "The scaffold must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, raw driver job tokens, raw booking IDs, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.",
  "The runner requires `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_APPROVED=customer-live-location-link-map-staging-evidence-approved` and `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_PHASE` set to `pre-window`, `runtime-window`, or `post-rollback`.",
  "The runner is staging-only and must target `https://prestige-limo-ops-staging.vercel.app` through `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_TARGET_URL` or its default.",
  "`pre-window` and `post-rollback` prove blocked/closed customer route behavior without database access.",
  "`runtime-window` is disabled by default and may only write one fake staging driver link row and one fake staging latest-position row after explicit runner approval, then must prove customer map read, wrong/anonymous/cross-origin block, cleanup zero rows, and rollback.",
  "This guard adds `scripts/test-customer-live-location-link-map-scaffold-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger customer live-location map phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer live-location map guard registration");

for (const fragment of [
  "customerLiveLocationMapScaffoldVersion",
  "customer-live-location-map-scaffold:v1",
  "readCustomerLiveLocationMapGateState",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ENABLED",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_MODE",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_SERVICE_CODES",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_WINDOW_MINUTES_BEFORE_PICKUP",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_BROWSER_PROVIDER",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_BROWSER_ALLOWED_ORIGINS",
  "buildCustomerLiveLocationMapScaffoldResponse",
  "customer_live_location_map_scaffold_closed",
  "customerVisible: false",
  "external_send: false",
  "gpsCaptureEnabled: false",
  "liveAccessEnabled: false",
  "liveMapEnabled: false",
  "locationStorageEnabled: false",
  "map_rendered: false",
  "marker_count: 0",
  "x-prestige-customer-purpose",
  "x-prestige-customer-session-token",
  "customer-live-location-map-read",
]) {
  assertIncludes(helper, fragment, `helper fragment ${fragment}`);
}

for (const fragment of [
  "buildCustomerLiveLocationMapScaffoldResponse",
  "isCustomerLiveLocationMapRequestBoundaryPresent",
  "isCustomerLiveLocationMapRuntimeGateOpen",
  "handleCustomerLiveLocationMapRuntimeRequest",
  "customer_live_location_map_boundary_blocked",
  "customer_live_location_map_method_blocked",
  "customer_live_location_map_scaffold_failed_safely",
]) {
  assertIncludes(route, fragment, `route fragment ${fragment}`);
}

assert.deepEqual(
  exportedMethods(route),
  ["DELETE", "GET", "PATCH", "POST", "PUT"],
  "customer live-location map route methods",
);

for (const fragment of [
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_APPROVED",
  "customer-live-location-link-map-staging-evidence-approved",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_PHASE",
  'const allowedPhases = new Set(["pre-window", "runtime-window", "post-rollback"]);',
  "https://prestige-limo-ops-staging.vercel.app",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_CUSTOMER_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_ACCOUNT_REFERENCE",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_BOOKING_REFERENCE",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_REFERENCE",
  "fake_driver_job_link_rows_written: 1",
  "fake_latest_position_rows_written: 1",
  "cleanup_zero_rows: true",
  "customer_live_map: false",
  "db_write: false",
  "gps_activation: false",
  "provider_send: false",
  "secrets_printed: false",
]) {
  assertIncludes(runner, fragment, `runner fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /Set-Cookie|cookies\(|localStorage|sessionStorage/i,
]) {
  assertExcludes(helper, forbiddenPattern, "customer live-location map helper");
  assertExcludes(route, forbiddenPattern, "customer live-location map route");
  assertExcludes(
    runnerWithoutDenylist,
    forbiddenPattern,
    "customer live-location map evidence runner",
  );
}

for (const forbiddenPhrase of [
  "customer live map is active",
  "customer live-location link is active",
  "tracking link is live",
  "all customers can track drivers",
  "provider sends are approved",
  "billing is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden customer map activation claim");
}

console.log("Customer live-location link/map scaffold guard passed");
