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

for (const fragment of [
  'const adminCompanyTravelerCrmRuntimeWriteActionApiPath =',
  'const adminLegacyTravelersApiPath = "/api/admin-legacy-data/rest/v1/travelers"',
  'data-customer-folder-section-four-edit="true"',
  'data-customer-folder-section-four-identity-editor="true"',
  'data-customer-folder-section-four-company-identity="true"',
  'data-customer-folder-section-four-booker-identity="true"',
  'data-customer-folder-section-four-traveler-identity="true"',
  'data-customer-folder-section-four-customer-name="true"',
  'data-customer-folder-section-four-booker-name="true"',
  'data-customer-folder-section-four-booker-contact="true"',
  'data-customer-folder-section-four-booker-email="true"',
  'data-customer-folder-section-four-passenger-name="true"',
  'data-customer-folder-section-four-save="true"',
  'data-customer-folder-section-four-exact-booking-proceed="true"',
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `Section 4 customer identity correction is missing ${fragment}`,
  );
}

for (const fragment of [
  "sectionFourProceedCause",
  "sectionFourProceedConfirmation",
  "proceedWithSectionFourBookingCorrection",
  "event.isTrusted",
  "window.confirm",
  "Proceed for this booking",
  "Cause:",
  "saves only the reviewed customer identity and job fields for this booking",
  "The customer price returns to Review required.",
  "Email AI and Ask AI cannot approve this action.",
  "inlineEditText(inlineEditState.booking?.booking_reference, 120)",
  "Proceed cancelled for",
  "No job was changed.",
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `Section 4 exact-booking owner proceed confirmation is missing ${fragment}`,
  );
}

for (const fragment of [
  "ensureSectionFourVerifiedIdentity",
  'action_type: "traveler_create"',
  "booker_id: bookerId",
  "await loadCustomerFolderRateSetup({ force: true })",
]) {
  assert.ok(
    savedBookingsPanel.includes(fragment),
    `Section 4 missing-identity repair is missing ${fragment}`,
  );
}

assert.ok(
  savedBookingsPanel.includes('cache: "no-store"') &&
    savedBookingsPanel.includes("await loadCustomerFolderRateSetup({ force: true })"),
  "Opening the existing Section 4 editor must bypass a stale same-page CRM identity snapshot.",
);
assert.ok(
  !savedBookingsPanel.slice(
    savedBookingsPanel.indexOf("function updateSectionFourTravelerIdentity"),
    savedBookingsPanel.indexOf("function sectionFourVerifiedIdentityIsValid"),
  ).includes("passengerName:"),
  "Selecting a verified Traveller must not overwrite the booking's separately reviewed passenger text.",
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
  "Section 4 corrections must reuse the established exact-booking PATCH",
);
assert.ok(
  savedBookingsPanel.indexOf(
    "await ensureSectionFourVerifiedIdentity",
    savedBookingsPanel.indexOf("async function saveInlineBookingDetails"),
  ) <
    savedBookingsPanel.indexOf("const payload = {", savedBookingsPanel.indexOf("async function saveInlineBookingDetails")),
  "Section 4 must establish the verified identity before the exact booking PATCH payload is built",
);
assert.ok(
  !savedBookingsPanel.includes("/api/admin-email-ai-customer"),
  "The repair must not add a second Email AI customer route",
);
assert.ok(
  !savedBookingsPanel.includes("/api/admin-section-four-proceed"),
  "The exact-booking proceed confirmation must reuse the established booking and CRM routes",
);
assert.ok(
  !savedBookingsPanel.includes("Missing verified traveller identity. Invoice preparation is skipped."),
  "The verified traveller invoice boundary must remain fail closed",
);

console.log("Email AI customer identity and Section 4 correction guard passed.");
