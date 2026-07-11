import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/customer-invoice-record-persistence.ts", "utf8");

for (const fragment of [
  "const portalBookerId = activeAccount.data.booker_id",
  "invoiceQuery = invoiceQuery.eq(\"booker_id\", portalBookerId)",
  "invoiceQuery = invoiceQuery.eq(\"customer_id\", customerAccountReference)",
  "legacyQuery = legacyQuery.eq(\"booker_id\", portalBookerId)",
  "legacyQuery = legacyQuery.eq(\"customer_id\", customerAccountReference)",
  "pdfQuery = pdfQuery.eq(\"booker_id\", portalBookerId)",
  "pdfQuery = pdfQuery.eq(\"customer_id\", customerAccountReference)",
  "legacyPdfQuery = legacyPdfQuery.eq(\"booker_id\", portalBookerId)",
  "legacyPdfQuery = legacyPdfQuery.eq(\"customer_id\", customerAccountReference)",
]) assert.ok(source.includes(fragment), `Missing ${fragment}`);

for (const query of ["invoiceQuery", "legacyQuery", "pdfQuery", "legacyPdfQuery"]) {
  assert.ok(
    new RegExp(`} else \\{\\s+${query} = ${query}\\.eq\\(\"customer_id\", customerAccountReference\\);\\s+\\}`).test(source),
    `${query} must use customer ID only as the legacy fallback.`,
  );
}

console.log("Customer invoice booker scope guard passed.");
