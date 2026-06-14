import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-company-traveler-crm-write-action-disabled-setup/route.ts";
const previewRoutePath = "app/api/admin-company-traveler-crm-write-readiness-preview-setup/route.ts";
const helperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const safeOutputLeakPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|internal_admin|parser_debug|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const expectedPlannedActions = {
  company_create: "planned_only",
  company_name_memory: "planned_only",
  company_update: "planned_only",
  traveler_create: "planned_only",
  traveler_name_memory: "planned_only",
  traveler_update: "planned_only",
};
const expectedDisabledFields = {
  actionEnabled: false,
  action_enabled: false,
  adminReviewRequired: true,
  admin_review_required: true,
  companyCreateEnabled: false,
  companyUpdateEnabled: false,
  company_create_enabled: false,
  company_update_enabled: false,
  external_send: false,
  liveWriteEnabled: false,
  live_write_enabled: false,
  nameMemoryWriteEnabled: false,
  name_memory_write_enabled: false,
  travelerCreateEnabled: false,
  travelerUpdateEnabled: false,
  traveler_create_enabled: false,
  traveler_update_enabled: false,
  writeEnabled: false,
  write_enabled: false,
};
const expectedSetupOnlyDisabled = {
  actionEnabled: false,
  action_enabled: false,
  adminReviewRequired: true,
  admin_review_required: true,
  external_send: false,
  liveWriteEnabled: false,
  live_write_enabled: false,
  writeEnabled: false,
  write_enabled: false,
};
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

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-company-traveler-crm-write-action-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertFields(value, fields, label) {
  for (const [key, expected] of Object.entries(fields)) {
    assert.equal(value[key], expected, `${label} must keep ${key} ${expected}.`);
  }
}

function assertDisabled(value, label) {
  assertFields(value, expectedDisabledFields, label);
}

function assertSetupDisabled(value, label) {
  assertFields(value, expectedSetupOnlyDisabled, label);
}

function assertPreview(value, label) {
  assertDisabled(value, label);
  assert.equal(value.delivery_surface, "company_traveler_crm_write_action_disabled_setup_only");
  assert.equal(value.preview_readiness_source, "admin-company-traveler-crm-write-readiness-preview-setup");
  assert.equal(value.readiness_status, "blocked_pending_admin_review");
  assert.equal(value.status, "blocked");
  assert.deepEqual(value.planned_actions, expectedPlannedActions, `${label} must keep actions planned only.`);
}

function assertReadiness(
  value,
  label,
  expectedMissingRequirements = ["admin_approval", "typed_write_api", "live_write_approval"],
) {
  assertDisabled(value, label);
  assert.equal(value.delivery_surface, "company_traveler_crm_write_action_disabled_setup_only");
  assert.equal(value.preview_readiness_source, "admin-company-traveler-crm-write-readiness-preview-setup");
  assert.equal(value.readiness_status, "blocked_pending_admin_review");
  assert.equal(value.status, "blocked");
  assert.deepEqual(value.missing_requirements, expectedMissingRequirements);
}

function assertResult(value, label) {
  assertDisabled(value, label);
  assert.equal(value.delivery_surface, "company_traveler_crm_write_action_disabled_setup_only");
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.preview_readiness_source, "admin-company-traveler-crm-write-readiness-preview-setup");
  assert.equal(value.reason, "setup_only_disabled");
  assert.equal(value.result_label, "blocked/no-op");
  assert.equal(value.status, "blocked");
  assert.equal(value.company.companyCreateEnabled, false);
  assert.equal(value.company.companyUpdateEnabled, false);
  assert.equal(value.company.nameMemoryWriteEnabled, false);
  assert.equal(value.company.status, "blocked");
  assert.equal(value.traveler.travelerCreateEnabled, false);
  assert.equal(value.traveler.travelerUpdateEnabled, false);
  assert.equal(value.traveler.nameMemoryWriteEnabled, false);
  assert.equal(value.traveler.status, "blocked");
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose rate override, payment, billing, payout, finance, parser, mock, token, or secret text.`,
  );
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-write-action-disabled-api-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");
const previewRouteSource = await readFile(previewRoutePath, "utf8");
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${previewRouteSource}\n${helperSource}`;

for (const fragment of [
  "buildAdminCompanyTravelerCrmWriteReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "admin-company-traveler-crm-write-readiness-preview-setup",
  "company_traveler_crm_write_action_disabled_setup_only",
  "companyCreateEnabled",
  "companyUpdateEnabled",
  "travelerCreateEnabled",
  "travelerUpdateEnabled",
  "nameMemoryWriteEnabled",
  "actionEnabled",
  "writeEnabled",
  "liveWriteEnabled",
  "adminReviewRequired",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled CRM write action API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  ".from(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "@supabase/supabase-js",
  "stripe",
  "paymentIntent",
  "checkout.sessions",
  "generatePdf",
  "pdfkit",
  "PDFDocument",
  "sendInvoice",
  "sendMail(",
  "payoutTransfer",
  "paynowTransfer",
  "legacy_shim",
  "shim(",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled CRM write action API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertDisabled(anonymous, "Anonymous blocked response");
  assertPreview(anonymous.preview, "Anonymous blocked preview");
  assertReadiness(anonymous.readiness, "Anonymous blocked readiness", [
    "action_type",
    "admin_approval",
    "typed_write_api",
    "live_write_approval",
  ]);
  assertResult(anonymous.result, "Anonymous blocked result");
  assertSetupDisabled(anonymous.setup, "Anonymous blocked setup");
  assert.deepEqual(anonymous.setup.missing_requirements, [
    "action_type",
    "admin_approval",
    "typed_write_api",
    "live_write_approval",
  ]);
  assertNoUnsafeOutput(anonymous, "Anonymous blocked response");

  for (const actionType of Object.keys(expectedPlannedActions)) {
    const response = await harness.route.GET(
      new Request(apiUrl({ action_type: actionType }), { headers: adminHeaders() }),
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.status, "blocked");
    assert.equal(body.version, "admin-company-traveler-crm-write-readiness-setup-foundation-v1");
    assertDisabled(body, `${actionType} response`);
    assertPreview(body.preview, `${actionType} preview`);
    assertReadiness(body.readiness, `${actionType} readiness`);
    assertResult(body.result, `${actionType} result`);
    assertSetupDisabled(body.setup, `${actionType} setup`);
    assert.equal(body.result.actionType, actionType);
    assert.equal(body.result.action_type, actionType);
    assert.equal(body.setup.actionType, actionType);
    assert.equal(body.setup.action_type, actionType);
    assert.equal(
      body.result.actionScope,
      actionType.startsWith("company_") ? "company" : "traveler",
      `${actionType} must expose the expected scope.`,
    );
    assertNoUnsafeOutput(body, `${actionType} response`);
  }

  const companyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        action: "company create",
        companyName: "ACME Holdings",
        domain: "Example.COM",
        id: "42",
      }),
      { headers: adminHeaders() },
    ),
  );
  const company = await companyResponse.json();

  assert.equal(companyResponse.status, 200);
  assert.equal(company.result.actionType, "company_create");
  assert.equal(company.result.company_fields.company_name, "ACME Holdings");
  assert.equal(company.result.company_fields.domain, "example.com");
  assert.equal(company.result.company_fields.id, 42);
  assert.equal(company.result.traveler_fields.id, null);
  assertDisabled(company, "Company disabled response");
  assertResult(company.result, "Company disabled result");
  assertNoUnsafeOutput(company, "Company disabled response");

  const travelerResponse = await harness.route.GET(
    new Request(
      apiUrl({
        action_type: "remember traveler name memory",
        bookerContact: "+65 8123 4567",
        bookerEmail: "Booker@Example.com",
        bookerName: "Ops Booker",
        company_id: "88",
        defaultDropoffAddress: "Raffles Hotel Singapore",
        defaultPickupAddress: "Changi Airport Terminal 3",
        preferredVehicle: "Vellfire",
        travelerName: "Safe Traveler",
        traveler_id: "901",
      }),
      { headers: adminHeaders() },
    ),
  );
  const traveler = await travelerResponse.json();

  assert.equal(travelerResponse.status, 200);
  assert.equal(traveler.result.actionType, "traveler_name_memory");
  assert.equal(traveler.result.actionScope, "traveler");
  assert.equal(traveler.result.company_fields.id, 88);
  assert.equal(traveler.result.traveler_fields.id, 901);
  assert.equal(traveler.result.traveler_fields.booker_email, "booker@example.com");
  assert.equal(traveler.result.traveler_fields.default_pickup_address, "Changi Airport Terminal 3");
  assert.equal(traveler.result.traveler_fields.default_dropoff_address, "Raffles Hotel Singapore");
  assertDisabled(traveler, "Traveler disabled response");
  assertResult(traveler.result, "Traveler disabled result");
  assertNoUnsafeOutput(traveler, "Traveler disabled response");

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        actionType: "payment token update",
        bookerEmail: "not-an-email",
        companyName: "driver_payout secret account",
        defaultAddress: "internal_admin_note address",
        domain: "paynow.example.com",
        travelerName: "pricing debug traveler",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafe.status, "blocked");
  assert.equal(unsafe.result.actionType, null);
  assert.equal(unsafe.result.actionScope, null);
  assert.equal(unsafe.result.company_fields.company_name, null);
  assert.equal(unsafe.result.company_fields.domain, null);
  assert.equal(unsafe.result.traveler_fields.default_address, null);
  assert.equal(unsafe.result.traveler_fields.traveler_name, null);
  assertDisabled(unsafe, "Unsafe disabled response");
  assertResult(unsafe.result, "Unsafe disabled result");
  assertNoUnsafeOutput(unsafe, "Unsafe disabled response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin company/traveler CRM write action disabled setup API contract passed");
