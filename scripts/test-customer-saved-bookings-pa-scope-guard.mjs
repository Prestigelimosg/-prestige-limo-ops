import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/customer-saved-bookings-read.ts", "utf8");

for (const fragment of [
  "company_id?: number | null",
  "booker_id?: number | null",
  '"customer_account_reference, account_status, company_id, booker_id"',
  'column: "company_id"',
  'column: "booker_id"',
  "if (hasCompanyIdentity !== hasBookerIdentity)",
  "bookingFilters",
]) assert.ok(source.includes(fragment), `Missing ${fragment}`);

assert.ok(!source.includes('column: "company_id";\n  method: "eq";\n  value: string;'));
console.log("Customer saved-bookings PA scope guard passed.");
