import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, appSmokeBrowser, bookingUiBrowser, rateSetupRead, adminBookers] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
  readFile("scripts/test-booking-ui-browser.mjs", "utf8"),
  readFile("lib/admin-rate-setup-read.ts", "utf8"),
  readFile("lib/admin-bookers.ts", "utf8"),
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

for (const fragment of [
  "resolveSaveCrmCorporateIdentityForSave",
  "Create or reuse this verified Booker + Traveller under",
  "loadSaveCrmCorporateIdentityRows",
  "loadSaveCrmBookerById",
  "findOrCreateSaveCrmBooker",
  "linkSaveCrmTravelerToBooker",
  "bookerId: adminDispatchVerifiedIdentityId(record.booker_id)",
  "companyId: adminDispatchVerifiedIdentityId(record.company_id)",
  "customerId: adminDispatchVerifiedIdentityId(record.customer_id)",
  "travelerId: adminDispatchVerifiedIdentityId(record.traveler_id)",
  "if (!currentBookerId && currentTravelerId)",
  "The selected Booker + Traveller pair no longer matches this exact company and booking.",
  "loadSaveCrmAgencyCustomerClassification",
  "This customer request is missing its exact verified customer or company.",
  "if (!updateIsHotelAgencyBooking && !updateBookerId)",
  "`verified company ${updateCompanyId}`",
  "companyId: String(corporateIdentityResolution.companyId)",
  "bookerId: String(corporateIdentityResolution.bookerId)",
  "travelerId: String(corporateIdentityResolution.travelerId)",
]) assert.ok(app.includes(fragment), `Missing first corporate Save + CRM identity handoff ${fragment}`);

assert.ok(
  app.includes("existingCustomerId &&") &&
    app.includes("await loadSaveCrmAgencyCustomerClassification(") &&
    app.includes("companyProfileResolution.companyId"),
  "Existing direct Save + CRM customers must be freshly classified before any corporate identity writer",
);
assert.ok(
  adminBookers.includes("query.limit(2).maybeSingle()"),
  "Exact Booker lookup must fail closed instead of selecting the first duplicate name",
);

assert.ok(
  !/acceptingCustomerRequest\s*&&\s*updateCompanyId\s*&&\s*updateCompanyName\s*&&/.test(app),
  "Accept + Cal must never skip verified identity resolution because an optional company display label is unavailable",
);

for (const fragment of [
  "first corporate Save + CRM identity creation",
  "Expected first corporate save to ask once before creating verified identities",
  "Expected first corporate save to create one verified Booker",
  "Expected first corporate save to create and link one verified Traveller",
  "Expected first corporate booking POST to carry the verified identity tuple",
  "Expected the saved corporate pair to reload before the booking POST",
]) assert.ok(
  bookingUiBrowser.includes(fragment),
  `Missing visible first corporate Save + CRM coverage ${fragment}`,
);

for (const fragment of [
  "visible public customer request Accept + Cal identity handoff",
  "Expected public customer request Accept + Cal to carry the verified identity tuple",
  "Expected public customer request Accept + Cal to ask once before saving the new Traveller",
  "Expected public customer request Accept + Cal to reuse its verified Booker",
  "Expected public customer request Accept + Cal to create only the missing Traveller",
  "Expected public customer request Accept + Cal to link the exact Traveller once",
  "Expected public customer request Accept + Cal not to duplicate its verified Booker",
  "Expected the public customer request pair to reload before Accept + Cal PATCH",
  "Expected public Hotel / Tour Agency Accept + Cal not to call a Booker or Traveller writer",
  "Expected public Hotel / Tour Agency Accept + Cal not to ask for a corporate identity pair",
  "Expected public Hotel / Tour Agency Accept + Cal to keep the one unchanged Calendar sync",
]) assert.ok(
  appSmokeBrowser.includes(fragment),
  `Missing visible public customer request identity handoff coverage ${fragment}`,
);

console.log("Admin Dispatch CRM identity selectors guard passed.");
