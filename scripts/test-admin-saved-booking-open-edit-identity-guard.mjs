import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/admin-saved-booking-read.ts", "utf8");

for (const selectName of [
  "adminSavedBookingLegacyReadSelect",
  "adminSavedBookingCurrentReadSelect",
  "adminSavedBookingCurrentMinimalReadSelect",
]) {
  const start = source.indexOf(`const ${selectName} =`);
  const end = source.indexOf(";", start);

  assert.notEqual(start, -1, `Missing ${selectName}.`);
  const select = source.slice(start, end);

  for (const field of ["customer_id", "company_id", "booker_id", "traveler_id"]) {
    assert.match(
      select,
      new RegExp(`(?:^|[,\\s])${field}(?:[,\\s]|$)`),
      `${selectName} must carry ${field} through Open / Edit.`,
    );
  }
}

for (const field of ["customer_id", "company_id", "booker_id", "traveler_id"]) {
  assert.ok(
    source.includes(`${field}: integerOrNull(row.${field})`),
    `Saved-booking mapper must keep ${field}.`,
  );
}

console.log("Admin saved-booking Open / Edit identity guard passed");
