import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const helperPath = "lib/customer-local-invoices.ts";
const customersPagePath = "app/customers/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs";

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

const [helper, customersPage, portalPage, ledger, preactivationSuite] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(portalPagePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const customerIssuePanel = sectionBetween(
  customersPage,
  'data-customer-invoice-issue-panel="true"',
  'data-customer-invoice-issued-local-list="true"',
);
const portalInvoiceSection = sectionBetween(
  portalPage,
  'activeSection === "Invoices"',
  'aria-labelledby="booking-search-title"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Local Invoice Issue PDF And Portal Folder Lock",
  "\n### ",
);

for (const fragment of [
  "export type CustomerLocalInvoiceRecord = {",
  'source: "local-admin-issued-invoice-v1";',
  'const customerLocalInvoicesStorageKey = "prestige.customer.localInvoices.v1";',
  "export function readCustomerLocalInvoices()",
  "export function saveCustomerLocalInvoice(record: CustomerLocalInvoiceRecord)",
  "export function parseInvoiceAmountToCents(value: string)",
  "export function createCustomerLocalInvoiceRecord(",
  "export function createCustomerInvoicePdfBytes(",
  "export async function downloadCustomerInvoicePdf(",
  "loadCustomerInvoicePdfLogoImage",
  "/XObject << /Im1 6 0 R >>",
  "/Subtype /Image",
  "/Filter /DCTDecode",
  "%PDF-1.4",
  "new Blob([bytes], { type: \"application/pdf\" })",
]) {
  assertIncludes(helper, fragment, `local invoice helper fragment ${fragment}`);
}

for (const fragment of [
  "const [customerInvoiceIssueAmount, setCustomerInvoiceIssueAmount] = useState(\"\");",
  "const [customerInvoiceIssueDueDate, setCustomerInvoiceIssueDueDate] = useState(() =>",
  "const [customerInvoiceIssueStatus, setCustomerInvoiceIssueStatus] =",
  "const [issuedCustomerInvoices, setIssuedCustomerInvoices] = useState<CustomerLocalInvoiceRecord[]>(() =>",
  "function issuePreparedCustomerInvoice()",
  "parseInvoiceAmountToCents(customerInvoiceIssueAmount)",
  "createCustomerLocalInvoiceRecord({",
  "saveCustomerLocalInvoice(issuedInvoice)",
  "downloadCustomerInvoicePdf(issuedInvoice)",
  'data-customer-invoice-issue-panel="true"',
  'data-customer-invoice-issue-amount="true"',
  'data-customer-invoice-issue-due-date="true"',
  'data-customer-invoice-issue-status="true"',
  'data-customer-invoice-issue-download-pdf="true"',
  'data-customer-invoice-issue-local-boundary="true"',
  'data-customer-invoice-issued-local-list="true"',
  'data-customer-invoice-issued-local-download={invoice.invoiceNumber}',
  'data-customer-invoice-issued-local-pay={invoice.invoiceNumber}',
  'data-customer-invoice-issued-local-paid={invoice.invoiceNumber}',
  'data-customer-invoice-issued-local-mark-unpaid={invoice.invoiceNumber}',
  "Issue Invoice + PDF",
  "Issued",
  "Pay",
  "Paid",
  "Mark Unpaid",
]) {
  assertIncludes(customersPage, fragment, `customers local issue fragment ${fragment}`);
}

for (const fragment of [
  "Enter the approved customer amount before issuing. This prevents under-billing or over-billing.",
  "Invoice number is created only when you click issue.",
  "marked Paid locally. No bank, Stripe, payment provider, or Supabase record was changed.",
  "marked Unpaid locally. No bank, Stripe, payment provider, or Supabase record was changed.",
]) {
  assertIncludes(customersPage, fragment, `customer issue safety wording ${fragment}`);
}

for (const fragment of [
  "function markIssuedCustomerInvoicePaid(invoice: CustomerLocalInvoiceRecord)",
  "function markIssuedCustomerInvoiceUnpaid(invoice: CustomerLocalInvoiceRecord)",
  'status: "Paid" as const',
  'status: "Unpaid" as const',
  "saveCustomerLocalInvoice(paidInvoice)",
  "saveCustomerLocalInvoice(unpaidInvoice)",
]) {
  assertIncludes(customersPage, fragment, `customers local payment status action ${fragment}`);
}

for (const fragment of [
  "No email, Stripe, bank, provider send",
  "cross-device customer portal sync",
]) {
  assertIncludes(customerIssuePanel, fragment, `customer issue safety wording ${fragment}`);
}

for (const fragment of [
  "const [customerInvoiceRecords, setCustomerInvoiceRecords] = useState<CustomerLocalInvoiceRecord[]>([]);",
  "readCustomerLocalInvoices()",
  'window.addEventListener("prestige-local-invoices-updated", loadLocalInvoices);',
  "const customerInvoiceRecordsByFolder = useMemo(() =>",
  "const folderRecords = customerInvoiceRecordsByFolder[folder];",
  'data-customer-portal-invoice-row={invoice.invoiceNumber}',
  'data-customer-portal-invoice-download={invoice.invoiceNumber}',
  "downloadCustomerInvoicePdf(invoice, companyProfile)",
  'data-customer-portal-invoice-local-boundary="true"',
]) {
  assertIncludes(portalPage, fragment, `portal local invoice folder fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /sendMail|new\s+Resend|api\.telegram\.org|twilio|messages\.create|client\.messages/i,
  /checkout\.sessions|paymentIntent|paymentLink|loadStripe|new\s+Stripe/i,
  /createClient|service_role|process\.env/i,
  /driver payout|PayNow payout|payout comparisons|internal admin notes|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(helper, forbiddenPattern, "local invoice helper provider/db/privacy boundary");
  assertExcludes(customerIssuePanel, forbiddenPattern, "customer issue panel provider/db/privacy boundary");
  assertExcludes(portalInvoiceSection, forbiddenPattern, "portal invoice section provider/db/privacy boundary");
}

for (const phrase of [
  "Admin Customers can issue a browser-local invoice from the prepared Unbilled Customers row after the approved amount and due date are reviewed.",
  "The issue action creates a unique `INV-YYYYMMDD-####` invoice number only at click time, saves the invoice record to this Mac browser storage, and starts a real PDF download generated in-browser.",
  "The customer portal `Invoices` tab reads the same browser-local invoice records and shows them under compact `Unpaid` and `Paid` monthly folders with PDF download buttons.",
  "Downloaded invoice PDFs embed the safe Company Profile JPEG logo when available and keep company name, contact, accounting email, address, and footer terms in the same customer-facing profile path.",
  "The amount input is required before issue so admin must review the charge before invoice number/PDF creation.",
  "Issued local invoices show `Pay` for unpaid invoices, then `Paid` plus `Mark Unpaid` so an accidental local paid click can be reversed before real payment sync exists.",
  "This pass does not send email, create Stripe/payment links, write bank/payment/provider records, write Supabase rows, change env, apply migrations, or create cross-device customer portal sync.",
  "Guard coverage lives in `scripts/test-customer-local-invoice-issue-pdf-portal-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation local invoice issue guard registration");

console.log("Customer local invoice issue PDF portal guard passed");
