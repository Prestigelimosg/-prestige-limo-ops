import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-live-location-disabled-scaffold-guard.mjs";
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

const [
  ledger,
  preactivationSuite,
  helper,
  driverRoute,
  adminRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Disabled Scaffold Implementation",
);

for (const phrase of [
  "This adds disabled-by-default scaffold routes for future Driver Live Location Capture and Admin Active Jobs Map runtime wiring.",
  "`POST /api/driver-job/[token]/live-location` is present as a future driver share/capture scaffold, but returns safe HTTP 503 no-op.",
  "`DELETE /api/driver-job/[token]/live-location` is present as a future driver stop-sharing scaffold, but returns safe HTTP 503 no-op.",
  "`GET /api/admin-active-jobs-map-locations` is present as a future admin active-jobs map read scaffold, but remains admin-boundary protected and returns safe HTTP 503 no-op with an empty active-jobs list.",
  "The scaffold does not call browser GPS APIs, does not parse coordinate request bodies, does not create a Supabase client, does not read or write location rows, does not render a map, does not read map/provider keys, and does not call Google Maps, OneMap, Telegram, WhatsApp, Email, SMS, or any provider.",
  "The later approved admin stale-pin DELETE may parse only its bounded booking reference and last-updated timestamp after the admin/dispatcher boundary and closed runtime gate checks; the driver route and scaffold helper still parse no request body.",
  "The driver scaffold does not print or return the driver token; it exposes only whether a token parameter was present.",
  "The admin scaffold reuses the internal admin/dispatcher boundary before returning the closed no-op payload.",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`",
  "`PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_MODE`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`",
  "Next activation blockers remain: table/RLS/retention proof for live position storage, driver consent UI, admin active-jobs map UI, browser-safe domain-restricted map key plan if a browser map is needed, closed-gate evidence, fake/staging-safe evidence, cleanup proof, rollback proof, and owner approval.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger scaffold phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation scaffold guard registration");

assertIncludes(driverRoute, "export async function POST", "driver route share verb");
assertIncludes(driverRoute, "export async function DELETE", "driver route stop verb");
assertIncludes(driverRoute, "buildDriverLiveLocationCaptureScaffoldResponse", "driver route helper");
assertIncludes(driverRoute, "{ status: 503 }", "driver route closed status");
assertIncludes(adminRoute, "export async function GET", "admin route read verb");
assertIncludes(adminRoute, "resolveAdminDispatcherBoundary", "admin route boundary");
assertIncludes(adminRoute, "buildAdminActiveJobsMapScaffoldResponse", "admin route helper");
assertIncludes(adminRoute, "{ status: 503 }", "admin route closed status");

for (const fragment of [
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "external_send: false",
  "no_op: true",
  "active_jobs: []",
  "map_rendered: false",
  "marker_count: 0",
  "permission_state: \"not_requested\"",
  "sharing_state: \"inactive\"",
  "PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED",
  "PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE",
]) {
  assertIncludes(helper, fragment, `helper closed scaffold fragment ${fragment}`);
}

const combinedScaffold = `${helper}\n${driverRoute}\n${adminRoute}`;

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
  "driver live-location route and disabled scaffold helper",
);

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /FormData|arrayBuffer|blob\(/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete)\s*\(/i,
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP/i,
  /TELEGRAM_BOT_TOKEN|messages\.create|sendMail\s*\(|sendSms\s*\(|sendMessage\s*\(/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(combinedScaffold, forbiddenPattern, "driver live-location disabled scaffold");
}

console.log("Driver live-location disabled scaffold guard passed");
