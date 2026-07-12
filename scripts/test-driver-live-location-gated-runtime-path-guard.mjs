import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-live-location-gated-runtime-path-guard.mjs";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const scaffoldHelperPath = "lib/driver-live-location-scaffold.ts";
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
  runtimeHelper,
  scaffoldHelper,
  driverRoute,
  adminRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(runtimeHelperPath, "utf8"),
  readFile(scaffoldHelperPath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Gated Runtime Path Implementation",
);

for (const phrase of [
  "This wires a disabled-by-default server-only Driver Live Location runtime path behind the existing driver capture and admin active-jobs map scaffold routes.",
  "Default state remains closed: without `PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED=true`, `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED=true`, and `PRESTIGE_DRIVER_LIVE_LOCATION_MODE=runtime` or `evidence`, the routes return the existing safe HTTP 503 no-op scaffold payloads.",
  "The route files do not statically create Supabase clients and do not parse coordinate request bodies before the gate check; the server-only runtime helper is loaded by dynamic import only after the relevant gate and mode are open.",
  "Driver share/stop writes are scoped to the server-resolved driver job token hash and the allowlisted booking references in `PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`.",
  "Driver share accepts only `latitude`, `longitude`, `accuracy_meters`, `heading_degrees`, `speed_meters_per_second`, and `captured_at` from the approved driver job link request body.",
  "Driver stop deletes the latest-position row for the resolved driver job link and writes a bounded audit event.",
  "Admin active-jobs reads remain admin/dispatcher-boundary protected and return only allowlisted active/stale latest-position rows for admin use.",
  "Runtime responses keep `customerVisible: false` and `external_send: false`; customer live-location links and customer tracking remain blocked.",
  "No browser GPS UI activation, no admin browser map rendering, no customer live map link, no provider send, no Telegram live-location send, no Email/WhatsApp/SMS, no Google Maps/OneMap/FlightAware call, no billing/payment/PDF/payout, no parser, no Save Booking, no `/api/admin-saved-bookings`, no auth expansion, no OTS/photo/storage, no calendar, no shim, and no production activation is approved by this lane.",
  "Future evidence still requires a separately approved gate window, safe driver job target, cleanup zero-row proof, rollback proof, and no-forbidden-field proof.",
  "`SUPABASE_URL`",
  "`SUPABASE_SERVICE_ROLE_KEY`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE`",
  "This guard adds `scripts/test-driver-live-location-gated-runtime-path-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger runtime path phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation runtime path guard registration");

for (const fragment of [
  'import "server-only"',
  'driverLiveLocationRuntimeVersion =',
  "createClient",
  "hashDriverJobLinkToken",
  "driver_live_location_latest_positions",
  "driver_live_location_audit_events",
  "driver_job_links",
  "PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES",
  "PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE",
  "PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "allowedRuntimeModes",
  '"runtime"',
  '"evidence"',
  '"latitude"',
  '"longitude"',
  '"accuracy_meters"',
  '"heading_degrees"',
  '"speed_meters_per_second"',
  '"captured_at"',
  "driverLiveLocationRuntimeGateOpen",
  "adminActiveJobsMapRuntimeGateOpen",
  "handleDriverLiveLocationRuntimeRequest",
  "handleAdminActiveJobsMapRuntimeRequest",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(runtimeHelper, fragment, `runtime helper fragment ${fragment}`);
}

for (const fragment of [
  "buildDriverLiveLocationCaptureScaffoldResponse",
  "readDriverLiveLocationScaffoldGateState",
  "runtimeGateOpen",
  "await import(",
  "driver-live-location-runtime",
  "handleDriverLiveLocationRuntimeRequest",
  "{ status: 503 }",
]) {
  assertIncludes(driverRoute, fragment, `driver route gated runtime fragment ${fragment}`);
}

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "buildAdminActiveJobsMapScaffoldResponse",
  "readDriverLiveLocationScaffoldGateState",
  "runtimeGateOpen",
  "await import(",
  "driver-live-location-runtime",
  "handleAdminActiveJobsMapRuntimeRequest",
  "{ status: 503 }",
]) {
  assertIncludes(adminRoute, fragment, `admin route gated runtime fragment ${fragment}`);
}

const publicRouteSource = `${driverRoute}\n${adminRoute}\n${scaffoldHelper}`;

for (const forbiddenPattern of [
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /setInterval|cron|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(publicRouteSource, forbiddenPattern, "public live-location route closed path");
}

assertExcludes(driverRoute, /request\.json|FormData|arrayBuffer|blob\(/i, "public driver route closed path");
assert.equal(
  adminRoute.indexOf("const body = await request.json()") >
    adminRoute.indexOf('if (!runtimeGateOpen())'),
  true,
  "admin stale-pin DELETE must reject the closed runtime gate before reading its body",
);

for (const forbiddenPattern of [
  /NEXT_PUBLIC|PRESTIGE_GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /customer_price\s*:|driver_payout\s*:|customer_rates\s*:|driver_payout_rules\s*:/i,
  /internal_admin\s*:|internal_finance\s*:|parser_debug\s*:|raw_provider\s*:|save booking|admin-saved-bookings/i,
  /setInterval|cron|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(runtimeHelper, forbiddenPattern, "driver live-location gated runtime helper");
}

for (const requiredForbiddenFilter of [
  "customer[_ -]?price",
  "driver[_ -]?payout",
  "customer[_ -]?phone",
  "customer[_ -]?email",
  "service[_ -]?role",
  "token[_ -]?hash",
]) {
  assertIncludes(
    runtimeHelper,
    requiredForbiddenFilter,
    `runtime helper forbidden text filter ${requiredForbiddenFilter}`,
  );
}

console.log("Driver live-location gated runtime path guard passed");
