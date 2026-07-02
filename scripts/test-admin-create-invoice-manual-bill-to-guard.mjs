import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const customersPagePath = "app/customers/page.tsx";
const adminInvoiceBoundaryPath = "lib/admin-customer-invoice-boundary.ts";
const adminInvoicesRoutePath = "app/api/admin-customer-invoices/route.ts";
const customerBookingPagePath = "app/book/page.tsx";
const customerPortalPagePath = "app/my-bookings/page.tsx";
const driverJobPagePath = "app/driver-job/[token]/page.tsx";
const customerFolderPath = "app/customers/[customerId]/page.tsx";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-admin-create-invoice-manual-bill-to-guard.mjs";

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

const [
  customersPage,
  adminInvoiceBoundary,
  adminInvoicesRoute,
  customerBookingPage,
  customerPortalPage,
  driverJobPage,
  customerFolder,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(customersPagePath, "utf8"),
  readFile(adminInvoiceBoundaryPath, "utf8"),
  readFile(adminInvoicesRoutePath, "utf8"),
  readFile(customerBookingPagePath, "utf8"),
  readFile(customerPortalPagePath, "utf8"),
  readFile(driverJobPagePath, "utf8"),
  readFile(customerFolderPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const createInvoiceSection = sectionBetween(
  customersPage,
  'data-plain-invoice-panel="true"',
  'data-customer-invoice-draft-list="true"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Admin Create Invoice Manual Bill-To Lane",
  "\n### ",
);

for (const fragment of [
  'data-plain-invoice-start-action="true"',
  'data-plain-invoice-panel="true"',
  'data-plain-invoice-bill-to-name="true"',
  'data-plain-invoice-bill-to-email="true"',
  'data-plain-invoice-reference="true"',
  'data-plain-invoice-amount="true"',
  'data-plain-invoice-due-date="true"',
  'data-plain-invoice-service="true"',
  'data-plain-invoice-line-description="true"',
  'data-plain-invoice-route="true"',
  'data-plain-invoice-paid-status="true"',
  'data-plain-invoice-preview-action="true"',
  'data-plain-invoice-draft-action="true"',
  'data-plain-invoice-issue-action="true"',
  'data-plain-invoice-email-action="true"',
  'data-plain-invoice-preview-card="true"',
  'data-plain-invoice-boundary="true"',
  "Create Invoice",
  "Manual bill-to",
  "No number yet",
  "ADHOC-",
  "Preview first; Draft or Issue creates the invoice number.",
  'data-plain-invoice-feedback-tone={plainInvoiceFeedbackTone}',
  "regularCustomerBookingFeedbackClass(",
  "Create Invoice stores an ad-hoc admin billing document only after Draft or Issue.",
  "Email issues the invoice first, then uses the existing guarded email",
  "Paid only changes invoice status; it does not record a payment.",
]) {
  assertIncludes(createInvoiceSection + customersPage, fragment, `create invoice UI fragment ${fragment}`);
}

for (const fragment of [
  "plainInvoiceCustomerId(",
  "plainInvoiceDefaultReference()",
  "plain-invoice:",
  "plainInvoiceEmailActionKey",
  "plainInvoiceRequestBodyFromPreview(",
  "documentType: \"invoice\" as CustomerBillingDocumentType",
  "status: plainInvoicePreview.folder",
  "fetch(adminCustomerInvoicesApiPath",
  "fetch(adminCustomerInvoiceEmailApiPath",
  '"x-prestige-admin-purpose": "admin-booking-persistence"',
  "method: \"POST\"",
  "downloadStoredCustomerInvoicePdf(issuedInvoice)",
  "plainInvoiceForm.isPaid ? \"Paid\" : \"Unpaid\"",
]) {
  assertIncludes(customersPage, fragment, `create invoice implementation fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "Reserve Number",
  "adminMonthlyInvoiceNumberReservationsApiPath",
  "/api/admin-monthly-invoice-number-reservations",
  "/api/admin-customer-invoice-prefix-settings",
  "customer_invoice_sequences",
  "CustomerInvoicePrefixSettingsPanel",
  "loadCustomerInvoiceRecordsForPortal",
  "customerPortalInvoicesApiPath",
  "sendWhatsapp",
  "sendWhatsApp",
  "sendSms",
  "sendTelegram",
  "driver_payout",
  "paynow_payout",
  "paymentIntent",
  "checkout.sessions",
]) {
  assertExcludes(createInvoiceSection, forbiddenFragment, "create invoice side-effect boundary");
}

for (const fragment of [
  'refererUrl.pathname === "/customers"',
  'refererUrl.pathname.startsWith("/customers/")',
  "resolveAdminCustomerInvoiceBoundary(",
  'request.headers.get("x-prestige-admin-purpose") !== adminBookingPersistencePurpose',
]) {
  assertIncludes(adminInvoiceBoundary, fragment, `admin invoice boundary fragment ${fragment}`);
}

for (const fragment of [
  "resolveAdminCustomerInvoiceBoundary(request)",
  "createCustomerInvoiceRecord(await readJsonBody(request), boundary.actor)",
  'export const runtime = "nodejs";',
]) {
  assertIncludes(adminInvoicesRoute, fragment, `admin invoice route fragment ${fragment}`);
}

for (const publicSource of [customerBookingPage, customerPortalPage, driverJobPage, customerFolder]) {
  for (const forbiddenPublicFragment of [
    "data-plain-invoice-",
    "plainInvoiceCustomerId",
    "plainInvoiceRequestBodyFromPreview",
    "Create Invoice stores an ad-hoc admin billing document",
  ]) {
    assertExcludes(publicSource, forbiddenPublicFragment, "public/customer/driver/folder create invoice boundary");
  }
}

for (const phrase of [
  "Admin Customers now has a compact `Create Invoice` entry point inside `/customers` > Invoice Workspace > Send Invoice Workbench.",
  "The lane is for ad-hoc/manual bill-to invoices without opening or creating a customer folder.",
  "Loading the panel and clicking Preview do not create an invoice number, PDF, customer folder, portal invite, prefix reservation, payment link, provider send, payout, or GPS/live-location action.",
  "Only the explicit `Draft`, `Issue`, or `Email` action posts to guarded admin invoice routes with the existing admin booking persistence purpose header.",
  "Manual bill-to records use an internal `plain-invoice:` customer id and fixed `invoice` document type; they do not use customer-specific saved prefixes or the monthly invoice number reservation route.",
  "The Create Invoice `Email` button requires a current preview and recipient email, issues the invoice through the guarded invoice route, then calls the existing guarded invoice email route.",
  "The `Paid` checkbox changes only the stored invoice status label and does not create a payment, bank record, card charge, payout, or reconciliation event.",
  "Public booking, customer portal, driver pages, and individual customer folders are not wired to this Create Invoice panel.",
]) {
  assertIncludes(ledgerSection, phrase, `create invoice ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation create invoice guard registration");

console.log("Admin Create Invoice manual bill-to guard passed.");
