import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packetPath =
  "docs/admin-monthly-invoice-manual-payment-reconciliation-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const financeSplitPacketPath =
  "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const customerPaymentsWorkflowPath = "docs/customer-payments-workflow-design.md";
const regularBillingPlanPath = "docs/regular-customer-monthly-billing-workflow-plan.md";
const paymentLinksProviderPacketPath =
  "docs/admin-monthly-invoice-payment-links-provider-approval-packet.md";
const pdfFormatPacketPath =
  "docs/admin-monthly-invoice-pdf-format-approval-packet.md";
const pdfGenerationPacketPath =
  "docs/admin-monthly-invoice-pdf-generation-approval-packet.md";
const prefixSequencePacketPath =
  "docs/admin-monthly-invoice-number-prefix-sequence-approval-packet.md";
const sendingDeliveryPacketPath =
  "docs/admin-monthly-invoice-sending-delivery-approval-packet.md";
const customerCopyWorkflowLockPath =
  "docs/customer-copy-multi-channel-existing-workflow-lock.md";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const readinessRoutePath = "app/api/admin-billing-payment-readiness-preview-setup/route.ts";
const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const appPagePath = "app/page.tsx";
const invoiceNumberRoutePath =
  "app/api/admin-monthly-invoice-number-reservations/route.ts";
const pdfReadinessRoutePath =
  "app/api/admin-monthly-invoice-issue-record-pdf-readiness/route.ts";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const guardScript =
  "scripts/test-admin-monthly-invoice-manual-payment-reconciliation-approval-packet.mjs";

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
  customerPaymentsWorkflow,
  regularBillingPlan,
  paymentLinksProviderPacket,
  pdfFormatPacket,
  pdfGenerationPacket,
  prefixSequencePacket,
  sendingDeliveryPacket,
  customerCopyWorkflowLock,
  readinessHelper,
  auditPayloadHelper,
  readinessRoute,
  disabledActionRoute,
  appPage,
  invoiceNumberRoute,
  pdfReadinessRoute,
  aiParseRoute,
  adminSavedBookingsRoute,
] = await Promise.all([
  readFile(packetPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(financeSplitPacketPath, "utf8"),
  readFile(customerPaymentsWorkflowPath, "utf8"),
  readFile(regularBillingPlanPath, "utf8"),
  readFile(paymentLinksProviderPacketPath, "utf8"),
  readFile(pdfFormatPacketPath, "utf8"),
  readFile(pdfGenerationPacketPath, "utf8"),
  readFile(prefixSequencePacketPath, "utf8"),
  readFile(sendingDeliveryPacketPath, "utf8"),
  readFile(customerCopyWorkflowLockPath, "utf8"),
  readFile(readinessHelperPath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
  readFile(readinessRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(invoiceNumberRoutePath, "utf8"),
  readFile(pdfReadinessRoutePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Monthly Invoice Manual Payment Reconciliation Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime manual payment recording",
    "Admin Monthly Invoice Manual Payment Reconciliation is a future finance sub-lane.",
    "explicit owner approval names this exact manual-payment-reconciliation-only lane",
    "Manual payment record/reconciliation is separate from:",
    "Invoice number reservation.",
    "Customer/company prefix and running-number policy.",
    "Invoice/PDF format approval.",
    "PDF generation.",
    "Invoice sending/delivery.",
    "Payment links/provider.",
    "Payout/accounting/export.",
    "Billing automation.",
    "Customer portal billing/payment activation.",
    "Bank API, bank scraping, or automatic reconciliation.",
    "Manual payment record/reconciliation must not be bundled with invoice creation",
    "Future manual payment record/reconciliation work may only happen after staff confirms funds outside the app through an approved business process.",
    "Manual payment recording must be staff-entered, auditable, and correction-safe.",
    "Bank wire/transfer remains manual-record only.",
    "This lane must not add bank API access, bank scraping, automatic matching, automatic paid status, provider status trust, or payment-link status trust.",
    "Existing finance setup routes stay setup-only and blocked/no-live",
    "`data-admin-monthly-invoice-number-reservation-action`",
    "`data-admin-monthly-invoice-pdf-readiness-action`",
    "`/api/admin-monthly-invoice-number-reservations`",
    "`/api/admin-monthly-invoice-issue-record-pdf-readiness`",
    "The existing Customer Payments Workflow Design remains planning-only",
    "The existing Regular Customer Monthly Billing Workflow Plan keeps bank wire/transfer manual-record only",
    "Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit payment request or receipt sending approval.",
    "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.",
    "Future runtime manual payment record/reconciliation work requires explicit owner approval with:",
    "Exact staging target and commit hash proof.",
    "Staff role and actor-boundary decision.",
    "Payment evidence fields decision.",
    "Customer-visible fields decision.",
    "Payment status mapping decision.",
    "Partial payment, paid, waived, refunded, reversal, and correction workflow decision.",
    "Manual reference correction workflow.",
    "Audit event requirements.",
    "Duplicate-record and retry safety plan.",
    "Bank API, bank scraping, and automatic reconciliation absent-proof.",
    "Admin/dispatcher/finance role-boundary proof.",
    "Customer and driver privacy proof.",
    "Rollback and kill-switch proof.",
    "One bounded evidence window.",
    "Env gate names only, with no env values or secrets printed.",
    "Future manual payment record/reconciliation approval must not imply:",
    "Payment link creation.",
    "Payment provider activation.",
    "Webhook status update activation.",
    "Bank API access.",
    "Bank scraping.",
    "Automatic reconciliation.",
    "Automatic paid status.",
    "Customer portal billing/payment activation.",
    "Payout/accounting/export.",
    "Billing automation writes.",
    "Each of those remains a separate finance sub-lane requiring later explicit owner approval.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "This packet does not approve runtime manual payment recording",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `Manual payment reconciliation packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime manual payment recording is approved",
  "payment recording is approved",
  "safe to record payments now",
  "bank API access is approved",
  "bank scraping is approved",
  "safe to auto-reconcile now",
  "customer payment status changes are approved",
  "payment provider setup is approved",
  "payment links are approved",
  "invoice sending is approved",
  "PDF generation is approved",
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
  "Manual payment record/reconciliation.",
  "Before manual payment record/reconciliation, owner approval must define who can record payments",
  "what evidence can be stored",
  "what customer-visible fields are allowed",
  "audit requirements",
  "correction workflow",
  "rollback",
]) {
  assertIncludes(financeSplitPacket, fragment, `Finance split manual payment fragment: ${fragment}`);
}

for (const fragment of [
  "This is a planning document only. It does not approve a migration, does not change app behavior, and does not add payment provider, bank, notification, Supabase, or production implementation work.",
  "The first safe workflow should be manual-first:",
  "Dispatcher manually marks payment received after confirming funds.",
  "No real payment API integration should be added in this stage.",
  "No card charge, PayNow request, bank API lookup, webhook, or notification should be sent by the app.",
  "bank transfer reconciliation later, after bank data access and matching rules are approved",
  "no payment provider API",
  "no bank API",
  "no webhook",
  "no Supabase migration unless approved",
  "no payment provider API is called in manual-first stages",
]) {
  assertIncludes(customerPaymentsWorkflow, fragment, `Customer payment planning-only fragment: ${fragment}`);
}

for (const fragment of [
  "Bank wire/transfer remains manual-record only; no bank API, scraping, auto-reconciliation, or automatic paid status.",
  "Bank transfer remains manual-record only; no bank API, bank scraping, or automatic reconciliation.",
  "payment recording, and manual reference corrections",
  "How should paid, partially paid, unpaid, overdue, waived, refunded, and manual bank transfer statuses be recorded without allowing mock UI to change them?",
]) {
  assertIncludes(regularBillingPlan, fragment, `Regular billing manual payment fragment: ${fragment}`);
}

for (const fragment of [
  "Payment recording.",
  "Manual payment record/reconciliation.",
]) {
  assertIncludes(paymentLinksProviderPacket, fragment, `Payment links provider manual payment split: ${fragment}`);
  assertIncludes(pdfFormatPacket, fragment, `PDF format manual payment split: ${fragment}`);
}

for (const fragment of [
  "Payment recording.",
  "Payout/accounting/export.",
]) {
  assertIncludes(pdfGenerationPacket, fragment, `PDF generation manual payment split: ${fragment}`);
  assertIncludes(sendingDeliveryPacket, fragment, `Sending delivery manual payment split: ${fragment}`);
}

for (const fragment of [
  "Payment recording.",
  "Payout/accounting/export.",
]) {
  assertIncludes(prefixSequencePacket, fragment, `Prefix sequence manual payment split: ${fragment}`);
}

for (const fragment of [
  "The admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow already exists in the current app.",
  "They do not send Email, WhatsApp, SMS, Telegram, push, customer messages, or driver notifications.",
]) {
  assertIncludes(customerCopyWorkflowLock, fragment, `Customer Copy provider-send separation: ${fragment}`);
}

for (const fragment of [
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "paymentProviderConfigured: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "liveBillingEnabled: false",
  "invoice_pdf_generation: \"blocked\"",
  "invoice_sending: \"blocked\"",
  "payment_links: \"blocked\"",
  "payment_provider: \"missing\"",
  "payout_automation: \"blocked\"",
  "production_auto_billing: \"blocked\"",
]) {
  assertIncludes(readinessHelper, fragment, `Billing/payment setup blocked manual payment fragment: ${fragment}`);
}

for (const fragment of [
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "paymentProviderConfigured: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "liveBillingEnabled: false",
  "auditWriteEnabled: false",
  "external_send: false",
  "no_op: true",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
]) {
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit blocked manual payment fragment: ${fragment}`);
}

assertExcludes(
  auditPayloadHelper,
  /"payment_record"|"manual_payment"|"reconciliation"/,
  "billing/payment audit payload must not expose manual payment action types yet",
);

for (const [label, source] of [
  ["billing/payment readiness route", readinessRoute],
  ["billing/payment disabled action route", disabledActionRoute],
]) {
  assertIncludes(source, "export async function GET", `${label} setup GET route`);
  assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${label} write method`);
  assertExcludes(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i, `${label} external calls`);
  assertExcludes(
    source,
    /recordManualPayment|createPaymentRecord|markPaymentPaid|bankApi|bankScrap|reconcilePayment|autoReconcile|checkout\.sessions|paymentIntent|paymentLinks\.create|sendInvoice|sendMail|payoutTransfer|paynowTransfer/i,
    `${label} live manual payment/reconciliation/payment/provider/send/payout action`,
  );
  assertExcludes(
    source,
    /\bprocess\.env\b|\b(?:SUPABASE|STRIPE|PAYMENT|BILLING|INVOICE|PAYOUT|BANK)_[A-Z0-9_]+\b|\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|AUTH_TOKEN|SERVICE_ROLE_KEY)\b/,
    `${label} env/secrets`,
  );
}

for (const [label, source] of [
  ["invoice-number reservation route", invoiceNumberRoute],
  ["PDF-readiness route", pdfReadinessRoute],
]) {
  assertIncludes(source, "resolveAdminDispatcherBoundary", `${label} admin boundary`);
  assertIncludes(source, "safeFailureResponse()", `${label} safe failure response`);
  assertExcludes(
    source,
    /recordManualPayment|createPaymentRecord|markPaymentPaid|bankApi|bankScrap|reconcilePayment|autoReconcile|checkout\.sessions|paymentIntent|paymentLinks\.create|sendInvoice|sendMail|payoutTransfer|paynowTransfer/i,
    `${label} manual payment/reconciliation/payment/provider/send/payout behavior`,
  );
}

for (const fragment of [
  'data-admin-monthly-invoice-number-reservation-action="true"',
  'data-admin-monthly-invoice-pdf-readiness-action="true"',
]) {
  assertIncludes(appPage, fragment, `Existing app invoice readiness fragment: ${fragment}`);
  assert.equal(
    countOccurrences(appPage, fragment),
    1,
    `Expected exactly one existing monthly invoice readiness control for ${fragment}.`,
  );
}

assertExcludes(
  appPage,
  /data-admin-monthly-invoice-(manual-payment|payment-reconciliation|bank-reconciliation)|approveManualPaymentReconciliation|recordMonthlyInvoiceManualPayment/i,
  "app/page.tsx duplicate manual payment/reconciliation UI/control",
);

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
    /admin-monthly-invoice-manual-payment-reconciliation/i,
    `${file} manual payment reconciliation runtime route/helper`,
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
    "admin-monthly-invoice-manual-payment-reconciliation-approval-packet",
    `${label} manual payment reconciliation packet runtime wiring`,
  );
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Invoice Manual Payment Reconciliation Approval Packet](admin-monthly-invoice-manual-payment-reconciliation-approval-packet.md)",
  "Docs index manual payment reconciliation approval packet entry",
);
assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite manual payment reconciliation approval guard registration",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-monthly-invoice-manual-payment-reconciliation-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger manual payment reconciliation approval packet registration wording",
);
assertIncludes(
  ledger,
  "Admin monthly invoice manual payment record/reconciliation approval/readiness is now docs/test guard-locked",
  "Ledger backlog manual payment reconciliation source-of-truth wording",
);

console.log("admin monthly invoice manual payment/reconciliation approval packet guard passed");
