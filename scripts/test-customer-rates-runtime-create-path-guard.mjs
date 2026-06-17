import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const guardScript = "scripts/test-customer-rates-runtime-create-path-guard.mjs";
const runtimeRoutePath = "/api/admin-customer-rates-runtime-write-action";

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

const ledgerSection = sectionBetween(ledger, "### Customer Rates Runtime Create Path Lock");
for (const phrase of [
  "New company/traveler rate override create paths defer customer_rates to the gated runtime boundary when customer rate overrides are present.",
  "Legacy create payload builders accept `includeCustomerRates` and can omit `customer_rates` before the runtime boundary runs.",
  "When the customer_rates runtime boundary reports saved, legacy follow-up keeps customer_rates omitted.",
  "When the customer_rates runtime boundary is closed/no-op, the existing legacy fallback writes customer_rates to preserve behavior.",
  "Driver payout rules remain on the parked legacy path and no typed payout runtime is wired.",
  "Save Booking + CRM remains on `POST /api/admin-bookings`.",
  "`/api/admin-saved-bookings` remains unchanged.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No UI sector/card, env change, deployment, live DB write execution, provider activation, live send, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `Customer rates create-path ledger phrase: ${phrase}`);
}

const legacyCompanyInsertBuilder = sliceBetween(
  appPage,
  "function buildLegacyCompanyRateOverrideInsertPayload",
  "function buildLegacyTravelerRateOverrideInsertPayload",
);
const legacyTravelerInsertBuilder = sliceBetween(
  appPage,
  "function buildLegacyTravelerRateOverrideInsertPayload",
  "function statusClass",
);

for (const [label, source] of [
  ["Legacy company create payload", legacyCompanyInsertBuilder],
  ["Legacy traveler create payload", legacyTravelerInsertBuilder],
]) {
  assertIncludes(source, "includeCustomerRates", `${label} customer_rates include gate`);
  assertIncludes(source, "build", `${label} split helper composition`);
  assertIncludes(source, "driverPayoutRules", `${label} parked driver payout payload`);
  assertExcludes(source, /payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret/i, label);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
const legacyCompanyCreate = sliceBetween(
  saveRateOverride,
  "const createdCompany = await adminLegacyDataClient",
  "} else if (!companyIdentitySynced) {",
);
const newTravelerCreate = sliceBetween(
  saveRateOverride,
  "const createdTraveler = await adminLegacyDataClient",
  "if (!reloadResult.ok) {",
);

assertIncludes(
  saveRateOverride,
  "const shouldDeferCompanyCustomerRatesToRuntime = !bossName && hasCustomerRateOverrides;",
  "Company create customer_rates deferral decision",
);
assertIncludes(
  legacyCompanyCreate,
  "includeCustomerRates: !shouldDeferCompanyCustomerRatesToRuntime",
  "Company create omits customer_rates before runtime boundary",
);
assertBefore(
  saveRateOverride,
  "const createdCompany = await adminLegacyDataClient",
  "const companyCustomerRatesRuntime",
  "Company create then customer_rates runtime call",
);
assertIncludes(
  saveRateOverride,
  "includeCustomerRates: !companyCustomerRatesRuntime.saved",
  "Company legacy fallback only writes customer_rates when runtime did not save",
);

assertIncludes(
  newTravelerCreate,
  "includeCustomerRates: !hasCustomerRateOverrides",
  "Traveler create omits customer_rates before runtime boundary",
);
assertIncludes(
  newTravelerCreate,
  ".select(\"id, company_id, traveler_name, customer_rates, driver_payout_rules\")",
  "Traveler create must return id for runtime customer_rates boundary",
);
assertIncludes(
  newTravelerCreate,
  "buildTravelerCustomerRatesRuntimeWritePayload(createdTravelerRecord.id, overrideCustomerRates)",
  "Traveler create customer_rates runtime call",
);
assertIncludes(
  newTravelerCreate,
  "if (!createdTravelerCustomerRatesRuntime.saved && hasCustomerRateOverrides)",
  "Traveler create closed-gate legacy fallback",
);
assertIncludes(
  newTravelerCreate,
  "includeCustomerRates: true",
  "Traveler create fallback writes customer_rates only after no-op runtime",
);
assertIncludes(
  newTravelerCreate,
  "driverPayoutRules: overrideDriverPayoutRules",
  "Traveler create keeps driver payout rules on parked legacy path",
);

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, runtimeRoutePath, "Save Booking + CRM customer_rates runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, runtimeRoutePath, "Parser route customer_rates runtime separation");
assertExcludes(adminBookingsRoute, runtimeRoutePath, "Admin bookings route customer_rates runtime separation");
assertExcludes(adminSavedBookingsRoute, runtimeRoutePath, "Admin saved bookings route customer_rates runtime separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation customer_rates create-path guard registration");

console.log("customer_rates runtime create path guard passed");
