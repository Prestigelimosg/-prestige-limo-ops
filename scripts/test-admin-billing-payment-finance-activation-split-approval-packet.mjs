import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const packetPath = "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const auditPayloadHelperPath = "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const readinessRoutePath = "app/api/admin-billing-payment-readiness-preview-setup/route.ts";
const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const guardScript = "scripts/test-admin-billing-payment-finance-activation-split-approval-packet.mjs";

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

function sectionBetween(source, startHeading, nextHeadingPattern = /\n(?:##|###) /g) {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);

  nextHeadingPattern.lastIndex = start + startHeading.length;
  const next = nextHeadingPattern.exec(source);

  return next ? source.slice(start, next.index) : source.slice(start);
}

const [
  packet,
  ledger,
  docsIndex,
  preactivationSuite,
  readinessHelper,
  auditPayloadHelper,
  readinessRoute,
  disabledActionRoute,
  appPage,
  aiParseRoute,
  adminSavedBookingsRoute,
] = await Promise.all([
  readFile(packetPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(docsIndexPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(readinessHelperPath, "utf8"),
  readFile(auditPayloadHelperPath, "utf8"),
  readFile(readinessRoutePath, "utf8"),
  readFile(disabledActionRoutePath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Admin Billing/Payment Finance Activation Split Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime implementation",
    "Billing/payment is complete only up to the activation stop.",
    "admin-billing-payment-readiness-preview-setup",
    "admin-billing-payment-action-disabled-setup",
    "Future finance runtime work must be split into exactly one separately approved sub-lane per task",
    "Invoice number reservation readiness.",
    "Invoice/PDF format approval.",
    "PDF generation.",
    "Invoice sending/delivery.",
    "Payment links/provider.",
    "Manual payment record/reconciliation.",
    "Payout/accounting/finance export.",
    "Payout/accounting/finance export is separate from customer billing/payment.",
    "explicit owner approval naming exactly one sub-lane",
    "Exact staging target and commit hash.",
    "Env gate names only, with no values or secrets.",
    "Table, RLS, storage, and access-policy proof for only the named sub-lane.",
    "Admin/dispatcher/finance role-boundary proof.",
    "Customer and driver privacy proof.",
    "Rollback, kill-switch, and manual recovery plan.",
    "One bounded evidence window and stop conditions.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "`invoicePdfEnabled` stays false.",
    "`invoiceSendingEnabled` stays false.",
    "`paymentLinksEnabled` stays false.",
    "`payoutAutomationEnabled` stays false.",
    "`productionAutoBillingEnabled` stays false.",
    "`paymentProviderConfigured` stays false.",
    "`liveBillingEnabled` stays false.",
    "`auditWriteEnabled` stays false.",
    "`external_send` stays false.",
    "`invoice_pdf_generation_approval`",
    "`invoice_sending_approval`",
    "`payment_provider`",
    "`payment_links_approval`",
    "`payout_automation_approval`",
    "`production_auto_billing_approval`",
    "`live_billing_approval`",
    "Before PDF generation, owner approval must define invoice/statement format",
    "Before invoice sending/delivery, owner approval must define channel",
    "Before payment links/provider, owner approval must define test-mode scope",
    "Before manual payment record/reconciliation, owner approval must define who can record payments",
    "Before payout/accounting/finance export, owner approval must define finance-only role access",
    "This packet does not approve invoice creation",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `Finance activation split packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation is approved",
  "safe to enable now",
  "live billing is approved",
  "payment provider is approved",
  "PDF generation is approved",
  "invoice sending is approved",
  "payment links are approved",
  "payout automation is approved",
  "DB writes are approved",
]) {
  assertExcludes(packet, forbiddenApprovalPhrase, `Forbidden packet approval phrase ${forbiddenApprovalPhrase}`);
  assertExcludes(ledgerSection, forbiddenApprovalPhrase, `Forbidden ledger approval phrase ${forbiddenApprovalPhrase}`);
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
  "payment_provider: \"missing\"",
  "payout_automation: \"blocked\"",
  "production_auto_billing: \"blocked\"",
  "invoice_pdf_generation_approval",
  "invoice_sending_approval",
  "payment_provider",
  "payment_links_approval",
  "payout_automation_approval",
  "production_auto_billing_approval",
  "live_billing_approval",
  "planned_capabilities",
  "invoice_pdf_generation: \"planned_only\"",
  "invoice_sending: \"planned_only\"",
  "payment_links: \"planned_only\"",
  "payout_automation: \"planned_only\"",
  "production_auto_billing: \"planned_only\"",
]) {
  assertIncludes(readinessHelper, fragment, `Billing/payment readiness setup fragment: ${fragment}`);
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
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
  "\"invoice_pdf\"",
  "\"invoice_send\"",
  "\"payment_link\"",
  "\"payout_automation\"",
  "\"auto_billing\"",
]) {
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit payload setup fragment: ${fragment}`);
}

for (const [label, source] of [
  ["readiness route", readinessRoute],
  ["disabled action route", disabledActionRoute],
]) {
  assertIncludes(source, "resolveAdminDispatcherBoundary", `${label} admin boundary`);
  assertIncludes(source, "adminBookingPersistencePurpose", `${label} admin purpose`);
  assertIncludes(source, "export async function GET", `${label} GET setup route`);
  assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${label} write methods`);
  assertExcludes(source, /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i, `${label} external calls`);
  assertExcludes(source, /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i, `${label} DB write/read path`);
  assertExcludes(
    source,
    /\bprocess\.env\b|\b(?:SUPABASE|STRIPE|PAYMENT|BILLING|INVOICE|PAYOUT)_[A-Z0-9_]+\b|\b(?:API_KEY|ACCESS_TOKEN|SECRET_KEY|AUTH_TOKEN|SERVICE_ROLE_KEY)\b/,
    `${label} env/secrets`,
  );
  assertExcludes(source, /generatePdf|PDFDocument|createInvoice|sendInvoice|sendMail|checkout\.sessions|paymentIntent|payoutTransfer|paynowTransfer/i, `${label} live finance action`);
}

for (const [label, source] of [
  ["app/page.tsx", appPage],
  ["AI parser route", aiParseRoute],
  ["admin saved bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, guardScript, `${label} docs/test guard runtime wiring`);
  assertExcludes(source, packetPath, `${label} docs/test packet runtime wiring`);
  assertExcludes(source, "admin-billing-payment-finance-activation-split", `${label} finance split runtime wiring`);
}

assertIncludes(
  docsIndex,
  "[Admin Billing Payment Finance Activation Split Approval Packet](admin-billing-payment-finance-activation-split-approval-packet.md)",
  "Docs index finance activation split approval packet entry",
);
assertIncludes(preactivationSuite, guardScript, "Preactivation suite finance activation split guard registration");
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-billing-payment-finance-activation-split-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger finance activation split registration wording",
);
assertIncludes(
  ledger,
  "Admin billing/payment finance activation split is now docs/test guard-locked",
  "Ledger backlog finance activation split source-of-truth wording",
);

console.log("admin billing/payment finance activation split approval packet guard passed");
