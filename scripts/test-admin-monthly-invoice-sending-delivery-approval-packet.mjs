import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const packetPath = "docs/admin-monthly-invoice-sending-delivery-approval-packet.md";
const ledgerPath = "docs/current-implementation-ledger.md";
const docsIndexPath = "docs/test-and-safety-docs-index.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const financeSplitPacketPath =
  "docs/admin-billing-payment-finance-activation-split-approval-packet.md";
const pdfGenerationPacketPath =
  "docs/admin-monthly-invoice-pdf-generation-approval-packet.md";
const prefixSequencePacketPath =
  "docs/admin-monthly-invoice-number-prefix-sequence-approval-packet.md";
const customerCopyWorkflowLockPath =
  "docs/customer-copy-multi-channel-existing-workflow-lock.md";
const monthlyWorkflowLockPath =
  "docs/admin-monthly-billing-month-grouping-existing-workflow-lock.md";
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
const guardScript =
  "scripts/test-admin-monthly-invoice-sending-delivery-approval-packet.mjs";

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
  customerCopyWorkflowLock,
  monthlyWorkflowLock,
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
  readFile(customerCopyWorkflowLockPath, "utf8"),
  readFile(monthlyWorkflowLockPath, "utf8"),
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
  "### Admin Monthly Invoice Sending Delivery Approval Packet Lock",
);

for (const source of [packet, ledgerSection]) {
  for (const fragment of [
    "This packet is docs/test-only.",
    "It does not approve runtime invoice sending",
    "Admin Monthly Invoice Sending Delivery is a future finance sub-lane.",
    "explicit owner approval names this exact invoice-sending/delivery-only lane",
    "Invoice sending/delivery is separate from:",
    "Invoice number reservation.",
    "Customer/company prefix and running-number policy.",
    "PDF generation.",
    "Payment links/provider.",
    "Payment recording.",
    "Payout/accounting/export.",
    "Billing automation.",
    "Future invoice sending/delivery may only happen after an invoice number has already been reserved and a PDF artifact has been generated through its own separately approved PDF-generation lane.",
    "Draft invoices, previews, grouping, billing preparation, issue record review, invoice-number reservation, and PDF-readiness review must not send invoices or notify customers.",
    "PDF generation approval must not imply invoice sending/delivery approval.",
    "Payment links/provider approval must not be bundled into invoice sending/delivery approval.",
    "`data-admin-monthly-invoice-number-reservation-action`",
    "`data-admin-monthly-invoice-pdf-readiness-action`",
    "`/api/admin-monthly-invoice-number-reservations`",
    "`/api/admin-monthly-invoice-issue-record-pdf-readiness`",
    "Existing finance setup routes stay setup-only and blocked/no-live",
    "Existing Customer Copy Email/WhatsApp/SMS provider-send locks remain separate and must not be used as implicit invoice delivery approval.",
    "This packet does not add a duplicate UI sector/card/button, route, helper, or shim.",
    "Exact staging target and commit hash proof.",
    "Channel decision.",
    "Recipient decision.",
    "Copy/template decision.",
    "Attachment/link policy decision.",
    "Opt-out or manual-send policy decision.",
    "Audit logging decision.",
    "Failure/retry handling decision.",
    "Provider-send disabled-until-approved proof.",
    "Admin/dispatcher/finance role-boundary proof.",
    "Customer and driver privacy proof.",
    "Rollback and kill-switch proof.",
    "One bounded evidence window.",
    "Env gate names only, with no env values or secrets printed.",
    "Future invoice sending/delivery approval must not imply:",
    "Payment link creation.",
    "Payment provider activation.",
    "Payment recording.",
    "Customer portal billing/payment activation.",
    "Payout/accounting/export.",
    "Billing automation writes.",
    "Each of those remains a separate finance sub-lane requiring later explicit owner approval.",
    "Customers must never see driver payout, PayNow payout, internal admin notes, parser/debug internals, admin finance, or mock QA/dev archive.",
    "Drivers must never see customer price, billing, invoice/payment, payout comparisons, PayNow payout details, internal finance notes, internal admin notes, or mock QA/dev archive.",
    "This packet does not approve runtime invoice sending",
    "`/api/admin-saved-bookings` changes",
    "UI sectors/cards/buttons",
    "new shims",
  ]) {
    assertIncludes(source, fragment, `Invoice sending delivery packet fragment: ${fragment}`);
  }
}

for (const forbiddenApprovalPhrase of [
  "runtime invoice sending is approved",
  "invoice delivery is approved",
  "safe to send invoices now",
  "provider sends are approved",
  "customer email is approved",
  "WhatsApp is approved",
  "SMS is approved",
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
  "Invoice sending/delivery.",
  "Before invoice sending/delivery, owner approval must define channel",
  "proof that provider sends remain disabled until the exact lane is approved",
  "`invoiceSendingEnabled` stays false.",
  "`external_send` stays false.",
  "`invoice_sending_approval`",
]) {
  assertIncludes(financeSplitPacket, fragment, `Finance split invoice sending fragment: ${fragment}`);
}

for (const fragment of [
  "Future PDF generation approval must not imply:",
  "Invoice sending.",
  "Customer email, WhatsApp, or SMS sending.",
  "Provider live send.",
]) {
  assertIncludes(pdfGenerationPacket, fragment, `PDF packet sending split fragment: ${fragment}`);
}

for (const fragment of [
  "PDF generation later must use an already-reserved invoice number.",
  "Customer/company invoice prefix and running-number policy is separate from:",
  "Invoice sending.",
]) {
  assertIncludes(prefixSequencePacket, fragment, `Prefix sequence packet sending split fragment: ${fragment}`);
}

for (const fragment of [
  "A reserved invoice number on a locked issue record is the prerequisite for PDF-review readiness.",
  "This sequencing evidence does not activate invoice creation, PDF generation/sending, payment, payout, provider sends, billing automation, customer messages, driver notifications, auth/location/photo/calendar, parser behavior, Save Booking, `/api/admin-saved-bookings`, or new shims.",
]) {
  assertIncludes(monthlyWorkflowLock, fragment, `Monthly workflow no-send sequencing fragment: ${fragment}`);
}

for (const fragment of [
  "The admin Customer Copy Email/WhatsApp/SMS customer driver-details workflow already exists in the current app.",
  "Do not rebuild it as duplicate Email, WhatsApp, SMS, or Telegram workflow sectors.",
  "Email may be triggered only by explicit admin click through `POST /api/admin-customer-driver-details-email-send-action`, using the gated Resend helper and allowlist safeguards.",
  "SMS and WhatsApp remain parked setup-only/no-op for now.",
  "Activating live Email beyond the existing gate, WhatsApp, SMS, Telegram provider sends, push, provider/env reads, provider sends, recipient sends, notification sends, customer messages, driver notifications",
]) {
  assertIncludes(customerCopyWorkflowLock, fragment, `Customer Copy provider-send separation: ${fragment}`);
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
  /data-admin-monthly-invoice-(send|delivery)|sendMonthlyInvoice|deliverMonthlyInvoice/i,
  "app/page.tsx duplicate invoice sending UI/control",
);

for (const [label, source] of [
  ["invoice-number reservation route", invoiceNumberRoute],
  ["PDF-readiness route", pdfReadinessRoute],
]) {
  assertIncludes(source, "resolveAdminDispatcherBoundary", `${label} admin boundary`);
  assertIncludes(source, "safeFailureResponse()", `${label} safe failure response`);
  assertExcludes(
    source,
    /sendInvoice|deliverInvoice|sendMail|messages\.create|client\.messages|whatsapp|telegram|sms|smtp|checkout\.sessions|paymentIntent|paymentLink|payoutTransfer|paynowTransfer/i,
    `${label} sends/payments/payouts`,
  );
}

for (const fragment of [
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "invoice_sending: \"blocked\"",
  "payment_links: \"blocked\"",
  "payout_automation: \"blocked\"",
  "production_auto_billing: \"blocked\"",
  "invoice_sending_approval",
]) {
  assertIncludes(readinessHelper, fragment, `Billing/payment setup blocked sending fragment: ${fragment}`);
}

for (const fragment of [
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "auditWriteEnabled: false",
  "external_send: false",
  "no_op: true",
  "\"invoice_send\"",
]) {
  assertIncludes(auditPayloadHelper, fragment, `Billing/payment audit blocked sending fragment: ${fragment}`);
}

for (const [label, source] of [
  ["billing/payment readiness route", readinessRoute],
  ["billing/payment disabled action route", disabledActionRoute],
]) {
  assertIncludes(source, "export async function GET", `${label} setup GET route`);
  assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${label} write method`);
  assertExcludes(
    source,
    /sendInvoice|deliverInvoice|sendMail|checkout\.sessions|paymentIntent|payoutTransfer|paynowTransfer/i,
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
    /admin-monthly-invoice-sending-delivery/i,
    `${file} invoice sending delivery runtime route/helper`,
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
    "admin-monthly-invoice-sending-delivery-approval-packet",
    `${label} invoice sending packet runtime wiring`,
  );
}

assertIncludes(
  docsIndex,
  "[Admin Monthly Invoice Sending Delivery Approval Packet](admin-monthly-invoice-sending-delivery-approval-packet.md)",
  "Docs index invoice sending approval packet entry",
);
assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite invoice sending approval guard registration",
);
assertIncludes(
  ledger,
  "This lock adds `scripts/test-admin-monthly-invoice-sending-delivery-approval-packet.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
  "Ledger invoice sending approval packet registration wording",
);
assertIncludes(
  ledger,
  "Admin monthly invoice sending/delivery approval/readiness is now docs/test guard-locked",
  "Ledger backlog invoice sending source-of-truth wording",
);

console.log("admin monthly invoice sending delivery approval packet guard passed");
