import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const files = {
  bookingPersistence: "lib/admin-booking-persistence.ts",
  dispatch: "app/page.tsx",
  editor: "app/customers/[customerId]/customer-company-profile-editor.tsx",
  exactProfile: "app/customers/[customerId]/page.tsx",
  helper: "lib/admin-customer-company-booker-profile.ts",
  migration: "supabase/migrations/20260902013000_fix_customer_company_booker_existing_booker_ambiguity.sql",
  reader: "lib/admin-customer-accounts-read.ts",
  route: "app/api/admin-customer-accounts/route.ts",
  title: "lib/admin-customer-account-title.ts",
};
const source = Object.fromEntries(
  await Promise.all(Object.entries(files).map(async ([key, filename]) => [key, await readFile(filename, "utf8")])),
);

assert.match(source.title, /if \(company && booker\) \{\s+return `\$\{company\} \(\$\{booker\}\)`;\s+\}/);
assert.match(source.title, /return "Customer account · Requires editing";/);
assert.doesNotMatch(source.title, /passenger|travell?er|boss|folder|display_name/i);
assert.match(source.reader, /customer_account: formatVerifiedCustomerAccountTitle\(\{\s+bookerName,\s+companyName,/);
assert.match(source.editor, /data-customer-authoritative-title=\{customerId\}/);
assert.doesNotMatch(source.exactProfile, /<h1[\s\S]*?\{customerName\}[\s\S]*?<\/h1>/);
assert.match(source.dispatch, /label: formatVerifiedCustomerAccountTitle\(\{/);
assert.doesNotMatch(source.dispatch, /label:\s*(?:bookerName|travelerName|passengerName|loadedBookerName \|\| loadedCompanyName)/);
assert.match(
  source.bookingPersistence,
  /if \(hasHotelAgencyFolderCreate \|\| hasPersonalCustomerFolderCreate\) \{[\s\S]+?Legacy agency and personal Customer creation is retired/,
);
assert.match(
  source.dispatch,
  /Hotel \/ Tour Agency and personal account creation are retired\.[\s\S]+?Nothing was changed\./,
);
assert.doesNotMatch(source.dispatch, /hotel_agency_folder_create:\s*\{/);
assert.doesNotMatch(source.dispatch, /personal_customer_folder_create:\s*\{/);

for (const field of [
  "accounts_email",
  "billing_address",
  "billing_email",
  "company_name",
  "domain",
  "main_phone",
  "mobile_phone",
  "operations_email",
  "primary_contact_name",
  "website",
  "booker_name",
  "email",
  "phone",
]) assert.ok(source.helper.includes(`"${field}"`), `Atomic allowlist is missing visible profile field ${field}`);

assert.doesNotMatch(source.route, /updateAdminCustomerAccountProfile/);
assert.match(source.route, /await overwriteAdminCustomerCompanyBookerProfile\(body, actor\)/);
for (const fragment of [
  "security invoker",
  "for update",
  "p_expected_customer_display_name",
  "p_expected_company_profile",
  "p_expected_booker_profile",
  "p_expected_booker_customer_id",
  "customer_type = null",
  "insert into public.audit_logs",
  "from public, anon, authenticated",
  "to service_role",
]) assert.ok(source.migration.toLowerCase().includes(fragment.toLowerCase()), `Migration is missing ${fragment}`);

for (const protectedTable of [
  "bookings",
  "customer_invoices",
  "customer_access_accounts",
  "driver_job_links",
  "driver_job_status_events",
  "messages",
  "notifications",
  "payments",
]) {
  assert.doesNotMatch(
    source.migration,
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?${protectedTable}\\b`, "i"),
    `Migration must not write protected table ${protectedTable}`,
  );
}

const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-company-booker-"));

try {
  const helperOutput = path.join(tempDir, "lib/admin-customer-company-booker-profile.js");
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  await mkdir(path.dirname(helperOutput), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(supabasePath, "module.exports = { createClient() { throw new Error('unexpected client'); } };\n");
  await writeFile(helperOutput, ts.transpileModule(source.helper, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText);
  const require = createRequire(import.meta.url);
  const helper = require(helperOutput);
  const actor = {
    actor_label: "Customer profile owner",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
  const profile = {
    action_type: "customer_company_booker_profile_overwrite",
    booker_id: 20,
    booker_profile: { booker_name: "Laurel Wong", email: "laurel@example.test", phone: "+65 9000 0000" },
    company_id: 45,
    company_profile: {
      accounts_email: null,
      billing_address: null,
      billing_email: null,
      company_name: "Bridge Data Centres",
      domain: "bridgedatacentres.com",
      main_phone: null,
      mobile_phone: "+65 9000 0000",
      operations_email: "laurel@example.test",
      primary_contact_name: "Laurel Wong",
      website: "bridgedatacentres.com",
    },
    customer_display_name: "Bridge Data Centres",
    customer_id: 177,
    expected_booker_customer_id: 177,
    expected_booker_profile: { booker_name: "Laurel Wong", email: "laurel@example.test", phone: "+65 9000 0000" },
    expected_company_profile: {
      accounts_email: null,
      billing_address: null,
      billing_email: null,
      company_name: "Bridge Data Centres",
      domain: "bridgedatacentres.com",
      main_phone: null,
      mobile_phone: "+65 9000 0000",
      operations_email: "laurel@example.test",
      primary_contact_name: "Laurel Wong",
      website: "bridgedatacentres.com",
    },
    expected_customer_display_name: "Bridge Data Centres",
  };
  const calls = [];
  const success = await helper.overwriteAdminCustomerCompanyBookerProfile(profile, actor, {
    async rpc(name, args) {
      calls.push({ args, name });
      return { data: [{
        booker_email: "laurel@example.test",
        booker_id: 20,
        booker_name: "Laurel Wong",
        booker_phone: "+65 9000 0000",
        company_id: 45,
        company_name: "Bridge Data Centres",
        customer_display_name: "Bridge Data Centres",
        customer_id: 177,
      }], error: null };
    },
  });
  assert.equal(success.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "apply_admin_customer_company_booker_profile");
  assert.equal(calls[0].args.p_expected_booker_customer_id, 177);
  assert.equal(calls[0].args.p_company_profile.company_name, "Bridge Data Centres");
  assert.equal(calls[0].args.p_booker_profile.booker_name, "Laurel Wong");

  const rejected = await helper.overwriteAdminCustomerCompanyBookerProfile(
    { ...profile, invoice_id: 99 },
    actor,
    { async rpc() { throw new Error("unexpected rpc"); } },
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.status, 403);

  const stale = await helper.overwriteAdminCustomerCompanyBookerProfile(profile, actor, {
    async rpc() { return { data: null, error: { code: "40001" } }; },
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.status, 409);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer Company + Booker root profile guard passed.");
