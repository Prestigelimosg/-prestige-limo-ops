import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-company-traveler-crm-write-readiness-preview-setup/route.ts";
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
const expectedEnabledFields = {
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
  const url = new URL("http://localhost/api/admin-company-traveler-crm-write-readiness-preview-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabled(value, label) {
  for (const [key, expected] of Object.entries(expectedEnabledFields)) {
    assert.equal(value[key], expected, `${label} must keep ${key} ${expected}.`);
  }
}

function assertReadiness(
  value,
  label,
  expectedMissingRequirements = ["admin_approval", "typed_write_api", "live_write_approval"],
) {
  assertDisabled(value, label);
  assert.equal(value.delivery_surface, "company_traveler_crm_write_readiness_setup_only");
  assert.equal(value.readiness_status, "blocked_pending_admin_review");
  assert.equal(value.status, "setup_only");
  assert.deepEqual(
    value.missing_requirements,
    expectedMissingRequirements,
    `${label} must require admin approval, typed API, and live-write approval.`,
  );
}

function assertPreview(value, label) {
  assertDisabled(value, label);
  assert.equal(value.delivery_surface, "company_traveler_crm_write_readiness_setup_only");
  assert.equal(value.readiness_status, "blocked_pending_admin_review");
  assert.equal(value.status, "setup_only");
  assert.deepEqual(value.planned_actions, expectedPlannedActions, `${label} must expose planned actions only.`);
}

function assertSetup(value, label) {
  assertDisabled(value, label);
  assert.equal(value.delivery_surface, "company_traveler_crm_write_readiness_setup_only");
  assert.equal(value.readiness_status, "blocked_pending_admin_review");
  assert.equal(value.status, "setup_only");
  assert.deepEqual(value.planned_actions, expectedPlannedActions, `${label} must expose planned actions only.`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-write-readiness-api-"));
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
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "buildAdminCompanyTravelerCrmWriteReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "company_traveler_crm_write_readiness_setup_only",
  "company_create",
  "company_update",
  "company_name_memory",
  "traveler_create",
  "traveler_update",
  "traveler_name_memory",
  "actionEnabled",
  "writeEnabled",
  "liveWriteEnabled",
  "adminReviewRequired",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing CRM write-readiness API fragment: ${fragment}`);
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

  assert.equal(anonymousResponse.status, 403, "CRM write-readiness preview API must stay admin-gated.");
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
  assertSetup(anonymous.setup, "Anonymous blocked setup");
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
    assert.equal(body.status, "setup_only");
    assert.equal(body.version, "admin-company-traveler-crm-write-readiness-setup-foundation-v1");
    assertDisabled(body, `${actionType} response`);
    assertPreview(body.preview, `${actionType} preview`);
    assertReadiness(body.readiness, `${actionType} readiness`);
    assertSetup(body.setup, `${actionType} setup`);
    assert.equal(body.preview.actionType, actionType);
    assert.equal(body.preview.action_type, actionType);
    assert.equal(body.setup.actionType, actionType);
    assert.equal(body.setup.action_type, actionType);
    assert.equal(
      body.preview.actionScope,
      actionType.startsWith("company_") ? "company" : "traveler",
      `${actionType} must expose the expected scope.`,
    );
    assertNoUnsafeOutput(body, `${actionType} response`);
  }

  const companyReadyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        actionType: "company create",
        companyName: "ACME Holdings",
        domain: "Example.COM",
        id: "42",
      }),
      { headers: adminHeaders() },
    ),
  );
  const companyReady = await companyReadyResponse.json();

  assert.equal(companyReadyResponse.status, 200);
  assert.equal(companyReady.preview.actionType, "company_create");
  assert.equal(companyReady.preview.company_fields.company_name, "ACME Holdings");
  assert.equal(companyReady.preview.company_fields.domain, "example.com");
  assert.equal(companyReady.preview.company_fields.id, 42);
  assert.equal(companyReady.preview.traveler_fields.id, null);
  assertDisabled(companyReady, "Company ready response");
  assertNoUnsafeOutput(companyReady, "Company ready response");

  const travelerReadyResponse = await harness.route.GET(
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
  const travelerReady = await travelerReadyResponse.json();

  assert.equal(travelerReadyResponse.status, 200);
  assert.equal(travelerReady.preview.actionType, "traveler_name_memory");
  assert.equal(travelerReady.preview.actionScope, "traveler");
  assert.equal(travelerReady.preview.company_fields.id, 88);
  assert.equal(travelerReady.preview.traveler_fields.id, 901);
  assert.equal(travelerReady.preview.traveler_fields.booker_email, "booker@example.com");
  assert.equal(travelerReady.preview.traveler_fields.default_pickup_address, "Changi Airport Terminal 3");
  assert.equal(travelerReady.preview.traveler_fields.default_dropoff_address, "Raffles Hotel Singapore");
  assertDisabled(travelerReady, "Traveler ready response");
  assertNoUnsafeOutput(travelerReady, "Traveler ready response");

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
  assert.equal(unsafe.preview.actionType, null);
  assert.equal(unsafe.preview.actionScope, null);
  assert.equal(unsafe.preview.company_fields.company_name, null);
  assert.equal(unsafe.preview.company_fields.domain, null);
  assert.equal(unsafe.preview.traveler_fields.default_address, null);
  assert.equal(unsafe.preview.traveler_fields.traveler_name, null);
  assertDisabled(unsafe, "Unsafe response");
  assertNoUnsafeOutput(unsafe, "Unsafe response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin company/traveler CRM write-readiness preview setup API contract passed");
