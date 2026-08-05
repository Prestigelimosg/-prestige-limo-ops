import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, rateSetupRead] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/admin-rate-setup-read.ts", "utf8"),
]);

for (const fragment of [
  'data-admin-dispatch-crm-identity-selectors="true"',
  'data-admin-dispatch-corporate-customer-select="true"',
  'data-admin-dispatch-corporate-pair-select="true"',
  'data-admin-dispatch-corporate-pair-carried="true"',
  'data-admin-dispatch-customer-list-retry="true"',
  "adminDispatchCustomerListAutoLoadAttemptedRef",
  'activeTab !== "dispatch"',
  'includeAgencyFolders: true',
  'silent: true',
  "adminDispatchCorporatePairOptions",
  "adminDispatchSelectedCorporatePair",
  "adminDispatchSingleCorporatePairBookerId",
  "adminDispatchSingleCorporatePairTravelerId",
  "updateAdminDispatchCorporateCustomer",
  "updateAdminDispatchCorporatePair",
  "rateCompanies",
  "rateTravelers",
]) assert.ok(app.includes(fragment), `Missing ${fragment}`);

for (const fragment of [
  "bookerId: onlyPair ? String(onlyPair.booker_id)",
  "companyId,",
  "travelerId: onlyPair ? String(onlyPair.id)",
  'bookerId: pair?.bookerId || ""',
  "companyId: pair?.companyId || current.companyId",
  'travelerId: pair?.id || ""',
  "activeTab !== \"dispatch\"",
  "booking.bookerId ||",
  "booking.travelerId ||",
  "current.companyId !== adminDispatchSingleCorporatePairCompanyId",
  "bookerId: adminDispatchSingleCorporatePairBookerId",
  "travelerId: adminDispatchSingleCorporatePairTravelerId",
  "booking.companyId && adminDispatchSelectedCorporatePair",
  'data-admin-dispatch-corporate-pair-applying="true"',
  'data-admin-dispatch-corporate-pair-conflict="true"',
  "Retry customer list",
]) assert.ok(app.includes(fragment), `Missing exact pair carry-forward ${fragment}`);

assert.match(
  app,
  /booking\.companyId && adminDispatchSelectedCorporatePair[\s\S]{0,500}data-admin-dispatch-corporate-pair-carried="true"/,
  "The carried label must render only after the booking contains the exact saved pair IDs",
);

assert.ok(!app.includes('data-admin-dispatch-company-identity-select="true"'));
assert.ok(!app.includes('data-admin-dispatch-booker-identity-select="true"'));
assert.ok(!app.includes('data-admin-dispatch-traveler-identity-select="true"'));
assert.ok(!/parseBookingMessageForState[\s\S]{0,1500}companyId/.test(app));
assert.ok(rateSetupRead.includes('"id, company_id, booker_id, booker_name, traveler_name'));
assert.ok(rateSetupRead.includes("booker_id: positiveIntegerOrNull(record.booker_id)"));

console.log("Admin Dispatch CRM identity selectors guard passed.");
