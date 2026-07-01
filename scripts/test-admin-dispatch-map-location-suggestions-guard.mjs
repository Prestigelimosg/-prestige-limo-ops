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
assertIncludes(appSource, "loadAdminMapLocationSearchMatches", "admin Dispatch page");
assertIncludes(appSource, "resolveAdminMapLocation", "admin Dispatch map route assist");
assertIncludes(appSource, "data-admin-map-location-search={item.buttonData}", "admin Dispatch map route assist");
assertIncludes(appSource, "\"x-prestige-admin-purpose\": adminLegacyDataPurpose", "admin Dispatch map search fetch");
assertIncludes(appSource, "Uses guarded admin map APIs only. No booking save", "map route assist boundary");
assertExcludes(appSource, /data-admin-map-location-suggestions|data-admin-map-location-suggest-button|data-admin-map-location-suggestion-results|data-admin-map-location-suggestion-result|renderAdminMapLocationSuggestions|searchAdminMapLocationSuggestions|applyAdminMapLocationSuggestion|Admin map suggestions/i, "admin Dispatch visible Suggest UI must stay removed until live env is enabled");

assertIncludes(adminRouteSource, "resolveAdminDispatcherBoundary", "admin location search route");
assertIncludes(adminRouteSource, "adminBookingPersistencePurpose", "admin location search route");
assertIncludes(adminHelperSource, "PRESTIGE_GOOGLE_MAPS_API_KEY", "server-side Google Maps helper");
assertIncludes(adminHelperSource, "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED", "server-side Google Maps helper");
assertIncludes(adminHelperSource, "components\", \"country:SG", "server-side Google Maps helper");

assertExcludes(publicBookSource, /admin-map-location-search|PRESTIGE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com\/maps\/api\/js|NEXT_PUBLIC_.*MAP/i, "public booking form must not use admin Google map search");
assertExcludes(customerPortalSource, /admin-map-location-search|PRESTIGE_GOOGLE_MAPS_API_KEY|maps\.googleapis\.com\/maps\/api\/js|NEXT_PUBLIC_.*MAP/i, "customer portal booking form must not use admin Google map search");
assertIncludes(appSource, "adminActiveJobsMapBrowserConfigApiPath", "admin Active Jobs browser map config path");
assertIncludes(appSource, "data-admin-active-jobs-map-canvas", "admin Active Jobs browser map canvas");
assertExcludes(appSource, /NEXT_PUBLIC_.*MAP|PRESTIGE_GOOGLE_MAPS_API_KEY|PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY/i, "admin Dispatch page must not expose map env keys");

console.log("Admin Dispatch map location suggestions guard passed.");
