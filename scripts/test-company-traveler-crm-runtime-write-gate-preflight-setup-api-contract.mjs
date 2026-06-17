import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-company-traveler-crm-runtime-write-gate-preflight-setup/route.ts";
const helperPath = "lib/admin-company-traveler-crm-runtime-write-gate-preflight-setup.ts";
const contractHelperPath =
  "lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts";
const readinessHelperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const appPagePath = "app/page.tsx";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";

const routePathFragment = "/api/admin-company-traveler-crm-runtime-write-gate-preflight-setup";
const guardScript =
  "scripts/test-company-traveler-crm-runtime-write-gate-preflight-setup-api-contract.mjs";
const gateEnvName = "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";

const livePathPattern =
  /@supabase\/supabase-js|createClient|\.from\(|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(|fetch\s*\(|process\.env|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const routeLivePathPattern =
  /@supabase\/supabase-js|createClient|\.from\(|\.insert\s*\(|\.upsert\s*\(|\.update\s*\(|\.delete\s*\(|\.rpc\s*\(|rpc\s*\(|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeValuePattern =
  /customer_price|driver_payout_amount|paynow qr|internal admin note|parser debug payload|mock qa archive|raw token value|service role value/i;

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

async function writeTranspiled(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-runtime-preflight-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const relativePath of [readinessHelperPath, contractHelperPath, helperPath]) {
    await writeTranspiled(tempDir, relativePath);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
  };
}

function assertSetupOnly(value, label) {
  assert.equal(value.status, "setup_only", `${label} must stay setup-only.`);
  assert.equal(value.readiness_status, "blocked_pending_gate_opening_approval", `${label} must stay blocked.`);
  assert.equal(value.gateOpeningApproved, false, `${label} must not approve gate opening.`);
  assert.equal(value.gate_opening_approved, false, `${label} must not approve gate opening.`);
  assert.equal(value.gate_opening_status, "blocked", `${label} gate opening must stay blocked.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value.live_write_enabled, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value.databaseClientEnabled, false, `${label} must not enable DB client.`);
  assert.equal(value.database_client_enabled, false, `${label} must not enable DB client.`);
  assert.equal(value.env_values_visible, false, `${label} must not expose env values.`);
  assert.equal(value.external_send, false, `${label} must not enable external send.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only the CRM gate env name.`);
  assert.deepEqual(value.env_names, [gateEnvName, "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
  assert.deepEqual(value.allowed_company_fields, ["id", "company_name", "domain"]);
  assert.deepEqual(value.allowed_traveler_fields, [
    "id",
    "company_id",
    "traveler_name",
    "preferred_vehicle",
    "default_address",
    "default_pickup_address",
    "default_dropoff_address",
    "booker_name",
    "booker_contact",
    "booker_email",
  ]);
  assert.deepEqual(value.table_policy_requirements.companies.allowed_write_fields, [
    "company_name",
    "domain",
  ]);
  assert.deepEqual(value.table_policy_requirements.travelers.allowed_write_fields, [
    "company_id",
    "traveler_name",
    "preferred_vehicle",
    "default_address",
    "default_pickup_address",
    "default_dropoff_address",
    "booker_name",
    "booker_contact",
    "booker_email",
  ]);
  assert.equal(
    unsafeValuePattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose unsafe customer, driver, internal, parser, mock, token, or secret values.`,
  );
}

const [
  routeSource,
  helperSource,
  appPage,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  aiParseRoute,
  preactivationSuite,
  ledger,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Company/Traveler CRM Runtime Write Gate Preflight Setup Lock",
);

for (const phrase of [
  "Setup-only CRM runtime write gate preflight is added at `GET /api/admin-company-traveler-crm-runtime-write-gate-preflight-setup`.",
  "It is admin-gated, GET-only, setup-only, no-live, and no-op.",
  "It does not read or print env values; it lists env names only.",
  "It does not import Supabase, create a DB client, call `adminLegacyDataClient`, call `/api/admin-legacy-data`, or execute DB read/write.",
  "Gate opening remains blocked pending owner approval, env-name verification, `companies` and `travelers` table/policy verification, server-session admin/dispatcher verification, rollback/disable verification, and staging no-POST/write smoke.",
  "Allowed future CRM write fields remain company `company_name`/`domain` and traveler identity/contact/default-address fields only.",
  "Forbidden fields remain excluded: rate overrides, `customer_rates`, `driver_payout_rules`, pricing, payout, payment/PDF/billing, provider/send, auth, location/photo/calendar, internal/admin notes, debug, secrets, and tokens.",
  "No `app/page.tsx` runtime wiring, Save Booking + CRM change, `/api/admin-saved-bookings` change, parser change, UI sector/card, provider activation, live send, DB read/write, env change, deployment, migration, or new shim is included.",
]) {
  assertIncludes(ledgerSection, phrase, `CRM gate preflight ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation suite CRM gate preflight guard registration");

assertIncludes(routeSource, "export async function GET", "CRM preflight route GET");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "CRM preflight route admin boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "CRM preflight route purpose boundary");
assertIncludes(
  routeSource,
  "buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup",
  "CRM preflight route helper",
);
for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
  assertExcludes(routeSource, `export async function ${method}`, `CRM preflight route ${method}`);
}
assertExcludes(routeSource, routeLivePathPattern, "CRM preflight route live path");
assertExcludes(routeSource, "console.", "CRM preflight route console output");

assertIncludes(helperSource, "server-only", "CRM preflight helper server-only");
assertIncludes(helperSource, "buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup", "CRM preflight contract reuse");
assertIncludes(helperSource, gateEnvName, "CRM preflight env gate name");
assertIncludes(helperSource, "SUPABASE_URL", "CRM preflight Supabase URL env name");
assertIncludes(helperSource, "SUPABASE_SERVICE_ROLE_KEY", "CRM preflight service role env name");
assertIncludes(helperSource, "gateOpeningApproved: false", "CRM preflight gate blocked");
assertIncludes(helperSource, "writeEnabled: false", "CRM preflight write disabled");
assertIncludes(helperSource, "liveWriteEnabled: false", "CRM preflight live write disabled");
assertIncludes(helperSource, "databaseClientEnabled: false", "CRM preflight DB client disabled");
assertIncludes(helperSource, "env_values_visible: false", "CRM preflight env values hidden");
assertIncludes(helperSource, "no_op: true", "CRM preflight no-op");
assertExcludes(helperSource, livePathPattern, "CRM preflight helper live path");

for (const forbiddenValue of [
  "customer_price_amount",
  "driver_payout_amount",
  "paynow",
  "internal admin note",
  "parser debug payload",
  "mock qa archive",
]) {
  assertExcludes(helperSource, forbiddenValue, `CRM preflight helper forbidden value ${forbiddenValue}`);
}

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
  ["ai-parse route", aiParseRoute],
]) {
  assertExcludes(source, routePathFragment, `${label} CRM preflight route wiring`);
  assertExcludes(
    source,
    "buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup",
    `${label} CRM preflight helper import`,
  );
}

const harness = await loadHelper();

try {
  const { buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup } = harness.helper;
  const safeCompany = buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup({
    action_type: "company_create",
    company_name: "Acme Travel",
    domain: "acme.example",
  });
  const safeTraveler = buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup({
    action_type: "traveler_update",
    booker_email: "ops@example.com",
    company_id: 7,
    id: 12,
    traveler_name: "Ms Tan",
  });
  const unsafe = buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup({
    action_type: "traveler_update",
    customer_rates: [{ amount: 500 }],
    driver_payout_rules: [{ amount: 100 }],
    id: 12,
    pricing_source: "manual",
  });

  assertSetupOnly(safeCompany, "safe company preflight");
  assertSetupOnly(safeTraveler, "safe traveler preflight");
  assertSetupOnly(unsafe, "unsafe preflight");
  assert.equal(safeCompany.contract_ok, true, "Safe company contract may validate while gate remains blocked.");
  assert.equal(safeTraveler.contract_ok, true, "Safe traveler contract may validate while gate remains blocked.");
  assert.equal(unsafe.contract_ok, false, "Unsafe contract must not validate.");
  assert.ok(unsafe.rejected_fields.includes("customer_rates"), "Unsafe preflight must reject customer_rates.");
  assert.ok(unsafe.rejected_fields.includes("driver_payout_rules"), "Unsafe preflight must reject driver_payout_rules.");
  assert.ok(unsafe.rejected_fields.includes("pricing_source"), "Unsafe preflight must reject pricing_source.");
} finally {
  await harness.cleanup();
}

console.log("company/traveler CRM runtime write gate preflight setup API contract passed");
