import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-share-stop-runtime-wiring-guard.mjs";
const runnerScript =
  "scripts/run-driver-live-location-share-stop-runtime-evidence.mjs";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverLiveLocationRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";

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

const [ledger, preactivationSuite, driverJobPage, driverLiveLocationRoute, runtimeHelper, runner] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(driverJobPagePath, "utf8"),
    readFile(driverLiveLocationRoutePath, "utf8"),
    readFile(runtimeHelperPath, "utf8"),
    readFile(runnerScript, "utf8"),
  ]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Share/Stop Runtime Wiring Guard Lock",
);
const liveLocationTypeStart = driverJobPage.indexOf("type DriverLiveLocationApiResponse");
const liveLocationSafetyStart = driverJobPage.indexOf("function driverLiveLocationRoute");
const liveLocationFunctionEnd = driverJobPage.indexOf("async function updateStatus");
assert.notEqual(liveLocationTypeStart, -1, "driver page live-location types must exist.");
assert.notEqual(liveLocationSafetyStart, -1, "driver page live-location route helper must exist.");
assert.notEqual(liveLocationFunctionEnd, -1, "driver page updateStatus boundary must exist.");
const driverPageLiveLocationSafetySource = driverJobPage.slice(
  liveLocationSafetyStart,
  liveLocationFunctionEnd,
);
const appRuntimeSafetySource = `${driverPageLiveLocationSafetySource}\n${driverLiveLocationRoute}\n${runtimeHelper}`;
const appRuntimeSafetySourceWithoutDenylist = appRuntimeSafetySource.replace(
  /function hasForbiddenSafeText[\s\S]*?\n}\n\nfunction asRecord/,
  "function asRecord",
);

for (const phrase of [
  "This wires Driver Live Location Share/Stop controls to the existing driver job link page.",
  "The browser UI is controlled by the loaded driver job state and the server runtime readiness check, not a public build-time env flag.",
  "The browser GPS request is explicit and bounded: it starts only after the driver taps Share Location and `GET /api/driver-job/[token]/live-location` accepts the job.",
  "No browser geolocation request can happen on page load, status updates, app updates, issue reporting, Customer Copy, provider sends, or quick replies.",
  "Share Location calls only the existing job-token scoped `POST /api/driver-job/[token]/live-location` route with safe browser position fields: latitude, longitude, accuracy_meters, heading_degrees, speed_meters_per_second, and captured_at.",
  "Stop Sharing calls only the existing job-token scoped `DELETE /api/driver-job/[token]/live-location` route.",
  "Both Share and Stop require route responses with `customerVisible: false` and `external_send: false`; customer live map remains blocked.",
  "Driver-visible UI remains limited to sharing state, browser permission state, last shared time, stale/offline state, feedback text, and Share/Stop controls.",
  "The evidence runner `scripts/run-driver-live-location-share-stop-runtime-evidence.mjs` is disabled by default, mock/unit only, and performs no DB write, env change, deploy, provider send, real GPS capture, or customer live map activation.",
  "Future live evidence still requires separate owner approval for fake/staging-safe driver job target, gate window, cleanup zero rows, rollback proof, docs evidence, and staging promotion.",
  "This guard adds `scripts/test-driver-live-location-share-stop-runtime-wiring-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger share/stop runtime phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation share/stop guard registration");

for (const fragment of [
  'const driverLiveLocationUiState = pageState.kind === "ready" ? "runtime-check" : "disabled";',
  "checkDriverLiveLocationReadiness",
  "requestDriverLiveLocationPosition",
  "postDriverLiveLocationPosition",
  "startDriverLiveLocationBrowserWatch",
  "stopDriverLiveLocationBrowserWatch",
  "shareDriverLiveLocation",
  "stopDriverLiveLocation",
  "navigator.geolocation.getCurrentPosition",
  "navigator.geolocation.watchPosition",
  "navigator.geolocation.clearWatch",
  "onClick={shareDriverLiveLocation}",
  "onClick={stopDriverLiveLocation}",
  "data-driver-live-location-feedback=\"true\"",
  "data-driver-live-location-share-button={driverLiveLocationUiState}",
  "data-driver-live-location-stop-button={driverLiveLocationUiState}",
  "customerVisible !== false",
  "external_send !== false",
]) {
  assertIncludes(driverJobPage, fragment, `driver page share/stop fragment ${fragment}`);
}

assertMatches(
  driverJobPage,
  /async function shareDriverLiveLocation\(\)[\s\S]*?const ready = await checkDriverLiveLocationReadiness\(\);[\s\S]*?const position = await requestDriverLiveLocationPosition\(\);/,
  "share must pass server readiness before browser geolocation",
);
assertMatches(
  driverJobPage,
  /async function requestDriverLiveLocationPosition\(\)[\s\S]*?navigator\.geolocation\.getCurrentPosition/,
  "browser GPS must stay inside explicit position request helper",
);
assertMatches(
  driverJobPage,
  /if \(!token \|\| pageState\.kind !== "ready"\)/,
  "share/stop routes must fail closed before route calls",
);
assertMatches(
  driverJobPage,
  /function startDriverLiveLocationBrowserWatch\(\)[\s\S]*?navigator\.geolocation\.watchPosition/,
  "continuous sharing must use the browser watch only after explicit Share setup",
);
assertMatches(
  driverJobPage,
  /async function stopDriverLiveLocation\(\)[\s\S]*?stopDriverLiveLocationBrowserWatch\(\);[\s\S]*?method: "DELETE"/,
  "Stop Sharing must clear the browser watch before the guarded stop route",
);

for (const fragment of [
  "allowedPositionFields",
  "customerVisible: false",
  "external_send: false",
  "handleDriverLiveLocationRuntimeRequest",
]) {
  assertIncludes(
    `${driverLiveLocationRoute}\n${runtimeHelper}`,
    fragment,
    `server runtime share/stop fragment ${fragment}`,
  );
}

for (const fragment of [
  "PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_RUNTIME_EVIDENCE_APPROVED",
  "driver-live-location-share-stop-runtime-evidence-approved",
  "mock-unit",
  "db_write: false",
  "provider_send: false",
  "real_gps: false",
  "customer_live_map: false",
]) {
  assertIncludes(runner, fragment, `share/stop runner fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /void\s+shareDriverLiveLocation\(|shareDriverLiveLocation\(\);|shareDriverLiveLocation\(\)\.catch/i,
  /setInterval|setTimeout|sendBeacon|localStorage|sessionStorage/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true/i,
]) {
  assertExcludes(appRuntimeSafetySource, forbiddenPattern, "driver live-location share/stop runtime wiring");
}

assertExcludes(
  appRuntimeSafetySourceWithoutDenylist,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  "driver live-location share/stop runtime wiring without safety denylist",
);

console.log("Driver live-location Share/Stop runtime wiring guard passed");
