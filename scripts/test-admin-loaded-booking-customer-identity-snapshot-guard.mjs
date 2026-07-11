import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const app = await readFile("app/page.tsx", "utf8");
const start = app.indexOf("function bookingRecordToAdminBookingPersistenceRecord(");
const end = app.indexOf("\nfunction customerBookingTypeLabel", start);

assert.notEqual(start, -1, "Missing loaded-booking snapshot converter.");
assert.notEqual(end, -1, "Missing loaded-booking snapshot converter end.");

const converter = app.slice(start, end);

assert.equal(
  converter.includes("customer_id: safeAdminBookingPersistenceIdentifier(bookingRecord.customer_id)"),
  true,
  "Loaded-booking snapshot must keep customer_id.",
);

for (const field of ["company_id", "booker_id", "traveler_id"]) {
  assert.equal(
    converter.includes(`${field}: adminDispatchVerifiedIdentityId(bookingRecord.${field})`),
    true,
    `Loaded-booking snapshot must keep ${field}.`,
  );
}

console.log("Admin loaded-booking customer identity snapshot guard passed");
