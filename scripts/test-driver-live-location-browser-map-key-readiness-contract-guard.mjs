import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-browser-map-key-readiness-contract-guard.mjs";
const appPagePath = "app/page.tsx";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const locationSearchHelperPath = "lib/admin-map-location-search.ts";
const routeEstimateHelperPath = "lib/admin-map-route-estimates.ts";
const liveLocationScaffoldPath = "lib/driver-live-location-scaffold.ts";
const adminActiveJobsRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";

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
  appPage,
  driverJobPage,
  locationSearchHelper,
  routeEstimateHelper,
  liveLocationScaffold,
  adminActiveJobsRoute,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(locationSearchHelperPath, "utf8"),
  readFile(routeEstimateHelperPath, "utf8"),
  readFile(liveLocationScaffoldPath, "utf8"),
  readFile(adminActiveJobsRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Browser Map Key Readiness Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for any future browser-rendered base map in the Admin Active Jobs Map UI.",
  "This lock does not create a browser map key, change Vercel env, expose any key to the browser, render a map, activate admin active-jobs map runtime, activate driver GPS capture, open live-location gates, read/write database rows, call Google Maps/OneMap/FlightAware, deploy, send provider messages, or activate production.",
  "Current state remains closed: no browser Google Maps JavaScript loader, no `NEXT_PUBLIC_` map key, no active map canvas, and no customer-visible live map.",
  "Future admin active-jobs browser map must use a separate browser-safe key from the existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY`; the server-side key must never be sent to client code, HTML, logs, errors, or API responses.",
  "Future browser key setup requires separate owner approval, Google Cloud key creation, API restriction to browser map rendering APIs only, HTTP referrer/domain restrictions, and names-only ledger recording with no key value.",
  "Future names-only env plan must use `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER`, `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS`, and optional `PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID`; values must never be printed, logged, committed, or pasted into docs.",
  "Future allowed origins must be explicit and limited to approved staging/production app origins; wildcard, unrestricted, localhost-only production, mobile-app, IP-address, or server-key reuse configurations are not approved.",
  "Future browser map APIs must remain separate from server-side admin location search/route estimates, driver GPS capture/write routes, customer portal, customer in-app notifications, Driver Details Email, Telegram, WhatsApp, SMS, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, and shim work.",
  "Future closed gates must not read `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, must not render map scripts, must not call `navigator.geolocation`, must not fetch location rows, and must not expose coordinates.",
  "Future map UI evidence must prove no key appears in page source, route responses, server logs, normalized evidence, or committed files; it must also prove rollback removes the browser map surface.",
  "Future admin map UI remains admin/dispatcher-only and may show only approved operational marker/status fields; customer live map links remain separately blocked.",
  "This guard adds `scripts/test-driver-live-location-browser-map-key-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger browser map key phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation browser map key guard registration");

for (const forbiddenPhrase of [
  "browser map key is created",
  "browser map is live",
  "active jobs map is live",
  "GPS capture is active",
  "customer live map is approved",
  "server-side key may be exposed",
  "PRESTIGE_GOOGLE_MAPS_API_KEY may be used in browser",
  "wildcard origin is approved",
  "unrestricted key is approved",
  "production activation is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden browser map key activation claim");
}

const browserFacingSource = `${appPage}\n${driverJobPage}`;
const serverMapSource = `${locationSearchHelper}\n${routeEstimateHelper}`;
const liveLocationSource = `${liveLocationScaffold}\n${adminActiveJobsRoute}`;

for (const forbiddenPattern of [
  /NEXT_PUBLIC_(?:GOOGLE|.*MAP|.*LOCATION)/i,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY/,
  /PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID/,
  /maps\.googleapis\.com\/maps\/api\/js/i,
  /@googlemaps\/js-api-loader|google\.maps|new google/i,
  /<script[^>]+maps\.googleapis\.com/i,
  /data-admin-active-jobs-map-canvas|data-driver-live-location-map-canvas/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
]) {
  assertExcludes(browserFacingSource, forbiddenPattern, "current browser-facing app source");
}

assertIncludes(serverMapSource, "PRESTIGE_GOOGLE_MAPS_API_KEY", "server-side Google Maps key remains server helper only");
assertIncludes(serverMapSource, "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED", "server map search gate");
assertIncludes(serverMapSource, "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED", "server map route gate");

for (const forbiddenPattern of [
  /PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY/,
  /PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID/,
  /NEXT_PUBLIC_(?:GOOGLE|.*MAP|.*LOCATION)/i,
]) {
  assertExcludes(serverMapSource, forbiddenPattern, "server-side admin map search/route helpers");
}

for (const fragment of [
  "PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED",
  "liveMapEnabled: false",
  "active_jobs: []",
  "map_rendered: false",
  "marker_count: 0",
]) {
  assertIncludes(liveLocationSource, fragment, `closed active-jobs map scaffold fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /PRESTIGE_GOOGLE_MAPS_API_KEY/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY/,
  /maps\.googleapis\.com|google\.maps|@googlemaps\/js-api-loader/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
]) {
  assertExcludes(liveLocationSource, forbiddenPattern, "closed live-location active-jobs scaffold");
}

console.log("Driver live-location browser map key readiness contract guard passed");
