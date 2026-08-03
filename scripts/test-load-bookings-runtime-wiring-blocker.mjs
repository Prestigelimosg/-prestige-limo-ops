import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const safeDtoHelperExport = "buildAdminLoadBookingsSafeDtoContract";
const safeDtoHelperFragment = "admin-load-bookings-safe-dto-contract";
const blockerGuardScript = "scripts/test-load-bookings-runtime-wiring-blocker.mjs";

const riskyBookingRecordFields = [
  "customer_rate",
  "customer_price_amount",
  "customer_rate_override",
  "customer_price_override_reason",
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
];

const futureAdapterForbiddenLedgerFragments = [
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
  safeDtoHelper,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(safeDtoHelperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const blockerSection = sectionBetween(ledger, "### Load Bookings Runtime Wiring Blocker Lock");

for (const phrase of [
  "Runtime wiring to the safe DTO is blocked for now.",
  "Current Load Bookings runtime remains on `GET /api/admin-saved-bookings`.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains separate and unchanged.",
  "Reason: current `BookingRecord` and parked action/finance UI paths still consume risky legacy finance/payout/internal fields.",
  "Stage 1 operational display cards no longer call `bookingCardPriceLine`.",
  "`bookingCardPriceLine`, `bookingRecordToForm`, driver dispatch copy, driver assignment controls, and billing readiness paths remain parked and must not be fed by the safe DTO.",
  "Future typed Load Bookings endpoint migration still requires separate approval and must use the safe operational UI adapter/card path.",
  "Existing legacy finance/payout-aware UI behavior remains parked until separate finance/payout approval.",
  "Rollback note: keep Load Bookings on `GET /api/admin-saved-bookings` until safe UI adapter and typed read path are separately approved and verified.",
]) {
  assertIncludes(blockerSection, phrase, `Load Bookings runtime blocker phrase ${phrase}`);
}

for (const riskyField of [
  "`customer_rate`",
  "`customer_price_amount`",
  "`customer_rate_override`",
  "`customer_price_override_reason`",
  "`driver_payout_min/max/amount/override/reason/unit`",
  "`driver_notes`",
  "`driver_dispatch_include_payout`",
  "midnight_surcharge/payout",
  "extra_stop_surcharge/payout",
  "child_seat_customer_surcharge/driver_payout",
  "`pricing_source`",
]) {
  assertIncludes(blockerSection, riskyField, `Risky Load Bookings dependency ${riskyField}`);
}

for (const forbiddenFragment of futureAdapterForbiddenLedgerFragments) {
  assertIncludes(
    blockerSection,
    forbiddenFragment,
    `Future safe UI adapter forbidden fragment ${forbiddenFragment}`,
  );
}

for (const forbiddenApprovalPhrase of [
  "runtime wiring is approved",
  "safe DTO runtime wiring may proceed",
  "blind endpoint swap is approved",
  "finance/payout approval granted",
]) {
  assertExcludes(
    blockerSection,
    forbiddenApprovalPhrase,
    `Load Bookings runtime blocker approval phrase ${forbiddenApprovalPhrase}`,
  );
}

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM path");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetchAdminSavedBookingsList(searchParams)",
  "Load Bookings legacy read path",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Load Bookings legacy read method");
assertExcludes(loadBookingsBlock, safeDtoHelperExport, "Load Bookings runtime wiring");
assertExcludes(loadBookingsBlock, safeDtoHelperFragment, "Load Bookings runtime wiring");

assertExcludes(appPage, safeDtoHelperExport, "app/page.tsx safe DTO runtime wiring");
assertExcludes(appPage, safeDtoHelperFragment, "app/page.tsx safe DTO runtime wiring");

const bookingRecordType = sliceBetween(appPage, "type BookingRecord = {", "type BookingStatusValue");
for (const riskyField of riskyBookingRecordFields) {
  assertIncludes(bookingRecordType, riskyField, `BookingRecord risky field ${riskyField}`);
}

const bookingCardPriceBlock = sliceBetween(appPage, "function bookingCardPriceAmounts", "function positiveRateOrDefault");
for (const riskyField of [
  "customer_rate",
  "customer_price_amount",
  "customer_rate_override",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_amount",
  "midnight_surcharge",
  "midnight_payout",
  "extra_stop_surcharge",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
]) {
  assertIncludes(bookingCardPriceBlock, riskyField, `bookingCardPriceLine dependency ${riskyField}`);
}

const priceLineUsages = appPage.match(/bookingCardPriceLine\(savedBooking\)/g) ?? [];
assert.equal(
  priceLineUsages.length,
  0,
  "Dashboard, recent, and completed operational display cards must not call bookingCardPriceLine(savedBooking).",
);
assertIncludes(
  appPage,
  "function buildLoadBookingsOperationalDisplayCard",
  "Stage 1 operational display card mapper",
);
assertIncludes(
  appPage,
  "loadBookingsOperationalDisplayFieldNames",
  "Stage 1 operational display field list",
);

const bookingRecordToFormBlock = sliceBetween(
  appPage,
  "function bookingRecordToForm",
  "function bookingRecordToOperationalFormFields",
);
assertIncludes(
  bookingRecordToFormBlock,
  "...bookingRecordToFinancePayoutInternalFormFields(bookingRecord)",
  "bookingRecordToForm keeps finance/payout mapping isolated in the explicit internal form mapper",
);

const bookingRecordToFinancePayoutBlock = sliceBetween(
  appPage,
  "function bookingRecordToFinancePayoutInternalFormFields",
  "function customerBookingTypeLabel",
);
for (const riskyField of [
  "customer_rate_override",
  "customer_price_override_reason",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_notes",
  "driver_dispatch_include_payout",
]) {
  assertIncludes(
    bookingRecordToFinancePayoutBlock,
    riskyField,
    `bookingRecordToFinancePayoutInternalFormFields dependency ${riskyField}`,
  );
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
    `Dashboard direct action control removed from Load Bookings list ${removedDashboardControl}`,
  );
}

for (const billingDependency of [
  "buildCompletedBookingBillingReadinessAuditPayload",
  "hasSavedCustomerBillingAmountSource",
  "adminCompletedBookingBillingReadinessAudit",
]) {
  assertIncludes(appPage, billingDependency, `Billing readiness dependency ${billingDependency}`);
}

assertIncludes(safeDtoHelper, "loadBookingsRuntimeWiringEnabled: false", "Safe DTO helper runtime gate");
assertIncludes(safeDtoHelper, "savedBookingsEndpointChanged: false", "Safe DTO helper endpoint gate");
assertIncludes(safeDtoHelper, "readEnabled: false", "Safe DTO helper read gate");
assertIncludes(safeDtoHelper, "liveReadEnabled: false", "Safe DTO helper live read gate");
assertIncludes(safeDtoHelper, "dbReadEnabled: false", "Safe DTO helper DB read gate");
assertIncludes(safeDtoHelper, "no_live_read: true", "Safe DTO helper no-live marker");

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings read route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings read route");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings read route");
assertExcludes(adminSavedBookingsRoute, safeDtoHelperExport, "Admin saved bookings route separation");
assertExcludes(adminSavedBookingsRoute, safeDtoHelperFragment, "Admin saved bookings route separation");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
]) {
  assertExcludes(source, safeDtoHelperExport, label);
  assertExcludes(source, safeDtoHelperFragment, label);
}

for (const suiteEntry of [
  blockerGuardScript,
  "scripts/test-load-bookings-safe-dto-no-live-guard.mjs",
  "scripts/test-load-bookings-safe-dto-contract.mjs",
  "scripts/test-load-bookings-typed-dto-split-plan.mjs",
  "scripts/test-load-bookings-runtime-wiring-approval-packet.mjs",
  "scripts/test-load-bookings-typed-read-migration-plan.mjs",
  "scripts/test-shim-cleanup-no-new-shim-guard.mjs",
]) {
  assertIncludes(preactivationSuite, suiteEntry, `Preactivation suite entry ${suiteEntry}`);
}

console.log("Load Bookings runtime wiring blocker guard passed");
