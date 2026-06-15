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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);

  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [ledger, appPage, legacyRoute, preactivationSuite] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const planSection = sectionBetween(ledger, "### Company/Traveler CRM Write Split Plan Lock");

for (const phrase of [
  "Company/traveler identity display is already typed through `GET /api/admin-companies-crm-identity` and `GET /api/admin-travelers-crm-identity`.",
  "Company/traveler writes remain parked.",
  "Future company/traveler CRM write API must exclude:",
  "`customer_rates`",
  "`driver_payout_rules`",
  "pricing",
  "payout",
  "rate overrides",
  "surcharge/payout fields",
  "`pricing_source`",
  "payout snapshots",
  "Rate override save/remove remains separate and parked.",
  "Future implementation must be one lane only: company/traveler CRM identity/contact write fields.",
  "Required direct contract tests before implementation:",
  "Required no-live guard:",
  "Rollback/manual recovery note:",
  "No UI expansion is approved; keep the existing compact CRM area.",
  "No runtime implementation is approved by this plan.",
]) {
  assertIncludes(planSection, phrase, `Company/traveler CRM write split plan phrase: ${phrase}`);
}

for (const blockedPath of [
  "DB/write",
  "env change",
  "deployment",
  "migration",
  "provider/live sending",
  "payment",
  "PDF",
  "payout",
  "auth",
  "location",
  "photo",
  "calendar",
  "new shim",
]) {
  assertIncludes(planSection, blockedPath, `Company/traveler CRM write split blocked path: ${blockedPath}`);
}

for (const requiredTestPhrase of [
  "typed helper contract for allowed company/traveler CRM identity/contact write fields",
  "GET/POST method contract for the new typed route",
  "forbidden-field rejection for `customer_rates`, `driver_payout_rules`, pricing, payout, rate overrides, surcharge/payout fields, `pricing_source`, payout snapshots",
  "no legacy shim usage in the typed write path",
]) {
  assertIncludes(planSection, requiredTestPhrase, `Company/traveler CRM write split required test: ${requiredTestPhrase}`);
}

for (const typedReadPath of [
  'const adminCompaniesCrmIdentityApiPath = "/api/admin-companies-crm-identity";',
  'const adminTravelersCrmIdentityApiPath = "/api/admin-travelers-crm-identity";',
]) {
  assertIncludes(appPage, typedReadPath, `Existing company/traveler typed read path ${typedReadPath}`);
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

for (const [label, source] of [
  ["Parked rate override save", saveRateOverride],
  ["Parked company rate override remove", removeCompanyRateOverride],
  ["Parked boss/name rate override remove", removeBossRateOverride],
]) {
  assertIncludes(source, "adminLegacyDataClient", label);
  assertIncludes(source, "customer_rates", label);
  assertIncludes(source, "driver_payout_rules", label);
}

assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Parked company legacy write path");
assertIncludes(saveRateOverride, "adminLegacyTables.travelers", "Parked traveler legacy write path");
assertIncludes(
  removeCompanyRateOverride,
  "adminLegacyTables.companies",
  "Parked company legacy remove path",
);
assertIncludes(
  removeBossRateOverride,
  "adminLegacyTables.travelers",
  "Parked traveler legacy remove path",
);

for (const fragment of [
  "companies: new Set",
  "travelers: new Set",
  '"customer_rates"',
  '"driver_payout_rules"',
]) {
  assertIncludes(legacyRoute, fragment, `Legacy route parked company/traveler write fragment ${fragment}`);
}

assertExcludes(
  planSection,
  /approved implementation scope:|safe to implement now|runtime implementation approved/i,
  "Company/traveler CRM write split plan",
);
assertIncludes(
  preactivationSuite,
  "scripts/test-company-traveler-crm-write-split-plan.mjs",
  "Preactivation suite company/traveler CRM write split plan guard entry",
);

console.log("company/traveler CRM write split plan guard passed");
