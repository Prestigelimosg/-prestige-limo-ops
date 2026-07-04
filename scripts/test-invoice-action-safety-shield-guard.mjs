import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const adminPagePath = "app/page.tsx";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-invoice-action-safety-shield-guard.mjs";

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

function assertBefore(source, firstFragment, secondFragment, label) {
  const first = source.indexOf(firstFragment);
  const second = source.indexOf(secondFragment);

  assert.notEqual(first, -1, `${label} missing first fragment: ${firstFragment}`);
  assert.notEqual(second, -1, `${label} missing second fragment: ${secondFragment}`);
  assert.equal(first < second, true, `${label} must place ${firstFragment} before ${secondFragment}.`);
}

const [customersPage, adminPage, preactivationSuite] = await Promise.all([
  readFile(customersPagePath, "utf8"),
  readFile(adminPagePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const customerInvoiceSafetyHelper = sectionBetween(
  customersPage,
  "function confirmInvoiceSafetyAction({",
  "\ntype CustomerBillingDocumentState",
);
const adminInvoiceSafetyHelper = sectionBetween(
  adminPage,
  "function confirmAdminInvoiceSafetyAction({",
  "\ntype AdminLegacyDataTable",
);

for (const helper of [customerInvoiceSafetyHelper, adminInvoiceSafetyHelper]) {
  for (const fragment of [
    "Final invoice action confirmation:",
    "Use only after final admin review.",
    "Confirm to continue.",
    "typeof window === \"undefined\"",
    "window.confirm(",
    "Amount:",
  ]) {
    assertIncludes(helper, fragment, `invoice safety helper fragment ${fragment}`);
  }
}

for (const fragment of [
  "Customer:",
  "Recipient:",
  "Reference:",
  "Invoice:",
  "Document:",
]) {
  assertIncludes(customerInvoiceSafetyHelper, fragment, `customer invoice safety detail ${fragment}`);
}

for (const fragment of [
  "Customer/account:",
  "Month:",
  "Reference:",
  "Invoice:",
]) {
  assertIncludes(adminInvoiceSafetyHelper, fragment, `admin invoice safety detail ${fragment}`);
}

const guardedCustomerActions = [
  {
    action: "Issue Create Invoice",
    cancel: "Create Invoice issue cancelled. No invoice number, PDF, email, payment, or customer folder was changed.",
    fetchOrState: "setIssuingCustomerInvoiceKey(plainInvoiceIssueActionKey);",
    section: sectionBetween(customersPage, "async function issuePlainInvoice()", "\n  async function emailPlainInvoice()"),
  },
  {
    action: "Email Create Invoice",
    cancel: "Create Invoice email cancelled. No invoice number, PDF, email, payment, or customer folder was changed.",
    fetchOrState: "setIssuingCustomerInvoiceKey(plainInvoiceEmailActionKey);",
    section: sectionBetween(customersPage, "async function emailPlainInvoice()", "\n  function customerInvoiceLineDescriptionForPreview"),
  },
  {
    action: "customerBillingDocumentActionLabel()",
    cancel: "issue cancelled. No invoice number, PDF, email, payment, or customer folder was changed.",
    fetchOrState: "setIssuingCustomerInvoiceKey(customerInvoicePrepRow.key);",
    section: sectionBetween(customersPage, "async function issuePreparedCustomerInvoice()", "\n  async function downloadIssuedCustomerInvoice"),
  },
  {
    action: "Email ${documentLabel}",
    cancel: "email cancelled. No customer email was sent.",
    fetchOrState: "setEmailingCustomerInvoiceNumber(invoice.invoiceNumber);",
    section: sectionBetween(customersPage, "async function handleCustomerInvoiceEmailAction", "\n  async function markIssuedCustomerInvoicePaid"),
  },
  {
    action: "Mark invoice Paid",
    cancel: "paid mark cancelled. No invoice status changed.",
    fetchOrState: "setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);",
    section: sectionBetween(customersPage, "async function markIssuedCustomerInvoicePaid", "\n  async function markIssuedCustomerInvoiceUnpaid"),
  },
  {
    action: "Mark invoice Unpaid",
    cancel: "unpaid mark cancelled. No invoice status changed.",
    fetchOrState: "setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);",
    section: sectionBetween(customersPage, "async function markIssuedCustomerInvoiceUnpaid", "\n  async function createCreditNoteFromPaidInvoice"),
  },
  {
    action: "Create credit note",
    cancel: "credit note cancelled. No credit note was created.",
    fetchOrState: "setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);",
    section: sectionBetween(customersPage, "async function createCreditNoteFromPaidInvoice", "\n  async function archiveCustomerTestInvoiceArtifact"),
  },
  {
    action: "Convert quotation to invoice",
    cancel: "conversion cancelled. No invoice was created.",
    fetchOrState: "setUpdatingCustomerInvoiceStatusNumber(invoice.invoiceNumber);",
    section: sectionBetween(customersPage, "async function convertQuotationToInvoice", "\n  function clearRegularCustomerBookingListFilters"),
  },
];

for (const { action, cancel, fetchOrState, section } of guardedCustomerActions) {
  assertIncludes(section, "confirmInvoiceSafetyAction({", `customer invoice action guard ${action}`);
  assertIncludes(section, action, `customer invoice action label ${action}`);
  assertIncludes(section, cancel, `customer invoice cancel feedback ${action}`);
  assertBefore(section, "confirmInvoiceSafetyAction({", fetchOrState, `customer invoice action order ${action}`);
}

for (const fragment of [
  "This creates an issued invoice number, stores the PDF, and starts the PDF download.",
  "then sends the invoice email through the guarded route.",
  "This sends the stored billing document email to the selected recipient.",
  "It does not record bank payment, card payment, provider payment, or payout.",
  "It does not reverse a bank payment, card payment, provider payment, or payout.",
  "This creates a new credit note document and PDF linked to the paid invoice.",
  "This creates a new issued invoice from the quotation and starts the PDF download.",
]) {
  assertIncludes(customersPage, fragment, `customer invoice consequence ${fragment}`);
}

const monthlyReservationSection = sectionBetween(
  adminPage,
  "const reserveMonthlyInvoiceNumberFromCurrentIssueRecord = async () => {",
  "\n  const monthlyInvoicePdfReadinessDisabled",
);

for (const fragment of [
  "confirmAdminInvoiceSafetyAction({",
  "Reserve monthly invoice number",
  "This reserves the next invoice number for the locked monthly issue record.",
  "It does not create a PDF, send an invoice, record payment, or create payout.",
  "Monthly invoice number reservation cancelled. No invoice number was reserved.",
]) {
  assertIncludes(monthlyReservationSection, fragment, `monthly reservation guard ${fragment}`);
}

assertBefore(
  monthlyReservationSection,
  "confirmAdminInvoiceSafetyAction({",
  "await reserveAdminMonthlyInvoiceNumberForIssueRecord(",
  "monthly invoice number reservation confirmation order",
);

for (const forbiddenPattern of [
  /api\.telegram\.org|sendTelegram|sendWhatsApp|sendSms|twilio/i,
  /paymentIntent|checkout\.sessions|stripe|payout/i,
  /driver_payout|paynow_payout|parser\/debug|mock QA|dev archive/i,
]) {
  assertExcludes(customerInvoiceSafetyHelper + adminInvoiceSafetyHelper, forbiddenPattern, "invoice safety helper boundary");
}

assertIncludes(preactivationSuite, guardScript, "preactivation invoice safety shield guard registration");

console.log("Invoice action safety shield guard passed");
