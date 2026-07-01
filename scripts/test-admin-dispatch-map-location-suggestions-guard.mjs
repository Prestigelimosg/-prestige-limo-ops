import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appSource = await readFile("app/page.tsx", "utf8");
const adminRouteSource = await readFile("app/api/admin-map-location-search/route.ts", "utf8");
const adminHelperSource = await readFile("lib/admin-map-location-search.ts", "utf8");
const publicBookSource = await readFile("app/book/page.tsx", "utf8");
const customerPortalSource = await readFile("app/my-bookings/page.tsx", "utf8");

function assertIncludes(source, fragment, label) {
  assert.equal(
    source.includes(fragment),
    true,
    `${label} must include ${fragment}`,
  );
}

function assertExcludes(source, pattern, label) {
  assert.doesNotMatch(source, pattern, label);
}

assertIncludes(appSource, 'const adminMapLocationSearchApiPath = "/api/admin-map-location-search";', "admin Dispatch page");
assertIncludes(appSource, "type AdminMapLocationSuggestionField", "admin Dispatch page");
assertIncludes(appSource, '"extraStopLocation"', "admin Dispatch page");
assertIncludes(appSource, "loadAdminMapLocationSearchMatches", "admin Dispatch page");
assertIncludes(appSource, "searchAdminMapLocationSuggestions", "admin Dispatch page");
assertIncludes(appSource, "applyAdminMapLocationSuggestion", "admin Dispatch page");
assertIncludes(appSource, "data-admin-map-location-suggestions={field}", "admin Dispatch suggestion UI");
assertIncludes(appSource, "data-admin-map-location-suggest-button={field}", "admin Dispatch suggestion UI");
assertIncludes(appSource, "data-admin-map-location-suggestion-results={field}", "admin Dispatch suggestion UI");
assertIncludes(appSource, "data-admin-map-location-suggestion-result={field}", "admin Dispatch suggestion UI");
assertIncludes(appSource, "renderAdminMapLocationSuggestions(\"extraStopLocation\")", "extra stop suggestion UI");
assertIncludes(appSource, "\"x-prestige-admin-purpose\": adminLegacyDataPurpose", "admin Dispatch map search fetch");
assertIncludes(appSource, "Admin-only lookup. No save, customer message, live location, billing, payment, payout, or parser change.", "suggestion boundary");

assertIncludes(adminRouteSource, "resolveAdminDispatcherBoundary", "admin location search route");
assertIncludes(adminRouteSource, "adminBookingPersistencePurpose", "admin location search route");
assertIncludes(adminHelperSource, "PRESTIGE_GOOGLE_MAPS_API_KEY", "server-side Google Maps helper");
assertIncludes(adminHelperSource, "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED", "server-side Google Maps helper");
assertIncludes(adminHelperSource, "components\", \"country:SG", "server-side Google Maps helper");

assertExcludes(publicBookSource, /admin-map-location-search|PRESTIGE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com\/maps\/api\/js|NEXT_PUBLIC_.*MAP/i, "public booking form must not use admin Google map search");
assertExcludes(customerPortalSource, /admin-map-location-search|PRESTIGE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com\/maps\/api\/js|NEXT_PUBLIC_.*MAP/i, "customer portal booking form must not use admin Google map search");
assertExcludes(appSource, /maps\.googleapis\.com\/maps\/api\/js|NEXT_PUBLIC_.*MAP|PRESTIGE_GOOGLE_MAPS_API_KEY/i, "admin Dispatch page must not expose a browser map key");

console.log("Admin Dispatch map location suggestions guard passed.");
