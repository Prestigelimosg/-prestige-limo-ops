import fs from "node:fs";
import assert from "node:assert/strict";

const routePath = "app/api/admin-ots-photo-proof-setup/route.ts";
const helperPath = "lib/admin-ots-photo-proof-setup-foundation.ts";

const route = fs.readFileSync(routePath, "utf8");
const helper = fs.readFileSync(helperPath, "utf8");
const combined = `${route}\n${helper}`;

const requiredFragments = [
  "adminOtsPhotoProofSetupFoundationVersion",
  "buildAdminOtsPhotoProofSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "setup_only",
  "ots_photo_proof_status",
  "camera_capture_status",
  "file_upload_status",
  "storage_status",
  "job_scoped",
  "driver_ots",
  "admin_only",
  "disabled_by_default",
  "booking_ref",
  "driver_job_token",
  "service_code",
];

for (const fragment of requiredFragments) {
  assert.ok(combined.includes(fragment), `Missing OTS photo proof setup API fragment: ${fragment}`);
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
    !combined.toLowerCase().includes(fragment.toLowerCase()),
    `Forbidden OTS photo proof setup API fragment found: ${fragment}`,
  );
}

assert.ok(!route.includes("export async function POST"), "Route must not expose POST");
assert.ok(!route.includes("export async function PUT"), "Route must not expose PUT");
assert.ok(!route.includes("export async function PATCH"), "Route must not expose PATCH");
assert.ok(!route.includes("export async function DELETE"), "Route must not expose DELETE");

console.log("admin OTS photo proof setup API contract passed");
