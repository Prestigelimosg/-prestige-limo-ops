import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, calendarSyncSource, ledger] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("lib/admin-booking-google-calendar-sync.ts", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);
const bookingUiBrowserSource = await readFile("scripts/test-booking-ui-browser.mjs", "utf8");

for (const fragment of [
  "type AdminCompanyCrmIdentityRecord",
  "function buildSaveCrmCompanyProfileContactPayload",
  "async function loadSaveCrmCompanyProfileForSave",
  "async function loadSaveCrmCompanyProfileCandidateByOperationsEmail",
  "async function saveCrmCompanyProfileForBooking",
  "async function resolveSaveCrmCompanyProfileForSave",
  "saveCrmDefaultCustomerAccount(booking)",
  "const companyProfileSyncRequired = Boolean(",
  "saveCrmExplicitCompanyAccount(booking)",
  "primary_contact_name: clean(bookingValue.booker)",
  "mobile_phone: clean(bookingValue.bookerContact)",
  "operations_email: clean(bookingValue.bookerEmail).toLowerCase()",
  "company_id: adminDispatchVerifiedIdentityId(bookingValue.companyId)",
  "customer_id: adminDispatchVerifiedIdentityId(bookingValue.customerId)",
  'data-admin-dispatch-customer-account-select="true"',
  'data-admin-dispatch-new-customer-corporate="true"',
  'data-admin-dispatch-agency-folder-create="true"',
  "Create Company + Booker Account",
  "adminDispatchIsCreatingAgencyFolder(booking)",
  "hotel_agency_folder_create",
  "Each booking keeps its own passenger name.",
  "customer_folder_active",
  "verified_company_id",
  "companyId: String(companyProfileResolution.companyId)",
  "companyProfileResolution?.companyName || saveCrmCustomerAccountLabel",
]) {
  assert.ok(appSource.includes(fragment), `Missing Save + CRM company profile sync fragment: ${fragment}`);
}

const saveCrmSyncSection = appSource.slice(
  appSource.indexOf("function buildSaveCrmCompanyProfileContactPayload"),
  appSource.indexOf("function isCustomerRatesRuntimeWriteBlockedNoOp"),
);

for (const forbiddenField of [
  "accounts_email:",
  "billing_email:",
  "customer_rates:",
  "driver_payout_rules:",
  "main_phone:",
]) {
  assert.equal(
    saveCrmSyncSection.includes(forbiddenField),
    false,
    `Save + CRM company profile sync must not write ${forbiddenField}`,
  );
}

assert.match(
  saveCrmSyncSection,
  /existingValue && incomingValue && existingValue !== incomingValue/,
  "existing different company profile values must be detected before an overwrite",
);
assert.match(
  saveCrmSyncSection,
  /window\.confirm\(/,
  "new profile links, creates, or conflicting profile updates must require Admin confirmation",
);
for (const disclosure of [
  `Create and link the new CRM company profile "${"${requestedCompanyName}"}" using this booking's Booker contact? This does not create an invoice, change rates, or send a message. Saving a complete booking also syncs it to the existing private Operations Calendar with no attendees or guest email (sendUpdates=none).`,
  `Approve this Company + Booker Customer Account? Company: ${"${companyName}"}. Booker: ${"${bookerName}"}. This creates the account only after your approval. It does not create an invoice, send a message, or change driver or payment. Saving a complete booking also syncs it to the existing private Operations Calendar with no attendees or guest email (sendUpdates=none).`,
]) {
  assert.ok(
    appSource.includes(disclosure),
    `Save + CRM confirmation must disclose the established private Operations Calendar handoff: ${disclosure}`,
  );
}
assert.ok(
  appSource.includes("const calendarSyncResult = await autoSyncSavedBookingGoogleCalendar(savedBooking);"),
  "Save + CRM must retain its established Operations Calendar handoff",
);
assert.ok(
  calendarSyncSource.includes('send_updates: "none"'),
  "The disclosed Operations Calendar handoff must retain sendUpdates=none",
);
assert.equal(
  /attendees\s*:/.test(calendarSyncSource),
  false,
  "The disclosed Operations Calendar handoff must not add attendees",
);
assert.match(
  saveCrmSyncSection,
  /status !== "saved"/,
  "Save + CRM must fail closed when the guarded profile writer returns a blocked no-op",
);

const saveBookingSection = appSource.slice(
  appSource.indexOf("async function saveBooking("),
  appSource.indexOf("function bookingRecordReferenceCandidates"),
);

assert.ok(
  saveBookingSection.includes("resolveSaveCrmCompanyProfileForSave("),
  "Save + CRM must resolve the exact company profile before booking persistence",
);
assert.ok(
  saveBookingSection.includes(
    "resolveSaveCrmCompanyProfileForSave(\n            booking,\n            saveCrmExplicitCompanyAccount(booking),",
  ),
  "Save + CRM company profile lookup must use the base company field, never the passenger-scoped billing label.",
);
assert.ok(
  saveCrmSyncSection.includes(
    "Select it under Verified company, then Save + CRM again. No booking was saved.",
  ),
  "A matching operations email must block duplicate company creation and require explicit verified CRM selection.",
);
assert.ok(
  saveCrmSyncSection.includes(
    "matches this Company / Account. Select it under Verified company",
  ),
  "An unselected exact-name company match must also block and require explicit verified CRM selection.",
);
assert.ok(
  saveBookingSection.indexOf("resolveSaveCrmCompanyProfileForSave(") <
    saveBookingSection.indexOf('fetch("/api/admin-bookings"'),
  "company profile resolution must finish before a booking write begins",
);
assert.equal(
  saveBookingSection.includes("adminCompanyProfileApiPath"),
  false,
  "Save + CRM must not modify Prestige's own Company Settings lane",
);
assert.ok(
  ledger.includes("### GroundBooker Canonical Company And Agency Account Reuse Repair (2026-08-05)"),
  "the implementation ledger must record the exact GroundBooker duplicate-prevention repair",
);
assert.ok(
  ledger.includes("### Save + CRM Company Contact And Invoice Email Meaning Repair (2026-08-02)"),
  "the implementation ledger must record this exact Save + CRM repair",
);
assert.ok(
  ledger.includes("Booker email as `operations_email`"),
  "the ledger must preserve the approved operations-email meaning",
);
assert.ok(
  ledger.includes("### Save + CRM Operations Calendar Confirmation Disclosure Repair (2026-08-23)"),
  "the implementation ledger must record the exact Save + CRM Operations Calendar disclosure repair",
);
for (const fragment of [
  "__prestigeCrmCompanyIdentityRequests",
  "__prestigeCrmCompanyWriteRequests",
  "Create and link the new CRM company profile",
  'operations_email: "browserui@example.com"',
  "Expected Save + CRM to write only the approved base company name and Booker contact fields",
  "future Company + Booker-only new-customer choice",
  "Create Company + Booker Account",
  "future Company + Booker light-mode UI",
  "Expected the future Company + Booker mode to keep one unified customer choice",
  'assert.equal(futureCompanyBookerUi.company, "BROWSER UI TEST COMPANY")',
  'assert.equal(futureCompanyBookerUi.booker, "BROWSER UI TEST BOOKER")',
  'assert.equal(futureCompanyBookerUi.passenger, "BROWSER UI TEST TRAVELER")',
  "Expected a future booking without Company + Booker to fail before booking, CRM, or Calendar writes",
]) {
  assert.ok(
    bookingUiBrowserSource.includes(fragment),
    `Missing visible browser Save + CRM profile sync coverage: ${fragment}`,
  );
}

console.log("Save + CRM company profile contact sync guard passed.");
