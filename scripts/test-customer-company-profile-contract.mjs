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

console.log("Customer company profile contact contract guard passed.");
