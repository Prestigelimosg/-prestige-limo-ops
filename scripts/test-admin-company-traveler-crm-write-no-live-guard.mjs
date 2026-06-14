import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-company-traveler-crm-write-action-disabled-setup/route.ts",
  "app/api/admin-company-traveler-crm-write-readiness-preview-setup/route.ts",
];
const helperFiles = [
  "lib/admin-company-traveler-crm-write-action-audit-payload-setup-foundation.ts",
  "lib/admin-company-traveler-crm-write-readiness-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const disabledActionSetupApi = "admin-company-traveler-crm-write-action-disabled-setup";
const previewReadinessSetupApi = "admin-company-traveler-crm-write-readiness-preview-setup";
const expectedActionTypes = [
  "company_create",
  "company_update",
  "company_name_memory",
  "traveler_create",
  "traveler_update",
  "traveler_name_memory",
];
const allowedSetupOnlyStrings = [
  "admin-company-traveler-crm-write-action-audit-payload-setup-foundation-v1",
  "admin-company-traveler-crm-write-action-disabled-setup",
  "admin-company-traveler-crm-write-readiness-preview-setup",
  "blocked/no-op",
  "company_create",
  "company_name_memory",
  "company_traveler_crm_write_action_audit_payload_setup_only",
  "company_traveler_crm_write_action_disabled_setup_only",
  "company_traveler_crm_write_readiness_setup_only",
  "company_update",
  "setup_only",
  "setup_only_disabled",
  "traveler_create",
  "traveler_name_memory",
  "traveler_update",
];
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|@supabase\/ssr|@auth\/core|aws-sdk|googleapis|ical-generator|nodemailer|resend|sendgrid|mailgun|postmark|stripe|twilio|next-auth|pdfkit|jspdf|puppeteer|playwright)["']|require\(\s*["'](?:@supabase\/supabase-js|@supabase\/ssr|@auth\/core|aws-sdk|googleapis|ical-generator|nodemailer|resend|sendgrid|mailgun|postmark|stripe|twilio|next-auth|pdfkit|jspdf|puppeteer|playwright)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b|\bGOOGLE_[A-Z_]*\b|\bCALENDAR_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bPAYOUT_[A-Z_]*\b|\bBILLING_[A-Z_]*\b/;
const dbWritePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const liveTruePattern =
  /actionEnabled\s*[:=]\s*true|writeEnabled\s*[:=]\s*true|liveWriteEnabled\s*[:=]\s*true|companyCreateEnabled\s*[:=]\s*true|companyUpdateEnabled\s*[:=]\s*true|travelerCreateEnabled\s*[:=]\s*true|travelerUpdateEnabled\s*[:=]\s*true|nameMemoryWriteEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const parkedRiskFieldPattern = /customer_rates|driver_payout_rules/i;
const parkedRiskWritePattern =
  /\.(?:insert|upsert|update|delete)\s*\(|\b(?:insert|upsert|update|delete)\s*\(\s*[{[]?[\s\S]{0,120}(?:pricing|payout|rate_override)/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /customer_rates|driver_payout_rules|customer_price|driver_payout|rate_override|pricing|payout|paynow|pay_now|payment|billing|invoice|pdf|finance|internal_admin|parser_debug|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
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

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertCrmWriteLocked(value, label) {
  assert.equal(value?.actionEnabled, false, `${label} must keep actionEnabled false.`);
  assert.equal(value?.action_enabled ?? false, false, `${label} must keep action_enabled false.`);
  assert.equal(value?.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value?.write_enabled ?? false, false, `${label} must keep write_enabled false.`);
  assert.equal(value?.liveWriteEnabled, false, `${label} must keep liveWriteEnabled false.`);
  assert.equal(value?.live_write_enabled ?? false, false, `${label} must keep live_write_enabled false.`);
  assert.equal(value?.adminReviewRequired, true, `${label} must require admin review.`);
  assert.equal(
    value?.admin_review_required ?? true,
    true,
    `${label} must keep admin_review_required true when present.`,
  );
  assert.equal(value?.companyCreateEnabled ?? false, false, `${label} must keep companyCreateEnabled false.`);
  assert.equal(value?.companyUpdateEnabled ?? false, false, `${label} must keep companyUpdateEnabled false.`);
  assert.equal(value?.travelerCreateEnabled ?? false, false, `${label} must keep travelerCreateEnabled false.`);
  assert.equal(value?.travelerUpdateEnabled ?? false, false, `${label} must keep travelerUpdateEnabled false.`);
  assert.equal(value?.nameMemoryWriteEnabled ?? false, false, `${label} must keep nameMemoryWriteEnabled false.`);
  assert.equal(value?.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.external_send ?? false, false, `${label} must keep external_send false.`);
}

function assertBlockedNoOp(value, label) {
  assertCrmWriteLocked(value, label);
  assert.equal(value?.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value?.no_op, true, `${label} must stay no-op.`);
  assert.equal(value?.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value?.result_label, "blocked/no-op", `${label} must keep blocked/no-op result label.`);
}

function assertAuditPayloadLocked(value, label) {
  assertCrmWriteLocked(value, label);
  assert.equal(value?.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.audit_write_enabled, false, `${label} must keep audit_write_enabled false.`);
  assert.equal(value?.delivery_surface, "company_traveler_crm_write_action_audit_payload_setup_only");
  assert.equal(value?.status, "setup_only", `${label} must stay setup-only.`);
  assertBlockedNoOp(value?.blocked_no_op_result, `${label} blocked/no-op result`);
  assertCrmWriteLocked(value?.audit_payload, `${label} nested audit payload`);
  assert.equal(
    value?.audit_payload?.auditWriteEnabled,
    false,
    `${label} nested audit payload must keep auditWriteEnabled false.`,
  );
  assertBlockedNoOp(value?.audit_payload?.result, `${label} nested audit result`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
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

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-crm-write-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-company-traveler-crm-write-action-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    readiness: requireFromHarness(
      path.join(tempDir, "lib/admin-company-traveler-crm-write-readiness-setup-foundation.js"),
    ),
    routes: {
      disabledAction: requireFromHarness(
        path.join(tempDir, "app/api/admin-company-traveler-crm-write-action-disabled-setup/route.js"),
      ),
      previewReadiness: requireFromHarness(
        path.join(tempDir, "app/api/admin-company-traveler-crm-write-readiness-preview-setup/route.js"),
      ),
    },
  };
}

const crmWriteRouteFiles = (await listFiles("app/api"))
  .filter((file) => file.endsWith("route.ts") && file.includes("admin-company-traveler-crm-write"))
  .sort();

assert.deepEqual(
  crmWriteRouteFiles,
  [...routeFiles].sort(),
  "Company/traveler CRM write setup chain must keep only preview and disabled action GET routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain a GET setup route.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live CRM verbs.`,
  );
}

for (const helperFile of helperFiles) {
  const source = await readFile(helperFile, "utf8");

  assert.equal(source.includes("server-only"), true, `${helperFile} must stay server-only.`);
  assert.equal(
    /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source),
    false,
    `${helperFile} must not define API behavior.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import provider SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read provider/auth/calendar env.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB reads or writes.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable CRM write/live flags.`);
  assert.equal(parkedRiskFieldPattern.test(source), false, `${file} must not touch parked rate/payout tables.`);
  assert.equal(
    parkedRiskWritePattern.test(source),
    false,
    `${file} must not add pricing, payout, or rate override writes.`,
  );
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only company/traveler CRM write string must remain present: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup } = harness.audit;
  const { buildAdminCompanyTravelerCrmWriteReadinessSetup } = harness.readiness;
  const disabledResults = {};

  for (const actionType of expectedActionTypes) {
    const setup = buildAdminCompanyTravelerCrmWriteReadinessSetup({
      action_type: actionType,
      bookerContact: "+65 8123 4567",
      bookerEmail: "Booker@Example.com",
      bookerName: "Ops Booker",
      companyName: "ACME Holdings",
      company_id: 88,
      defaultDropoffAddress: "Raffles Hotel Singapore",
      defaultPickupAddress: "Changi Airport Terminal 3",
      domain: "example.com",
      id: actionType.startsWith("company_") ? 42 : undefined,
      preferredVehicle: "Vellfire",
      travelerName: "Safe Traveler",
      traveler_id: actionType.startsWith("traveler_") ? 901 : undefined,
    });

    assertCrmWriteLocked(setup, `${actionType} readiness foundation`);
    assert.equal(setup.status, "setup_only");
    assert.equal(setup.delivery_surface, "company_traveler_crm_write_readiness_setup_only");
    assert.equal(setup.actionType, actionType);
    assert.equal(setup.actionScope, actionType.startsWith("company_") ? "company" : "traveler");
    assert.deepEqual(setup.missing_requirements, [
      "admin_approval",
      "typed_write_api",
      "live_write_approval",
    ]);
    assertNoUnsafeOutput(setup, `${actionType} readiness foundation`);

    const previewResponse = await harness.routes.previewReadiness.GET(
      new Request(
        apiUrl(`/api/${previewReadinessSetupApi}`, {
          action_type: actionType,
          companyName: "ACME Holdings",
          domain: "example.com",
        }),
        { headers: adminHeaders() },
      ),
    );
    const preview = await previewResponse.json();

    assert.equal(previewResponse.status, 200, `${actionType} preview API must respond.`);
    assert.equal(preview.ok, true, `${actionType} preview API must be ok.`);
    assert.equal(preview.status, "setup_only", `${actionType} preview API must stay setup-only.`);
    assertCrmWriteLocked(preview, `${actionType} preview API`);
    assertCrmWriteLocked(preview.preview, `${actionType} preview API preview`);
    assertCrmWriteLocked(preview.readiness, `${actionType} preview API readiness`);
    assertCrmWriteLocked(preview.setup, `${actionType} preview API setup`);
    assert.equal(preview.setup.actionType, actionType);
    assertNoUnsafeOutput(preview, `${actionType} preview API`);

    const disabledResponse = await harness.routes.disabledAction.GET(
      new Request(
        apiUrl(`/api/${disabledActionSetupApi}`, {
          action_type: actionType,
          bookerContact: "+65 8123 4567",
          bookerEmail: "Booker@Example.com",
          bookerName: "Ops Booker",
          companyName: "ACME Holdings",
          company_id: "88",
          defaultDropoffAddress: "Raffles Hotel Singapore",
          defaultPickupAddress: "Changi Airport Terminal 3",
          domain: "example.com",
          id: actionType.startsWith("company_") ? "42" : "",
          preferredVehicle: "Vellfire",
          travelerName: "Safe Traveler",
          traveler_id: actionType.startsWith("traveler_") ? "901" : "",
        }),
        { headers: adminHeaders() },
      ),
    );
    const disabled = await disabledResponse.json();

    assert.equal(disabledResponse.status, 200, `${actionType} disabled action API must respond.`);
    assert.equal(disabled.ok, true, `${actionType} disabled action API must be ok.`);
    assert.equal(disabled.status, "blocked", `${actionType} disabled action API must stay blocked.`);
    assertCrmWriteLocked(disabled, `${actionType} disabled action API`);
    assertCrmWriteLocked(disabled.preview, `${actionType} disabled action API preview`);
    assertCrmWriteLocked(disabled.readiness, `${actionType} disabled action API readiness`);
    assertCrmWriteLocked(disabled.setup, `${actionType} disabled action API setup`);
    assertBlockedNoOp(disabled.result, `${actionType} disabled action API result`);
    assert.equal(disabled.result.actionType, actionType);
    assertNoUnsafeOutput(disabled, `${actionType} disabled action API`);

    disabledResults[actionType] = disabled.result;

    const auditPayload = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
      actionSource: "disabled-action-api",
      disabledAction: disabled.result,
      setup,
    });

    assertAuditPayloadLocked(auditPayload, `${actionType} action audit payload`);
    assert.equal(auditPayload.actionType, actionType);
    assert.equal(auditPayload.actionSource, "disabled_action_api");
    assert.equal(auditPayload.entityType, actionType.startsWith("company_") ? "company" : "traveler");
    assert.equal(auditPayload.disabledActionStatus, "blocked");
    assert.deepEqual(auditPayload.missing_requirements, []);
    assertNoUnsafeOutput(auditPayload, `${actionType} action audit payload`);
  }

  const anonymousPreviewResponse = await harness.routes.previewReadiness.GET(
    new Request(apiUrl(`/api/${previewReadinessSetupApi}`)),
  );
  const anonymousPreview = await anonymousPreviewResponse.json();

  assert.equal(anonymousPreviewResponse.status, 403);
  assert.equal(anonymousPreview.ok, false);
  assert.equal(anonymousPreview.status, "blocked");
  assertCrmWriteLocked(anonymousPreview, "Anonymous CRM write preview API");
  assertCrmWriteLocked(anonymousPreview.preview, "Anonymous CRM write preview API preview");
  assertCrmWriteLocked(anonymousPreview.readiness, "Anonymous CRM write preview API readiness");
  assertCrmWriteLocked(anonymousPreview.setup, "Anonymous CRM write preview API setup");
  assertNoUnsafeOutput(anonymousPreview, "Anonymous CRM write preview API");

  const anonymousDisabledResponse = await harness.routes.disabledAction.GET(
    new Request(apiUrl(`/api/${disabledActionSetupApi}`)),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertCrmWriteLocked(anonymousDisabled, "Anonymous disabled CRM write action API");
  assertCrmWriteLocked(anonymousDisabled.preview, "Anonymous disabled CRM write action API preview");
  assertCrmWriteLocked(anonymousDisabled.readiness, "Anonymous disabled CRM write action API readiness");
  assertCrmWriteLocked(anonymousDisabled.setup, "Anonymous disabled CRM write action API setup");
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled CRM write action API result");
  assertNoUnsafeOutput(anonymousDisabled, "Anonymous disabled CRM write action API");

  const companyAuditPayload = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
    actionSource: "setup contract test",
    actionType: "company create",
    companyName: "ACME Holdings",
    disabledActionResult: disabledResults.company_create,
    domain: "example.com",
    id: 42,
  });

  assertAuditPayloadLocked(companyAuditPayload, "Company create audit payload");
  assert.equal(companyAuditPayload.actionType, "company_create");
  assert.equal(companyAuditPayload.actionSource, "setup_contract_test");
  assert.equal(companyAuditPayload.entityType, "company");
  assert.deepEqual(companyAuditPayload.missing_requirements, []);
  assertNoUnsafeOutput(companyAuditPayload, "Company create audit payload");

  const travelerAuditPayload = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
    action_source: "preview readiness api",
    action_type: "remember traveler name memory",
    bookerContact: "+65 8123 4567",
    bookerEmail: "Booker@Example.com",
    disabled_action_result: disabledResults.traveler_name_memory,
    travelerName: "Safe Traveler",
    traveler_id: 901,
  });

  assertAuditPayloadLocked(travelerAuditPayload, "Traveler name-memory audit payload");
  assert.equal(travelerAuditPayload.actionType, "traveler_name_memory");
  assert.equal(travelerAuditPayload.actionSource, "preview_readiness_api");
  assert.equal(travelerAuditPayload.entityType, "traveler");
  assert.deepEqual(travelerAuditPayload.missing_requirements, []);
  assertNoUnsafeOutput(travelerAuditPayload, "Traveler name-memory audit payload");

  const unsafeAuditPayload = buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup({
    actionSource: "server_secret",
    actionType: "payment token update",
    companyName: "driver_payout secret account",
    defaultAddress: "internal_admin_note address",
    disabledActionResult: {
      actionEnabled: true,
      adminReviewRequired: false,
      companyCreateEnabled: true,
      companyUpdateEnabled: true,
      delivery_surface: "company_traveler_crm_write_action_disabled_setup_only",
      external_send: true,
      liveWriteEnabled: true,
      nameMemoryWriteEnabled: true,
      no_op: false,
      reason: "active",
      result_label: "active",
      status: "active",
      travelerCreateEnabled: true,
      travelerUpdateEnabled: true,
      writeEnabled: true,
    },
    domain: "paynow.example.com",
    travelerName: "pricing debug traveler",
  });

  assertAuditPayloadLocked(unsafeAuditPayload, "Unsafe CRM write audit payload");
  assert.equal(unsafeAuditPayload.actionType, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.entityType, null);
  assert.equal(unsafeAuditPayload.disabledActionStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe CRM write audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("company/traveler CRM write no-live guard passed");
