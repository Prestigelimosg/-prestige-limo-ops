import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const bookPagePath = "app/book/page.tsx";
const persistencePath = "lib/admin-booking-persistence.ts";
const adminPagePath = "app/page.tsx";

const [bookPage, persistence, adminPage] = await Promise.all(
  [bookPagePath, persistencePath, adminPagePath].map((filePath) => readFile(filePath, "utf8")),
);

for (const fragment of [
  "Number of bags",
  'data-customer-booking-field="luggage"',
  'inputMode="numeric"',
  'max="2147483647"',
  'min="0"',
  'step="1"',
  'type="number"',
  "Enter the number of bags as a whole number.",
]) {
  assert.equal(bookPage.includes(fragment), true, `/book luggage contract must include ${fragment}.`);
}

for (const removedFragment of [
  "specialRequest: string;",
  'data-customer-booking-field="specialRequest"',
  "Special request / note",
]) {
  assert.equal(bookPage.includes(removedFragment), false, `/book must remove ${removedFragment}.`);
}

for (const fragment of [
  "function customerBookingLuggageCount",
  "Malformed customer booking request luggage count rejected.",
  "luggage_count: customerBookingLuggageCount(body.luggage)",
]) {
  assert.equal(persistence.includes(fragment), true, `customer booking persistence must include ${fragment}.`);
}

for (const fragment of [
  "luggageCountOverride?: number | null;",
  "luggage_count: safeAdminBookingPersistenceCount(options.luggageCountOverride)",
  "appliedCustomerRequestLuggageCount",
  "luggageCountOverride: appliedCustomerRequestLuggageCount",
  "acceptingCustomerRequest && appliedSnapshot",
  "safeAdminBookingPersistenceCount(appliedSnapshot.luggage_count)",
]) {
  assert.equal(adminPage.includes(fragment), true, `Save + CRM luggage carry must include ${fragment}.`);
}

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

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-luggage-count-"));

try {
  const sourcePath = path.join(process.cwd(), persistencePath);
  const outputPath = path.join(tempDir, "lib/admin-booking-persistence.js");
  const adapterStubPath = path.join(tempDir, "lib/admin-booking-supabase-adapter.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(persistence, sourcePath));
  await writeFile(
    adapterStubPath,
    [
      "async function unavailable() { throw new Error('persistence adapter must not run in luggage guard'); }",
      "module.exports = {",
      "  createAdminBookingThroughSupabaseAdapter: unavailable,",
      "  loadAdminBookingByReferenceThroughSupabaseAdapter: unavailable,",
      "  listAdminBookingsThroughSupabaseAdapter: unavailable,",
      "  updateAdminBookingThroughSupabaseAdapter: unavailable,",
      "};",
    ].join("\n"),
  );

  const { parseCustomerBookingRequestPayloads } = createRequire(import.meta.url)(outputPath);
  const request = (luggage) => ({
    contactNo: "+65 9000 1111",
    emailAddress: "luggage-test@example.com",
    luggage,
    passengerName: "Luggage Test Passenger",
    pickupDate: "2026-08-20",
    pickupLocation: "Luggage Test Pickup",
    pickupTime: "09:00",
    dropoffLocation: "Luggage Test Dropoff",
  });

  const numeric = parseCustomerBookingRequestPayloads(request("3"));
  assert.equal(numeric.ok, true);
  assert.equal(numeric.data.requests[0].booking.luggage_count, 3);

  const typedNumeric = parseCustomerBookingRequestPayloads(request(3));
  assert.equal(typedNumeric.ok, true);
  assert.equal(typedNumeric.data.requests[0].booking.luggage_count, 3);

  const blank = parseCustomerBookingRequestPayloads(request(""));
  assert.equal(blank.ok, true);
  assert.equal(blank.data.requests[0].booking.luggage_count, null);

  for (const invalidValue of [
    "2 large bags, 1 cabin bag",
    "2.5",
    "-1",
    "2e0",
    "0x2",
  ]) {
    const invalid = parseCustomerBookingRequestPayloads(request(invalidValue));
    assert.equal(invalid.ok, false);
    assert.equal(invalid.status, 400);
    assert.equal(invalid.error, "Malformed customer booking request luggage count rejected.");
  }
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer booking luggage count guard passed");
