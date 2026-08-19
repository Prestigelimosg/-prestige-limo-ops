import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, appSmokeBrowser, bookingUiBrowser, rateSetupRead, adminBookers, customerProfileEditor, customerAccountBrowser, packageJson] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
  readFile("scripts/test-booking-ui-browser.mjs", "utf8"),
  readFile("lib/admin-rate-setup-read.ts", "utf8"),
  readFile("lib/admin-bookers.ts", "utf8"),
  readFile("app/customers/[customerId]/customer-company-profile-editor.tsx", "utf8"),
  readFile("scripts/test-admin-dispatch-customer-account-browser.mjs", "utf8"),
  readFile("package.json", "utf8"),
]);

for (const fragment of [
  'data-admin-dispatch-crm-identity-selectors="true"',
  'data-admin-dispatch-customer-account-select="true"',
  'data-admin-dispatch-customer-account-search="true"',
  'data-admin-dispatch-customer-account-option={account.key}',
  'data-admin-dispatch-customer-account-match-review="true"',
  'data-admin-dispatch-customer-account-use-existing="true"',
  'data-admin-dispatch-customer-account-different-person="true"',
  'data-admin-dispatch-customer-account-review-cancel="true"',
  'data-admin-dispatch-customer-account-create="true"',
  'data-admin-dispatch-new-customer-choice="true"',
  'data-admin-dispatch-new-customer-account="true"',
  'data-admin-dispatch-new-customer-corporate="true"',
  'data-admin-dispatch-new-customer-personal="true"',
  "adminDispatchFilteredCustomerAccountOptions",
  "adminDispatchCustomerAccountSearch",
  "selectAdminDispatchCustomerAccount",
  "confirmAdminDispatchExistingPassenger",
  "confirmAdminDispatchDifferentPassenger",
  "hasVerifiedCustomerIdentity",
  "Choose an existing Customer Account or use Create New Customer",
  'adminDispatchNewCustomerType === "corporate"',
  'adminDispatchNewCustomerType === "personal"',
  'adminDispatchNewCustomerType !== "personal"',
  "setAdminDispatchCustomerAccountMatchReview(null)",
  "setAdminDispatchNewCustomerType(null)",
  'data-admin-dispatch-customer-list-retry="true"',
  "adminDispatchCustomerListAutoLoadAttemptedRef",
  'activeTab !== "dispatch"',
  'includeAgencyFolders: true',
  'silent: true',
  "adminDispatchCustomerAccountOptions",
  "billingIdentityPossibleMatch",
  "accountTravelers",
  "passengerSearchText",
  "CRM Traveller #",
  "adminDispatchCustomerAccountSelectionLocked",
  'md:w-[calc((100%_-_1rem)/3)]',
  "rateCompanies",
  "rateTravelers",
]) assert.ok(app.includes(fragment), `Missing ${fragment}`);

assert.ok(
  !app.includes('data-admin-dispatch-agency-folder-select="true"'),
  "The separate Hotel / Tour Agency selector must be absent after account unification",
);
assert.ok(
  !app.includes('data-admin-dispatch-corporate-customer-select="true"'),
  "The separate corporate selector must be absent after account unification",
);
assert.ok(
  !app.includes('data-admin-dispatch-corporate-pair-select="true"'),
  "The separate corporate pair selector must be absent after account unification",
);
assert.ok(
  !customerProfileEditor.includes('data-customer-guest-account-billing={customerId}'),
  "The profile must not expose the legacy Hotel / Tour Agency checkbox",
);
assert.ok(
  customerProfileEditor.includes("profile.guest_account_billing_enabled"),
  "Stored customer classification must remain available to the existing profile and access consumers",
);

for (const fragment of [
  "adminDispatchAgencyCompanyIds",
  "adminDispatchAgencyCompanyIds.has(companyId)",
  "`corporate:${companyId}:${bookerId}`",
  "existing.travelers.push(traveler)",
  'customerId: account.customerId',
  'bookerId: account.bookerId',
  'companyId: account.companyId',
  'travelerId: traveler ? String(traveler.id) : ""',
  'customerId: type === "account" ? adminDispatchCreateAgencyFolderValue : ""',
  'company: type === "personal" ? "" : current.company',
  "Retry customer list",
]) assert.ok(app.includes(fragment), `Missing unified account identity preservation ${fragment}`);

assert.ok(
  !app.includes('data-admin-dispatch-corporate-pair-applying="true"'),
  "The unified chooser must not silently auto-apply a lone passenger",
);
assert.ok(
  !customerProfileEditor.includes("guestAccountBillingChanged") &&
    !customerProfileEditor.includes("...(guestAccountBillingChanged"),
  "Saving a customer profile must not rewrite its hidden stored classification",
);
assert.ok(
  !customerProfileEditor.includes("prestige:customer-guest-account-billing-updated"),
  "The removed profile checkbox must not retain a hidden classification mutation event",
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
  "unified Customer Account search keeps agency, corporate, and personal identity tuples",
  "one possible passenger match asks Admin before selection",
  "multiple possible passenger matches remain a candidate list",
  "different person keeps the account but clears the verified Traveller",
  "no Customer Account review choice sends a booking POST",
]) assert.ok(
  bookingUiBrowser.includes(fragment),
  `Missing visible unified Customer Account coverage ${fragment}`,
);

for (const fragment of [
  '"agency:174:41"',
  '"corporate:55:5501"',
  "Customer Account bar must retain the previous one-column Customer width",
  "one passenger review",
  "multiple passenger candidates",
  "different passenger account state",
  "explicit new-customer choices",
  "new-customer path selection",
  "assert.equal(bookingPosts.length, 0)",
  'search("Kim Passenger")',
  'search("Mr Jwalent Nanavati")',
  "CRM Traveller #55002",
  "CRM Traveller #55003",
]) assert.ok(
  customerAccountBrowser.includes(fragment),
  `Missing focused Customer Account browser coverage ${fragment}`,
);
for (const handler of [
  "selectAdminDispatchCustomerAccount",
  "confirmAdminDispatchExistingPassenger",
  "confirmAdminDispatchDifferentPassenger",
  "chooseAdminDispatchNewCustomerType",
]) {
  const start = app.indexOf(`function ${handler}`);
  assert.ok(start >= 0, `Missing loaded-booking lock handler ${handler}`);
  assert.ok(
    app.slice(start, start + 450).includes("adminDispatchCustomerAccountSelectionLocked"),
    `${handler} must reject stale customer-account changes after a saved booking is loaded`,
  );
}
assert.ok(
  packageJson.includes('"test:admin-dispatch-customer-account-browser"'),
  "The focused Customer Account browser test must remain directly runnable",
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
