import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-browser-map-key-readiness-contract-guard.mjs";
const appPagePath = "app/page.tsx";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const publicBookPagePath = "app/book/page.tsx";
const customerPortalPath = "app/my-bookings/page.tsx";
const browserConfigRoutePath = "app/api/admin-active-jobs-map-browser-config/route.ts";
const locationSearchHelperPath = "lib/admin-map-location-search.ts";
const routeEstimateHelperPath = "lib/admin-map-route-estimates.ts";

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

function assertOrder(source, first, second, label) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);

  assert.notEqual(firstIndex, -1, `${label} missing first marker ${first}.`);
  assert.notEqual(secondIndex, -1, `${label} missing second marker ${second}.`);
  assert.equal(firstIndex < secondIndex, true, `${label} must keep ${first} before ${second}.`);
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
  publicBookPage,
  customerPortal,
  browserConfigRoute,
  locationSearchHelper,
  routeEstimateHelper,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(publicBookPagePath, "utf8"),
  readFile(customerPortalPath, "utf8"),
  readFile(browserConfigRoutePath, "utf8"),
  readFile(locationSearchHelperPath, "utf8"),
  readFile(routeEstimateHelperPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Active Jobs Browser Map JavaScript API",
);

for (const phrase of [
  "Admin Dispatch can render an optional same-window Google Maps JavaScript canvas inside the existing compact Active Jobs Map panel.",
  "The canvas is default-closed: it only loads after active driver markers exist and `/api/admin-active-jobs-map-browser-config` returns a configured browser-safe provider/key response.",
  "The browser config route uses the existing admin dispatcher boundary, same-origin dashboard purpose header, a separate `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER=google_maps_javascript` gate, `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, explicit `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS`, and optional `PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID`.",
  "The existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY` remains server-only for admin location search/route estimates and is not read or returned by the browser-map config route.",
  "When the browser map config is missing or origin is not allowed, the admin UI stays compact, shows an embedded-map-off message, and keeps the per-driver `Driver Pin` Google Maps fallback links.",
  "The browser map canvas is admin-only and shows only active driver marker positions already returned by the guarded active-jobs map route.",
  "This lane does not change driver GPS capture, driver share/stop behavior, customer live maps, customer portal, public booking, billing/payment/PDF/invoice/payout, provider messaging, parser, Save Booking, `/api/admin-saved-bookings`, calendar, Vercel/env values, or DB schema.",
  "No `NEXT_PUBLIC_` map key is introduced; browser key values must never be committed, printed, logged, or pasted into docs.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger browser map phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation browser map guard registration");

for (const forbiddenPhrase of [
  "server-side key may be exposed",
  "PRESTIGE_GOOGLE_MAPS_API_KEY may be used in browser",
  "wildcard origin is approved",
  "unrestricted key is approved",
  "customer live map is approved now",
  "driver GPS capture changed",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden browser map activation claim");
}

for (const fragment of [
  "const adminActiveJobsMapBrowserConfigApiPath =",
  '"/api/admin-active-jobs-map-browser-config";',
  "loadAdminActiveJobsBrowserGoogleMaps",
  "https://maps.googleapis.com/maps/api/js?key=",
  "loading=async&callback=",
  "adminActiveJobsBrowserMapCallbackName",
  "resolveAdminActiveJobsBrowserGoogleMapsLibraries",
  'maps.importLibrary("maps")',
  'maps.importLibrary("marker")',
  "waitForAdminActiveJobsBrowserMapDom",
  ".gm-style",
  "Google Maps visual DOM did not render safely.",
  "data-admin-active-jobs-map-canvas",
  "data-admin-active-jobs-map-config-message",
  "AdminActiveJobsBrowserMap",
  "Driver Pin",
  "Embedded map off. Use Driver Pin",
]) {
  assertIncludes(appPage, fragment, `admin browser map UI fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "loading=async&libraries=maps,marker",
  'script.addEventListener("load", finish',
]) {
  assertExcludes(appPage, forbiddenFragment, "admin browser map callback readiness");
}

assertOrder(
  appPage,
  "await waitForAdminActiveJobsBrowserMapDom(mapElement);",
  'setRenderState("ready");',
  "admin browser map must wait for rendered Google Maps DOM before ready state",
);

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER",
  "PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY",
  "PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS",
  "PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID",
  'const browserMapProvider = "google_maps_javascript";',
  "allowedOrigins.includes(origin)",
  "admin_active_jobs_browser_map_not_configured",
  "Admin active-jobs browser map origin is not allowed.",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(browserConfigRoute, fragment, `browser config route fragment ${fragment}`);
}

assertOrder(
  browserConfigRoute,
  "provider !== browserMapProvider || !apiKey",
  "apiKey,",
  "browser config route closed gate before key response",
);

for (const forbiddenPattern of [
  /PRESTIGE_GOOGLE_MAPS_API_KEY/,
  /NEXT_PUBLIC_(?:GOOGLE|.*MAP|.*LOCATION)/i,
  /console\.(?:log|warn|error|info|debug)/,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /sendMail|sendMessage|sendSms|resend\.|stripe\.|checkout\.sessions/i,
]) {
  assertExcludes(browserConfigRoute, forbiddenPattern, "browser config route");
}

for (const forbiddenPattern of [
  /PRESTIGE_GOOGLE_MAPS_API_KEY/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY/,
  /PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS/,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID/,
  /NEXT_PUBLIC_(?:GOOGLE|.*MAP|.*LOCATION)/i,
]) {
  assertExcludes(appPage, forbiddenPattern, "admin browser page must not contain map env names");
}

for (const [label, source] of [
  ["driver job page", driverJobPage],
  ["public booking page", publicBookPage],
  ["customer portal page", customerPortal],
]) {
  for (const forbiddenPattern of [
    /admin-active-jobs-map-browser-config/,
    /maps\.googleapis\.com\/maps\/api\/js/i,
    /data-admin-active-jobs-map-canvas/i,
    /PRESTIGE_GOOGLE_MAPS_BROWSER|NEXT_PUBLIC_.*MAP/i,
  ]) {
    assertExcludes(source, forbiddenPattern, label);
  }
}

assertIncludes(locationSearchHelper, "PRESTIGE_GOOGLE_MAPS_API_KEY", "server location helper key");
assertIncludes(routeEstimateHelper, "PRESTIGE_GOOGLE_MAPS_API_KEY", "server route helper key");
assertExcludes(
  `${locationSearchHelper}\n${routeEstimateHelper}`,
  /PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY|PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER|NEXT_PUBLIC_.*MAP/i,
  "server-side admin map search/route helpers",
);

console.log("Driver live-location browser map key readiness contract guard passed");
