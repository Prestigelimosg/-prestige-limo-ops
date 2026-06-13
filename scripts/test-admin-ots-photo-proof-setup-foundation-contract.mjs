import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const sourcePath = "lib/admin-ots-photo-proof-setup-foundation.ts";
const source = await readFile(sourcePath, "utf8");

const requiredFragments = [
  "adminOtsPhotoProofSetupFoundationVersion",
  "buildAdminOtsPhotoProofSetupFoundation",
  "setup_only",
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "liveAccessEnabled: false",
  "driver_ots_photo_proof_planned: true",
  "admin_photo_viewer_planned: true",
  "storage_bucket_planned: true",
  "ots_photo_proof_status",
  "camera_capture_status",
  "file_upload_status",
  "storage_status",
  "disabled",
  "job_scoped",
  "driver_ots",
  "admin_only",
  "disabled_by_default",
];

for (const fragment of requiredFragments) {
  assert.ok(source.includes(fragment), `Missing OTS photo proof setup fragment: ${fragment}`);
}

const forbiddenFragments = [
  "input type=\"file\"",
  "FormData",
  "URL.createObjectURL",
  "navigator.mediaDevices",
  "getUserMedia",
  "camera(",
  "fetch(",
  "createClient",
  "supabase",
  "storage.from",
  ".upload(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "/api/",
  "process.env",
  "sendMessage",
  "telegram",
  "whatsapp",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
];

for (const fragment of forbiddenFragments) {
  assert.ok(
    !source.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden OTS photo proof setup fragment found: ${fragment}`,
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-ots-photo-proof-setup-"));
  const outputPath = path.join(tempDir, sourcePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

function assertPhotoProofDisabled(value, label) {
  assert.equal(value.photoUploadEnabled, false, `${label} must keep photoUploadEnabled false.`);
  assert.equal(value.storageEnabled, false, `${label} must keep storageEnabled false.`);
  assert.equal(value.adminViewerEnabled, false, `${label} must keep adminViewerEnabled false.`);
  assert.equal(value.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
}

const harness = await loadHelper();

try {
  const { buildAdminOtsPhotoProofSetupFoundation } = harness.helper;
  const setup = buildAdminOtsPhotoProofSetupFoundation({
    booking_ref: "PLO-OTS-001",
    driver_job_token: "driver-job-token-placeholder",
    service_code: "arrival",
  });

  assert.deepEqual(setup, {
    adminViewerEnabled: false,
    admin_photo_viewer_planned: true,
    booking_ref: "PLO-OTS-001",
    camera_capture_status: "disabled",
    customerVisible: false,
    driver_ots_photo_proof_planned: true,
    file_upload_status: "disabled",
    future_customer_visibility: "disabled_by_default",
    future_trigger: "driver_ots",
    future_visibility: "admin_only",
    liveAccessEnabled: false,
    notes: [
      "Setup foundation only.",
      "No real camera capture is active.",
      "No real file upload is active.",
      "No storage write is active.",
      "Future storage bucket is planned but not active.",
      "Future admin photo viewer is planned but not active.",
      "Future proof must attach to the assigned job only.",
      "Future customer visibility stays disabled unless separately approved.",
    ],
    ots_photo_proof_status: "disabled",
    photoUploadEnabled: false,
    policy: {
      adminViewerEnabled: false,
      admin_photo_viewer_planned: true,
      customerVisible: false,
      driver_ots_photo_proof_planned: true,
      liveAccessEnabled: false,
      photoUploadEnabled: false,
      storageEnabled: false,
      storage_bucket_planned: true,
    },
    proof_scope: "job_scoped",
    status: "setup_only",
    storageEnabled: false,
    storage_bucket_planned: true,
    storage_status: "disabled",
    version: "admin-ots-photo-proof-setup-foundation:v1",
  });
  assertPhotoProofDisabled(setup, "OTS photo proof setup");
  assertPhotoProofDisabled(setup.policy, "OTS photo proof policy");

  const fallback = buildAdminOtsPhotoProofSetupFoundation({});

  assert.equal(fallback.booking_ref, "unknown");
  assertPhotoProofDisabled(fallback, "Fallback OTS photo proof setup");
  assertPhotoProofDisabled(fallback.policy, "Fallback OTS photo proof policy");
} finally {
  await harness.cleanup();
}

console.log("admin OTS photo proof setup foundation contract passed");
