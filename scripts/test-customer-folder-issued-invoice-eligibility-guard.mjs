import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardScript =
  "scripts/test-customer-folder-issued-invoice-eligibility-guard.mjs";
const [agents, invoicePersistence, ledger, savedBookings, suite] =
  await Promise.all([
    readFile("AGENTS.md", "utf8"),
    readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile(
      "app/customers/[customerId]/saved-bookings-panel.tsx",
      "utf8",
    ),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

function mustInclude(source, fragment, label) {
  assert.equal(
    source.includes(fragment),
    true,
    `${label} must include ${fragment}.`,
  );
}

for (const fragment of [
  "type CustomerFolderIssuedInvoiceRecord = {",
  "bookingReference?: string;",
  "customerId?: string;",
  "documentState?: string;",
  "documentType?: string;",
  "lineItems?: CustomerFolderIssuedInvoiceLineItem[];",
  "function normalizedExactInvoiceReference",
  "function issuedInvoiceBookingReferences",
  '(invoice.documentType || "invoice") !== "invoice"',
  '(invoice.documentState || "issued") !== "issued"',
  "normalizedExactInvoiceReference(invoice.customerId) !== exactCustomerId",
  "invoice.lineItems?.forEach",
  "lineItem.bookingReference",
  "function bookingHasIssuedInvoice",
  "booking.booking_reference",
  "booking.public_booking_reference",
  "issuedInvoiceBookingReferences: string[];",
  "Promise.all([",
  "fetch(adminCustomerInvoicesApiPath",
  'cache: "no-store"',
  "Customer invoice coverage could not be verified.",
  "!bookingHasIssuedInvoice(booking, issuedInvoiceReferenceSet)",
  "No saved job remains in Jobs not billed yet after billed or closed checks.",
]) {
  mustInclude(
    savedBookings,
    fragment,
    `exact-customer issued-invoice eligibility ${fragment}`,
  );
}

for (const fragment of [
  '.select("reference, line_items, document_type, document_state")',
  "alreadyInvoicedReferences",
  'return safeFailure("Invoice already contains one or more selected jobs.", 409);',
]) {
  mustInclude(
    invoicePersistence,
    fragment,
    `authoritative server duplicate-invoice guard ${fragment}`,
  );
}

for (const fragment of [
  "Exact-Customer Issued-Invoice Eligibility Repair",
  "exact internal or public booking reference",
  "issued invoice",
  "fail closed",
  guardScript,
]) {
  mustInclude(ledger, fragment, `implementation ledger ${fragment}`);
  mustInclude(agents, fragment, `owner lock ${fragment}`);
}

mustInclude(
  suite,
  guardScript,
  "preactivation suite registration",
);

console.log("Customer-folder issued-invoice eligibility guard passed.");
