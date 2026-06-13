import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-ots-photo-proof-access-upload-audit-payload-setup-foundation.ts";
const setupHelperPath = "lib/admin-ots-photo-proof-setup-foundation.ts";
const disabledAccessUploadRoutePath = "app/api/admin-ots-photo-proof-access-upload-disabled-setup/route.ts";
const sourceFiles = [
  helperPath,
  setupHelperPath,
  disabledAccessUploadRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const futureStoragePathPattern = "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg";
const plannedPrivateBucket = "ots-photo-proofs";
const previewReadinessSource = "admin-ots-photo-proof-preview-readiness-setup";
const unsafeOutputPattern =
  /base64|binary|data:image|driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|server_secret|secret|stripe|supabase|storage_object_id|signed_url|download_url|real-photo-bytes|real_storage_object/i;
const helperSource = await readFile(helperPath, "utf8");
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

assert.equal(helperSource.includes("server-only"), true, "OTS audit payload helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource), false, "OTS audit helper must not use network APIs.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource), false, "OTS audit helper must not define API behavior.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/i.test(helperSource), false, "OTS audit helper must not read env/provider secrets.");
assert.equal(/createClient|supabase|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i.test(helperSource), false, "OTS audit helper must not use DB writes.");
assert.equal(/input type="file"|FormData|URL\.createObjectURL|navigator\.mediaDevices|getUserMedia|\.upload\s*\(|storage\.from/i.test(helperSource), false, "OTS audit helper must not activate camera/file upload/storage.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|twilio|vonage|messagebird|whatsapp-cloud-api|telegram|stripe/i.test(helperSource), false, "OTS audit helper must not reference provider or payment SDKs.");

for (const fragment of [
  "buildAdminOtsPhotoProofSetupFoundation",
  "admin-ots-photo-proof-access-upload-disabled-setup",
  previewReadinessSource,
  "admin_ots_photo_proof_access_upload_audit_payload_setup_only",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "photoType",
  "OTS",
  plannedPrivateBucket,
  futureStoragePathPattern,
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "liveAccessEnabled: false",
  "external_send: false",
]) {
  assert.ok(helperSource.includes(fragment), `Missing OTS audit payload setup fragment: ${fragment}`);
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
  const url = new URL("http://localhost/api/admin-ots-photo-proof-access-upload-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabled(value, label) {
  assert.equal(value.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  assert.equal(value.storageEnabled, false, `${label} must keep storageEnabled false.`);
  assert.equal(value.adminViewerEnabled, false, `${label} must keep adminViewerEnabled false.`);
  assert.equal(value.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);

  if (Object.hasOwn(value, "external_send")) {
    assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assertDisabled(value, label);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must keep setup-only disabled reason.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
}

function assertStorageMetadata(value, label) {
  assert.deepEqual(
    value.metadata,
    {
      futureStoragePathPattern,
      photoType: "OTS",
      plannedPrivateBucket,
      preview_readiness_source: previewReadinessSource,
      realPhotoDataIncluded: false,
      realStorageObjectIncluded: false,
    },
    `${label} must include planned storage metadata only.`,
  );
}

function assertNoRealPhotoOrStorage(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not include real photo data, storage objects, or sensitive fields.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ots-photo-proof-audit-payload-"));
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
    disabledAccessUploadRoute: requireFromHarness(
      path.join(tempDir, disabledAccessUploadRoutePath.replace(/\.ts$/, ".js")),
    ),
    setup: requireFromHarness(path.join(tempDir, setupHelperPath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup } = harness.audit;
  const { buildAdminOtsPhotoProofSetupFoundation } = harness.setup;
  const disabledResponse = await harness.disabledAccessUploadRoute.GET(
    new Request(
      apiUrl({
        booking_ref: "PLO-OTS-AUDIT-001",
        driver_job_token: "driver-token-placeholder",
        service_code: "arrival",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();
  const setup = buildAdminOtsPhotoProofSetupFoundation({
    booking_ref: "PLO-OTS-AUDIT-001",
    driver_job_token: "driver-token-placeholder",
    service_code: "arrival",
  });
  const auditPayload = buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup({
    actionSource: "disabled-access-upload-api",
    disabledAccessUpload: disabled.result,
    setup,
  });

  assert.deepEqual(auditPayload, {
    actionSource: "disabled_access_upload_api",
    action_source: "disabled_access_upload_api",
    adminViewerEnabled: false,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_access_upload_api",
      action_source: "disabled_access_upload_api",
      adminViewerEnabled: false,
      auditWriteEnabled: false,
      bookingRef: "PLO-OTS-AUDIT-001",
      booking_ref: "PLO-OTS-AUDIT-001",
      customerVisible: false,
      disabledAccessUploadStatus: "blocked",
      disabled_access_upload_source: "admin-ots-photo-proof-access-upload-disabled-setup",
      disabled_access_upload_status: "blocked",
      external_send: false,
      liveAccessEnabled: false,
      metadata: {
        futureStoragePathPattern,
        photoType: "OTS",
        plannedPrivateBucket,
        preview_readiness_source: previewReadinessSource,
        realPhotoDataIncluded: false,
        realStorageObjectIncluded: false,
      },
      photoType: "OTS",
      photoUploadEnabled: false,
      preview_readiness_source: previewReadinessSource,
      result: {
        adminViewerEnabled: false,
        customerVisible: false,
        external_send: false,
        liveAccessEnabled: false,
        no_op: true,
        photoUploadEnabled: false,
        reason: "setup_only_disabled",
        result_label: "blocked/no-op",
        status: "blocked",
        storageEnabled: false,
      },
      storageEnabled: false,
    },
    audit_write_enabled: false,
    blocked_no_op_result: {
      adminViewerEnabled: false,
      customerVisible: false,
      external_send: false,
      liveAccessEnabled: false,
      no_op: true,
      photoUploadEnabled: false,
      reason: "setup_only_disabled",
      result_label: "blocked/no-op",
      status: "blocked",
      storageEnabled: false,
    },
    bookingRef: "PLO-OTS-AUDIT-001",
    booking_ref: "PLO-OTS-AUDIT-001",
    customerVisible: false,
    delivery_surface: "admin_ots_photo_proof_access_upload_audit_payload_setup_only",
    disabledAccessUploadStatus: "blocked",
    disabled_access_upload_status: "blocked",
    external_send: false,
    liveAccessEnabled: false,
    metadata: {
      futureStoragePathPattern,
      photoType: "OTS",
      plannedPrivateBucket,
      preview_readiness_source: previewReadinessSource,
      realPhotoDataIncluded: false,
      realStorageObjectIncluded: false,
    },
    missing_requirements: [],
    photoType: "OTS",
    photoUploadEnabled: false,
    status: "setup_only",
    storageEnabled: false,
    version: "admin-ots-photo-proof-access-upload-audit-payload-setup-foundation-v1",
  });
  assertDisabled(auditPayload, "Ready OTS audit payload");
  assertDisabled(auditPayload.audit_payload, "Ready OTS nested audit payload");
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Ready OTS blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Ready OTS nested result");
  assertStorageMetadata(auditPayload, "Ready OTS audit payload");
  assertStorageMetadata(auditPayload.audit_payload, "Ready OTS nested audit payload");
  assertNoRealPhotoOrStorage(auditPayload, "Ready OTS audit payload");

  const inlineAuditPayload = buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup({
    action_source: "preview_readiness_api",
    booking_ref: "PLO-OTS-AUDIT-002",
    disabled_access_upload: disabled.result,
    service_code: "departure",
  });

  assert.equal(inlineAuditPayload.actionSource, "preview_readiness_api");
  assert.equal(inlineAuditPayload.bookingRef, "PLO-OTS-AUDIT-002");
  assert.equal(inlineAuditPayload.photoType, "OTS");
  assert.deepEqual(inlineAuditPayload.missing_requirements, []);
  assertDisabled(inlineAuditPayload, "Inline OTS audit payload");
  assertStorageMetadata(inlineAuditPayload, "Inline OTS audit payload");
  assertNoRealPhotoOrStorage(inlineAuditPayload, "Inline OTS audit payload");

  const unsafeAuditPayload = buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup({
    actionSource: "server_secret",
    booking_ref: "storage_object_id payment-token",
    disabledAccessUpload: {
      adminViewerEnabled: true,
      customerVisible: true,
      delivery_surface: "ots_photo_proof_access_upload_disabled_setup_only",
      external_send: true,
      liveAccessEnabled: true,
      no_op: false,
      photoUploadEnabled: true,
      reason: "uploaded",
      result_label: "uploaded",
      status: "uploaded",
      storageEnabled: true,
    },
    driver_job_token: "real-photo-bytes",
    service_code: "base64",
  });

  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingRef, null);
  assert.equal(unsafeAuditPayload.disabledAccessUploadStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "booking_ref",
    "disabled_access_upload_result",
  ]);
  assertDisabled(unsafeAuditPayload, "Unsafe OTS audit payload");
  assertDisabled(unsafeAuditPayload.audit_payload, "Unsafe OTS nested audit payload");
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe OTS blocked result");
  assertStorageMetadata(unsafeAuditPayload, "Unsafe OTS audit payload");
  assertNoRealPhotoOrStorage(unsafeAuditPayload, "Unsafe OTS audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin OTS photo proof access/upload audit payload setup foundation contract passed");
