import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(
    source.includes(fragment),
    true,
    `${label} must include ${fragment}.`,
  );
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

const [ledger, appPage, legacyRoute] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
]);
const planSection = sectionBetween(ledger, "### Rate Override Split/Gating Plan Lock");

for (const phrase of [
  "company/traveler display/read",
  "company/traveler create/update",
  "customer rate overrides",
  "driver payout rules",
  "pricing/payout behavior",
  "Company/traveler legacy writes remain parked.",
  "Rate override save/remove remains parked.",
  "`customer_rates` and `driver_payout_rules` remain excluded.",
  "Pricing/payout remains excluded.",
  "No implementation is approved by this plan.",
  "No UI/API behavior changes are approved by this plan.",
  "Required future tests before implementation:",
  "Hard blockers:",
  "Rollback plan:",
]) {
  assertIncludes(planSection, phrase, `Rate override split/gating plan phrase: ${phrase}`);
}

for (const blockedPath of [
  "live DB/write",
  "env",
  "deployment",
  "migration",
  "new shim",
  "payment",
  "PDF",
  "provider",
  "live sending",
]) {
  assertIncludes(planSection, blockedPath, `Rate override split/gating blocked path: ${blockedPath}`);
}

for (const requiredTest of [
  "`node scripts/test-admin-route-flow-lock.mjs`",
  "`node scripts/test-shim-cleanup-no-new-shim-guard.mjs`",
  "`node scripts/test-admin-companies-crm-identity-api-contract.mjs`",
  "`node scripts/test-admin-travelers-crm-identity-api-contract.mjs`",
  "`node scripts/test-admin-company-traveler-crm-write-no-live-guard.mjs`",
  "`node scripts/test-admin-rate-setup-api-contract.mjs`",
  "`node scripts/test-core-booking-persistence-safe-path-guard.mjs`",
  "`node scripts/test-preactivation-verification-suite.mjs`",
  "`npm run lint`",
  "`npm run test:booking-ui-browser`",
]) {
  assertIncludes(planSection, requiredTest, `Rate override split/gating required test: ${requiredTest}`);
}

const saveRateOverride = sliceBetween(
  appPage,
  "async function saveRateOverride",
  "async function removeCompanyRateOverride",
);
const removeCompanyRateOverride = sliceBetween(
  appPage,
  "async function removeCompanyRateOverride",
  "async function removeBookerRateOverride",
);
const removeBookerRateOverride = sliceBetween(
  appPage,
  "async function removeBookerRateOverride",
  "async function loadDrivers",
);

for (const [label, source] of [
  ["Parked rate override save", saveRateOverride],
  ["Parked company rate override remove", removeCompanyRateOverride],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
}

assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Parked company rate override save");
assertIncludes(saveRateOverride, "buildBookerCustomerRatesRuntimeWritePayload", "Customer Account rate override save");
assertExcludes(saveRateOverride, "adminLegacyTables.travelers", "Customer Account rate save must not target travellers");
assertIncludes(
  removeCompanyRateOverride,
  "adminLegacyTables.companies",
  "Parked company rate override remove",
);
assertIncludes(
  removeBookerRateOverride,
  "buildBookerCustomerRatesRuntimeWritePayload",
  "Customer Account rate override remove",
);
assertIncludes(removeBookerRateOverride, "saveCustomerRatesRuntime", "Customer Account rate override remove");
assertExcludes(removeBookerRateOverride, "adminLegacyDataClient", "Customer Account rate remove must not use legacy writes");
assertExcludes(removeBookerRateOverride, "adminLegacyTables.travelers", "Customer Account rate remove must not target travellers");
assertExcludes(removeBookerRateOverride, "driver_payout_rules", "Customer Account rate remove must preserve Company payout");

assertIncludes(legacyRoute, "companies: new Set", "Legacy route parked companies family");
assertIncludes(legacyRoute, "travelers: new Set", "Legacy route parked travelers family");
assertIncludes(legacyRoute, '"customer_rates"', "Legacy route parked customer_rates field");
assertIncludes(legacyRoute, '"driver_payout_rules"', "Legacy route parked driver_payout_rules field");
assertExcludes(legacyRoute, "bookings: new Set", "Legacy route must not re-add bookings shim family");

console.log("Rate override split/gating plan guard passed.");
