import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminPagePath = "app/page.tsx";
const adminDriverJobLinksRoutePath = "app/api/admin-driver-job-links/route.ts";
const adminControlHelperPath = "lib/admin-live-location-runtime-control.ts";
const adminControlRoutePath = "app/api/admin-live-location-runtime/route.ts";
const adminMapRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const runtimeHelperPath = "lib/driver-live-location-runtime.ts";
const ledgerPath = "docs/current-implementation-ledger.md";

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
  adminPage,
  adminDriverJobLinksRoute,
  adminControlHelper,
  adminControlRoute,
  adminMapRoute,
  driverJobPage,
  driverRoute,
  runtimeHelper,
  ledger,
] = await Promise.all([
  readFile(adminPagePath, "utf8"),
  readFile(adminDriverJobLinksRoutePath, "utf8"),
  readFile(adminControlHelperPath, "utf8"),
  readFile(adminControlRoutePath, "utf8"),
  readFile(adminMapRoutePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(runtimeHelperPath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Multi-Driver Admin List",
);
const runtimeReadinessSection = sectionBetween(
  runtimeHelper,
  "export async function handleDriverLiveLocationReadinessRuntimeRequest",
  "\nfunction normalizeLatestPosition",
);

for (const phrase of [
  "Admin Dispatch has one compact Dispatch Live Dispatch Map runtime control for the active jobs list; the old selected-job live map control is not rendered inside the Day-of-Trip Dispatch Monitor.",
  "Creating a driver job link now auto-authorizes live movement for that booking by opening the existing admin live-location runtime allowlist after the link row is saved.",
  "The visible Driver Job Link panel no longer exposes the manual `Enable Live Location` button; the panel stays limited to `Create Link`, `Copy Link`, `Revoke`, and useful status copy.",
  "The Dispatch Live Dispatch Map opens live movement for the active job references in one operator click through `/api/admin-live-location-runtime` instead of requiring a selected booking to be added manually.",
  "Runtime control keeps existing `driver_live_location_allowed_job_references`, removes duplicates, and caps the selected booking list at 50 references.",
  "Driver `Share Location` first calls `GET /api/driver-job/[token]/live-location` for server readiness; Chrome GPS is requested only after that readiness check passes.",
  "Admin marker refresh uses the existing guarded `GET /api/admin-active-jobs-map-locations` route and returns both selected booking references and current driver markers.",
  "The admin UI renders compact active marker rows, per-driver `Open Map` fallback links, and an optional browser map canvas that remains off unless the separate browser-safe map config route is enabled.",
  "Same-driver duplicate live markers are collapsed by driver identity; current/newest movement wins and any older duplicate rows are reported as hidden.",
  "The admin browser map updates Google marker positions from driver GPS instead of drawing a separate CSS arrow/trail overlay, so visible marker placement stays aligned to the map.",
  "The Dispatch browser map is operator-movable: Google Maps uses direct drag/zoom gestures, and the browser tile fallback is also draggable, wheel/button zoomable, and can recenter on active drivers.",
  "Admin live-marker polling runs every 5 seconds while the active live map is open; this is display refresh only and does not add a new driver/customer tracking surface.",
  "Closing the runtime clears the selected list and gates driver/customer map reads off.",
  "Customer live-location API remains same-origin/session/booking-boundary gated and no customer message is sent by this lane.",
  "No broad driver tracking, no wildcard job tracking, no existing server-side Google key exposure, no Vercel CLI, env value change, DB schema change, provider send, email/WhatsApp/SMS/Telegram send, billing/payment/PDF/invoice/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, or calendar behavior changed.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger runtime control phrase ${phrase}`);
}

for (const fragment of [
  "adminLiveLocationRuntimeApiPath",
  "adminActiveJobsMapLocationsApiPath",
  'data-dispatch-live-driver-map="true"',
  'data-dispatch-live-driver-map-open="true"',
  'data-dispatch-live-driver-map-refresh="true"',
  'data-dispatch-live-driver-map-expand="true"',
  'data-dispatch-live-driver-map-expanded={adminActiveJobsMapExpanded ? "true" : "false"}',
  'data-dispatch-live-driver-map-close="true"',
  'data-dispatch-live-driver-map-marker-count={activeJobsMapMarkerCount}',
  'data-dispatch-live-driver-map-marker-list="true"',
  "setAdminActiveJobsMapExpanded",
  "expanded={adminActiveJobsMapExpanded}",
  'expanded ? "h-[60vh] min-h-80 max-h-[42rem]" : "h-48 sm:h-56"',
  "gestureHandling: \"greedy\"",
  "googleMapUserAdjustedRef",
  "installAdminActiveJobsBrowserMapTileFallbackInteraction",
  "cleanupAdminActiveJobsBrowserMapTileFallback",
  "data-admin-active-jobs-map-tile-fallback-interactive",
  "data-admin-active-jobs-map-tile-controls",
  "Center drivers",
  'data-admin-active-jobs-map-live-movement="true"',
  'data-admin-active-jobs-map-live-movement-status="true"',
  "Google marker positions update from driver GPS every few seconds",
  "collapseAdminActiveJobsMapDriverDuplicates",
  "older duplicate",
  "adminActiveJobsMapPollIntervalMs",
  "Live Dispatch Map",
  "Open Live Dispatch Map",
  "Refresh movement",
  "Close live map",
  "Open Map",
  "Driver job link created and live movement authorized automatically.",
  "closeAdminLiveLocationRuntime",
  "refreshAdminActiveJobsMapLocations",
  "googleMapsLocationUrl",
]) {
  assertIncludes(adminPage, fragment, `admin page live-location runtime UI fragment ${fragment}`);
}

for (const removedDriverJobLinkFragment of [
  "Enable Live Location",
  "Live Enabled",
  'data-enable-driver-job-live-location-button="true"',
  'data-enable-driver-job-live-location-state=',
  'data-driver-job-live-location-feedback="true"',
  "driverJobLinkLiveLocationReference",
  "driverJobLinkLiveLocationEnabled",
  "driverJobLinkLiveLocationMessage",
]) {
  assertExcludes(
    adminPage,
    removedDriverJobLinkFragment,
    `removed Driver Job Link manual live-location control ${removedDriverJobLinkFragment}`,
  );
}

for (const removedSelectedJobMapFragment of [
  'aria-label="Selected Job Live Map"',
  'data-admin-active-jobs-map-runtime="true"',
  'data-admin-active-jobs-map-open="true"',
  'data-admin-active-jobs-map-selected-count=',
  'data-admin-active-jobs-map-selected-list="true"',
  "Selected Job Live Map",
  "Use Dashboard for all active jobs. Add this loaded booking only when you need selected-job live detail.",
  "Add this job",
  "openAdminLiveLocationRuntimeForLoadedBooking",
]) {
  assertExcludes(
    adminPage,
    removedSelectedJobMapFragment,
    `removed selected-job live-location control ${removedSelectedJobMapFragment}`,
  );
}

assertExcludes(
  adminPage,
  'data-admin-active-jobs-map-scaffold="disabled"',
  "admin active-jobs map disabled scaffold",
);

for (const fragment of [
  "driver_live_location_runtime_settings",
  "setting_name",
  "setting_status",
  "driver_live_location_allowed_job_references",
  "driver_live_location_capture_enabled",
  "admin_active_jobs_map_enabled",
  "driver_live_location_mode",
  "existingAllowedBookingReferences",
  "mergedAllowedBookingReferences",
  "driver_live_location_allowed_job_references: mergedAllowedBookingReferences",
  "safeReferencePattern",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(adminControlHelper, fragment, `admin control helper fragment ${fragment}`);
}

assertExcludes(
  adminControlHelper,
  "driver_live_location_allowed_job_references: [safeReference]",
  "admin control helper must not replace the selected reference list",
);

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "DELETE"]',
  "openAdminLiveLocationRuntimeControl",
  "closeAdminLiveLocationRuntimeControl",
  "readAdminLiveLocationRuntimeControl",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(adminControlRoute, fragment, `admin control route fragment ${fragment}`);
}

for (const fragment of [
  "openAdminLiveLocationRuntimeControl",
  "authorizeLiveLocationForDriverJobLink",
  "live_location: liveLocationAuthorization",
  "allowed_booking_references",
  "authorized",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(adminDriverJobLinksRoute, fragment, `admin driver job link route auto-authorize fragment ${fragment}`);
}

for (const fragment of [
  "export async function GET",
  "handleDriverLiveLocationReadinessRuntimeRequest",
  "checkDriverLiveLocationReadiness",
  "navigator.geolocation.getCurrentPosition",
  "navigator.geolocation.watchPosition",
  "navigator.geolocation.clearWatch",
  "Dispatch has not opened live location for this job.",
]) {
  assertIncludes(`${driverRoute}\n${driverJobPage}`, fragment, `driver readiness fragment ${fragment}`);
}

assertExcludes(
  driverJobPage,
  /NEXT_PUBLIC_PRESTIGE_DRIVER_LIVE_LOCATION|driverLiveLocationBrowserGpsEnabled|driverLiveLocationShareStopRuntimeUiEnabled|Browser GPS capture is still disabled for this build/i,
  "driver page build-time public live-location flags",
);

assertExcludes(
  driverJobPage,
  /setInterval|setTimeout|sendBeacon|localStorage|sessionStorage/i,
  "driver page timer/storage/sendBeacon GPS loop",
);

for (const fragment of [
  "handleAdminActiveJobsMapRuntimeRequest",
  "allowed_booking_references: allowedReferences",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(`${adminMapRoute}\n${runtimeHelper}`, fragment, `admin marker route fragment ${fragment}`);
}

for (const forbiddenPhrase of [
  "Open one saved booking",
  "Opens one booking reference at a time",
  "Opening live location for",
  "only. Ask driver to tap Share Location.",
]) {
  assertExcludes(adminPage, forbiddenPhrase, `stale one-booking UI phrase ${forbiddenPhrase}`);
}

for (const forbiddenPattern of [
  /all[_ -]?drivers|all[_ -]?jobs|wildcard|customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /stripe|paymentLink|checkoutSession|paynow|payout|driver_payout|invoice|billing/i,
]) {
  assertExcludes(
    `${adminControlRoute}\n${adminControlHelper}\n${driverRoute}\n${runtimeReadinessSection}`,
    forbiddenPattern,
    "live-location runtime control forbidden behavior",
  );
}

console.log("Driver live-location multi-driver admin list guard passed");
