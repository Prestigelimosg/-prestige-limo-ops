import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-live-location-gated-runtime-evidence-contract-guard.mjs";

const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const adminPagePath = "app/page.tsx";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminActiveJobsRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const scaffoldHelperPath = "lib/driver-live-location-scaffold.ts";
const tableEvidenceRunnerPath = "scripts/run-driver-live-location-table-rls-retention-evidence.mjs";

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
  driverJobPage,
  adminPage,
  driverRoute,
  adminActiveJobsRoute,
  scaffoldHelper,
  tableEvidenceRunner,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(adminPagePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminActiveJobsRoutePath, "utf8"),
  readFile(scaffoldHelperPath, "utf8"),
  readFile(tableEvidenceRunnerPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Gated Runtime Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Driver Live Location gated runtime evidence pass.",
  "This lock does not activate GPS capture, open driver live-location routes, open admin active-jobs map reads, write/read location rows, change env, deploy, expose browser map keys, call providers, send messages, activate customer live map visibility, or touch billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work.",
  "Current prerequisites are recorded but still closed: table/RLS evidence is complete, driver consent UI scaffold is disabled, admin active-jobs map scaffold is disabled, and closed-gate route smoke is complete.",
  "Future runtime evidence requires separate owner approval naming the exact target, gate window, staging-safe driver job, evidence reference, cleanup plan, rollback plan, and whether a browser map key is involved.",
  "Future evidence must begin with closed-gate proof for driver share, driver stop, and admin active-jobs routes before any approved window is opened.",
  "Future driver capture must be explicit opt-in from the existing driver job link through the Share Location control, require browser permission, show sharing state, and provide Stop Sharing.",
  "Future capture must never auto-start from page load, driver status buttons, POB, OTW, OTS, Completed, copy, email, in-app, Telegram, WhatsApp, SMS, customer portal, or admin map actions.",
  "Future driver writes must resolve the current driver job token server-side and may write only for the resolved active assigned driver job; browser-submitted booking references, arbitrary job IDs, wrong tokens, and wrong drivers must be blocked.",
  "Future admin active-jobs reads must require the internal admin/dispatcher boundary and same-origin admin surface before any location rows are read.",
  "Future admin UI proof must show one admin-only marker/status row per actively sharing driver/job, visible stale/offline state, and no silent hiding or pretending stale drivers are live.",
  "Future customer visibility remains blocked; no customer live map link, Customer Copy live-location URL, customer portal tracking, customer in-app tracking, or customer-visible driver movement is approved by this lock.",
  "Future browser map rendering remains blocked unless a separately approved browser-safe, domain-restricted map key plan is complete; the existing server-side `PRESTIGE_GOOGLE_MAPS_API_KEY` must never be exposed to client code.",
  "Future evidence may write only bounded temporary live-location latest-position and audit rows for the approved fake/staging-safe job, then must clean them up and prove zero matching rows remain.",
  "Future evidence must prove anonymous, wrong-driver, wrong-token, wrong-admin, wrong-origin, closed-gate, missing-config, and rollback-disabled paths are blocked without leaking secrets or private data.",
  "Future evidence must prove no forbidden fields appear in driver UI, admin UI, route responses, normalized logs, temporary rows, or docs evidence.",
  "Forbidden fields remain pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, mock QA/dev archive fields, and env values.",
  "Future stop proof must include explicit Stop Sharing rollback or equivalent bounded stop evidence; future POB/completed auto-stop remains a separate proof unless explicitly included in the approved evidence task.",
  "No scheduler, indefinite polling, retry storm, queue, cron, fallback send, provider send, Telegram true live-location send, Email/WhatsApp/SMS send, customer blast, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, or shim work is approved by this lock.",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_CAPTURE_ENABLED`",
  "`PRESTIGE_ADMIN_ACTIVE_JOBS_MAP_ENABLED`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_MODE`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_ALLOWED_JOB_REFERENCES`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_UPDATE_INTERVAL_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_STALE_AFTER_SECONDS`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_RETENTION_MINUTES`",
  "`PRESTIGE_DRIVER_LIVE_LOCATION_TABLE_RLS_EVIDENCE_REFERENCE`",
  "This guard adds `scripts/test-driver-live-location-gated-runtime-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger runtime evidence phrase ${phrase}`);
}

for (const forbiddenPhrase of [
  "GPS capture is active now",
  "driver live-location routes are open now",
  "admin active-jobs reads are live now",
  "customer live map is approved now",
  "all drivers may be tracked",
  "all jobs may be tracked",
  "browser may use PRESTIGE_GOOGLE_MAPS_API_KEY",
  "provider sends are approved",
  "billing is approved",
  "payout is approved",
  "indefinite polling is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden runtime activation claim");
}

assertIncludes(preactivationSuite, guardScript, "preactivation runtime evidence guard registration");
for (const relatedGuard of [
  "scripts/test-driver-live-location-active-jobs-map-contract-guard.mjs",
  "scripts/test-driver-live-location-consent-ui-readiness-contract-guard.mjs",
  "scripts/test-driver-live-location-closed-gate-route-smoke-guard.mjs",
  "scripts/test-driver-live-location-table-rls-retention-evidence-runner-guard.mjs",
  "scripts/test-driver-live-location-stale-offline-readiness-contract-guard.mjs",
  "scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs",
  "scripts/test-customer-live-location-link-readiness-contract-guard.mjs",
]) {
  assertIncludes(preactivationSuite, relatedGuard, `related guard registration ${relatedGuard}`);
}

const driverConsentStart = driverJobPage.indexOf("data-driver-live-location-consent-ui={driverLiveLocationUiState}");
assert.notEqual(driverConsentStart, -1, "Driver consent UI disabled scaffold must exist.");
const driverConsentEnd = driverJobPage.indexOf("</section>", driverConsentStart);
assert.notEqual(driverConsentEnd, -1, "Driver consent UI disabled scaffold must close.");
const driverConsentUi = driverJobPage.slice(driverConsentStart, driverConsentEnd);

for (const fragment of [
  "data-driver-live-location-share-button={driverLiveLocationUiState}",
  "data-driver-live-location-stop-button={driverLiveLocationUiState}",
  "data-driver-live-location-sharing-state={driverLiveLocation.sharingState}",
  "data-driver-live-location-permission-state={driverLiveLocation.permissionState}",
  "Share Location",
  "Stop Sharing",
]) {
  assertIncludes(driverConsentUi, fragment, `driver consent disabled UI fragment ${fragment}`);
}

for (const fragment of [
  'const driverLiveLocationUiState = pageState.kind === "ready" ? "runtime-check" : "disabled";',
  "checkDriverLiveLocationReadiness",
  "requestDriverLiveLocationPosition",
  "navigator.geolocation.getCurrentPosition",
  "customerVisible !== false",
  "external_send !== false",
]) {
  assertIncludes(driverJobPage, fragment, `driver job gated live-location fragment ${fragment}`);
}

const adminRuntimeStart = adminPage.indexOf(
  'aria-label="Admin Active Jobs Map"',
);
assert.notEqual(adminRuntimeStart, -1, "Admin active-jobs runtime must exist.");
const adminRuntimeEnd = adminPage.indexOf(
  'data-admin-day-of-trip-dispatch-monitor-boundary="true"',
  adminRuntimeStart,
);
assert.notEqual(adminRuntimeEnd, -1, "Admin active-jobs runtime must end before boundary.");
const adminActiveJobsUi = adminPage.slice(adminRuntimeStart, adminRuntimeEnd);

for (const fragment of [
  'data-admin-active-jobs-map-runtime="true"',
  'data-admin-active-jobs-map-state={adminActiveJobsMapReadState.runtimeStatus}',
  'data-admin-active-jobs-map-selected-count=',
  'data-admin-active-jobs-map-marker-count={adminActiveJobsMapReadState.markerCount}',
  'data-admin-active-jobs-map-sharing-state=',
  'data-admin-active-jobs-map-stale-state=',
  'data-admin-active-jobs-map-selected-list="true"',
  'data-admin-active-jobs-map-marker-list="true"',
  "Active Jobs Map",
  "Add",
  "Close all",
  "Google",
]) {
  assertIncludes(adminActiveJobsUi, fragment, `admin active-jobs runtime UI fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /\/api\/admin-active-jobs-map-locations/i,
  /watchPosition|clearWatch|GeolocationPosition/i,
  /google\.maps\.Map|new\s+google|maps\.googleapis|<canvas|NEXT_PUBLIC|PRESTIGE_GOOGLE_MAPS/i,
  /createClient|supabase|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(driverConsentUi, forbiddenPattern, "disabled driver consent UI runtime evidence surface");
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /google\.maps\.Map|new\s+google|maps\.googleapis|<canvas|NEXT_PUBLIC|PRESTIGE_GOOGLE_MAPS/i,
  /customerVisible\s*[:=]\s*true|external_send\s*[:=]\s*true/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(adminActiveJobsUi, forbiddenPattern, "admin active-jobs UI runtime evidence surface");
}

const closedRuntimeSource = `${driverRoute}\n${adminActiveJobsRoute}\n${scaffoldHelper}`;

for (const fragment of [
  "{ status: 503 }",
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "external_send: false",
  "sharing_state: \"inactive\"",
  "permission_state: \"not_requested\"",
  "active_jobs: []",
  "map_rendered: false",
  "marker_count: 0",
]) {
  assertIncludes(closedRuntimeSource, fragment, `closed runtime fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /gpsCaptureEnabled\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true/i,
  /request\.json|FormData|arrayBuffer|blob\(/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /setInterval|cron|new Worker|retryLoop|retry_loop|polling/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(closedRuntimeSource, forbiddenPattern, "closed live-location runtime evidence routes");
}

for (const fragment of [
  'const expectedApproval = "driver-live-location-table-rls-retention-evidence-approved";',
  'const allowedPhases = new Set(["pre-window", "db-window", "post-rollback"]);',
  'serviceClient.from(auditTable).delete().eq("evidence_reference", evidenceReference)',
  'serviceClient.from(latestTable).delete().eq("evidence_reference", evidenceReference)',
  "latestAfterCleanup",
  "auditAfterCleanup",
  "driver_live_location_fixture_cleanup_failed",
  "cleanup_zero_rows: true",
]) {
  assertIncludes(tableEvidenceRunner, fragment, `table evidence runner cleanup fragment ${fragment}`);
}

console.log("Driver live-location gated runtime evidence contract guard passed");
