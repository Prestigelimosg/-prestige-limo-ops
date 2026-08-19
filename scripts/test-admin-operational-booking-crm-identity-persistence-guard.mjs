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
assert.match(app, /adminDispatchCustomerAccountOptions\.push/);
assert.match(
  app,
  /const adminDispatchCorporateAccountGroups = new Map[\s\S]{0,2500}bookerId,[\s\S]{0,300}companyId,[\s\S]{0,500}travelers: \[traveler\],/,
);
assert.match(
  app,
  /function applyAdminDispatchCustomerAccount\([\s\S]{0,1800}bookerId: account\.bookerId,[\s\S]{0,300}companyId: account\.companyId,[\s\S]{0,300}customerId: "",[\s\S]{0,300}travelerId: traveler \? String\(traveler\.id\) : "",/,
);
assert.match(app, /const loadedCompanyName = clean\(booking\.company\)/);
assert.match(app, /const bookerName = clean\(traveler\.booker_name\)/);
assert.match(app, /clean\(traveler\.traveler_name\)/);
assert.doesNotMatch(app, /verifiedIdentityOptionAutoLoadKeyRef/);
assert.doesNotMatch(app, /parseBookingMessageForState[\s\S]{0,1500}(companyId|bookerId|travelerId)/);

console.log("Admin operational booking CRM identity persistence guard passed.");
