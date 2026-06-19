import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packetPath = "docs/admin-monthly-invoice-pdf-generation-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const financeSplitPacketPath =
  "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const monthlyWorkflowLockPath =
  "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
const appPagePath = "app/page.tsx";
const pdfReadinessRoutePath =
  "app/api/admin-monthly-invoice-issue-record-pdf-readiness/route.ts";
const invoiceNumberRoutePath =
  "app/api/admin-monthly-invoice-number-reservations/route.ts";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const readinessRoutePath = "app/api/admin-billing-payment-readiness-preview-setup/route.ts";
const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const guardScript = "scripts/test-admin-monthly-invoice-pdf-generation-approval-packet.mjs";

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

function countOccurrences(source, fragment) {
  return source.split(fragment).length - 1;
}

function sectionBetween(source, startHeading, nextHeadingPattern = /\n(?:##|###) /g) {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);

  nextHeadingPattern.lastIndex = start + startHeading.length;
  const next = nextHeadingPattern.exec(source);

  return next ? source.slice(start, next.index) : source.slice(start);
}

async function listFiles(root) {
  const entries = await readdir(root, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

const [
  packet,
  ledger,
  docsIndex,
  preactivationSuite,
  financeSplitPacket,
  monthlyWorkflowLock,
  appPage,
  pdfReadinessRoute,
  invoiceNumberRoute,
  readinessHelper,
  auditPayloadHelper,
  readinessRoute,
  disabledActionRoute,
  aiParseRoute,
  adminSavedBookingsRoute,
] = await Promise.all([
  readFile(packetPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(financeSplitPacketPath, "utf8"),
  readFile(monthlyWorkflowLockPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(pdfReadinessRoutePath, "utf8"),
  readFile(invoiceNumberRoutePath, "utf8"),
  readFile(readinessHelperPath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
  readFile(readinessRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Monthly Invoice PDF Generation Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime implementation",
    "actual PDF generation",
    "Admin Monthly Invoice PDF Generation is a future finance sub-lane.",
    "explicit owner approval names this exact PDF-generation-only lane",
    "PDF generation is separate from:",
    "Invoice number reservation.",
    "Invoice sending.",
    "Payment links/provider.",
    "Payment recording.",
    "Payout/accounting/export.",
    "PDF generation must not be bundled with invoice sending",
    "Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only.",
    "`data-admin-monthly-invoice-number-reservation-action`",
    "`data-admin-monthly-invoice-pdf-readiness-action`",
    "`/api/admin-monthly-invoice-number-reservations`",
    "`/api/admin-monthly-invoice-issue-record-pdf-readiness`",
    "`admin-billing-payment-readiness-preview-setup`",
    "`admin-billing-payment-action-disabled-setup`",
    "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.",
    "Exact staging target and commit hash proof.",
    "PDF format decision.",
    "Included invoice row decision.",
    "Tax/GST handling decision.",
    "Admin-only access boundary proof.",
    "Storage, access, and retention decision.",
    "Rollback and kill-switch proof.",
    "One bounded evidence window.",
    "Env gate names only, with no env values or secrets printed.",
    "Future PDF generation approval must not imply:",
    "Payment link creation.",
    "Customer email, WhatsApp, or SMS sending.",
    "Provider live send.",
    "Billing automation writes.",
    "Each of those remains a separate finance sub-lane requiring later explicit owner approval.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "This packet does not approve PDF file creation",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `PDF generation approval packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation is approved",
  "actual PDF generation is approved",
  "safe to generate PDFs now",
  "invoice sending is approved",
  "payment links are approved",
  "payment provider is approved",
  "payment recording is approved",
  "payout automation is approved",
  "billing automation is approved",
  "DB writes are approved",
]) {
  assertExcludes(packet, forbiddenApprovalPhrase, `Forbidden packet approval phrase ${forbiddenApprovalPhrase}`);
  assertExcludes(ledgerSection, forbiddenApprovalPhrase, `Forbidden ledger approval phrase ${forbiddenApprovalPhrase}`);
}

for (const fragment of [
  "Future finance runtime work must be split into exactly one separately approved sub-lane per task",
  "Invoice number reservation readiness.",
  "PDF generation.",
  "Invoice sending/delivery.",
  "Payment links/provider.",
  "Manual payment record/reconciliation.",
  "Payout/accounting/finance export.",
  "Before PDF generation, owner approval must define invoice/statement format",
]) {
  assertIncludes(financeSplitPacket, fragment, `Finance split packet PDF-lane fragment: ${fragment}`);
}

for (const fragment of [
  "Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only.",
  "Existing invoice-number reservation stays on `data-admin-monthly-invoice-number-reservation-action`.",
  "Existing PDF-readiness review stays on `data-admin-monthly-invoice-pdf-readiness-action`.",
]) {
  assertIncludes(packet, fragment, `PDF readiness-only wording: ${fragment}`);
}

for (const fragment of [
  'data-admin-monthly-invoice-number-reservation-action="true"',
  'data-admin-monthly-invoice-pdf-readiness-action="true"',
  '"/api/admin-monthly-invoice-number-reservations";',
  '"/api/admin-monthly-invoice-issue-record-pdf-readiness";',
]) {
  assertIncludes(appPage, fragment, `Existing app PDF readiness/number reservation fragment: ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-monthly-invoice-number-reservation-action="true"', 1],
  ['data-admin-monthly-invoice-pdf-readiness-action="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing monthly invoice readiness control for ${fragment}.`,
  );
}

for (const fragment of [
  "A reserved invoice number on a locked issue record is the prerequisite for PDF-review readiness.",
  "This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.",
]) {
  assertIncludes(monthlyWorkflowLock, fragment, `Monthly workflow lock readiness fragment: ${fragment}`);
}

for (const [label, source] of [
  ["PDF-readiness route", pdfReadinessRoute],
  ["invoice-number reservation route", invoiceNumberRoute],
]) {
  assertIncludes(source, "resolveAdminDispatcherBoundary", `${label} admin boundary`);
  assertIncludes(source, "adminBookingPersistencePurpose", `${label} admin purpose`);
  assertIncludes(source, "blockedResponse(boundary.error)", `${label} blocked boundary response`);
  assertIncludes(source, "safeFailureResponse()", `${label} safe failure response`);
  assertExcludes(
    source,
    /pdfkit|jspdf|puppeteer|playwright|PDFDocument|generatePdf|renderTo(Stream|Buffer)|createPdf|html2pdf/i,
    `${label} actual PDF generation`,
  );
  assertExcludes(
    source,
    /sendInvoice|sendMail|messages\.create|client\.messages|checkout\.sessions|paymentIntent|paymentLink|payoutTransfer|paynowTransfer/i,
    `${label} sends/payments/payouts`,
  );
}

for (const fragment of [
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "invoice_pdf_generation: \"blocked\"",
  "invoice_sending: \"blocked\"",
  "payment_links: \"blocked\"",
  "payout_automation: \"blocked\"",
  "production_auto_billing: \"blocked\"",
  "invoice_pdf_generation_approval",
]) {
  assertIncludes(readinessHelper, fragment, `Billing/payment setup blocked PDF fragment: ${fragment}`);
}

for (const fragment of [
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "auditWriteEnabled: false",
  "external_send: false",
  "no_op: true",
  "\"invoice_pdf\"",
]) {
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit payload blocked PDF fragment: ${fragment}`);
}

for (const [label, source] of [
  ["billing/payment readiness route", readinessRoute],
  ["billing/payment disabled action route", disabledActionRoute],
]) {
  assertIncludes(source, "export async function GET", `${label} setup GET route`);
  assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${label} write method`);
  assertExcludes(source, /pdfkit|jspdf|PDFDocument|generatePdf|sendInvoice|checkout\.sessions|paymentIntent|payoutTransfer|paynowTransfer/i, `${label} live finance action`);
}

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parser route", aiParseRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, guardScript, `${label} docs/test guard runtime wiring`);
  assertExcludes(source, packetPath, `${label} docs/test packet runtime wiring`);
  assertExcludes(source, "admin-monthly-invoice-pdf-generation-approval-packet", `${label} PDF packet runtime wiring`);
}

const runtimeFiles = [
  ...(await listFiles("app/api")),
  ...(await listFiles("lib")),
].filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));

for (const file of runtimeFiles) {
  const source = await readFile(file, "utf8");

  assertExcludes(source, packetPath, `${file} packet path runtime reference`);
  assertExcludes(source, guardScript, `${file} guard script runtime reference`);
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Invoice PDF Generation Approval Packet](admin-monthly-invoice-pdf-generation-approval-packet.md)",
  "Docs index PDF generation approval packet entry",
);
assertIncludes(preactivationSuite, guardScript, "Preactivation suite PDF generation approval guard registration");
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-monthly-invoice-pdf-generation-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger PDF generation approval packet registration wording",
);
assertIncludes(
  ledger,
  "Admin monthly invoice PDF generation approval/readiness is now docs/test guard-locked",
  "Ledger backlog PDF generation approval packet source-of-truth wording",
);

console.log("admin monthly invoice PDF generation approval packet guard passed");
