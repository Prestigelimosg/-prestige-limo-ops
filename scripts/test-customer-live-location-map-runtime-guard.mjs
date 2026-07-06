import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const routePath = "app/api/customer-live-location-map/route.ts";
const scaffoldHelperPath = "lib/customer-live-location-map-scaffold.ts";
const runtimeHelperPath = "lib/customer-live-location-map-runtime.ts";
const runnerPath = "scripts/run-customer-live-location-link-map-staging-evidence.mjs";
const guardScript = "scripts/test-customer-live-location-map-runtime-guard.mjs";

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

const [ledger, preactivationSuite, route, scaffoldHelper, runtimeHelper, runner] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(routePath, "utf8"),
    readFile(scaffoldHelperPath, "utf8"),
    readFile(runtimeHelperPath, "utf8"),
    readFile(runnerPath, "utf8"),
  ]);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Live Location Map Runtime Guard Lock",
);
const runtimeHelperWithoutDenylist = runtimeHelper.replace(
  /const forbiddenSafeTextPattern =[\s\S]*?;\n\nlet customerLiveLocationMapClientForTests/,
  "let customerLiveLocationMapClientForTests",
);
const runnerWithoutDenylist = runner.replace(
  /const forbiddenSafeTextPattern =[\s\S]*?;\n\nconst requiredRuntimeWindowEnvNames/,
  "const requiredRuntimeWindowEnvNames",
).replace(
  /function assertNoForbiddenRuntimeFields[\s\S]*?\n}\n\nfunction assertSafeClosedBody/,
  "function assertSafeClosedBody",
);

for (const phrase of [
  "This adds a disabled-by-default Customer Live Location map runtime implementation behind `GET /api/customer-live-location-map`.",
  "The runtime helper is `lib/customer-live-location-map-runtime.ts` and is loaded only when either the bounded customer-map evidence gate is open or the stable app-side Driver Live Location runtime mode is configured.",
  "Default state remains closed/no-op; no env was changed, no database read/write occurred, no GPS capture was activated, no provider send occurred, no customer live map was exposed, and no evidence was run in this lane.",
  "Evidence-mode reads require same-origin customer headers, `x-prestige-customer-purpose: customer-live-location-map-read`, a customer session token, `x-prestige-customer-account-reference`, an allowlisted customer account, and an allowlisted booking reference.",
  "App-side customer runtime reads accept the same signed customer portal access token/cookie used by `/my-bookings`, then fall back to the legacy saved-bookings session-token lane if configured. They require customer session/account resolution, booking ownership proof through `bookings`, and an eligible service family before reading any latest-position row; customer reads do not require the admin active-jobs map, capture flag, or admin runtime booking allowlist to be open.",
  "The runtime reads only `driver_live_location_latest_positions` through the server-side Supabase service role after same-origin boundary, runtime gate, customer account scope, booking ownership, service eligibility, and booking reference scope pass.",
  "Customer-visible runtime fields are limited to `active_driver_marker` map coordinates, accuracy, heading, speed, sharing state, stale/offline status, captured/updated/stale timestamps, scoped booking label, marker count, and safe runtime flags.",
  "Customer-visible runtime output must not expose driver job link ids, raw driver job tokens, token hashes, raw booking IDs, pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, billing/payment/PDF/invoice, internal/admin notes, parser/debug fields, secrets/tokens/cookies/JWTs, raw provider payloads, customer contact details, Save Booking internals, `/api/admin-saved-bookings` internals, OTS/photo/storage, calendar data, or mock QA/dev archive.",
  "The evidence runner remains staging-only. Its `runtime-window` path requires explicit approval and `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_REFERENCE`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_ACCOUNT_REFERENCE`, `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_BOOKING_REFERENCE`, and `PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_CUSTOMER_SESSION_TOKEN` names only.",
  "Future runtime evidence must use fake/staging-safe data only, write exactly one fake `driver_job_links` row and one fake `driver_live_location_latest_positions` row, prove a single customer map marker read, prove wrong-customer/anonymous/cross-origin blocked access, clean up fake rows, prove zero matching rows remain, and prove rollback disabled.",
  "The runtime does not call Google Maps, OneMap, FlightAware, Telegram, WhatsApp, SMS, Email, Resend, or any provider API; browser map rendering and real GPS remain separate lanes.",
  "The app-side runtime path is covered by `scripts/test-customer-live-location-app-side-runtime-path.mjs` using mocked Supabase responses only.",
  "This guard adds `scripts/test-customer-live-location-map-runtime-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger runtime phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation runtime guard registration");
assertIncludes(
  preactivationSuite,
  "scripts/test-customer-live-location-app-side-runtime-path.mjs",
  "preactivation app-side runtime path test registration",
);

for (const fragment of [
  "isCustomerLiveLocationMapRuntimeCandidateOpen()",
  "await import(",
  "../../../lib/customer-live-location-map-runtime",
  "handleCustomerLiveLocationMapRuntimeRequest",
  "Response.json(result.body, { status: result.status })",
]) {
  assertIncludes(route, fragment, `route runtime fragment ${fragment}`);
}

for (const fragment of [
  "customer-live-location-map-runtime:v1",
  "driver_live_location_latest_positions",
  "driver_live_location_runtime_settings",
  "customer_access_accounts",
  "bookings",
  "isCustomerPortalAccessToken",
  "readAppSideRuntimePolicy",
  "resolveCustomerPortalAccessSession",
  "verifyCustomerBookingScope",
  "resolveExactTwoCustomerRuntimeSessionMap",
  "readCustomerLiveLocationMapSessionToken",
  "PRESTIGE_DRIVER_LIVE_LOCATION_MODE",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_ALLOWED_BOOKING_REFERENCES",
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_MAP_STALE_AFTER_SECONDS",
  "x-prestige-customer-account-reference",
  "customer_live_location_map_scope_blocked",
  "customer_live_location_map_customer_auth_blocked",
  "customer_live_location_map_service_blocked",
  "customer_live_location_map_runtime_config_not_ready",
  "customerVisible: true",
  "liveMapEnabled: true",
  "external_send: false",
  "gpsCaptureEnabled: false",
  "locationStorageEnabled: false",
  "map_rendered: false",
  "active_driver_marker",
  "booking_reference_label: \"scoped\"",
  "marker_count: 1",
  ".from(latestPositionsTable)",
  ".from(runtimeSettingsTable)",
  ".from(customerAccessAccountsTable)",
  ".from(bookingsTable)",
  ".eq(\"booking_reference\", bookingReference)",
  ".in(\"sharing_state\", [\"active\", \"stale\"])",
]) {
  assertIncludes(runtimeHelper, fragment, `runtime helper fragment ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_CUSTOMER_LIVE_LOCATION_LINK_MAP_STAGING_EVIDENCE_REFERENCE",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "driver_job_links",
  "driver_live_location_latest_positions",
  "insertEvidenceDriverLink",
  "insertFakeLatestPosition",
  "fake_driver_job_link_rows_written: 1",
  "fake_latest_position_rows_written: 1",
  "wrong_customer_status",
  "anonymous_status",
  "cross_origin_status",
  "cleanup_zero_rows: true",
  "customer_live_location_link_map_runtime_read_failed",
]) {
  assertIncludes(runner, fragment, `runtime runner fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /google\.maps|maps\.google|maps\.googleapis\.com|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /new\s+Resend|sendMail|sendSms|sendMessage|api\.telegram\.org|twilio|whatsapp/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout|pdf/i,
]) {
  assertExcludes(scaffoldHelper, forbiddenPattern, "customer live-location scaffold helper");
  assertExcludes(route, forbiddenPattern, "customer live-location map route");
  assertExcludes(
    runtimeHelperWithoutDenylist,
    forbiddenPattern,
    "customer live-location runtime helper",
  );
  assertExcludes(runnerWithoutDenylist, forbiddenPattern, "customer live-location evidence runner");
}

for (const forbiddenPattern of [
  /driver_job_link_id\s*[:,]/,
]) {
  assertExcludes(runtimeHelper, forbiddenPattern, "customer visible runtime payload");
}

for (const forbiddenPhrase of [
  "all customers",
  "all-customer",
  "provider sends are approved",
  "billing is approved",
  "real GPS is active",
  "customer live map is broadly live",
]) {
  assertExcludes(ledgerSection, forbiddenPhrase, "forbidden customer map runtime claim");
}

console.log("Customer live-location map runtime guard passed");
