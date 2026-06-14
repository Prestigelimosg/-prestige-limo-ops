import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const typedRouteFiles = [
  "app/api/admin-companies-crm-identity/route.ts",
  "app/api/admin-travelers-crm-identity/route.ts",
  "app/api/admin-driver-assignment-display/route.ts",
];
const typedHelperFiles = [
  "lib/admin-companies-crm-identity.ts",
  "lib/admin-travelers-crm-identity.ts",
  "lib/admin-driver-assignment-display.ts",
];
const typedContractTests = [
  "scripts/test-admin-companies-crm-identity-api-contract.mjs",
  "scripts/test-admin-travelers-crm-identity-api-contract.mjs",
  "scripts/test-admin-driver-assignment-display-api-contract.mjs",
];
const parkedRiskFiles = [
  "app/page.tsx",
  "app/api/admin-legacy-data/rest/v1/[table]/route.ts",
  "docs/current-implementation-ledger.md",
];
const expectedFiles = [...typedRouteFiles, ...typedHelperFiles, ...typedContractTests, ...parkedRiskFiles];
const noShimPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/;
const writeVerbPattern = /export async function (POST|PUT|PATCH|DELETE)/;
const unsafeDriverSelectPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_price|driver_payout|paynow|invoice|payment|pdf|payout|pricing|billing|commission|finance|internal_admin_note|admin_note|preferred_areas|airport_permit_notes/;

async function fileExists(file) {
  await access(file);
}

async function read(file) {
  return readFile(file, "utf8");
}

function assertIncludes(source, fragment, label) {
  assert.equal(source.includes(fragment), true, `${label} missing expected fragment: ${fragment}`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}`);
}

function assertGetOnlyRoute(source, label) {
  assertIncludes(source, "export async function GET", label);
  assertExcludes(source, writeVerbPattern, label);
}

for (const file of expectedFiles) {
  await fileExists(file);
}

const [
  companiesRoute,
  travelersRoute,
  driverAssignmentRoute,
  companiesHelper,
  travelersHelper,
  driverAssignmentHelper,
  companiesTest,
  travelersTest,
  driverAssignmentTest,
  appPage,
  legacyRoute,
  ledger,
] = await Promise.all([
  read("app/api/admin-companies-crm-identity/route.ts"),
  read("app/api/admin-travelers-crm-identity/route.ts"),
  read("app/api/admin-driver-assignment-display/route.ts"),
  read("lib/admin-companies-crm-identity.ts"),
  read("lib/admin-travelers-crm-identity.ts"),
  read("lib/admin-driver-assignment-display.ts"),
  read("scripts/test-admin-companies-crm-identity-api-contract.mjs"),
  read("scripts/test-admin-travelers-crm-identity-api-contract.mjs"),
  read("scripts/test-admin-driver-assignment-display-api-contract.mjs"),
  read("app/page.tsx"),
  read("app/api/admin-legacy-data/rest/v1/[table]/route.ts"),
  read("docs/current-implementation-ledger.md"),
]);

assertGetOnlyRoute(companiesRoute, "Companies CRM identity route");
assertGetOnlyRoute(travelersRoute, "Travelers CRM identity route");
assertGetOnlyRoute(driverAssignmentRoute, "Driver assignment display route");

for (const [label, source] of [
  ["Companies CRM identity typed path", `${companiesHelper}\n${companiesRoute}`],
  ["Travelers CRM identity typed path", `${travelersHelper}\n${travelersRoute}`],
  ["Driver assignment display typed path", `${driverAssignmentHelper}\n${driverAssignmentRoute}`],
]) {
  assertExcludes(source, noShimPattern, label);
  assertIncludes(source, "readOnly: true", label);
  assertIncludes(source, "writeEnabled: false", label);
  assertIncludes(source, "external_send: false", label);
}

assertIncludes(companiesRoute, "findAdminCompanyCrmIdentity", "Companies CRM identity route");
assertIncludes(companiesHelper, 'const companyIdentitySelect = "id, company_name, domain";', "Companies helper");
assertIncludes(companiesHelper, 'source: "typed_companies_crm_identity"', "Companies helper readiness");
assertIncludes(companiesTest, "selectedColumns: \"id, company_name, domain\"", "Companies typed API test");
assertIncludes(companiesTest, "Companies CRM identity route must remain read-only.", "Companies typed API test");

assertIncludes(travelersRoute, "findAdminTravelerCrmIdentity", "Travelers CRM identity route");
assertIncludes(
  travelersHelper,
  "id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email",
  "Travelers helper",
);
assertIncludes(
  travelersHelper,
  "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at",
  "Travelers saved-address helper",
);
assertIncludes(travelersHelper, 'source: "typed_travelers_crm_identity"', "Travelers helper readiness");
assertIncludes(appPage, 'const adminTravelersCrmIdentityApiPath = "/api/admin-travelers-crm-identity";', "App page");
assertIncludes(travelersTest, "adminTravelersCrmIdentityApiPath", "Travelers typed API test");
assertIncludes(
  travelersTest,
  "Safe traveler company-id lookup must not use the legacy travelers shim.",
  "Travelers typed API test",
);

assertIncludes(driverAssignmentRoute, "listAdminDriverAssignmentDisplay", "Driver assignment display route");
assertIncludes(
  driverAssignmentHelper,
  "id, driver_name, contact_number, vehicle_type, plate_number, availability_status",
  "Driver assignment helper",
);
assertIncludes(driverAssignmentHelper, 'source: "typed_driver_assignment_display"', "Driver assignment readiness");
assertIncludes(driverAssignmentHelper, "fullProfileWritePathParked: true", "Driver assignment readiness");
assertIncludes(driverAssignmentTest, "New typed driver assignment/display API must remain separate", "Driver assignment test");

const driverSelectLine = driverAssignmentHelper
  .split("\n")
  .find((line) => line.includes("id, driver_name, contact_number, vehicle_type, plate_number, availability_status"));
assert.ok(driverSelectLine, "Driver assignment helper must keep a safe select line.");
assertExcludes(driverSelectLine, unsafeDriverSelectPattern, "Driver assignment select line");

assertIncludes(
  ledger,
  "Remaining shim families found: `companies` CRM create plus rate/payout-dependent save/override paths; `travelers` CRM/name-memory create/update plus traveler rate override writes; `rate_settings` default-rate upsert; full `drivers` read/profile save/delete.",
  "Shim cleanup inventory",
);
assertIncludes(
  ledger,
  "`admin-companies-crm-identity` covers read-only companies id/company_name/domain lookup without rate/payout fields",
  "Shim cleanup inventory",
);
assertIncludes(
  ledger,
  "`admin-travelers-crm-identity` covers read-only travelers id/company_id/name/contact/default-address/saved-address display lookup without rate/payout fields",
  "Shim cleanup inventory",
);
assertIncludes(
  ledger,
  "`admin-driver-assignment-display` covers read-only driver id/name/contact/vehicle/plate/availability assignment/display lookup without payout/rate/pricing/billing/internal-note fields",
  "Shim cleanup inventory",
);
assertIncludes(
  ledger,
  "Full driver profile write/delete path must stay parked until explicit split/gating approval.",
  "Full driver profile risk lock",
);
assertIncludes(
  ledger,
  "Do not replace `saveDefaultRates` or the `rate_settings` write path without explicit approval.",
  "Rate settings risk lock",
);
assertIncludes(
  ledger,
  "Do not touch company/traveler overrides, pricing, payout, `customer_rates`, or `driver_payout_rules` in the same pass.",
  "Rate settings risk lock",
);
assertIncludes(
  ledger,
  "Rule: no new shims. Replace remaining shim usage only with typed helpers, typed API routes, and direct contract tests.",
  "Shim cleanup inventory",
);

assertIncludes(appPage, "async function loadDrivers", "Parked full driver profile path");
assertIncludes(
  appPage,
  '.select("id, driver_name, contact_number, vehicle_type, plate_number, payout_preferences, driver_payout_rules, availability_status, notes, preferred_areas, airport_permit_notes")',
  "Parked full driver profile load",
);
assertIncludes(appPage, "async function saveDriverProfile", "Parked full driver profile save");
assertIncludes(appPage, "payout_preferences: clean(driverProfileDraft.payoutPreferences) || null", "Parked driver payout preferences save");
assertIncludes(appPage, "driver_payout_rules: driverProfileDraft.payoutRules", "Parked driver payout rules save");
assertIncludes(appPage, "async function deleteDriverProfile", "Parked full driver profile delete");

assertIncludes(appPage, "async function saveDefaultRates", "Parked rate_settings save");
assertIncludes(appPage, ".from(adminLegacyTables.rateSettings)", "Parked rate_settings legacy upsert");
assertIncludes(appPage, "customer_rates: customerRates", "Parked customer rate defaults");
assertIncludes(appPage, "driver_payout_rules: driverPayoutRules", "Parked driver payout defaults");

assertIncludes(legacyRoute, "rate_settings: new Set", "Legacy route parked rate_settings allowlist");
assertIncludes(legacyRoute, "drivers: new Set", "Legacy route parked drivers allowlist");
for (const fragment of [
  '"payout_preferences"',
  '"driver_payout_rules"',
  '"notes"',
  '"preferred_areas"',
  '"airport_permit_notes"',
]) {
  assertIncludes(legacyRoute, fragment, "Legacy drivers route parked risk");
}

const typedPathSource = [
  companiesHelper,
  companiesRoute,
  travelersHelper,
  travelersRoute,
  driverAssignmentHelper,
  driverAssignmentRoute,
].join("\n");
assertExcludes(typedPathSource, /export async function (POST|PUT|PATCH|DELETE)/, "Typed replacement paths");
assertExcludes(typedPathSource, /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/, "Typed replacement paths");
assertExcludes(typedPathSource, /\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(/, "Typed replacement paths");

console.log("shim cleanup no-new-shim guard passed");
