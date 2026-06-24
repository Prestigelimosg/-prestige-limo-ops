import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-consent-runtime-evidence-contract-guard.mjs";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverLiveLocationRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminActiveJobsRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
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
  driverLiveLocationRoute,
  adminActiveJobsRoute,
  runtimeHelper,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverLiveLocationRoutePath, "utf8"),
  readFile(adminActiveJobsRoutePath, "utf8"),
  readFile(runtimeHelperPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Consent Runtime Evidence Contract Guard Lock",
);
const serverLiveLocationSource = `${driverLiveLocationRoute}\n${adminActiveJobsRoute}\n${runtimeHelper}`;
const serverLiveLocationSourceWithoutDenylist = serverLiveLocationSource.replace(
  /function hasForbiddenSafeText[\s\S]*?\n}\n\nfunction asRecord/,
  "function asRecord",
);

for (const phrase of [
  "This is a docs/test-only guard for the future Driver Live Location driver-consent runtime evidence pass.",
  "Share/Stop runtime wiring remains disabled by default and browser GPS is behind `NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_BROWSER_GPS_ENABLED` plus an explicit Share Location click.",
  "Current driver job pages remain closed by default: the production driver job page must not auto-start sharing from page load or status buttons, and it must not call the live-location route unless the Share/Stop UI gate is explicitly open.",
  "Future evidence must use one fake or staging-safe driver job target only, never a real driver/customer trip, and must not print tokens, booking references, row IDs, coordinates from real users, cookies, env values, API keys, DB URLs, or private customer data.",
  "Future evidence must prove an explicit driver click on Share Location before any browser geolocation request and an explicit driver click on Stop Sharing before the stop route is called.",
  "Future evidence must mock or safely simulate browser geolocation first; real browser GPS, real device location, and silent background location capture are not approved without separate evidence-window approval.",
  "Future evidence must prove no capture on page load, no capture from OTW/OTS/POB/Completed status buttons, no capture from Customer Copy, no capture from Email/Telegram/WhatsApp/SMS, and no capture from in-app notifications or quick replies.",
  "Future evidence must prove driver job token scoping, wrong-driver blocked proof, missing/wrong-admin blocked proof for admin reads, admin active-jobs map safe read proof, stale/offline proof, stop proof, cleanup zero-row proof, and rollback/closed-gate proof.",
  "Future driver-visible fields remain limited to sharing state, browser permission state, last shared time, stale/offline state, and Share/Stop controls.",
  "Future admin-visible fields remain limited to operational marker/status fields already allowed for the admin active-jobs map; customer visibility remains false until a separate customer live-location lane is approved.",
  "Future customer live map links, Customer Copy live-location URLs, customer portal tracking, customer in-app tracking, Telegram true live-location sends, Email/WhatsApp/SMS provider sends, and free-form chat are not approved by this lock.",
  "Future evidence must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin/finance notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.",
  "This guard depends on the completed Driver Live Location table/RLS evidence, admin runtime evidence, runtime settings migration apply, and Vercel env drift names-only audit guard; it does not repeat those lanes.",
  "This guard adds `scripts/test-driver-live-location-consent-runtime-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger consent runtime evidence phrase ${phrase}`);
}

for (const dependencyHeading of [
  "### Driver Live Location Table/RLS Evidence Record",
  "### Driver Live Location Admin Runtime Evidence Record",
  "### Driver Live Location Runtime Settings Migration Scaffold Lock",
  "### Vercel Env Drift Names-Only Audit Guard Lock",
]) {
  assertIncludes(ledger, dependencyHeading, `dependency heading ${dependencyHeading}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation consent runtime evidence guard registration");

for (const forbiddenPhrase of [
  "driver GPS is active",
  "browser GPS is active",
  "customer live map is approved",
  "live tracking is visible to customers",
  "all drivers are tracked",
  "all jobs are tracked",
  "provider sends are approved",
  "free-form chat is approved",
  "billing may be shown",
  "payout may be shown",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden consent runtime evidence claim");
}

const driverLiveLocationUiStart = driverJobPage.indexOf(
  "data-driver-live-location-consent-ui={driverLiveLocationUiState}",
);
assert.notEqual(driverLiveLocationUiStart, -1, "Driver live-location disabled UI must remain present.");
const driverLiveLocationUiEnd = driverJobPage.indexOf("</section>", driverLiveLocationUiStart);
assert.notEqual(driverLiveLocationUiEnd, -1, "Driver live-location disabled UI section must close.");
const driverLiveLocationUi = driverJobPage.slice(driverLiveLocationUiStart, driverLiveLocationUiEnd);

for (const fragment of [
  "data-driver-live-location-share-button={driverLiveLocationUiState}",
  "data-driver-live-location-stop-button={driverLiveLocationUiState}",
  "data-driver-live-location-sharing-state={driverLiveLocation.sharingState}",
  "data-driver-live-location-permission-state={driverLiveLocation.permissionState}",
  "data-driver-live-location-last-shared={driverLiveLocation.lastSharedAt ? \"shared\" : \"not_shared\"}",
  "data-driver-live-location-stale-state={driverLiveLocation.staleState}",
  "Share Location",
  "Stop Sharing",
]) {
  assertIncludes(driverLiveLocationUi, fragment, `disabled driver consent UI fragment ${fragment}`);
}

for (const fragment of [
  "NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_SHARE_STOP_UI_ENABLED",
  "NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION_BROWSER_GPS_ENABLED",
  "driverLiveLocationBrowserGpsEnabled",
  "navigator.geolocation.getCurrentPosition",
  "onClick={shareDriverLiveLocation}",
  "onClick={stopDriverLiveLocation}",
  "customerVisible !== false",
  "external_send !== false",
]) {
  assertIncludes(driverJobPage, fragment, `gated driver live-location runtime fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /void\s+shareDriverLiveLocation\(|shareDriverLiveLocation\(\);|shareDriverLiveLocation\(\)\.catch/i,
  /setInterval|setTimeout|watchPosition|clearWatch/i,
]) {
  assertExcludes(
    driverJobPage,
    forbiddenPattern,
    "driver live-location consent runtime wiring",
  );
}

for (const forbiddenPattern of [
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(driverLiveLocationUi, forbiddenPattern, "driver live-location consent UI");
}

for (const fragment of [
  "customerVisible: false",
  "external_send: false",
  "sharing_state",
  "stale",
  "allowedJobReferences",
  "driver_live_location_allowed_job_references",
]) {
  assertIncludes(
    serverLiveLocationSource,
    fragment,
    `server live-location safety fragment ${fragment}`,
  );
}

for (const forbiddenPattern of [
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
]) {
  assertExcludes(
    serverLiveLocationSourceWithoutDenylist,
    forbiddenPattern,
    "server live-location runtime path",
  );
}

console.log("Driver live-location consent runtime evidence contract guard passed");
