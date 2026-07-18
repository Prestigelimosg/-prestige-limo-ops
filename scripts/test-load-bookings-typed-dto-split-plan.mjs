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
const dtoPlanGuardScript = "scripts/test-load-bookings-typed-dto-split-plan.mjs";

const safeDtoFragments = [
  "booking id/reference/status",
  "booking type",
  "vehicle/service display",
  "pickup/dropoff datetime/address",
  "route summary/route points summary",
  "pax/job card display",
  "customer/company/booker/traveler display fields",
  "booker email/phone",
  "assigned driver display only if non-payout",
  "child seat/extra stop display only if non-price",
  "created_at/updated_at",
  "audit summary",
];

const forbiddenDtoFragments = [
  "pricing",
  "payout",
  "`customer_rate`",
  "`customer_price_amount`",
  "`customer_rate_override`",
  "`customer_price_override_reason`",
  "`customer_rates`",
  "`driver_payout_rules`",
  "`driver_payout_min/max/amount/override/reason/unit`",
  "`driver_notes`",
  "`driver_dispatch_include_payout`",
  "midnight_surcharge/payout",
  "extra_stop_surcharge/payout",
  "child_seat_customer_surcharge/driver_payout",
  "`pricing_source`",
  "rate overrides",
  "payment",
  "PDF",
  "billing",
  "provider/send",
  "auth",
  "location/photo/calendar",
  "internal/admin notes",
  "debug",
  "secrets",
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

const dtoPlanSection = sectionBetween(ledger, "### Load Bookings Typed DTO Split Plan Lock");

for (const phrase of [
  "Future typed Load Bookings DTO split is planned only; no runtime implementation is approved by this lock.",
  "Current Load Bookings runtime remains on `GET /api/admin-saved-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "Existing disabled admin booking read/list/detail contract remains setup-only/no-live-read/no-op.",
  "Future typed Load Bookings DTO must include safe operational read fields only:",
  "Future typed DTO must exclude",
  "Future wiring must not be a blind endpoint swap.",
  "Future wiring needs an adapter/DTO layer or safe cards that do not require finance/payout fields.",
  "Existing legacy finance/payout-aware card behavior must remain parked until separate finance approval.",
  "Required future tests before runtime wiring: typed DTO contract test, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, and focused UI mapping test proving typed Load Bookings no longer depends on risky fields.",
  "Rollback note: keep Load Bookings on `/api/admin-saved-bookings` until typed DTO runtime wiring is separately approved and verified.",
  "No UI/API/helper behavior change",
]) {
  assertIncludes(dtoPlanSection, phrase, `Load Bookings typed DTO split plan phrase: ${phrase}`);
}

for (const safeFragment of safeDtoFragments) {
  assertIncludes(dtoPlanSection, safeFragment, `Load Bookings typed DTO safe fragment ${safeFragment}`);
}

for (const forbiddenFragment of forbiddenDtoFragments) {
  assertIncludes(
    dtoPlanSection,
    forbiddenFragment,
    `Load Bookings typed DTO forbidden fragment ${forbiddenFragment}`,
  );
}

for (const forbiddenApprovalPhrase of [
  "runtime wiring is approved",
  "runtime implementation is approved for this task",
  "safe to swap endpoint now",
  "blind endpoint swap is approved",
  "finance approval granted",
  "DB read/write is approved",
]) {
  assertExcludes(
    dtoPlanSection,
    forbiddenApprovalPhrase,
    `Load Bookings typed DTO split plan approval phrase ${forbiddenApprovalPhrase}`,
  );
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, setupApiName, "Save Booking + CRM path");
assertExcludes(saveBookingBlock, setupApiPath, "Save Booking + CRM path");
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

const bookingRecordType = sliceBetween(appPage, "type BookingRecord = {", "type BookingStatusValue");
for (const legacyFinanceField of [
  "customer_rate",
  "customer_price_amount",
  "driver_payout_min",
  "driver_payout_amount",
  "driver_notes",
  "driver_dispatch_include_payout",
  "pricing_source",
]) {
  assertIncludes(
    bookingRecordType,
    legacyFinanceField,
    `Current legacy finance/payout-aware BookingRecord field ${legacyFinanceField}`,
  );
}

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
assertIncludes(readContractHelper, "no_live_read: true", "Disabled read contract helper");
assertExcludes(
  readContractHelper,
  /@supabase\/supabase-js|createClient|supabase|\.from\(|adminLegacyDataClient|process\.env|SUPABASE_[A-Z_]*|SERVICE_ROLE_KEY|SECRET_KEY|API_KEY|ACCESS_TOKEN/,
  "Disabled read contract helper",
);

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, setupApiName, label);
  assertExcludes(source, helperExportName, label);
}

for (const entry of [
  "scripts/test-load-bookings-runtime-wiring-approval-packet.mjs",
  "scripts/test-load-bookings-typed-read-migration-plan.mjs",
  "scripts/test-admin-booking-read-contract-disabled-setup-api-contract.mjs",
  "scripts/test-admin-booking-read-no-live-guard.mjs",
  dtoPlanGuardScript,
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, entry, `Preactivation suite entry ${entry}`);
}

console.log("Load Bookings typed DTO split plan guard passed");
