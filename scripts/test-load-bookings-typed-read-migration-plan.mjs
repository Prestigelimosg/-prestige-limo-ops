import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const readContractRoutePath = "app/api/admin-booking-read-contract-disabled-setup/route.ts";
const readContractHelperPath = "lib/admin-booking-read-contract-disabled-setup.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const setupApiName = "admin-booking-read-contract-disabled-setup";
const setupApiPath = "/api/admin-booking-read-contract-disabled-setup";
const helperExportName = "buildAdminBookingReadContractDisabledSetup";

const forbiddenFields = [
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

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);

  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [
  ledger,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  readContractRoute,
  readContractHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(readContractRoutePath, "utf8"),
  readFile(readContractHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const planSection = sectionBetween(ledger, "### Load Bookings Typed Read Migration Plan Lock");

for (const phrase of [
  "Future typed Load Bookings read/list/detail migration is planned only; no runtime implementation is approved by this lock.",
  "Current Load Bookings runtime wiring remains unchanged and stays on the existing legacy read surface.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Save Booking + CRM is unchanged and remains on `POST /api/admin-bookings`.",
  "Existing disabled admin booking read/list/detail contract remains setup-only/no-live-read/no-op at `GET /api/admin-booking-read-contract-disabled-setup`.",
  "Future typed Load Bookings migration must be read/list/detail only.",
  "Future implementation must not change Save Booking + CRM.",
  "Future implementation must not activate DB read/write without separate explicit approval.",
  "Required tests before any runtime wiring: typed read contract test, no-live read guard, Load Bookings route-flow guard, forbidden-field exclusion guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, and no-new-shim guard.",
  "Rollback note: keep Load Bookings on the existing legacy read surface until a typed read path is separately approved and verified.",
  "No UI/API/helper behavior change",
]) {
  assertIncludes(planSection, phrase, `Load Bookings typed read migration plan phrase: ${phrase}`);
}

for (const forbiddenField of [
  "pricing",
  "payout",
  "`customer_rates`",
  "`driver_payout_rules`",
  "rate overrides",
  "payment",
  "PDF",
  "billing",
  "provider/send",
  "auth",
  "location",
  "photo",
  "calendar",
  "internal/admin notes",
  "debug",
  "secrets",
]) {
  assertIncludes(
    planSection,
    forbiddenField,
    `Load Bookings typed read migration forbidden field ${forbiddenField}`,
  );
}

for (const forbiddenApprovalPhrase of [
  "runtime wiring is approved",
  "runtime implementation is approved for this task",
  "safe to wire now",
  "DB read/write is approved",
  "replace Load Bookings now",
]) {
  assertExcludes(
    planSection,
    forbiddenApprovalPhrase,
    `Load Bookings typed read migration plan approval phrase ${forbiddenApprovalPhrase}`,
  );
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, setupApiName, "Save Booking + CRM path");
assertExcludes(saveBookingBlock, helperExportName, "Save Booking + CRM path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read path",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read method");
assertExcludes(loadBookingsBlock, setupApiName, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, setupApiPath, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, helperExportName, "Load Bookings runtime wiring");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, setupApiName, "Admin saved bookings route separation");
assertExcludes(adminSavedBookingsRoute, helperExportName, "Admin saved bookings route separation");

assertIncludes(readContractRoute, "export async function GET", "Disabled read contract route");
assertIncludes(readContractRoute, helperExportName, "Disabled read contract route");
assertIncludes(readContractRoute, "readEnabled: false", "Disabled read contract route");
assertIncludes(readContractRoute, "liveReadEnabled: false", "Disabled read contract route");
assertIncludes(readContractRoute, "dbReadEnabled: false", "Disabled read contract route");
assertIncludes(readContractRoute, "no_live_read: true", "Disabled read contract route");
assertExcludes(
  readContractRoute,
  /export async function (POST|PUT|PATCH|DELETE)|@supabase\/supabase-js|createClient|supabase|\.from\(|adminLegacyDataClient/,
  "Disabled read contract route",
);

assertIncludes(readContractHelper, "server-only", "Disabled read contract helper");
assertIncludes(readContractHelper, helperExportName, "Disabled read contract helper");
assertIncludes(readContractHelper, "readEnabled: false", "Disabled read contract helper");
assertIncludes(readContractHelper, "liveReadEnabled: false", "Disabled read contract helper");
assertIncludes(readContractHelper, "dbReadEnabled: false", "Disabled read contract helper");
assertIncludes(readContractHelper, "writeEnabled: false", "Disabled read contract helper");
assertIncludes(readContractHelper, "no_live_read: true", "Disabled read contract helper");
assertExcludes(
  readContractHelper,
  /@supabase\/supabase-js|createClient|supabase|\.from\(|adminLegacyDataClient|process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|SECRET_KEY|API_KEY|ACCESS_TOKEN/,
  "Disabled read contract helper",
);

for (const forbiddenField of forbiddenFields) {
  assertIncludes(
    readContractHelper,
    `"${forbiddenField}"`,
    `Disabled read contract forbidden field ${forbiddenField}`,
  );
}

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, setupApiName, label);
  assertExcludes(source, helperExportName, label);
}

for (const entry of [
  "scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs",
  "scripts/test-admin-booking-read-no-live-guard.mjs",
  "scripts/test-load-bookings-typed-read-migration-plan.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, entry, `Preactivation suite entry ${entry}`);
}

console.log("Load Bookings typed read migration plan guard passed");
