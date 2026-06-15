import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts";
const readinessHelperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const routePath =
  "app/api/admin-company-traveler-crm-identity-contact-write-contract-setup/route.ts";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const sourceFiles = [helperPath, readinessHelperPath, boundaryPath, routePath];
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const setupApiPath = "/api/admin-company-traveler-crm-identity-contact-write-contract-setup";
const setupApiName = "admin-company-traveler-crm-identity-contact-write-contract-setup";
const forbiddenFields = [
  "customer_rates",
  "driver_payout_rules",
  "pricing_source",
  "driver_payout_amount",
  "surcharge_amount",
  "payment_link",
  "pdf_url",
  "billing_account",
  "provider_send",
  "auth_session",
  "live_location_url",
  "photo_proof",
  "calendar_event_id",
  "internal_admin_notes",
  "debug_payload",
];
const noLiveSourcePattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|sendMail\s*\(|sendMessage\s*\(|sendSms\s*\(|messages\.create|paymentIntent|checkout\.sessions|calendar\.events|storage\.from|legacy_shim|shim\s*\(/i;
const forbiddenRuntimeFieldsPattern =
  /customer_rates|driver_payout_rules|pricing_source|driver_payout_amount|surcharge_amount|payment_link|pdf_url|billing_account|provider_send|auth_session|live_location_url|photo_proof|calendar_event_id|internal_admin_notes|debug_payload/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);

  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);

  const end = source.indexOf(endMarker, start + startMarker.length);

  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeMockModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-identity-contact-write-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL(`http://localhost${setupApiPath}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabledContract(value, label) {
  assert.equal(value.actionEnabled, false, `${label} must keep actionEnabled false.`);
  assert.equal(value.action_enabled, false, `${label} must keep action_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(value.admin_review_required, true, `${label} must require admin review.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
}

function assertValidBlockedContract(value, label) {
  assert.equal(value.ok, true, `${label} must be a valid setup contract.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked/no-write.`);
  assert.equal(value.reason, "setup_only_no_write", `${label} must keep setup-only no-write reason.`);
  assert.equal(value.contractReady, true, `${label} must be contract ready.`);
  assert.equal(value.contract_ready, true, `${label} must keep snake_case contract ready.`);
  assert.deepEqual(value.forbidden_fields_present, [], `${label} must have no forbidden fields.`);
  assert.deepEqual(value.unknown_fields, [], `${label} must have no unknown fields.`);
  assert.deepEqual(value.invalid_fields, [], `${label} must have no invalid fields.`);
  assert.deepEqual(value.rejected_fields, [], `${label} must have no rejected fields.`);
  assertDisabledContract(value, label);
}

function assertRejectedContract(value, expectedFields, label) {
  assert.equal(value.ok, false, `${label} must be rejected.`);
  assert.equal(value.status, "rejected", `${label} must use rejected status.`);
  assert.equal(value.reason, "unsafe_or_unknown_fields", `${label} must reject unsafe/unknown fields.`);
  assert.equal(value.contractReady, false, `${label} must not be contract ready.`);
  assertDisabledContract(value, label);

  for (const expectedField of expectedFields) {
    assert.ok(
      value.rejected_fields.includes(expectedField),
      `${label} must reject ${expectedField}.`,
    );
  }
}

const [helperSource, routeSource, appPage, legacyRoute, preactivationSuite] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(legacyRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(helperSource, "server-only", "CRM identity/contact write contract helper");
assertIncludes(
  helperSource,
  "adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion",
  "CRM identity/contact write contract helper",
);
assertIncludes(routeSource, "export async function GET", "CRM identity/contact write contract route");
assertExcludes(
  routeSource,
  /export async function (POST|PUT|PATCH|DELETE)/,
  "CRM identity/contact write contract route",
);
assertExcludes(`${helperSource}\n${routeSource}`, noLiveSourcePattern, "CRM identity/contact write contract");
assertExcludes(
  helperSource,
  /process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY/i,
  "CRM identity/contact write contract helper",
);
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "CRM identity/contact write contract route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "CRM identity/contact write contract route");
assertIncludes(
  preactivationSuite,
  "scripts/test-admin-company-traveler-crm-identity-contact-write-contract.mjs",
  "Preactivation suite CRM identity/contact write contract entry",
);

for (const fragment of [
  "customer_rates",
  "driver_payout_rules",
  "driver_payout",
  "pricing_source",
  "surcharge",
  "payment",
  "pdf",
  "billing",
  "provider",
  "auth",
  "live_location",
  "photo",
  "calendar",
  "internal",
  "debug",
]) {
  assertIncludes(helperSource, fragment, `Forbidden field contract coverage ${fragment}`);
}

assertExcludes(appPage, setupApiName, "App page must not wire CRM identity/contact write contract API");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe route");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM safe route");

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

assertIncludes(legacyRoute, "companies: new Set", "Legacy companies write family remains parked");
assertIncludes(legacyRoute, "travelers: new Set", "Legacy travelers write family remains parked");
assertIncludes(legacyRoute, '"customer_rates"', "Legacy customer rates remain parked");
assertIncludes(legacyRoute, '"driver_payout_rules"', "Legacy driver payout rules remain parked");

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup } = harness.helper;
  const companyContract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({
    action_type: "company_create",
    company_name: "ACME Holdings",
    domain: "Example.COM",
  });

  assertValidBlockedContract(companyContract, "Company create contract");
  assert.equal(companyContract.actionType, "company_create");
  assert.equal(companyContract.actionScope, "company");
  assert.equal(companyContract.company_fields.company_name, "ACME Holdings");
  assert.equal(companyContract.company_fields.domain, "example.com");
  assert.equal(forbiddenRuntimeFieldsPattern.test(JSON.stringify(companyContract)), false);

  const travelerContract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({
    actionType: "traveler update",
    bookerContact: "+65 8123 4567",
    bookerEmail: "Booker@Example.com",
    bookerName: "Ops Booker",
    companyId: 42,
    defaultDropoffAddress: "Raffles Hotel Singapore",
    defaultPickupAddress: "Changi Airport Terminal 3",
    preferredVehicle: "Vellfire",
    travelerId: 901,
    travelerName: "Safe Traveler",
  });

  assertValidBlockedContract(travelerContract, "Traveler update contract");
  assert.equal(travelerContract.actionType, "traveler_update");
  assert.equal(travelerContract.actionScope, "traveler");
  assert.equal(travelerContract.traveler_fields.booker_email, "booker@example.com");
  assert.equal(travelerContract.traveler_fields.id, 901);
  assert.equal(forbiddenRuntimeFieldsPattern.test(JSON.stringify(travelerContract)), false);

  const forbiddenContract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({
    action_type: "company_create",
    company_name: "Safe Company",
    customer_rates: "{}",
    driver_payout_rules: "{}",
    pricing_source: "manual",
    driver_payout_amount: "75",
    surcharge_amount: "20",
    payment_link: "https://pay.example.invalid",
    pdf_url: "https://pdf.example.invalid",
    billing_account: "finance",
    provider_send: "email",
    auth_session: "token",
    live_location_url: "https://map.example.invalid",
    photo_proof: "image",
    calendar_event_id: "calendar",
    internal_admin_notes: "hidden",
    debug_payload: "debug",
  });

  assertRejectedContract(forbiddenContract, forbiddenFields, "Forbidden field contract");
  assert.deepEqual(forbiddenContract.unknown_fields, []);

  const unknownContract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({
    action_type: "company_create",
    company_name: "Safe Company",
    favorite_color: "blue",
  });

  assertRejectedContract(unknownContract, ["favorite_color"], "Unknown field contract");
  assert.deepEqual(unknownContract.forbidden_fields_present, []);

  const unsafeValueContract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({
    action_type: "traveler_create",
    traveler_name: "Driver payout debug traveler",
  });

  assertRejectedContract(unsafeValueContract, ["traveler_name"], "Unsafe value contract");
  assert.deepEqual(unsafeValueContract.forbidden_fields_present, []);

  const missingContract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup({
    company_name: "Safe Company",
  });

  assert.equal(missingContract.ok, false);
  assert.equal(missingContract.reason, "missing_required_fields");
  assert.ok(missingContract.missing_requirements.includes("action_type"));
  assertDisabledContract(missingContract, "Missing action contract");

  const routeSuccess = await harness.route.GET(
    new Request(
      apiUrl({
        action_type: "traveler_create",
        booker_email: "Booker@Example.com",
        booker_name: "Ops Booker",
        company_id: "42",
        default_pickup_address: "Changi Airport Terminal 3",
        traveler_name: "Safe Traveler",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeSuccessBody = await routeSuccess.json();

  assert.equal(routeSuccess.status, 200);
  assert.equal(routeSuccessBody.ok, true);
  assert.equal(routeSuccessBody.status, "blocked");
  assert.equal(routeSuccessBody.contract.actionType, "traveler_create");
  assertValidBlockedContract(routeSuccessBody.contract, "Route traveler create contract");

  const routeForbidden = await harness.route.GET(
    new Request(
      apiUrl({
        action_type: "company_create",
        company_name: "Safe Company",
        customer_rates: "{}",
        driver_payout_rules: "{}",
        pricing_source: "manual",
      }),
      { headers: adminHeaders() },
    ),
  );
  const routeForbiddenBody = await routeForbidden.json();

  assert.equal(routeForbidden.status, 400);
  assert.equal(routeForbiddenBody.ok, false);
  assert.equal(routeForbiddenBody.status, "rejected");
  assertRejectedContract(
    routeForbiddenBody.contract,
    ["customer_rates", "driver_payout_rules", "pricing_source"],
    "Route forbidden contract",
  );

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymousBody = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403);
  assert.equal(anonymousBody.ok, false);
  assert.equal(anonymousBody.status, "blocked");
  assert.equal(anonymousBody.error, routeBlockedMessage);
  assertDisabledContract(anonymousBody.contract, "Anonymous route fallback contract");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin company/traveler CRM identity/contact write contract passed");
