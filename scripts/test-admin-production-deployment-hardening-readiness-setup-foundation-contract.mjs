import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-production-deployment-hardening-readiness-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|private_key|password|driver_payout|paynow|pay_now|internal_admin|admin_finance|parser_debug|mock_archive/i;

assert.equal(source.includes("server-only"), true, "Production hardening readiness helper must stay server-only.");
assert.equal(
  /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source),
  false,
  "Production hardening readiness helper must not define API route behavior.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bVERCEL_[A-Z_]*\b|\bDEPLOY_[A-Z_]*\b|\bSTRIPE_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(
    source,
  ),
  false,
  "Production hardening readiness helper must not read env/provider secrets.",
);
assert.equal(
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|@supabase\/ssr|aws-sdk|googleapis|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun|vercel)["']|require\(\s*["'](?:@supabase\/supabase-js|@supabase\/ssr|aws-sdk|googleapis|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun|vercel)["']\s*\)/i.test(
    source,
  ),
  false,
  "Production hardening readiness helper must not import DB, deployment, provider, payment, PDF, browser, or sending SDKs.",
);
assert.equal(
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(
    source,
  ),
  false,
  "Production hardening readiness helper must not use DB reads or writes.",
);
assert.equal(
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(/i.test(source),
  false,
  "Production hardening readiness helper must not use network APIs.",
);
assert.equal(
  /exec\s*\(|spawn\s*\(|deploy\s*\(|migrate\s*\(|db\s+push|migration\s+up|supabase\s+db|vercel\s+deploy|generatePdf|new\s+PDFDocument|createPayment|paymentIntent|checkout\.sessions|payoutTransfer|sendMail\s*\(|messages\.create/i.test(
    source,
  ),
  false,
  "Production hardening readiness helper must not deploy, migrate, generate PDFs, activate payment, automate payout, or send.",
);
assert.equal(
  /productionDeploymentEnabled\s*[:=]\s*true|liveDbWriteEnabled\s*[:=]\s*true|migrationEnabled\s*[:=]\s*true|externalApiEnabled\s*[:=]\s*true|providerEnvEnabled\s*[:=]\s*true|paymentActivationEnabled\s*[:=]\s*true|authActivationEnabled\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|manualApprovalRequired\s*[:=]\s*false/i.test(
    source,
  ),
  false,
  "Production hardening readiness helper must not enable production/live flags.",
);
assert.equal(/legacy_shim|shim\s*\(/i.test(source), false, "Production hardening readiness helper must not introduce shims.");

for (const fragment of [
  "adminProductionDeploymentHardeningReadinessSetupFoundationVersion",
  "buildAdminProductionDeploymentHardeningReadinessSetup",
  "production_deployment_hardening_readiness_setup_only",
  "productionDeploymentEnabled: false",
  "liveDbWriteEnabled: false",
  "migrationEnabled: false",
  "externalApiEnabled: false",
  "providerEnvEnabled: false",
  "paymentActivationEnabled: false",
  "authActivationEnabled: false",
  "liveSendingEnabled: false",
  "manualApprovalRequired: true",
  "rollbackReviewRequired: true",
  "environment_approval",
  "build_verification",
  "provider_env_approval",
  "db_write_migration_approval",
  "rollback_review",
]) {
  assert.ok(source.includes(fragment), `Missing production hardening readiness fragment: ${fragment}`);
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-production-hardening-readiness-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

function assertProductionHardeningDisabled(value, label) {
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
  assert.equal(value.manualApprovalRequired, true, `${label} must require manual approval.`);
  assert.equal(value.manual_approval_required, true, `${label} must require manual approval.`);
  assert.equal(value.rollbackReviewRequired, true, `${label} must require rollback review.`);
  assert.equal(value.rollback_review_required, true, `${label} must require rollback review.`);
  assert.equal(value.pdfGenerationEnabled, false, `${label} must keep pdfGenerationEnabled false.`);
  assert.equal(value.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  assert.equal(value.live_location_enabled, false, `${label} must keep live location false.`);
  assert.equal(value.buildReadinessReady, false, `${label} must keep buildReadinessReady false.`);
  assert.equal(value.environmentReadinessReady, false, `${label} must keep environmentReadinessReady false.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose secrets, tokens, payout, PayNow, internal admin, parser, or mock archive text.`,
  );
}

const harness = await loadHelper();

try {
  const { buildAdminProductionDeploymentHardeningReadinessSetup } = harness.helper;
  const setup = buildAdminProductionDeploymentHardeningReadinessSetup({
    deployment_label: "prod-readiness-2026-06",
    releaseCandidate: "release-candidate-setup-1",
  });

  assert.deepEqual(setup, {
    approval_gates: {
      build_readiness: "manual_review_required",
      db_write_migration: "manual_approval_required",
      environment_readiness: "manual_review_required",
      no_live_activation: "manual_approval_required",
      payment_pdf_payout_auth_location_photo_live_sending: "manual_approval_required",
      provider_env: "manual_approval_required",
      rollback_manual_review: "required",
    },
    authActivationEnabled: false,
    auth_activation_enabled: false,
    buildReadinessReady: false,
    build_readiness_ready: false,
    deployment_label: "prod-readiness-2026-06",
    deployment_surface: "production_deployment_hardening_readiness_setup_only",
    environmentReadinessReady: false,
    environment_readiness_ready: false,
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
    missing_requirements: [
      "environment_approval",
      "build_verification",
      "live_risk_approval",
      "provider_env_approval",
      "db_write_migration_approval",
      "manual_approval",
      "rollback_review",
    ],
    paymentActivationEnabled: false,
    payment_activation_enabled: false,
    pdfGenerationEnabled: false,
    pdf_generation_enabled: false,
    photoUploadEnabled: false,
    photo_upload_enabled: false,
    planned_capabilities: {
      build_verification: "planned_only",
      deployment: "planned_only",
      environment_readiness: "planned_only",
      rollback_plan: "manual_review_required",
    },
    productionDeploymentEnabled: false,
    production_deployment_enabled: false,
    providerEnvEnabled: false,
    provider_env_enabled: false,
    release_candidate: "release-candidate-setup-1",
    readiness_status: "blocked_pending_manual_approval",
    rollbackReviewRequired: true,
    rollback_review_required: true,
    status: "setup_only",
    version: "admin-production-deployment-hardening-readiness-setup-foundation-v1",
  });
  assertProductionHardeningDisabled(setup, "production hardening readiness setup");
  assertNoUnsafeOutput(setup, "production hardening readiness setup");

  const fallback = buildAdminProductionDeploymentHardeningReadinessSetup();

  assert.equal(fallback.deployment_label, null);
  assert.equal(fallback.release_candidate, null);
  assertProductionHardeningDisabled(fallback, "fallback production hardening readiness setup");
  assertNoUnsafeOutput(fallback, "fallback production hardening readiness setup");

  const unsafe = buildAdminProductionDeploymentHardeningReadinessSetup({
    deploymentLabel: "server_secret",
    release_candidate: "raw_token_release",
  });

  assert.equal(unsafe.deployment_label, null);
  assert.equal(unsafe.release_candidate, null);
  assertProductionHardeningDisabled(unsafe, "unsafe production hardening readiness setup");
  assertNoUnsafeOutput(unsafe, "unsafe production hardening readiness setup");
} finally {
  await harness.cleanup();
}

console.log("admin production deployment hardening readiness setup foundation contract passed");
