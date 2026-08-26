import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, savedBookingsPanel] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
]);

for (const fragment of [
  'data-admin-email-ai-customer-status="true"',
  "Repeated customer",
  "New customer",
  "Ambiguous customer",
  "Customer check unavailable",
  'data-admin-email-ai-use-repeated-customer="true"',
  "Email AI intake",
]) {
  assert.ok(
    adminPage.includes(fragment),
    `Email AI customer identity detection is missing ${fragment}`,
  );
}

assert.ok(
  adminPage.includes("if (activeAdminEmailAiIntakeId)"),
  "Email AI parsing must retain an exact source-specific identity-review branch",
);
assert.ok(
  adminPage.includes('loadRates("Email AI customer check loaded."'),
  "Email AI customer detection must reuse the established guarded CRM/rate read",
);
assert.ok(
  adminPage.includes("adminDispatchVerifiedIdentityId(bookingValue.companyId)"),
  "Email AI repeated-customer confirmation must continue through the existing verified booking identity fields",
);
assert.match(
  adminPage,
  /const adminEmailAiCustomerStatus =\s*!activeAdminEmailAiIntakeId \|\|\s*adminDispatchSelectedAgencyFolder \|\|\s*adminDispatchCreatingAgencyFolder \|\|\s*adminEmailAiCustomerProfileSuggestion\s*\? null/,
  "An explicit agency folder or exact app-profile suggestion must suppress the contradictory new/repeated-customer banner",
);

for (const fragment of [
  "adminEmailAiRecommendationEmail",
  "adminEmailAiRecommendationCompanyName",
  "loadAdminEmailAiCustomerProfileRecommendation",
  "applyAdminEmailAiCustomerProfileRecommendation",
  "operations_email",
  "booker_email",
  "company_name",
  "verified_company_id",
  "guest_account_billing_enabled",
  'data-admin-email-ai-customer-profile-suggestion="true"',
  "Suggested from the app customer profile",
  "Admin can change this selection before Save + CRM",
]) {
  assert.ok(
    adminPage.includes(fragment),
    `Email AI app customer-profile recommendation is missing ${fragment}`,
  );
}

const recommendationStart = adminPage.indexOf(
  "async function loadAdminEmailAiCustomerProfileRecommendation",
);
const recommendationEnd = adminPage.indexOf(
  "\n  function ",
  recommendationStart + 1,
);
assert.ok(
  recommendationStart >= 0 && recommendationEnd > recommendationStart,
  "Email AI customer-profile recommendation must remain one bounded existing-lane helper",
);
const recommendationBlock = adminPage.slice(recommendationStart, recommendationEnd);

for (const fragment of [
  "adminCompaniesCrmIdentityApiPath",
  "adminBookersApiPath",
  "adminCustomerAccountsApiPath",
  'method: "GET"',
  "exactEmailCompanyIds",
  "exactNameCompanyIds",
  "agencyFolders",
  'matchBasis = "email"',
  'matchBasis = "company name"',
  "normaliseEmail(emailCompany?.operations_email",
  "normaliseEmail(bookerBody.booker?.email",
  "saveCrmComparableIdentityValue(nameCompany?.company_name)",
]) {
  assert.ok(
    recommendationBlock.includes(fragment),
    `Email AI customer-profile recommendation read is missing ${fragment}`,
  );
}

assert.doesNotMatch(
  recommendationBlock,
  /method:\s*["'](?:POST|PATCH|PUT|DELETE)["']|\/rest\/v1\/|createClient|supabase|searchParams\.set\(["']domain["']|billingCompanyIdentityMatches/i,
  "Email AI customer-profile recommendation must remain read-only through existing typed APIs and must not use domain or fuzzy company matching",
);
assert.match(
  recommendationBlock,
  /if \(recommendationEmail\)[\s\S]+exactEmailCompanyIds\.size === 1[\s\S]+matchBasis = "email"[\s\S]+if \(!matchBasis && recommendationCompanyName\)/,
  "Either one exact email match must win first, or exact company name may be used only as the fallback",
);
assert.match(
  adminPage,
  /adminEmailAiCustomerRecommendationRevisionRef\.current === recommendationRevision[\s\S]{0,500}activeAdminEmailAiIntakeIdRef\.current === recommendationIntakeId/,
  "A late Email AI customer-profile response must not overwrite another intake or a manual selection",
);
assert.match(
  adminPage,
  /loadRates\("Email AI customer check loaded\.",\s*\{[\s\S]{0,180}includeAgencyFolders:\s*true/,
  "Email AI recommendation must load the established customer profiles and agency folders before selecting",
);

const explicitNewCustomerChoiceStart = adminPage.indexOf(
  "function chooseAdminDispatchNewCustomerType",
);
const explicitNewCustomerChoiceEnd = adminPage.indexOf(
  "\n  const ",
  explicitNewCustomerChoiceStart + 1,
);
assert.ok(
  explicitNewCustomerChoiceStart >= 0 &&
    explicitNewCustomerChoiceEnd > explicitNewCustomerChoiceStart,
  "The established explicit new-customer chooser must remain present",
);
const explicitNewCustomerChoiceBlock = adminPage.slice(
  explicitNewCustomerChoiceStart,
  explicitNewCustomerChoiceEnd,
);
for (const fragment of [
  "adminEmailAiCustomerRecommendationRevisionRef.current += 1;",
  "setAdminEmailAiCustomerProfileSuggestion(null);",
]) {
  assert.ok(
    explicitNewCustomerChoiceBlock.includes(fragment),
    `Explicit new-customer selection must invalidate the prior Email AI recommendation with ${fragment}`,
  );
}

for (const fragment of [
  'data-customer-folder-section-four-edit="true"',
  'data-customer-folder-selected-identity-resolver="true"',
  'data-customer-folder-selected-identity-group=',
  'data-customer-folder-selected-identity-pair="true"',
  'data-customer-folder-selected-identity-carried="true"',
  'data-customer-folder-selected-identity-save="true"',
  'data-customer-folder-selected-identity-message="true"',
  'data-customer-folder-section-four-job-editor="true"',
  'data-customer-folder-section-four-customer-name="true"',
  'data-customer-folder-section-four-booker-name="true"',
  'data-customer-folder-section-four-booker-contact="true"',
  'data-customer-folder-section-four-booker-email="true"',
  'data-customer-folder-section-four-passenger-name="true"',
  'data-customer-folder-section-four-job-save="true"',
  'data-customer-folder-section-four-exact-job-save="true"',
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `Section 4 customer identity correction is missing ${fragment}`,
  );
}

for (const fragment of [
  "customerFolderLegacyIdentityResolution",
  "sectionFourLegacyIdentityResolverAvailable",
  "sectionFourLegacyIdentityResolution.groups.length > 0",
  "sectionFourIdentityPairOptions",
  "sectionFourIdentityAssignmentsReady",
  "return options.some((option) => String(option.id) === selectedPairId)",
  "saveSelectedLegacyBookingIdentities",
  "sectionFourIdentitySaveInFlightRef",
  "Choose Booker / Traveller once for the selected jobs",
  "Jobs for the same passenger are saved together. Different passengers stay separate.",
  "Saving Booker / Traveller for the selected jobs...",
  "Save selected jobs",
  "!sectionFourIdentityAssignmentsReady",
  "savedCount > 0",
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `Section 4 exact-booking owner proceed confirmation is missing ${fragment}`,
  );
}

assert.match(
  savedBookingsPanel,
  /sectionFourLegacyIdentityResolverAvailable \? null : \([\s\S]{0,500}data-customer-folder-create-invoice-selected-disabled="true"/,
  "A safe in-place identity resolver must replace the duplicate disabled invoice blocker",
);

for (const fragment of [
  "sectionFourLegacyIdentityResolution.groups.map",
  "await loadCustomerFolderRateSetup({ force: true })",
  'method: "GET"',
  'method: "PATCH"',
  "customerFolderBookingPatchPayload(exactBooking, form, reference)",
  "String(exactBooking.customer_id ?? \"\") !== customerId",
  "Boolean(exactBookerId) !== Boolean(exactTravelerId)",
  "exactCompanyId && exactCompanyId !== pair.companyId",
  "exactBookerId && exactBookerId !== pair.bookerId",
  "exactTravelerId && exactTravelerId !== pair.id",
  'status: "proposed"',
  "setSectionFourEditingReference(\"\")",
  "setSectionFourIdentitySelections({})",
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `Section 4 missing-identity repair is missing ${fragment}`,
  );
}

assert.ok(
  savedBookingsPanel.includes('cache: "no-store"') &&
    savedBookingsPanel.includes("await loadCustomerFolderRateSetup({ force: true })"),
  "The selected-job resolver must bypass a stale same-page Booker / Traveller snapshot.",
);
assert.ok(
  !savedBookingsPanel.includes("proceedWithSectionFourBookingCorrection") &&
    !savedBookingsPanel.includes("Proceed for this booking") &&
    !savedBookingsPanel.includes('data-customer-folder-blocked-proceed="true"'),
  "Section 4 must not retain the repeated per-booking Proceed checkpoint.",
);

for (const fragment of [
  "company_id: inlineEditIdentityId(form.companyId)",
  "booker_id: inlineEditIdentityId(form.bookerId)",
  "traveler_id: inlineEditIdentityId(form.travelerId)",
  "contact_display_name: inlineEditText(form.bookerName",
  "contact_email: inlineEditEmail(form.bookerEmail)",
  "contact_phone: inlineEditText(form.bookerContact",
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `The existing exact-booking PATCH payload is missing ${fragment}`,
  );
}

assert.ok(
  savedBookingsPanel.includes("method: \"PATCH\""),
  "Section 4 selected-job corrections must reuse the established exact-booking PATCH",
);
assert.ok(
  !savedBookingsPanel.includes("/api/admin-email-ai-customer"),
  "The repair must not add a second Email AI customer route",
);
assert.ok(
  !savedBookingsPanel.includes("/api/admin-section-four") &&
    !savedBookingsPanel.includes("/api/admin-batch-booking"),
  "The resolver must not add a second Section 4 or batch-booking route",
);
assert.ok(
  !savedBookingsPanel.includes("Missing verified traveller identity. Invoice preparation is skipped."),
  "The verified traveller invoice boundary must remain fail closed",
);

console.log("Email AI customer identity and Section 4 correction guard passed.");
