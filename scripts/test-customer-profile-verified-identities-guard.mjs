import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [editor, identityEditor, bookerRoute, dispatch, bookPage] = await Promise.all([
  readFile("app/customers/[customerId]/customer-company-profile-editor.tsx", "utf8"),
  readFile("app/customers/[customerId]/customer-verified-identities-editor.tsx", "utf8"),
  readFile("app/api/admin-bookers/route.ts", "utf8"),
  readFile("app/page.tsx", "utf8"),
  readFile("app/book/page.tsx", "utf8"),
]);

for (const fragment of [
  "CustomerVerifiedIdentitiesEditor",
  "companyId={profile.id}",
  "companyName={profile.company_name}",
]) {
  assert.ok(editor.includes(fragment), `Customer profile must mount the established verified identity editor: ${fragment}`);
}

for (const fragment of [
  'data-customer-verified-identities="true"',
  'data-customer-booker-name="true"',
  'data-customer-traveler-name="true"',
  'data-customer-booker-email="true"',
  'data-customer-booker-contact="true"',
  'data-customer-save-booker-traveler="true"',
  "Save Booker + Traveller",
  "window.confirm",
  "findOrCreateBooker",
  'method: "GET"',
  'method: "POST"',
  'method: "PATCH"',
  'action_type: "traveler_create"',
  "booker_id: bookerId",
  "await loadIdentities({ afterSave: true })",
]) {
  assert.ok(identityEditor.includes(fragment), `Verified customer identity lane is missing ${fragment}`);
}

for (const existingPath of [
  'const adminBookersApiPath = "/api/admin-bookers"',
  'const adminRateSetupApiPath = "/api/admin-rate-setup"',
  'const adminCompanyTravelerWriteApiPath = "/api/admin-company-traveler-crm-runtime-write-action"',
  'const adminLegacyTravelersApiPath = "/api/admin-legacy-data/rest/v1/travelers"',
]) {
  assert.ok(identityEditor.includes(existingPath), `Customer profile must reuse the existing identity path: ${existingPath}`);
}

assert.ok(
  identityEditor.indexOf("await loadIdentities({ silent: true })") < identityEditor.indexOf("await findOrCreateBooker()"),
  "Retry-safe identity saving must exact-read existing travelers before creating a Booker or Traveller.",
);
assert.ok(
  identityEditor.indexOf("existingLinkedBookerName") < identityEditor.indexOf("const bookerId = await findOrCreateBooker()"),
  "A Traveller linked to a differently named Booker must fail before any Booker create attempt.",
);
assert.ok(
  identityEditor.includes("if (!travelerId)") && identityEditor.includes("if (!positiveId(booker?.id))"),
  "Existing exact Booker and Traveller records must be reused before creation.",
);
assert.ok(
  !identityEditor.includes('method: "DELETE"') && !identityEditor.includes('method: "PUT"'),
  "Customer identity maintenance must not introduce delete or replacement writes.",
);
assert.ok(
  identityEditor.includes('...(bookerContact.trim() ? { booker_contact: bookerContact.trim() } : {})') &&
    identityEditor.includes('...(bookerEmail.trim() ? { booker_email: bookerEmail.trim().toLowerCase() } : {})'),
  "Blank optional contact inputs must not erase an existing Traveller's stored Booker contact details.",
);
assert.ok(
  !identityEditor.includes("/api/admin-bookings") && !identityEditor.includes("/api/customer-invoices"),
  "Customer profile identity maintenance must not write bookings or invoices.",
);
assert.ok(
  !/data-customer-(?:booker|traveler)-id/.test(identityEditor),
  "Internal Booker and Traveller IDs must remain hidden from the profile form.",
);

for (const fragment of [
  'additionalSameOriginRefererPathPrefixes: ["/customers/"]',
  'additionalSameOriginRefererPathnames: ["/customers"]',
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]',
]) {
  assert.ok(bookerRoute.includes(fragment), `Booker route must retain the narrow customer-folder boundary: ${fragment}`);
}

assert.ok(
  dispatch.includes('data-admin-dispatch-crm-identity-selectors="true"') &&
    dispatch.includes("adminDispatchVerifiedBookerOptions"),
  "Dispatch must retain its established verified identity selectors.",
);
assert.ok(
  bookPage.includes("registeredTravelers") && bookPage.includes("travelerId"),
  "The existing customer booking page must retain its verified registered-traveller lane.",
);

console.log("Customer profile verified Booker and Traveller guard passed.");
