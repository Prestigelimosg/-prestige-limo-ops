import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-ots-photo-proof-setup/route.ts",
  "app/api/admin-ots-photo-proof-preview-readiness-setup/route.ts",
  "app/api/admin-ots-photo-proof-access-upload-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/admin-ots-photo-proof-setup-foundation.ts",
  "lib/admin-ots-photo-proof-access-upload-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "admin-ots-photo-proof-preview-readiness-setup",
  "admin-ots-photo-proof-access-upload-disabled-setup",
  "admin_ots_photo_proof_access_upload_audit_payload_setup_only",
  "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg",
  "ots-photo-proofs",
  "ots_photo_proof_access_upload_disabled_setup_only",
  "setup_only",
  "setup_only_disabled",
];
const disallowedPackageNames = new Set([
  "@aws-sdk/client-s3",
  "@auth/core",
  "aws-sdk",
  "cloudinary",
  "filestack-js",
  "firebase",
  "formidable",
  "jose",
  "jsonwebtoken",
  "multer",
  "next-auth",
  "sharp",
  "stripe",
  "uploadcare-widget",
]);
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@aws-sdk\/client-s3|@supabase\/supabase-js|aws-sdk|cloudinary|filestack-js|firebase|formidable|jose|jsonwebtoken|multer|next-auth|sharp|stripe|uploadcare-widget)["']|require\(\s*["'](?:@aws-sdk\/client-s3|@supabase\/supabase-js|aws-sdk|cloudinary|filestack-js|firebase|formidable|jose|jsonwebtoken|multer|next-auth|sharp|stripe|uploadcare-widget)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bSTORAGE_[A-Z_]*\b|\bPHOTO_[A-Z_]*\b|\bUPLOAD_[A-Z_]*\b|\bS3_[A-Z_]*\b|\bAWS_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/;
const dbOrStorageActivationPattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|storage\.from|createBucket|deleteBucket|getBucket|listBuckets|createSignedUrl|getPublicUrl|download\s*\(|\.upload\s*\(/i;
const cameraOrFileActivationPattern =
  /input\s+type=["']file|FormData|URL\.createObjectURL|navigator\.mediaDevices|getUserMedia|FileReader|new\s+Blob\s*\(|new\s+File\s*\(|arrayBuffer\s*\(|readAsDataURL|capture\s*=\s*["']camera/i;
const liveTruePattern =
  /photoUploadEnabled\s*[:=]\s*true|storageEnabled\s*[:=]\s*true|adminViewerEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const storagePolicyActivationPattern =
  /createPolicy|create_policy|storagePolicyEnabled\s*[:=]\s*true|storagePolicyActivated\s*[:=]\s*true|policyActivated\s*[:=]\s*true|bucketCreated\s*[:=]\s*true|storageBucketEnabled\s*[:=]\s*true/i;
const authActivationPattern =
  /\bcookies\s*\(|\bheaders\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|validateSession|sessionToken|bearer\s+|Authorization/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /base64|binary|data:image|driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|server_secret|secret|stripe|storage_object_id|signed_url|download_url|real-photo-bytes|real_storage_object/i;
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

function assertOtsDisabled(value, label) {
  assert.equal(value?.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  assert.equal(value?.storageEnabled, false, `${label} must keep storageEnabled false.`);
  assert.equal(value?.adminViewerEnabled, false, `${label} must keep adminViewerEnabled false.`);
  assert.equal(value?.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value?.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value?.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.external_send ?? false, false, `${label} must keep external_send false.`);
}

function assertBlockedNoOp(value, label) {
  assertOtsDisabled(value, label);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
}

function assertSetupMetadata(value, label, bookingRef) {
  assert.equal(value?.metadata?.futureStoragePathPattern, "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg", `${label} must expose only the planned future path pattern.`);
  assert.equal(value?.metadata?.plannedPrivateBucket, "ots-photo-proofs", `${label} must expose only the planned private bucket.`);
  assert.equal(value?.metadata?.preview_readiness_source, "admin-ots-photo-proof-preview-readiness-setup", `${label} must reference the preview/readiness setup API.`);

  if (bookingRef !== undefined) {
    assert.equal(value?.metadata?.booking_ref, bookingRef, `${label} must keep the safe booking ref in setup metadata.`);
  }
}

function assertAuditMetadata(value, label) {
  assert.deepEqual(
    value.metadata,
    {
      futureStoragePathPattern: "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg",
      photoType: "OTS",
      plannedPrivateBucket: "ots-photo-proofs",
      preview_readiness_source: "admin-ots-photo-proof-preview-readiness-setup",
      realPhotoDataIncluded: false,
      realStorageObjectIncluded: false,
    },
    `${label} must expose planned storage metadata only.`,
  );
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not reveal real photo/storage data, provider, payment, payout, token, or secret fields.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ots-photo-proof-no-live-"));
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
        "lib/admin-ots-photo-proof-access-upload-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      disabledAccessUpload: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-ots-photo-proof-access-upload-disabled-setup/route.js",
        ),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-ots-photo-proof-preview-readiness-setup/route.js",
        ),
      ),
      setup: requireFromHarness(
        path.join(tempDir, "app/api/admin-ots-photo-proof-setup/route.js"),
      ),
    },
    setup: requireFromHarness(path.join(tempDir, "lib/admin-ots-photo-proof-setup-foundation.js")),
  };
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    disallowedPackageNames.has(packageName),
    false,
    `OTS photo proof setup must not add live upload/auth/storage/payment package: ${packageName}`,
  );
}

const appApiFiles = await listFiles("app/api");
const otsPhotoProofRouteFiles = appApiFiles
  .filter((file) => file.endsWith("route.ts") && file.includes("admin-ots-photo-proof"))
  .sort();

assert.deepEqual(
  otsPhotoProofRouteFiles,
  [...routeFiles].sort(),
  "OTS photo proof chain must not add duplicate or live access/upload routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/upload/storage verbs.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import storage/auth/provider/payment SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read provider/env/auth secrets.`);
  assert.equal(dbOrStorageActivationPattern.test(source), false, `${file} must not use DB or storage writes.`);
  assert.equal(cameraOrFileActivationPattern.test(source), false, `${file} must not activate camera/file upload behavior.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable OTS live flags.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(storagePolicyActivationPattern.test(source), false, `${file} must not activate storage policies or buckets.`);
  assert.equal(authActivationPattern.test(source), false, `${file} must not activate auth/session access.`);
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only OTS photo proof string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup } = harness.auditPayload;
  const { buildAdminOtsPhotoProofSetupFoundation } = harness.setup;
  const setup = buildAdminOtsPhotoProofSetupFoundation({
    booking_ref: "PLO-OTS-NO-LIVE-001",
    driver_job_token: "driver-token-placeholder",
    service_code: "arrival",
  });

  assertOtsDisabled(setup, "OTS photo proof setup helper");
  assertOtsDisabled(setup.policy, "OTS photo proof setup policy");
  assert.equal(setup.status, "setup_only");
  assert.equal(setup.booking_ref, "PLO-OTS-NO-LIVE-001");
  assert.equal(setup.driver_ots_photo_proof_planned, true);
  assert.equal(setup.admin_photo_viewer_planned, true);
  assert.equal(setup.storage_bucket_planned, true);
  assertNoUnsafeOutput(setup, "OTS photo proof setup helper");

  const setupRouteResponse = await harness.routes.setup.GET(
    new Request(
      apiUrl("/api/admin-ots-photo-proof-setup", {
        booking_ref: "PLO-OTS-NO-LIVE-SETUP-API",
        driver_job_token: "driver-token-placeholder",
        service_code: "arrival",
      }),
      { headers: adminHeaders() },
    ),
  );
  const setupRoute = await setupRouteResponse.json();

  assert.equal(setupRouteResponse.status, 200);
  assert.equal(setupRoute.ok, true);
  assertOtsDisabled(setupRoute.setup, "OTS photo proof setup API setup");
  assertOtsDisabled(setupRoute.setup.policy, "OTS photo proof setup API policy");
  assertNoUnsafeOutput(setupRoute, "OTS photo proof setup API");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-ots-photo-proof-preview-readiness-setup", {
        booking_ref: "PLO-OTS-NO-LIVE-002",
        driver_job_token: "driver-token-placeholder",
        service_code: "departure",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assertOtsDisabled(preview, "OTS photo proof preview/readiness API");
  assertOtsDisabled(preview.preview, "OTS photo proof preview/readiness API preview");
  assertOtsDisabled(preview.readiness, "OTS photo proof preview/readiness API readiness");
  assertOtsDisabled(preview.setup, "OTS photo proof preview/readiness API setup");
  assertOtsDisabled(preview.setup.policy, "OTS photo proof preview/readiness API policy");
  assert.equal(preview.storageBucketPlanned, "ots-photo-proofs");
  assert.equal(preview.futureStoragePathPattern, "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg");
  assert.equal(preview.preview.booking_ref, "PLO-OTS-NO-LIVE-002");
  assertNoUnsafeOutput(preview, "OTS photo proof preview/readiness API");

  const anonymousDisabledResponse = await harness.routes.disabledAccessUpload.GET(
    new Request(apiUrl("/api/admin-ots-photo-proof-access-upload-disabled-setup")),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertOtsDisabled(anonymousDisabled, "Anonymous disabled OTS access/upload API");
  assertOtsDisabled(anonymousDisabled.result, "Anonymous disabled OTS access/upload result");
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled OTS access/upload result");
  assertSetupMetadata(anonymousDisabled.result, "Anonymous disabled OTS access/upload result", "unknown");

  const disabledResponse = await harness.routes.disabledAccessUpload.GET(
    new Request(
      apiUrl("/api/admin-ots-photo-proof-access-upload-disabled-setup", {
        booking_ref: "PLO-OTS-NO-LIVE-003",
        driver_job_token: "driver-token-placeholder",
        service_code: "arrival",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();

  assert.equal(disabledResponse.status, 200);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.status, "blocked");
  assertOtsDisabled(disabled, "Disabled OTS access/upload API");
  assertOtsDisabled(disabled.preview, "Disabled OTS access/upload preview");
  assertOtsDisabled(disabled.readiness, "Disabled OTS access/upload readiness");
  assertOtsDisabled(disabled.result, "Disabled OTS access/upload result");
  assertOtsDisabled(disabled.setup, "Disabled OTS access/upload setup");
  assertOtsDisabled(disabled.setup.policy, "Disabled OTS access/upload policy");
  assertBlockedNoOp(disabled.result, "Disabled OTS access/upload result");
  assertSetupMetadata(disabled.result, "Disabled OTS access/upload result", "PLO-OTS-NO-LIVE-003");
  assert.deepEqual(disabled.result.photo_upload, {
    photoUploadEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.storage, {
    status: "blocked",
    storageEnabled: false,
  });
  assert.deepEqual(disabled.result.admin_photo_viewer, {
    adminViewerEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.customer_access, {
    customerVisible: false,
    liveAccessEnabled: false,
    status: "blocked",
  });
  assertNoUnsafeOutput(disabled, "Disabled OTS access/upload API");

  const auditPayload = buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup({
    actionSource: "disabled_access_upload_api",
    disabledAccessUpload: disabled.result,
    setup,
  });

  assertOtsDisabled(auditPayload, "OTS access/upload audit payload");
  assertOtsDisabled(auditPayload.audit_payload, "OTS access/upload nested audit payload");
  assertOtsDisabled(auditPayload.blocked_no_op_result, "OTS access/upload blocked result");
  assertOtsDisabled(auditPayload.audit_payload.result, "OTS access/upload nested audit result");
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "OTS access/upload blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "OTS access/upload nested audit result");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.audit_payload.auditWriteEnabled, false);
  assert.equal(auditPayload.bookingRef, "PLO-OTS-NO-LIVE-001");
  assert.equal(auditPayload.photoType, "OTS");
  assert.equal(auditPayload.disabledAccessUploadStatus, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertAuditMetadata(auditPayload, "OTS access/upload audit payload");
  assertAuditMetadata(auditPayload.audit_payload, "OTS access/upload nested audit payload");
  assertNoUnsafeOutput(auditPayload, "OTS access/upload audit payload");

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

  assertOtsDisabled(unsafeAuditPayload, "Unsafe OTS access/upload audit payload");
  assertOtsDisabled(unsafeAuditPayload.audit_payload, "Unsafe OTS access/upload nested audit payload");
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe OTS access/upload blocked result");
  assert.equal(unsafeAuditPayload.auditWriteEnabled, false);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingRef, null);
  assert.equal(unsafeAuditPayload.disabledAccessUploadStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "booking_ref",
    "disabled_access_upload_result",
  ]);
  assertAuditMetadata(unsafeAuditPayload, "Unsafe OTS access/upload audit payload");
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe OTS access/upload audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("OTS photo proof no-live guard passed");
