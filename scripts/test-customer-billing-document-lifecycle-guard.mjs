import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const customersPage = readFileSync("app/customers/page.tsx", "utf8");
const customerPortalPage = readFileSync("app/my-bookings/page.tsx", "utf8");
const localInvoices = readFileSync("lib/customer-local-invoices.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/202606300001_customer_billing_document_lifecycle.sql",
  "utf8",
);

function assertIncludes(source, fragment, label) {
  assert.ok(source.includes(fragment), `Missing ${label}: ${fragment}`);
}

function assertMatches(source, pattern, label) {
  assert.ok(pattern.test(source), `Missing ${label}: ${pattern}`);
}

assertIncludes(
  localInvoices,
  'export type CustomerBillingDocumentType = "credit_note" | "invoice" | "quotation";',
  "billing document type union",
);
assertIncludes(localInvoices, 'return "CN";', "credit note prefix");
assertIncludes(localInvoices, 'return "QUO";', "quotation prefix");
assertIncludes(localInvoices, 'documentTitle =', "PDF document title switch");
assertIncludes(localInvoices, '"CREDIT NOTE"', "credit note PDF title");
assertIncludes(localInvoices, '"QUOTATION"', "quotation PDF title");
assertIncludes(localInvoices, '"Quoted Amount"', "quotation amount label");
assertIncludes(localInvoices, '"Credit Amount"', "credit note amount label");
assertIncludes(localInvoices, "const documentDateLabel =", "document-aware date label switch");
assertIncludes(localInvoices, '"Quotation Date:"', "quotation date label");
assertIncludes(localInvoices, '"Credit Note Date:"', "credit note date label");
assertIncludes(
  localInvoices,
  "pdfTextAt(documentDateLabel, dateX, billToY - 3, 8",
  "PDF uses document-aware date label",
);
assertIncludes(localInvoices, "const paymentY = 260;", "bank section position");
assertIncludes(localInvoices, "const notesY = 135;", "notes moved above terms");
assertIncludes(localInvoices, "const termsY = 55;", "terms below notes");
assert.ok(
  localInvoices.indexOf('pdfTextAt("Bank information"') <
    localInvoices.indexOf('pdfTextAt("Notes"') &&
    localInvoices.indexOf('pdfTextAt("Notes"') <
      localInvoices.indexOf('pdfTextAt("Terms & Conditions:"'),
  "PDF order must be bank information, then notes, then terms and conditions.",
);

assertIncludes(customersPage, 'data-customer-invoice-document-type="true"', "document type select");
assertIncludes(customersPage, '<option value="quotation">Quotation</option>', "quotation option");
assertIncludes(customersPage, 'data-customer-invoice-save-draft="true"', "save draft action");
assertIncludes(customersPage, 'data-customer-invoice-draft-list="true"', "draft list");
assertIncludes(customersPage, 'createLocalCustomerBillingDocumentPdf("quotation")', "quotation local PDF path");
assertIncludes(customersPage, "convertQuotationToInvoice", "quotation convert handoff");
assertIncludes(
  customersPage,
  'data-customer-invoice-issued-local-convert-quote',
  "quotation row convert button",
);
assertIncludes(customersPage, 'data-customer-invoice-issued-local-status-toggle', "compact status toggle");
assertIncludes(customersPage, '"PDF"', "compact PDF button label");
assertIncludes(customersPage, '"Email"', "compact email button label");
assertIncludes(customersPage, "Convert", "compact convert button label");
assertIncludes(
  customersPage,
  'customerInvoicePreview.documentType === "quotation"',
  "quotation avoids stored invoice issue path",
);
assertIncludes(customersPage, "createCreditNoteFromPaidInvoice", "credit note action");
assertIncludes(
  customersPage,
  'data-customer-invoice-issued-local-credit-action',
  "paid invoice credit note button",
);
assertIncludes(
  customersPage,
  "The paid invoice was not edited or deleted.",
  "credit note does not mutate paid invoice copy",
);
assertIncludes(
  customersPage,
  "No invoice number, email, payment, or DB write was created.",
  "draft no-write feedback",
);

assertIncludes(customerPortalPage, '"Quotations"', "portal quotations folder");
assertIncludes(customerPortalPage, '"Unpaid Invoices"', "portal unpaid invoice folder");
assertIncludes(customerPortalPage, '"Paid Invoices"', "portal paid invoice folder");
assertIncludes(customerPortalPage, '"Credit Notes"', "portal credit note folder");
assertIncludes(customerPortalPage, "customerPortalInvoiceFolder", "portal folder mapper");
assertIncludes(
  customerPortalPage,
  "Billing documents are grouped by month into quotations, unpaid invoices, paid invoices, and credit notes.",
  "portal billing document copy",
);

assertIncludes(migration, "add column if not exists document_type", "document type migration column");
assertIncludes(migration, "add column if not exists document_state", "document state migration column");
assertIncludes(migration, "add column if not exists original_invoice_number", "credit note original link column");
assertMatches(
  migration,
  /invoice_number ~ '\^\(INV\|QUO\|CN\)-\[0-9\]\{8\}-\[0-9\]\{4\}\$'/,
  "INV/QUO/CN number constraint",
);
assertIncludes(
  migration,
  "document_type in ('invoice', 'quotation', 'credit_note')",
  "document type check constraint",
);
assertIncludes(
  migration,
  "Paid invoices should not be edited or deleted.",
  "credit note accounting comment",
);

const forbiddenCustomerPortalFragments = [
  "driver_payout",
  "paynow_payout",
  "internal_admin_note",
  "internal_finance",
  "parser_debug",
  "mock_archive",
];

for (const fragment of forbiddenCustomerPortalFragments) {
  assert.ok(
    !customerPortalPage.includes(fragment),
    `Customer portal billing folders must not expose forbidden fragment: ${fragment}`,
  );
}

console.log("Customer billing document lifecycle guard passed.");
