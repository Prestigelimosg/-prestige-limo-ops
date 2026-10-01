import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import ts from "typescript";

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
assertIncludes(driverPage, 'data-driver-ots-photo-thumbnail="true"', "local selected-photo preview");
assertIncludes(driverPage, 'data-driver-ots-photo-preview-dialog="true"', "in-page enlargement");
assertIncludes(driverPage, "URL.revokeObjectURL", "preview memory cleanup");
assertIncludes(driverPage, "Preview unavailable. You can retake or send this photo.", "decode failure does not block upload");
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

assertExcludes(adminRoute, /export async function (POST|PUT|PATCH)/, "admin OTS proof route extra verbs");

for (const fragment of [
  "/api/driver-job/${encodeURIComponent(token)}/ots-photo",
  "data-driver-job-ots-photo-proof-input=\"true\"",
  "data-driver-job-ots-photo-proof-shoot=\"true\"",
  "data-driver-job-ots-photo-proof-selected-file=\"true\"",
  "capture=\"environment\"",
  'driverOtsPhotoProof.selectedFileName || "No photo selected."',
  "const driverOtsPhotoMaxRequestBytes = 4 * 1024 * 1024",
  "const driverOtsPhotoMaxDimension = 1600",
  "prepareDriverOtsPhotoForUpload",
  "createImageBitmap(file)",
  "canvas.toBlob",
  "new FormData",
  'formData.append("photo", preparedPhoto.blob, preparedPhoto.fileName)',
  'response.status === 413 ? "too_large"',
]) {
  assertIncludes(driverPage, fragment, `driver page approved OTS fragment: ${fragment}`);
}

for (const retiredCopy of [
  "Send one arrival photo after OTS. Admin sees it inside Dispatch.",
  "Large phone photos are reduced automatically before sending.",
  "Admin-only proof. No customer message or external send is created from here.",
]) {
  assert.equal(
    driverPage.includes(retiredCopy),
    false,
    `driver OTS photo UI must keep approved static help copy removed: ${retiredCopy}`,
  );
}
assert.equal(
  driverPage.includes('data-driver-job-ots-photo-proof-boundary="true"'),
  false,
  "driver OTS photo UI must remove only its retired static boundary paragraph",
);

assert.match(
  driverOtsApprovedSurface,
  /data-driver-job-ots-photo-proof-control="true"[\s\S]{0,500}data-driver-job-ots-photo-proof-shoot="true"[\s\S]{0,200}>\s*Shoot\s*<\/span>[\s\S]{0,500}data-driver-job-ots-photo-proof-selected-file="true"/,
  "driver page must retain one compact file-control row with only its chooser wording changed to Shoot",
);
assert.match(
  driverOtsApprovedSurface,
  /className="sr-only"[\s\S]{0,500}data-driver-job-ots-photo-proof-input="true"/,
  "driver page must hide only the browser-generated file-picker label while retaining the established input",
);
assert.doesNotMatch(
  driverOtsApprovedSurface,
  /data-driver-job-ots-photo-proof-shoot="true"[\s\S]{0,300}<\/button>/,
  "driver page must not replace the compact file selector with a standalone Shoot button",
);

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

// Execute the real upload persistence and POST handler with every database,
// storage and provider boundary intercepted. Never use live data or sends.
function compile(source, imports) {
  const exports = {};
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function("require", "exports", js)((name) => {
    assert.ok(Object.hasOwn(imports, name), `Unexpected dependency ${name}`);
    return imports[name];
  }, exports);
  return exports;
}

const token = "synthetic-photo-link-token";
const linkId = "11111111-1111-4111-8111-111111111111";
const proofId = "22222222-2222-4222-8222-222222222222";
const reference = "SYNTHETIC-PHOTO-A";
const ackAt = new Date(Date.now() - 60_000).toISOString();
const proof = {
  id: proofId, booking_reference: reference, storage_bucket: "ots-photo-proofs",
  storage_path: `bookings/${reference}/ots/synthetic.jpg`, content_type: "image/jpeg",
  file_size_bytes: 4, photo_type: "ots", proof_status: "uploaded", uploaded_at: new Date().toISOString(),
};
const safeProof = {
  booking_reference: reference, content_type: "image/jpeg", customerVisible: false,
  external_send: false, file_size_bytes: 4, photo_type: "ots", proof_status: "uploaded",
  uploaded_at: proof.uploaded_at,
};
let link, otsPresent, storageFails, insertFails, pushFails, calls;
const reset = (context = {}) => {
  link = {
    id: linkId, booking_reference: reference, link_status: "active", revoked_at: null,
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    safe_link_context: {
      driver_acknowledged_at: ackAt,
      driver_job_payload: { driver_plate_number: " snp 9124s ", ...context },
    },
  };
  otsPresent = true; storageFails = insertFails = pushFails = false; calls = [];
};
const client = {
  from(table) {
    assert.ok(["driver_job_links", "driver_job_status_events", "driver_ots_photo_proofs"].includes(table), "No new database read/writer for plate copy");
    const filters = {};
    const q = {
      select() { return q; }, eq(key, value) { filters[key] = value; return q; },
      order() { return q; }, limit() { return q; },
      insert(row) {
        assert.equal(table, "driver_ots_photo_proofs");
        assert.equal(row.booking_reference, reference);
        assert.equal(row.driver_job_link_id, linkId);
        assert.equal(row.ots_status_event_id, "ots-event-a");
        assert.ok(!JSON.stringify(row).includes("adminNotificationVehiclePlate"), "No notification metadata persisted in photo rows");
        calls.push("proof-insert"); return q;
      },
      async maybeSingle() {
        if (table === "driver_job_links") {
          assert.equal(filters.token_hash, createHash("sha256").update(token).digest("hex"));
          calls.push("link-read"); return { data: link, error: null };
        }
        assert.equal(table, "driver_job_status_events");
        assert.equal(filters.booking_reference, reference);
        assert.equal(filters.driver_job_link_id, linkId);
        assert.equal(filters.status_value, "ots");
        calls.push("ots-read"); return { data: otsPresent ? { id: "ots-event-a", status_value: "ots" } : null, error: null };
      },
      async single() {
        assert.equal(table, "driver_ots_photo_proofs");
        return { data: insertFails ? null : proof, error: insertFails ? { message: "synthetic failure" } : null };
      },
    };
    return q;
  },
  storage: { from(bucket) {
    assert.equal(bucket, "ots-photo-proofs");
    return {
      async upload(storagePath) {
        assert.ok(storagePath.startsWith(`bookings/${reference}/ots/`));
        calls.push("storage-upload"); return { error: storageFails ? {} : null };
      },
      async remove() { calls.push("failed-proof-storage-cleanup"); return { error: null }; },
    };
  } },
};
const savedEnv = { ...process.env };
try {
  process.env.SUPABASE_URL = "https://synthetic.invalid";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-only";
  const uploadHelper = compile(persistence, {
    "server-only": {}, "@supabase/supabase-js": { createClient: () => client },
    "./driver-job-link.ts": {
      hashDriverJobLinkToken: (value) => createHash("sha256").update(value).digest("hex"),
      isDriverJobLinkExpired: (value) => Date.parse(value) <= Date.now(),
      isDriverJobLinkExpiryOutsideAllowedWindow: () => false,
    },
    "./driver-job-link-mode.ts": { productionDriverJobLinksConfigured: () => true },
  });
  const route = compile(driverRoute, {
    "../../../../../lib/driver-job-link-contract.ts": {},
    "../../../../../lib/driver-job-link-mode.ts": { isProductionDriverJobLinkMode: () => true },
    "../../../../../lib/driver-job-link-mock-store.ts": {},
    "../../../../../lib/driver-ots-photo-proof-persistence.ts": uploadHelper,
    "../../../../../lib/admin-device-push-notification.ts": {
      async sendAdminDevicePushAlert(event, options) {
        assert.equal(event, "driver_ots_photo");
        assert.ok(calls.includes("proof-insert"), "Push must follow saved proof");
        calls.push({ event, options });
        if (pushFails) throw Error("synthetic provider failure");
      },
    },
  });
  const request = () => {
    const form = new FormData();
    form.append("photo", new File([new Uint8Array([1, 2, 3, 4])], "synthetic.jpg", { type: "image/jpeg" }));
    form.append("vehiclePlate", "FORGED999");
    form.append("booking_reference", "OTHER-JOB");
    return new Request("https://local.invalid/api/driver-job/synthetic/ots-photo", { method: "POST", body: form });
  };
  const post = () => route.POST(request(), { params: Promise.resolve({ token }) });
  for (const plate of [" snp 9124s ", "SNL321U"]) {
    reset({ driver_plate_number: plate });
    const response = await post();
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true, mode: "production", proof: safeProof, version: uploadHelper.driverOtsPhotoProofPersistenceVersion });
    const pushes = calls.filter((call) => typeof call === "object");
    assert.deepEqual(pushes, [{ event: "driver_ots_photo", options: { vehiclePlate: plate } }], "Photo alert must use only this acknowledged token's saved plate");
    assert.deepEqual(calls.slice(0, 4), ["link-read", "ots-read", "storage-upload", "proof-insert"]);
  }
  for (const change of [
    () => { delete link.safe_link_context.driver_acknowledged_at; },
    () => { link.safe_link_context.driver_acknowledged_at = "invalid"; },
    () => { link.safe_link_context.driver_acknowledged_at = new Date(Date.now() + 120_000).toISOString(); },
    () => { delete link.safe_link_context.driver_job_payload.driver_plate_number; },
    () => { link.safe_link_context.driver_job_payload.driver_plate_number = { plate: "SNP9124S" }; },
  ]) {
    reset(); change();
    const response = await post();
    assert.equal(response.status, 200, "Missing copy evidence cannot fail a saved photo");
    assert.deepEqual(calls.filter((call) => typeof call === "object"), [{ event: "driver_ots_photo", options: { vehiclePlate: null } }]);
    assert.deepEqual((await response.json()).proof, safeProof);
  }
  for (const [change, status] of [
    [() => { link = null; }, 401],
    [() => { link.revoked_at = ackAt; }, 403],
    [() => { link.expires_at = ackAt; }, 410],
    [() => { otsPresent = false; }, 409],
    [() => { storageFails = true; }, 500],
    [() => { insertFails = true; }, 503],
  ]) {
    reset(); change(); const response = await post();
    assert.equal(response.status, status);
    assert.equal(calls.filter((call) => typeof call === "object").length, 0, "No photo alert on rejected or unsaved uploads");
  }
  reset(); pushFails = true;
  const response = await post();
  assert.equal(response.status, 200, "Provider failure cannot roll back or fail a saved photo");
  assert.deepEqual((await response.json()).proof, safeProof);
} finally {
  for (const key of Object.keys(process.env)) if (!(key in savedEnv)) delete process.env[key];
  Object.assign(process.env, savedEnv);
}

console.log("driver OTS photo proof runtime guard passed: exact saved plate, private response, upload-first and failure isolation");

// Execute the real page callbacks with local files and a synthetic upload. No network.
const photoAst = ts.createSourceFile("page.tsx", driverPage, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let clearPreviewCallback, selectPhotoCallback, uploadPhotoCallback;
function findPhotoCallbacks(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(photoAst) === "clearDriverOtsPhotoPreview") {
    clearPreviewCallback = node.initializer.arguments[0].getText(photoAst);
  }
  if (ts.isFunctionDeclaration(node) && node.name?.text === "handleDriverOtsPhotoFileChange") selectPhotoCallback = node.getText(photoAst);
  if (ts.isFunctionDeclaration(node) && node.name?.text === "uploadDriverOtsPhotoProof") uploadPhotoCallback = node.getText(photoAst);
  ts.forEachChild(node, findPhotoCallbacks);
}
findPhotoCallbacks(photoAst);
assert.ok(clearPreviewCallback && selectPhotoCallback && uploadPhotoCallback);
assertIncludes(driverPage, "useEffect(() => clearDriverOtsPhotoPreview, [token, clearDriverOtsPhotoPreview])", "job change and unmount cleanup");
const lifecycleJs = ts.transpileModule(`
const clearDriverOtsPhotoPreview = ${clearPreviewCallback};
${selectPhotoCallback}
${uploadPhotoCallback}
return {clearDriverOtsPhotoPreview, handleDriverOtsPhotoFileChange, uploadDriverOtsPhotoProof};
`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
let photoState = {action:"idle", feedback:null, selectedFileName:"", previewUrl:"", previewFailed:false, uploadedAt:""};
const revoked = [], previewRef = {current:""}, inputRef = {current:{files:[],value:""}};
let closed = 0, requestCount = 0, failUpload = false, failUrl = false, created = 0;
const callbacks = new Function("URL", "driverOtsPhotoPreviewUrlRef", "driverOtsPhotoPreviewDialogRef", "setDriverOtsPhotoProof", "driverOtsPhotoProofInputRef", "token", "pageState", "workflowStatus", "driverWorkflowHasReachedOts", "prepareDriverOtsPhotoForUpload", "fetch", "driverOtsPhotoProofRoute", "otsPhotoProofBlockedMessage", "addActivity", lifecycleJs)(
  {createObjectURL:()=>{if(failUrl)throw Error("Unsupported");return `blob:synthetic-${++created}`;},revokeObjectURL:url=>revoked.push(url)},
  previewRef, {current:{close:()=>closed++}}, value=>{photoState=typeof value==="function"?value(photoState):value;}, inputRef,
  "synthetic", {kind:"ready"}, "ots", ()=>true,
  async file=>({blob:file,fileName:file.name}),
  async (_url,options)=>{requestCount++;assert.equal(options.method,"POST");assert.equal(options.body.get("photo").name,inputRef.current.files[0].name);return {ok:!failUpload,json:async()=>failUpload?{ok:false,reason:"storage_failed"}:{ok:true,proof:{customerVisible:false,external_send:false,uploaded_at:"2026-10-01T03:00:00Z"}}};},
  ()=>"/api/driver-job/synthetic/ots-photo", ()=>"Synthetic upload failed", ()=>{}
);
function choosePhoto(name) {
  const file = new File(["synthetic image"], name, {type:"image/jpeg"});
  inputRef.current.files=[file];
  callbacks.handleDriverOtsPhotoFileChange({target:{files:[file]}});
}
choosePhoto("first.jpg");
assert.equal(photoState.previewUrl,"blob:synthetic-1");
choosePhoto("retaken.jpg");
assert.deepEqual(revoked,["blob:synthetic-1"]);
assert.equal(photoState.selectedFileName,"retaken.jpg");
assert.equal(requestCount,0,"Preview/retake must not upload or notify");
failUpload=true;
await callbacks.uploadDriverOtsPhotoProof();
assert.equal(photoState.previewUrl,"blob:synthetic-2","Failure retains selected preview for retry");
assert.equal(photoState.action,"idle");
failUpload=false;
await callbacks.uploadDriverOtsPhotoProof();
assert.equal(photoState.previewUrl,"");
assert.equal(photoState.selectedFileName,"");
assert.deepEqual(revoked,["blob:synthetic-1","blob:synthetic-2"]);
failUrl=true;
choosePhoto("no-preview.jpg");
assert.equal(photoState.previewFailed,true);
assert.equal(photoState.selectedFileName,"no-preview.jpg");
await callbacks.uploadDriverOtsPhotoProof();
assert.equal(photoState.feedback.tone,"success","Preview failure must not block the existing upload");
failUrl=false;
choosePhoto("leaving-job.jpg");
callbacks.clearDriverOtsPhotoPreview();
assert.equal(previewRef.current,"");
assert.equal(revoked.at(-1),"blob:synthetic-3");
assert.ok(closed>=4,"Replacement, success and cleanup close the enlargement");
console.log("Local OTS preview callbacks passed: retake, no-send selection, failed-upload retry, success and job-exit cleanup, preview failure fallback");
