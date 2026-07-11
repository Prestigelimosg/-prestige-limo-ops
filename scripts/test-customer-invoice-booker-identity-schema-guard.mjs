import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/202607110003_customer_invoice_records_booker_identity.sql",
  "utf8",
);

for (const fragment of [
  "add column if not exists booker_id bigint",
  "customer_invoice_records_customer_booker_created_idx",
  "(customer_id, booker_id, created_at desc)",
  "where booker_id is not null",
  "Company/customer identity alone must not authorize",
]) assert.ok(migration.includes(fragment), `Missing ${fragment}`);

for (const forbidden of ["drop table", "delete from", "update public.customer_invoice_records"])
  assert.ok(!migration.includes(forbidden), `Unexpected ${forbidden}`);

console.log("Customer invoice booker identity schema guard passed.");
