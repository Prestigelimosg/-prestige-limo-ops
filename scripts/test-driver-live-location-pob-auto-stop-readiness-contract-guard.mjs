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
  "This is a docs/test-only guard for future Driver Live Location stop behavior after POB or Job Completed.",
  "This lock does not activate GPS capture, start/stop live-location runtime, open live-location gates, write/read location rows, apply migrations, change env, deploy, call providers, send messages, activate customer live map links, or activate production.",
  "Current state remains closed: no browser GPS capture, no location row persistence, no active admin map, no customer live map, no polling loop, and no background auto-stop worker.",
  "Future auto-stop must use persisted driver job status evidence from `driver_job_status_events`, not local UI state, demo state, mock state, localStorage, customer status text, or untrusted browser-submitted status history.",
  "Future auto-stop may stop sharing when the resolved assigned job reaches persisted `pob` or `completed`, using the guarded `driver_otw -> ots -> pob -> completed` workflow.",
  "Future POB stop policy must be bounded and names-only; the default planning value remains 5 minutes after persisted POB unless owner separately approves a different value.",
  "Future Job Completed stop policy must stop sharing immediately or at the approved bounded grace window; it must not leave indefinite tracking active after terminal completion.",
  "Future auto-stop must be scoped to the resolved driver job token and assigned job only; one driver's POB/completed event must not stop or expose another driver/job location.",
  "Future auto-stop implementation must be server-side verified, admin/dispatcher auditable, and must not rely on client-only timers as the source of truth.",
  "Future auto-stop may use a bounded timer or scheduler only after separate owner approval; no indefinite polling loop, retry storm, fallback send, queue, cron, or multi-channel blast is approved by this guard.",
  "Future auto-stop evidence must prove closed gates, fake/staging-safe status events first, wrong-driver blocked, wrong-admin blocked, stop after persisted POB/completed, stale/offline state, cleanup zero temporary rows, rollback disabled, and no customer live map.",
  "Future stop/audit rows must include only safe operational fields and must not include pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, customer messages, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.",
  "Future auto-stop remains separate from Telegram True Live Location, Email/WhatsApp/SMS provider sends, Customer In-App, Driver In-App, Customer Copy, Driver Details Email, Google Maps admin search/route estimates, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.",
  "This guard adds `scripts/test-driver-live-location-pob-auto-stop-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger POB auto-stop phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation POB auto-stop guard registration");

for (const forbiddenPhrase of [
  "auto-stop is active now",
  "GPS capture is active",
  "location row persistence is active",
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
]) {
  assertIncludes(driverStatusPersistence, fragment, `driver status persistence fragment ${fragment}`);
}

for (const fragment of [
  'assert.equal(result.status, "pob")',
  "assertInsertedStatusEvent(client, \"pob\")",
  "assertInsertedStatusEvent(client, \"completed\"",
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
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition|setInterval|setTimeout/i,
  "production driver job page",
);
assertIncludes(driverJobDemo, "Mock live location", "driver demo live-location copy remains mock");
assertIncludes(
  driverJobDemo,
  "No phone location is captured or sent",
  "driver demo must state no phone location is captured",
);

console.log("Driver live-location POB auto-stop readiness contract guard passed");
