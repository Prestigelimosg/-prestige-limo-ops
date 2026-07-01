import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const adminPagePath = "app/page.tsx";
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
  adminControlHelper,
  adminControlRoute,
  adminMapRoute,
  driverJobPage,
  driverRoute,
  runtimeHelper,
  ledger,
] = await Promise.all([
  readFile(adminPagePath, "utf8"),
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
  "Admin Dispatch has a compact Active Jobs Map runtime control inside the existing Day-of-Trip Dispatch Monitor.",
  "The control adds selected saved bookings one by one through `/api/admin-live-location-runtime` instead of replacing the previous selected booking.",
  "Runtime control keeps existing `driver_live_location_allowed_job_references`, removes duplicates, and caps the selected booking list at 50 references.",
  "Driver `Share Location` first calls `GET /api/driver-job/[token]/live-location` for server readiness; Chrome GPS is requested only after that readiness check passes.",
  "Admin marker refresh uses the existing guarded `GET /api/admin-active-jobs-map-locations` route and returns both selected booking references and current driver markers.",
  "The admin UI renders compact selected-booking chips, marker rows, and a Google Maps link per active driver/job; it does not embed a browser map key or render a map provider widget.",
  "Closing the runtime clears the selected list and gates driver/customer map reads off.",
  "Customer live-location API remains same-origin/session/booking-boundary gated and no customer message is sent by this lane.",
  "No broad driver tracking, no wildcard job tracking, no browser Maps JavaScript key, no Vercel CLI, env value change, DB schema change, provider send, email/WhatsApp/SMS/Telegram send, billing/payment/PDF/invoice/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, or calendar behavior changed.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger runtime control phrase ${phrase}`);
}

for (const fragment of [
  "adminLiveLocationRuntimeApiPath",
  "adminActiveJobsMapLocationsApiPath",
  'data-admin-active-jobs-map-runtime="true"',
  'data-admin-active-jobs-map-open="true"',
  'data-admin-active-jobs-map-refresh="true"',
  'data-admin-active-jobs-map-close="true"',
  'data-admin-active-jobs-map-selected-count=',
  'data-admin-active-jobs-map-selected-list="true"',
  'data-admin-active-jobs-map-marker-list="true"',
  "Add saved bookings one by one",
  "Selected:",
  "Close all",
  "openAdminLiveLocationRuntimeForLoadedBooking",
  "closeAdminLiveLocationRuntime",
  "refreshAdminActiveJobsMapLocations",
  "googleMapsLocationUrl",
]) {
  assertIncludes(adminPage, fragment, `admin page live-location runtime UI fragment ${fragment}`);
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
  "export async function GET",
  "handleDriverLiveLocationReadinessRuntimeRequest",
  "checkDriverLiveLocationReadiness",
  "navigator.geolocation.getCurrentPosition",
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
  /watchPosition|clearWatch|sendBeacon|localStorage|sessionStorage/i,
  "driver page background/live polling GPS",
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
