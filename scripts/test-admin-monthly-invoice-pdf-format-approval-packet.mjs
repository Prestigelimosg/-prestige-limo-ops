import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packetPath = "docs/admin-monthly-invoice-pdf-format-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const financeSplitPacketPath =
  "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const pdfGenerationPacketPath =
  "docs/admin-monthly-invoice-pdf-generation-approval-packet.md";
const prefixSequencePacketPath =
  "docs/admin-monthly-invoice-number-prefix-sequence-approval-packet.md";
const sendingDeliveryPacketPath =
  "docs/admin-monthly-invoice-sending-delivery-approval-packet.md";
const monthlyWorkflowLockPath =
  "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
const regularBillingPlanPath = "docs/regular-customer-monthly-billing-workflow-plan.md";
const appPagePath = "app/page.tsx";
const invoiceNumberRoutePath =
  "app/api/admin-monthly-invoice-number-reservations/route.ts";
const pdfReadinessRoutePath =
  "app/api/admin-monthly-invoice-issue-record-pdf-readiness/route.ts";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const readinessRoutePath = "app/api/admin-billing-payment-readiness-preview-setup/route.ts";
const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const guardScript = "scripts/test-admin-monthly-invoice-pdf-format-approval-packet.mjs";

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
  pdfGenerationPacket,
  prefixSequencePacket,
  sendingDeliveryPacket,
  monthlyWorkflowLock,
  regularBillingPlan,
  appPage,
  invoiceNumberRoute,
  pdfReadinessRoute,
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
  readFile(pdfGenerationPacketPath, "utf8"),
  readFile(prefixSequencePacketPath, "utf8"),
  readFile(sendingDeliveryPacketPath, "utf8"),
  readFile(monthlyWorkflowLockPath, "utf8"),
  readFile(regularBillingPlanPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(invoiceNumberRoutePath, "utf8"),
  readFile(pdfReadinessRoutePath, "utf8"),
  readFile(readinessHelperPath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
  readFile(readinessRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Monthly Invoice PDF Format Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime invoice format implementation",
    "Admin Monthly Invoice PDF Format is a future finance decision sub-lane.",
    "explicit owner approval names this exact invoice/PDF-format-only lane",
    "Invoice/PDF format approval is separate from:",
    "Invoice number reservation.",
    "Customer/company prefix and running-number policy.",
    "PDF generation.",
    "Invoice sending/delivery.",
    "Payment links/provider.",
    "Manual payment record/reconciliation.",
    "Payout/accounting/export.",
    "Billing automation.",
    "Invoice/PDF format approval must not be bundled with runtime invoice creation",
    "Future invoice/PDF format approval requires explicit owner decisions for:",
    "Invoice versus statement naming.",
    "Header, footer, logo, company registration, and contact display.",
    "Invoice-number placement and reserved-number reference.",
    "Billing customer/company identity snapshot.",
    "Billing month and trip grouping display.",
    "Included row rules.",
    "Trip snapshot fields.",
    "Booking reference, service type, pickup, dropoff, date, time, vehicle, and passenger display.",
    "Rate, charge, adjustment, credit, waiting time, and discount display.",
    "Currency and rounding rules.",
    "Tax/GST treatment, including explicit no-GST wording if applicable.",
    "Payment terms and bank-transfer instruction reference.",
    "Internal-only fields to exclude.",
    "Customer-visible fields allowed.",
    "Driver-visible exclusion proof.",
    "Staff review and approval steps before generation.",
    "Generated-file name pattern, access, storage, retention, and redaction policy for any later PDF generation lane.",
    "`data-admin-monthly-invoice-number-reservation-action`",
    "`data-admin-monthly-invoice-pdf-readiness-action`",
    "`/api/admin-monthly-invoice-number-reservations`",
    "`/api/admin-monthly-invoice-issue-record-pdf-readiness`",
    "Existing finance setup routes stay setup-only and blocked/no-live",
    "Existing PDF generation approval remains separate and must treat this format packet as a prerequisite decision packet, not as generation approval.",
    "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.",
    "Exact staging target and commit hash proof.",
    "The one named finance sub-lane being opened.",
    "Admin/dispatcher/finance role-boundary proof.",
    "Customer and driver privacy proof.",
    "Table, storage, and access-policy proof for only the named sub-lane.",
    "Rollback and kill-switch proof.",
    "One bounded evidence window.",
    "Env gate names only, with no env values or secrets printed.",
    "Future invoice/PDF format approval must not imply:",
    "Invoice creation.",
    "Invoice number assignment or sequence increment.",
    "PDF generation.",
    "PDF storage.",
    "Invoice sending/delivery.",
    "Customer email, WhatsApp, or SMS sending.",
    "Provider live send.",
    "Payment link creation.",
    "Payment provider activation.",
    "Payment recording.",
    "Customer portal billing/payment activation.",
    "Payout/accounting/export.",
    "Billing automation writes.",
    "Each of those remains a separate finance sub-lane requiring later explicit owner approval.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "This packet does not approve runtime invoice format implementation",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `Invoice/PDF format packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime invoice format implementation is approved",
  "invoice creation is approved",
  "PDF generation is approved",
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
  assertExcludes(
    ledgerSection,
    forbiddenApprovalPhrase,
    `Forbidden ledger approval phrase ${forbiddenApprovalPhrase}`,
  );
}

for (const fragment of [
  "Future finance runtime work must be split into exactly one separately approved sub-lane per task",
  "Invoice/PDF format approval.",
  "Before PDF generation, owner approval must define invoice/statement format",
  "included rows",
  "tax/GST treatment",
  "generated-file access/storage",
  "private driver payout",
]) {
  assertIncludes(financeSplitPacket, fragment, `Finance split format fragment: ${fragment}`);
}

for (const fragment of [
  "Future runtime PDF generation requires explicit owner approval with:",
  "PDF format decision.",
  "Included invoice row decision.",
  "Tax/GST handling decision.",
  "Storage, access, and retention decision.",
]) {
  assertIncludes(pdfGenerationPacket, fragment, `PDF generation packet format prerequisite: ${fragment}`);
}

for (const fragment of [
  "Customer/company invoice prefix and running-number policy is separate from:",
  "PDF generation.",
  "Invoice sending.",
]) {
  assertIncludes(prefixSequencePacket, fragment, `Prefix sequence split fragment: ${fragment}`);
}

for (const fragment of [
  "PDF generation approval must not imply invoice sending/delivery approval.",
  "Payment links/provider approval must not be bundled into invoice sending/delivery approval.",
]) {
  assertIncludes(sendingDeliveryPacket, fragment, `Sending delivery split fragment: ${fragment}`);
}

for (const fragment of [
  "The owner must approve invoice/statement format, numbering rules, included row rules, tax/GST treatment if any, adjustment rules, and staff review steps.",
  "Before any invoice or PDF generation: invoice format, included rows, snapshots, tax/GST treatment if any, amendments, staff review, private-data exclusion, and generated-file access rules must be approved and protected by tests.",
]) {
  assertIncludes(regularBillingPlan, fragment, `Regular billing plan format decision fragment: ${fragment}`);
}

for (const fragment of [
  "A reserved invoice number on a locked issue record is the prerequisite for PDF-review readiness.",
  "This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.",
]) {
  assertIncludes(monthlyWorkflowLock, fragment, `Monthly workflow no-generation sequencing fragment: ${fragment}`);
}

for (const fragment of [
  'data-admin-monthly-invoice-number-reservation-action="true"',
  'data-admin-monthly-invoice-pdf-readiness-action="true"',
  '"/api/admin-monthly-invoice-number-reservations";',
  '"/api/admin-monthly-invoice-issue-record-pdf-readiness";',
]) {
  assertIncludes(appPage, fragment, `Existing app invoice readiness fragment: ${fragment}`);
}

for (const [fragment, expectedCount] of [
  ['data-admin-monthly-invoice-number-reservation-action="true"', 1],
  ['data-admin-monthly-invoice-pdf-readiness-action="true"', 1],
]) {
  assert.equal(
    countOccurrences(appPage, fragment),
    expectedCount,
    `Expected exactly one existing monthly invoice control for ${fragment}.`,
  );
}

assertExcludes(
  appPage,
  /data-admin-monthly-invoice-(pdf-format|invoice-format|format-approval)|approveInvoiceFormat|saveInvoiceFormat/i,
  "app/page.tsx duplicate invoice/PDF format UI/control",
);

for (const [label, source] of [
  ["invoice-number reservation route", invoiceNumberRoute],
  ["PDF-readiness route", pdfReadinessRoute],
]) {
  assertIncludes(source, "resolveAdminDispatcherBoundary", `${label} admin boundary`);
  assertIncludes(source, "safeFailureResponse()", `${label} safe failure response`);
  assertExcludes(
    source,
    /pdfkit|jspdf|PDFDocument|generatePdf|createPdf|renderTo(Stream|Buffer)|html2pdf|sendInvoice|sendMail|messages\.create|client\.messages|checkout\.sessions|paymentIntent|paymentLink|payoutTransfer|paynowTransfer/i,
    `${label} generation/sends/payments/payouts`,
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
  assertIncludes(readinessHelper, fragment, `Billing/payment setup blocked format/PDF fragment: ${fragment}`);
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
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit blocked format/PDF fragment: ${fragment}`);
}

for (const [label, source] of [
  ["billing/payment readiness route", readinessRoute],
  ["billing/payment disabled action route", disabledActionRoute],
]) {
  assertIncludes(source, "export async function GET", `${label} setup GET route`);
  assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${label} write method`);
  assertExcludes(
    source,
    /pdfkit|jspdf|PDFDocument|generatePdf|sendInvoice|checkout\.sessions|paymentIntent|payoutTransfer|paynowTransfer/i,
    `${label} live finance action`,
  );
}

const runtimeFiles = [
  ...(await listFiles("app/api")),
  ...(await listFiles("lib")),
].filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));

for (const file of runtimeFiles) {
  const source = await readFile(file, "utf8");

  assertExcludes(source, packetPath, `${file} packet path runtime reference`);
  assertExcludes(source, guardScript, `${file} guard script runtime reference`);
  assertExcludes(
    source,
    /admin-monthly-invoice-(pdf-format|invoice-format|format-approval)/i,
    `${file} invoice/PDF format runtime route/helper`,
  );
}

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parser route", aiParseRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, guardScript, `${label} docs/test guard runtime wiring`);
  assertExcludes(source, packetPath, `${label} docs/test packet runtime wiring`);
  assertExcludes(
    source,
    "admin-monthly-invoice-pdf-format-approval-packet",
    `${label} invoice/PDF format packet runtime wiring`,
  );
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Invoice PDF Format Approval Packet](admin-monthly-invoice-pdf-format-approval-packet.md)",
  "Docs index invoice/PDF format approval packet entry",
);
assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite invoice/PDF format approval guard registration",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-monthly-invoice-pdf-format-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger invoice/PDF format approval packet registration wording",
);
assertIncludes(
  ledger,
  "Admin monthly invoice PDF format approval/readiness is now docs/test guard-locked",
  "Ledger backlog invoice/PDF format source-of-truth wording",
);

console.log("admin monthly invoice PDF format approval packet guard passed");
