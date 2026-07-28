import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardScript =
  "scripts/test-customer-folder-issued-invoice-edit-guard.mjs";
const [invoiceFolder, invoicePersistence, invoiceRoute, ledger, suite] =
  await Promise.all([
    readFile(
      "app/customers/[customerId]/customer-invoice-folder-panel.tsx",
      "utf8",
    ),
    readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
    readFile("app/api/admin-customer-invoices/route.ts", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
  ]);

function mustInclude(source, fragment, label) {
  assert.equal(
    source.includes(fragment),
    true,
    `${label} must include ${fragment}.`,
  );
}

function mustExclude(source, fragment, label) {
  assert.equal(
    source.includes(fragment),
    false,
    `${label} must exclude ${fragment}.`,
  );
}

for (const fragment of [
  'const customerInvoiceIssuedEditAction = "edit_issued_invoice";',
  "data-customer-invoice-folder-edit=",
  "data-customer-invoice-folder-editor=",
  "data-customer-invoice-folder-edit-description=",
  "data-customer-invoice-folder-edit-amount=",
  "data-customer-invoice-folder-edit-add=",
  "data-customer-invoice-folder-edit-remove=",
  "data-customer-invoice-folder-edit-save=",
  "Save invoice",
  "The invoice number, dates, customer, and payment status stay unchanged.",
  "No email is sent when saved.",
  "expectedAmountCents: invoice.amountCents",
  'method: "PATCH"',
  "applyStoredInvoice(result.invoice as StoredInvoiceRecord)",
]) {
  mustInclude(invoiceFolder, fragment, "existing Total invoices issued editor");
}

for (const fragment of [
  'export const customerInvoiceIssuedEditAction = "edit_issued_invoice";',
  "export async function editAdminCustomerIssuedInvoice(",
  '.eq("invoice_number", invoiceNumber)',
  '.eq("customer_id", customerId)',
  '.eq("document_type", "invoice")',
  '.eq("document_state", "issued")',
  '.eq("status", existingInvoice.status)',
  '.eq("amount_cents", expectedAmountCents)',
  "createCustomerInvoicePdfBytes(updatedRecord, profile, logoImage)",
  'email_delivery_status: "not_sent"',
  "email_message_id: null",
  "email_sent_at: null",
  "line_items: lineItems",
  "pdf_base64: base64FromBytes(pdfBytes)",
  "pdf_sha256: sha256Hex(pdfBytes)",
  "updatedInvoice.status === existingInvoice.status",
]) {
  mustInclude(invoicePersistence, fragment, "issued invoice edit persistence");
}

const editFunction = invoicePersistence.slice(
  invoicePersistence.indexOf(
    "export async function editAdminCustomerIssuedInvoice(",
  ),
  invoicePersistence.indexOf(
    "export async function refreshAdminCustomerAmendedUnpaidInvoice(",
  ),
);

for (const forbidden of [
  "paid_at:",
  "payment_method:",
  "reminder_send_count:",
  "thank_you_sent_at:",
]) {
  mustExclude(
    editFunction,
    forbidden,
    "issued invoice edit payment and reminder isolation",
  );
}

for (const fragment of [
  "customerInvoiceIssuedEditAction",
  "editAdminCustomerIssuedInvoice",
  "body?.action === customerInvoiceIssuedEditAction",
]) {
  mustInclude(invoiceRoute, fragment, "existing invoice PATCH route");
}

for (const fragment of [
  "Issued Invoice In-Place Edit Repair",
  "same invoice number",
  "payment status",
  "regenerates the stored PDF",
  guardScript,
]) {
  mustInclude(ledger, fragment, "implementation ledger issued edit");
}

mustInclude(suite, guardScript, "preactivation suite registration");

console.log("Customer-folder issued-invoice edit guard passed.");
