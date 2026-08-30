import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const migration = await readFile(
  "supabase/migrations/20260830141847_company_booker_existing_account_backfill.sql",
  "utf8",
);

const mappingBlock = migration.match(
  /insert into company_booker_existing_account_backfill[\s\S]*?\nvalues\n([\s\S]*?);\n\ndo \$migration\$/i,
)?.[1];

assert.ok(mappingBlock, "Expected one explicit Company + Booker mapping block");

const mappings = [...mappingBlock.matchAll(/\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,/g)].map(
  ([, bookerId, companyId, customerId]) => [
    Number(bookerId),
    Number(companyId),
    Number(customerId),
  ],
);

assert.deepEqual(mappings, [
  [14, 39, 173],
  [16, 38, 171],
  [17, 33, 165],
  [18, 36, 169],
  [21, 47, 184],
  [22, 48, 185],
  [23, 50, 188],
  [24, 31, 163],
  [27, 40, 196],
  [28, 56, 197],
  [29, 30, 167],
]);

for (const excludedBookerId of [15, 19, 20, 26]) {
  assert.ok(
    !mappings.some(([bookerId]) => bookerId === excludedBookerId),
    `Protected Booker ${excludedBookerId} must not be backfilled`,
  );
}

for (const fragment of [
  "set transaction isolation level serializable",
  "company_booker_backfill_global_count_drift",
  "company_booker_backfill_existing_link_drift",
  "company_booker_backfill_booking_evidence_drift",
  "company_booker_backfill_access_account_conflict",
  "company_booker_backfill_target_already_linked",
  "company_booker_backfill_invoice_evidence_drift",
  "company_booker_backfill_legacy_rate_precedence_conflict",
  "company_booker_backfill_protected_identity_drift",
  "company_booker_backfill_legacy_customer_inference_detected",
  "company_booker_backfill_affected_row_count_mismatch",
  "company_booker_backfill_postcondition_failed",
]) {
  assert.ok(migration.includes(fragment), `Missing fail-closed assertion: ${fragment}`);
}

assert.match(migration, /create temporary table company_booker_existing_account_backfill/i);
assert.match(
  migration,
  /update public\.bookers b\s+set customer_id = m\.customer_id\s+from company_booker_existing_account_backfill m/i,
);
assert.match(migration, /get diagnostics affected_rows = row_count/i);
assert.match(migration, /if affected_rows <> 11 then/i);
assert.match(migration, /where id = 15 and company_id = 41 and customer_id is null/i);
assert.match(migration, /where id = 20 and company_id = 45 and customer_id is null/i);
assert.match(migration, /where id = 19 and company_id = 37 and customer_id = 170/i);
assert.match(migration, /where id = 26 and company_id = 53 and customer_id = 192/i);

const persistentUpdates = [...migration.matchAll(/update\s+public\.([a-z_]+)/gi)].map(
  ([, table]) => table,
);
assert.deepEqual(persistentUpdates, ["bookers"]);

assert.doesNotMatch(migration, /delete\s+from\s+public\./i);
assert.doesNotMatch(migration, /insert\s+into\s+public\./i);
assert.doesNotMatch(migration, /alter\s+table\s+public\./i);
assert.doesNotMatch(migration, /drop\s+(table|index|policy|constraint)/i);
assert.doesNotMatch(migration, /customer_id\s+in\s*\([^)]*174/i);

console.log("Company + Booker existing-account backfill guard passed.");
