import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-company-traveler-crm-write-action-audit-payload-setup-foundation.ts";
const readinessHelperPath = "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts";
const disabledActionRoutePath = "app/api/admin-company-traveler-crm-write-action-disabled-setup/route.ts";
const sourceFiles = [
  helperPath,
  readinessHelperPath,
  disabledActionRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const disabledActionSource = "admin-company-traveler-crm-write-action-disabled-setup";
const previewReadinessSource = "admin-company-traveler-crm-write-readiness-preview-setup";
const expectedBlockedNoOpResult = {
  actionEnabled: false,
  adminReviewRequired: true,
  companyCreateEnabled: false,
  companyUpdateEnabled: false,
  external_send: false,
  liveWriteEnabled: false,
  nameMemoryWriteEnabled: false,
  no_op: true,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  status: "blocked",
  travelerCreateEnabled: false,
  travelerUpdateEnabled: false,
  writeEnabled: false,
};
const expectedDisabledFlags = {
  actionEnabled: false,
  action_enabled: false,
  adminReviewRequired: true,
  admin_review_required: true,
  auditWriteEnabled: false,
  audit_write_enabled: false,
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
const unsafeOutputPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|internal_admin|parser_debug|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const helperSource = await readFile(helperPath, "utf8");
const readinessHelperSource = await readFile(readinessHelperPath, "utf8");
const helperAndReadinessSource = `${helperSource}\n${readinessHelperSource}`;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

assert.equal(helperSource.includes("server-only"), true, "CRM write action audit helper must stay server-only.");
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource),
  false,
  "CRM write action audit helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(
    helperSource,
  ),
  false,
  "CRM write action audit helper must not read env/provider secrets.",
);
assert.equal(
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun)["']|require\(\s*["'](?:@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun)["']\s*\)/i.test(
    helperSource,
  ),
  false,
  "CRM write action audit helper must not import DB, payment, PDF, browser, or sending SDKs.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(
    helperSource,
  ),
  false,
  "CRM write action audit helper must not use DB reads or writes.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(/i.test(helperSource),
  false,
  "CRM write action audit helper must not use network APIs.",
);
assert.equal(
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|payment|billing|invoice|pdf|paynow|pay_now/i.test(
    helperSource,
  ),
  false,
  "CRM write action audit helper must not include parked finance, rate, or billing fields.",
);
assert.equal(/legacy_shim|shim\s*\(/i.test(helperSource), false, "CRM write action audit helper must not introduce shims.");

for (const fragment of [
  "buildAdminCompanyTravelerCrmWriteReadinessSetup",
  disabledActionSource,
  previewReadinessSource,
  "company_traveler_crm_write_action_audit_payload_setup_only",
  "adminCompanyTravelerCrmWriteActionAuditPayloadSetupFoundationVersion",
  "buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup",
  "company_create",
  "company_update",
  "company_name_memory",
  "traveler_create",
  "traveler_update",
  "traveler_name_memory",
  "actionType",
  "entityType",
  "actionSource",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "actionEnabled: false",
  "writeEnabled: false",
  "liveWriteEnabled: false",
  "adminReviewRequired: true",
  "companyCreateEnabled: false",
  "companyUpdateEnabled: false",
  "travelerCreateEnabled: false",
  "travelerUpdateEnabled: false",
  "nameMemoryWriteEnabled: false",
  "external_send: false",
]) {
  assert.ok(
    helperAndReadinessSource.includes(fragment),
    `Missing CRM write action audit setup fragment: ${fragment}`,
  );
}

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

function disabledApiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-company-traveler-crm-write-action-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabledFlags(value, label) {
  for (const [key, expected] of Object.entries(expectedDisabledFlags)) {
    assert.equal(value[key], expected, `${label} must keep ${key} ${expected}.`);
  }
}

function assertBlockedNoOp(value, label) {
  assert.deepEqual(value, expectedBlockedNoOpResult, `${label} must stay blocked/no-op.`);
}

function assertAuditPayload(value, label) {
  assertDisabledFlags(value, label);
  assert.equal(value.preview_readiness_source, previewReadinessSource, `${label} must identify preview source.`);
  assert.equal(value.disabled_action_source, disabledActionSource, `${label} must identify disabled action source.`);
  assertBlockedNoOp(value.blocked_no_op_result, `${label} blocked_no_op_result`);
  assertBlockedNoOp(value.result, `${label} result`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose rate, payout, payment, billing, finance, parser, mock, token, or secret text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-write-action-audit-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledActionRoute: requireFromHarness(
      path.join(tempDir, disabledActionRoutePath.replace(/\.ts$/, ".js")),
    ),
    readiness: requireFromHarness(path.join(tempDir, readinessHelperPath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup } = harness.audit;
  const { buildAdminCompanyTravelerCrmWriteReadinessSetup } = harness.readiness;

  for (const actionType of [
    "company_create",
    "company_update",
    "company_name_memory",
    "traveler_create",
    "traveler_update",
    "traveler_name_memory",
  ]) {
    const response = await harness.disabledActionRoute.GET(
      new Request(disabledApiUrl({ action_type: actionType }), { headers: adminHeaders() }),
    );
    const disabled = await response.json();
    const setup = buildAdminCompanyTravelerCrmWriteReadinessSetup({ action_type: actionType });
    const audit = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
      actionSource: "disabled-action-api",
      disabledAction: disabled.result,
      setup,
    });

    assert.equal(response.status, 200);
    assert.equal(audit.status, "setup_only");
    assert.equal(audit.actionType, actionType);
    assert.equal(audit.action_type, actionType);
    assert.equal(audit.actionSource, "disabled_action_api");
    assert.equal(audit.action_source, "disabled_action_api");
    assert.equal(audit.entityType, actionType.startsWith("company_") ? "company" : "traveler");
    assert.equal(audit.entity_type, actionType.startsWith("company_") ? "company" : "traveler");
    assert.equal(audit.disabledActionStatus, "blocked");
    assert.equal(audit.disabled_action_status, "blocked");
    assert.deepEqual(audit.missing_requirements, []);
    assertDisabledFlags(audit, `${actionType} audit`);
    assertAuditPayload(audit.audit_payload, `${actionType} nested audit payload`);
    assert.equal(audit.audit_payload.actionType, actionType);
    assert.equal(audit.audit_payload.entityType, actionType.startsWith("company_") ? "company" : "traveler");
    assertNoUnsafeOutput(audit, `${actionType} audit`);
  }

  const companyResponse = await harness.disabledActionRoute.GET(
    new Request(
      disabledApiUrl({
        action: "company create",
        companyName: "ACME Holdings",
        domain: "Example.COM",
        id: "42",
      }),
      { headers: adminHeaders() },
    ),
  );
  const companyDisabled = await companyResponse.json();
  const companyAudit = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
    actionSource: "setup-contract-test",
    disabledActionResult: companyDisabled.result,
    actionType: "company create",
    companyName: "ACME Holdings",
    domain: "Example.COM",
    id: 42,
  });

  assert.equal(companyAudit.actionType, "company_create");
  assert.equal(companyAudit.entityType, "company");
  assert.equal(companyAudit.actionSource, "setup_contract_test");
  assert.equal(companyAudit.company_fields.company_name, "ACME Holdings");
  assert.equal(companyAudit.company_fields.domain, "example.com");
  assert.equal(companyAudit.company_fields.id, 42);
  assert.equal(companyAudit.traveler_fields.id, null);
  assert.equal(companyAudit.audit_payload.company_fields.company_name, "ACME Holdings");
  assert.equal(companyAudit.audit_payload.disabledActionStatus, "blocked");
  assert.deepEqual(companyAudit.missing_requirements, []);
  assertDisabledFlags(companyAudit, "Company audit");
  assertAuditPayload(companyAudit.audit_payload, "Company nested audit payload");
  assertNoUnsafeOutput(companyAudit, "Company audit");

  const travelerResponse = await harness.disabledActionRoute.GET(
    new Request(
      disabledApiUrl({
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
  const travelerDisabled = await travelerResponse.json();
  const travelerAudit = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
    action_source: "preview-readiness-api",
    bookerContact: "+65 8123 4567",
    bookerEmail: "Booker@Example.com",
    bookerName: "Ops Booker",
    company_id: 88,
    defaultDropoffAddress: "Raffles Hotel Singapore",
    defaultPickupAddress: "Changi Airport Terminal 3",
    disabled_action_result: travelerDisabled.result,
    preferredVehicle: "Vellfire",
    travelerName: "Safe Traveler",
    traveler_id: 901,
    action_type: "remember traveler name memory",
  });

  assert.equal(travelerAudit.actionType, "traveler_name_memory");
  assert.equal(travelerAudit.entityType, "traveler");
  assert.equal(travelerAudit.actionSource, "preview_readiness_api");
  assert.equal(travelerAudit.company_fields.id, 88);
  assert.equal(travelerAudit.traveler_fields.id, 901);
  assert.equal(travelerAudit.traveler_fields.booker_email, "booker@example.com");
  assert.equal(travelerAudit.traveler_fields.default_pickup_address, "Changi Airport Terminal 3");
  assert.equal(travelerAudit.traveler_fields.default_dropoff_address, "Raffles Hotel Singapore");
  assert.equal(travelerAudit.audit_payload.traveler_fields.traveler_name, "Safe Traveler");
  assert.deepEqual(travelerAudit.missing_requirements, []);
  assertDisabledFlags(travelerAudit, "Traveler audit");
  assertAuditPayload(travelerAudit.audit_payload, "Traveler nested audit payload");
  assertNoUnsafeOutput(travelerAudit, "Traveler audit");

  const unsafeAudit = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
    actionSource: "custom unsafe source",
    actionType: "payment token update",
    companyName: "driver_payout secret account",
    defaultAddress: "internal_admin_note address",
    domain: "paynow.example.com",
    travelerName: "pricing debug traveler",
  });

  assert.equal(unsafeAudit.actionType, null);
  assert.equal(unsafeAudit.action_source, null);
  assert.equal(unsafeAudit.entityType, null);
  assert.equal(unsafeAudit.disabledActionStatus, "missing");
  assert.deepEqual(unsafeAudit.missing_requirements, [
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assert.equal(unsafeAudit.company_fields.company_name, null);
  assert.equal(unsafeAudit.company_fields.domain, null);
  assert.equal(unsafeAudit.traveler_fields.default_address, null);
  assert.equal(unsafeAudit.traveler_fields.traveler_name, null);
  assertDisabledFlags(unsafeAudit, "Unsafe audit");
  assertAuditPayload(unsafeAudit.audit_payload, "Unsafe nested audit payload");
  assertNoUnsafeOutput(unsafeAudit, "Unsafe audit");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin company/traveler CRM write action audit payload setup foundation contract passed");
