import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const customersPage = readFileSync("app/customers/page.tsx", "utf8");
const customerPortalPage = readFileSync("app/my-bookings/page.tsx", "utf8");
const localInvoices = readFileSync("lib/customer-local-invoices.ts", "utf8");
const invoicePersistence = readFileSync("lib/customer-invoice-record-persistence.ts", "utf8");
const invoiceEmailRoute = readFileSync("app/api/admin-customer-invoice-email/route.ts", "utf8");
const migration = readFileSync(
  "supabase/migrations/202606300001_customer_billing_document_lifecycle.sql",
  "utf8",
);
const travelerInvoiceMigration = readFileSync(
  "supabase/migrations/20260719064413_traveler_invoice_separation.sql",
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
assertIncludes(localInvoices, "const signoffY = 245;", "signoff section position");
assertIncludes(localInvoices, "const paymentY = 182;", "bank section position");
assertIncludes(localInvoices, "const footerY = 88;", "adjacent notes and terms footer position");
assertIncludes(
  localInvoices,
  "companyProfile.invoice_signoff_name",
  "PDF uses saved invoice sign-off name",
);
assertIncludes(localInvoices, "companyProfile.phone", "PDF uses saved sign-off phone");
assert.ok(
  localInvoices.indexOf('pdfTextAt("Thank you for your business"') <
    localInvoices.indexOf("pdfTextAt(paymentHeading") &&
    localInvoices.indexOf("pdfTextAt(paymentHeading") <
      localInvoices.indexOf('pdfTextAt("Notes", 50, footerY') &&
    localInvoices.indexOf('pdfTextAt("Notes", 50, footerY') <
      localInvoices.indexOf('pdfTextAt("Terms & Conditions:", 310, footerY'),
  "PDF order must be signoff, one bank block, then adjacent notes and terms.",
);

assertIncludes(customersPage, 'data-customer-invoice-document-type="true"', "document type select");
assertIncludes(customersPage, '<option value="quotation">Quotation</option>', "quotation option");
assertIncludes(customersPage, 'data-customer-invoice-save-draft="true"', "save draft action");
assertIncludes(customersPage, 'data-customer-invoice-draft-list="true"', "draft list");
assertIncludes(customersPage, 'documentState: "issued"', "issued billing document request body");
assertIncludes(customersPage, 'customerInvoiceRequestBodyFromPreview("draft")', "draft billing document request body");
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
  'documentType: "credit_note"',
  "credit note stored request body",
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
  "admin-only, not emailed, and not shown in the customer portal until issued",
  "draft admin-only feedback",
);
assertIncludes(
  customersPage,
  'if ((invoice.documentType || "invoice") !== "invoice")',
  "only real invoices remove unbilled rows",
);
assertIncludes(
  customersPage,
  "Stored credit notes require a stored paid invoice.",
  "credit note requires stored invoice",
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

assertIncludes(invoicePersistence, "const invoiceNumberPattern = /^(?:(INV|QUO|CN)-", "stored legacy and traveller invoice number validation");
assertIncludes(
  travelerInvoiceMigration,
  "customer_invoice_records_invoice_number_check",
  "traveller prefix invoice constraint replacement",
);
assertIncludes(
  travelerInvoiceMigration,
  "[A-Z0-9]{2,12}-[0-9]{4,}",
  "traveller prefix invoice number format",
);
assertIncludes(invoicePersistence, "document_type: sanitized.data.documentType", "stored document type insert");
assertIncludes(invoicePersistence, "document_state: sanitized.data.documentState", "stored document state insert");
assertIncludes(invoicePersistence, ".eq(\"document_state\", \"issued\")", "customer portal issued-only invoice records");
assertIncludes(invoicePersistence, "inferBillingDocumentType(invoiceNumber) !== \"invoice\"", "status toggle invoice-only guard");
assertIncludes(invoicePersistence, "original_invoice_number: sanitized.data.originalInvoiceNumber", "stored credit note original invoice link");
assertIncludes(invoiceEmailRoute, "safeDraftDocumentError", "draft email block");
assertIncludes(invoiceEmailRoute, "Prestige Limo SG ${input.documentLabel}", "document-aware email subject");

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
