import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const safeUiAdapterHelperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const safeDtoHelperExport = "buildAdminLoadBookingsSafeDtoContract";
const safeDtoHelperFragment = "admin-load-bookings-safe-dto-contract";
const safeUiAdapterHelperExport = "buildAdminLoadBookingsSafeUiAdapterCardContract";
const safeUiAdapterHelperFragment = "admin-load-bookings-safe-ui-adapter-card-contract";
const approvalGuardScript = "scripts/test-load-bookings-operational-runtime-wiring-approval-packet.mjs";

const forbiddenFields = [
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
  safeDtoHelper,
  safeUiAdapterHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(safeDtoHelperPath, "utf8"),
  readFile(safeUiAdapterHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const approvalSection = sectionBetween(
  ledger,
  "### Operational-Only Load Bookings Runtime Wiring Approval Packet",
);

for (const phrase of [
  "Approval status: pending future typed endpoint migration approval.",
  "This packet does not approve typed endpoint migration or DB read activation.",
  "Current Load Bookings remains on `GET /api/admin-saved-bookings`.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Safe DTO contract exists but remains server-only/setup-only.",
  "Safe UI adapter/card contract exists but remains server-only/setup-only.",
  "Stage 1 operational display mapping is active in `app/page.tsx` without importing the server-only setup helpers.",
  "Typed endpoint migration remains blocked until approved separately.",
  "Future typed endpoint migration must use operational-only adapter/card fields.",
  "Future typed endpoint migration must not feed the safe DTO into existing finance/payout/internal `BookingRecord` paths.",
  "Existing finance/payout/internal UI paths remain parked: `bookingCardPriceLine`, `bookingRecordToForm` finance/payout mapping, driver dispatch payout copy, driver assignment payout controls, and billing readiness finance paths.",
  "Future implementation must not change Save Booking + CRM.",
  "Future implementation must not change `/api/admin-saved-bookings` behavior.",
  "Future implementation must not touch parser or `/api/ai-parse`.",
  "Future implementation must not add UI sectors/buttons/cards.",
  "Future implementation must not add new shims.",
  "Future live DB read activation requires separate approval and gate/env verification.",
  "Required future tests before typed endpoint migration: safe DTO contract guard, safe UI adapter/card contract guard, operational-only runtime mapping guard, forbidden-field exclusion guard, Load Bookings route-flow guard, `/api/admin-saved-bookings` separation guard, parser unchanged guard, no-new-shim guard, booking UI browser test, and rollback/no-live checkpoint.",
  "Rollback note: keep Load Bookings endpoint on `/api/admin-saved-bookings` until the typed read endpoint path is separately approved, implemented, verified, and reversible.",
  "No typed endpoint migration",
]) {
  assertIncludes(approvalSection, phrase, `Operational Load Bookings approval phrase ${phrase}`);
}

for (const forbiddenField of forbiddenFields) {
  assertIncludes(
    approvalSection,
    forbiddenField,
    `Operational Load Bookings approval forbidden field ${forbiddenField}`,
  );
}

for (const forbiddenApprovalPhrase of [
  "approved for runtime wiring",
  "runtime wiring is approved",
  "runtime implementation is approved",
  "safe to wire now",
  "blind endpoint swap is approved",
  "DB read/write is approved",
  "finance/payout approval granted",
]) {
  assertExcludes(
    approvalSection,
    forbiddenApprovalPhrase,
    `Operational Load Bookings approval phrase ${forbiddenApprovalPhrase}`,
  );
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");
assertExcludes(saveBookingBlock, safeDtoHelperExport, "Save Booking + CRM safe DTO wiring");
assertExcludes(saveBookingBlock, safeUiAdapterHelperExport, "Save Booking + CRM safe UI adapter wiring");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read path",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read method");
assertExcludes(loadBookingsBlock, safeDtoHelperExport, "Load Bookings safe DTO runtime wiring");
assertExcludes(loadBookingsBlock, safeDtoHelperFragment, "Load Bookings safe DTO runtime wiring");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperExport, "Load Bookings safe UI adapter runtime wiring");
assertExcludes(loadBookingsBlock, safeUiAdapterHelperFragment, "Load Bookings safe UI adapter runtime wiring");

assertExcludes(appPage, safeDtoHelperExport, "app/page.tsx safe DTO runtime wiring");
assertExcludes(appPage, safeDtoHelperFragment, "app/page.tsx safe DTO runtime wiring");
assertExcludes(appPage, safeUiAdapterHelperExport, "app/page.tsx safe UI adapter runtime wiring");
assertExcludes(appPage, safeUiAdapterHelperFragment, "app/page.tsx safe UI adapter runtime wiring");

for (const riskyPath of [
  "bookingCardPriceLine",
  "bookingRecordToForm",
  "buildCompletedBookingBillingReadinessAuditPayload",
]) {
  assertIncludes(appPage, riskyPath, `Existing parked finance/internal UI path ${riskyPath}`);
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
    `Dashboard direct action control removed from operational Load Bookings list ${removedDashboardControl}`,
  );
}

assertIncludes(safeDtoHelper, "loadBookingsRuntimeWiringEnabled: false", "Safe DTO helper runtime gate");
assertIncludes(safeDtoHelper, "readEnabled: false", "Safe DTO helper read gate");
assertIncludes(safeDtoHelper, "liveReadEnabled: false", "Safe DTO helper live-read gate");
assertIncludes(safeDtoHelper, "dbReadEnabled: false", "Safe DTO helper DB-read gate");
assertIncludes(safeDtoHelper, "no_live_read: true", "Safe DTO helper no-live marker");

assertIncludes(
  safeUiAdapterHelper,
  "loadBookingsRuntimeWiringEnabled: false",
  "Safe UI adapter helper runtime gate",
);
assertIncludes(
  safeUiAdapterHelper,
  "uiAdapterRuntimeWiringEnabled: false",
  "Safe UI adapter helper UI runtime gate",
);
assertIncludes(safeUiAdapterHelper, "uiRenderingEnabled: false", "Safe UI adapter helper UI rendering gate");
assertIncludes(
  safeUiAdapterHelper,
  "realUiCardRenderingEnabled: false",
  "Safe UI adapter helper real card rendering gate",
);
assertIncludes(safeUiAdapterHelper, "readEnabled: false", "Safe UI adapter helper read gate");
assertIncludes(safeUiAdapterHelper, "liveReadEnabled: false", "Safe UI adapter helper live-read gate");
assertIncludes(safeUiAdapterHelper, "dbReadEnabled: false", "Safe UI adapter helper DB-read gate");
assertIncludes(safeUiAdapterHelper, "no_live_read: true", "Safe UI adapter helper no-live marker");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings route");
assertExcludes(adminSavedBookingsRoute, safeDtoHelperExport, "Admin saved bookings route safe DTO separation");
assertExcludes(
  adminSavedBookingsRoute,
  safeUiAdapterHelperExport,
  "Admin saved bookings route safe UI adapter separation",
);

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, safeDtoHelperExport, label);
  assertExcludes(source, safeDtoHelperFragment, label);
  assertExcludes(source, safeUiAdapterHelperExport, label);
  assertExcludes(source, safeUiAdapterHelperFragment, label);
}

for (const suiteEntry of [
  approvalGuardScript,
  "scripts/test-load-bookings-safe-ui-adapter-card-contract.mjs",
  "scripts/test-load-bookings-runtime-wiring-blocker.mjs",
  "scripts/test-load-bookings-safe-dto-no-live-guard.mjs",
  "scripts/test-load-bookings-safe-dto-contract.mjs",
  "scripts/test-load-bookings-runtime-wiring-approval-packet.mjs",
  "scripts/test-load-bookings-typed-read-migration-plan.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, suiteEntry, `Preactivation suite entry ${suiteEntry}`);
}

console.log("Operational-only Load Bookings runtime wiring approval packet guard passed");
