import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-ots-photo-proof-surface-guard.mjs";

const setupRoutePath = "app/api/admin-ots-photo-proof-setup/route.ts";
const previewReadinessRoutePath =
  "app/api/admin-ots-photo-proof-preview-readiness-setup/route.ts";
const disabledAccessUploadRoutePath =
  "app/api/admin-ots-photo-proof-access-upload-disabled-setup/route.ts";
const setupHelperPath = "lib/admin-ots-photo-proof-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/admin-ots-photo-proof-access-upload-audit-payload-setup-foundation.ts";
const publicClientPaths = [
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "app/driver-job/[token]/page.tsx",
];

const contractChecks = [
  {
    label: "admin OTS photo proof setup foundation contract",
    script: "scripts/test-admin-ots-photo-proof-setup-foundation-contract.mjs",
    requiredFragments: [
      "adminOtsPhotoProofSetupFoundationVersion",
      "photoUploadEnabled: false",
      "admin OTS photo proof setup foundation contract passed",
    ],
  },
  {
    label: "admin OTS photo proof setup API contract",
    script: "scripts/test-admin-ots-photo-proof-setup-api-contract.mjs",
    requiredFragments: [
      "admin-ots-photo-proof-setup",
      "resolveAdminDispatcherBoundary",
      "admin OTS photo proof setup API contract passed",
    ],
  },
  {
    label: "admin OTS photo proof preview readiness setup API contract",
    script: "scripts/test-admin-ots-photo-proof-preview-readiness-setup-api-contract.mjs",
    requiredFragments: [
      "admin-ots-photo-proof-preview-readiness-setup",
      "OTS photo proof preview API must stay admin-gated.",
      "admin OTS photo proof preview readiness setup API contract passed",
    ],
  },
  {
    label: "admin OTS photo proof access upload disabled setup API contract",
    script: "scripts/test-admin-ots-photo-proof-access-upload-disabled-setup-api-contract.mjs",
    requiredFragments: [
      "ots_photo_proof_access_upload_disabled_setup_only",
      "Disabled OTS photo proof API must stay admin-gated.",
      "admin OTS photo proof access upload disabled setup API contract passed",
    ],
  },
  {
    label: "admin OTS photo proof access/upload audit payload setup foundation contract",
    script: "scripts/test-admin-ots-photo-proof-access-upload-audit-payload-setup-foundation-contract.mjs",
    requiredFragments: [
      "admin_ots_photo_proof_access_upload_audit_payload_setup_only",
      "auditWriteEnabled: false",
      "admin OTS photo proof access/upload audit payload setup foundation contract passed",
    ],
  },
  {
    label: "OTS photo proof no-live guard",
    script: "scripts/test-admin-ots-photo-proof-no-live-guard.mjs",
    requiredFragments: [
      "OTS photo proof setup must not add live upload/auth/storage/payment package",
      "OTS photo proof no-live guard passed",
    ],
  },
];

const routeForbiddenRuntimeFragments = [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "request.json",
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
  "cookies(",
  "headers(",
  "input type=\"file\"",
  "input type='file'",
  "FormData",
  "URL.createObjectURL",
  "navigator.mediaDevices",
  "getUserMedia",
  "FileReader",
  "new Blob(",
  "new File(",
  "arrayBuffer(",
  "readAsDataURL",
  "storage.from",
  ".upload(",
];

const providerStorageOrPaymentPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@aws-sdk\/client-s3|@auth\/core|@supabase\/supabase-js|aws-sdk|cloudinary|filestack-js|firebase|formidable|jose|jsonwebtoken|multer|next-auth|sharp|stripe|uploadcare-widget)["']|require\(\s*["'](?:@aws-sdk\/client-s3|@auth\/core|@supabase\/supabase-js|aws-sdk|cloudinary|filestack-js|firebase|formidable|jose|jsonwebtoken|multer|next-auth|sharp|stripe|uploadcare-widget)["']\s*\)|\b(?:Cloudinary|Firebase|Multer|NextAuth|Sharp|Stripe|Uploadcare)\b|messages\.create|checkoutSession|paymentLink|paynow/i;
const liveOtsFlagPattern =
  /photoUploadEnabled\s*[:=]\s*true|storageEnabled\s*[:=]\s*true|adminViewerEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const otsActivationPattern =
  /input\s+type=["']file|FormData|URL\.createObjectURL|navigator\.mediaDevices|getUserMedia|FileReader|new\s+Blob\s*\(|new\s+File\s*\(|arrayBuffer\s*\(|readAsDataURL|capture\s*=\s*["']camera|storage\.from|\.upload\s*\(|createSignedUrl|getPublicUrl|download\s*\(|createBucket|createPolicy|bucketCreated\s*[:=]\s*true|storageBucketEnabled\s*[:=]\s*true/i;
const unsafeOutputPattern =
  /data:image|base64|binary|storage_object_id|signed_url|download_url|raw_token|service_role|server_secret|secret|api_key|access_token|customer_price|driver_payout|payout_amount|paynow|billing|invoice|payment|internal_admin|internal_finance|parser_debug|mock_archive/i;

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.toLowerCase().includes(String(fragmentOrPattern).toLowerCase());

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function countMatches(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function exportedMethods(source) {
  return [...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
}

function stripBlockedFragmentDenylist(source) {
  return source.replace(/const blockedFragments = \[[\s\S]*?\];\n/, "");
}

function runContractCheck({ label, script, requiredFragments }) {
  const scriptSource = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(scriptSource, fragment, `${label} contract fragment`);
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  setupRoutePath,
  previewReadinessRoutePath,
  disabledAccessUploadRoutePath,
  setupHelperPath,
  auditPayloadHelperPath,
  ...publicClientPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const setupRoute = files[setupRoutePath];
const previewReadinessRoute = files[previewReadinessRoutePath];
const disabledAccessUploadRoute = files[disabledAccessUploadRoutePath];
const setupHelper = files[setupHelperPath];
const auditPayloadHelper = files[auditPayloadHelperPath];
const ledgerSection = sectionBetween(ledger, "### Public OTS Photo Proof Surface Guard Lock");

for (const phrase of [
  "Public OTS photo proof setup surfaces are guarded across `/api/admin-ots-photo-proof-setup`, `/api/admin-ots-photo-proof-preview-readiness-setup`, `/api/admin-ots-photo-proof-access-upload-disabled-setup`, `lib/admin-ots-photo-proof-setup-foundation.ts`, `lib/admin-ots-photo-proof-access-upload-audit-payload-setup-foundation.ts`, and public client pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, camera capture, file upload, Supabase Storage, admin photo viewer, customer photo visibility, or new shims.",
  "`/api/admin-ots-photo-proof-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, and limited to disabled OTS photo proof, camera-capture, file-upload, storage, admin-viewer, and customer-visibility setup payloads.",
  "`/api/admin-ots-photo-proof-preview-readiness-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `photoUploadEnabled`, `storageEnabled`, `adminViewerEnabled`, `customerVisible`, and `liveAccessEnabled` all false.",
  "`/api/admin-ots-photo-proof-access-upload-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, camera-free, upload-free, storage-write-free, admin-viewer-free, customer-visibility-free, provider-send-free, cookie-free, and limited to blocked access/upload/readiness/preview payloads.",
  "The setup and access/upload audit helpers must stay setup-only, no-live, no-op, and must not use camera APIs, file upload APIs, storage APIs, provider/env reads, Supabase clients, DB/storage writes, auth/session activation, payment APIs, or photo data payloads.",
  "Public client pages must not call OTS photo proof setup, access, upload, or preview routes until separate OTS photo activation/UI approval exists.",
  "OTS photo proof setup surfaces must exclude customer price, billing, invoice/payment/PDF, driver payout, PayNow payout details, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, real photo bytes, storage object IDs, signed/download URLs, live location fields, and mock QA/dev archive fields.",
  "This guard coordinates the setup foundation contract, setup API contract, preview/readiness API contract, disabled access/upload API contract, access/upload audit payload setup contract, and OTS photo proof no-live guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-ots-photo-proof-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public OTS photo proof ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation OTS photo proof guard registration");

for (const check of contractChecks) {
  runContractCheck(check);
}

assert.deepEqual(exportedMethods(setupRoute), ["GET"], "admin OTS photo proof setup route exported methods");
assert.deepEqual(exportedMethods(previewReadinessRoute), ["GET"], "preview/readiness route exported methods");
assert.deepEqual(exportedMethods(disabledAccessUploadRoute), ["GET"], "disabled access/upload route exported methods");

for (const fragment of [
  "buildAdminOtsPhotoProofSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "booking_ref",
  "driver_job_token",
  "service_code",
  "version: setup.version",
]) {
  assertIncludes(setupRoute, fragment, `admin OTS photo proof setup route ${fragment}`);
}

for (const fragment of [
  "buildAdminOtsPhotoProofSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "futureStoragePathPattern",
  "storageBucketPlanned",
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "liveAccessEnabled: false",
  "previewFor",
  "readinessFor",
]) {
  assertIncludes(previewReadinessRoute, fragment, `preview/readiness route ${fragment}`);
}

for (const fragment of [
  "buildAdminOtsPhotoProofSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "ots_photo_proof_access_upload_disabled_setup_only",
  "admin_photo_viewer",
  "customer_access",
  "photo_upload",
  "storage",
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "external_send: false",
  "liveAccessEnabled: false",
  "no_op: true",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
  "status: \"blocked\"",
]) {
  assertIncludes(disabledAccessUploadRoute, fragment, `disabled access/upload route ${fragment}`);
}

for (const fragment of [
  "adminOtsPhotoProofSetupFoundationVersion",
  "buildAdminOtsPhotoProofSetupFoundation",
  "status: \"setup_only\"",
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "liveAccessEnabled: false",
  "driver_ots_photo_proof_planned: true",
  "admin_photo_viewer_planned: true",
  "storage_bucket_planned: true",
  "ots_photo_proof_status: \"disabled\"",
  "camera_capture_status: \"disabled\"",
  "file_upload_status: \"disabled\"",
  "storage_status: \"disabled\"",
  "No real camera capture is active.",
  "No real file upload is active.",
  "No storage write is active.",
]) {
  assertIncludes(setupHelper, fragment, `admin OTS photo proof setup helper ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "adminOtsPhotoProofAccessUploadAuditPayloadSetupFoundationVersion",
  "buildAdminOtsPhotoProofAccessUploadAuditPayloadSetup",
  "delivery_surface: \"admin_ots_photo_proof_access_upload_audit_payload_setup_only\"",
  "auditWriteEnabled: false",
  "audit_write_enabled: false",
  "photoUploadEnabled: false",
  "storageEnabled: false",
  "adminViewerEnabled: false",
  "customerVisible: false",
  "external_send: false",
  "liveAccessEnabled: false",
  "realPhotoDataIncluded: false",
  "realStorageObjectIncluded: false",
]) {
  assertIncludes(auditPayloadHelper, fragment, `access/upload audit helper ${fragment}`);
}

for (const fragment of routeForbiddenRuntimeFragments) {
  assertExcludes(setupRoute, fragment, "admin OTS photo proof setup route forbidden runtime fragment");
  assertExcludes(previewReadinessRoute, fragment, "preview/readiness route forbidden runtime fragment");
  assertExcludes(disabledAccessUploadRoute, fragment, "disabled access/upload route forbidden runtime fragment");
}

for (const [path, source] of [
  [setupRoutePath, setupRoute],
  [previewReadinessRoutePath, previewReadinessRoute],
  [disabledAccessUploadRoutePath, disabledAccessUploadRoute],
  [setupHelperPath, setupHelper],
  [auditPayloadHelperPath, stripBlockedFragmentDenylist(auditPayloadHelper)],
]) {
  assertExcludes(source, providerStorageOrPaymentPattern, `${path} provider/storage/payment fragment`);
  assertExcludes(source, liveOtsFlagPattern, `${path} live OTS flag`);
  assertExcludes(source, otsActivationPattern, `${path} OTS activation`);
  assertExcludes(source, unsafeOutputPattern, `${path} unsafe OTS output`);
}

const publicClientForbiddenFragments = [
  "/api/admin-ots-photo-proof-setup",
  "/api/admin-ots-photo-proof-preview-readiness-setup",
  "/api/admin-ots-photo-proof-access-upload-disabled-setup",
  "admin-ots-photo-proof-setup",
  "admin-ots-photo-proof-preview-readiness-setup",
  "admin-ots-photo-proof-access-upload-disabled-setup",
  "photoUploadEnabled",
  "storageEnabled",
  "adminViewerEnabled",
  "customerVisible",
  "liveAccessEnabled",
  "input type=\"file\"",
  "input type='file'",
  "FormData",
  "URL.createObjectURL",
  "navigator.mediaDevices",
  "getUserMedia",
  "FileReader",
  "readAsDataURL",
  "storage.from",
  ".upload(",
  "x-prestige-admin-purpose",
  "x-prestige-admin-session-token",
  "Authorization",
  "document.cookie",
  "localStorage",
  "sessionStorage",
  "service_role",
  "SUPABASE_SERVICE",
  "STORAGE_",
  "AWS_",
];
const driverJobApprovedLiveLocationFragments = new Set(["customerVisible"]);
const driverJobApprovedOtsPhotoFragments = new Set([
  "FormData",
  "STORAGE_",
]);

for (const path of publicClientPaths) {
  const source = files[path];

  for (const fragment of publicClientForbiddenFragments) {
    if (path === "app/driver-job/[token]/page.tsx" && driverJobApprovedLiveLocationFragments.has(fragment)) {
      continue;
    }

    if (path === "app/driver-job/[token]/page.tsx" && driverJobApprovedOtsPhotoFragments.has(fragment)) {
      assertIncludes(
        source,
        "/api/driver-job/${encodeURIComponent(token)}/ots-photo",
        "approved tokenized driver OTS photo proof route",
      );
      assertIncludes(
        source,
        "data-driver-job-ots-photo-proof-input=\"true\"",
        "approved driver OTS photo proof input",
      );
      assertIncludes(
        source,
        "Admin-only proof. No customer message or external send is created from here.",
        "approved driver OTS photo proof boundary",
      );
      continue;
    }

    if (path === "app/my-bookings/page.tsx" && fragment === "URL.createObjectURL") {
      assertIncludes(
        source,
        "function downloadBrowserBlob(blob: Blob, filename: string)",
        "customer portal invoice PDF blob download helper",
      );
      assertIncludes(
        source,
        "const url = window.URL.createObjectURL(blob);",
        "customer portal invoice PDF blob object URL",
      );
      assertIncludes(
        source,
        "window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);",
        "customer portal invoice PDF blob object URL cleanup",
      );
      assert.equal(
        countMatches(source, "URL.createObjectURL"),
        1,
        "customer portal must only use one object URL for invoice PDF download",
      );
      continue;
    }

    if (path === "app/driver-job/[token]/page.tsx" && fragment === "URL.createObjectURL") {
      assertIncludes(
        source,
        "function downloadDriverCalendarBlob(blob: Blob, filename: string)",
        "driver calendar attachment blob download helper",
      );
      assertIncludes(
        source,
        "window.requestAnimationFrame(() => window.URL.revokeObjectURL(url));",
        "driver calendar attachment blob URL cleanup",
      );
      assert.equal(
        countMatches(source, "URL.createObjectURL"),
        1,
        "driver page must only use one object URL for the calendar attachment download",
      );
      continue;
    }

    assertExcludes(source, fragment, `${path} OTS photo proof caller fragment`);
  }

  assertExcludes(source, liveOtsFlagPattern, `${path} live OTS public activation flag`);
}

console.log("Public OTS photo proof surface guard passed");
