import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-ots-photo-proof-preview-readiness-setup/route.ts";
const helperPath = "lib/admin-ots-photo-proof-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const storageBucketPlanned = "ots-photo-proofs";
const futureStoragePathPattern = "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg";
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
  const url = new URL("http://localhost/api/admin-ots-photo-proof-preview-readiness-setup");

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
}

function assertPlannedStorage(value, label) {
  assert.equal(value.storageBucketPlanned, storageBucketPlanned, `${label} must expose planned bucket only.`);
  assert.equal(
    value.futureStoragePathPattern,
    futureStoragePathPattern,
    `${label} must expose future path pattern only.`,
  );
}

function assertSetupFlags(value, label) {
  assertPhotoProofDisabled(value, label);
  assert.equal(value.driver_ots_photo_proof_planned, true, `${label} must keep driver proof planned.`);
  assert.equal(value.admin_photo_viewer_planned, true, `${label} must keep admin viewer planned.`);
  assert.equal(value.storage_bucket_planned, true, `${label} must keep storage bucket planned.`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ots-photo-proof-preview-api-"));

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
  "photoUploadEnabled",
  "storageEnabled",
  "adminViewerEnabled",
  "customerVisible",
  "liveAccessEnabled",
  storageBucketPlanned,
  futureStoragePathPattern,
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing OTS photo proof preview API fragment: ${fragment}`);
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

  assert.equal(anonymousResponse.status, 403, "OTS photo proof preview API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertPhotoProofDisabled(anonymous, "Anonymous blocked response");
  assertPhotoProofDisabled(anonymous.preview, "Anonymous blocked preview");
  assertPhotoProofDisabled(anonymous.readiness, "Anonymous blocked readiness");
  assertSetupFlags(anonymous.setup, "Anonymous blocked setup");
  assertPlannedStorage(anonymous, "Anonymous blocked response");
  assertPlannedStorage(anonymous.preview, "Anonymous blocked preview");
  assertPlannedStorage(anonymous.readiness, "Anonymous blocked readiness");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_ref: "PLO-OTS-API-001",
        driver_job_token: "driver-token-placeholder",
        service_code: "arrival",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "setup_only");
  assertPhotoProofDisabled(ready, "Ready response");
  assertPhotoProofDisabled(ready.preview, "Ready preview");
  assertPhotoProofDisabled(ready.readiness, "Ready readiness");
  assertSetupFlags(ready.setup, "Ready setup");
  assertPhotoProofDisabled(ready.setup.policy, "Ready setup policy");
  assertPlannedStorage(ready, "Ready response");
  assertPlannedStorage(ready.preview, "Ready preview");
  assertPlannedStorage(ready.readiness, "Ready readiness");
  assert.equal(ready.preview.booking_ref, "PLO-OTS-API-001");
  assert.equal(ready.setup.booking_ref, "PLO-OTS-API-001");
  assert.equal(ready.readiness.proof_scope, "job_scoped");
  assert.equal(ready.readiness.future_customer_visibility, "disabled_by_default");

  const camelResponse = await harness.route.GET(
    new Request(
      apiUrl({
        bookingReference: "PLO-OTS-API-002",
        driverJobToken: "driver-token-placeholder",
        serviceCode: "hourly",
      }),
      { headers: adminHeaders() },
    ),
  );
  const camel = await camelResponse.json();

  assert.equal(camelResponse.status, 200);
  assert.equal(camel.preview.booking_ref, "PLO-OTS-API-002");
  assertPhotoProofDisabled(camel, "Camel response");
  assertPlannedStorage(camel, "Camel response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin OTS photo proof preview readiness setup API contract passed");
