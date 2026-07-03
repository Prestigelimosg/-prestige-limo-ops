import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs";
const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";
const driverStatusPersistenceContractPath =
  "scripts/test-driver-job-status-persistence-api-contract.mjs";
const liveLocationSetupPath = "lib/admin-live-location-setup-foundation.ts";
const liveLocationWindowPolicyPath = "lib/live-location-window-policy-setup-foundation.ts";
const liveLocationScaffoldPath = "lib/driver-live-location-scaffold.ts";
const driverLiveLocationRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminActiveJobsRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const driverJobDemoPath = "app/driver-job-demo/page.tsx";

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
  driverStatusWorkflow,
  driverStatusPersistence,
  driverStatusPersistenceContract,
  liveLocationSetup,
  liveLocationWindowPolicy,
  liveLocationScaffold,
  driverLiveLocationRoute,
  adminActiveJobsRoute,
  driverJobPage,
  driverJobDemo,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverStatusWorkflowPath, "utf8"),
  readFile(driverStatusPersistencePath, "utf8"),
  readFile(driverStatusPersistenceContractPath, "utf8"),
  readFile(liveLocationSetupPath, "utf8"),
  readFile(liveLocationWindowPolicyPath, "utf8"),
  readFile(liveLocationScaffoldPath, "utf8"),
  readFile(driverLiveLocationRoutePath, "utf8"),
  readFile(adminActiveJobsRoutePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(driverJobDemoPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location POB Auto-Stop Readiness Contract Guard Lock",
);

for (const phrase of [
  "Driver `Job Completed` now clears the exact active sharing marker for the resolved driver job link by deleting from `driver_live_location_latest_positions` with `driver_job_link_id` scope.",
  "This completed-status cleanup uses persisted driver job status evidence from `driver_job_status_events`, not local UI state, demo state, mock state, localStorage, customer status text, or untrusted browser-submitted status history.",
  "The completed cleanup is server-side verified through the existing driver job token path, customer-invisible, provider-send-free, and scoped to the resolved assigned job only; one driver's completed event must not stop or expose another driver/job location.",
  "Driver status remains the source of truth. If marker cleanup is unavailable, the status update still returns safe `sharing_cleanup` status without exposing table errors, coordinates, tokens, secrets, pricing, payout, finance, parser/debug, or internal notes.",
  "POB timed stop remains a future separately approved policy; the default planning value remains 5 minutes after persisted POB unless owner separately approves a different value.",
  "No GPS capture auto-start, customer live map activation, provider call/send, email/WhatsApp/SMS/Telegram send, env change, DB schema change, deploy, billing/payment/PDF/invoice/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, or shim work changed in this cleanup.",
  "This guard adds `scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger POB auto-stop phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation POB auto-stop guard registration");

for (const forbiddenPhrase of [
  "POB timed stop is active now",
  "GPS capture is active",
  "background auto-stop worker is active",
  "client-only timer is approved",
  "local UI state may stop sharing",
  "mock state may stop sharing",
  "indefinite polling loop is approved",
  "fallback send is approved",
  "multi-channel blast runtime is active",
  "customer live map is approved",
  "provider sends are approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden POB auto-stop activation claim");
}

for (const fragment of [
  'export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed"',
  '{ label: "OTW", value: "driver_otw" }',
  '{ label: "OTS", value: "ots" }',
  '{ label: "POB", value: "pob" }',
  '{ label: "Job Completed", value: "completed" }',
  "guardDriverJobStatusTransition",
  "nextStatusIndex !== currentStatusIndex + 1",
]) {
  assertIncludes(driverStatusWorkflow, fragment, `driver status workflow fragment ${fragment}`);
}

for (const fragment of [
  "driver_job_status_events",
  "status_value",
  'actor_role: "driver"',
  'source_surface: "driver_job_api"',
  'status_source: "driver_job_api"',
  ".insert(eventRow)",
  ".select(driverJobStatusEventSelect)",
  "clearDriverSharingMarkerForCompletedStatus",
  '.from("driver_live_location_latest_positions")',
  ".delete()",
  '.eq("driver_job_link_id", link.id)',
  "completed_marker_cleared",
  "sharing_cleanup: sharingCleanup",
]) {
  assertIncludes(driverStatusPersistence, fragment, `driver status persistence fragment ${fragment}`);
}

for (const fragment of [
  'assert.equal(result.status, "pob")',
  "assertInsertedStatusEvent(client, \"pob\")",
  "assertInsertedStatusEvent(client, \"completed\"",
  "assertDeletedCompletedSharingMarker(client)",
  "completed_marker_cleared",
]) {
  assertIncludes(
    driverStatusPersistenceContract,
    fragment,
    `driver status persistence contract fragment ${fragment}`,
  );
}

const liveLocationSetupSource = `${liveLocationSetup}\n${liveLocationWindowPolicy}`;
const closedLiveLocationSource = `${liveLocationScaffold}\n${driverLiveLocationRoute}\n${adminActiveJobsRoute}`;

for (const fragment of [
  'live_location_status: "disabled"',
  'driver_capture_status: "disabled"',
  'customer_map_status: "disabled"',
  'admin_map_status: "disabled"',
  "future_pob_auto_stop_minutes_after_pob: 5",
  "auto_stop_minutes_after_pob: 5",
  '"No driver browser GPS capture is active."',
  '"No customer map link is active."',
  '"No admin live map is active."',
  '"No database read or write is performed."',
]) {
  assertIncludes(liveLocationSetupSource, fragment, `live-location setup fragment ${fragment}`);
}

for (const fragment of [
  "{ status: 503 }",
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "sharing_state: \"inactive\"",
  "active_jobs: []",
]) {
  assertIncludes(closedLiveLocationSource, fragment, `closed live-location scaffold ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /gpsCaptureEnabled\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
  /api\.telegram\.org|sendLocation|sendMessage|TELEGRAM_BOT_TOKEN/i,
  /sendMail|sendSms|whatsapp|new\s+Resend/i,
]) {
  assertExcludes(closedLiveLocationSource, forbiddenPattern, "closed live-location scaffold");
}

assertExcludes(
  driverJobPage,
  /setInterval|setTimeout|sendBeacon/i,
  "production driver job page timer/sendBeacon GPS loop",
);
for (const fragment of [
  'const driverLiveLocationUiState = pageState.kind === "ready" ? "runtime-check" : "disabled";',
  "checkDriverLiveLocationReadiness",
  "requestDriverLiveLocationPosition",
  "navigator.geolocation.getCurrentPosition",
  "navigator.geolocation.watchPosition",
  "navigator.geolocation.clearWatch",
]) {
  assertIncludes(driverJobPage, fragment, `production driver job page gated share-location fragment ${fragment}`);
}
assertIncludes(driverJobDemo, "Mock live location", "driver demo live-location copy remains mock");
assertIncludes(
  driverJobDemo,
  "No phone location is captured or sent",
  "driver demo must state no phone location is captured",
);

console.log("Driver live-location POB auto-stop readiness contract guard passed");
