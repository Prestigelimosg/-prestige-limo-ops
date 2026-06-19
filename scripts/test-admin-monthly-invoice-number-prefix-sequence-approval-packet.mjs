import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packetPath =
  "docs/admin-monthly-invoice-number-prefix-sequence-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const financeSplitPacketPath =
  "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const pdfGenerationPacketPath =
  "docs/admin-monthly-invoice-pdf-generation-approval-packet.md";
const monthlyWorkflowLockPath =
  "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
const appPagePath = "app/page.tsx";
const invoiceNumberRoutePath =
  "app/api/admin-monthly-invoice-number-reservations/route.ts";
const invoiceNumberHelperPath = "lib/admin-monthly-invoice-number-reservation.ts";
const pdfReadinessRoutePath =
  "app/api/admin-monthly-invoice-issue-record-pdf-readiness/route.ts";
const issueRecordHelperPath = "lib/admin-monthly-invoice-issue-record-persistence.ts";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const readinessRoutePath = "app/api/admin-billing-payment-readiness-preview-setup/route.ts";
const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const sequenceMigrationPath =
  "supabase/migrations/202606080006_monthly_invoice_number_sequence_foundation.sql";
const sequenceFixMigrationPath =
  "supabase/migrations/202606090001_fix_monthly_invoice_number_reservation_function.sql";
const guardScript =
  "scripts/test-admin-monthly-invoice-number-prefix-sequence-approval-packet.mjs";

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

  if (typeof nextHeadingPattern === "string") {
    const next = source.indexOf(nextHeadingPattern, start + startHeading.length);

    return next === -1 ? source.slice(start) : source.slice(start, next);
  }

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
  monthlyWorkflowLock,
  appPage,
  invoiceNumberRoute,
  invoiceNumberHelper,
  pdfReadinessRoute,
  issueRecordHelper,
  readinessHelper,
  auditPayloadHelper,
  readinessRoute,
  disabledActionRoute,
  aiParseRoute,
  adminSavedBookingsRoute,
  sequenceMigration,
  sequenceFixMigration,
] = await Promise.all([
  readFile(packetPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(financeSplitPacketPath, "utf8"),
  readFile(pdfGenerationPacketPath, "utf8"),
  readFile(monthlyWorkflowLockPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(invoiceNumberRoutePath, "utf8"),
  readFile(invoiceNumberHelperPath, "utf8"),
  readFile(pdfReadinessRoutePath, "utf8"),
  readFile(issueRecordHelperPath, "utf8"),
  readFile(readinessHelperPath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
  readFile(readinessRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(sequenceMigrationPath, "utf8"),
  readFile(sequenceFixMigrationPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Monthly Invoice Number Prefix Sequence Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime invoice number generation",
    "Admin Monthly Invoice Customer Prefix Running Number is a future finance sub-lane.",
    "explicit owner approval names this exact customer/company prefix and running-number lane",
    "Customer/company invoice prefix and running-number policy is separate from:",
    "PDF generation.",
    "Invoice sending.",
    "Payment links/provider.",
    "Payment recording.",
    "Payout/accounting/export.",
    "Billing automation.",
    "Admin sets and approves a unique invoice prefix code for each billing customer/company.",
    "Future runtime may auto-generate the next running invoice number for that billing customer/company only when invoice-number reservation is explicitly approved through the existing reservation boundary.",
    "Draft invoices, previews, grouping, billing preparation, and PDF-readiness review must not assign final invoice numbers.",
    "PDF generation later must use an already-reserved invoice number.",
    "Prefixes are admin-controlled and unique per billing customer/company.",
    "Running sequences are scoped to the billing customer/company.",
    "Future implementation must prevent duplicate invoice numbers with transaction-safe unique-constraint proof.",
    "Future implementation must never reuse voided or cancelled invoice numbers.",
    "Customer/company name changes must not silently change the assigned prefix.",
    "Invoice number format requires explicit owner decision before runtime, including whether to use `PREFIX-0001` or `PREFIX-YYYY-0001`.",
    "Yearly reset versus lifetime running sequence requires explicit owner decision before runtime.",
    "`data-admin-monthly-invoice-number-reservation-action`",
    "`/api/admin-monthly-invoice-number-reservations`",
    "`reserve_monthly_invoice_number_for_issue_record`",
    "`data-admin-monthly-invoice-pdf-readiness-action`",
    "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.",
    "Existing finance setup routes stay setup-only and blocked/no-live",
    "Exact staging target and commit hash proof.",
    "Table and policy proof for the customer/company prefix and sequence tables only.",
    "Admin-only boundary proof.",
    "Transaction and unique-constraint proof.",
    "Duplicate prevention proof.",
    "Voided/cancelled invoice number non-reuse proof.",
    "Customer/company rename prefix immutability proof.",
    "Invoice number format decision.",
    "Yearly reset versus lifetime sequence decision.",
    "Rollback and kill-switch proof.",
    "One bounded evidence window.",
    "Env gate names only, with no env values or secrets printed.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "Future invoice-number runtime work must prove customer/driver public surfaces cannot expose finance/internal/payout fields.",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `Prefix sequence approval packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime invoice number generation is approved",
  "invoice prefix writes are approved",
  "sequence writes are approved",
  "safe to assign invoice numbers now",
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
  "Invoice number reservation readiness.",
  "Invoice/PDF format approval.",
  "PDF generation.",
  "Invoice sending/delivery.",
  "Payment links/provider.",
  "Manual payment record/reconciliation.",
  "Payout/accounting/finance export.",
]) {
  assertIncludes(financeSplitPacket, fragment, `Finance split packet lane fragment: ${fragment}`);
}

for (const fragment of [
  "PDF generation is separate from:",
  "Invoice number reservation.",
  "Existing invoice-number reservation and PDF-readiness review controls remain readiness/review only.",
]) {
  assertIncludes(pdfGenerationPacket, fragment, `PDF generation packet reservation split: ${fragment}`);
}

for (const fragment of [
  "A saved issue review is the prerequisite for issue record creation.",
  "A locked draft issue record is the prerequisite for invoice-number reservation.",
  "A reserved invoice number on a locked issue record is the prerequisite for PDF-review readiness.",
  "This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.",
]) {
  assertIncludes(monthlyWorkflowLock, fragment, `Monthly workflow lock sequence fragment: ${fragment}`);
}

for (const fragment of [
  'data-admin-monthly-invoice-number-reservation-action="true"',
  'data-admin-monthly-invoice-pdf-readiness-action="true"',
  '"/api/admin-monthly-invoice-number-reservations";',
  '"/api/admin-monthly-invoice-issue-record-pdf-readiness";',
]) {
  assertIncludes(appPage, fragment, `Existing app invoice number/PDF readiness fragment: ${fragment}`);
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

const pdfReadinessStateBlock = sectionBetween(
  appPage,
  "const monthlyInvoicePdfReadinessDisabled =",
  "const monthlyBillingMonthGroupingLocalNoteDetail =",
);
assertIncludes(
  pdfReadinessStateBlock,
  'monthlyInvoiceIssueRecordPrimaryRecord.invoice_number_status !== "reserved"',
  "PDF readiness requires reserved invoice number status",
);
assertIncludes(
  pdfReadinessStateBlock,
  "!clean(monthlyInvoiceIssueRecordPrimaryRecord.invoice_number)",
  "PDF readiness requires an existing invoice number",
);
assertExcludes(
  pdfReadinessStateBlock,
  "reserveAdminMonthlyInvoiceNumberForIssueRecord(",
  "PDF readiness review must not reserve or assign invoice numbers",
);

for (const fragment of [
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "blockedResponse(boundary.error)",
  "safeFailureResponse()",
  "export async function POST",
]) {
  assertIncludes(invoiceNumberRoute, fragment, `Invoice number reservation route boundary: ${fragment}`);
  assertIncludes(pdfReadinessRoute, fragment, `PDF readiness route boundary: ${fragment}`);
}

for (const fragment of [
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "reserve_monthly_invoice_number_for_issue_record",
  "p_invoice_prefix: input.invoice_prefix",
  "p_customer_account: input.customer_account",
  "p_issue_record_id: input.issue_record_id",
  "new RegExp(`^${invoicePrefix}-[0-9]{4,}$`).test(invoiceNumber)",
]) {
  assertIncludes(invoiceNumberHelper, fragment, `Invoice number reservation helper fragment: ${fragment}`);
}

for (const fragment of [
  "customer_invoice_sequences_account_key",
  "customer_invoice_sequences_prefix_key",
  "monthly_invoice_issue_records_prefix_sequence_key",
  "alter table public.customer_invoice_sequences enable row level security",
  "reserve_monthly_invoice_number_for_issue_record",
  "for update",
  "invoice_prefix_mismatch",
  "lpad(v_sequence_number::text, 4, '0')",
]) {
  assertIncludes(
    `${sequenceMigration}\n${sequenceFixMigration}`,
    fragment,
    `Invoice sequence migration proof: ${fragment}`,
  );
}

for (const [label, source] of [
  ["invoice-number reservation route", invoiceNumberRoute],
  ["invoice-number reservation helper", invoiceNumberHelper],
  ["PDF-readiness route", pdfReadinessRoute],
  ["issue-record helper", issueRecordHelper],
]) {
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
]) {
  assertIncludes(readinessHelper, fragment, `Billing/payment setup blocked fragment: ${fragment}`);
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
]) {
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit blocked fragment: ${fragment}`);
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

const appApiFiles = (await listFiles("app/api")).filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
const libFiles = (await listFiles("lib")).filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));
const runtimeFiles = [...appApiFiles, ...libFiles];
const reservationRpcRuntimeFiles = [];

for (const file of runtimeFiles) {
  const source = await readFile(file, "utf8");

  assertExcludes(source, packetPath, `${file} packet path runtime reference`);
  assertExcludes(source, guardScript, `${file} guard script runtime reference`);

  if (source.includes("reserve_monthly_invoice_number_for_issue_record")) {
    reservationRpcRuntimeFiles.push(file);
  }
}

assert.deepEqual(
  reservationRpcRuntimeFiles.sort(),
  [invoiceNumberHelperPath].sort(),
  "Only the existing invoice-number reservation helper may reference the reservation RPC.",
);

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parser route", aiParseRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, guardScript, `${label} docs/test guard runtime wiring`);
  assertExcludes(source, packetPath, `${label} docs/test packet runtime wiring`);
  assertExcludes(
    source,
    "admin-monthly-invoice-number-prefix-sequence-approval-packet",
    `${label} prefix sequence packet runtime wiring`,
  );
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Invoice Number Prefix Sequence Approval Packet](admin-monthly-invoice-number-prefix-sequence-approval-packet.md)",
  "Docs index prefix sequence approval packet entry",
);
assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite prefix sequence approval guard registration",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-monthly-invoice-number-prefix-sequence-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger prefix sequence approval packet registration wording",
);
assertIncludes(
  ledger,
  "Admin monthly invoice customer/company prefix running-number approval/readiness is now docs/test guard-locked",
  "Ledger backlog prefix sequence source-of-truth wording",
);

console.log("admin monthly invoice number prefix sequence approval packet guard passed");
