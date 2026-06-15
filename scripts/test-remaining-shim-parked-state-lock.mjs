import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
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

const [ledger, appPage, legacyRoute, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const lockSection = sectionBetween(ledger, "### Remaining Shim Parked State Lock");

for (const phrase of [
  "No remaining low-risk read/display-only shim lane exists.",
  "Existing typed reads are: company/traveler identity display; driver display/search; rate setup read.",
  "Remaining legacy shim families are parked: `companies`, `travelers`, `drivers`, and `rate_settings`.",
  "Remaining parked behavior is write/edit/rate/full-profile only.",
  "Company/traveler writes must be split from `customer_rates` and `driver_payout_rules` before implementation.",
  "`rate_settings` save/upsert remains parked.",
  "Full driver profile save/delete remains parked.",
  "Pricing and payout remain parked.",
  "Future implementation must be one lane at a time with typed API, direct contract test, no-live guard, and rollback note.",
  "No runtime implementation is approved by this lock.",
]) {
  assertIncludes(lockSection, phrase, `Remaining shim parked state lock phrase: ${phrase}`);
}

for (const family of ["companies", "travelers", "drivers", "rate_settings"]) {
  assertIncludes(legacyRoute, `${family}: new Set`, `Legacy parked family ${family}`);
}

for (const fragment of [
  '"customer_rates"',
  '"driver_payout_rules"',
  '"payout_preferences"',
  '"preferred_areas"',
  '"airport_permit_notes"',
]) {
  assertIncludes(legacyRoute, fragment, `Legacy parked risky field ${fragment}`);
}

for (const fragment of [
  'const adminCompaniesCrmIdentityApiPath = "/api/admin-companies-crm-identity";',
  'const adminTravelersCrmIdentityApiPath = "/api/admin-travelers-crm-identity";',
  'const adminDriverAssignmentDisplayApiPath = "/api/admin-driver-assignment-display";',
  'const adminRateSetupApiPath = "/api/admin-rate-setup";',
  "fetchDriverAssignmentDisplayDriverRecords",
]) {
  assertIncludes(appPage, fragment, `Existing typed read ${fragment}`);
}

for (const fragment of [
  ".from(adminLegacyTables.rateSettings)",
  ".from(adminLegacyTables.companies)",
  ".from(adminLegacyTables.travelers)",
  ".from(adminLegacyTables.drivers)",
  "async function saveDefaultRates",
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
  "async function removeBossRateOverride",
  "async function loadDrivers",
  "async function saveDriverProfile",
  "async function deleteDriverProfile",
]) {
  assertIncludes(appPage, fragment, `Parked legacy call site ${fragment}`);
}

assertIncludes(appPage, "customer_rates: customerRates", "Parked default customer rates save");
assertIncludes(appPage, "driver_payout_rules: driverPayoutRules", "Parked default driver payout rules save");
assertIncludes(appPage, "payout_preferences: clean(driverProfileDraft.payoutPreferences) || null", "Parked driver payout preferences save");
assertIncludes(appPage, "driver_payout_rules: driverProfileDraft.payoutRules", "Parked driver payout rules save");

assertExcludes(
  lockSection,
  /approved implementation scope:|safe to implement now|runtime implementation approved/i,
  "Remaining shim parked state lock",
);
assertIncludes(
  preactivationSuite,
  "scripts/test-remaining-shim-parked-state-lock.mjs",
  "Preactivation suite remaining shim parked state guard entry",
);

console.log("remaining shim parked state lock guard passed");
