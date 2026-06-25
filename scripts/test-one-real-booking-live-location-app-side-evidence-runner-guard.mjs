import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const runnerPath = "scripts/run-one-real-booking-live-location-app-side-evidence.mjs";
const guardPath =
  "scripts/test-one-real-booking-live-location-app-side-evidence-runner-guard.mjs";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  const matches = pattern instanceof RegExp ? pattern.test(source) : source.includes(pattern);

  assert.equal(matches, false, `${label} must not include ${pattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const [ledger, suite, runner] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(suitePath, "utf8"),
  readFile(runnerPath, "utf8"),
]);
const ledgerSection = sectionBetween(
  ledger,
  "### One Real Booking Live Location App-Side Evidence Runner Lock",
);
const runnerWithoutDenylist = runner.replace(
  /const forbiddenSerializedPattern =[\s\S]*?;\n\nclass EvidenceFailure/,
  "class EvidenceFailure",
);

for (const phrase of [
  "This adds `scripts/run-one-real-booking-live-location-app-side-evidence.mjs` for the approved bounded one-real-booking Driver Live Location + Customer Live Location evidence pass.",
  "The runner uses app-side/admin runtime gates only through the existing `driver_live_location_runtime_settings` row and does not use Vercel CLI, Vercel env changes, dashboard automation, or redeploys.",
  "The runner requires `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_EVIDENCE_APPROVED=one-real-booking-live-location-evidence-approved` before any DB write can occur.",
  "The runner requires an existing raw driver job link token through `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_DRIVER_JOB_LINK_TOKEN` and an owner-approved matching booking reference through `PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_BOOKING_REFERENCE`; it does not create a temporary `driver_job_links` row.",
  "The runner resolves the token by hash against the existing `driver_job_links` row, validates the booking reference match, validates the link is active/not expired, validates the booking belongs to an active `customer_access_accounts` mapping, and validates customer live-location service eligibility.",
  "Eligible customer live-location service families remain DEP/DEPARTURE, TRF/TRANSFER, DSP, and HOURLY; MNG/Arrival remains blocked.",
  "The runner refuses to proceed if `driver_live_location_runtime_settings` is already active or if an existing latest-position row is present for the real driver job link, to avoid disturbing live operations.",
  "Runtime-window DB writes are limited to the app-side runtime setting row, one latest-position row written through the driver Share Location runtime helper, audit rows written by the driver/admin helpers, and cleanup/rollback.",
  "The runner proves closed pre-window behavior, driver Share Location, admin active-jobs read, customer live map read, wrong customer/cross-origin/wrong driver blocks, Stop Sharing, cleanup zero rows, restored runtime setting, and closed post-rollback behavior.",
  "The runner output is normalized and must not print Supabase URLs, service-role keys, admin tokens, raw driver tokens, token hashes, booking references, row IDs, customer names, customer contact data, private coordinates, cookies, JWTs, API keys, env values, or secrets.",
  "No provider send, Email, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, browser geolocation, real GPS activation, customer-wide live map, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, OTS/photo/storage, calendar, shim, or production activation is introduced.",
  "If the existing raw driver job token or matching approved booking reference is unavailable, the runner must stop BLOCKED with names-only missing input instead of guessing, creating a fake driver link, or widening scope.",
  "This guard adds `scripts/test-one-real-booking-live-location-app-side-evidence-runner-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger one-real live-location phrase ${phrase}`);
}

assertIncludes(suite, guardPath, "preactivation one-real live-location guard registration");

for (const fragment of [
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_EVIDENCE_APPROVED",
  "one-real-booking-live-location-evidence-approved",
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_DRIVER_JOB_LINK_TOKEN",
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_BOOKING_REFERENCE",
  "PRESTIGE_ONE_REAL_BOOKING_LIVE_LOCATION_EVIDENCE_REFERENCE",
  "/private/tmp/prestige-one-real-booking-live-location-evidence.env",
  "driver_live_location_runtime_settings",
  "driver_live_location_runtime",
  "driver_job_links",
  "driver_live_location_latest_positions",
  "driver_live_location_audit_events",
  "customer_access_accounts",
  "bookings",
  "resolveExistingDriverLink",
  ".eq(\"token_hash\", tokenHash(rawToken))",
  "driver_live_location_allowed_job_references: [bookingReference]",
  "driver_live_location_capture_enabled: true",
  "admin_active_jobs_map_enabled: true",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE: \"runtime\"",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED: \"true\"",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE: \"server-session-token\"",
  "handleDriverLiveLocationRuntimeRequest",
  "handleAdminActiveJobsMapRuntimeRequest",
  "handleCustomerLiveLocationMapRuntimeRequest",
  "cleanupEvidenceRows",
  "restoreRuntimeSetting",
  "restoreLatestPosition",
  "one_real_booking_live_location_runtime_setting_already_active",
  "one_real_booking_live_location_existing_latest_position_present",
  "vercel_cli_used: false",
  "vercel_env_changed: false",
  "no_provider_sends: true",
  "no_real_gps: true",
]) {
  assertIncludes(runner, fragment, `runner one-real live-location fragment ${fragment}`);
}

for (const forbidden of [
  "insertEvidenceDriverLink",
  ".insert({",
  "npx vercel",
  "vercel env",
  "VERCEL_",
  "navigator.geolocation",
  "getCurrentPosition",
  "watchPosition",
  "google.maps",
  "maps.googleapis.com",
  "OneMap",
  "FlightAware",
  "new Resend",
  "sendMail",
  "twilio",
  "whatsapp",
]) {
  assertExcludes(runnerWithoutDenylist, forbidden, "one-real live-location runner");
}

for (const forbiddenPattern of [
  /console\.log\s*\([^)]*process\.env/i,
  /console\.log\s*\([^)]*(?:SUPABASE|SERVICE_ROLE|SESSION_TOKEN|DRIVER_JOB_LINK_TOKEN|BOOKING_REFERENCE|TOKEN_HASH|COOKIE|JWT)/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
]) {
  assertExcludes(runnerWithoutDenylist, forbiddenPattern, "one-real live-location runner");
}

console.log("One-real-booking live-location app-side evidence runner guard passed");
