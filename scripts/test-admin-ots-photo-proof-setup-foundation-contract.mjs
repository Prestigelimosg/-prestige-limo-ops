import fs from "node:fs";
import assert from "node:assert/strict";

const sourcePath = "lib/admin-ots-photo-proof-setup-foundation.ts";
const source = fs.readFileSync(sourcePath, "utf8");

const requiredFragments = [
  "adminOtsPhotoProofSetupFoundationVersion",
  "buildAdminOtsPhotoProofSetupFoundation",
  "setup_only",
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

console.log("admin OTS photo proof setup foundation contract passed");
