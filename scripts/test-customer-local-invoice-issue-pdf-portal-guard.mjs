import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const localPdfHelperPath = "lib/customer-local-invoices.ts";
const persistencePath = "lib/customer-invoice-record-persistence.ts";
const adminBoundaryPath = "lib/admin-customer-invoice-boundary.ts";
const adminInvoicesRoutePath = "app/api/admin-customer-invoices/route.ts";
const adminPdfRoutePath = "app/api/admin-customer-invoice-pdf/[invoiceNumber]/route.ts";
const adminEmailRoutePath = "app/api/admin-customer-invoice-email/route.ts";
const customerInvoicesRoutePath = "app/api/customer-invoices/route.ts";
const customerPdfRoutePath = "app/api/customer-invoice-pdf/[invoiceNumber]/route.ts";
const migrationPath = "supabase/migrations/202606290002_customer_invoice_records_foundation.sql";
const customersPagePath = "app/customers/page.tsx";
const portalPagePath = "app/my-bookings/page.tsx";
const portalInvoicesAdapterPath = "lib/customer-portal-invoices-adapter.ts";
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

const [
  localPdfHelper,
  persistence,
  adminBoundary,
  adminInvoicesRoute,
  adminPdfRoute,
  adminEmailRoute,
  customerInvoicesRoute,
  customerPdfRoute,
  migration,
  customersPage,
  portalPage,
  portalInvoicesAdapter,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(localPdfHelperPath, "utf8"),
  readFile(persistencePath, "utf8"),
  readFile(adminBoundaryPath, "utf8"),
  readFile(adminInvoicesRoutePath, "utf8"),
  readFile(adminPdfRoutePath, "utf8"),
  readFile(adminEmailRoutePath, "utf8"),
  readFile(customerInvoicesRoutePath, "utf8"),
  readFile(customerPdfRoutePath, "utf8"),
  readFile(migrationPath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(portalPagePath, "utf8"),
  readFile(portalInvoicesAdapterPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const customerIssuePanel = sectionBetween(
  customersPage,
  'data-customer-invoice-issue-panel="true"',
  'data-customer-invoice-issued-local-list="true"',
);
const issuedInvoiceTable = sectionBetween(
  customersPage,
  'data-customer-invoice-issued-local-list="true"',
  "</main>",
);
const portalInvoiceSection = sectionBetween(
  portalPage,
  'activeSection === "Invoices"',
  'aria-labelledby="booking-search-title"',
);
const ledgerSection = sectionBetween(
  ledger,
  "### Customer Stored Invoice Record PDF And Portal Folder Lock",
  "\n### ",
);

for (const fragment of [
  "export type CustomerLocalInvoiceRecord = {",
  "export function createCustomerInvoicePdfBytes(",
  "export async function downloadCustomerInvoicePdf(",
  "export type CustomerInvoicePdfLogoImage = {",
  "export function pdfLogoFromJpegBytes(bytes: Uint8Array)",
  "companyProfilePaymentSummary",
  "function pdfRightTextAt(",
  "function pdfRect(",
  "const billToNameLines = wrapText(invoice.customerName, 62).slice(0, 2);",
  "billToNameLines.map((line, index) => pdfTextAt(line, 50, billToY - 17 - index * 12, 9))",
  "const billToExtraLineOffset = (billToNameLines.length - 1) * 12;",
  "const documentTitle =",
  '"INVOICE"',
  '"QUOTATION"',
  '"CREDIT NOTE"',
  "Item & Description",
  "Balance Due",
  "Payment Made",
  "Sub Total",
  "Bank information",
  "Terms & Conditions:",
  "Midnight surcharge: $15 applies from 11:00 PM to 6:59 AM.",
  "Hourly jobs: 15 minutes grace; 16 minutes onward counts as the next hour.",
  "/XObject << /Im1 6 0 R >>",
  "/Subtype /Image",
  "/Filter /DCTDecode",
  "%PDF-1.4",
]) {
  assertIncludes(localPdfHelper, fragment, `PDF helper fragment ${fragment}`);
}

for (const fragment of [
  'const paidInvoice = documentType === "invoice" && invoice.status === "Paid";',
  'const paymentMadeValue = paidInvoice ? `(-) ${sgdAmount}` : "SGD0.00";',
  'const balanceDueValue = paidInvoice ? "SGD0.00" : sgdAmount;',
  'pdfRightTextAt("Payment Made"',
  "pdfRightTextAt(balanceDueValue",
]) {
  assertIncludes(localPdfHelper, fragment, `status-correct PDF fragment ${fragment}`);
}

for (const fragment of [
  'import "server-only";',
  'export const customerInvoiceRecordTableName = "customer_invoice_records";',
  "createCustomerInvoiceRecord(",
  "loadAdminCustomerInvoiceRecords(",
  "updateAdminCustomerInvoiceStatus(",
  "loadAdminCustomerInvoicePdf(",
  "loadCustomerInvoiceRecordsForPortal(",
  "loadCustomerInvoicePdfForPortal(",
  "updateCustomerInvoiceEmailStatus(",
  "checkAdminBookingPersistenceStagingConfigReadiness()",
  "checkCustomerBookingRequestPersistenceConfigReadiness()",
  "createCustomerInvoicePdfBytes(invoiceForPdf, profile, logoImage)",
  "pdf_base64",
  "pdf_sha256",
]) {
  assertIncludes(persistence, fragment, `persistence fragment ${fragment}`);
}

const statusUpdateSection = sectionBetween(
  persistence,
  "export async function updateAdminCustomerInvoiceStatus",
  "\nexport async function loadAdminCustomerInvoicePdf",
);

for (const fragment of [
  "createCustomerInvoicePdfBytes(record, profile, logoImage)",
  "pdf_base64: base64FromBytes(pdfBytes)",
  "pdf_sha256: sha256Hex(pdfBytes)",
]) {
  assertIncludes(statusUpdateSection, fragment, `invoice status PDF refresh fragment ${fragment}`);
}

assertIncludes(persistence, "forbiddenCustomerInvoiceFragments", "persistence forbidden fragment list");
assertIncludes(persistence, "includesForbiddenFragment", "persistence forbidden sanitizer");
assertExcludes(
  persistence,
  "client: CustomerInvoiceClient = createServerClient()",
  "customer invoice persistence eager Supabase client defaults",
);
assertIncludes(
  persistence,
  "const invoiceClient = client ?? createServerClient();",
  "customer invoice persistence lazy Supabase client creation",
);

const emailStatusUpdateSection = sectionBetween(
  persistence,
  "export async function updateCustomerInvoiceEmailStatus",
  "\nexport function sanitizeCustomerInvoiceRecipientEmail",
);

assertIncludes(
  emailStatusUpdateSection,
  "checkAdminBookingPersistenceStagingConfigReadiness()",
  "customer invoice email status persistence readiness guard",
);

for (const fragment of [
  "resolveAdminCustomerInvoiceBoundary(",
  'refererUrl.pathname === "/customers"',
  'refererUrl.pathname.startsWith("/customers/")',
  'request.headers.get("x-prestige-admin-purpose") !== adminBookingPersistencePurpose',
  "serverSessionContextForCustomerInvoice(request)",
]) {
  assertIncludes(adminBoundary, fragment, `admin customer invoice boundary ${fragment}`);
}

for (const fragment of [
  "resolveAdminCustomerInvoiceBoundary(request)",
  "createCustomerInvoiceRecord(await readJsonBody(request), boundary.actor)",
  "loadAdminCustomerInvoiceRecords(boundary.actor)",
  "updateAdminCustomerInvoiceStatus(",
  'export const runtime = "nodejs";',
]) {
  assertIncludes(adminInvoicesRoute, fragment, `admin invoice route ${fragment}`);
}

for (const fragment of [
  "loadAdminCustomerInvoicePdf(params.invoiceNumber, boundary.actor)",
  'Content-Type": result.data.contentType',
  'Content-Disposition": `attachment; filename="${result.data.filename}"`',
]) {
  assertIncludes(adminPdfRoute, fragment, `admin PDF route ${fragment}`);
}

for (const fragment of [
  'const selectedProvider = "resend";',
  "PRESTIGE_CUSTOMER_INVOICE_EMAIL_SEND_ENABLED",
  "PRESTIGE_CUSTOMER_INVOICE_EMAIL_FROM",
  "PRESTIGE_CUSTOMER_INVOICE_EMAIL_RECIPIENT_ALLOWLIST",
  "RESEND_API_KEY",
  "updateCustomerInvoiceEmailStatus(",
  '"blocked"',
  '"sent"',
  "fetch(resendEmailApiUrl",
  "attachments",
]) {
  assertIncludes(adminEmailRoute, fragment, `admin email route ${fragment}`);
}

for (const fragment of [
  "resolveCustomerSavedBookingsBoundary(request)",
  "loadCustomerInvoiceRecordsForPortal(boundary.data)",
  "customerSavedBookingsAuthRequiredResult()",
]) {
  assertIncludes(customerInvoicesRoute, fragment, `customer invoices route ${fragment}`);
}

for (const fragment of [
  "resolveCustomerSavedBookingsBoundary(request)",
  "loadCustomerInvoicePdfForPortal(params.invoiceNumber, boundary.data)",
  'Content-Disposition": `attachment; filename="${result.data.filename}"`',
  "customerSavedBookingsAuthRequiredResult()",
]) {
  assertIncludes(customerPdfRoute, fragment, `customer invoice PDF route ${fragment}`);
}

for (const fragment of [
  "create table if not exists public.customer_invoice_records",
  "invoice_number text not null unique",
  "pdf_base64 text not null",
  "email_delivery_status text not null default 'not_sent'",
  "alter table public.customer_invoice_records enable row level security",
  "revoke all on public.customer_invoice_records from anon",
  "revoke all on public.customer_invoice_records from authenticated",
  "grant select, insert, update, delete on public.customer_invoice_records to service_role",
  "status in ('Paid', 'Unpaid')",
]) {
  assertIncludes(migration, fragment, `customer invoice migration ${fragment}`);
}

for (const fragment of [
  "const adminCustomerInvoicesApiPath = \"/api/admin-customer-invoices\";",
  "const adminCustomerInvoicePdfApiPath = \"/api/admin-customer-invoice-pdf\";",
  "const adminCustomerInvoiceEmailApiPath = \"/api/admin-customer-invoice-email\";",
  "type CustomerDisplayedInvoiceRecord = CustomerLocalInvoiceRecord & {",
  "const [customerInvoiceRecipientEmail, setCustomerInvoiceRecipientEmail] = useState(\"\");",
  "const [customerInvoiceCardPaymentEnabled, setCustomerInvoiceCardPaymentEnabled] = useState(false);",
  "const [customerInvoiceCardFeeApplies, setCustomerInvoiceCardFeeApplies] = useState(false);",
  "function customerInvoiceCardPaymentNote(",
  "appendCustomerInvoiceCardPaymentNote(",
  "data-customer-invoice-recipient-email=\"true\"",
  "data-customer-invoice-card-payment-enabled=\"true\"",
  "data-customer-invoice-card-fee-applies=\"true\"",
  "data-customer-invoice-preview-card-payment=\"true\"",
  "Card payment available on request.",
  "A 10% card processing fee applies when the customer chooses card payment.",
  "fetch(adminCustomerInvoicesApiPath",
  "method: \"POST\"",
  "method: \"PATCH\"",
  "fetch(adminCustomerInvoiceEmailApiPath",
  "downloadStoredCustomerInvoicePdf(issuedInvoice)",
  "Invoice, quotation, and credit note actions create separated stored billing documents with PDF",
  "Draft stays admin-only until issued.",
  "Card checkbox only changes document wording. No",
  "Stripe checkout, payment link, card charge, bank debit, payout, provider job send, or automatic",
  "payment action is created here.",
]) {
  assertIncludes(customersPage, fragment, `customers stored invoice UI ${fragment}`);
}

for (const fragment of [
  "Preview",
  "Previewed",
  "Refresh",
  "Draft",
  "Issue",
  "PDF",
  "Saved",
  "Email",
  "Emailed",
  "Paid",
  "Unpaid",
  "data-customer-invoice-issued-local-status-toggle",
]) {
  assertIncludes(customersPage, fragment, `customers invoice action ${fragment}`);
}

for (const fragment of [
  "const customerBillingDocumentPageSize = 5;",
  "const [customerBillingDocumentPage, setCustomerBillingDocumentPage] = useState(1);",
  "visibleIssuedCustomerInvoices.map",
  'data-customer-invoice-issued-local-pagination="true"',
  'data-customer-invoice-issued-local-prev-page="true"',
  'data-customer-invoice-issued-local-next-page="true"',
]) {
  assertIncludes(customersPage, fragment, `compact billing document pagination ${fragment}`);
}

assertExcludes(
  issuedInvoiceTable,
  "issuedCustomerInvoices.slice(0, 5)",
  "billing documents must not hide older invoices without pager",
);

for (const noisyIssuedActionFragment of [
  "Download PDF",
  "Email Invoice",
  "Email Quotation",
  "Email Credit Note",
  "Mark Unpaid",
  "Convert to Invoice",
]) {
  assertExcludes(
    issuedInvoiceTable,
    noisyIssuedActionFragment,
    "compact issued invoice actions",
  );
}

for (const noisyWorkbenchActionFragment of [
  "Open folder",
  "Save Draft",
  "Refresh Preview",
  "Issue Invoice + PDF",
  "Issue Quote + PDF",
]) {
  assertExcludes(
    customerIssuePanel,
    noisyWorkbenchActionFragment,
    "compact invoice workbench actions",
  );
}

for (const forbiddenFragment of [
  "Send Reminder",
  "cross-device customer portal sync",
  "Local browser invoice record and PDF download only",
]) {
  assertExcludes(customerIssuePanel + issuedInvoiceTable, forbiddenFragment, "obsolete local-only invoice UI");
}

for (const fragment of [
  "const [customerInvoicesLoadState, setCustomerInvoicesLoadState]",
  "const [invoiceDownloadStates, setInvoiceDownloadStates]",
  "loadCustomerPortalInvoiceRecords",
  "fetchCustomerPortalInvoicePdf",
  "downloadPortalInvoice(invoice)",
  "Stored PDF",
  "Stored invoice PDFs appear here when this customer portal session is active.",
  "Sign in to view stored invoice PDFs for this customer account.",
]) {
  assertIncludes(portalPage, fragment, `portal stored invoice fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "Local PDF",
  "local-fallback",
  "readCustomerLocalInvoices",
  "displayLocalInvoice",
  "mergePortalInvoices",
  "prestige-local-invoices-updated",
  "Local PDFs from this Mac",
]) {
  assertExcludes(portalPage, forbiddenFragment, `portal customer invoice local fallback ${forbiddenFragment}`);
}

for (const fragment of [
  "export type CustomerPortalInvoiceRecord = CustomerLocalInvoiceRecord & {",
  'export const customerPortalInvoicesApiPath = "/api/customer-invoices";',
  'export const customerPortalInvoicePdfApiPath = "/api/customer-invoice-pdf";',
  "safePortalInvoiceApiRecords(result.invoices)",
  'credentials: "same-origin"',
  '"x-prestige-customer-purpose": "customer-saved-bookings-read"',
]) {
  assertIncludes(portalInvoicesAdapter, fragment, `portal stored invoice adapter fragment ${fragment}`);
}

for (const fragment of [
  'data-customer-portal-invoice-access-state={customerInvoicesLoadState}',
  'data-customer-portal-invoice-access-summary="true"',
  "Downloading",
  "Downloaded",
  "Try again",
]) {
  assertIncludes(portalInvoiceSection, fragment, `portal stored invoice state fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /\/api\/admin|adminCustomerInvoicesApiPath|adminCustomerInvoiceEmailApiPath/i,
  /driver payout|PayNow payout|payout comparisons|internal admin notes|parser\/debug|mock QA|dev archive/i,
  /loadStripe|new\s+Stripe|paymentIntent|checkout\.sessions/i,
]) {
  assertExcludes(portalInvoiceSection, forbiddenPattern, "customer portal invoice privacy/payment boundary");
}

for (const phrase of [
  "Admin Customers can issue a stored customer invoice from the prepared Unbilled Customers row after the approved amount, due date, folder, and optional customer email are reviewed.",
  "The issue action creates a unique `INV-YYYYMMDD-####` invoice number only at click time, writes one `customer_invoice_records` row with the generated PDF bytes, and starts a PDF download from the stored server record.",
  "The customer portal `Invoices` tab reads only server-stored invoice records under compact `Unpaid` and `Paid` monthly folders when the secure portal session is active; browser-local invoice fallback is not rendered in the customer portal.",
  "The customer portal invoice/PDF reads explicitly send same-origin credentials, keep the secure account session invisible to the page, and show stored/sign-in state plus Downloading/Downloaded/Try again button feedback.",
  "The per-invoice Card payment checkbox is off by default; when enabled it appends customer-facing card payment wording to that invoice line item, with an optional 10% card processing fee note.",
  "Changing the card payment checkbox or card fee note makes the invoice preview stale and blocks issue until admin refreshes the preview.",
  "`Email` is wired behind `PRESTIGE_CUSTOMER_INVOICE_EMAIL_SEND_ENABLED`, `PRESTIGE_EMAIL_PROVIDER=resend`, `PRESTIGE_CUSTOMER_INVOICE_EMAIL_FROM`, optional `PRESTIGE_CUSTOMER_INVOICE_EMAIL_RECIPIENT_ALLOWLIST`, and `RESEND_API_KEY`; closed gates mark the invoice email status blocked and do not call Resend.",
  "The `customer_invoice_records` migration scaffold is service-role only with RLS enabled and no anon/authenticated grants.",
  "This pass does not activate Stripe checkout/payment links, card charges, bank debit, payout, provider job sending, GPS/live location, automatic payment reconciliation, or customer-visible internal/mock/debug data.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation invoice record guard registration");

console.log("Customer stored invoice record PDF portal guard passed");
