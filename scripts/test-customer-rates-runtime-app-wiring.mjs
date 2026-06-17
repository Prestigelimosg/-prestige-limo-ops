import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const routePathFragment = "/api/admin-customer-rates-runtime-write-action";
const guardScript = "scripts/test-customer-rates-runtime-app-wiring.mjs";

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

function assertBefore(source, earlier, later, label) {
  const earlierIndex = source.indexOf(earlier);
  const laterIndex = source.indexOf(later);

  assert.notEqual(earlierIndex, -1, `${label} missing earlier marker: ${earlier}`);
  assert.notEqual(laterIndex, -1, `${label} missing later marker: ${later}`);
  assert.ok(earlierIndex < laterIndex, `${label} must call ${earlier} before ${later}.`);
}

const [
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Customer Rates Runtime App Wiring Lock");
for (const phrase of [
  "Company/traveler rate override save/remove now calls the gated customer_rates runtime write boundary first.",
  "The route remains closed by default through `PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED`.",
  "Closed-gate/no-op responses fall back to the existing legacy combined path to preserve current behavior.",
  "When the typed customer_rates boundary reports `saved`, the legacy follow-up omits `customer_rates` and writes only parked `driver_payout_rules` plus allowed metadata.",
  "Driver-only override saves do not call the customer_rates runtime boundary.",
  "Remove override supports safe customer_rates clear through an empty customer_rates map.",
  "Typed payout app wiring is tracked separately by the Driver Payout Rules Runtime App Wiring Lock and remains excluded from customer_rates payloads.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Customer rates runtime app wiring ledger phrase: ${phrase}`);
}

assertIncludes(appPage, "const adminCustomerRatesRuntimeWriteActionApiPath", "Customer rates runtime route constant");
assertIncludes(appPage, routePathFragment, "Customer rates runtime route path");
assertIncludes(appPage, "type CustomerRatesRuntimeWritePayload", "Customer rates runtime payload type");
assertIncludes(appPage, "type CustomerRatesRuntimeWriteResponse", "Customer rates runtime response type");
assertIncludes(appPage, "async function saveCustomerRatesRuntime", "Customer rates runtime client helper");
assertIncludes(appPage, "isCustomerRatesRuntimeWriteBlockedNoOp", "Customer rates closed-gate fallback helper");
assertIncludes(appPage, "\"x-prestige-admin-purpose\": adminLegacyDataPurpose", "Customer rates runtime admin purpose header");

const companyRuntimePayload = sliceBetween(
  appPage,
  "function buildCompanyCustomerRatesRuntimeWritePayload",
  "function buildTravelerCustomerRatesRuntimeWritePayload",
);
const travelerRuntimePayload = sliceBetween(
  appPage,
  "function buildTravelerCustomerRatesRuntimeWritePayload",
  "function buildCompanyDriverPayoutRulesRuntimeWritePayload",
);

for (const [label, source] of [
  ["Company customer_rates runtime payload", companyRuntimePayload],
  ["Traveler customer_rates runtime payload", travelerRuntimePayload],
]) {
  assertIncludes(source, "customer_rates", label);
  assertExcludes(source, /driverPayout|driver_payout|payout|payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret/i, label);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
assertIncludes(saveRateOverride, "saveCustomerRatesRuntime", "Rate override customer rates runtime call");
assertIncludes(saveRateOverride, "buildCompanyCustomerRatesRuntimeWritePayload", "Company customer rates runtime payload call");
assertIncludes(saveRateOverride, "buildTravelerCustomerRatesRuntimeWritePayload", "Traveler customer rates runtime payload call");
assertIncludes(saveRateOverride, "const hasCustomerRateOverrides", "Customer rate override presence check");
assertIncludes(saveRateOverride, "|| !hasCustomerRateOverrides", "Driver-only company save skips customer_rates runtime call");
assertIncludes(saveRateOverride, "hasCustomerRateOverrides\n            ? await saveCustomerRatesRuntime", "Driver-only traveler save skips customer_rates runtime call");
assertIncludes(saveRateOverride, "includeCustomerRates: !companyCustomerRatesRuntime.saved", "Company legacy customer_rates overwrite guard");
assertIncludes(saveRateOverride, "includeCustomerRates: !travelerCustomerRatesRuntime.saved", "Traveler legacy customer_rates overwrite guard");
assertBefore(saveRateOverride, "const companyCustomerRatesRuntime", "const companyUpdate", "Company customer_rates runtime ordering");
assertBefore(saveRateOverride, "const travelerCustomerRatesRuntime", "const travelerUpdate", "Traveler customer_rates runtime ordering");
assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Company legacy payout fallback remains parked");
assertIncludes(saveRateOverride, "adminLegacyTables.travelers", "Traveler legacy payout fallback remains parked");
assertIncludes(saveRateOverride, "driver_payout_rules", "Driver payout rules remain outside customer_rates payloads");

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
  ["Company override remove", removeCompanyRateOverride],
  ["Traveler override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "saveCustomerRatesRuntime", `${label} customer_rates clear call`);
  assertIncludes(source, "customerRates: {}", `${label} customer_rates clear payload`);
  assertIncludes(source, "includeCustomerRates: !", `${label} legacy customer_rates clear fallback`);
  assertIncludes(source, "driverPayoutRules: {}", `${label} parked payout clear remains explicit`);
}

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM customer_rates runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route customer_rates runtime separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings route customer_rates runtime separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings route customer_rates runtime separation");
assertExcludes(companyRuntimePayload, /driver_payout|payout|paynow|pay_now/i, "Company customer_rates runtime payload remains payout-free");
assertExcludes(travelerRuntimePayload, /driver_payout|payout|paynow|pay_now/i, "Traveler customer_rates runtime payload remains payout-free");

assertIncludes(preactivationSuite, guardScript, "Preactivation customer rates runtime app wiring guard registration");

console.log("customer_rates runtime app wiring guard passed");
