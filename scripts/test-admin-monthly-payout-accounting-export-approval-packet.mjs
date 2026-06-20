import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packetPath = "docs/admin-monthly-payout-accounting-export-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const financeSplitPacketPath =
  "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const manualPaymentPacketPath =
  "docs/admin-monthly-invoice-manual-payment-reconciliation-approval-packet.md";
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
const payoutApprovalPacketGuardPath = "scripts/test-payout-approval-packet.mjs";
const payoutRuntimeSplitGuardPath = "scripts/test-payout-runtime-split-guard.mjs";
const driverPayoutActivationGuardPath =
  "scripts/test-driver-payout-rules-runtime-activation-readiness-guard.mjs";
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
const guardScript = "scripts/test-admin-monthly-payout-accounting-export-approval-packet.mjs";

const runtimeSlugFragments = [
  "admin-monthly-payout-accounting-export",
  "payoutAccountingFinanceExport",
  "payout_accounting_finance_export",
  "recordMonthlyPayoutAccountingExport",
  "generateMonthlyPayoutAccountingExport",
  "data-admin-monthly-payout-accounting-export",
];

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
  manualPaymentPacket,
  paymentLinksProviderPacket,
  pdfFormatPacket,
  pdfGenerationPacket,
  prefixSequencePacket,
  sendingDeliveryPacket,
  payoutApprovalPacketGuard,
  payoutRuntimeSplitGuard,
  driverPayoutActivationGuard,
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
  readFile(manualPaymentPacketPath, "utf8"),
  readFile(paymentLinksProviderPacketPath, "utf8"),
  readFile(pdfFormatPacketPath, "utf8"),
  readFile(pdfGenerationPacketPath, "utf8"),
  readFile(prefixSequencePacketPath, "utf8"),
  readFile(sendingDeliveryPacketPath, "utf8"),
  readFile(payoutApprovalPacketGuardPath, "utf8"),
  readFile(payoutRuntimeSplitGuardPath, "utf8"),
  readFile(driverPayoutActivationGuardPath, "utf8"),
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
  "### Admin Monthly Payout Accounting Finance Export Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime payout/accounting/export implementation",
    "Admin Monthly Payout Accounting Finance Export is a future finance-only sub-lane.",
    "explicit owner approval names this exact payout-accounting-finance-export-only lane",
    "Payout/accounting/finance export is separate from:",
    "Invoice number reservation.",
    "Customer/company prefix and running-number policy.",
    "Invoice/PDF format approval.",
    "PDF generation.",
    "Invoice sending/delivery.",
    "Payment links/provider.",
    "Manual payment record/reconciliation.",
    "Customer billing/payment activation.",
    "Driver payout rules runtime writes.",
    "PayNow payout activation.",
    "Bank API, bank scraping, or accounting provider integration.",
    "Billing automation.",
    "Payout/accounting/finance export must not be bundled with invoice creation",
    "Future payout/accounting/finance export work may only happen after staff has reviewed monthly billing/payment context and explicit finance-only access rules are approved.",
    "Finance export must be internal/admin-finance only, audit-safe, correction-safe, and customer/driver-hidden.",
    "This lane must not execute payouts, trigger PayNow sends/payments, call bank APIs, scrape bank data, post accounting entries to external providers, trust provider status, update customer payment status, or expose payout/accounting/export details to customers or drivers.",
    "Existing finance setup routes stay setup-only and blocked/no-live",
    "`data-admin-monthly-invoice-number-reservation-action`",
    "`data-admin-monthly-invoice-pdf-readiness-action`",
    "`/api/admin-monthly-invoice-number-reservations`",
    "`/api/admin-monthly-invoice-issue-record-pdf-readiness`",
    "Existing driver payout rules runtime guards remain separate and are not approval for month-end payout/accounting/export.",
    "`driver_payout_rules` covers company/traveler payout rule writes only",
    "Existing manual payment reconciliation, payment links/provider, invoice sending, PDF generation, invoice prefix, and invoice/PDF format packets remain separate prerequisite or sibling lanes only.",
    "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.",
    "Future runtime payout/accounting/finance export work requires explicit owner approval with:",
    "Exact staging target and commit hash proof.",
    "Finance-only role and actor-boundary decision.",
    "Exported fields decision.",
    "Excluded customer/driver/internal fields decision.",
    "PayNow handling decision.",
    "Accounting destination decision.",
    "Export format decision, such as CSV or accounting-system-ready file.",
    "Customer and driver visibility proof.",
    "Duplicate export prevention plan.",
    "Correction/reversal workflow decision.",
    "Audit event requirements.",
    "Accounting provider, bank API, bank scraping, payout payment execution, and PayNow activation absent-proof unless separately approved.",
    "Admin/dispatcher/finance role-boundary proof.",
    "Rollback and kill-switch proof.",
    "One bounded evidence window.",
    "Env gate names only, with no env values or secrets printed.",
    "Future payout/accounting/finance export approval must not imply:",
    "Manual payment recording.",
    "Customer payment status changes.",
    "Driver payout rules runtime writes.",
    "Payout payment execution.",
    "PayNow payout activation or send/payment.",
    "Bank API access.",
    "Bank scraping.",
    "Accounting provider posting.",
    "Billing automation writes.",
    "Each of those remains a separate finance sub-lane requiring later explicit owner approval.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "This packet does not approve runtime payout/accounting/export implementation",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `Payout/accounting/export packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime payout/accounting/export implementation is approved",
  "finance export is approved",
  "safe to generate exports now",
  "accounting provider integration is approved",
  "accounting provider posting is approved",
  "payout payment execution is approved",
  "PayNow activation is approved",
  "PayNow send/payment is approved",
  "bank API access is approved",
  "bank scraping is approved",
  "customer payment status changes are approved",
  "driver payout rules runtime writes are approved",
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
  "Payout/accounting/finance export.",
  "Payout/accounting/finance export is separate from customer billing/payment.",
  "Before payout/accounting/finance export, owner approval must define finance-only role access",
  "exported fields",
  "PayNow handling",
  "accounting destination",
  "customer/driver visibility proof",
  "rollback",
  "`payoutAutomationEnabled` stays false.",
  "`payout_automation_approval`",
]) {
  assertIncludes(financeSplitPacket, fragment, `Finance split payout/accounting/export fragment: ${fragment}`);
}

for (const source of [
  manualPaymentPacket,
  paymentLinksProviderPacket,
  pdfFormatPacket,
  pdfGenerationPacket,
  prefixSequencePacket,
  sendingDeliveryPacket,
]) {
  assertIncludes(source, "Payout/accounting/export.", "Adjacent finance packet keeps payout/accounting/export separate");
  assertIncludes(source, "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.");
}

for (const fragment of ["driver_payout_rules"]) {
  assertIncludes(payoutApprovalPacketGuard, fragment, `Driver payout approval guard fragment: ${fragment}`);
  assertIncludes(payoutRuntimeSplitGuard, fragment, `Driver payout split guard fragment: ${fragment}`);
  assertIncludes(driverPayoutActivationGuard, fragment, `Driver payout activation guard fragment: ${fragment}`);
}

for (const source of [
  payoutApprovalPacketGuard,
  payoutRuntimeSplitGuard,
  driverPayoutActivationGuard,
]) {
  for (const fragment of runtimeSlugFragments) {
    assertExcludes(source, fragment, `Driver payout guard must not cover monthly finance export slug ${fragment}`);
  }
}

for (const fragment of [
  "payoutAutomationEnabled: false",
  "payout_automation: \"blocked\"",
  "payout_automation_planned: true",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "liveBillingEnabled: false",
  "paymentProviderConfigured: false",
]) {
  assertIncludes(readinessHelper, fragment, `Billing/payment readiness blocked payout/accounting/export fragment: ${fragment}`);
}

for (const fragment of [
  "payout_automation",
  "payoutAutomationEnabled: false",
  "auditWriteEnabled: false",
  "external_send: false",
  "no_op: true",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
]) {
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit blocked payout/accounting/export fragment: ${fragment}`);
}

assertExcludes(
  auditPayloadHelper,
  /"finance_export"|"accounting_export"|"paynow_payout"|"payout_payment"/,
  "billing/payment audit payload must not expose payout/accounting/export action types yet",
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
    /generateFinanceExport|createAccountingExport|postAccounting|accountingProvider|executePayout|payoutTransfer|paynowTransfer|bankApi|bankScrap|recordManualPayment|createPaymentRecord|sendInvoice|paymentLinks\.create/i,
    `${label} live payout/accounting/export/payment/provider/send behavior`,
  );
  assertExcludes(
    source,
    /\bprocess\.env\b|\b(?:SUPABASE|STRIPE|PAYMENT|BILLING|INVOICE|PAYOUT|BANK|ACCOUNTING|PAYNOW)_[A-Z0-9_]+\b|\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|AUTH_TOKEN|SERVICE_ROLE_KEY)\b/,
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
    /generateFinanceExport|createAccountingExport|postAccounting|accountingProvider|executePayout|payoutTransfer|paynowTransfer|bankApi|bankScrap|recordManualPayment|createPaymentRecord|sendInvoice|paymentLinks\.create/i,
    `${label} payout/accounting/export/payment/provider/send behavior`,
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

for (const fragment of runtimeSlugFragments) {
  assertExcludes(appPage, fragment, `app/page.tsx duplicate payout/accounting/export UI/control ${fragment}`);
}

const runtimeFiles = [
  ...(await listFiles("app/api")),
  ...(await listFiles("lib")),
].filter((file) => /\.(ts|tsx|js|mjs)$/.test(file));

for (const file of runtimeFiles) {
  const source = await readFile(file, "utf8");

  assertExcludes(source, packetPath, `${file} packet path runtime reference`);
  assertExcludes(source, guardScript, `${file} guard script runtime reference`);

  for (const fragment of runtimeSlugFragments) {
    assertExcludes(source, fragment, `${file} payout/accounting/export runtime route/helper ${fragment}`);
  }
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
    "admin-monthly-payout-accounting-export-approval-packet",
    `${label} payout/accounting/export packet runtime wiring`,
  );
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Payout Accounting Finance Export Approval Packet](admin-monthly-payout-accounting-export-approval-packet.md)",
  "Docs index payout/accounting/export approval packet entry",
);
assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite payout/accounting/export approval guard registration",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-monthly-payout-accounting-export-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger payout/accounting/export approval packet registration wording",
);
assertIncludes(
  ledger,
  "Admin monthly payout/accounting/finance export approval/readiness is now docs/test guard-locked",
  "Ledger backlog payout/accounting/export source-of-truth wording",
);

console.log("admin monthly payout/accounting/finance export approval packet guard passed");
