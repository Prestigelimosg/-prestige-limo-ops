import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helper = await readFile(
  new URL("../lib/admin-customer-account-delete.ts", import.meta.url),
  "utf8",
);
const route = await readFile(
  new URL("../app/api/admin-customer-account/[customerId]/route.ts", import.meta.url),
  "utf8",
);
const dangerZone = await readFile(
  new URL("../app/customers/[customerId]/customer-account-danger-zone.tsx", import.meta.url),
  "utf8",
);
const profilePage = await readFile(
  new URL("../app/customers/[customerId]/page.tsx", import.meta.url),
  "utf8",
);

assert.match(helper, /export async function inspectAdminCustomerAccountDeletion/);
assert.match(helper, /export async function deleteAdminCustomerAccount/);
assert.match(helper, /\.from\("customers"\)/);
assert.match(helper, /\.eq\("id", customerId\)/);
assert.match(helper, /dependencyCount\(client, "bookings", "customer_id", customerId\)/);
assert.match(helper, /dependencyCount\(client, "customer_invoice_records", "customer_id", customerReference\)/);
assert.match(helper, /dependencyCount\(client, "monthly_billing_draft_plans", "customer_id", customerReference\)/);
assert.match(helper, /dependencyCount\(client, "monthly_invoice_drafts", "customer_id", customerReference\)/);
assert.match(helper, /\.from\("customer_access_accounts"\)/);
assert.match(helper, /account_status: "revoked"/);
assert.match(helper, /\.delete\(\)\s*\.eq\("id", customerId\)/);
assert.doesNotMatch(helper, /\.from\("(?:companies|bookers|travelers)"\)/);
assert.doesNotMatch(helper, /customer_name|company_name|safe_display_label.*\.eq/);

assert.match(route, /export async function GET/);
assert.match(route, /export async function DELETE/);
assert.match(route, /additionalSameOriginRefererPathPrefixes: \["\/customers\/"\]/);
assert.match(route, /allowServerSessionRoleMethodsWithoutRequestToken: \["DELETE"\]/);
assert.match(route, /inspectAdminCustomerAccountDeletion/);
assert.match(route, /deleteAdminCustomerAccount/);

assert.match(dangerZone, /Delete customer account/);
assert.match(dangerZone, /confirmation_name/);
assert.match(dangerZone, /customerName/);
assert.match(dangerZone, /method: "DELETE"/);
assert.match(dangerZone, /window\.location\.assign\("\/customers"\)/);
assert.doesNotMatch(dangerZone, /company_name|booker_id|traveler_id/);

assert.match(profilePage, /CustomerAccountDangerZone/);
assert.match(profilePage, /customerId=\{customer\.id\}/);
assert.match(profilePage, /customerName=\{customer\.companyName\}/);

console.log("Admin exact customer account delete API contract passed.");
