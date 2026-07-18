import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const helperExportName = "buildAdminLoadBookingsSafeDtoContract";
const helperPathFragment = "admin-load-bookings-safe-dto-contract";
const contractGuardScript = "scripts/test-load-bookings-safe-dto-contract.mjs";
const noLiveGuardScript = "scripts/test-load-bookings-safe-dto-no-live-guard.mjs";

const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

const forbiddenFieldFragments = [
  "pricing",
  "payout",
  "customer_rate",
  "customer_price_amount",
  "customer_rate_override",
  "customer_price_override_reason",
  "customer_rates",
  "driver_payout_rules",
  "driver_payout_min",
  "driver_payout_max",
  "driver_payout_amount",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_notes",
  "driver_dispatch_include_payout",
  "midnight_surcharge",
  "midnight_payout",
  "extra_stop_surcharge",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "pricing_source",
  "rate_override",
  "payment",
  "pdf",
  "billing",
  "provider_send",
  "auth_session",
  "live_location",
  "photo",
  "calendar_event_id",
  "internal_admin_notes",
  "debug_payload",
  "secret_token",
];

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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [helperSource, appPage, aiParseRoute, adminBookingsRoute, adminSavedBookingsRoute, preactivationSuite] =
  await Promise.all([
    readFile(helperPath, "utf8"),
    readFile(appPagePath, "utf8"),
    readFile(aiParseRoutePath, "utf8"),
    readFile(adminBookingsRoutePath, "utf8"),
    readFile(adminSavedBookingsRoutePath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

assertIncludes(helperSource, "server-only", "Load Bookings safe DTO helper");
assertIncludes(helperSource, helperExportName, "Load Bookings safe DTO helper");
assertIncludes(
  helperSource,
  'delivery_surface: "load_bookings_safe_dto_contract_setup_only"',
  "Load Bookings safe DTO helper setup surface",
);
assertIncludes(helperSource, "readEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "liveReadEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "dbReadEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "writeEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "liveWriteEnabled: false", "Load Bookings safe DTO helper");
assertIncludes(
  helperSource,
  "loadBookingsRuntimeWiringEnabled: false",
  "Load Bookings safe DTO helper",
);
assertIncludes(
  helperSource,
  "savedBookingsEndpointChanged: false",
  "Load Bookings safe DTO helper",
);
assertIncludes(helperSource, "no_live_read: true", "Load Bookings safe DTO helper");
assertIncludes(helperSource, "no_op: true", "Load Bookings safe DTO helper");
assertIncludes(helperSource, '"setup_only_disabled"', "Load Bookings safe DTO helper");
assertIncludes(helperSource, '"unsafe_or_unknown_fields"', "Load Bookings safe DTO helper");
assertExcludes(helperSource, helperLivePattern, "Load Bookings safe DTO helper");

for (const forbiddenFieldFragment of forbiddenFieldFragments) {
  assertIncludes(
    helperSource,
    `"${forbiddenFieldFragment}"`,
    `Forbidden Load Bookings safe DTO field fragment ${forbiddenFieldFragment}`,
  );
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, helperExportName, "Save Booking + CRM path");
assertExcludes(saveBookingBlock, helperPathFragment, "Save Booking + CRM path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read path",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read path");
assertExcludes(loadBookingsBlock, helperExportName, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, helperPathFragment, "Load Bookings runtime wiring");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, helperExportName, label);
  assertExcludes(source, helperPathFragment, label);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings read route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings read route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings read route");

for (const entry of [contractGuardScript, noLiveGuardScript]) {
  assertIncludes(preactivationSuite, entry, `Preactivation suite entry ${entry}`);
}

console.log("Load Bookings safe DTO no-live guard passed");
