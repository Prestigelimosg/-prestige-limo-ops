import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [app, adapter, appSmokeBrowser, bookingUiBrowser, rateSetupRead, adminBookers, customerProfileEditor, customerAccountBrowser, packageJson] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/admin-booking-supabase-adapter.ts", "utf8"),
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
  'data-admin-dispatch-customer-account-create="true"',
  'data-admin-dispatch-new-customer-choice="true"',
  'data-admin-dispatch-new-customer-corporate="true"',
  "adminDispatchFilteredCustomerAccountOptions",
  "adminDispatchCustomerAccountSearch",
  "selectAdminDispatchCustomerAccount",
  "hasVerifiedCustomerIdentity",
  "Choose an existing Customer Account or use Create New Customer",
  'adminDispatchNewCustomerType === "corporate"',
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
  "adminDispatchCustomerAccountSelectionLocked",
  'md:w-[calc((100%_-_1rem)/3)]',
  'relative z-30 mt-1 w-full overflow-hidden rounded-md border border-sky-300 bg-white shadow-lg md:absolute md:left-0 md:top-full',
  "rateCompanies",
  "rateBookers",
  "rateTravelers",
  "formatVerifiedCustomerAccountTitle",
]) assert.ok(app.includes(fragment), `Missing ${fragment}`);

assert.ok(
  app.includes("label: formatVerifiedCustomerAccountTitle({") &&
    app.includes("companyName,") &&
    app.includes("bookerName,"),
  "Dispatch Customer Account option titles must use the shared exact Company + Booker formatter",
);
for (const forbiddenTitle of [
  "label: bookerName,",
  "label: loadedBookerName || loadedCompanyName,",
]) {
  assert.ok(
    !app.includes(forbiddenTitle),
    `Dispatch Customer Account option title must not use booking/passenger-era display precedence ${forbiddenTitle}`,
  );
}

for (const forbiddenFragment of [
  'data-admin-dispatch-new-customer-account="true"',
  'data-admin-dispatch-new-customer-personal="true"',
  'data-admin-email-ai-use-repeated-customer="true"',
  "applyAdminEmailAiRepeatedCustomerCandidate",
  '`corporate:${companyId}:unassigned`',
  "New personal customer selected",
  "Customer account — many passengers",
]) {
  assert.ok(
    !app.includes(forbiddenFragment),
    `Future bookings must not expose retired customer-identity choice ${forbiddenFragment}`,
  );
}

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
  "adminDispatchLegacyAgencyAccountOptions",
  "adminDispatchLegacyProfileConversionOptions",
  'secondaryLabel: "Existing customer profile · Booker required"',
  "adminDispatchCustomerAccountOptions.push(...adminDispatchLegacyProfileConversionOptions)",
  "loadedLegacyAgencyAccount",
  "Boolean(clean(appliedAdminBookingSnapshotReference))",
  "`corporate:${companyId}:${bookerId}`",
  "existing.travelers.push(traveler)",
  'customerId: account.customerId',
  'booker: ""',
  'bookerContact: ""',
  'bookerEmail: ""',
  'bookerId: account.bookerId',
  'companyId: account.companyId',
  'travelerId: ""',
  "Choose or create the exact Company + Booker Customer Account before Save + CRM.",
  "Retry customer list",
  "Enter and approve the exact Booker before Save + CRM.",
]) assert.ok(app.includes(fragment), `Missing unified account identity preservation ${fragment}`);

assert.ok(
  adapter.includes("explicitLegacyCustomerRows") &&
    adapter.includes('.eq("company_id", verifiedCompanyId)') &&
    adapter.includes('.eq("customer_id", verifiedCustomerId)'),
  "An explicitly selected legacy Customer profile must be accepted only with exact saved Company + Customer evidence",
);
assert.ok(
  app.includes("loadedLegacyAgencyBooking") &&
    app.includes("Boolean(clean(appliedAdminBookingSnapshotReference))"),
  "Only a loaded legacy saved booking may continue through the company-only compatibility lane",
);

const loadedUnassignedCorporateOptionStart = app.indexOf(
  "if (\n    clean(appliedAdminBookingSnapshotReference) &&\n    booking.companyId &&",
);
const loadedUnassignedCorporateOptionEnd = app.indexOf(
  "adminDispatchCustomerAccountOptions.sort",
  loadedUnassignedCorporateOptionStart + 1,
);
assert.ok(
  loadedUnassignedCorporateOptionStart >= 0 &&
    loadedUnassignedCorporateOptionEnd > loadedUnassignedCorporateOptionStart,
  "The unified chooser must retain its bounded loaded/unassigned corporate option",
);
const loadedUnassignedCorporateOptionBlock = app.slice(
  loadedUnassignedCorporateOptionStart,
  loadedUnassignedCorporateOptionEnd,
);
assert.ok(
  loadedUnassignedCorporateOptionBlock.includes(
    "clean(appliedAdminBookingSnapshotReference)",
  ),
  "A legacy Company-only identity may appear only for an exact loaded saved booking",
);
assert.ok(
  loadedUnassignedCorporateOptionBlock.includes(
    'searchText: `${loadedCompanyName} ${loadedBookerName}`.toLocaleLowerCase(),',
  ),
  "The company-only loaded identity search must use only its current company/label evidence",
);
assert.ok(
  !loadedUnassignedCorporateOptionBlock.includes("clean(booking.name)"),
  "An unverified draft passenger must not become searchable verified account identity",
);

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
assert.ok(rateSetupRead.includes('const bookerSelect = "id, company_id, customer_id, booker_name, customer_rates"'));
assert.ok(rateSetupRead.includes("bookers: asArray(bookersResult.data)"));

const emailAiSuggestionStart = app.indexOf("function applyAdminEmailAiCustomerProfileRecommendation");
const emailAiSuggestionEnd = app.indexOf("async function loadRates", emailAiSuggestionStart + 1);
assert.ok(
  emailAiSuggestionStart >= 0 && emailAiSuggestionEnd > emailAiSuggestionStart,
  "Missing bounded Email-AI Customer Account suggestion handler",
);
const emailAiSuggestionBlock = app.slice(emailAiSuggestionStart, emailAiSuggestionEnd);
assert.ok(
  emailAiSuggestionBlock.includes("This is a suggestion only. Choose the exact Company + Booker Customer Account before Save + CRM."),
  "Email-AI matching must tell Admin that no account was selected",
);
for (const forbiddenFragment of ["setBooking(", "companyId:", "customerId:", "bookerId:", "travelerId:"]) {
  assert.ok(
    !emailAiSuggestionBlock.includes(forbiddenFragment),
    `Email-AI suggestion must never bind account identity through ${forbiddenFragment}`,
  );
}

for (const fragment of [
  "resolveSaveCrmCorporateIdentityForSave",
  "Approve this Company + Booker Customer Account",
  "loadSaveCrmCorporateIdentityRows",
  "loadSaveCrmBookerById",
  "findOrCreateSaveCrmBooker",
  "bookerId: adminDispatchVerifiedIdentityId(record.booker_id)",
  "companyId: adminDispatchVerifiedIdentityId(record.company_id)",
  "customerId: adminDispatchVerifiedIdentityId(record.customer_id)",
  "travelerId: adminDispatchVerifiedIdentityId(record.traveler_id)",
  "accountCreationApproved",
  "No existing account is linked to this Booker.",
  "hasVerifiedCompanyBookerIdentity",
  "!travelerName && !hasVerifiedCompanyBookerIdentity",
  "Enter the Booker / PA name before saving this corporate booking.",
  "loadSaveCrmAgencyCustomerClassification",
  "This customer request is missing its exact verified customer or company.",
  "if (!updateIsHotelAgencyBooking && !updateBookerId)",
  "`verified company ${updateCompanyId}`",
  "companyId: String(corporateIdentityResolution.companyId)",
  "bookerId: String(corporateIdentityResolution.bookerId)",
  "travelerId: corporateIdentityResolution.travelerId",
]) assert.ok(app.includes(fragment), `Missing first corporate Save + CRM identity handoff ${fragment}`);

assert.ok(
  !app.includes("Enter both Booker / PA name and Passenger name before saving this corporate booking."),
  "Passenger must not remain part of the Company + Booker account-identity gate",
);
assert.ok(
  app.includes('warnings.push("Passenger name missing")'),
  "Passenger must remain booking-specific release-readiness evidence",
);

assert.ok(
  app.includes("customerId: account.customerId") &&
    app.includes("Use existing account"),
  "Company + Booker selection and first-time review must carry the durable Customer account identity",
);
assert.ok(
  !app.includes("Create or reuse this verified Booker + Traveller under"),
  "A different passenger must not reopen Customer account identity approval",
);
for (const fragment of [
  'data-admin-dispatch-customer-account-match-review="true"',
  'data-admin-dispatch-customer-account-use-existing="true"',
  'data-admin-dispatch-customer-account-different-person="true"',
  'data-admin-dispatch-customer-account-review-cancel="true"',
  "confirmAdminDispatchExistingPassenger",
  "confirmAdminDispatchDifferentPassenger",
  "setAdminDispatchCustomerAccountMatchReview",
]) {
  assert.ok(
    !app.includes(fragment),
    `Verified Company + Booker selection must not retain passenger identity prompt ${fragment}`,
  );
}

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
  "Expected first corporate save to ask once for the Company and once for the new Company + Booker account",
  "Expected first corporate save to create one verified Booker",
  "Expected the booking-specific passenger not to create or link a durable Traveller profile",
  "Expected first corporate booking POST to carry the verified identity tuple",
  "Expected the saved Company + Booker identity to reload before the booking POST",
  "Expected a newly appeared server candidate to re-open review after the explicit empty-candidate creation decision",
  "Expected final creation to carry the latest server-revalidated exact candidate set",
]) assert.ok(
  bookingUiBrowser.includes(fragment),
  `Missing visible first corporate Save + CRM coverage ${fragment}`,
);

for (const fragment of [
  "unified Customer Account search keeps Company + Booker identity tuples",
  'assert.equal(emailAiCompanyFallbackState.selectedKey, "")',
  'assert.equal(emailAiCompanyFallbackState.companyId, "")',
  "Customer Account passenger quick search",
  'assert.deepEqual(unifiedCustomerQuickSearchState, ["corporate:55:5501"])',
  "known Company + Booker selection without a passenger identity prompt",
  "different passenger keeps the approved Company + Booker account without another prompt",
]) assert.ok(
  bookingUiBrowser.includes(fragment),
  `Missing visible unified Customer Account coverage ${fragment}`,
);

for (const fragment of [
  '"corporate:41:4101"',
  '"corporate:55:5501"',
  '"corporate:55:5502"',
  "approved Booker account remains selectable without a Traveller row",
  'bookerId: "5502"',
  'customerId: "551"',
  "Customer Account bar must retain the previous one-column Customer width",
  "checking iPhone Customer Account layout and touch selection",
  'assert.equal(mobileOpenState.menuPosition, "relative")',
  'assert.equal(mobileOpenState.overlapsCompanyField, false)',
  "touch-selected exact mobile Customer Account",
  "checking narrow-phone Customer Account containment",
  'viewportWidth: 320',
  "checking passenger-specific repeat account selection",
  "known account with booking-specific passenger and no identity prompt",
  "different passenger keeps the approved account without another prompt",
  "verified Company + Booker Save + CRM account gate",
  "The focused Company + Booker probe must perform zero booking writes",
  "single Company + Booker new-customer choice",
  "new-customer path selection",
  "assert.equal(bookingPosts.length, 0)",
  'search("Kim Passenger")',
  'search("Mr Jwalent Nanavati")',
]) assert.ok(
  customerAccountBrowser.includes(fragment),
  `Missing focused Customer Account browser coverage ${fragment}`,
);
for (const handler of [
  "selectAdminDispatchCustomerAccount",
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
  "Expected public customer request Accept + Cal to keep the passenger booking-specific",
  "Expected the approved Company + Booker account not to reopen identity review for its booking-specific passenger",
  "Expected public customer request Accept + Cal to reuse its verified Booker",
  "Expected public customer request Accept + Cal not to create a Traveller from booking-specific passenger text",
  "Expected public customer request Accept + Cal not to link a Traveller from booking-specific passenger text",
  "Expected public customer request Accept + Cal not to duplicate its verified Booker",
  "Expected the public customer request Company + Booker account and booking-specific passenger evidence to reload before Accept + Cal PATCH",
  "Expected public Hotel / Tour Agency Accept + Cal not to call a Booker or Traveller writer",
  "Expected public Hotel / Tour Agency Accept + Cal not to ask for a corporate identity pair",
  "Expected public Hotel / Tour Agency Accept + Cal to keep the one unchanged Calendar sync",
]) assert.ok(
  appSmokeBrowser.includes(fragment),
  `Missing visible public customer request identity handoff coverage ${fragment}`,
);

console.log("Admin Dispatch CRM identity selectors guard passed.");
