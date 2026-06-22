import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-google-maps-admin-map-evidence-contract-guard.mjs";

const appPagePath = "app/page.tsx";
const locationRoutePath = "app/api/admin-map-location-search/route.ts";
const routeEstimateRoutePath = "app/api/admin-map-route-estimates/route.ts";
const locationHelperPath = "lib/admin-map-location-search.ts";
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
  assert.equal(firstIndex < secondIndex, true, `${label} must read ${first} before ${second}.`);
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
  locationRoute,
  routeEstimateRoute,
  locationHelper,
  routeEstimateHelper,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(locationRoutePath, "utf8"),
  readFile(routeEstimateRoutePath, "utf8"),
  readFile(locationHelperPath, "utf8"),
  readFile(routeEstimateHelperPath, "utf8"),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Google Maps Admin Map Evidence Contract Guard Lock",
);
const retirementSection = sectionBetween(
  ledger,
  "### OneMap Active Runtime Retirement Lock",
);
const mapRuntimeSource = [
  locationRoute,
  routeEstimateRoute,
  locationHelper,
  routeEstimateHelper,
].join("\n");

for (const phrase of [
  "Google Maps is selected as the replacement direction for admin map/search/route estimate.",
  "OneMap is parked after the safe HTTP 502 provider failure record.",
  "No OneMap retry is approved without separate owner approval.",
  "Current Google Maps scope is admin location search and admin route estimates only.",
  "Google Maps replacement reuses the existing provider-neutral admin map routes: `GET /api/admin-map-location-search` and `POST /api/admin-map-route-estimates`.",
  "Google Maps runtime provider support is gated by `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED`, `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER=google_maps_geocoding`, `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED`, and `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER=google_maps_routes`.",
  "Google Maps key usage is server-side only through `PRESTIGE_GOOGLE_MAPS_API_KEY`; the key value must never be printed, logged, committed, or exposed to the browser.",
  "Closed gate must not read `PRESTIGE_GOOGLE_MAPS_API_KEY`.",
  "Closed gate must not call Google Maps.",
  "Missing-config proof must return a safe disabled or missing-config response with no key, env value, billing detail, token, cookie, password, endpoint value, DB URL, or secret exposure.",
  "Admin/dispatcher boundary proof is required.",
  "Public, customer, and driver boundary proof is required.",
  "Evidence is limited to one safe public-landmark location search and one safe public-landmark route estimate.",
  "Evidence must not use real customer coordinates.",
  "Evidence must not write to the database.",
  "No DB persistence is required for this lane.",
  "No scheduler, retry loop, polling loop, queue, cron, timer, or background worker is approved.",
  "Rollback/disable proof is required after evidence.",
  "API restrictions are limited to Google Geocoding API and Routes API.",
  "Normalized Google Maps responses may expose only provider, search label, address fragments, postal if available, latitude/longitude for safe public-landmark evidence only, distance, duration, and route type.",
  "Google Maps responses must not expose raw Google payloads, headers, API keys, tokens, debug/internal fields, pricing, payout, PayNow, payment/PDF/billing, `customer_rates`, `driver_payout_rules`, internal/admin notes, parser/debug fields, Save Booking internals, `/api/admin-saved-bookings` internals, customer/private contact data, or real customer coordinates in evidence.",
  "Google Maps is not the driver GPS source.",
  "Google Maps is not Telegram live location.",
  "Google Maps is not customer live tracking.",
  "Google Maps admin map/search/route estimate remains separate from driver GPS, Telegram live location, driver location source, POB auto-stop, customer/driver auth activation, in-app notifications, OTS photo/storage, billing/payment/PDF, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, provider sends, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.",
]) {
  assertIncludes(evidenceSection, phrase, `Google Maps evidence phrase: ${phrase}`);
}

for (const phrase of [
  "OneMap active runtime/provider paths are retired after Google Maps staging evidence completion.",
  "OneMap was parked after the safe HTTP 502 provider failure record.",
  "OneMap is no longer the active or fallback admin map provider.",
  "Google Maps remains the selected admin map/search/route provider.",
  "Current admin map routes must not call OneMap under any gate or provider configuration.",
  "`onemap_search` and `onemap_routing` provider values must fail closed as missing configuration with no provider call.",
  "The obsolete OneMap read-only evidence runner is removed so OneMap evidence cannot be retried accidentally from the repo.",
  "Admin map route-assist UI data attributes are provider-neutral `data-admin-map-*`; no new UI sector, card, or button is approved by this retirement lane.",
  "No OneMap retry, OneMap call, OneMap token setup, OneMap endpoint setup, env change, deploy, DB read/write, provider send, auth activation, billing activation, production activation, or customer data use is approved by this retirement lane.",
  "No Google Maps call was made in this retirement lane.",
  "Future OneMap reintroduction requires separate owner approval, provider/token/endpoint readiness, a fresh contract guard, bounded staging evidence, and no secret exposure.",
]) {
  assertIncludes(retirementSection, phrase, `OneMap retirement phrase: ${phrase}`);
}

for (const forbidden of [
  "Google Maps may be used as driver GPS",
  "Google Maps may be used as Telegram live location",
  "Google Maps may be used as customer live tracking",
  "OneMap retry is approved now",
  "real customer coordinates may be used for Google evidence",
  "DB persistence is approved for Google Maps evidence",
  "scheduler is approved for Google Maps evidence",
  "polling is approved for Google Maps evidence",
  "retry loop is approved for Google Maps evidence",
  "raw Google payloads may be exposed",
  "browser key is approved now",
  "new UI sector is approved for Google Maps",
  "new shim is approved for Google Maps",
  "production activation is approved for Google Maps",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden Google Maps activation phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation Google Maps evidence guard registration",
);

for (const fragment of [
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER",
  "PRESTIGE_GOOGLE_MAPS_API_KEY",
  "PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT",
  "PRESTIGE_GOOGLE_MAPS_ROUTE_ENDPOINT",
  "google_maps_geocoding",
  "google_maps_routes",
  "maps.googleapis.com/maps/api/geocode/json",
  "routes.googleapis.com/directions/v2:computeRoutes",
  "x-goog-fieldmask",
]) {
  assertIncludes(mapRuntimeSource, fragment, `Google Maps runtime fragment ${fragment}`);
}

for (const retiredFragment of [
  "onemap_search",
  "onemap_routing",
  "PRESTIGE_ONEMAP_ACCESS_TOKEN",
  "ONEMAP_ACCESS_TOKEN",
  "PRESTIGE_ONEMAP_SEARCH_ENDPOINT",
  "PRESTIGE_ONEMAP_ROUTING_ENDPOINT",
  "onemap.gov",
]) {
  assertExcludes(
    mapRuntimeSource,
    retiredFragment,
    `retired OneMap runtime fragment ${retiredFragment}`,
  );
}

for (const fragment of [
  "/api/admin-map-location-search",
  "/api/admin-map-route-estimates",
  "data-admin-map-route-assist",
]) {
  assertIncludes(appPage, fragment, `current admin map UI fragment ${fragment}`);
}

assertExcludes(appPage, "data-admin-onemap", "retired OneMap-specific UI data attribute");

assertOrder(
  locationHelper,
  'process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED !== "true"',
  "const googleMapsApiKey = readGoogleMapsApiKey();",
  "location search closed gate before Google key read",
);
assertOrder(
  routeEstimateHelper,
  'process.env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED !== "true"',
  "const googleMapsApiKey = readGoogleMapsApiKey();",
  "route estimate closed gate before Google key read",
);

for (const [label, source] of [
  ["location helper", locationHelper],
  ["route estimate helper", routeEstimateHelper],
]) {
  assertExcludes(source, /setInterval|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i, label);
  assertExcludes(source, /@supabase\/supabase-js|createClient|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i, label);
  assertExcludes(source, /sendMail|sendMessage|sendSms|messages\.create|resend\.|stripe\.|paymentIntent|checkout\.sessions/i, label);
}

for (const forbiddenPattern of [
  /NEXT_PUBLIC_GOOGLE|NEXT_PUBLIC_.*MAP/i,
  /google\.maps|new google/i,
  /<script[^>]+maps\.googleapis\.com/i,
  /@googlemaps\/js-api-loader/i,
]) {
  assertExcludes(appPage, forbiddenPattern, "current admin map UI browser-key surface");
}

console.log("Google Maps admin map evidence contract guard passed");
