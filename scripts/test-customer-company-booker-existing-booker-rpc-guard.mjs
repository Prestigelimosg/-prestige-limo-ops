import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migrationPath =
  "supabase/migrations/20260902013000_fix_customer_company_booker_existing_booker_ambiguity.sql";
const browserPath = "scripts/test-customer-company-profile-browser.mjs";
const [migration, browser] = await Promise.all([
  readFile(migrationPath, "utf8"),
  readFile(browserPath, "utf8"),
]);

const existingBookerUpdate = migration.match(
  /update public\.bookers as target_booker set[\s\S]*?returning target_booker\.\* into v_booker;/,
)?.[0];

assert.ok(existingBookerUpdate, "Forward migration must retain one aliased existing-Booker update");
assert.match(existingBookerUpdate, /where target_booker\.id = p_booker_id/);
assert.match(existingBookerUpdate, /and target_booker\.company_id = v_company\.id/);
assert.match(
  existingBookerUpdate,
  /and \(target_booker\.customer_id is null or target_booker\.customer_id = p_customer_id\)/,
);
assert.doesNotMatch(existingBookerUpdate, /\band company_id\s*=/);
assert.doesNotMatch(existingBookerUpdate, /\(customer_id is null/);

for (const requiredBoundary of [
  "security invoker",
  "from public, anon, authenticated",
  "to service_role",
  "p_expected_customer_display_name",
  "p_expected_company_profile",
  "p_expected_booker_profile",
  "p_expected_booker_customer_id",
  "insert into public.audit_logs",
]) {
  assert.ok(
    migration.toLowerCase().includes(requiredBoundary.toLowerCase()),
    `Existing-Booker repair lost boundary ${requiredBoundary}`,
  );
}

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
    migration,
    new RegExp(`(?:insert\\s+into|update|delete\\s+from)\\s+(?:public\\.)?${protectedTable}\\b`, "i"),
    `Existing-Booker repair must not write protected table ${protectedTable}`,
  );
}

assert.match(browser, /saving Customer folder \+ exact Company \+ Booker atomically/);
assert.match(browser, /saving the reopened existing Booker and reopening again/);
assert.match(browser, /profilePatchPayloads\.length === 2/);
assert.match(browser, /profilePatchPayloads\[1\]\.booker_id, bookerId/);
assert.match(browser, /persisted second existing-Booker save after reopening/);

console.log("Customer Company + Booker existing-Booker RPC guard passed.");
