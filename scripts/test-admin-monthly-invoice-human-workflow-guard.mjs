import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const invoiceTypesPath = "lib/customer-local-invoices.ts";
const invoicePersistencePath = "lib/customer-invoice-record-persistence.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-monthly-invoice-human-workflow-guard.mjs";

const [customersPage, invoiceTypes, invoicePersistence, ledger, preactivationSuite] =
  await Promise.all([
    readFile(customersPagePath, "utf8"),
    readFile(invoiceTypesPath, "utf8"),
    readFile(invoicePersistencePath, "utf8"),
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
  ]);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing section start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing section end: ${endFragment}`);
  return source.slice(start, end);
}

const monthlyPreparation = sectionBetween(
  customersPage,
  "function prepareMonthlyBillingGroupForInvoice",
  "function prepareSelectedCustomerMonthlyInvoice",
);
const monthlyWorkbench = sectionBetween(
  customersPage,
  'data-plain-monthly-invoice-workflow="true"',
  'data-plain-invoice-boundary="true"',
);
const lineItemSanitizer = sectionBetween(
  invoicePersistence,
  "function safeLineItems",
  "function safeActor",
);
const issuedVerification = sectionBetween(
  invoicePersistence,
  "async function verifyIssuedInvoiceBookings",
  "export async function createCustomerInvoiceRecord",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Human Monthly Invoice Workflow And Multi-Job Safety",
  "\n### ",
);

for (const fragment of [
  "bookingReference?: string;",
  "export function customerInvoiceLineItemPages",
]) {
  assertIncludes(invoiceTypes, fragment, `invoice line-item contract ${fragment}`);
}

for (const fragment of [
  "const preparedRows = group.rows;",
  "bookingReference: firstRow.reference",
  "bookingReference: row.reference",
  "setPlainInvoiceMonthlyContext",
]) {
  assertIncludes(monthlyPreparation, fragment, `monthly preparation ${fragment}`);
}

assertIncludes(
  customersPage,
  "monthlyInvoice: Boolean(plainInvoiceMonthlyContext)",
  "explicit monthly invoice request flag",
);
for (const fragment of [
  "function plainInvoiceMonthlyRouteSummary",
  "route: plainInvoiceMonthlyRouteSummary(nextRows.map((row) => row.bookingReference))",
  "route: plainInvoiceMonthlyRouteSummary(rows.map((row) => row.bookingReference))",
]) {
  assertIncludes(customersPage, fragment, `monthly draft summary synchronization ${fragment}`);
}

assertExcludes(
  monthlyPreparation,
  /slice\(0,\s*plainInvoiceMaxLineItems\)/,
  "monthly preparation four-line truncation",
);

for (const fragment of [
  'data-plain-monthly-invoice-workflow="true"',
  "data-plain-monthly-invoice-step={step}",
  '[1, "Choose month"]',
  '[2, "Check jobs"]',
  '[3, "Review invoice"]',
  "Check jobs",
  "Review invoice",
  "Save invoice draft",
  'data-plain-monthly-invoice-due-date="true"',
  'data-plain-monthly-invoice-email="true"',
  'data-plain-invoice-job-open-booking={row.bookingReference}',
  'target="_blank"',
  'data-plain-invoice-job-remove={row.bookingReference}',
  "Remove from invoice",
  "Undo remove",
  "This does not cancel or delete the booking.",
]) {
  assertIncludes(monthlyWorkbench, fragment, `human monthly invoice workflow ${fragment}`);
}

for (const forbidden of [
  "deleteCustomerFolderExactBooking",
  "cancelRegularCustomerBooking",
  "/api/admin-saved-bookings",
  "/api/admin-bookings",
]) {
  assertExcludes(monthlyWorkbench, forbidden, `draft-only removal boundary ${forbidden}`);
}

for (const fragment of [
  "const bookingReference = safeText(record.bookingReference, 160);",
  "lineItem.bookingReference = bookingReference;",
]) {
  assertIncludes(lineItemSanitizer, fragment, `stored line-item reference ${fragment}`);
}

for (const fragment of [
  "uniqueInvoiceBookingReferences",
  "bookingReferences.length > 1 && !input.monthlyInvoice",
  '.from("bookings")',
  '.in("booking_reference", bookingReferences)',
  '.eq("customer_id", input.customerId)',
  '.eq("booker_id", input.bookerId)',
  '.from(customerInvoiceRecordTableName)',
  'Invoice already contains one or more selected jobs.',
  '.from("completed_booking_closeouts")',
  'Selected jobs are not ready for billing.',
  'bookingReferences.includes("ADM-20260712063110")',
]) {
  assertIncludes(issuedVerification, fragment, `all-job issue verification ${fragment}`);
}

for (const fragment of [
  "customerInvoiceLineItemPages(invoice.lineItems)",
  "bookingReference",
]) {
  assertIncludes(invoiceTypes + invoicePersistence, fragment, `multi-page PDF/persistence ${fragment}`);
}

assertExcludes(
  invoiceTypes,
  /lineItems\.slice\(0,\s*4\)/,
  "stored invoice PDF four-line truncation",
);

for (const phrase of [
  "The existing selected-customer monthly invoice lane now keeps every billing-ready job in one reviewed invoice draft instead of truncating the group to four lines.",
  "Each admin row retains its exact booking reference, opens the established booking editor, supports description and amount review, and can be removed from or restored to the invoice draft without cancelling, deleting, or updating the booking.",
  "Issued multi-job invoices verify every included booking against the same verified customer and booker, completed closeout billing readiness, and existing issued invoice line-item references before invoice number or PDF creation.",
  "Stored customer invoice line items retain bounded booking references for authenticated admin duplicate protection; customer PDFs continue to show only reviewed descriptions, approved references, and amounts.",
  "Invoice PDFs paginate reviewed line items instead of silently dropping jobs after the fourth row.",
  `Focused lock: \`${guardScript}\`.`,
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation human monthly invoice guard registration");

console.log("Admin human monthly invoice multi-job workflow guard passed.");
