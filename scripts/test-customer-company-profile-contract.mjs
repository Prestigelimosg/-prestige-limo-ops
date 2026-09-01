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
  /function isMissingCompanyProfileResult\(response: Response, result: unknown\)/,
  "profile editor must explicitly classify safe missing-company lookup responses",
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
  /response\.status === 404 \|\| \/not found\|no company\/\.test\(message\)/,
  "missing company lookup responses must open create mode instead of error-only feedback",
);
assert.match(
  editorSource,
  /setProfile\(blankCreateProfile\(companyLookupName, guestAccountBillingEnabled\)\);\s+setLoadedProfile\(null\);\s+setProfileMode\("create"\);\s+setMessage\(`No company CRM profile exists for \$\{companyLookupName\}\. Review the name, then create it deliberately\.`\);\s+setStatus\("ready"\);\s+return;/,
  "not-found lookup results must visibly open the create customer company profile form",
);
assert.match(
  editorSource,
  /function agencyCompanyProfileName\(customerName: string, guestAccountBillingEnabled: boolean\)/,
  "the established profile editor must derive an agency company lookup name only after exact guest-account classification",
);
assert.match(
  editorSource,
  /if \(!guestAccountBillingEnabled\) \{\s+return normalized;\s+\}\s+return normalized\.replace\(\/\\s\+\\\[[^\n]+\\\]\\s\*\$\/, ""\)\.trim\(\) \|\| normalized;/,
  "normal companies must retain their exact name while agency folders may remove one trailing passenger scope",
);
assert.match(
  editorSource,
  /const accountResponse = await fetch\(`\$\{adminCustomerAccountsApiPath\}\?\$\{accountParams\.toString\(\)\}`,[\s\S]+?const guestAccountBillingEnabled = account\.guest_account_billing_enabled === true;[\s\S]+?const exactCustomerFolderName = profileValue\(account\.customer_directory_label\);[\s\S]+?const companyLookupName = agencyCompanyProfileName\(exactCustomerFolderName, guestAccountBillingEnabled\);[\s\S]+?await loadCompanyProfile\(companyLookupName\)/,
  "the exact customer account classification must be loaded before choosing the company profile lookup name",
);
assert.doesNotMatch(
  editorSource,
  /const exactCustomerFolderName = profileValue\(account\.customer_account\)/,
  "the formatted Company (Booker) presentation title must never populate the editable Customer folder input",
);
for (const fragment of [
  "const verifiedCompanyId = positiveProfileId(account.verified_company_id);",
  "if (verifiedCompanyId) {",
  "await loadCompanyProfileById(verifiedCompanyId)",
  "if (!verifiedCompanyId && isMissingCompanyProfileResult(response, result))",
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
  /if \(\s*!verifiedCompanyId &&\s*companyLookupName !== exactCustomerFolderName &&\s*isMissingCompanyProfileResult\(response, result\)\s*\) \{[\s\S]+?loadCompanyProfile\(exactCustomerFolderName\)/,
  "an unverified agency base-name miss must safely fall back to the original folder name instead of creating a duplicate company",
);
assert.match(
  editorSource,
  /\{profile\.guest_account_billing_enabled \? \([\s\S]+?Agency guests stay on each booking\. No permanent Booker \/ PA or Traveller CRM profile is required\.[\s\S]+?\) : profile\.id \? \([\s\S]+?<CustomerVerifiedIdentitiesEditor/,
  "hotel and tour agency profiles must keep guests on bookings and must not require permanent CRM traveller identities",
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
  /if \(customerFolderNameChanged\) \{[\s\S]+?customer_id: customerId,[\s\S]+?display_name: normalizedCustomerFolderName,/,
  "profile save must send the changed folder name through the existing exact-customer PATCH only",
);
assert.match(
  editorSource,
  /const companyProfileChanged = isCreate \|\| companyProfileHasChanges\(profile, loadedProfile\);/,
  "company and Customer folder edits must have independent dirty scopes",
);
assert.match(
  editorSource,
  /if \(companyProfileChanged\) \{[\s\S]+?fetch\(adminCompanyProfileWriteApiPath,[\s\S]+?method: "POST"/,
  "the existing Company writer must run only when a Company profile field changed",
);
assert.match(
  editorSource,
  /function changedCompanyProfilePayload\([\s\S]+?for \(const field of companyProfileWriteFields\)[\s\S]+?if \(!companyProfileFieldChanged\(profile, loadedProfile, field\)\) \{[\s\S]+?payload\[field\] = normalizedValue;/,
  "Company updates must send only independently changed fields instead of a stale full-profile overwrite",
);
assert.match(
  editorSource,
  /const savedCustomerFolderName = profileValue\(accountResult\?\.account\?\.customer_directory_label\)/,
  "folder save read-back must use the raw directory label returned by the existing Customer writer",
);
assert.match(
  editorSource,
  /nextUrl\.searchParams\.set\("name", savedCustomerFolderName\);[\s\S]+?router\.replace\(`\$\{nextUrl\.pathname\}\$\{nextUrl\.search\}`, \{ scroll: false \}\);/,
  "a successful folder rename must refresh the same customer route and top banner",
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
  /Controls only this customer folder label and top banner\. Passenger names stay on their bookings\./,
  "the folder-name control must state its narrow booking-preserving scope",
);
assert.match(
  editorSource,
  /setMessage\(\s*companyProfileChanged\s*\? `Saved customer company profile for \$\{savedCompanyName\}\.`\s*: `Saved customer folder name for \$\{savedCompanyName\}\.`,[\s\S]+?setStatus\("saved"\);\s+setProfile\(null\);/,
  "a fully successful profile save must close the existing editor while retaining its saved feedback",
);
assert.match(
  editorSource,
  /if \(identityDraftDirty\) \{[\s\S]+?Booker \/ Traveller changes are not saved yet\.[\s\S]+?data-customer-save-booker-traveler[\s\S]+?\.focus\(\);[\s\S]+?return;/,
  "company details save must block and focus the established Booker / Traveller save while an identity draft is dirty",
);
assert.match(
  editorSource,
  /profileMode === "create"[\s\S]+?\? "Create company details"[\s\S]+?: "Save company details"/,
  "the parent action must clearly name the company-details scope",
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
    new RegExp(`${clearableField}: optionalCompanyContactValue\\(`),
    `${clearableField} must carry an explicit null only when an existing optional company contact value is cleared`,
  );
}
assert.doesNotMatch(
  editorSource,
  /company_name:\s*optionalCompanyContactValue|domain:\s*optionalCompanyContactValue/,
  "required company identity must never use the optional contact clearing helper",
);
assert.match(
  editorSource,
  /return !isCreate && loadedValue\?\.trim\(\) \? null : undefined;/,
  "unchanged blank optional fields must stay omitted while a deliberately cleared loaded value becomes null",
);
assert.doesNotMatch(
  editorSource,
  /website:\s*profileValue\([^\n]+website\)[^\n]+profileValue\([^\n]+domain\)/,
  "a cleared optional website must not be repopulated from the preserved required company domain",
);

console.log("Customer company profile contact contract guard passed.");
