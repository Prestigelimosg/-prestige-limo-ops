import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-driver-location-pob-evidence-contract-guard.mjs";

const driverStatusWorkflowPath = "lib/driver-job-status-workflow.ts";
const driverStatusPersistencePath = "lib/driver-job-status-persistence.ts";
const driverStatusContractPath = "scripts/test-driver-reporting-status-contract.mjs";
const driverStatusPersistenceContractPath =
  "scripts/test-driver-job-status-persistence-api-contract.mjs";
const liveLocationSetupPath = "lib/admin-live-location-setup-foundation.ts";
const liveLocationWindowPolicyPath = "lib/live-location-window-policy-setup-foundation.ts";
const mapLocationSearchPath = "lib/admin-map-location-search.ts";
const mapRouteEstimatePath = "lib/admin-map-route-estimates.ts";

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
  driverStatusContract,
  driverStatusPersistenceContract,
  liveLocationSetup,
  liveLocationWindowPolicy,
  mapLocationSearch,
  mapRouteEstimate,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverStatusWorkflowPath, "utf8"),
  readFile(driverStatusPersistencePath, "utf8"),
  readFile(driverStatusContractPath, "utf8"),
  readFile(driverStatusPersistenceContractPath, "utf8"),
  readFile(liveLocationSetupPath, "utf8"),
  readFile(liveLocationWindowPolicyPath, "utf8"),
  readFile(mapLocationSearchPath, "utf8"),
  readFile(mapRouteEstimatePath, "utf8"),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Driver Location Source + POB Status Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Driver Location Source + POB Status evidence pass before Telegram True Live Location activation.",
  "This lock does not activate driver GPS/location capture, driver location source implementation, Telegram live-location routes/helpers, Telegram Bot API calls, Telegram sends, bot token creation/use, env changes, DB read/write, coordinate persistence, scheduler/timer/polling/retry behavior, customer map, admin live map, OneMap provider calls, auth/session/cookie creation, OTS photo/storage, calendar, deployment, UI expansion, shims, or production activation.",
  "Future driver location source requires explicit owner approval.",
  "Future driver GPS/location capture requires explicit owner approval.",
  "Future Telegram live-location integration requires explicit owner approval.",
  "Future POB-driven auto-stop requires explicit owner approval.",
  "Future bounded timer/scheduler/polling requires explicit owner approval if needed.",
  "Future DB persistence/table/RLS proof requires explicit owner approval if coordinates are stored.",
  "Future rollback/disable plan requires explicit owner approval.",
  "Future gate/env proof must be names-only and must not print tokens, chat IDs, cookies, passwords, API keys, env values, database URLs, coordinates from real users, or secrets.",
  "`PRESTIGE_DRIVER_LOCATION_SOURCE_ENABLED`",
  "`PRESTIGE_DRIVER_LOCATION_CAPTURE_ENABLED`",
  "`PRESTIGE_TELEGRAM_LIVE_LOCATION_ENABLED`",
  "`PRESTIGE_TELEGRAM_LIVE_LOCATION_STAGING_CHAT_ALLOWLIST`",
  "`PRESTIGE_TELEGRAM_LIVE_LOCATION_AUTO_STOP_AFTER_POB_MINUTES`",
  "`TELEGRAM_BOT_TOKEN`",
  "`PRESTIGE_ONEMAP_LOOKUP_ENABLED` only if OneMap is later approved for map/geocode/routing support.",
  "POB source proof must use persisted `driver_job_status_events`.",
  "POB sequence proof must use `driver_otw -> ots -> pob -> completed`.",
  "Auto-stop proof must use a persisted `pob` event plus 5 minutes.",
  "Auto-stop must not rely on local UI state, demo state, or mock-only state.",
  "Driver location source proof is required before any Telegram live-location evidence.",
  "Location capture must be closed/disabled by default.",
  "Closed location gate must not capture GPS.",
  "Closed Telegram gate must not read `TELEGRAM_BOT_TOKEN`.",
  "Closed Telegram gate must not call Telegram.",
  "No OneMap call is approved in this lane.",
  "OneMap active admin map/search/route runtime is retired; any future OneMap reintroduction must remain separate from driver GPS and requires separate owner approval.",
  "Admin/dispatcher boundary is required for any future start, stop, or live-location action.",
  "Staging chat allowlist proof is required before any future Telegram evidence.",
  "No public, customer, or driver route may trigger Telegram sends unless separately approved and guarded.",
  "Rollback/disable proof must verify no GPS capture, no Telegram call, and no live-location send after gate close.",
  "No timer/scheduler/polling/retry/background worker may be introduced in this lane.",
  "Future auto-stop mechanism must be separately approved and bounded.",
  "Future timer/scheduler/polling proof must show one bounded live-location session only, no indefinite loop, no retry storm, no fallback send, no multi-channel blast, clean stop after POB plus 5 minutes, and rollback disables the mechanism.",
  "Future driver/live-location evidence must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, invoice content, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, OTS photo/storage data unless separately approved, or calendar data unless separately approved.",
  "Driver location source + POB must remain separate from Save Booking, parser, `/api/admin-saved-bookings`, pricing/rates/customer_rates, `driver_payout_rules`, payout/payment/PDF/billing/invoice, auth/session/cookie, OTS/photo/storage, calendar, UI sector/card/button expansion, shims, Email/WhatsApp/SMS sends, FlightAware live lookup, and production activation.",
  "Current POB source candidate is the production driver job status path: `PATCH /api/driver-job/[token]/status` writing `pob` into `driver_job_status_events` through the guarded `driver_otw -> ots -> pob -> completed` workflow.",
  "Current driver location source is absent: no current GPS capture, Telegram live-location source, or live driver coordinate stream exists.",
  "Current live-location surfaces remain setup-only/disabled with no driver browser GPS capture, no customer map link, no admin live map, no external map tracking, and no database read/write.",
  "This guard adds `scripts/test-driver-location-pob-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `Driver Location + POB evidence phrase: ${phrase}`);
}

for (const forbidden of [
  "driver GPS capture is approved now",
  "driver location source is active now",
  "Telegram live location is approved now",
  "Telegram Bot API call is approved now",
  "TELEGRAM_BOT_TOKEN may be read now",
  "coordinate persistence is approved now",
  "OneMap is approved as driver GPS source",
  "timer is approved now",
  "scheduler is approved now",
  "polling is approved now",
  "retry loop is approved now",
  "auto-stop may rely on local UI state",
  "auto-stop may rely on mock state",
  "public route is approved to trigger Telegram send",
  "customer route is approved to trigger Telegram send",
  "driver route is approved to trigger Telegram send",
  "fallback send is approved",
  "multi-channel blast is approved",
  "Save Booking may be changed for driver location",
  "/api/admin-saved-bookings may be changed for driver location",
  "parser may be changed for driver location",
  "pricing may be mixed with driver location",
  "payout may be mixed with driver location",
  "auth activation may be mixed with driver location",
  "OTS photo may be mixed with driver location",
  "new UI sector is approved",
  "new shim is approved",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden Driver Location + POB activation phrase");
}

assertIncludes(preactivationSuite, guardScript, "preactivation Driver Location + POB guard registration");

for (const fragment of [
  'export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed"',
  '{ label: "OTW", value: "driver_otw" }',
  '{ label: "OTS", value: "ots" }',
  '{ label: "POB", value: "pob" }',
  '{ label: "Job Completed", value: "completed" }',
  'normalized === "passenger_on_board"',
  "guardDriverJobStatusTransition",
  "nextStatusIndex !== currentStatusIndex + 1",
]) {
  assertIncludes(driverStatusWorkflow, fragment, `driver status workflow fragment ${fragment}`);
}

for (const fragment of [
  "driver_otw -> ots -> pob -> completed",
  "status after JC: reject as `already_completed`.",
]) {
  assertIncludes(driverStatusContract, fragment, `driver reporting contract fragment ${fragment}`);
}

for (const fragment of [
  "driver_job_status_events",
  "status_value",
  'actor_role: "driver"',
  'source_surface: "driver_job_api"',
  'status_source: "driver_job_api"',
  "statusHistory.statuses[0]?.status_value",
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

const liveLocationSetupSources = `${liveLocationSetup}\n${liveLocationWindowPolicy}`;

for (const fragment of [
  'live_location_status: "disabled"',
  'driver_capture_status: "disabled"',
  'customer_map_status: "disabled"',
  'admin_map_status: "disabled"',
  "future_pob_auto_stop_minutes_after_pob: 5",
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
  assertIncludes(liveLocationSetupSources, fragment, `live-location disabled fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /api\.telegram\.org|sendLocation|sendMessage|TELEGRAM_BOT_TOKEN/i,
  /gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(
    liveLocationSetupSources,
    forbiddenPattern,
    "current live-location setup-only surfaces",
  );
}

for (const fragment of [
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED",
  "PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER",
  "google_maps_geocoding",
]) {
  assertIncludes(mapLocationSearch, fragment, `map location search fragment ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED",
  "PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER",
  "google_maps_routes",
]) {
  assertIncludes(mapRouteEstimate, fragment, `map route estimate fragment ${fragment}`);
}

for (const retiredFragment of [
  "onemap_search",
  "onemap_routing",
  "PRESTIGE_ONEMAP_ACCESS_TOKEN",
  "ONEMAP_ACCESS_TOKEN",
  "PRESTIGE_ONEMAP_SEARCH_ENDPOINT",
  "PRESTIGE_ONEMAP_ROUTING_ENDPOINT",
  "onemap.gov",
]) {
  assertExcludes(
    `${mapLocationSearch}\n${mapRouteEstimate}`,
    retiredFragment,
    `retired OneMap map helper fragment ${retiredFragment}`,
  );
}

console.log("Driver Location Source + POB Status evidence contract guard passed");
