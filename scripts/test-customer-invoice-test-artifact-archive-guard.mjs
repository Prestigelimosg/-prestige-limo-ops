import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const persistencePath = "lib/customer-invoice-record-persistence.ts";
const routePath = "app/api/admin-customer-invoices/route.ts";
const customersPagePath = "app/customers/page.tsx";
const localInvoicesPath = "lib/customer-local-invoices.ts";
const portalInvoicesRoutePath = "app/api/customer-invoices/route.ts";
const portalPdfRoutePath = "app/api/customer-invoice-pdf/[invoiceNumber]/route.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-customer-invoice-test-artifact-archive-guard.mjs";

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
  persistence,
  route,
  customersPage,
  localInvoices,
  portalInvoicesRoute,
  portalPdfRoute,
  ledger,
  preactivationSuite,
] = await Promise.all([
  readFile(persistencePath, "utf8"),
  readFile(routePath, "utf8"),
  readFile(customersPagePath, "utf8"),
  readFile(localInvoicesPath, "utf8"),
  readFile(portalInvoicesRoutePath, "utf8"),
  readFile(portalPdfRoutePath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

const archiveFunction = sectionBetween(
  persistence,
  "export async function archiveAdminCustomerTestInvoiceArtifact",
  "\nexport async function loadAdminCustomerInvoicePdf",
);
const customerIssuedTable = sectionBetween(
  customersPage,
  'data-customer-invoice-issued-local-list="true"',
  "</main>",
);
const ledgerSection = sectionBetween(
  ledger,
  "### Production Test Invoice Archive Cleanup",
  "\n### ",
);

for (const fragment of [
  'export const customerInvoiceTestArtifactArchiveAction = "archive_test_invoice";',
  "archiveAdminCustomerTestInvoiceArtifact(",
  "approvedCustomerTestInvoiceArchiveTargets",
  'invoiceNumber: "INV-20260702-0001"',
  'bookingReference: "ADM-20260702061357"',
  'customerId: "64"',
  "Codex Live Ops Account 20260702141102 Pte Ltd [Codex Traveler 20260702141102]",
  "ARCHIVE TEST INVOICE INV-20260702-0001 ADM-20260702061357",
  "archivedCustomerTestInvoiceReason",
]) {
  assertIncludes(persistence, fragment, `archive persistence fragment ${fragment}`);
}

for (const fragment of [
  'document_state: "draft"',
  "credit_note_reason: archivedCustomerTestInvoiceReason",
  '.eq("invoice_number", target.invoiceNumber)',
  '.eq("reference", target.bookingReference)',
  '.eq("customer_id", target.customerId)',
  '.eq("customer_name", target.customerName)',
  '.eq("amount_cents", target.amountCents)',
  '.eq("document_type", "invoice")',
  '.eq("document_state", "issued")',
  '.eq("status", "Unpaid")',
  "existingRecord.status !== \"Unpaid\"",
]) {
  assertIncludes(archiveFunction, fragment, `archive helper fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /\.delete\s*\(/i,
  /status:\s*"Paid"/,
  /createCustomerInvoiceRecord/,
  /fetch\s*\(/,
  /RESEND_API_KEY|PRESTIGE_CUSTOMER_INVOICE_EMAIL_SEND_ENABLED|api\.telegram\.org|twilio|whatsapp|sms/i,
  /Stripe|paymentIntent|checkout\.sessions|payout|provider job send/i,
]) {
  assertExcludes(archiveFunction, forbiddenPattern, "archive helper no-delete/no-send/no-payment boundary");
}

for (const fragment of [
  "archiveAdminCustomerTestInvoiceArtifact",
  "customerInvoiceTestArtifactArchiveAction",
  "isArchiveTestArtifactAction",
  "archived: isArchiveTestArtifactAction",
]) {
  assertIncludes(route, fragment, `admin invoice route archive branch ${fragment}`);
}

for (const fragment of [
  "removeCustomerLocalInvoice(",
  "removeCustomerLocalInvoice(invoice.invoiceNumber)",
  "writeCustomerLocalInvoices(",
]) {
  assertIncludes(localInvoices + customersPage, fragment, `local cleanup fragment ${fragment}`);
}

for (const fragment of [
  'const customerInvoiceTestArtifactArchiveAction = "archive_test_invoice";',
  "approvedCustomerTestInvoiceArchiveTarget",
  "isApprovedCustomerTestInvoiceArchiveCandidate(invoice)",
  "isArchivedCustomerTestInvoiceRecord(record)",
  "activeCustomerInvoiceRecords(",
  "archivedCustomerTestInvoiceReferences",
  "setArchivedCustomerTestInvoiceReferences(archivedReferences)",
  "suppressedInvoiceReferences",
  "window.confirm(",
  "archiveCustomerTestInvoiceArtifact(invoice)",
  'data-customer-invoice-issued-local-archive-test={invoice.invoiceNumber}',
  "hidden from active billing and the customer portal",
  "the stored record was not deleted or marked paid",
]) {
  assertIncludes(customersPage, fragment, `compact Customers archive UI fragment ${fragment}`);
}

for (const forbiddenFragment of [
  "Void Invoice",
  "Delete Invoice",
  "Delete",
  "Archive Test Invoice",
]) {
  assertExcludes(customerIssuedTable, forbiddenFragment, "compact archive UI wording");
}

assertIncludes(customerIssuedTable, "Archive", "compact archive button label");
assertIncludes(persistence, '.eq("document_state", "issued")', "portal issued-only server filter");
assertIncludes(portalInvoicesRoute, "loadCustomerInvoiceRecordsForPortal(boundary.data)", "portal invoice route uses guarded helper");
assertIncludes(portalPdfRoute, "loadCustomerInvoicePdfForPortal(params.invoiceNumber, boundary.data)", "portal pdf route uses guarded helper");

for (const phrase of [
  "The cleanup is scoped to exact production acceptance proof `INV-20260702-0001` / `ADM-20260702061357` / customer id `64` only.",
  "The admin-only action reuses the existing `customer_invoice_records.document_state` lifecycle and moves that exact issued invoice to `draft` with a safe audit reason instead of deleting the row, marking it paid, creating a credit note, or changing payment state.",
  "Customer portal invoice and PDF reads already require `document_state = issued`, so the archived test artifact is hidden from customer portal invoice folders and customer PDF downloads.",
  "The compact Customers billing document row exposes only a small `Archive` button for that exact safe test invoice, after admin confirmation.",
  "Active unbilled detection keeps the exact archived test booking reference suppressed without counting the archived invoice as an active issued billing document, so the old acceptance artifact does not return to daily unbilled work or inflate active invoice totals.",
  "No DB schema change, raw SQL, Supabase CLI, Vercel CLI, Stripe/payment, payout, provider, email, SMS, WhatsApp, Telegram, GPS/live-location, booking, or calendar behavior changed.",
  "Guard coverage lives in `scripts/test-customer-invoice-test-artifact-archive-guard.mjs` and is registered in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation test invoice archive guard registration");

console.log("Customer invoice test artifact archive guard passed");
