import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath =
  "lib/admin-production-deployment-hardening-action-audit-payload-setup-foundation.ts";
const readinessHelperPath =
  "lib/admin-production-deployment-hardening-readiness-setup-foundation.ts";
const disabledActionRoutePath =
  "app/api/admin-production-deployment-hardening-action-disabled-setup/route.ts";
const sourceFiles = [
  helperPath,
  readinessHelperPath,
  disabledActionRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const disabledActionSource = "admin-production-deployment-hardening-action-disabled-setup";
const previewReadinessSource = "admin-production-deployment-hardening-readiness-preview-setup";
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|private_key|password|driver_payout|paynow|pay_now|internal_admin|admin_finance|parser_debug|mock_archive|customer_price|payment_url|pdf_url|https?:\/\//i;
const helperSource = await readFile(helperPath, "utf8");
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

assert.equal(
  helperSource.includes("server-only"),
  true,
  "Production hardening action audit helper must stay server-only.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource),
  false,
  "Production hardening action audit helper must not use network APIs.",
);
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource),
  false,
  "Production hardening action audit helper must not define API behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bVERCEL_[A-Z_]*\b|\bDEPLOY_[A-Z_]*\b|\bSTRIPE_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(
    helperSource,
  ),
  false,
  "Production hardening action audit helper must not read env/provider secrets.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(
    helperSource,
  ),
  false,
  "Production hardening action audit helper must not use DB reads or writes.",
);
assert.equal(
  /@supabase\/supabase-js|@supabase\/ssr|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun|vercel/i.test(
    helperSource,
  ),
  false,
  "Production hardening action audit helper must not reference DB, deployment, payment, PDF, browser, or sending SDKs.",
);
assert.equal(
  /exec\s*\(|spawn\s*\(|deploy\s*\(|migrate\s*\(|db\s+push|migration\s+up|supabase\s+db|vercel\s+deploy|generatePdf|new\s+PDFDocument|renderToStream|createPayment|paymentIntent|checkout\.sessions|payoutTransfer|paynowTransfer|sendInvoice|sendMail\s*\(|messages\.create|client\.messages/i.test(
    helperSource,
  ),
  false,
  "Production hardening action audit helper must not deploy, migrate, generate PDFs, create payments, automate payouts, or send.",
);
assert.equal(
  /legacy_shim|shim\s*\(/i.test(helperSource),
  false,
  "Production hardening action audit helper must not introduce shims.",
);

for (const fragment of [
  "buildAdminProductionDeploymentHardeningReadinessSetup",
  disabledActionSource,
  previewReadinessSource,
  "production_deployment_hardening_action_audit_payload_setup_only",
  "adminProductionDeploymentHardeningActionAuditActionTypes",
  "deployment_hardening",
  "live_db_write_approval",
  "migration_approval",
  "external_api_provider_env_activation",
  "payment_pdf_payout_auth_live_sending_live_location_photo_upload_activation",
  "actionType",
  "actionSource",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "productionDeploymentEnabled: false",
  "liveDbWriteEnabled: false",
  "migrationEnabled: false",
  "externalApiEnabled: false",
  "providerEnvEnabled: false",
  "paymentActivationEnabled: false",
  "authActivationEnabled: false",
  "liveSendingEnabled: false",
  "manualApprovalRequired: true",
]) {
  assert.ok(
    helperSource.includes(fragment),
    `Missing production hardening action audit setup fragment: ${fragment}`,
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

function apiUrl(params = {}) {
  const url = new URL(
    "http://localhost/api/admin-production-deployment-hardening-action-disabled-setup",
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function blockedNoOpResult() {
  return {
    authActivationEnabled: false,
    auth_activation_enabled: false,
    externalApiEnabled: false,
    external_api_enabled: false,
    liveDbWriteEnabled: false,
    liveSendingEnabled: false,
    live_db_write_enabled: false,
    live_location_enabled: false,
    live_sending_enabled: false,
    manualApprovalRequired: true,
    manual_approval_required: true,
    migrationEnabled: false,
    migration_enabled: false,
    no_op: true,
    paymentActivationEnabled: false,
    payment_activation_enabled: false,
    pdfGenerationEnabled: false,
    pdf_generation_enabled: false,
    photoUploadEnabled: false,
    photo_upload_enabled: false,
    productionDeploymentEnabled: false,
    production_deployment_enabled: false,
    providerEnvEnabled: false,
    provider_env_enabled: false,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
  };
}

function assertProductionHardeningActionAuditDisabled(value, label) {
  assert.equal(value.productionDeploymentEnabled, false, `${label} must keep productionDeploymentEnabled false.`);
  assert.equal(value.production_deployment_enabled, false, `${label} must keep production_deployment_enabled false.`);
  assert.equal(value.liveDbWriteEnabled, false, `${label} must keep liveDbWriteEnabled false.`);
  assert.equal(value.live_db_write_enabled, false, `${label} must keep live_db_write_enabled false.`);
  assert.equal(value.migrationEnabled, false, `${label} must keep migrationEnabled false.`);
  assert.equal(value.migration_enabled, false, `${label} must keep migration_enabled false.`);
  assert.equal(value.externalApiEnabled, false, `${label} must keep externalApiEnabled false.`);
  assert.equal(value.external_api_enabled, false, `${label} must keep external_api_enabled false.`);
  assert.equal(value.providerEnvEnabled, false, `${label} must keep providerEnvEnabled false.`);
  assert.equal(value.provider_env_enabled, false, `${label} must keep provider_env_enabled false.`);
  assert.equal(value.paymentActivationEnabled, false, `${label} must keep paymentActivationEnabled false.`);
  assert.equal(value.payment_activation_enabled, false, `${label} must keep payment_activation_enabled false.`);
  assert.equal(value.authActivationEnabled, false, `${label} must keep authActivationEnabled false.`);
  assert.equal(value.auth_activation_enabled, false, `${label} must keep auth_activation_enabled false.`);
  assert.equal(value.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  assert.equal(value.live_sending_enabled, false, `${label} must keep live_sending_enabled false.`);
  assert.equal(value.manualApprovalRequired, true, `${label} must keep manualApprovalRequired true.`);
  assert.equal(value.manual_approval_required, true, `${label} must keep manual_approval_required true.`);

  if (Object.hasOwn(value, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assert.deepEqual(value, blockedNoOpResult(), `${label} must stay blocked/no-op.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose secrets, tokens, payout, payment URLs, PDF URLs, internal admin, parser, or mock archive text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-production-hardening-action-audit-"));
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

  const { buildAdminProductionDeploymentHardeningActionAuditPayloadSetup } = harness.audit;
  const { buildAdminProductionDeploymentHardeningReadinessSetup } = harness.readiness;
  const disabledResponse = await harness.disabledActionRoute.GET(
    new Request(
      apiUrl({
        deployment_label: "prod-hardening-2026-06",
        releaseCandidate: "release-candidate-setup-1",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();
  const setup = buildAdminProductionDeploymentHardeningReadinessSetup({
    deployment_label: "prod-hardening-2026-06",
    releaseCandidate: "release-candidate-setup-1",
  });
  const auditPayload = buildAdminProductionDeploymentHardeningActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "deployment hardening",
    disabledAction: disabled.result,
    setup,
  });

  assert.deepEqual(auditPayload, {
    actionSource: "disabled_action_api",
    actionType: "deployment_hardening",
    action_source: "disabled_action_api",
    action_type: "deployment_hardening",
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_action_api",
      actionType: "deployment_hardening",
      action_source: "disabled_action_api",
      action_type: "deployment_hardening",
      auditWriteEnabled: false,
      authActivationEnabled: false,
      auth_activation_enabled: false,
      blocked_no_op_result: blockedNoOpResult(),
      deployment_label: "prod-hardening-2026-06",
      disabledActionStatus: "blocked",
      disabled_action_source: disabledActionSource,
      disabled_action_status: "blocked",
      externalApiEnabled: false,
      external_api_enabled: false,
      liveDbWriteEnabled: false,
      liveSendingEnabled: false,
      live_db_write_enabled: false,
      live_sending_enabled: false,
      manualApprovalRequired: true,
      manual_approval_required: true,
      migrationEnabled: false,
      migration_enabled: false,
      paymentActivationEnabled: false,
      payment_activation_enabled: false,
      preview_readiness_source: previewReadinessSource,
      productionDeploymentEnabled: false,
      production_deployment_enabled: false,
      production_readiness_status: "ready_for_future_setup",
      providerEnvEnabled: false,
      provider_env_enabled: false,
      release_candidate: "release-candidate-setup-1",
      result: blockedNoOpResult(),
    },
    audit_write_enabled: false,
    authActivationEnabled: false,
    auth_activation_enabled: false,
    blocked_no_op_result: blockedNoOpResult(),
    delivery_surface: "production_deployment_hardening_action_audit_payload_setup_only",
    deployment_label: "prod-hardening-2026-06",
    disabledActionStatus: "blocked",
    disabled_action_status: "blocked",
    externalApiEnabled: false,
    external_api_enabled: false,
    liveDbWriteEnabled: false,
    liveSendingEnabled: false,
    live_db_write_enabled: false,
    live_sending_enabled: false,
    manualApprovalRequired: true,
    manual_approval_required: true,
    migrationEnabled: false,
    migration_enabled: false,
    missing_requirements: [],
    paymentActivationEnabled: false,
    payment_activation_enabled: false,
    productionDeploymentEnabled: false,
    production_deployment_enabled: false,
    production_readiness_status: "ready_for_future_setup",
    providerEnvEnabled: false,
    provider_env_enabled: false,
    release_candidate: "release-candidate-setup-1",
    status: "setup_only",
    version: "admin-production-deployment-hardening-action-audit-payload-setup-foundation-v1",
  });
  assertProductionHardeningActionAuditDisabled(
    auditPayload,
    "Ready production hardening action audit payload",
  );
  assertProductionHardeningActionAuditDisabled(
    auditPayload.audit_payload,
    "Ready nested production hardening action audit payload",
  );
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Ready production hardening blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Ready nested production hardening blocked result");
  assertNoUnsafeOutput(auditPayload, "Ready production hardening action audit payload");

  const actionTypeCases = [
    ["live db write approval", "live_db_write_approval"],
    ["migration-approval", "migration_approval"],
    ["external api provider env activation", "external_api_provider_env_activation"],
    [
      "payment pdf payout auth live sending live location photo upload activation",
      "payment_pdf_payout_auth_live_sending_live_location_photo_upload_activation",
    ],
  ];

  for (const [rawActionType, normalizedActionType] of actionTypeCases) {
    const actionAudit = buildAdminProductionDeploymentHardeningActionAuditPayloadSetup({
      action_source: "setup_contract_test",
      action_type: rawActionType,
      deploymentLabel: "prod-hardening-2026-07",
      disabled_action: disabled.result,
      releaseCandidate: "release-candidate-setup-2",
    });

    assert.equal(actionAudit.actionType, normalizedActionType);
    assert.equal(actionAudit.actionSource, "setup_contract_test");
    assert.equal(actionAudit.deployment_label, "prod-hardening-2026-07");
    assert.equal(actionAudit.release_candidate, "release-candidate-setup-2");
    assert.equal(actionAudit.disabledActionStatus, "blocked");
    assert.deepEqual(actionAudit.missing_requirements, []);
    assertProductionHardeningActionAuditDisabled(actionAudit, `${normalizedActionType} audit payload`);
    assertBlockedNoOp(actionAudit.blocked_no_op_result, `${normalizedActionType} blocked result`);
    assertNoUnsafeOutput(actionAudit, `${normalizedActionType} audit payload`);
  }

  const unsafeAuditPayload = buildAdminProductionDeploymentHardeningActionAuditPayloadSetup({
    actionSource: "server_secret",
    actionType: "deploy-live-now",
    deployment_label: "server_secret",
    disabledAction: {
      delivery_surface: "production_deployment_hardening_action_disabled_setup_only",
      authActivationEnabled: true,
      externalApiEnabled: true,
      liveDbWriteEnabled: true,
      liveSendingEnabled: true,
      manualApprovalRequired: false,
      migrationEnabled: true,
      no_op: false,
      paymentActivationEnabled: true,
      productionDeploymentEnabled: true,
      providerEnvEnabled: true,
      reason: "active",
      result_label: "active",
      status: "active",
    },
    releaseCandidate: "raw_token_release",
  });

  assert.equal(unsafeAuditPayload.actionType, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.deployment_label, null);
  assert.equal(unsafeAuditPayload.release_candidate, null);
  assert.equal(unsafeAuditPayload.disabledActionStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assertProductionHardeningActionAuditDisabled(
    unsafeAuditPayload,
    "Unsafe production hardening action audit payload",
  );
  assertProductionHardeningActionAuditDisabled(
    unsafeAuditPayload.audit_payload,
    "Unsafe nested production hardening action audit payload",
  );
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe production hardening blocked result");
  assertBlockedNoOp(
    unsafeAuditPayload.audit_payload.result,
    "Unsafe nested production hardening blocked result",
  );
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe production hardening action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin production deployment hardening action audit payload setup foundation contract passed");
