import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const customerRatesRuntimeHelperPath = "lib/admin-customer-rates-runtime-write-action.ts";
const customerRatesRuntimeRoutePath = "app/api/admin-customer-rates-runtime-write-action/route.ts";
const payoutRuntimeHelperPath = "lib/admin-driver-payout-rules-runtime-write-action.ts";
const payoutRuntimeRoutePath = "app/api/admin-driver-payout-rules-runtime-write-action/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const routePathFragment = "/api/admin-driver-payout-rules-runtime-write-action";
const guardScript = "scripts/test-driver-payout-rules-runtime-app-wiring.mjs";

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
  payoutRuntimeHelper,
  payoutRuntimeRoute,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(customerRatesRuntimeHelperPath, "utf8"),
  readFile(customerRatesRuntimeRoutePath, "utf8"),
  readFile(payoutRuntimeHelperPath, "utf8"),
  readFile(payoutRuntimeRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const ledgerSection = sectionBetween(ledger, "### Driver Payout Rules Runtime App Wiring Lock");
for (const phrase of [
  "Company/traveler rate override save/remove now calls the gated `driver_payout_rules` runtime write boundary first.",
  "The route remains closed by default through `PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED`.",
  "Closed-gate/no-op responses fall back to the existing legacy path to preserve current behavior.",
  "When the typed payout boundary reports `saved`, the legacy follow-up omits `driver_payout_rules`.",
  "Customer_rates/pricing stays separate on the customer_rates runtime boundary.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Driver payout runtime app wiring ledger phrase: ${phrase}`);
}

assertIncludes(appPage, "const adminDriverPayoutRulesRuntimeWriteActionApiPath", "Payout runtime route constant");
assertIncludes(appPage, routePathFragment, "Payout runtime route path");
assertIncludes(appPage, "type DriverPayoutRulesRuntimeWritePayload", "Payout runtime payload type");
assertIncludes(appPage, "type DriverPayoutRulesRuntimeWriteResponse", "Payout runtime response type");
assertIncludes(appPage, "async function saveDriverPayoutRulesRuntime", "Payout runtime client helper");
assertIncludes(appPage, "isDriverPayoutRulesRuntimeWriteBlockedNoOp", "Payout closed-gate fallback helper");
assertIncludes(appPage, "\"x-prestige-admin-purpose\": adminLegacyDataPurpose", "Payout runtime admin purpose header");

const payoutClientHelper = sliceBetween(
  appPage,
  "function driverPayoutRulesRuntimeRejectedFields",
  "function buildCompanyRateOverridePayload",
);
assertIncludes(payoutClientHelper, "fetch(adminDriverPayoutRulesRuntimeWriteActionApiPath", "Payout runtime fetch");
assertIncludes(payoutClientHelper, "driverPayoutRulesRuntimeWriteSaved", "Payout runtime saved detection");
assertIncludes(payoutClientHelper, "\"write_gate_closed\"", "Payout runtime closed-gate fallback");
assertExcludes(
  payoutClientHelper,
  /customer_rates|customer_rate|customer_price|pricing|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|photo|calendar|internal|admin_notes|debug|secret|api_key|access_token|raw_token|paynow|pay_now|payout_preferences/i,
  "Payout runtime client helper",
);

const companyPayoutRuntimePayload = sliceBetween(
  appPage,
  "function buildCompanyDriverPayoutRulesRuntimeWritePayload",
  "function buildTravelerDriverPayoutRulesRuntimeWritePayload",
);
const travelerPayoutRuntimePayload = sliceBetween(
  appPage,
  "function buildTravelerDriverPayoutRulesRuntimeWritePayload",
  "function buildCompanyDriverPayoutOverridePayload",
);

for (const [label, source] of [
  ["Company driver_payout_rules runtime payload", companyPayoutRuntimePayload],
  ["Traveler driver_payout_rules runtime payload", travelerPayoutRuntimePayload],
]) {
  assertIncludes(source, "driver_payout_rules", label);
  assertExcludes(source, /customerRates|customer_rates|customerRate|customerPrice|customer_price|pricing|payment|billing|invoice|pdf|provider|send|auth|location|photo|calendar|internal|debug|secret|token|paynow|payout_preferences/i, label);
}

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
  ["Company legacy combined payload", companyCombinedPayload],
  ["Traveler legacy combined payload", travelerCombinedPayload],
]) {
  assertIncludes(source, "includeCustomerRates", `${label} customer_rates fallback gate`);
  assertIncludes(source, "includeDriverPayoutRules", `${label} driver_payout_rules fallback gate`);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
assertIncludes(saveRateOverride, "const hasDriverPayoutOverrides", "Driver payout override presence check");
assertIncludes(saveRateOverride, "saveDriverPayoutRulesRuntime", "Rate override payout runtime call");
assertIncludes(saveRateOverride, "buildCompanyDriverPayoutRulesRuntimeWritePayload", "Company payout runtime payload call");
assertIncludes(saveRateOverride, "buildTravelerDriverPayoutRulesRuntimeWritePayload", "Traveler payout runtime payload call");
assertIncludes(saveRateOverride, "|| !hasDriverPayoutOverrides", "Driver-only company save skips payout runtime when empty");
assertIncludes(saveRateOverride, "includeDriverPayoutRules: !companyDriverPayoutRulesRuntime.saved", "Company legacy payout overwrite guard");
assertIncludes(saveRateOverride, "includeDriverPayoutRules: !travelerDriverPayoutRulesRuntime.saved", "Traveler legacy payout overwrite guard");
assertBefore(saveRateOverride, "const companyDriverPayoutRulesRuntime", "const companyUpdate", "Company payout runtime ordering");
assertBefore(saveRateOverride, "const travelerDriverPayoutRulesRuntime", "const travelerUpdate", "Traveler payout runtime ordering");
assertBefore(saveRateOverride, "let travelerDriverPayoutRulesRuntime", "const travelerInsert", "New traveler identity payout runtime ordering");
assertBefore(saveRateOverride, "const createdTravelerDriverPayoutRulesRuntime", "const travelerCustomerRatesFallback", "Created traveler payout runtime fallback ordering");

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
  assertIncludes(source, "saveDriverPayoutRulesRuntime", `${label} payout clear runtime call`);
  assertIncludes(source, "driverPayoutRules: {}", `${label} payout clear payload`);
  assertIncludes(source, "includeDriverPayoutRules: !", `${label} legacy payout clear fallback`);
  assertIncludes(source, "saveCustomerRatesRuntime", `${label} customer_rates clear remains separate`);
}

const customerRatesRuntimeWritePayload = sliceBetween(
  customerRatesRuntimeHelper,
  "function writePayload",
  "function toCustomerRatesRecord",
);
assertIncludes(customerRatesRuntimeWritePayload, "customer_rates", "Customer rates runtime write payload");
assertExcludes(
  customerRatesRuntimeWritePayload,
  /driver_payout_rules|driver_payout|payout|paynow|pay_now/i,
  "Customer rates runtime write payload",
);
assertExcludes(customerRatesRuntimeRoute, routePathFragment, "Customer rates route payout separation");

const payoutRuntimeWritePayload = sliceBetween(
  payoutRuntimeHelper,
  "function writePayload",
  "function toDriverPayoutRulesRecord",
);
assertIncludes(payoutRuntimeWritePayload, "driver_payout_rules", "Payout runtime write payload");
assertExcludes(
  payoutRuntimeWritePayload,
  /customer_rates|customer_rate|customer_price|pricing|payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret|paynow|payout_preferences/i,
  "Payout runtime write payload",
);
assertIncludes(payoutRuntimeRoute, "executeAdminDriverPayoutRulesRuntimeWriteAction", "Payout runtime route executor");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, routePathFragment, "Save Booking + CRM payout runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, routePathFragment, "Parser route payout runtime separation");
assertExcludes(adminBookingsRoute, routePathFragment, "Admin bookings route payout runtime separation");
assertExcludes(adminBookingsRoute, "driver_payout_rules", "Admin bookings safe persistence payout separation");
assertExcludes(adminSavedBookingsRoute, routePathFragment, "Admin saved bookings route payout runtime separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation payout runtime app wiring guard registration");

console.log("driver_payout_rules runtime app wiring guard passed");
