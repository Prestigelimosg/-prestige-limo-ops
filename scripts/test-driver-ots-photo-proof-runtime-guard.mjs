import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const files = Object.fromEntries(
  await Promise.all(
    [
      "app/api/admin-driver-ots-photo-proofs/route.ts",
      "app/api/driver-job/[token]/ots-photo/route.ts",
      "app/driver-job/[token]/page.tsx",
      "app/my-bookings/page.tsx",
      "app/page.tsx",
      "app/book/page.tsx",
      "lib/admin-ots-photo-proof-setup-foundation.ts",
      "lib/driver-ots-photo-proof-persistence.ts",
      "supabase/migrations/202607030002_driver_ots_photo_proofs.sql",
    ].map(async (path) => [path, await readFile(path, "utf8")]),
  ),
);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, pattern, label) {
  assert.equal(pattern.test(source), false, `${label} must not match ${pattern}.`);
}

const driverRoute = files["app/api/driver-job/[token]/ots-photo/route.ts"];
const adminRoute = files["app/api/admin-driver-ots-photo-proofs/route.ts"];
const driverPage = files["app/driver-job/[token]/page.tsx"];
const adminPage = files["app/page.tsx"];
const persistence = files["lib/driver-ots-photo-proof-persistence.ts"];
const migration = files["supabase/migrations/202607030002_driver_ots_photo_proofs.sql"];
const setupFoundation = files["lib/admin-ots-photo-proof-setup-foundation.ts"];
const customerPublicSources = `${files["app/book/page.tsx"]}\n${files["app/my-bookings/page.tsx"]}`;
const driverOtsUploadFunctionStart = driverPage.indexOf(
  "async function uploadDriverOtsPhotoProof()",
);
const driverOtsUploadFunctionEnd = driverPage.indexOf(
  "async function updateStatus(",
  driverOtsUploadFunctionStart,
);
const driverOtsSectionStart = driverPage.indexOf(
  'data-driver-job-ots-photo-proof="true"',
);
const driverOtsSectionEnd = driverPage.indexOf(
  'data-driver-job-status-timing-evidence="true"',
  driverOtsSectionStart,
);

assert.ok(driverOtsUploadFunctionStart >= 0, "Missing driver OTS upload function boundary.");
assert.ok(
  driverOtsUploadFunctionEnd > driverOtsUploadFunctionStart,
  "Missing driver OTS upload function end boundary.",
);
assert.ok(driverOtsSectionStart >= 0, "Missing driver OTS UI section boundary.");
assert.ok(
  driverOtsSectionEnd > driverOtsSectionStart,
  "Missing driver OTS UI section end boundary.",
);

const driverOtsApprovedSurface = `${driverPage.slice(
  driverOtsUploadFunctionStart,
  driverOtsUploadFunctionEnd,
)}\n${driverPage.slice(driverOtsSectionStart, driverOtsSectionEnd)}`;

for (const fragment of [
  "future_trigger: \"driver_ots\"",
  "future_visibility: \"admin_only\"",
  "storage_bucket_planned: true",
]) {
  assertIncludes(setupFoundation, fragment, `planned OTS setup fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "request.formData()",
  "uploadDriverOtsPhotoProofForToken",
  "getDriverJobPayloadForTokenContract",
  "customerVisible: false",
  "external_send: false",
  "ots_required",
]) {
  assertIncludes(driverRoute, fragment, `driver OTS route fragment: ${fragment}`);
}

assertExcludes(driverRoute, /export async function (GET|PUT|PATCH|DELETE)/, "driver OTS route extra verbs");
assertExcludes(
  driverRoute,
  /customer_price|billing|invoice|payment|driver_payout|payout|paynow|internal_admin|internal_finance|parser_debug|mock_archive|service_role|token_hash/i,
  "driver OTS route unsafe output surface",
);

for (const fragment of [
  "import \"server-only\"",
  "driverOtsPhotoProofBucketName = \"ots-photo-proofs\"",
  "hashDriverJobLinkToken",
  ".eq(\"status_value\", \"ots\")",
  ".from(driverOtsPhotoProofBucketName)",
  ".upload(storagePath",
  ".from(\"driver_ots_photo_proofs\")",
  ".insert(insertRow)",
  "createSignedUrl",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(persistence, fragment, `persistence fragment: ${fragment}`);
}

assertExcludes(
  persistence,
  /customer_price|billing|invoice|payment|driver_payout|payout|paynow|internal_admin_note|internal_finance_note|parser_debug|mock_archive|getPublicUrl|data:image|base64/i,
  "persistence unsafe field/output",
);

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "loadAdminDriverOtsPhotoProofs",
  "export async function GET",
  "customerVisible: false",
  "external_send: false",
]) {
  assertIncludes(adminRoute, fragment, `admin OTS proof route fragment: ${fragment}`);
}

assertExcludes(adminRoute, /export async function (POST|PUT|PATCH|DELETE)/, "admin OTS proof route extra verbs");

for (const fragment of [
  "/api/driver-job/${encodeURIComponent(token)}/ots-photo",
  "data-driver-job-ots-photo-proof-input=\"true\"",
  "capture=\"environment\"",
  "const driverOtsPhotoMaxRequestBytes = 4 * 1024 * 1024",
  "const driverOtsPhotoMaxDimension = 1600",
  "prepareDriverOtsPhotoForUpload",
  "createImageBitmap(file)",
  "canvas.toBlob",
  "new FormData",
  'formData.append("photo", preparedPhoto.blob, preparedPhoto.fileName)',
  'response.status === 413 ? "too_large"',
  "Large phone photos are reduced automatically before sending.",
  "Admin-only proof. No customer message or external send is created from here.",
]) {
  assertIncludes(driverPage, fragment, `driver page approved OTS fragment: ${fragment}`);
}

assertExcludes(
  driverOtsApprovedSurface,
  /URL\.createObjectURL|navigator\.mediaDevices|getUserMedia|storage\.from|\.upload\s*\(|x-prestige-admin-session-token|Authorization/i,
  "driver page forbidden OTS behavior",
);

assertIncludes(
  persistence,
  "const maxUploadBytes = 4 * 1024 * 1024",
  "persistence Vercel-safe maximum upload size",
);

for (const fragment of [
  "adminDriverOtsPhotoProofsApiPath",
  "loadAdminDriverOtsPhotoProofRead",
  "data-admin-multi-driver-active-job-ots-photo-proof=\"true\"",
  "data-admin-driver-ots-photo-proof-readout=\"true\"",
  "data-admin-driver-ots-photo-proof-visible-readout=\"true\"",
  "data-admin-driver-ots-photo-proof-visible-refresh=\"true\"",
  "data-admin-driver-ots-photo-proof-visible-view=\"true\"",
  "{adminDriverOtsPhotoProofLatest ? (",
  "View photo",
]) {
  assertIncludes(adminPage, fragment, `admin Dispatch OTS proof fragment: ${fragment}`);
}

assertExcludes(
  adminPage,
  /Photo will appear here after driver sends it from the job link\./,
  "Dispatch no-photo outstanding-task placeholder",
);

assertExcludes(customerPublicSources, /ots-photo|photo-proof|driver_ots_photo_proofs|ots-photo-proofs/i, "customer public pages");

for (const fragment of [
  "insert into storage.buckets",
  "'ots-photo-proofs'",
  "false",
  "create table if not exists public.driver_ots_photo_proofs",
  "references public.driver_job_links",
  "references public.driver_job_status_events",
  "alter table public.driver_ots_photo_proofs enable row level security",
  "grant select, insert, update, delete on public.driver_ots_photo_proofs to service_role",
]) {
  assertIncludes(migration, fragment, `migration fragment: ${fragment}`);
}

assertExcludes(
  migration,
  /\b(customer_price|billing|invoice|payment|driver_payout|payout|paynow|internal_admin_note|internal_finance_note|parser_debug|mock_archive)\b\s+(?:text|numeric|integer|jsonb)|public\s*,\s*true/i,
  "migration unsafe fields",
);

console.log("driver OTS photo proof runtime guard passed");
