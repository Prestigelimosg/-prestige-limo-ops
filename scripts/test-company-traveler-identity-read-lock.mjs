import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const companiesRoutePath = "app/api/admin-companies-crm-identity/route.ts";
const travelersRoutePath = "app/api/admin-travelers-crm-identity/route.ts";
const companiesHelperPath = "lib/admin-companies-crm-identity.ts";
const travelersHelperPath = "lib/admin-travelers-crm-identity.ts";

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

function assertGetOnlyRoute(source, label) {
  assertIncludes(source, "export async function GET", label);
  assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, label);
}

const [
  ledger,
  appPage,
  legacyRoute,
  companiesRoute,
  travelersRoute,
  companiesHelper,
  travelersHelper,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(companiesRoutePath, "utf8"),
  readFile(travelersRoutePath, "utf8"),
  readFile(companiesHelperPath, "utf8"),
  readFile(travelersHelperPath, "utf8"),
]);

const lockSection = sectionBetween(ledger, "### Company/Traveler Identity Read Lock");

for (const phrase of [
  "Typed identity display wiring is done at `69c269d Wire company traveler identity display to typed APIs`.",
  "GET /api/admin-companies-crm-identity is company identity read/display only.",
  "GET /api/admin-travelers-crm-identity is traveler identity/default-address read/display only.",
  "Company/traveler display-read now uses existing typed identity APIs: `GET /api/admin-travelers-crm-identity` and `GET /api/admin-companies-crm-identity`.",
  "Traveler identity/default-address display uses the typed read path.",
  "Company identity display uses the typed read path when a safe `company_id` exists.",
  "Company/traveler create/update/name-memory writes remain parked.",
  "Rate override save/remove remains parked.",
  "`customer_rates`, `driver_payout_rules`, pricing, payout, rate snapshots, and payout snapshots remain excluded.",
  "Save Booking + CRM behavior was not changed.",
  "`/api/admin-saved-bookings` was not changed.",
  "No new shims were added.",
  "Remaining legacy company/traveler call sites are blocked because they mix rate/payout fields.",
  "Future work must split identity, CRM writes, customer rates, driver payout rules, and `rate_settings` into separate typed lanes.",
  "Checks passed for the typed identity display wiring:",
]) {
  assertIncludes(lockSection, phrase, `Company/traveler identity read lock phrase: ${phrase}`);
}

assertGetOnlyRoute(companiesRoute, "Companies CRM identity route");
assertGetOnlyRoute(travelersRoute, "Travelers CRM identity route");
assertIncludes(
  appPage,
  'const adminCompaniesCrmIdentityApiPath = "/api/admin-companies-crm-identity";',
  "App page typed companies identity path",
);
assertIncludes(
  appPage,
  'const adminTravelersCrmIdentityApiPath = "/api/admin-travelers-crm-identity";',
  "App page typed travelers identity path",
);

for (const [label, source] of [
  ["Companies CRM identity typed path", `${companiesRoute}\n${companiesHelper}`],
  ["Travelers CRM identity typed path", `${travelersRoute}\n${travelersHelper}`],
]) {
  assertIncludes(source, "readOnly: true", label);
  assertIncludes(source, "writeEnabled: false", label);
  assertIncludes(source, "external_send: false", label);
  assertExcludes(source, /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data/, label);
  assertExcludes(source, /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/, label);
}

assertIncludes(
  companiesHelper,
  '"id, company_name, domain, billing_address, main_phone, mobile_phone, website, primary_contact_name, billing_email, accounts_email, operations_email";',
  "Companies identity/contact safe select",
);
assertExcludes(
  companiesHelper.match(/const companyIdentitySelect\s*=\s*\n?\s*"([^"]+)";/)?.[1] ?? "",
  /customer_rates|driver_payout_rules|pricing|payout|payment|pdf|finance|internal_admin_note|admin_note/i,
  "Companies identity/contact safe select",
);

assertIncludes(
  travelersHelper,
  "id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email",
  "Travelers identity safe select",
);
assertIncludes(
  travelersHelper,
  "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at",
  "Travelers saved-address safe select",
);
for (const line of travelersHelper
  .split("\n")
  .filter((sourceLine) => sourceLine.includes("const travelerIdentitySelect") || sourceLine.includes("const savedAddressDisplaySelect"))) {
  assertExcludes(
    line,
    /customer_rates|driver_payout_rules|pricing|payout|payment|billing|pdf/i,
    "Travelers identity/default-address safe select",
  );
}

const lookupNameMemory = sliceBetween(
  appPage,
  "async function lookupNameMemory",
  "async function applyParsedBookingMessage",
);

assertIncludes(
  lookupNameMemory,
  "adminTravelersCrmIdentityApiPath",
  "App page company/traveler display-read lookup",
);
assertIncludes(
  lookupNameMemory,
  "adminCompaniesCrmIdentityApiPath",
  "App page company/traveler display-read lookup",
);
assertIncludes(lookupNameMemory, 'method: "GET"', "App page identity display-read lookup");
assertIncludes(
  lookupNameMemory,
  '"x-prestige-admin-purpose": adminLegacyDataPurpose',
  "App page identity display-read lookup",
);
assertExcludes(
  lookupNameMemory,
  /adminCustomerNameMemoryApiPath|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|customer_rates|driver_payout_rules|pricing|payout|payment|billing|pdf|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/i,
  "App page identity display-read lookup",
);

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

assertIncludes(saveRateOverride, "adminLegacyTables.companies", "Parked company legacy write");
assertIncludes(saveRateOverride, "adminLegacyTables.travelers", "Parked traveler legacy write");
assertIncludes(removeCompanyRateOverride, "adminLegacyTables.companies", "Parked company legacy remove");
assertIncludes(removeBossRateOverride, "adminLegacyTables.travelers", "Parked traveler legacy remove");

assertIncludes(legacyRoute, "companies: new Set", "Legacy route parked companies family");
assertIncludes(legacyRoute, "travelers: new Set", "Legacy route parked travelers family");
assertIncludes(legacyRoute, '"customer_rates"', "Legacy route parked customer_rates field");
assertIncludes(legacyRoute, '"driver_payout_rules"', "Legacy route parked driver_payout_rules field");

console.log("Company/traveler identity read lock guard passed.");
