import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-google-maps-admin-map-evidence-contract-guard.mjs";

const currentMapSurfaceFiles = [
  "app/api/admin-map-location-search/route.ts",
  "app/api/admin-map-route-estimates/route.ts",
  "lib/admin-map-location-search.ts",
  "lib/admin-map-route-estimates.ts",
];

const appPagePath = "app/page.tsx";

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

const [ledger, preactivationSuite, appPage, ...currentMapSurfaceSources] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  ...currentMapSurfaceFiles.map((file) => readFile(file, "utf8")),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Google Maps Admin Map Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Google Maps admin map/search/route estimate evidence pass.",
  "Google Maps is selected as the replacement direction for admin map/search/route estimate.",
  "OneMap is parked after the safe HTTP 502 provider failure record.",
  "No OneMap retry is approved without separate owner approval.",
  "Future Google Maps scope is admin location search and admin route estimates only.",
  "Future Google Maps replacement should reuse the existing provider-neutral admin map routes where possible: `GET /api/admin-map-location-search` and `POST /api/admin-map-route-estimates`.",
  "Future implementation should reuse the existing admin route-assist UI section without adding a new UI sector, card, or button.",
  "Future Google Maps services to evaluate are names-only: Places Text Search or Geocoding for location search, Routes API or equivalent route estimate service for distance/duration, and Maps JavaScript only if map display is separately needed and approved.",
  "Required future gate/env names are names-only: `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED`, `PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER`, `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED`, `PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER`, `PRESTIGE_GOOGLE_MAPS_API_KEY`, `PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT` if needed, `PRESTIGE_GOOGLE_MAPS_ROUTE_ENDPOINT` if needed, and `PRESTIGE_ADMIN_GOOGLE_MAPS_READ_ONLY_VERIFICATION_APPROVED`.",
  "Future Google Maps provider replacement requires explicit owner approval.",
  "Future Google Cloud billing readiness requires explicit owner approval.",
  "Future Google Maps API key setup requires explicit owner approval.",
  "Future staging-only key use requires explicit owner approval.",
  "Future API key restriction proof requires explicit owner approval.",
  "Future one bounded staging evidence pass requires explicit owner approval.",
  "Closed-gate proof is required before evidence.",
  "Closed gate must not read `PRESTIGE_GOOGLE_MAPS_API_KEY`.",
  "Closed gate must not call Google Maps.",
  "Missing-config proof must return a safe disabled or missing-config response with no key, env value, billing detail, token, cookie, password, endpoint value, DB URL, or secret exposure.",
  "Admin/dispatcher boundary proof is required.",
  "Public, customer, and driver boundary proof is required.",
  "Future evidence is limited to one safe public-landmark location search and one safe public-landmark route estimate.",
  "Future evidence must not use real customer coordinates.",
  "Future evidence must not write to the database.",
  "No DB persistence is required for this lane unless separately introduced and approved later.",
  "No scheduler, retry loop, polling loop, queue, cron, timer, or background worker is approved.",
  "Timeout, rate-limit, and safe provider failure contracts are required.",
  "Rollback/disable proof is required after evidence.",
  "Google Cloud billing readiness proof must be names-only and must not include billing details.",
  "Staging-only API key setup proof is required.",
  "Server-side key usage proof is required if server routes call Google.",
  "Browser key introduction is forbidden unless separately approved.",
  "API restrictions must be limited to the required Google Maps APIs.",
  "No API key values or env values may be printed.",
  "No raw Google response, headers, keys, tokens, or debug payloads may be exposed.",
  "Future normalized Google Maps responses may expose only provider, search label, address fragments, postal if available, latitude/longitude for safe public-landmark evidence only, distance, duration, and route type.",
  "Future Google Maps responses must not expose raw Google payloads, headers, API keys, tokens, debug/internal fields, pricing, payout, PayNow, payment/PDF/billing, `customer_rates`, `driver_payout_rules`, internal/admin notes, parser/debug fields, Save Booking internals, `/api/admin-saved-bookings` internals, customer/private contact data, or real customer coordinates in evidence.",
  "Google Maps is not the driver GPS source.",
  "Google Maps is not Telegram live location.",
  "Google Maps is not customer live tracking.",
  "Google Maps admin map/search/route estimate must remain separate from driver GPS, Telegram live location, driver location source, POB auto-stop, customer/driver auth activation, in-app notifications, OTS photo/storage, billing/payment/PDF, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, provider sends, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.",
  "This lock does not approve Google Maps API calls, API key creation/use, Google Cloud billing changes, env changes, DB reads/writes, OneMap retry, driver GPS capture, live-location implementation, provider sends, auth activation, notification row writes, in-app notification runtime, OTS photo/storage activation, calendar activation, scheduler/timer/polling/retry implementation, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, pricing/rates/customer_rates changes, `driver_payout_rules` changes, payout/payment/PDF/billing/invoice activation, UI sector/card/button changes, shim changes, deploy, or production activation.",
  "This guard adds `scripts/test-google-maps-admin-map-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `Google Maps evidence phrase: ${phrase}`);
}

for (const forbidden of [
  "Google Maps API calls are approved now",
  "Google API key creation is approved now",
  "Google API key use is approved now",
  "Google Cloud billing change is approved now",
  "env changes are approved now for Google Maps",
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

const currentMapSurfaceSource = currentMapSurfaceSources.join("\n");
const currentMapUiSource = appPage;

for (const fragment of [
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER",
  "onemap_search",
  "onemap_routing",
]) {
  assertIncludes(currentMapSurfaceSource, fragment, `current admin map surface fragment ${fragment}`);
}

for (const fragment of [
  "/api/admin-map-location-search",
  "/api/admin-map-route-estimates",
  "data-admin-onemap-route-assist",
]) {
  assertIncludes(currentMapUiSource, fragment, `current admin map UI fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /PRESTIGE_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY|GOOGLE_API_KEY/i,
  /maps\.googleapis\.com|routes\.googleapis\.com|places\.googleapis\.com/i,
  /google\.maps|GoogleMaps|new google/i,
  /@googlemaps|googleapis/i,
  /PRESTIGE_ADMIN_GOOGLE_MAPS_READ_ONLY_VERIFICATION_APPROVED/i,
  /setInterval|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(
    currentMapSurfaceSource,
    forbiddenPattern,
    "current admin map runtime surfaces before Google implementation",
  );
}

console.log("Google Maps admin map evidence contract guard passed");
