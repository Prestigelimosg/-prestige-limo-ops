import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const guardScript = "scripts/test-customer-folder-multi-job-invoice-handoff-guard.mjs";
const [folderPage, folderShell, invoiceFolder, savedBookingsRead, customersPage, invoicePersistence, localInvoices, ledger, preactivation, appSmoke] =
  await Promise.all([
    readFile("app/customers/[customerId]/saved-bookings-panel.tsx", "utf8"),
    readFile("app/customers/[customerId]/page.tsx", "utf8"),
    readFile("app/customers/[customerId]/customer-invoice-folder-panel.tsx", "utf8"),
    readFile("lib/admin-customer-saved-bookings-read.ts", "utf8"),
    readFile("app/customers/page.tsx", "utf8"),
    readFile("lib/customer-invoice-record-persistence.ts", "utf8"),
    readFile("lib/customer-local-invoices.ts", "utf8"),
    readFile("docs/current-implementation-ledger.md", "utf8"),
    readFile("scripts/test-preactivation-verification-suite.mjs", "utf8"),
    readFile("scripts/test-app-smoke-browser.mjs", "utf8"),
  ]);

function includes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

for (const fragment of [
  "const customerFolderInvoiceSelectionLimit = 4;",
  'source: returnContext ? "return" : "manual"',
  "The customer folder performs exactly one guarded read on mount or return from Dispatch.",
  'data-customer-folder-selected-invoice-layout="true"',
  "data-customer-folder-selected-invoice-job",
  "Review invoice &amp; email",
  "selected_booking_references",
  "selectedUnbilledBookings.map((booking)",
  'limit: "200"',
  'data-customer-folder-sector="unbilled-jobs"',
  'data-customer-folder-unbilled-scroll="true"',
  "max-h-[32rem] overflow-x-auto overflow-y-auto",
  "3 · Pending jobs for payment",
  "4 · Selected jobs invoice review",
]) {
  includes(folderPage, fragment, `customer folder four-sector fragment ${fragment}`);
}

includes(folderShell, 'data-customer-folder-sector="profile"', "profile sector marker");
includes(folderShell, "1 · Customer profile &amp; invoice prefix", "profile sector label");
includes(folderShell, "bg-slate-950", "classic black customer folder background");
includes(
  appSmoke,
  '"[data-customer-folder-sector=\'profile\']"',
  "browser customer-folder profile readiness marker",
);
includes(
  ledger,
  "The customer-detail portion of that sweep waits for the established numbered profile sector",
  "customer-folder browser marker ledger checkpoint",
);
includes(invoiceFolder, 'data-customer-folder-sector="invoices"', "invoices sector marker");
includes(invoiceFolder, "2 · Total invoices", "invoices sector label");
includes(
  savedBookingsRead,
  "const maxLimit = customerFolderSavedBookingSourceReadLimit;",
  "customer folder returns its complete bounded source read",
);

assert.equal(
  folderPage.includes("Load unbilled jobs"),
  false,
  "Customer folder must auto-load pending jobs without the retired manual button.",
);
assert.equal(
  folderPage.includes("data-customer-folder-saved-bookings-summary"),
  false,
  "Customer folder must not restore the removed noisy pending-job summary boxes.",
);

for (const fragment of [
  "function selectedInvoiceBookingReferences(value: string)",
  ".slice(0, plainInvoiceMaxLineItems)",
  "selectedBookingReferences = \"\"",
  "selectedInvoiceBookingReferences(selectedBookingReferences)",
  "targetBookings.map((booking) =>",
  "readCustomerFolderExactBooking(safeCustomerFolderDispatchHandoffReference(booking))",
  "mismatchedCustomer",
  "mismatchedBooker",
  "setPlainInvoiceSavedBookings(targetBookings)",
  "bookingReference: firstInvoiceRow.bookingReference",
  "bookingReference: row.bookingReference",
  "All ${invoiceRows.length} selected job",
  "setPlainInvoiceSelectedJobReviewActive(true)",
  "plainInvoicePreviewFromForm(nextPlainInvoiceForm)",
  'data-selected-job-invoice-review="true"',
  'data-selected-job-invoice-actions="true"',
  'data-selected-job-invoice-edit="true"',
  'data-selected-job-invoice-payment-options="true"',
  'data-selected-job-invoice-card-payment-enabled="true"',
  'data-selected-job-invoice-card-fee-applies="true"',
  'data-selected-job-invoice-send="true"',
  'data-selected-job-invoice-pdf-download="true"',
  'data-selected-job-invoice-paper="true"',
  'data-selected-job-invoice-status="true"',
  'data-selected-job-invoice-balance="true"',
  'data-selected-job-invoice-notes="true"',
  'data-selected-job-invoice-signoff="true"',
  'data-selected-job-invoice-bank="true"',
  'data-selected-job-invoice-terms="true"',
  '<summary aria-hidden="true" className="hidden">',
  "Selected jobs invoice review",
  "toggleSelectedJobInvoiceEditing",
  "sendSelectedJobInvoice",
  "downloadSelectedJobInvoicePdf",
  "plainInvoiceIssuedRecord",
  "PDF Download",
  "loadPublicCompanyProfile",
  "companyProfile.invoice_signoff_name",
  "companyProfilePaymentSummary(companyProfile)",
  "companyProfile.invoice_footer_terms",
  "plainInvoiceCompanyPaymentHeading",
  "plainInvoiceCompanyPaymentDetailLines",
  "Allow card payment for this invoice",
  'data-plain-invoice-quantity="true"',
  "plainInvoiceLineItemRateLabel(item)",
  "plainInvoiceQuantityLabel(item.quantity)",
  "whitespace-pre-wrap",
  "<textarea",
]) {
  includes(customersPage, fragment, `multi-job invoice handoff fragment ${fragment}`);
}

const selectedReviewStart = customersPage.indexOf('data-selected-job-invoice-review="true"');
const selectedReviewEnd = customersPage.indexOf('data-plain-invoice-crm-account="true"', selectedReviewStart);
assert.notEqual(selectedReviewStart, -1, "selected-job invoice review must exist");
assert.notEqual(selectedReviewEnd, -1, "selected-job invoice review must end before the generic CRM workbench");
const selectedReview = customersPage.slice(selectedReviewStart, selectedReviewEnd);

const notesIndex = selectedReview.indexOf('data-selected-job-invoice-notes="true"');
const signoffIndex = selectedReview.indexOf('data-selected-job-invoice-signoff="true"');
const bankIndex = selectedReview.indexOf('data-selected-job-invoice-bank="true"');
const termsIndex = selectedReview.indexOf('data-selected-job-invoice-terms="true"');
assert.equal(
  notesIndex < signoffIndex && signoffIndex < bankIndex && bankIndex < termsIndex,
  true,
  "selected-job invoice lower content must preserve the owner-approved Notes, sign-off, bank, then Terms order",
);
assert.equal(
  selectedReview.includes("<details") ||
    selectedReview.includes("Click to view") ||
    selectedReview.includes('data-selected-job-invoice-footer="true"'),
  false,
  "selected-job invoice must not collapse bank details or combine Notes and Terms into the later replacement footer",
);
assert.equal(
  selectedReview.includes('className="mt-5 max-w-lg break-words leading-4"') &&
    selectedReview.includes("{plainInvoiceCompanyPaymentHeading}") &&
    selectedReview.includes("plainInvoiceCompanyPaymentDetailLines.map"),
  true,
  "selected-job bank details must remain fully visible in the owner-approved invoice layout",
);

const selectedFormSetIndex = customersPage.indexOf("setPlainInvoiceForm(nextPlainInvoiceForm);");
const missingBookerBlockIndex = customersPage.indexOf("if (!exactBookerId)", selectedFormSetIndex);
assert.equal(
  selectedFormSetIndex !== -1 && selectedFormSetIndex < missingBookerBlockIndex,
  true,
  "verified customer/job display must load before missing-booker Send/PDF block",
);

includes(
  customersPage,
  "plainInvoiceSelectedJobReviewActive ? (",
  "selected-job review must suppress the browser default Details summary",
);

for (const label of ["Edit", ': "Send"', ': "PDF Download"']) {
  includes(selectedReview, label, `compact selected-job invoice action ${label.trim()}`);
}

for (const forbiddenControl of [
  'data-plain-invoice-draft-action="true"',
  'data-plain-invoice-issue-action="true"',
  'data-plain-invoice-clear-action="true"',
  "Advanced invoice workbench",
]) {
  assert.equal(
    selectedReview.includes(forbiddenControl),
    false,
    `selected-job invoice review must not render ${forbiddenControl}`,
  );
}

for (const fragment of [
  "bookingReference?: string;",
  "quantity?: number;",
  "const bookingReference = text(item.bookingReference);",
  "const quantityValue = numberValue(item.quantity, 1);",
]) {
  includes(localInvoices, fragment, `stored invoice line reference fragment ${fragment}`);
}

for (const fragment of [
  'const paidInvoice = documentType === "invoice" && invoice.status === "Paid";',
  'const paymentMadeValue = paidInvoice ? `(-) ${sgdAmount}` : "SGD0.00";',
  'const balanceDueValue = paidInvoice ? "SGD0.00" : sgdAmount;',
  'const [paymentHeading = "Bank Details", ...paymentDetailLines] = paymentLines;',
  'const notesY = 320;',
  'const signoffY = 245;',
  'const paymentY = 182;',
  'const termsY = 55;',
  'pdfRightTextAt("Payment Made"',
  "pdfRightTextAt(balanceDueValue",
  "companyProfile.invoice_signoff_name",
  "companyProfile.phone",
  'pdfRightTextAt(quantity.toFixed(2), 435, rowY, 8)',
  "formatInvoiceAmount(Math.round(itemAmountCents / quantity))",
  'value.replace(/\\r\\n?/g, "\\n").split("\\n")',
]) {
  includes(localInvoices, fragment, `status-correct shared PDF fragment ${fragment}`);
}

for (const hardcodedFragment of [
  "companyProfilePaymentSummary(defaultCompanyProfile)",
  "defaultCompanyProfile.invoice_footer_terms",
]) {
  assert.equal(
    selectedReview.includes(hardcodedFragment),
    false,
    `selected-job review must not restore hardcoded footer fragment ${hardcodedFragment}`,
  );
}

for (const hardcodedFragment of [
  'pdfTextAt("Finance Team", 50, signoffY - 32, 8)',
  "pdfTextAt(defaultCompanyProfile.phone, 50, signoffY - 43, 8)",
]) {
  assert.equal(
    localInvoices.includes(hardcodedFragment),
    false,
    `shared PDF must not restore hardcoded footer fragment ${hardcodedFragment}`,
  );
}

assert.equal(
  localInvoices.indexOf('pdfTextAt("Notes", 50, notesY') <
    localInvoices.indexOf('pdfTextAt("Thank you for your business", 50, signoffY') &&
    localInvoices.indexOf('pdfTextAt("Thank you for your business", 50, signoffY') <
      localInvoices.indexOf("pdfTextAt(paymentHeading") &&
    localInvoices.indexOf("pdfTextAt(paymentHeading") <
      localInvoices.indexOf('pdfTextAt("Terms & Conditions:", 50, termsY'),
  true,
  "shared PDF must preserve the owner-approved Notes, sign-off, bank, then Terms order",
);

for (const fragment of [
  "if (value.length > 4)",
  "function safeLineItemDescription(value: unknown)",
  "function safeLineItemQuantity(value: unknown)",
  "const quantity = safeLineItemQuantity(record.quantity);",
  "function uniqueInvoiceBookingReferences",
  "function verifyIssuedInvoiceBookingOwnership",
  'bookingReferences.includes("ADM-20260712063110")',
  '.in("booking_reference", bookingReferences)',
  '.eq("customer_id", input.customerId)',
  '.eq("booker_id", input.bookerId)',
  "Invoice already contains one or more selected jobs.",
  "item.bookingReference || sanitized.data.bookingReference",
]) {
  includes(invoicePersistence, fragment, `server multi-job verification fragment ${fragment}`);
}

for (const forbidden of [
  "sendMail",
  "new Resend",
  "navigator.geolocation",
  "watchPosition",
  "driver payout",
  "PayNow payout",
  "parser/debug",
]) {
  assert.equal(
    folderPage.toLowerCase().includes(forbidden.toLowerCase()),
    false,
    `Customer folder invoice selection must exclude ${forbidden}.`,
  );
}

includes(ledger, "### Customer Folder Four-Sector Invoice Workflow");
includes(preactivation, guardScript, "preactivation guard registration");

console.log("Customer folder multi-job invoice handoff guard passed");
