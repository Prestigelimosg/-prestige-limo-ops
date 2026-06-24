import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-consent-ui-readiness-contract-guard.mjs";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverJobDemoPath = "app/driver-job-demo/page.tsx";
const driverLiveLocationRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminActiveJobsRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const scaffoldHelperPath = "lib/driver-live-location-scaffold.ts";

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

function assertMatches(source, pattern, label) {
  assert.equal(pattern.test(source), true, `${label} must match ${pattern}.`);
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
  driverJobPage,
  driverJobDemo,
  driverLiveLocationRoute,
  adminActiveJobsRoute,
  scaffoldHelper,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverJobDemoPath, "utf8"),
  readFile(driverLiveLocationRoutePath, "utf8"),
  readFile(adminActiveJobsRoutePath, "utf8"),
  readFile(scaffoldHelperPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Consent UI Readiness Contract Guard Lock",
);
const disabledScaffoldSection = sectionBetween(
  ledger,
  "### Driver Live Location Consent UI Disabled Scaffold Implementation",
);

for (const phrase of [
  "This is a docs/test-only guard for future Driver Live Location driver consent UI and compact Admin Active Jobs Map UI readiness.",
  "This lock does not activate GPS capture by default, open live-location gates by default, write/read location rows, apply migrations, change env, deploy, expose browser map keys, call Google Maps/OneMap/FlightAware, send Email/Telegram/WhatsApp/SMS, activate customer live map visibility, or touch billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work.",
  "Current state remains disabled by default: driver job pages must not start location sharing on page load and must not silently capture coordinates from status buttons.",
  "Future driver consent UI must live on the existing driver job link surface after the server resolves the current assigned job token.",
  "Future driver consent UI must use an explicit Share Location control, browser permission prompt, visible sharing state, last shared/stale state, and an explicit Stop Sharing control.",
  "Future driver consent UI must make clear that sharing is job-scoped and can be stopped; one driver job token must not see or write another driver/job location.",
  "Future capture must never auto-start from page load, POB, OTW, OTS, completed, copy, email, in-app, Telegram, WhatsApp, or SMS actions.",
  "Future auto-stop may be added only after separately approved persisted status evidence and must stop on POB/completed policy without indefinite polling.",
  "Future admin active-jobs UI must be compact and placed in the existing admin dispatch/active-jobs area, not a new giant card, not a new sector, and not inside Customer Copy.",
  "Future admin active-jobs UI must support simultaneous active jobs with one admin-only marker/status row per actively sharing driver/job and visible stale/offline state.",
  "Future admin active-jobs UI must remain admin/dispatcher-only, same-origin/admin-boundary protected, and must not expose driver coordinates to customers.",
  "Future customer live map links remain not approved; customer portal, customer in-app notifications, and customer copy must not display live driver movement unless separately approved.",
  "Future browser map rendering must not use the existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY`; any browser key requires a separately approved domain-restricted names-only env plan.",
  "Future driver-visible fields are limited to current job sharing state, browser permission state, last shared time, stale/offline state, and share/stop controls.",
  "Future admin-visible fields are limited to driver display label, assigned job label/reference, job status, vehicle/plate label if already assigned, latest latitude/longitude, accuracy, heading/speed if browser provides them, last updated time, stale/offline flag, and sharing state.",
  "Future UI must not show pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.",
  "Future UI evidence must prove closed gates, explicit driver consent, wrong-driver blocked paths, wrong-admin blocked paths, mobile-friendly layout, no text overlap, no new giant cards/sectors, no provider sends, no forbidden fields, rollback/disable, and zero matching temporary location rows after cleanup.",
  "Future runtime must remain separate from Customer In-App, Driver In-App, Customer Copy, Driver Details Email, Google Maps admin search/route estimates, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.",
  "This guard adds `scripts/test-driver-live-location-consent-ui-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger consent UI phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation consent UI guard registration");

for (const forbiddenPhrase of [
  "driver live location UI is live",
  "GPS capture is active",
  "customer live map is approved",
  "all drivers are tracked",
  "all jobs are tracked",
  "browser may use PRESTIGE_GOOGLE_MAPS_API_KEY",
  "auto-start location sharing",
  "new giant card is approved",
  "new UI sector is approved",
  "provider sends are approved",
  "billing may be shown",
  "payout may be shown",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden consent UI activation claim");
}

assertExcludes(
  driverJobPage,
  /watchPosition|clearWatch|void\s+shareDriverLiveLocation\(|shareDriverLiveLocation\(\);|shareDriverLiveLocation\(\)\.catch|gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true/i,
  "driver job production page live-location activation flags",
);

for (const phrase of [
  "This adds a compact disabled Driver Live Location consent UI scaffold to the existing driver job link page.",
  "The scaffold renders explicit Share Location and Stop Sharing controls; runtime handlers are present but disabled by default behind the Share/Stop UI gate and browser GPS gate.",
  "The scaffold shows only driver-visible safe state fields: sharing state, permission state, last shared time, and stale/offline state.",
  "The scaffold does not call `navigator.geolocation` or the driver live-location route unless the gated runtime UI is open and the driver explicitly clicks Share Location or Stop Sharing; it does not read or write location rows while gates are closed, does not open gates, does not create a Supabase client, and does not call providers.",
  "The existing driver live-location capture/stop route remains closed with HTTP 503 safe no-op behavior.",
  "No customer live map link, admin active-jobs map runtime, browser map key, DB write, env change, deploy, provider send, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, auth expansion, or shim work is activated.",
  "Next live-location lane remains a separately approved live evidence pass with explicit driver consent, wrong-driver/wrong-admin blocked proof, cleanup zero rows, rollback proof, and no customer visibility unless separately approved.",
]) {
  assertIncludes(disabledScaffoldSection, phrase, `disabled consent UI scaffold ledger phrase ${phrase}`);
}

const liveLocationUiStart = driverJobPage.indexOf(
  "data-driver-live-location-consent-ui={driverLiveLocationUiState}",
);
assert.notEqual(liveLocationUiStart, -1, "Driver live-location disabled consent UI must exist.");
const liveLocationUiEnd = driverJobPage.indexOf("</section>", liveLocationUiStart);
assert.notEqual(liveLocationUiEnd, -1, "Driver live-location disabled consent UI section must close.");
const liveLocationUi = driverJobPage.slice(liveLocationUiStart, liveLocationUiEnd);

for (const fragment of [
  "Live Location",
  "{driverLiveLocationHelperText}",
  "data-driver-live-location-share-button={driverLiveLocationUiState}",
  "data-driver-live-location-stop-button={driverLiveLocationUiState}",
  "data-driver-live-location-sharing-state={driverLiveLocation.sharingState}",
  "data-driver-live-location-permission-state={driverLiveLocation.permissionState}",
  "data-driver-live-location-last-shared={driverLiveLocation.lastSharedAt ? \"shared\" : \"not_shared\"}",
  "data-driver-live-location-stale-state={driverLiveLocation.staleState}",
  "Share Location",
  "Stop Sharing",
]) {
  assertIncludes(liveLocationUi, fragment, `disabled consent UI fragment ${fragment}`);
}

assertMatches(
  liveLocationUi,
  /data-driver-live-location-share-button=\{driverLiveLocationUiState\}[\s\S]*?disabled=\{driverLiveLocationControlsDisabled\}[\s\S]*?Share Location/,
  "disabled Share Location control",
);
assertMatches(
  liveLocationUi,
  /data-driver-live-location-stop-button=\{driverLiveLocationUiState\}[\s\S]*?disabled=\{driverLiveLocationControlsDisabled\}[\s\S]*?Stop Sharing/,
  "disabled Stop Sharing control",
);
for (const forbiddenPattern of [
  /watchPosition|clearWatch|GeolocationPosition/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(liveLocationUi, forbiddenPattern, "disabled live-location consent UI");
}
for (const fragment of [
  "NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_UI_ENABLED",
  "NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_BROWSER_GPS_ENABLED",
  "driverLiveLocationBrowserGpsEnabled",
  "navigator.geolocation.getCurrentPosition",
  "onClick={shareDriverLiveLocation}",
  "onClick={stopDriverLiveLocation}",
]) {
  assertIncludes(driverJobPage, fragment, `gated consent UI runtime fragment ${fragment}`);
}
assertIncludes(
  driverJobDemo,
  "Mock live location",
  "driver demo live-location copy must remain clearly mock",
);
assertIncludes(
  driverJobDemo,
  "No phone location is captured or sent",
  "driver demo must state no phone location is captured",
);

const closedScaffoldSource = `${driverLiveLocationRoute}\n${adminActiveJobsRoute}\n${scaffoldHelper}`;

for (const fragment of [
  "{ status: 503 }",
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "active_jobs: []",
  "map_rendered: false",
  "marker_count: 0",
  "permission_state: \"not_requested\"",
  "sharing_state: \"inactive\"",
]) {
  assertIncludes(closedScaffoldSource, fragment, `closed scaffold fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /gpsCaptureEnabled\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true/i,
  /request\.json|FormData|arrayBuffer|blob\(/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete)\s*\(/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp|new\s+Resend/i,
  /setInterval|cron|new Worker|retryLoop|retry_loop|polling/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(closedScaffoldSource, forbiddenPattern, "closed live-location scaffold");
}

console.log("Driver live-location consent UI readiness contract guard passed");
