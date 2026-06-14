import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-production-deployment-hardening-action-disabled-setup/route.ts",
  "app/api/admin-production-deployment-hardening-readiness-preview-setup/route.ts",
];
const helperFiles = [
  "lib/admin-production-deployment-hardening-action-audit-payload-setup-foundation.ts",
  "lib/admin-production-deployment-hardening-readiness-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const disabledActionSetupApi = "admin-production-deployment-hardening-action-disabled-setup";
const previewReadinessSetupApi =
  "admin-production-deployment-hardening-readiness-preview-setup";
const allowedSetupOnlyStrings = [
  "admin-production-deployment-hardening-action-disabled-setup",
  "admin-production-deployment-hardening-readiness-preview-setup",
  "blocked/no-op",
  "deployment_hardening",
  "external_api_provider_env_activation",
  "live_db_write_approval",
  "migration_approval",
  "payment_pdf_payout_auth_live_sending_live_location_photo_upload_activation",
  "payment_pdf_payout_auth_live_sending_location_photo_activation",
  "production_deployment_hardening_action_audit_payload_setup_only",
  "production_deployment_hardening_action_disabled_setup_only",
  "production_deployment_hardening_readiness_setup_only",
  "setup_only",
  "setup_only_disabled",
];
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|@supabase\/ssr|aws-sdk|googleapis|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun|twilio|vercel)["']|require\(\s*["'](?:@supabase\/supabase-js|@supabase\/ssr|aws-sdk|googleapis|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun|twilio|vercel)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bVERCEL_[A-Z_]*\b|\bDEPLOY_[A-Z_]*\b|\bMIGRATION_[A-Z_]*\b|\bSTRIPE_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bPAYOUT_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bLOCATION_[A-Z_]*\b|\bPHOTO_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/;
const dbWritePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMail\s*\(|sendInvoice\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const liveTruePattern =
  /productionDeploymentEnabled\s*[:=]\s*true|liveDbWriteEnabled\s*[:=]\s*true|migrationEnabled\s*[:=]\s*true|externalApiEnabled\s*[:=]\s*true|providerEnvEnabled\s*[:=]\s*true|paymentActivationEnabled\s*[:=]\s*true|authActivationEnabled\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|manualApprovalRequired\s*[:=]\s*false/i;
const liveActivationPattern =
  /exec\s*\(|spawn\s*\(|deploy\s*\(|migrate\s*\(|db\s+push|migration\s+up|supabase\s+db|vercel\s+deploy|generatePdf|new\s+PDFDocument|renderToStream|createPayment|paymentIntent|checkout\.sessions|checkoutSession|payoutTransfer|paynowTransfer|sendInvoice|sendMail\s*\(|navigator\.geolocation|watchPosition|getCurrentPosition|liveLocation|photoUpload\s*\(|storage\.from|upload\s*\(/i;
const shimPattern = /legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|private_key|password|driver_payout|paynow|pay_now|internal_admin|admin_finance|parser_debug|mock_archive|customer_price|payment_url|pdf_url|https?:\/\//i;
const expectedApprovalGates = {
  build_readiness: "manual_review_required",
  db_write_migration: "manual_approval_required",
  environment_readiness: "manual_review_required",
  no_live_activation: "manual_approval_required",
  payment_pdf_payout_auth_location_photo_live_sending: "manual_approval_required",
  provider_env: "manual_approval_required",
  rollback_manual_review: "required",
};
const expectedMissingRequirements = [
  "environment_approval",
  "build_verification",
  "live_risk_approval",
  "provider_env_approval",
  "db_write_migration_approval",
  "manual_approval",
  "rollback_review",
];
const expectedPlannedCapabilities = {
  build_verification: "planned_only",
  deployment: "planned_only",
  environment_readiness: "planned_only",
  rollback_plan: "manual_review_required",
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

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertProductionHardeningDisabled(value, label) {
  assert.equal(value?.productionDeploymentEnabled, false, `${label} must keep productionDeploymentEnabled false.`);
  assert.equal(value?.production_deployment_enabled, false, `${label} must keep production_deployment_enabled false.`);
  assert.equal(value?.liveDbWriteEnabled, false, `${label} must keep liveDbWriteEnabled false.`);
  assert.equal(value?.live_db_write_enabled, false, `${label} must keep live_db_write_enabled false.`);
  assert.equal(value?.migrationEnabled, false, `${label} must keep migrationEnabled false.`);
  assert.equal(value?.migration_enabled, false, `${label} must keep migration_enabled false.`);
  assert.equal(value?.externalApiEnabled, false, `${label} must keep externalApiEnabled false.`);
  assert.equal(value?.external_api_enabled, false, `${label} must keep external_api_enabled false.`);
  assert.equal(value?.providerEnvEnabled, false, `${label} must keep providerEnvEnabled false.`);
  assert.equal(value?.provider_env_enabled, false, `${label} must keep provider_env_enabled false.`);
  assert.equal(value?.paymentActivationEnabled, false, `${label} must keep paymentActivationEnabled false.`);
  assert.equal(value?.payment_activation_enabled, false, `${label} must keep payment_activation_enabled false.`);
  assert.equal(value?.authActivationEnabled, false, `${label} must keep authActivationEnabled false.`);
  assert.equal(value?.auth_activation_enabled, false, `${label} must keep auth_activation_enabled false.`);
  assert.equal(value?.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  assert.equal(value?.live_sending_enabled, false, `${label} must keep live_sending_enabled false.`);
  assert.equal(value?.manualApprovalRequired, true, `${label} must keep manualApprovalRequired true.`);
  assert.equal(value?.manual_approval_required, true, `${label} must keep manual_approval_required true.`);
  assert.equal(value?.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.audit_write_enabled ?? false, false, `${label} must keep audit_write_enabled false.`);

  if (Object.hasOwn(value ?? {}, "pdfGenerationEnabled")) {
    assert.equal(value.pdfGenerationEnabled, false, `${label} must keep pdfGenerationEnabled false.`);
  }

  if (Object.hasOwn(value ?? {}, "photoUploadEnabled")) {
    assert.equal(value.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  }

  if (Object.hasOwn(value ?? {}, "live_location_enabled")) {
    assert.equal(value.live_location_enabled, false, `${label} must keep live_location_enabled false.`);
  }
}

function assertReadiness(value, label) {
  assertProductionHardeningDisabled(value, label);
  assert.deepEqual(value?.approval_gates, expectedApprovalGates, `${label} must keep approval gates.`);
  assert.deepEqual(value?.missing_requirements, expectedMissingRequirements, `${label} must keep blockers.`);
  assert.equal(value?.readiness_status, "blocked_pending_manual_approval", `${label} must stay blocked.`);
  assert.equal(value?.rollbackReviewRequired, true, `${label} must require rollback review.`);
  assert.equal(value?.rollback_review_required, true, `${label} must require rollback review.`);
}

function assertPlannedCapabilities(value, label) {
  assert.deepEqual(
    value?.planned_capabilities,
    expectedPlannedCapabilities,
    `${label} must keep production hardening actions planned only.`,
  );
}

function assertBlockedNoOp(value, label) {
  assertProductionHardeningDisabled(value, label);
  assert.equal(value?.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value?.no_op, true, `${label} must stay no-op.`);
  assert.equal(value?.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value?.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose secrets, tokens, payout, payment links, PDF URLs, internal admin, parser, or mock archive text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-production-hardening-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-production-deployment-hardening-action-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    readiness: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-production-deployment-hardening-readiness-setup-foundation.js",
      ),
    ),
    routes: {
      disabledAction: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-production-deployment-hardening-action-disabled-setup/route.js",
        ),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-production-deployment-hardening-readiness-preview-setup/route.js",
        ),
      ),
    },
  };
}

const appApiFiles = await listFiles("app/api");
const productionHardeningRouteFiles = appApiFiles
  .filter((file) => file.endsWith("route.ts") && file.includes("admin-production-deployment-hardening"))
  .sort();

assert.deepEqual(
  productionHardeningRouteFiles,
  [...routeFiles].sort(),
  "Production hardening setup chain must keep only preview/readiness and disabled action GET routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live production hardening verbs.`,
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

  assert.equal(providerImportPattern.test(source), false, `${file} must not import deployment/DB/provider/payment/PDF/sending SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read deployment/provider/env secrets.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB reads or writes.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable production/live flags.`);
  assert.equal(
    liveActivationPattern.test(source),
    false,
    `${file} must not deploy, migrate, write DB, generate PDFs, create payments, send, track location, or upload photos.`,
  );
  assert.equal(shimPattern.test(source), false, `${file} must not introduce shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only production hardening string must remain present: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminProductionDeploymentHardeningActionAuditPayloadSetup } =
    harness.auditPayload;
  const { buildAdminProductionDeploymentHardeningReadinessSetup } = harness.readiness;
  const setup = buildAdminProductionDeploymentHardeningReadinessSetup({
    deployment_label: "prod-hardening-2026-06",
    releaseCandidate: "release-candidate-setup-1",
  });

  assertProductionHardeningDisabled(setup, "Production hardening readiness foundation");
  assert.equal(setup.status, "setup_only");
  assert.equal(setup.deployment_surface, "production_deployment_hardening_readiness_setup_only");
  assertReadiness(setup, "Production hardening readiness foundation");
  assertPlannedCapabilities(setup, "Production hardening readiness foundation");
  assertNoUnsafeOutput(setup, "Production hardening readiness foundation");

  const anonymousPreviewResponse = await harness.routes.previewReadiness.GET(
    new Request(apiUrl(`/api/${previewReadinessSetupApi}`)),
  );
  const anonymousPreview = await anonymousPreviewResponse.json();

  assert.equal(anonymousPreviewResponse.status, 403);
  assert.equal(anonymousPreview.ok, false);
  assert.equal(anonymousPreview.status, "blocked");
  assertProductionHardeningDisabled(anonymousPreview, "Anonymous production hardening preview API");
  assertProductionHardeningDisabled(
    anonymousPreview.preview,
    "Anonymous production hardening preview API preview",
  );
  assertReadiness(anonymousPreview.readiness, "Anonymous production hardening preview API readiness");
  assertProductionHardeningDisabled(
    anonymousPreview.setup,
    "Anonymous production hardening preview API setup",
  );
  assert.equal(anonymousPreview.setup.status, "setup_only");
  assertNoUnsafeOutput(anonymousPreview, "Anonymous production hardening preview API");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl(`/api/${previewReadinessSetupApi}`, {
        deployment_label: "prod-hardening-2026-07",
        releaseCandidate: "release-candidate-setup-2",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assertProductionHardeningDisabled(preview, "Production hardening preview API");
  assertProductionHardeningDisabled(preview.preview, "Production hardening preview API preview");
  assertReadiness(preview.readiness, "Production hardening preview API readiness");
  assertProductionHardeningDisabled(preview.setup, "Production hardening preview API setup");
  assertPlannedCapabilities(preview.preview, "Production hardening preview API preview");
  assertPlannedCapabilities(preview.setup, "Production hardening preview API setup");
  assert.equal(preview.preview.deployment_label, "prod-hardening-2026-07");
  assert.equal(preview.preview.release_candidate, "release-candidate-setup-2");
  assertNoUnsafeOutput(preview, "Production hardening preview API");

  const anonymousDisabledResponse = await harness.routes.disabledAction.GET(
    new Request(apiUrl(`/api/${disabledActionSetupApi}`)),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertProductionHardeningDisabled(anonymousDisabled, "Anonymous disabled production hardening action API");
  assertProductionHardeningDisabled(
    anonymousDisabled.preview,
    "Anonymous disabled production hardening action API preview",
  );
  assertReadiness(
    anonymousDisabled.readiness,
    "Anonymous disabled production hardening action API readiness",
  );
  assertProductionHardeningDisabled(
    anonymousDisabled.setup,
    "Anonymous disabled production hardening action API setup",
  );
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled production hardening action API result");
  assertNoUnsafeOutput(anonymousDisabled, "Anonymous disabled production hardening action API");

  const disabledResponse = await harness.routes.disabledAction.GET(
    new Request(
      apiUrl(`/api/${disabledActionSetupApi}`, {
        deployment_label: "prod-hardening-2026-08",
        releaseCandidate: "release-candidate-setup-3",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();

  assert.equal(disabledResponse.status, 200);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.status, "blocked");
  assertProductionHardeningDisabled(disabled, "Disabled production hardening action API");
  assertProductionHardeningDisabled(disabled.preview, "Disabled production hardening action API preview");
  assertReadiness(disabled.readiness, "Disabled production hardening action API readiness");
  assertProductionHardeningDisabled(disabled.setup, "Disabled production hardening action API setup");
  assertBlockedNoOp(disabled.result, "Disabled production hardening action API result");
  assert.equal(disabled.delivery_surface, "production_deployment_hardening_action_disabled_setup_only");
  assert.equal(disabled.preview_readiness_source, previewReadinessSetupApi);
  assert.deepEqual(disabled.result.action_groups.deployment_hardening, {
    productionDeploymentEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.action_groups.live_db_write_approval, {
    liveDbWriteEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.action_groups.migration_approval, {
    migrationEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.action_groups.external_api_provider_env_activation, {
    externalApiEnabled: false,
    providerEnvEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(
    disabled.result.action_groups.payment_pdf_payout_auth_live_sending_location_photo_activation,
    {
      authActivationEnabled: false,
      liveSendingEnabled: false,
      live_location_enabled: false,
      paymentActivationEnabled: false,
      pdfGenerationEnabled: false,
      photoUploadEnabled: false,
      status: "blocked",
    },
  );
  assertNoUnsafeOutput(disabled, "Disabled production hardening action API");

  const auditPayload = buildAdminProductionDeploymentHardeningActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "deployment hardening",
    disabledAction: disabled.result,
    setup,
  });

  assertProductionHardeningDisabled(auditPayload, "Production hardening action audit payload");
  assertProductionHardeningDisabled(
    auditPayload.audit_payload,
    "Production hardening action audit payload nested audit payload",
  );
  assertBlockedNoOp(
    auditPayload.blocked_no_op_result,
    "Production hardening action audit payload blocked result",
  );
  assertBlockedNoOp(
    auditPayload.audit_payload.result,
    "Production hardening action audit payload nested result",
  );
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.actionType, "deployment_hardening");
  assert.equal(auditPayload.actionSource, "disabled_action_api");
  assert.equal(auditPayload.disabledActionStatus, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoUnsafeOutput(auditPayload, "Production hardening action audit payload");

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

  assertProductionHardeningDisabled(unsafeAuditPayload, "Unsafe production hardening action audit payload");
  assertProductionHardeningDisabled(
    unsafeAuditPayload.audit_payload,
    "Unsafe production hardening action audit payload nested audit payload",
  );
  assertBlockedNoOp(
    unsafeAuditPayload.blocked_no_op_result,
    "Unsafe production hardening action audit payload blocked result",
  );
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
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe production hardening action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("production hardening no-live guard passed");
