import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [appSource, ledger] = await Promise.all([
  readFile("app/page.tsx", "utf8"),
  readFile("docs/current-implementation-ledger.md", "utf8"),
]);
const bookingUiBrowserSource = await readFile("scripts/test-booking-ui-browser.mjs", "utf8");

for (const fragment of [
  "type AdminCompanyCrmIdentityRecord",
  "function buildSaveCrmCompanyProfileContactPayload",
  "async function loadSaveCrmCompanyProfileForSave",
  "async function saveCrmCompanyProfileForBooking",
  "async function resolveSaveCrmCompanyProfileForSave",
  "saveCrmDefaultCustomerAccount(booking)",
  "const companyProfileSyncRequired = Boolean(",
  "saveCrmExplicitCompanyAccount(booking)",
  "primary_contact_name: clean(bookingValue.booker)",
  "mobile_phone: clean(bookingValue.bookerContact)",
  "operations_email: clean(bookingValue.bookerEmail).toLowerCase()",
  "company_id: adminDispatchVerifiedIdentityId(bookingValue.companyId)",
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
assert.match(
  saveCrmSyncSection,
  /status !== "saved"/,
  "Save + CRM must fail closed when the guarded profile writer returns a blocked no-op",
);

const saveBookingSection = appSource.slice(
  appSource.indexOf("async function saveBooking()"),
  appSource.indexOf("function bookingRecordReferenceCandidates"),
);

assert.ok(
  saveBookingSection.includes("resolveSaveCrmCompanyProfileForSave("),
  "Save + CRM must resolve the exact company profile before booking persistence",
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
  ledger.includes("### Save + CRM Company Contact And Invoice Email Meaning Repair (2026-08-02)"),
  "the implementation ledger must record this exact Save + CRM repair",
);
assert.ok(
  ledger.includes("Booker email as `operations_email`"),
  "the ledger must preserve the approved operations-email meaning",
);
for (const fragment of [
  "__prestigeCrmCompanyIdentityRequests",
  "__prestigeCrmCompanyWriteRequests",
  "Create and link the new CRM company profile",
  'operations_email: "browserui@example.com"',
  "Expected Save + CRM to write only the approved company name and Booker contact fields",
]) {
  assert.ok(
    bookingUiBrowserSource.includes(fragment),
    `Missing visible browser Save + CRM profile sync coverage: ${fragment}`,
  );
}

console.log("Save + CRM company profile contact sync guard passed.");
