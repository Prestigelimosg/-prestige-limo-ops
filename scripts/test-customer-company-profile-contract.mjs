import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const contractSource = await readFile(
  new URL("../lib/admin-company-traveler-crm-identity-contact-write-contract-setup-foundation.ts", import.meta.url),
  "utf8",
);
const runtimeSource = await readFile(
  new URL("../lib/admin-company-traveler-crm-runtime-write-action.ts", import.meta.url),
  "utf8",
);
const editorSource = await readFile(
  new URL("../app/customers/[customerId]/customer-company-profile-editor.tsx", import.meta.url),
  "utf8",
);
const migrationSource = await readFile(
  new URL("../supabase/migrations/202607100001_customer_company_profile_contact_fields.sql", import.meta.url),
  "utf8",
);

const profileFields = [
  "billing_address",
  "main_phone",
  "mobile_phone",
  "website",
  "primary_contact_name",
  "billing_email",
  "accounts_email",
  "operations_email",
];

for (const field of profileFields) {
  assert.match(contractSource, new RegExp(`"${field}"`), `${field} must be in the guarded contract allowlist`);
  assert.match(runtimeSource, new RegExp(`{ ${field}: contract\\.company_fields\\.${field} }`), `${field} must be in the company write payload`);
  assert.match(migrationSource, new RegExp(`add column if not exists ${field} text`), `${field} must have a migration column`);
}

assert.match(
  contractSource,
  /canonical !== "billing_address" &&\s+canonical !== "billing_email"/,
  "only the two explicit customer profile billing fields may bypass the generic billing fragment guard",
);
assert.match(
  contractSource,
  /function safeCustomerProfileEmail\(value: unknown\)/,
  "customer contact emails must avoid the generic billing-word rejection",
);
assert.match(
  editorSource,
  /action_type: "customer_company_booker_profile_overwrite"/,
  "profile editor must use the one guarded Customer + Company + Booker overwrite action",
);
assert.match(editorSource, />\s*Contact name\s*<input/,
  "the existing primary_contact_name field must be clearly labelled Contact name",
);
assert.match(editorSource, />\s*Secondary email\s*<input/,
  "the existing billing_email storage field must be presented to Admin as Secondary email",
);
assert.doesNotMatch(editorSource, />\s*Billing email\s*<input/,
  "the customer profile must not present the secondary address as the default billing email",
);
assert.doesNotMatch(editorSource, /Primary contact person/,
  "the customer profile must not show a second ambiguous contact-name label",
);
assert.match(
  editorSource,
  /if \(!verifiedCompanyId\) \{[\s\S]+?setCompanySelection\("create-new-company"\);[\s\S]+?nothing was inferred from the old folder, passenger, Traveller or contact text/,
  "a profile without exact identity must require explicit Company selection and never infer from legacy text",
);
assert.match(
  editorSource,
  /<option value="create-new-company">Create new Company explicitly<\/option>/,
  "Admin must retain the deliberate create-Company choice inside the existing profile editor",
);
assert.doesNotMatch(
  editorSource,
  /agencyCompanyProfileName|guestAccountBillingEnabled === true/,
  "retired agency and hotel classification must not choose or rewrite Company identity",
);
assert.doesNotMatch(
  editorSource,
  /const exactCustomerFolderName = profileValue\(account\.customer_account\)/,
  "the formatted Company (Booker) presentation title must never populate the editable Customer folder input",
);
for (const fragment of [
  "const verifiedCompanyId = positiveProfileId(account.verified_company_id);",
  "if (!verifiedCompanyId) {",
  "await loadCompanyProfileById(verifiedCompanyId)",
  "if (verifiedCompanyId && Number(company.id) !== verifiedCompanyId)",
]) {
  assert.equal(
    editorSource.includes(fragment),
    true,
    `verified company exact-ID profile flow must include ${fragment}`,
  );
}
assert.match(
  editorSource,
  /params\.set\("id", String\(companyId\)\)/,
  "verified company profile lookup must use the established exact-ID CRM read",
);
assert.match(
  editorSource,
  /Booker \/ PA is mandatory\. Traveller is optional and stays separate\./,
  "every customer profile must require one exact Booker while keeping Traveller optional",
);
assert.match(
  editorSource,
  /const \[customerFolderName, setCustomerFolderName\] = useState\(customerName\.trim\(\)\);/,
  "the established profile editor must keep one exact customer folder-name draft",
);
assert.match(
  editorSource,
  />\s*Customer folder name\s*<input[\s\S]+?data-customer-folder-name=/,
  "the existing profile form must expose one clearly labelled customer folder-name field",
);
assert.match(
  editorSource,
  /action_type: "customer_company_booker_profile_overwrite",[\s\S]+?customer_display_name: normalizedCustomerFolderName,[\s\S]+?customer_id: customerId,[\s\S]+?expected_customer_display_name: loadedCustomerFolderName/,
  "profile save must carry the raw Customer folder with its exact-current value in the atomic PATCH",
);
assert.match(
  editorSource,
  /company_profile: companyProfileSnapshot\(profile\)/,
  "all visible Company profile fields must save in the same atomic transaction",
);
assert.match(
  editorSource,
  /booker_profile: bookerProfileSnapshot\(booker\)/,
  "Booker name, email and contact must save in the same atomic transaction",
);
for (const expectedSnapshot of [
  "expected_company_profile: loadedProfile ? companyProfileSnapshot(loadedProfile) : null",
  "expected_booker_customer_id: loadedBooker?.customer_id ?? null",
  "expected_booker_profile: loadedBooker ? bookerProfileSnapshot(loadedBooker) : null",
]) {
  assert.ok(
    editorSource.includes(expectedSnapshot),
    `Company, Booker and exact binding must carry optimistic exact-current snapshot ${expectedSnapshot}`,
  );
}
assert.match(
  editorSource,
  /profileValue\(saved\?\.customer_display_name\) !== normalizedCustomerFolderName/,
  "atomic response must verify the exact saved raw Customer folder",
);
assert.match(
  editorSource,
  /nextUrl\.searchParams\.set\("name", normalizedCustomerFolderName\);[\s\S]+?const reloadedTitle = await loadAccountTitle\(\);[\s\S]+?if \(reloadedTitle !== expectedTitle\)/,
  "successful save must refresh the same route and authoritatively reread the Company + Booker title",
);
assert.equal(
  editorSource.includes("guestAccountBillingChanged") ||
    editorSource.includes("prestige:customer-guest-account-billing-updated") ||
    editorSource.includes('data-customer-guest-account-billing={customerId}'),
  false,
  "profile rename must not expose or trigger a customer-classification write lane",
);
assert.match(
  editorSource,
  /Controls only the internal customer folder label\. The visible customer title comes only from verified Company \+ Booker\. Passenger names stay on their bookings\./,
  "the folder-name control must state its narrow booking-preserving scope",
);
assert.match(
  editorSource,
  /setMessage\(`Saved, reloaded and verified \$\{expectedTitle\}\.`\);[\s\S]+?setStatus\("saved"\);[\s\S]+?setProfile\(null\);/,
  "a successful atomic save must close only after authoritative title reload",
);
assert.match(
  editorSource,
  /if \(identityDraftDirty\) \{[\s\S]+?Traveller changes are not saved yet\.[\s\S]+?data-customer-save-booker-traveler[\s\S]+?\.focus\(\);[\s\S]+?return;/,
  "Company + Booker save must block and focus the separate optional Traveller save while its draft is dirty",
);
assert.match(
  editorSource,
  /"Save Company \+ Booker profile"/,
  "the parent action must clearly name its atomic Company + Booker scope",
);
for (const clearableField of [
  "accounts_email",
  "billing_address",
  "billing_email",
  "main_phone",
  "mobile_phone",
  "operations_email",
  "primary_contact_name",
  "website",
]) {
  assert.match(
    editorSource,
    new RegExp(`${clearableField}: profile\\.${clearableField}`),
    `${clearableField} must remain editable through the complete Company profile snapshot`,
  );
}
assert.doesNotMatch(
  editorSource,
  /adminCompanyProfileWriteApiPath/,
  "the editor must not retain a second split Company write path",
);
assert.match(
  editorSource,
  /company_name: profile\.company_name\.replace\(\/\\s\+\/g, " "\)\.trim\(\)/,
  "required Company identity must stay nonblank and normalized",
);
assert.doesNotMatch(
  editorSource,
  /website:\s*profileValue\([^\n]+website\)[^\n]+profileValue\([^\n]+domain\)/,
  "a cleared optional website must not be repopulated from the preserved required company domain",
);

console.log("Customer company profile contact contract guard passed.");
