import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-production-deployment-hardening-action-disabled-setup/route.ts";
const helperPath = "lib/admin-production-deployment-hardening-readiness-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const previewReadinessSetupApi =
  "admin-production-deployment-hardening-readiness-preview-setup";
const safeOutputLeakPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|private_key|password|driver_payout|paynow|pay_now|internal_admin|admin_finance|parser_debug|mock_archive|customer_price|payment_url|pdf_url/i;
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

function apiUrl(params = {}) {
  const url = new URL(
    "http://localhost/api/admin-production-deployment-hardening-action-disabled-setup",
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
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
}

function assertProductionHardeningExtendedDisabled(value, label) {
  assertProductionHardeningDisabled(value, label);
  assert.equal(value.pdfGenerationEnabled, false, `${label} must keep pdfGenerationEnabled false.`);
  assert.equal(value.pdf_generation_enabled, false, `${label} must keep pdf_generation_enabled false.`);
  assert.equal(value.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  assert.equal(value.photo_upload_enabled, false, `${label} must keep photo_upload_enabled false.`);
  assert.equal(value.live_location_enabled, false, `${label} must keep live_location_enabled false.`);
}

function assertReadiness(value, label) {
  assertProductionHardeningExtendedDisabled(value, label);
  assert.deepEqual(value.approval_gates, expectedApprovalGates, `${label} must keep approval gates.`);
  assert.deepEqual(value.missing_requirements, expectedMissingRequirements, `${label} must keep blockers.`);
  assert.equal(value.readiness_status, "blocked_pending_manual_approval", `${label} must stay blocked.`);
  assert.equal(value.rollbackReviewRequired, true, `${label} must require rollback review.`);
  assert.equal(value.rollback_review_required, true, `${label} must require rollback review.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
}

function assertPreview(value, label) {
  assertProductionHardeningExtendedDisabled(value, label);
  assert.deepEqual(value.planned_capabilities, expectedPlannedCapabilities, `${label} must stay planned only.`);
  assert.equal(value.buildReadinessReady, false, `${label} must keep buildReadinessReady false.`);
  assert.equal(value.environmentReadinessReady, false, `${label} must keep environmentReadinessReady false.`);
  assert.equal(value.rollbackReviewRequired, true, `${label} must require rollback review.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
}

function assertNoOpResult(result, label) {
  assertProductionHardeningExtendedDisabled(result, label);
  assert.equal(result.status, "blocked", `${label} must stay blocked.`);
  assert.equal(result.no_op, true, `${label} must stay no-op.`);
  assert.equal(result.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(result.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    result.preview_readiness_source,
    previewReadinessSetupApi,
    `${label} must reference the preview/readiness setup API.`,
  );
  assert.deepEqual(result.action_groups, {
    deployment_hardening: {
      productionDeploymentEnabled: false,
      status: "blocked",
    },
    external_api_provider_env_activation: {
      externalApiEnabled: false,
      providerEnvEnabled: false,
      status: "blocked",
    },
    live_db_write_approval: {
      liveDbWriteEnabled: false,
      status: "blocked",
    },
    migration_approval: {
      migrationEnabled: false,
      status: "blocked",
    },
    payment_pdf_payout_auth_live_sending_location_photo_activation: {
      authActivationEnabled: false,
      liveSendingEnabled: false,
      live_location_enabled: false,
      paymentActivationEnabled: false,
      pdfGenerationEnabled: false,
      photoUploadEnabled: false,
      status: "blocked",
    },
  });
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose secrets, tokens, payout, payment, PDF links, internal admin, parser, or mock archive text.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-production-hardening-disabled-"));
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
  "buildAdminProductionDeploymentHardeningReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  previewReadinessSetupApi,
  "production_deployment_hardening_action_disabled_setup_only",
  "deployment_hardening",
  "live_db_write_approval",
  "migration_approval",
  "external_api_provider_env_activation",
  "payment_pdf_payout_auth_live_sending_location_photo_activation",
  "productionDeploymentEnabled: false",
  "liveDbWriteEnabled: false",
  "migrationEnabled: false",
  "externalApiEnabled: false",
  "providerEnvEnabled: false",
  "paymentActivationEnabled: false",
  "authActivationEnabled: false",
  "liveSendingEnabled: false",
  "manualApprovalRequired: true",
  "status: \"blocked\"",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled production hardening API fragment: ${fragment}`);
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
  "vercel",
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
  "deploy(",
  "migrate(",
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

  assert.equal(anonymousResponse.status, 403, "Production hardening disabled action API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertProductionHardeningExtendedDisabled(anonymous, "Anonymous blocked response");
  assertPreview(anonymous.preview, "Anonymous blocked preview");
  assertReadiness(anonymous.readiness, "Anonymous blocked readiness");
  assertProductionHardeningExtendedDisabled(anonymous.setup, "Anonymous blocked setup");
  assert.equal(anonymous.setup.status, "setup_only");
  assertNoOpResult(anonymous.result, "Anonymous blocked result");
  assert.equal(anonymous.preview_readiness_source, previewReadinessSetupApi);
  assertNoUnsafeOutput(anonymous, "Anonymous blocked response");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        deployment_label: "prod-readiness-2026-06",
        releaseCandidate: "release-candidate-setup-1",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "blocked");
  assert.equal(ready.version, "admin-production-deployment-hardening-readiness-setup-foundation-v1");
  assertProductionHardeningExtendedDisabled(ready, "Ready response");
  assertPreview(ready.preview, "Ready preview");
  assertReadiness(ready.readiness, "Ready readiness");
  assertProductionHardeningExtendedDisabled(ready.setup, "Ready setup");
  assert.equal(ready.setup.status, "setup_only");
  assertNoOpResult(ready.result, "Ready result");
  assert.equal(ready.preview.deployment_label, "prod-readiness-2026-06");
  assert.equal(ready.preview.release_candidate, "release-candidate-setup-1");
  assert.equal(ready.result.deployment_label, "prod-readiness-2026-06");
  assert.equal(ready.result.release_candidate, "release-candidate-setup-1");
  assert.equal(ready.preview_readiness_source, previewReadinessSetupApi);
  assert.deepEqual(ready.result, {
    action_groups: {
      deployment_hardening: {
        productionDeploymentEnabled: false,
        status: "blocked",
      },
      external_api_provider_env_activation: {
        externalApiEnabled: false,
        providerEnvEnabled: false,
        status: "blocked",
      },
      live_db_write_approval: {
        liveDbWriteEnabled: false,
        status: "blocked",
      },
      migration_approval: {
        migrationEnabled: false,
        status: "blocked",
      },
      payment_pdf_payout_auth_live_sending_location_photo_activation: {
        authActivationEnabled: false,
        liveSendingEnabled: false,
        live_location_enabled: false,
        paymentActivationEnabled: false,
        pdfGenerationEnabled: false,
        photoUploadEnabled: false,
        status: "blocked",
      },
    },
    authActivationEnabled: false,
    auth_activation_enabled: false,
    deployment_label: "prod-readiness-2026-06",
    delivery_surface: "production_deployment_hardening_action_disabled_setup_only",
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
    preview_readiness_source: previewReadinessSetupApi,
    productionDeploymentEnabled: false,
    production_deployment_enabled: false,
    providerEnvEnabled: false,
    provider_env_enabled: false,
    reason: "setup_only_disabled",
    release_candidate: "release-candidate-setup-1",
    result_label: "blocked/no-op",
    status: "blocked",
    version: "admin-production-deployment-hardening-readiness-setup-foundation-v1",
  });
  assertNoUnsafeOutput(ready, "Ready response");

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        deploymentLabel: "server_secret",
        release_candidate: "raw_token_release",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafe.ok, true);
  assert.equal(unsafe.status, "blocked");
  assertProductionHardeningExtendedDisabled(unsafe, "Unsafe response");
  assertPreview(unsafe.preview, "Unsafe preview");
  assertReadiness(unsafe.readiness, "Unsafe readiness");
  assertNoOpResult(unsafe.result, "Unsafe result");
  assert.equal(unsafe.preview.deployment_label, null);
  assert.equal(unsafe.preview.release_candidate, null);
  assert.equal(unsafe.result.deployment_label, null);
  assert.equal(unsafe.result.release_candidate, null);
  assert.equal(unsafe.setup.deployment_label, null);
  assert.equal(unsafe.setup.release_candidate, null);
  assertNoUnsafeOutput(unsafe, "Unsafe response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin production deployment hardening action disabled setup API contract passed");
