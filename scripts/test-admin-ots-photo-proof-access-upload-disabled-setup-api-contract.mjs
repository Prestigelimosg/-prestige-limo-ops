import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-ots-photo-proof-access-upload-disabled-setup/route.ts";
const helperPath = "lib/admin-ots-photo-proof-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const plannedPrivateBucket = "ots-photo-proofs";
const futureStoragePathPattern = "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg";
const previewReadinessSetupApi = "admin-ots-photo-proof-preview-readiness-setup";
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
  const url = new URL("http://localhost/api/admin-ots-photo-proof-access-upload-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertPhotoProofDisabled(value, label) {
  assert.equal(value.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  assert.equal(value.storageEnabled, false, `${label} must keep storageEnabled false.`);
  assert.equal(value.adminViewerEnabled, false, `${label} must keep adminViewerEnabled false.`);
  assert.equal(value.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);

  if (Object.hasOwn(value, "external_send")) {
    assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  }
}

function assertMetadata(value, label, bookingRef = "unknown") {
  assert.deepEqual(
    value.metadata,
    {
      booking_ref: bookingRef,
      futureStoragePathPattern,
      plannedPrivateBucket,
      preview_readiness_source: previewReadinessSetupApi,
      proof_scope: "job_scoped",
    },
    `${label} must expose planned bucket/path only as setup metadata.`,
  );
}

function assertNoOpResult(result, label, bookingRef = "unknown") {
  assertPhotoProofDisabled(result, label);
  assert.equal(result.status, "blocked", `${label} must stay blocked.`);
  assert.equal(result.no_op, true, `${label} must stay no-op.`);
  assert.equal(result.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(result.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    result.preview_readiness_source,
    previewReadinessSetupApi,
    `${label} must reference the OTS preview/readiness setup API.`,
  );
  assertMetadata(result, label, bookingRef);
  assert.deepEqual(result.photo_upload, {
    photoUploadEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.storage, {
    status: "blocked",
    storageEnabled: false,
  });
  assert.deepEqual(result.admin_photo_viewer, {
    adminViewerEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.customer_access, {
    customerVisible: false,
    liveAccessEnabled: false,
    status: "blocked",
  });
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ots-photo-proof-disabled-api-"));

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
  "buildAdminOtsPhotoProofSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  previewReadinessSetupApi,
  "ots_photo_proof_access_upload_disabled_setup_only",
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "liveAccessEnabled: false",
  "external_send: false",
  plannedPrivateBucket,
  futureStoragePathPattern,
  "status: \"blocked\"",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled OTS photo proof API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "input type=\"file\"",
  "FormData",
  "URL.createObjectURL",
  "navigator.mediaDevices",
  "getUserMedia",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  "storage.from",
  ".upload(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "sendMessage",
  "send_message",
  "messages.create",
  "telegram",
  "whatsapp",
  "sms",
  "email",
  "stripe",
  "payment",
  "payout",
  "invoice",
  "AUTH_TOKEN",
  "ACCESS_TOKEN",
  "SECRET_KEY",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
  assert.ok(!helperSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden helper fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled OTS photo proof API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertPhotoProofDisabled(anonymous, "Anonymous blocked response");
  assertPhotoProofDisabled(anonymous.preview, "Anonymous blocked preview");
  assertPhotoProofDisabled(anonymous.readiness, "Anonymous blocked readiness");
  assertPhotoProofDisabled(anonymous.result, "Anonymous blocked result");
  assertPhotoProofDisabled(anonymous.setup, "Anonymous blocked setup");
  assertPhotoProofDisabled(anonymous.setup.policy, "Anonymous blocked setup policy");
  assertNoOpResult(anonymous.result, "Anonymous blocked result");
  assertMetadata(anonymous.preview, "Anonymous blocked preview");
  assertMetadata(anonymous.readiness, "Anonymous blocked readiness");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_ref: "PLO-OTS-DISABLED-001",
        driver_job_token: "driver-token-placeholder",
        service_code: "arrival",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "blocked");
  assert.equal(ready.delivery_surface, "ots_photo_proof_access_upload_disabled_setup_only");
  assert.equal(ready.preview_readiness_source, previewReadinessSetupApi);
  assertPhotoProofDisabled(ready, "Ready response");
  assertPhotoProofDisabled(ready.preview, "Ready preview");
  assertPhotoProofDisabled(ready.readiness, "Ready readiness");
  assertPhotoProofDisabled(ready.result, "Ready result");
  assertPhotoProofDisabled(ready.setup, "Ready setup");
  assertPhotoProofDisabled(ready.setup.policy, "Ready setup policy");
  assertNoOpResult(ready.result, "Ready result", "PLO-OTS-DISABLED-001");
  assertMetadata(ready.preview, "Ready preview", "PLO-OTS-DISABLED-001");
  assertMetadata(ready.readiness, "Ready readiness", "PLO-OTS-DISABLED-001");
  assert.equal(ready.preview.booking_ref, "PLO-OTS-DISABLED-001");
  assert.equal(ready.setup.booking_ref, "PLO-OTS-DISABLED-001");

  const camelResponse = await harness.route.GET(
    new Request(
      apiUrl({
        bookingReference: "PLO-OTS-DISABLED-002",
        driverJobToken: "driver-token-placeholder",
        serviceCode: "hourly",
      }),
      { headers: adminHeaders() },
    ),
  );
  const camel = await camelResponse.json();

  assert.equal(camelResponse.status, 200);
  assert.equal(camel.preview.booking_ref, "PLO-OTS-DISABLED-002");
  assertNoOpResult(camel.result, "Camel result", "PLO-OTS-DISABLED-002");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin OTS photo proof access upload disabled setup API contract passed");
