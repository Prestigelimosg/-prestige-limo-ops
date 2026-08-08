import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const bookPagePath = "app/book/page.tsx";
const requestAdapterPath = "lib/customer-booking-request-adapter.ts";
const persistencePath = "lib/admin-booking-persistence.ts";
const supabaseAdapterPath = "lib/admin-booking-supabase-adapter.ts";
const adminPagePath = "app/page.tsx";
const migrationPath = "supabase/migrations/20260808080844_add_customer_special_request.sql";

const [bookPage, requestAdapter, persistence, supabaseAdapter, adminPage, migration] = await Promise.all(
  [bookPagePath, requestAdapterPath, persistencePath, supabaseAdapterPath, adminPagePath, migrationPath].map(
    (filePath) => readFile(filePath, "utf8"),
  ),
);

for (const fragment of [
  "specialRequest: string;",
  'data-customer-booking-field="specialRequest"',
  "Special request / note",
  "Number of vehicles, child seat, meet-and-greet, event timing, or other requests",
  'maxLength={500}',
  "Special request must be 500 characters or fewer.",
  "Special request contains unsupported control characters.",
]) {
  assert.equal(bookPage.includes(fragment), true, `/book Special Request must include ${fragment}.`);
}

const extraStopsFieldIndex = bookPage.indexOf('data-customer-booking-field="extraStops"');
const specialRequestFieldIndex = bookPage.indexOf('data-customer-booking-field="specialRequest"');
const preSubmitReviewIndex = bookPage.indexOf('data-customer-booking-pre-submit-review="true"');
assert.equal(
  specialRequestFieldIndex,
  bookPage.lastIndexOf('data-customer-booking-field="specialRequest"'),
  "/book must render exactly one Special Request field.",
);
assert.equal(
  extraStopsFieldIndex < specialRequestFieldIndex && specialRequestFieldIndex < preSubmitReviewIndex,
  true,
  "/book Special Request must remain in Trip Details below Extra stops and before review/terms/submit.",
);

for (const fragment of [
  "specialRequest?: string;",
  "specialRequest: input.specialRequest",
]) {
  assert.equal(
    requestAdapter.includes(fragment),
    true,
    `customer booking request adapter must include ${fragment}.`,
  );
}

for (const fragment of [
  "customer_special_request?: string | null;",
  '"customer_special_request"',
  '"specialRequest"',
  "function customerBookingSpecialRequest",
  "customer_special_request: customerSpecialRequest,",
  "Malformed customer booking request special request rejected.",
]) {
  assert.equal(
    persistence.includes(fragment),
    true,
    `customer booking persistence must include ${fragment}.`,
  );
}

for (const fragment of [
  "customer_special_request",
  "customerSpecialRequestOrNull",
]) {
  assert.equal(
    supabaseAdapter.includes(fragment),
    true,
    `Supabase booking adapter must include ${fragment}.`,
  );
}

for (const fragment of [
  "customer_special_request?: string | null;",
  "customerSpecialRequestOverride?: string | null;",
  "customer_special_request: clean(options.customerSpecialRequestOverride) || null",
  "customerSpecialRequestOverride: appliedCustomerRequestSpecialRequest",
  "customerSpecialRequestOverride:",
  "clean(appliedSnapshot.customer_special_request) || null",
  "Customer special request",
  'data-admin-dispatch-customer-special-request="true"',
]) {
  assert.equal(adminPage.includes(fragment), true, `Admin Special Request carry must include ${fragment}.`);
}

for (const fragment of [
  "alter table if exists public.bookings",
  "add column if not exists customer_special_request text",
  "bookings_customer_special_request_safe_check",
  "char_length(customer_special_request) between 1 and 500",
  "customer_special_request = btrim(customer_special_request)",
  "position(E'\\r' in customer_special_request) = 0",
]) {
  assert.equal(migration.includes(fragment), true, `Special Request migration must include ${fragment}.`);
}
assert.doesNotMatch(
  migration,
  /\b(?:insert\s+into|update|delete\s+from|create\s+(?:function|trigger)|grant|enable\s+row\s+level\s+security)\b/i,
  "Special Request migration must remain a narrow additive schema file without data writes or policy/provider changes.",
);

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-special-request-"));

try {
  const sourcePath = path.join(process.cwd(), persistencePath);
  const outputPath = path.join(tempDir, "lib/admin-booking-persistence.js");
  const adapterStubPath = path.join(tempDir, "lib/admin-booking-supabase-adapter.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(persistence, sourcePath));
  await writeFile(
    adapterStubPath,
    [
      "async function unavailable() { throw new Error('persistence adapter must not run in Special Request guard'); }",
      "module.exports = {",
      "  createAdminBookingThroughSupabaseAdapter: unavailable,",
      "  loadAdminBookingByReferenceThroughSupabaseAdapter: unavailable,",
      "  listAdminBookingsThroughSupabaseAdapter: unavailable,",
      "  updateAdminBookingThroughSupabaseAdapter: unavailable,",
      "};",
    ].join("\n"),
  );

  const { parseCustomerBookingRequestPayloads } = createRequire(import.meta.url)(outputPath);
  const request = (specialRequest) => ({
    contactNo: "+65 9000 2111",
    emailAddress: "special-request-test@example.com",
    passengerName: "Special Request Test Passenger",
    pickupDate: "2026-08-20",
    pickupLocation: "Special Request Test Pickup",
    pickupTime: "09:00",
    dropoffLocation: "Special Request Test Dropoff",
    specialRequest,
  });

  const valid = parseCustomerBookingRequestPayloads(
    request("  Child seat needed\r\nEvent starts at 10:00  "),
  );
  assert.equal(valid.ok, true);
  assert.equal(
    valid.data.requests[0].booking.customer_special_request,
    "Child seat needed\nEvent starts at 10:00",
  );

  const blank = parseCustomerBookingRequestPayloads(request("   "));
  assert.equal(blank.ok, true);
  assert.equal(blank.data.requests[0].booking.customer_special_request, null);

  const exactLimit = parseCustomerBookingRequestPayloads(request("x".repeat(500)));
  assert.equal(exactLimit.ok, true);
  assert.equal(exactLimit.data.requests[0].booking.customer_special_request.length, 500);

  for (const invalidValue of ["x".repeat(501), "Child seat\u0000required", "Timing\t10:00", 2]) {
    const invalid = parseCustomerBookingRequestPayloads(request(invalidValue));
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 400);
    assert.equal(
      invalid.error,
      "Malformed customer booking request special request rejected.",
    );
  }
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

const approvedRuntimeFiles = new Set([
  adminPagePath,
  bookPagePath,
  persistencePath,
  requestAdapterPath,
  supabaseAdapterPath,
]);

async function collectSourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.posix.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(entryPath)));
    } else if (/\.(?:ts|tsx)$/.test(entry.name)) {
      files.push(entryPath);
    }
  }

  return files;
}

for (const filePath of await collectSourceFiles("app")) {
  if (approvedRuntimeFiles.has(filePath)) {
    continue;
  }

  assert.doesNotMatch(
    await readFile(filePath, "utf8"),
    /customer_special_request/,
    `${filePath} must not expose the customer Special Request outside approved Admin intake.`,
  );
}

for (const filePath of await collectSourceFiles("lib")) {
  if (approvedRuntimeFiles.has(filePath)) {
    continue;
  }

  assert.doesNotMatch(
    await readFile(filePath, "utf8"),
    /customer_special_request/,
    `${filePath} must not carry the customer Special Request into another consumer lane.`,
  );
}

console.log("Customer booking Special Request guard passed");
