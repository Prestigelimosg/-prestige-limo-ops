import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const adminBookingReadSetupRoutePath =
  "app/api/admin-booking-read-contract-disabled-setup/route.ts";
const adminBookingReadSetupHelperPath = "lib/admin-booking-read-contract-disabled-setup.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const safeUiAdapterHelperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const approvalGuardScript =
  "scripts/test-load-bookings-typed-endpoint-migration-approval-packet.mjs";
const safeDtoHelperExport = "buildAdminLoadBookingsSafeDtoContract";
const safeDtoHelperFragment = "admin-load-bookings-safe-dto-contract";
const safeUiAdapterHelperExport = "buildAdminLoadBookingsSafeUiAdapterCardContract";
const safeUiAdapterHelperFragment = "admin-load-bookings-safe-ui-adapter-card-contract";
const disabledReadSetupRoute = "/api/admin-booking-read-contract-disabled-setup";

const forbiddenFields = [
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
  adminBookingReadSetupRoute,
  adminBookingReadSetupHelper,
  safeDtoHelper,
  safeUiAdapterHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(adminBookingReadSetupRoutePath, "utf8"),
  readFile(adminBookingReadSetupHelperPath, "utf8"),
  readFile(safeDtoHelperPath, "utf8"),
  readFile(safeUiAdapterHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const approvalSection = sectionBetween(
  ledger,
  "### Typed Load Bookings Endpoint Migration Approval Packet",
);

for (const phrase of [
  "Approval status: pending future typed endpoint migration approval.",
  "This packet does not approve runtime implementation, DB read activation, env changes, deployment, migrations, or live reads.",
  "Load Bookings still uses `GET /api/admin-saved-bookings`.",
  "Operational display adapter is implemented and guarded.",
  "Typed endpoint migration remains parked.",
  "Existing typed read contract is setup-only/no-live-read at `GET /api/admin-booking-read-contract-disabled-setup`.",
  "Future typed endpoint requires separate DB read, env, table-policy, and rollback approval.",
  "Future migration must not touch Save Booking + CRM, `/api/admin-saved-bookings` behavior, parser, pricing, payout, payment/PDF, provider, auth, location/photo/calendar, UI sectors, or shims.",
  "Future migration must not feed typed operational data into `bookingCardPriceLine`, `bookingRecordToForm`, driver dispatch payout copy, driver assignment payout controls, billing readiness finance paths, or `BookingRecord` finance/payout/internal fields.",
  "Future typed endpoint must return safe operational display/list/detail fields only",
  "Required future tests before endpoint migration: typed endpoint contract test, safe DTO contract guard, safe UI adapter/card contract guard, operational runtime mapping guard, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, DB read/env/table-policy approval guard, and rollback/no-live checkpoint.",
  "Rollback note: keep Load Bookings on `GET /api/admin-saved-bookings` until the typed endpoint migration is separately approved, implemented, verified, and reversible.",
  "No runtime implementation",
]) {
  assertIncludes(approvalSection, phrase, `Typed endpoint approval packet phrase ${phrase}`);
}

for (const forbiddenField of forbiddenFields) {
  assertIncludes(
    approvalSection,
    forbiddenField,
    `Typed endpoint approval packet forbidden field ${forbiddenField}`,
  );
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation is approved",
  "typed endpoint migration is approved",
  "DB read activation is approved",
  "safe to wire now",
  "blind endpoint swap",
  "finance/payout approval granted",
]) {
  assertExcludes(
    approvalSection,
    forbiddenApprovalPhrase,
    `Typed endpoint approval packet forbidden approval ${forbiddenApprovalPhrase}`,
  );
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Current Load Bookings legacy endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertExcludes(loadBookingsBlock, disabledReadSetupRoute, "Typed endpoint migration route wiring");
assertExcludes(loadBookingsBlock, safeDtoHelperExport, "Safe DTO runtime wiring");
assertExcludes(loadBookingsBlock, safeDtoHelperFragment, "Safe DTO runtime wiring");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperExport, "Safe UI adapter runtime wiring");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperFragment, "Safe UI adapter runtime wiring");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertIncludes(appPage, "function buildLoadBookingsOperationalDisplayCard", "Operational display adapter");
assertIncludes(appPage, "loadBookingsOperationalDisplayFieldNames", "Operational display fields");
assertIncludes(appPage, "hasForbiddenLoadBookingsOperationalDisplayText", "Operational forbidden text guard");
assertExcludes(appPage, safeDtoHelperExport, "app/page.tsx safe DTO server helper runtime import");
assertExcludes(appPage, safeDtoHelperFragment, "app/page.tsx safe DTO helper runtime import");
assertExcludes(appPage, safeUiAdapterHelperExport, "app/page.tsx safe UI adapter server helper runtime import");
assertExcludes(appPage, safeUiAdapterHelperFragment, "app/page.tsx safe UI adapter helper runtime import");

for (const parkedPath of [
  "bookingCardPriceLine",
  "bookingRecordToForm",
  "buildCompletedBookingBillingReadinessAuditPayload",
]) {
  assertIncludes(appPage, parkedPath, `Parked finance/internal path ${parkedPath}`);
}

for (const removedDashboardControl of [
  "function getDriverDispatchCard",
  "function bookingRecordToDriverDraft",
  "function getDriverDraft",
  "async function assignDriver",
  "async function copyDriverDispatch",
  "data-dashboard-action-group",
  "data-dashboard-assign-driver",
  "data-dashboard-copy-driver-dispatch",
  "data-dashboard-copy-job-card",
  "data-dashboard-mark-otw",
  "data-dashboard-mark-pob",
  "data-dashboard-mark-completed",
]) {
  assertExcludes(
    appPage,
    removedDashboardControl,
    `Dashboard direct action control removed from typed endpoint migration ${removedDashboardControl}`,
  );
}

assertIncludes(adminBookingReadSetupRoute, "export async function GET", "Typed read setup route GET-only surface");
assertExcludes(adminBookingReadSetupRoute, "export async function POST", "Typed read setup route POST");
assertExcludes(adminBookingReadSetupRoute, "export async function PATCH", "Typed read setup route PATCH");
assertExcludes(adminBookingReadSetupRoute, "export async function DELETE", "Typed read setup route DELETE");
assertIncludes(adminBookingReadSetupRoute, "disabledReadFields", "Typed read setup route disabled fields");
assertIncludes(adminBookingReadSetupRoute, "no_live_read", "Typed read setup route no-live marker");

for (const source of [adminBookingReadSetupHelper, safeDtoHelper, safeUiAdapterHelper]) {
  assertIncludes(source, "dbReadEnabled: false", "Setup helper DB read disabled");
  assertIncludes(source, "liveReadEnabled: false", "Setup helper live read disabled");
  assertIncludes(source, "no_live_read: true", "Setup helper no-live marker");
  assertExcludes(source, /@supabase\/supabase-js|createClient|\.from\(|\.select\(/, "Setup helper DB path");
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route remains separate");
assertIncludes(adminSavedBookingsRoute, "export async function POST", "Admin saved bookings route remains separate");
assertIncludes(adminSavedBookingsRoute, "export async function DELETE", "Admin saved bookings route remains separate");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list read remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings detail read remains");
assertExcludes(adminSavedBookingsRoute, safeDtoHelperExport, "Admin saved bookings route safe DTO separation");
assertExcludes(adminSavedBookingsRoute, safeUiAdapterHelperExport, "Admin saved bookings route safe UI adapter separation");
assertExcludes(adminSavedBookingsRoute, disabledReadSetupRoute, "Admin saved bookings route typed endpoint migration");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, safeDtoHelperExport, label);
  assertExcludes(source, safeDtoHelperFragment, label);
  assertExcludes(source, safeUiAdapterHelperExport, label);
  assertExcludes(source, safeUiAdapterHelperFragment, label);
  assertExcludes(source, disabledReadSetupRoute, label);
}

for (const suiteEntry of [
  approvalGuardScript,
  "scripts/test-load-bookings-operational-runtime-mapping-guard.mjs",
  "scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs",
  "scripts/test-load-bookings-operational-runtime-wiring-approval-packet.mjs",
  "scripts/test-load-bookings-runtime-wiring-blocker.mjs",
  "scripts/test-load-bookings-safe-dto-no-live-guard.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, suiteEntry, `Preactivation suite entry ${suiteEntry}`);
}

console.log("Typed Load Bookings endpoint migration approval packet guard passed");
