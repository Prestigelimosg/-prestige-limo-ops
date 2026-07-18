import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = "app/api/admin-load-bookings-typed-read-disabled-setup/route.ts";
const helperPath = "lib/admin-load-bookings-typed-read-adapter-foundation.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const routePathFragment = "/api/admin-load-bookings-typed-read-disabled-setup";
const helperFragment = "admin-load-bookings-typed-read-adapter-foundation";
const guardScript = "scripts/test-load-bookings-typed-read-disabled-setup-api-contract.mjs";
const livePathPattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|\.select\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeFieldPattern =
  /customer_rate|customer_price|customer_rates|driver_payout|driver_payout_rules|driver_notes|driver_dispatch_include_payout|pricing|payout|payment|billing|invoice|pdf|provider_send|auth_session|live_location|location_photo_calendar|photo|calendar_event|internal_admin|admin_notes|debug_payload|secret_token|service_role/i;

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

const [
  routeSource,
  helperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\"", "Typed Load Bookings disabled setup route");
assertIncludes(routeSource, "export async function GET", "Typed Load Bookings disabled setup route");
assertExcludes(routeSource, "export async function POST", "Typed Load Bookings disabled setup route POST");
assertExcludes(routeSource, "export async function PUT", "Typed Load Bookings disabled setup route PUT");
assertExcludes(routeSource, "export async function PATCH", "Typed Load Bookings disabled setup route PATCH");
assertExcludes(routeSource, "export async function DELETE", "Typed Load Bookings disabled setup route DELETE");
assertIncludes(
  routeSource,
  "buildAdminLoadBookingsTypedReadAdapterFoundation",
  "Typed Load Bookings disabled setup route foundation usage",
);
assertIncludes(
  routeSource,
  "fallbackAdminLoadBookingsTypedReadAdapterFoundation",
  "Typed Load Bookings disabled setup route fallback",
);
assertIncludes(routeSource, "adminLoadBookingsTypedReadAdapterFoundationVersion", "Typed Load Bookings disabled setup route version");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Typed Load Bookings disabled setup route boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Typed Load Bookings disabled setup route purpose");

for (const disabledFragment of [
  "readEnabled: false",
  "read_enabled: false",
  "dbReadEnabled: false",
  "db_read_enabled: false",
  "databaseClientEnabled: false",
  "database_client_enabled: false",
  "legacyClientEnabled: false",
  "legacy_client_enabled: false",
  "liveReadEnabled: false",
  "live_read_enabled: false",
  "writeEnabled: false",
  "write_enabled: false",
  "loadBookingsEndpointChanged: false",
  "load_bookings_endpoint_changed: false",
  "loadBookingsRuntimeWiringEnabled: false",
  "load_bookings_runtime_wiring_enabled: false",
  "savedBookingsEndpointChanged: false",
  "saved_bookings_endpoint_changed: false",
  "saveBookingChanged: false",
  "save_booking_changed: false",
  "parserChanged: false",
  "parser_changed: false",
  "no_live_read: true",
  "no_op: true",
]) {
  assertIncludes(routeSource, disabledFragment, `Typed Load Bookings disabled setup route disabled field ${disabledFragment}`);
}

assertExcludes(routeSource, livePathPattern, "Typed Load Bookings disabled setup route live DB/read path");
assertExcludes(routeSource, unsafeFieldPattern, "Typed Load Bookings disabled setup route unsafe field literal");
assertExcludes(helperSource, livePathPattern, "Typed Load Bookings adapter foundation live DB/read path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Current Load Bookings endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertExcludes(loadBookingsBlock, routePathFragment, "Load Bookings app route wiring");
assertExcludes(loadBookingsBlock, helperFragment, "Load Bookings app helper wiring");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, routePathFragment, `${label} typed Load Bookings disabled setup route wiring`);
  assertExcludes(source, helperFragment, `${label} typed Load Bookings adapter foundation wiring`);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings detail remains");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite disabled typed Load Bookings read endpoint guard");

console.log("Load Bookings typed read disabled setup API contract passed");
