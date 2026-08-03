import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const routePath = "app/api/admin-booking-read-contract-disabled-setup/route.ts";
const helperPath = "lib/admin-booking-read-contract-disabled-setup.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const setupApiName = "admin-booking-read-contract-disabled-setup";
const setupApiPath = "/api/admin-booking-read-contract-disabled-setup";
const helperExportName = "buildAdminBookingReadContractDisabledSetup";

const routeLivePattern =
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const helperLivePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

const forbiddenFieldFragments = [
  "pricing",
  "payout",
  "customer_rates",
  "driver_payout_rules",
  "rate_override",
  "payment",
  "pdf",
  "billing",
  "provider",
  "send",
  "auth",
  "live_location",
  "photo",
  "calendar",
  "internal",
  "admin_notes",
  "debug",
  "secret",
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

function sectionBetween(source, start, end) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `Missing section start: ${start}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  assert.notEqual(endIndex, -1, `Missing section end after ${start}: ${end}`);

  return source.slice(startIndex, endIndex);
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

assertIncludes(routeSource, "export async function GET", "Admin booking read setup route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Admin booking read setup route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Admin booking read setup route");
assertIncludes(routeSource, helperExportName, "Admin booking read setup route");
assertIncludes(routeSource, "readEnabled: false", "Admin booking read setup route");
assertIncludes(routeSource, "liveReadEnabled: false", "Admin booking read setup route");
assertIncludes(routeSource, "dbReadEnabled: false", "Admin booking read setup route");
assertIncludes(routeSource, "writeEnabled: false", "Admin booking read setup route");
assertIncludes(routeSource, "no_live_read: true", "Admin booking read setup route");
assertIncludes(routeSource, "no_op: true", "Admin booking read setup route");
assertExcludes(routeSource, routeLivePattern, "Admin booking read setup route");

assertIncludes(helperSource, "server-only", "Admin booking read setup helper");
assertIncludes(helperSource, helperExportName, "Admin booking read setup helper");
assertIncludes(helperSource, "readEnabled: false", "Admin booking read setup helper");
assertIncludes(helperSource, "liveReadEnabled: false", "Admin booking read setup helper");
assertIncludes(helperSource, "dbReadEnabled: false", "Admin booking read setup helper");
assertIncludes(helperSource, "writeEnabled: false", "Admin booking read setup helper");
assertIncludes(helperSource, "liveWriteEnabled: false", "Admin booking read setup helper");
assertIncludes(helperSource, "external_send: false", "Admin booking read setup helper");
assertIncludes(helperSource, "no_live_read: true", "Admin booking read setup helper");
assertIncludes(helperSource, "no_op: true", "Admin booking read setup helper");
assertIncludes(helperSource, '"setup_only_disabled"', "Admin booking read setup helper");
assertIncludes(helperSource, '"unsafe_or_unknown_fields"', "Admin booking read setup helper");
assertExcludes(helperSource, helperLivePattern, "Admin booking read setup helper");

for (const forbiddenFieldFragment of forbiddenFieldFragments) {
  assertIncludes(
    helperSource,
    `"${forbiddenFieldFragment}"`,
    `Forbidden admin booking read field fragment ${forbiddenFieldFragment}`,
  );
}

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, setupApiName, label);
  assertExcludes(source, setupApiPath, label);
  assertExcludes(source, helperExportName, label);
}

const saveBookingBlock = sectionBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, setupApiName, "Save Booking + CRM path");
assertExcludes(saveBookingBlock, helperExportName, "Save Booking + CRM path");

const loadBookingsBlock = sectionBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read path",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read path");
assertExcludes(loadBookingsBlock, setupApiName, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, helperExportName, "Load Bookings runtime wiring");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings read route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings read route");

for (const entry of [
  "scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs",
  "scripts/test-admin-booking-read-no-live-guard.mjs",
]) {
  assertIncludes(preactivationSuite, entry, `Preactivation suite entry ${entry}`);
}

console.log("admin booking read no-live guard passed");
