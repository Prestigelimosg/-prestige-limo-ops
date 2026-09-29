import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import ts from "typescript";

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

// Execute the real marker formatter: identity must survive reordering and stale updates.
const markerPage = await readFile(appPagePath, "utf8");
const markerAst = ts.createSourceFile(appPagePath, markerPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const markerFunction = markerAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "adminActiveJobsBrowserMapMarkerLabel");
assert.ok(markerFunction);
const markerCode = ts.transpileModule(markerFunction.getText(markerAst), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const markerLabel = new Function("clean", markerCode + "\nreturn adminActiveJobsBrowserMapMarkerLabel;")(value => typeof value === "string" ? value.trim() : "");
const markerJobs = ["SNP9124S", "SNX2267S", "SFJ97Y"].map((plate, index) => ({job:{vehicle_plate_label:plate,assigned_job_reference:`JOB-${index}`,is_stale:false}}));
assert.deepEqual(markerJobs.map(entry => markerLabel(entry).text), ["SNP9124S", "SNX2267S", "SFJ97Y"]);
assert.deepEqual([...markerJobs].reverse().map(entry => markerLabel(entry).text), ["SFJ97Y", "SNX2267S", "SNP9124S"]);
assert.equal(markerLabel({job:{vehicle_plate_label:" SFJ97Y ",is_stale:true}}).text, "! SFJ97Y");
for (const missing of [null, undefined, "", "   "]) {
  assert.equal(markerLabel({job:{vehicle_plate_label:missing,driver_display_label:"Do not infer 97"}}).text, "Plate unavailable");
}
assert.equal(markerLabel(markerJobs[0]).className, "admin-live-map-plate-label");
assertIncludes(markerPage, "marker.textContent = adminActiveJobsBrowserMapMarkerLabel(entry).text;", "fallback uses same plate label");
assertIncludes(markerPage, "existingMarker.setLabel?.(adminActiveJobsBrowserMapMarkerLabel(entry));", "refresh uses same plate label");
assertIncludes(markerPage, "label: adminActiveJobsBrowserMapMarkerLabel(entry),", "new Google marker uses same plate label");

// Exercise the unchanged Google marker update effect with its real label formatter.
const effectStart = markerPage.indexOf("    const map = mapRef.current;", markerPage.indexOf("function AdminActiveJobsBrowserMap("));
const effectEnd = markerPage.indexOf("  }, [activeMarkerJobs, renderState]);", effectStart);
assert.ok(effectStart > 0 && effectEnd > effectStart);
const effectCode = ts.transpileModule(markerPage.slice(effectStart, effectEnd), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const registry = new Map();
let createdMarkers = 0;
class MockMarker {
  constructor(options) { Object.assign(this, options); createdMarkers++; }
  setMap(value) { this.map = value; }
  setPosition(value) { this.position = value; }
  setLabel(value) { this.label = value; }
  setTitle(value) { this.title = value; }
}
const mockMap = {fitBounds(){},setCenter(){},setZoom(){}};
const updateMarkers = new Function("activeMarkerJobs", "mapRef", "mapsRuntimeRef", "mapElementRef", "renderState", "markersRef", "adminActiveJobsBrowserMapReference", "adminActiveJobsBrowserMapDisplayReference", "adminActiveJobsBrowserMapMarkerLabel", "googleMapUserAdjustedRef", "googleMapAutoFitReferenceKeyRef", "singleMarkerCenteredReferenceRef", "adminActiveJobsBrowserMapTileFallbackMarkerKey", effectCode);
const runMarkerUpdate = entries => updateMarkers(entries, {current:mockMap}, {current:{Marker:MockMarker,LatLngBounds:class {extend(){}}}}, {current:null}, "ready", {current:registry}, entry=>entry.job.assigned_job_reference, entry=>entry.job.assigned_job_reference, markerLabel, {current:false}, {current:""}, {current:""}, entries=>entries.map(entry=>entry.job.assigned_job_reference).join("|"));
const firstEntries = markerJobs.map((entry,index)=>({...entry,position:{lat:1.3+index/100,lng:103.8}}));
runMarkerUpdate(firstEntries);
assert.equal(createdMarkers, 3);
const originalMarker = registry.get("JOB-2");
assert.equal(originalMarker.label.text, "SFJ97Y");
const movedEntries = [...firstEntries].reverse().map(entry=>({...entry,position:{...entry.position,lng:103.81},job:{...entry.job,is_stale:entry.job.assigned_job_reference === "JOB-2"}}));
runMarkerUpdate(movedEntries);
assert.equal(createdMarkers, 3, "refresh/reorder must reuse existing exact-job markers");
assert.equal(registry.get("JOB-2"), originalMarker);
assert.equal(originalMarker.label.text, "! SFJ97Y");
assert.equal(originalMarker.position.lng, 103.81);
runMarkerUpdate(movedEntries.filter(entry=>entry.job.assigned_job_reference !== "JOB-2"));
assert.equal(registry.size, 2);
assert.equal(originalMarker.map, null, "normal removal must still detach the exact marker");

// Execute the actual fallback marker loop too, rather than checking only its source wiring.
const fallbackStart = markerPage.indexOf("  markerEntries.forEach((entry, index) => {", markerPage.indexOf("function renderAdminActiveJobsBrowserMapTileFallback("));
const fallbackEnd = markerPage.indexOf("  appendAdminActiveJobsBrowserMapTileFallbackControls", fallbackStart);
assert.ok(fallbackStart > 0 && fallbackEnd > fallbackStart);
const fallbackCode = ts.transpileModule(markerPage.slice(fallbackStart, fallbackEnd), {compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const fallbackNodes = [];
new Function("markerEntries", "document", "mapElement", "adminActiveJobsBrowserMapTileXFloat", "adminActiveJobsBrowserMapTileYFloat", "zoom", "centerTileXFloat", "centerTileYFloat", "tileSize", "adminActiveJobsBrowserMapReference", "adminActiveJobsBrowserMapDisplayReference", "adminActiveJobsBrowserMapMarkerLabel", fallbackCode)(
  movedEntries, {createElement:()=>({style:{},setAttribute(){}})}, {appendChild:node=>fallbackNodes.push(node)}, value=>value, value=>value, 13, 103.8, 1.3, 256, entry=>entry.job.assigned_job_reference, entry=>entry.job.assigned_job_reference, markerLabel,
);
assert.deepEqual(fallbackNodes.map(node=>node.textContent), ["! SFJ97Y", "SNX2267S", "SNP9124S"]);
assert.ok(fallbackNodes.every(node=>node.style.width === "max-content" && node.style.whiteSpace === "nowrap"), "plate labels must not be clipped inside the old 28px number circle");
assert.ok(fallbackNodes.every(node=>node.style.left.startsWith("calc(50% + ") && node.style.top.startsWith("calc(50% + ")), "geographic anchoring remains in place");

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
  "Admin Dispatch can render an optional same-window Google Maps JavaScript canvas inside the existing compact Dispatch Live Dispatch Map panel.",
  "The canvas is default-closed: it only loads after active driver markers exist and `/api/admin-active-jobs-map-browser-config` returns a configured browser-safe provider/key response.",
  "The browser config route uses the existing admin dispatcher boundary, same-origin dashboard purpose header, a separate `PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER=google_maps_javascript` gate, `PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY`, explicit `PRESTIGE_GOOGLE_MAPS_BROWSER_ALLOWED_ORIGINS`, and optional `PRESTIGE_GOOGLE_MAPS_BROWSER_MAP_ID`.",
  "The existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY` remains server-only for admin location search/route estimates and is not read or returned by the browser-map config route.",
  "If the configured Google Maps JavaScript renderer errors before producing a visible map DOM, the admin UI may fall back inside the same compact panel to a same-window Google road-tile map centered on the active driver marker, with tile attribution and the marker pin still rendered from the guarded admin live-location data.",
  "When the browser map config is missing or origin is not allowed, the admin UI stays compact, shows an embedded-map-off message, and keeps the per-driver `Open Map` Google Maps fallback links.",
  "The browser map canvas is admin-only and shows only active driver marker positions already returned by the guarded active-jobs map route.",
  "The Dispatch browser map is operator-movable: Google Maps uses direct drag/zoom gestures, and the browser tile fallback is also draggable, wheel/button zoomable, and can recenter on active drivers.",
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
  "waitForAdminActiveJobsBrowserMapLayout",
  "waitForAdminActiveJobsBrowserMapDom",
  ".gm-style",
  'StaticMapService.GetMapImage',
  "adminActiveJobsBrowserMapMarkerLabel",
  "gestureHandling: \"greedy\"",
  "googleMapUserAdjustedRef",
  "data-admin-active-jobs-map-google-base",
  "data-admin-active-jobs-map-google-slot",
  "data-admin-active-jobs-map-live-movement",
  "mapSlotElement.appendChild(mapElement);",
  'mapElement.style.inset = "0";',
  'mapElement.style.position = "absolute";',
  "Google Maps visual DOM did not render safely.",
  "data-admin-active-jobs-map-canvas",
  "data-dispatch-live-driver-map-config-message",
  "AdminActiveJobsBrowserMap",
  "renderAdminActiveJobsBrowserMapTileFallback",
  "installAdminActiveJobsBrowserMapTileFallbackInteraction",
  "cleanupAdminActiveJobsBrowserMapTileFallback",
  "data-admin-active-jobs-map-tile-fallback-interactive",
  "data-admin-active-jobs-map-tile-controls",
  "Center drivers",
  "waitForAdminActiveJobsBrowserMapTileFallback",
  "tileFallbackInline",
  "mapSlotRef.current?.prepend(mapElement)",
  "https://mt.google.com/vt/lyrs=m",
  "data-admin-active-jobs-map-google-tile",
  "Map tiles © Google",
  "Google map tile fallback did not load safely.",
  "Open Map",
  "Embedded map off. Open each driver in Google Maps until browser-safe map setup is enabled.",
]) {
  assertIncludes(appPage, fragment, `admin browser map UI fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "loading=async&libraries=maps,marker",
  'script.addEventListener("load", finish',
  "document.body.appendChild(mapElement);",
  'mapElement.style.position = "fixed";',
  "updateMapPortalRect",
  'window.addEventListener("scroll", updateMapPortalRect, true);',
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
  "admin_active_jobs_browser_map_provider_gate_missing",
  "admin_active_jobs_browser_map_browser_key_missing",
  "admin_active_jobs_browser_map_allowed_origins_missing",
  "Admin active-jobs browser map origin is not allowed.",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(browserConfigRoute, fragment, `browser config route fragment ${fragment}`);
}

assertOrder(
  browserConfigRoute,
  "provider !== browserMapProvider",
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
