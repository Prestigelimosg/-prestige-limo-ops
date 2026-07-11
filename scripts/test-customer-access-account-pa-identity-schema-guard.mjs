import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/202607110002_customer_access_accounts_pa_identity.sql",
  "utf8",
);

for (const fragment of [
  "add column if not exists company_id bigint",
  "add column if not exists booker_id bigint",
  "drop index if exists public.customer_access_accounts_reference_key",
  "customer_access_accounts_booker_id_key",
  "where booker_id is not null",
  "customer_access_accounts_company_id_idx",
  "Company membership alone never authorizes",
]) assert.ok(migration.includes(fragment), `Missing ${fragment}`);

assert.ok(!migration.includes("drop table"));
assert.ok(!migration.includes("delete from"));
assert.ok(!migration.includes("update public.customer_access_accounts"));

console.log("Customer access-account PA identity schema guard passed.");
