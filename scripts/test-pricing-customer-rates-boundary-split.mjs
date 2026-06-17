import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
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
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Pricing Customer Rates Boundary Split Lock");

for (const phrase of [
  "Company/traveler customer rate override payload builders are split from driver payout override payload builders.",
  "`buildCompanyCustomerRateOverridePayload` and `buildTravelerCustomerRateOverridePayload` contain `customer_rates` only.",
  "`buildCompanyDriverPayoutOverridePayload` and `buildTravelerDriverPayoutOverridePayload` contain `driver_payout_rules` only.",
  "Existing `buildCompanyRateOverridePayload` and `buildTravelerRateOverridePayload` compose the split helpers to preserve current legacy behavior.",
  "Current company/traveler rate override save/remove remains on the legacy `adminLegacyDataClient` companies/travelers paths.",
  "No typed pricing/customer_rates runtime write is wired by this split.",
  "No typed payout runtime write is wired by this split.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, DB read/write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Pricing/customer_rates boundary split ledger phrase: ${phrase}`);
}

const companyCustomerPayload = sliceBetween(
  appPage,
  "function buildCompanyCustomerRateOverridePayload",
  "function buildTravelerCustomerRateOverridePayload",
);
const travelerCustomerPayload = sliceBetween(
  appPage,
  "function buildTravelerCustomerRateOverridePayload",
  "function buildCompanyDriverPayoutOverridePayload",
);
const companyDriverPayoutPayload = sliceBetween(
  appPage,
  "function buildCompanyDriverPayoutOverridePayload",
  "function buildTravelerDriverPayoutOverridePayload",
);
const travelerDriverPayoutPayload = sliceBetween(
  appPage,
  "function buildTravelerDriverPayoutOverridePayload",
  "function buildLegacyCompanyRateOverrideInsertPayload",
);
const companyCombinedPayload = sliceBetween(
  appPage,
  "function buildCompanyRateOverridePayload",
  "function buildTravelerRateOverridePayload",
);
const travelerCombinedPayload = sliceBetween(
  appPage,
  "function buildTravelerRateOverridePayload",
  "function buildCompanyCustomerRateOverridePayload",
);

for (const [label, source] of [
  ["Company customer rate override payload", companyCustomerPayload],
  ["Traveler customer rate override payload", travelerCustomerPayload],
]) {
  assertIncludes(source, "customer_rates", label);
  assertExcludes(source, "driver_payout_rules", label);
  assertExcludes(source, /driverPayout|payout|payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret/i, label);
}

for (const [label, source] of [
  ["Company driver payout override payload", companyDriverPayoutPayload],
  ["Traveler driver payout override payload", travelerDriverPayoutPayload],
]) {
  assertIncludes(source, "driver_payout_rules", label);
  assertExcludes(source, "customer_rates", label);
  assertExcludes(source, /customerRate|customerPrice|payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret/i, label);
}

for (const [label, source] of [
  ["Company combined legacy rate override payload", companyCombinedPayload],
  ["Traveler combined legacy rate override payload", travelerCombinedPayload],
]) {
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
  assertIncludes(source, "CustomerRateOverridePayload", label);
  assertIncludes(source, "DriverPayoutOverridePayload", label);
}

assertIncludes(companyCombinedPayload, "transzend_excel_privacy", "Company combined legacy privacy field");
assertIncludes(companyCombinedPayload, "updated_at", "Company combined legacy updated_at");
assertIncludes(travelerCombinedPayload, "updated_at", "Traveler combined legacy updated_at");

const legacyCompanyInsert = sliceBetween(
  appPage,
  "function buildLegacyCompanyRateOverrideInsertPayload",
  "function buildLegacyTravelerRateOverrideInsertPayload",
);
const legacyTravelerInsert = sliceBetween(
  appPage,
  "function buildLegacyTravelerRateOverrideInsertPayload",
  "function statusClass",
);
assertIncludes(legacyCompanyInsert, "buildCompanyCrmIdentityContactPayload", "Legacy company insert identity split");
assertIncludes(legacyCompanyInsert, "buildCompanyRateOverridePayload", "Legacy company insert rate split");
assertIncludes(legacyTravelerInsert, "buildTravelerCrmIdentityContactPayload", "Legacy traveler insert identity split");
assertIncludes(legacyTravelerInsert, "buildTravelerRateOverridePayload", "Legacy traveler insert rate split");

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
const removeCompanyRateOverride = sliceBetween(
  appPage,
  "async function removeCompanyRateOverride",
  "async function removeBossRateOverride",
);
const removeBossRateOverride = sliceBetween(
  appPage,
  "async function removeBossRateOverride",
  "async function loadDrivers",
);

for (const [label, source] of [
  ["Parked rate override save", saveRateOverride],
  ["Parked company rate override remove", removeCompanyRateOverride],
  ["Parked traveler rate override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
}

assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Parked company override save");
assertIncludes(saveRateOverride, "adminLegacyTables.travelers", "Parked traveler override save");
assertIncludes(removeCompanyRateOverride, "adminLegacyTables.companies", "Parked company override remove");
assertIncludes(removeBossRateOverride, "adminLegacyTables.travelers", "Parked traveler override remove");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const forbidden of [
  "buildCompanyCustomerRateOverridePayload",
  "buildTravelerCustomerRateOverridePayload",
  "buildCompanyDriverPayoutOverridePayload",
  "buildTravelerDriverPayoutOverridePayload",
]) {
  assertExcludes(aiParseRoute, forbidden, "Parser boundary");
  assertExcludes(adminBookingsRoute, forbidden, "Admin bookings boundary");
  assertExcludes(adminSavedBookingsRoute, forbidden, "Admin saved bookings boundary");
}

assertIncludes(
  preactivationSuite,
  "scripts/test-pricing-customer-rates-boundary-split.mjs",
  "Preactivation suite pricing/customer_rates boundary split registration",
);

console.log("pricing/customer_rates boundary split guard passed");
