import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-customer-live-location-link-readiness-contract-guard.mjs";
const appPagePath = "app/page.tsx";
const bookingUiBrowserTestPath = "scripts/test-booking-ui-browser.mjs";
const setupFoundationPath = "lib/admin-live-location-setup-foundation.ts";
const windowPolicyPath = "lib/live-location-window-policy-setup-foundation.ts";

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
  appPage,
  bookingUiBrowserTest,
  setupFoundation,
  windowPolicy,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(bookingUiBrowserTestPath, "utf8"),
  readFile(setupFoundationPath, "utf8"),
  readFile(windowPolicyPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Customer Live Location Link Readiness Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future customer-visible live-location link/readiness behavior.",
  "This lock does not activate customer live map links, GPS capture, live-location runtime, admin active-jobs map runtime, route/helper reads or writes, table writes, migration application, env changes, deploy, provider calls, provider sends, billing/payment/PDF/payout, or production activation.",
  "Current state remains closed: Customer Copy may show eligibility/help text only, must not generate or copy a live-location URL, customer visibility is false, and no customer map link is active.",
  "Customer app-link copying remains available independently of live-location readiness; helper text must distinguish the app link from tracking and must never imply that a fake or unavailable live-location URL will be copied.",
  "Future customer live-location links require separate owner approval after driver GPS capture, table/RLS/retention evidence, admin active-jobs map evidence, browser map key readiness, stale/offline proof, POB auto-stop proof, customer access proof, rollback proof, and no-forbidden-field proof.",
  "Future customer live-location links are approved for MNG/Arrival, DEP/Departure, TRF/Transfer, and DSP/Hourly only through the scoped customer Driver Tracking panel after OTW and driver location sharing.",
  "Future customer link window remains 30 minutes before pickup by default and must fail closed outside the window or when secure driver live-location setup is incomplete.",
  "Future customer map/link runtime must never expose raw driver job tokens, raw booking IDs, admin/internal notes, pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, or calendar data.",
  "Future customer map/link must show only customer-safe trip and location context needed for tracking and must hide admin-only active-jobs controls, other drivers/jobs, stale/offline implementation details, and evidence/debug fields.",
  "Future evidence must prove scoped MNG/Arrival, DEP/Departure, TRF/Transfer, and DSP/Hourly eligibility, no fake link inside eligibility window while setup is incomplete, blocked anonymous/wrong-customer access, customer-safe link scope, stale/offline handling, POB/completed stop behavior, cleanup zero rows, rollback disabled, and no provider sends.",
  "Future customer live-location link remains separate from Driver Details Email, Customer Copy manual send, Customer In-App, Driver In-App, Telegram True Live Location, Email/WhatsApp/SMS provider sends, Google Maps admin search/route estimates, OneMap, FlightAware, billing/payment/PDF/payout, parser, Save Booking, `/api/admin-saved-bookings`, auth expansion, OTS/photo/storage, calendar, and shim work.",
  "This guard adds `scripts/test-customer-live-location-link-readiness-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `customer live-location ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation customer live-location guard registration");

for (const fragment of [
  "data-customer-live-location-helper=\"true\"",
  "function customerLiveLocationState",
  "Customer app link can still be copied; live location is not available for this service type.",
  "Customer app link can still be copied after booking and driver details are ready; live location requires pickup date and time.",
  "Customer app link can be copied now; arrival live location appears only after manual arrival readiness and driver sharing.",
  "Customer app link can be copied now; live location appears only when ready around 30 minutes before pickup.",
  "Customer app link remains available for trip status; live location is only available within 30 minutes before pickup.",
  "Customer app link can still be copied; live location appears only after secure driver location setup is ready.",
  "copyLine: `Live location: ${secureLink}`",
]) {
  assertIncludes(appPage, fragment, `customer live-location app fragment ${fragment}`);
}

for (const fragment of [
  "const liveLocationNoLinkPattern = /live location|tracking|track your ride|https?:\\/\\/\\S+/i;",
  "for (const bookingType of [\"MNG\", \"DEP\", \"TRF\", \"DSP\"])",
  "Save + CRM or load the saved booking first.",
  "Expected ${bookingType} unsaved before-window helper to fail closed",
  "Expected ${bookingType} before-window Customer Copy not to include a live location link",
  "Expected ${bookingType} unsaved inside-window helper to fail closed",
  "Expected ${bookingType} inside-window Customer Copy not to copy a fake live location link",
]) {
  assertIncludes(bookingUiBrowserTest, fragment, `customer live-location browser guard ${fragment}`);
}

for (const fragment of [
  "future_customer_window_minutes_before_pickup: 30",
  "future_pob_auto_stop_minutes_after_pob: 5",
  "service_eligibility: \"allowed_later\" | \"disabled_for_customer\"",
  "live_location_status: \"disabled\"",
  "driver_capture_status: \"disabled\"",
  "customer_map_status: \"disabled\"",
  "admin_map_status: \"disabled\"",
  "serviceCode === \"MNG\"",
  "serviceCode === \"ARRIVAL\"",
  "serviceCode === \"DEP\"",
  "serviceCode === \"DEPARTURE\"",
  "serviceCode === \"TRF\"",
  "serviceCode === \"TRANSFER\"",
  "serviceCode === \"DSP\"",
  "serviceCode === \"HOURLY\"",
  "\"No customer map link is active.\"",
  "\"No database read or write is performed.\"",
]) {
  assertIncludes(setupFoundation, fragment, `setup foundation customer link fragment ${fragment}`);
}

for (const fragment of [
  "customer_live_map_link_planned: true",
  "customer_visible_window_minutes_before_pickup: 30",
  "customerVisible: false",
  "gpsCaptureEnabled: false",
  "liveAccessEnabled: false",
  "liveMapEnabled: false",
  "locationStorageEnabled: false",
  "customer_window_before_pickup_minutes: 30",
  "customer_live_map_link: \"planned_only\"",
  "status: \"setup_only\"",
]) {
  assertIncludes(windowPolicy, fragment, `window policy customer link fragment ${fragment}`);
}

for (const forbiddenPhrase of [
  "customer live map is active",
  "customer live-location link is active",
  "live-location URL is generated",
  "tracking link is live",
  "all customers can track drivers",
  "provider sends are approved",
  "billing is approved",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden customer live-location activation claim");
}

for (const forbiddenPattern of [
  /customerVisible\s*[:=]\s*true/i,
  /liveAccessEnabled\s*[:=]\s*true/i,
  /liveMapEnabled\s*[:=]\s*true/i,
  /locationStorageEnabled\s*[:=]\s*true/i,
  /gpsCaptureEnabled\s*[:=]\s*true/i,
]) {
  assertExcludes(windowPolicy, forbiddenPattern, "window policy live customer flags");
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
]) {
  assertExcludes(setupFoundation, forbiddenPattern, "setup foundation live/customer forbidden runtime");
  assertExcludes(windowPolicy, forbiddenPattern, "window policy live/customer forbidden runtime");
}

console.log("Customer live-location link readiness contract guard passed");
