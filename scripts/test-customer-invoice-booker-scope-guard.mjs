import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/customer-invoice-record-persistence.ts", "utf8");

for (const fragment of [
  "const portalBookerId = activeAccount.data.booker_id",
  "invoiceQuery = invoiceQuery.eq(\"booker_id\", portalBookerId)",
  "legacyQuery = legacyQuery.eq(\"booker_id\", portalBookerId)",
  "pdfQuery = pdfQuery.eq(\"booker_id\", portalBookerId)",
  "legacyPdfQuery = legacyPdfQuery.eq(\"booker_id\", portalBookerId)",
]) assert.ok(source.includes(fragment), `Missing ${fragment}`);

console.log("Customer invoice booker scope guard passed.");
