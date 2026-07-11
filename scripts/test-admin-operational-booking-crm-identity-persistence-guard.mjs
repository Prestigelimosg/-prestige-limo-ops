import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [persistence, adapter, app, migration] = await Promise.all([
  readFile("lib/admin-booking-persistence.ts", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("supabase/migrations/202605150001_schema_sync_from_app_save_payloads.sql", "utf8"),
]);

for (const field of ["company_id", "booker_id", "traveler_id"]) {
  assert.match(persistence, new RegExp(`${field}\\?: number \\| null`));
  assert.match(persistence, new RegExp(`${field}: integerOrNull\\(record\\.${field}\\)`));
  assert.match(adapter, new RegExp(`${field}: [a-zA-Z]+Id`));
  assert.match(migration, new RegExp(`add column if not exists ${field} bigint`, "i"));
}

assert.match(adapter, /company_id, booker_id, traveler_id/);
assert.match(app, /company_id: adminDispatchVerifiedIdentityId\(bookingValue\.companyId\)/);
assert.match(app, /booker_id: adminDispatchVerifiedIdentityId\(bookingValue\.bookerId\)/);
assert.match(app, /traveler_id: adminDispatchVerifiedIdentityId\(bookingValue\.travelerId\)/);
assert.match(app, /verifiedIdentityOptionAutoLoadKeyRef/);
assert.match(app, /\[booking\.companyId, booking\.bookerId, booking\.travelerId\]/);
assert.match(app, /Saved booking verified CRM identity options loaded/);
assert.doesNotMatch(app, /parseBookingMessageForState[\s\S]{0,1500}(companyId|bookerId|travelerId)/);

console.log("Admin operational booking CRM identity persistence guard passed.");
