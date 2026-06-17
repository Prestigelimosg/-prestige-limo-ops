import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const customerRatesRuntimeHelperPath = "lib/admin-customer-rates-runtime-write-action.ts";
const customerRatesRuntimeRoutePath = "app/api/admin-customer-rates-runtime-write-action/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-payout-runtime-split-guard.mjs";
const payoutRuntimeRoutePath = "/api/admin-driver-payout-rules-runtime-write-action";
const payoutRuntimeRouteFile = "app/api/admin-driver-payout-rules-runtime-write-action/route.ts";

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
  assert.ok(earlierIndex < laterIndex, `${label} must keep ${earlier} before ${later}.`);
}

const [
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  customerRatesRuntimeHelper,
  customerRatesRuntimeRoute,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(customerRatesRuntimeHelperPath, "utf8"),
  readFile(customerRatesRuntimeRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Payout Runtime Split Guard Lock");
for (const phrase of [
  "`driver_payout_rules` payout payload builders remain split from customer_rates payload builders.",
  "Customer_rates runtime payloads and route remain customer-rate only and must never carry payout fields.",
  "No `app/page.tsx` payout runtime wiring is active.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "Customer-visible and driver-visible finance separation remains mandatory.",
  "No UI sector/card, env change, deployment, DB write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Payout runtime split guard ledger phrase: ${phrase}`);
}

const companyCustomerPayload = sliceBetween(
  appPage,
  "function buildCompanyCustomerRateOverridePayload",
  "function buildTravelerCustomerRateOverridePayload",
);
const travelerCustomerPayload = sliceBetween(
  appPage,
  "function buildTravelerCustomerRateOverridePayload",
  "function buildCompanyCustomerRatesRuntimeWritePayload",
);
const companyCustomerRuntimePayload = sliceBetween(
  appPage,
  "function buildCompanyCustomerRatesRuntimeWritePayload",
  "function buildTravelerCustomerRatesRuntimeWritePayload",
);
const travelerCustomerRuntimePayload = sliceBetween(
  appPage,
  "function buildTravelerCustomerRatesRuntimeWritePayload",
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
  ["Company customer rate payload", companyCustomerPayload],
  ["Traveler customer rate payload", travelerCustomerPayload],
  ["Company customer_rates runtime payload", companyCustomerRuntimePayload],
  ["Traveler customer_rates runtime payload", travelerCustomerRuntimePayload],
]) {
  assertIncludes(source, "customer_rates", label);
  assertExcludes(source, /driverPayout|driver_payout|payout|paynow|pay_now/i, label);
  assertExcludes(source, /payment|billing|invoice|pdf|provider|send|auth|location|photo|calendar|internal|admin_notes|debug|secret|token/i, label);
}

for (const [label, source] of [
  ["Company driver payout payload", companyDriverPayoutPayload],
  ["Traveler driver payout payload", travelerDriverPayoutPayload],
]) {
  assertIncludes(source, "driver_payout_rules", label);
  assertExcludes(source, "customer_rates", label);
  assertExcludes(source, /customerRate|customerPrice|customer_price|pricing|payment|billing|invoice|pdf|provider|send|auth|location|photo|calendar|internal|admin_notes|debug|secret|token/i, label);
}

for (const [label, source] of [
  ["Company legacy combined payload", companyCombinedPayload],
  ["Traveler legacy combined payload", travelerCombinedPayload],
]) {
  assertIncludes(source, "build", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
  assertIncludes(source, "includeCustomerRates", label);
}

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

assertIncludes(saveRateOverride, "saveCustomerRatesRuntime", "Customer rates runtime call remains active");
assertIncludes(saveRateOverride, "driver_payout_rules", "Payout rules remain explicit in legacy override flow");
assertIncludes(saveRateOverride, "buildCompanyRateOverridePayload", "Company combined legacy payload remains explicit");
assertIncludes(saveRateOverride, "buildTravelerRateOverridePayload", "Traveler combined legacy payload remains explicit");
assertBefore(
  saveRateOverride,
  "const companyCustomerRatesRuntime",
  "const companyUpdate = await adminLegacyDataClient",
  "Company customer_rates runtime before legacy payout fallback",
);
assertBefore(
  saveRateOverride,
  "const travelerCustomerRatesRuntime",
  "const travelerUpdate = await adminLegacyDataClient",
  "Traveler customer_rates runtime before legacy payout fallback",
);

for (const [label, source] of [
  ["Company override remove", removeCompanyRateOverride],
  ["Traveler override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "saveCustomerRatesRuntime", `${label} customer_rates runtime clear`);
  assertIncludes(source, "driverPayoutRules: {}", `${label} parked payout clear remains explicit`);
  assertIncludes(source, "adminLegacyDataClient", `${label} payout remains on legacy fallback`);
}

const customerRatesRuntimeWritePayload = sliceBetween(
  customerRatesRuntimeHelper,
  "function writePayload",
  "function toCustomerRatesRecord",
);
assertIncludes(customerRatesRuntimeHelper, "forbiddenFieldPattern", "Customer rates helper forbidden-field rejection pattern");
assertIncludes(customerRatesRuntimeHelper, "driver_payout_rules", "Customer rates helper rejects payout fields");
assertIncludes(customerRatesRuntimeWritePayload, "customer_rates", "Customer rates runtime write payload");
assertExcludes(
  customerRatesRuntimeWritePayload,
  /driver_payout_rules|driver_payout|payout|paynow|pay_now/i,
  "Customer rates runtime write payload",
);
assertIncludes(customerRatesRuntimeRoute, "executeAdminCustomerRatesRuntimeWriteAction", "Customer rates route executor");
assertExcludes(customerRatesRuntimeRoute, /driver_payout_rules|driver_payout|payout|paynow|pay_now/i, "Customer rates runtime route");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, payoutRuntimeRoutePath, "Save Booking + CRM payout runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parser route", aiParseRoute],
  ["admin bookings route", adminBookingsRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, payoutRuntimeRoutePath, `${label} payout runtime route wiring`);
}

assertExcludes(
  appPage,
  /saveDriverPayoutRulesRuntime|driverPayoutRulesRuntimeWrite|adminDriverPayoutRulesRuntime/i,
  "app/page.tsx payout runtime client wiring",
);
assertExcludes(adminBookingsRoute, "driver_payout_rules", "Admin bookings safe persistence payout separation");
assertExcludes(aiParseRoute, "driver_payout_rules", "Parser payout rules separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation payout split guard registration");
assertExcludes(
  preactivationSuite,
  payoutRuntimeRouteFile,
  "Preactivation suite must reference tests, not route files",
);

console.log("payout runtime split guard passed");
