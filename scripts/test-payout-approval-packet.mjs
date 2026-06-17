import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const pricingHelperPath = "lib/pricing.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const savedBookingDriverAssignmentPath = "lib/admin-saved-booking-driver-assignment.ts";
const loadBookingsSafeDtoPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const loadBookingsSafeUiAdapterPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

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
  pricingHelper,
  aiParseRoute,
  adminSavedBookingsRoute,
  savedBookingDriverAssignment,
  loadBookingsSafeDto,
  loadBookingsSafeUiAdapter,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(pricingHelperPath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(savedBookingDriverAssignmentPath, "utf8"),
  readFile(loadBookingsSafeDtoPath, "utf8"),
  readFile(loadBookingsSafeUiAdapterPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const packetSection = sectionBetween(ledger, "### Payout Runtime Approval Packet Lock");

for (const phrase of [
  "Approval status: pending future runtime-wiring approval.",
  "This is a docs/test-only approval packet guarded by `scripts/test-payout-approval-packet.mjs`.",
  "`driver_payout_rules`/payout runtime remains parked.",
  "Payout is coupled to pricing/profit, `rate_settings`, company/traveler overrides, full driver profile, assignment, dispatch copy, and saved-booking snapshots.",
  "`customer_rates`/pricing must remain separate and parked.",
  "Payment/PDF/billing must remain separate and parked.",
  "Current `rate_settings` save/upsert, company/traveler rate override save/remove, full driver profile save/delete, saved-booking driver assignment payout snapshots, and dispatch payout copy remain parked for payout purposes.",
  "Future payout lane must prevent customer-visible payout leakage and driver-visible customer price/billing leakage.",
  "Future payout lane must exclude customer pricing, `customer_rates`, payment/PDF/billing activation, provider/send, auth, location/photo/calendar, internal notes, debug, and secrets unless separately approved.",
  "Future DB write requires separate owner approval, env verification, table/policy verification, and rollback/manual recovery verification before any write execution.",
  "Future runtime wiring must not change Save Booking + CRM.",
  "Future runtime wiring must not change `/api/admin-saved-bookings`.",
  "Future runtime wiring must not change parser behavior or `/api/ai-parse`.",
  "Future runtime wiring must not add UI sectors/buttons/cards.",
  "Future runtime wiring must not add new shims.",
  "Required tests before any future wiring:",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB write, migration, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/customer_rates/provider/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `Payout approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to wire now",
  "DB write approved",
  "live write approved",
  "payment approved",
  "PDF approved",
  "billing approved",
  "pricing approved",
  "customer_rates approved",
]) {
  assertExcludes(packetSection, forbiddenApprovalPhrase, `Forbidden approval phrase ${forbiddenApprovalPhrase}`);
}

for (const fragment of [
  "driverPayoutRules: Required<DriverPayoutRules>",
  "midnightPayout",
  "extraStopPayout",
  "childSeatDriverPayout",
  "export function payoutFromRules",
  "driverRecord?.driver_payout_rules",
  "export function calculateProfit",
]) {
  assertIncludes(pricingHelper, fragment, `Pricing/payout coupling fragment: ${fragment}`);
}

const saveDefaultRates = sliceBetween(appPage, "async function saveDefaultRates", "async function saveRateOverride");
for (const fragment of [
  "adminLegacyDataClient",
  ".from(adminLegacyTables.rateSettings)",
  "const scalarRateSettings = buildDefaultRateSettingsScalarPayload(rateSettings);",
  "const legacyRateMapFields = buildDefaultRateSettingsLegacyRateMapsPayload(rateSettings);",
  "driver_payout_rules: driverPayoutRules",
  "midnight_payout: scalarRateSettings.midnight_payout",
  "extra_stop_payout: scalarRateSettings.extra_stop_payout",
  "child_seat_driver_payout: scalarRateSettings.child_seat_driver_payout",
]) {
  assertIncludes(saveDefaultRates, fragment, `Parked saveDefaultRates payout fragment: ${fragment}`);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
for (const fragment of [
  "adminLegacyDataClient",
  "customer_rates",
  "driver_payout_rules",
  "buildCompanyRateOverridePayload",
  "buildTravelerRateOverridePayload",
]) {
  assertIncludes(saveRateOverride, fragment, `Parked rate override payout fragment: ${fragment}`);
}

const loadDrivers = sliceBetween(appPage, "async function loadDrivers", "async function fetchDriverAssignmentDisplayDriverRecords");
const saveDriverProfile = sliceBetween(appPage, "async function saveDriverProfile", "async function deleteDriverProfile");
for (const [label, source] of [
  ["Parked loadDrivers", loadDrivers],
  ["Parked saveDriverProfile", saveDriverProfile],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "payout_preferences", label);
  assertIncludes(source, "driver_payout_rules", label);
}

const assignDriver = sliceBetween(appPage, "async function assignDriver", "async function copyDriverDispatch");
for (const fragment of [
  "selectedDriver?.driver_payout_rules?.[bookingType]",
  "calculateSavedDriverPayout",
  "driver_payout_amount",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_notes",
  "driver_dispatch_include_payout",
]) {
  assertIncludes(assignDriver, fragment, `Parked assignDriver payout fragment: ${fragment}`);
}

const driverDispatchCard = sliceBetween(appPage, "function getDriverDispatchCard", "function parseMockChargeTimeToMinutes");
for (const fragment of [
  "bookingCardPriceAmounts(bookingRecord).driverPrice",
  "driver_dispatch_include_payout",
  'includePayout && payoutAmount ? `Payout: $${payoutAmount}` : ""',
]) {
  assertIncludes(driverDispatchCard, fragment, `Parked driver dispatch payout fragment: ${fragment}`);
}

for (const fragment of [
  "driver_payout_amount",
  "driver_payout_max",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_notes",
  "driver_dispatch_include_payout",
]) {
  assertIncludes(savedBookingDriverAssignment, fragment, `Saved booking driver assignment payout fragment: ${fragment}`);
  assertIncludes(loadBookingsSafeDto, fragment, `Safe DTO forbidden payout fragment: ${fragment}`);
  assertIncludes(loadBookingsSafeUiAdapter, fragment, `Safe UI adapter forbidden payout fragment: ${fragment}`);
}

for (const fragment of [
  "customer_price",
  "customer_rate",
  "billing",
  "invoice",
  "payment",
]) {
  assertIncludes(loadBookingsSafeDto, fragment, `Safe DTO forbidden customer finance fragment: ${fragment}`);
  assertIncludes(loadBookingsSafeUiAdapter, fragment, `Safe UI adapter forbidden customer finance fragment: ${fragment}`);
}

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, "driver_payout_rules", "Parser driver_payout_rules separation");
assertExcludes(aiParseRoute, "driver_payout", "Parser driver_payout separation");
assertExcludes(aiParseRoute, "payout", "Parser payout separation");

assertExcludes(
  adminSavedBookingsRoute,
  "scripts/test-payout-approval-packet.mjs",
  "admin-saved-bookings payout approval guard separation",
);

assertIncludes(
  preactivationSuite,
  "scripts/test-payout-approval-packet.mjs",
  "Preactivation suite registration",
);

console.log("payout runtime approval packet guard passed");
