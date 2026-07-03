import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-live-location-active-jobs-map-contract-guard.mjs";

const liveLocationSetupPath = "lib/admin-live-location-setup-foundation.ts";
const liveLocationWindowPolicyPath = "lib/live-location-window-policy-setup-foundation.ts";
const liveLocationAccessCaptureRoutePath =
  "app/api/admin-live-location-access-capture-disabled-setup/route.ts";
const liveLocationPreviewRoutePath =
  "app/api/admin-live-location-window-policy-preview-readiness-setup/route.ts";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverJobDemoPath = "app/driver-job-demo/page.tsx";
const adminPagePath = "app/page.tsx";
const mapLocationSearchPath = "lib/admin-map-location-search.ts";
const mapRouteEstimatesPath = "lib/admin-map-route-estimates.ts";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";

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
  liveLocationSetup,
  liveLocationWindowPolicy,
  liveLocationAccessCaptureRoute,
  liveLocationPreviewRoute,
  driverJobPage,
  driverJobDemo,
  adminPage,
  mapLocationSearch,
  mapRouteEstimates,
  driverStatusWorkflow,
  driverStatusPersistence,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(liveLocationSetupPath, "utf8"),
  readFile(liveLocationWindowPolicyPath, "utf8"),
  readFile(liveLocationAccessCaptureRoutePath, "utf8"),
  readFile(liveLocationPreviewRoutePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverJobDemoPath, "utf8"),
  readFile(adminPagePath, "utf8"),
  readFile(mapLocationSearchPath, "utf8"),
  readFile(mapRouteEstimatesPath, "utf8"),
  readFile(driverStatusWorkflowPath, "utf8"),
  readFile(driverStatusPersistencePath, "utf8"),
]);

const guardSection = sectionBetween(
  ledger,
  "### Driver Live Location Capture + Admin Active Jobs Map Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future separately approved Driver Live Location Capture and Admin Active Jobs Map implementation.",
  "This lock does not activate driver browser GPS capture, driver location write/read APIs, admin active-jobs map runtime, customer live map links, location storage, table/RLS changes, env changes, deploy, provider sends, Google Maps browser key exposure, OneMap retry, Telegram live-location sends, WhatsApp/Email/SMS fallback, billing/payment/PDF/payout, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, UI sector/card expansion, shims, or production activation.",
  "Current state remains setup-only/disabled: no driver GPS capture, no coordinate persistence, no admin active-jobs map, no customer live map link, no external map tracking, and no database read/write.",
  "The exact-2/exact-3/exact-5 customer runtime pilots are customer portal/in-app allowlist scopes only; they are not driver live-location capacity limits.",
  "Future admin active-jobs map must support multiple simultaneous active jobs by showing one admin-only marker per actively sharing driver/job, with stale/offline state instead of hiding failure.",
  "Future driver capture must be explicit opt-in from the existing driver job link, require browser location permission, show clear sharing state to the driver, and provide an explicit stop control.",
  "Future capture must be scoped to the current driver job token and assigned job only; one driver token must not see or write another driver/job location.",
  "Future admin map read must be admin/dispatcher-only and same-origin/admin-boundary protected.",
  "Future customer visibility is not approved by this lane; any customer live map link remains a separate later approval.",
  "Future base-map rendering must not expose the existing server-side Google Maps key. Any browser map key requires a separately approved, domain-restricted, names-only env plan before use.",
  "`PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_MODE`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`",
  "Closed gates must not call `navigator.geolocation`, must not read map/provider keys, must not create a DB client, must not write coordinates, and must not render an active admin map.",
  "Future safe admin-visible location fields are limited to driver display label, assigned job label/reference, driver job status, vehicle/plate label if already assigned, latest latitude/longitude, accuracy, heading/speed if browser provides them, last updated time, stale/offline flag, and sharing state.",
  "Future driver-visible fields are limited to the current job location-sharing state, permission state, last shared time, and stop/share controls.",
  "Future location rows must not include pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, customer contact details, customer messages, OTS/photo/storage, or calendar data unless separately approved.",
  "Future persistence requires a separately approved table/RLS/retention proof before live coordinates are stored.",
  "Future persistence must prefer latest-location state plus bounded audit events over unbounded coordinate history unless owner separately approves retention.",
  "Future cleanup/retention proof must define how test/evidence rows are removed and how stale production rows expire.",
  "Future POB/job-complete stop behavior must use persisted driver status events from the guarded `driver_otw -> ots -> pob -> completed` workflow, not local/demo/mock state.",
  "Future auto-stop must be bounded, must not create an indefinite polling loop, and must stop capture after the approved POB/job-complete policy window.",
  "Future evidence must begin with closed-gate proof, use fake/staging-safe jobs first, prove anonymous/wrong-driver/wrong-admin blocked paths, prove no forbidden fields, prove rollback/disable, and prove zero matching temporary location rows remain after cleanup.",
  "Future runtime must remain separate from Telegram True Live Location, Email/WhatsApp/SMS provider sends, Google Maps admin search/route estimates, OneMap, FlightAware, customer portal/in-app runtime, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.",
  "This guard adds `scripts/test-driver-live-location-active-jobs-map-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(guardSection, phrase, `Driver live-location active-jobs phrase: ${phrase}`);
}

for (const forbidden of [
  "driver GPS capture is active now",
  "admin active-jobs map is live now",
  "customer live map link is approved now",
  "Google Maps browser key may be exposed",
  "all drivers can be tracked",
  "all jobs can be tracked",
  "all-customer live map is approved",
  "unbounded coordinate history is approved",
  "indefinite polling loop is approved",
  "Telegram fallback is approved",
  "WhatsApp fallback is approved",
  "Email fallback is approved",
  "SMS fallback is approved",
  "provider sends are approved",
  "billing may be mixed with live location",
  "payout may be mixed with live location",
  "Save Booking may be changed for live location",
  "/api/admin-saved-bookings may be changed for live location",
  "new UI sector is approved",
  "new shim is approved",
]) {
  assertExcludes(guardSection, forbidden, "forbidden driver live-location activation phrase");
}

assertIncludes(preactivationSuite, guardScript, "preactivation driver live-location active-jobs guard registration");

const currentLiveLocationSource = [
  liveLocationSetup,
  liveLocationWindowPolicy,
  liveLocationAccessCaptureRoute,
  liveLocationPreviewRoute,
].join("\n");

for (const fragment of [
  'live_location_status: "disabled"',
  'driver_capture_status: "disabled"',
  'customer_map_status: "disabled"',
  'admin_map_status: "disabled"',
  '"No driver browser GPS capture is active."',
  '"No customer map link is active."',
  '"No admin live map is active."',
  '"No external map tracking is active."',
  '"No database read or write is performed."',
  "gpsCaptureEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "locationStorageEnabled: false",
  "liveAccessEnabled: false",
  "auto_stop_minutes_after_pob: 5",
]) {
  assertIncludes(currentLiveLocationSource, fragment, `current disabled live-location fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true/i,
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i,
  /setInterval|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(
    currentLiveLocationSource,
    forbiddenPattern,
    "current live-location setup-only routes/helpers",
  );
}

const adminActiveJobsRuntimeSection = sectionBetween(
  ledger,
  "### Driver Live Location Multi-Driver Admin List",
);

for (const phrase of [
  "Admin Dispatch has one compact Dispatch Live Dispatch Map runtime control for the active jobs list; the old selected-job live map control is not rendered inside the Day-of-Trip Dispatch Monitor.",
  "The Dispatch Live Dispatch Map opens live movement for the active job references in one operator click through `/api/admin-live-location-runtime` instead of requiring a selected booking to be added manually.",
  "Runtime control keeps existing `driver_live_location_allowed_job_references`, removes duplicates, and caps the selected booking list at 50 references.",
  "Admin marker refresh uses the existing guarded `GET /api/admin-active-jobs-map-locations` route and returns both selected booking references and current driver markers.",
  "The admin UI renders compact active marker rows, per-driver `Open Map` fallback links, and an optional browser map canvas that remains off unless the separate browser-safe map config route is enabled.",
  "Same-driver duplicate live markers are collapsed by driver identity; current/newest movement wins and any older duplicate rows are reported as hidden.",
  "The admin browser map updates Google marker positions from driver GPS instead of drawing a separate CSS arrow/trail overlay, so visible marker placement stays aligned to the map.",
  "Admin live-marker polling runs every 5 seconds while the active live map is open; this is display refresh only and does not add a new driver/customer tracking surface.",
  "Customer live-location API remains same-origin/session/booking-boundary gated and no customer message is sent by this lane.",
]) {
  assertIncludes(
    adminActiveJobsRuntimeSection,
    phrase,
    `Driver live-location admin active-jobs runtime phrase: ${phrase}`,
  );
}

const activeJobsRuntimeStart = adminPage.indexOf(
  'data-dispatch-live-driver-map="true"',
);
assert.notEqual(activeJobsRuntimeStart, -1, "Missing admin active-jobs map runtime.");
const activeJobsRuntimeBoundaryText =
  "Admin-only. Uses assigned active jobs and driver-shared live movement; no external message is sent from here.";
const activeJobsRuntimeEnd = adminPage.indexOf(
  activeJobsRuntimeBoundaryText,
  activeJobsRuntimeStart,
);
assert.notEqual(activeJobsRuntimeEnd, -1, "Missing admin active-jobs runtime end boundary.");
const activeJobsRuntimeSource = adminPage.slice(
  activeJobsRuntimeStart,
  activeJobsRuntimeEnd + activeJobsRuntimeBoundaryText.length,
);

for (const fragment of [
  'data-dispatch-live-driver-map="true"',
  'data-dispatch-live-driver-map-state={adminActiveJobsMapReadState.runtimeStatus}',
  'data-dispatch-live-driver-map-marker-count={adminActiveJobsMapReadState.markerCount}',
  'data-dispatch-live-driver-map-slot-count={liveDispatchPreparedSlotCount}',
  'data-dispatch-live-driver-map-open="true"',
  'data-dispatch-live-driver-map-refresh="true"',
  'data-dispatch-live-driver-map-close="true"',
  'data-dispatch-live-driver-map-config-message="true"',
  'data-dispatch-live-driver-map-marker-list="true"',
  'data-dispatch-live-driver-map-boundary="true"',
  "Live Dispatch Map",
  "Assigned job live movement; driver locations refresh automatically while Today&apos;s Jobs is open.",
  "Open Live Dispatch Map",
  "Refresh movement",
  "Close live map",
  "Open Map",
  "activeJobDriverStatusReferenceList.length === 0",
  "Admin-only. Uses assigned active jobs and driver-shared live movement; no external message is sent from here.",
]) {
  assertIncludes(activeJobsRuntimeSource, fragment, `admin active-jobs runtime UI fragment ${fragment}`);
}

for (const fragment of [
  'data-admin-active-jobs-map-live-movement="true"',
  'data-admin-active-jobs-map-live-movement-status="true"',
  "Google marker positions update from driver GPS every few seconds",
  "collapseAdminActiveJobsMapDriverDuplicates",
  "older duplicate",
  "adminActiveJobsMapPollIntervalMs",
]) {
  assertIncludes(adminPage, fragment, `admin active-jobs moving map component fragment ${fragment}`);
}

const dayOfTripMonitorStart = adminPage.indexOf('data-admin-day-of-trip-dispatch-monitor="true"');
const dayOfTripExceptionStart = adminPage.indexOf(
  'data-admin-day-of-trip-exception-escalation="true"',
  dayOfTripMonitorStart,
);
assert.notEqual(dayOfTripMonitorStart, -1, "Missing existing Day-of-Trip Dispatch Monitor section.");
assert.notEqual(dayOfTripExceptionStart, -1, "Missing Day-of-Trip Exception section boundary.");
const dayOfTripMonitorSource = adminPage.slice(dayOfTripMonitorStart, dayOfTripExceptionStart);
assertExcludes(
  dayOfTripMonitorSource,
  'data-admin-active-jobs-map-runtime="true"',
  "old selected-job live map runtime must not remain inside existing Day-of-Trip Dispatch Monitor area",
);
assertIncludes(
  dayOfTripMonitorSource,
  "the Dispatch Live Dispatch Map for active jobs only.",
  "Day-of-Trip monitor boundary should point operators to the single Dispatch Live Dispatch Map",
);

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|PRESTIGE_GOOGLE_MAPS_BROWSER_API_KEY|PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_BROWSER_PROVIDER|NEXT_PUBLIC/i,
  /customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true/i,
]) {
  assertExcludes(
    activeJobsRuntimeSource,
    forbiddenPattern,
    "admin active-jobs runtime UI",
  );
}

const driverJobRuntimeSource = `${driverJobPage}\n${driverJobDemo}`;

assertExcludes(
  driverJobPage,
  /setInterval|setTimeout|sendBeacon/i,
  "production driver job page timer/sendBeacon GPS loop",
);
assertExcludes(
  driverJobPage,
  /gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true|google\.maps|maps\.google|new\s+google\.maps\.Map|mapCanvas|map-canvas|<canvas/i,
  "production driver job page live-location activation",
);
for (const fragment of [
  'data-driver-live-location-share-button={driverLiveLocationUiState}',
  'const driverLiveLocationUiState = pageState.kind === "ready" ? "runtime-check" : "disabled";',
  "Share only when dispatch opens live location for this job.",
  "Share Location",
  "navigator.geolocation.getCurrentPosition",
  "navigator.geolocation.watchPosition",
  "navigator.geolocation.clearWatch",
  "customerVisible !== false",
  "external_send !== false",
]) {
  assertIncludes(
    driverJobPage,
    fragment,
    `production driver job page gated live-location fragment ${fragment}`,
  );
}
assertIncludes(
  driverJobRuntimeSource,
  "Mock live location",
  "driver demo may keep mock live-location copy clearly marked mock",
);
assertIncludes(
  driverJobRuntimeSource,
  "No phone location is captured or sent",
  "driver demo must state mock live-location captures nothing",
);

for (const fragment of [
  'export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed"',
  '{ label: "POB", value: "pob" }',
  "guardDriverJobStatusTransition",
  "driver_job_status_events",
  'actor_role: "driver"',
  'status_source: "driver_job_api"',
]) {
  assertIncludes(
    `${driverStatusWorkflow}\n${driverStatusPersistence}`,
    fragment,
    `driver status source fragment ${fragment}`,
  );
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|GeolocationPosition/i,
  /PRESTIGE_DRIVER_LIVE_LOCATION|PRESTIGE_ADMIN_ACTIVE_JOBS_MAP/i,
  /locationStorageEnabled\s*[:=]\s*true|gpsCaptureEnabled\s*[:=]\s*true/i,
]) {
  assertExcludes(
    `${mapLocationSearch}\n${mapRouteEstimates}`,
    forbiddenPattern,
    "Google Maps admin search/route helpers must stay separate from driver GPS",
  );
}

console.log("Driver Live Location Capture + Admin Active Jobs Map contract guard passed");
