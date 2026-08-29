import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [persistence, adapter, app, migration, accountMigration, adminBookers] = await Promise.all([
  readFile("lib/admin-booking-persistence.ts", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("supabase/migrations/202605150001_schema_sync_from_app_save_payloads.sql", "utf8"),
  readFile("supabase/migrations/20260829032708_company_booker_customer_account_identity.sql", "utf8"),
  readFile("lib/admin-bookers.ts", "utf8"),
]);

for (const field of ["company_id", "booker_id", "traveler_id"]) {
  assert.match(persistence, new RegExp(`${field}\\?: number \\| null`));
  assert.match(persistence, new RegExp(`${field}: integerOrNull\\(record\\.${field}\\)`));
  assert.match(adapter, new RegExp(`${field}: [a-zA-Z]+Id`));
  assert.match(migration, new RegExp(`add column if not exists ${field} bigint`, "i"));
}

assert.match(adapter, /company_id, booker_id, traveler_id/);
assert.match(accountMigration, /alter table public\.bookers[\s\S]*add column if not exists customer_id bigint/i);
assert.match(accountMigration, /foreign key \(customer_id\)[\s\S]*references public\.customers \(id\)[\s\S]*on delete restrict/i);
assert.match(accountMigration, /create unique index[\s\S]*on public\.bookers \(customer_id\)[\s\S]*where customer_id is not null/i);
assert.match(adminBookers, /customer_id: number \| null/);
assert.match(adminBookers, /id, company_id, customer_id, booker_name, email, phone/);
assert.match(adapter, /async function resolveExactBookerCustomerAccount/);
assert.match(adapter, /async function bindExactBookerCustomerAccount/);
assert.match(adapter, /\.eq\("company_id", verifiedCompanyId\)[\s\S]{0,180}\.eq\("booker_id", verifiedBookerId\)/);
assert.match(adapter, /customerAccountCollisionReviewFailure\(accountCandidates\)/);
assert.match(adapter, /\.is\("customer_id", null\)/);
assert.match(app, /company_id: adminDispatchVerifiedIdentityId\(bookingValue\.companyId\)/);
assert.match(app, /booker_id: adminDispatchVerifiedIdentityId\(bookingValue\.bookerId\)/);
assert.match(app, /traveler_id: adminDispatchVerifiedIdentityId\(bookingValue\.travelerId\)/);
assert.match(app, /adminDispatchCustomerAccountOptions\.push/);
assert.match(
  app,
  /for \(const booker of rateBookers\)[\s\S]{0,3000}bookerId,[\s\S]{0,300}companyId,[\s\S]{0,500}customerId: String\(adminDispatchVerifiedIdentityId\(booker\.customer_id\)[\s\S]{0,800}travelers: accountTravelers,/,
);
assert.match(
  app,
  /for \(const traveler of rateTravelers\)[\s\S]{0,2500}const existing = adminDispatchCorporateAccountGroups\.get\(key\)[\s\S]{0,800}existing\.travelers\.push\(traveler\)/,
);
assert.match(
  app,
  /function applyAdminDispatchCustomerAccount\([\s\S]{0,1800}bookerId: account\.bookerId,[\s\S]{0,300}companyId: account\.companyId,[\s\S]{0,300}customerId: account\.customerId,[\s\S]{0,300}travelerId: "",/,
);
assert.match(
  app,
  /customerId: adminDispatchVerifiedIdentityId\(booker\.customer_id\)[\s\S]{0,80}\? String\(booker\.customer_id\)[\s\S]{0,40}: ""/,
);
assert.match(app, /travelerId: number \| null/);
assert.doesNotMatch(app, /Create or reuse this verified Booker \+ Traveller under/);
assert.match(app, /const loadedCompanyName = clean\(booking\.company\)/);
assert.match(app, /const bookerName = clean\(traveler\.booker_name\)/);
assert.match(app, /clean\(traveler\.traveler_name\)/);
assert.doesNotMatch(app, /verifiedIdentityOptionAutoLoadKeyRef/);
assert.doesNotMatch(app, /parseBookingMessageForState[\s\S]{0,1500}(companyId|bookerId|travelerId)/);

console.log("Admin operational booking CRM identity persistence guard passed.");
