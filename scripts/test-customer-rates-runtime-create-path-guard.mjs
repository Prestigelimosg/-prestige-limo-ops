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
  "Driver payout rules are handled by the separate payout runtime boundary and remain excluded from the customer_rates runtime boundary.",
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
  "function statusClass",
);

for (const [label, source] of [["Legacy company create payload", legacyCompanyInsertBuilder]]) {
  assertIncludes(source, "includeCustomerRates", `${label} customer_rates include gate`);
  assertIncludes(source, "includeDriverPayoutRules", `${label} driver_payout_rules include gate`);
  assertIncludes(source, "build", `${label} split helper composition`);
  assertIncludes(source, "driverPayoutRules", `${label} parked driver payout payload`);
  assertExcludes(source, /payment|billing|invoice|pdf|provider|auth|location|photo|calendar|internal|debug|secret/i, label);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
for (const fragment of [
  "const companyId = positiveId(rateOverrideDraft.companyId);",
  "const bookerId = positiveId(rateOverrideDraft.bookerId);",
  "const customerId = positiveId(selectedDraftBooker?.customer_id);",
  "buildBookerCustomerRatesRuntimeWritePayload(",
  "buildCompanyCustomerRatesRuntimeWritePayload(companyId, mergedCustomerRates)",
  "includeCustomerRates:",
  "!isCustomerAccountOverride && !customerRatesRuntime.saved",
]) {
  assertIncludes(saveRateOverride, fragment, "Verified Customer Account rate-override identity");
}
assertExcludes(
  saveRateOverride,
  "const createdCompany = await adminLegacyDataClient",
  "Rates override save must not create a Company identity",
);
assertExcludes(
  saveRateOverride,
  "adminLegacyTables.travelers",
  "Rates override save must not target a Traveller identity",
);
assertIncludes(
  appPage,
  'data-rate-customer-account="true"',
  "Existing Rates exact Customer Account selector",
);
assertExcludes(appPage, 'data-rate-override-traveler-id="true"', "Normal Rates UI must not expose Traveller rate identity");

const saveBooking = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBooking, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertExcludes(saveBooking, runtimeRoutePath, "Save Booking + CRM customer_rates runtime separation");
assertExcludes(saveBooking, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, runtimeRoutePath, "Parser route customer_rates runtime separation");
assertExcludes(adminBookingsRoute, runtimeRoutePath, "Admin bookings route customer_rates runtime separation");
assertExcludes(adminSavedBookingsRoute, runtimeRoutePath, "Admin saved bookings route customer_rates runtime separation");

assertIncludes(preactivationSuite, guardScript, "Preactivation customer_rates create-path guard registration");

console.log("customer_rates runtime create path guard passed");
