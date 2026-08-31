import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [adminPage, savedBookingsPanel] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
]);

for (const fragment of [
  'data-admin-email-ai-customer-profile-suggestion="true"',
  'data-admin-email-ai-customer-profile-status=',
  "Possible Customer Account",
  "No exact Company + Booker Customer Account match was found.",
  "This does not prove a new customer.",
  "Passenger stays on this booking only.",
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
for (const retiredFragment of [
  "adminEmailAiPassengerMatches",
  "adminEmailAiRepeatedCustomerCandidates",
  "adminEmailAiRepeatedCustomerCandidate",
  "adminEmailAiCustomerStatus",
  "No verified CRM traveller matches this Email AI passenger.",
  "invoicing remains blocked until",
  "A passenger-name match exists",
]) {
  assert.ok(
    !adminPage.includes(retiredFragment),
    `Email AI customer-account detection must not retain Passenger/Traveller account evidence: ${retiredFragment}`,
  );
}

for (const fragment of [
  "adminEmailAiRecommendationEmail",
  "adminEmailAiRecommendationCompanyName",
  "adminEmailAiRecommendationBookerName",
  "loadAdminEmailAiCustomerProfileRecommendation",
  "applyAdminEmailAiCustomerProfileRecommendation",
  "operations_email",
  "booker_email",
  "company_name",
  "verified_company_id",
  "guest_account_billing_enabled",
  'data-admin-email-ai-customer-profile-suggestion="true"',
  "This is a suggestion only. Choose the exact Company + Booker Customer Account before Save + CRM.",
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
  "matchedBooker",
  "exactCustomerAccounts",
  'matchBasis = "booker email"',
  'matchBasis = "company and Booker"',
  "normaliseEmail(emailCompany?.operations_email",
  "normaliseEmail(emailBooker?.email",
  "saveCrmComparableIdentityValue(nameCompany?.company_name)",
  "saveCrmComparableIdentityValue(bookerBody?.booker_name)",
  "adminDispatchVerifiedIdentityId(matchedBooker.customer_id)",
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
  /if \(recommendationEmail\)[\s\S]+if \(!matchedCompanyId && recommendationCompanyName\)[\s\S]+if \(!matchedBooker && matchedCompanyId && recommendationBookerName\)/,
  "An exact Booker email may identify the Booker first; otherwise exact Company plus exact Booker name is required",
);
assert.match(
  recommendationBlock,
  /if \(!matchedBooker \|\| !matchedCompanyId \|\| !matchBasis\)[\s\S]+status: "unmatched"/,
  "A Company-only result must never be presented as an existing Customer Account",
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

const recommendationApplyStart = adminPage.indexOf(
  "function applyAdminEmailAiCustomerProfileRecommendation",
);
const recommendationApplyEnd = adminPage.indexOf(
  "\n  async function ",
  recommendationApplyStart + 1,
);
assert.ok(
  recommendationApplyStart >= 0 && recommendationApplyEnd > recommendationApplyStart,
  "Email AI customer-profile recommendation presentation must remain one bounded existing-lane helper",
);
const recommendationApplyBlock = adminPage.slice(
  recommendationApplyStart,
  recommendationApplyEnd,
);
for (const fragment of [
  'recommendation.status === "matched"',
  'recommendation.status === "unmatched"',
  'status: recommendation.status',
  "No exact Company + Booker Customer Account match was found.",
  "This does not prove a new customer.",
  "Passenger stays on this booking only.",
]) {
  assert.ok(
    recommendationApplyBlock.includes(fragment),
    `Email AI safe customer-account recommendation presentation is missing ${fragment}`,
  );
}
assert.doesNotMatch(
  recommendationApplyBlock,
  /setBooking|setRate|method:\s*["'](?:POST|PATCH|PUT|DELETE)["']|customerId:|companyId:|bookerId:|travelerId:/,
  "Email AI repeated-customer detection must remain a read-only suggestion and must never select or write an account identity",
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
