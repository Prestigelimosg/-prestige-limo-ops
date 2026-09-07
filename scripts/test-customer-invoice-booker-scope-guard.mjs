import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile("lib/customer-invoice-record-persistence.ts", "utf8");

for (const fragment of [
  "const portalBookerId = activeAccount.data.booker_id",
  "invoiceQuery = invoiceQuery.eq(\"customer_id\", portalCustomerId).eq(\"booker_id\", portalBookerId)",
  "invoiceQuery = invoiceQuery.eq(\"customer_id\", portalCustomerId)",
  "legacyQuery = legacyQuery.eq(\"customer_id\", portalCustomerId).eq(\"booker_id\", portalBookerId)",
  "legacyQuery = legacyQuery.eq(\"customer_id\", portalCustomerId)",
  "pdfQuery = pdfQuery.eq(\"customer_id\", portalCustomerId).eq(\"booker_id\", portalBookerId)",
  "pdfQuery = pdfQuery.eq(\"customer_id\", portalCustomerId)",
  "legacyPdfQuery = legacyPdfQuery.eq(\"customer_id\", portalCustomerId).eq(\"booker_id\", portalBookerId)",
  "legacyPdfQuery = legacyPdfQuery.eq(\"customer_id\", portalCustomerId)",
]) assert.ok(source.includes(fragment), `Missing ${fragment}`);

for (const query of ["invoiceQuery", "legacyQuery", "pdfQuery", "legacyPdfQuery"]) {
  assert.ok(
    new RegExp(`} else \\{\\s+${query} = ${query}\\.eq\\(\"customer_id\", portalCustomerId\\);\\s+\\}`).test(source),
    `${query} must use validated customer ID for legacy access and both customer plus Booker for PA access.`,
  );
}

console.log("Customer invoice booker scope guard passed.");
