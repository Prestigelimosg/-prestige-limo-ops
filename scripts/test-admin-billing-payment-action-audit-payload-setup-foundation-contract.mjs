import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const sourceFiles = [
  helperPath,
  readinessHelperPath,
  disabledActionRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const disabledActionSource = "admin-billing-payment-action-disabled-setup";
const previewReadinessSource = "admin-billing-payment-readiness-preview-setup";
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|stripe|checkout_session|payment_url|https?:\/\/|pdf_url|pdf_link|invoice_number|final_invoice|driver_payout|payout_amount|paynow|customer_price|amount_due|finance|internal_admin|parser_debug|mock_archive/i;
const helperSource = await readFile(helperPath, "utf8");
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

assert.equal(helperSource.includes("server-only"), true, "Billing/payment action audit helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource), false, "Billing/payment action audit helper must not use network APIs.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource), false, "Billing/payment action audit helper must not define API behavior.");
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bSTRIPE_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(
    helperSource,
  ),
  false,
  "Billing/payment action audit helper must not read env/provider secrets.",
);
assert.equal(/createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(helperSource), false, "Billing/payment action audit helper must not use DB reads or writes.");
assert.equal(/@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun/i.test(helperSource), false, "Billing/payment action audit helper must not reference DB, payment, PDF, or sending SDKs.");
assert.equal(/generatePdf|pdfkit|new\s+PDFDocument|renderToStream|createInvoice|paymentIntent|checkout\.sessions|payoutTransfer|paynowTransfer|sendInvoice|sendMail\s*\(|messages\.create|client\.messages/i.test(helperSource), false, "Billing/payment action audit helper must not generate PDFs, create payments, automate payouts, or send invoices.");
assert.equal(/legacy_shim|shim\s*\(/i.test(helperSource), false, "Billing/payment action audit helper must not introduce shims.");

for (const fragment of [
  "buildAdminBillingPaymentReadinessSetupFoundation",
  disabledActionSource,
  previewReadinessSource,
  "billing_payment_action_audit_payload_setup_only",
  "adminBillingPaymentActionAuditActionTypes",
  "invoice_pdf",
  "invoice_send",
  "payment_link",
  "payout_automation",
  "auto_billing",
  "actionType",
  "actionSource",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "external_send: false",
]) {
  assert.ok(helperSource.includes(fragment), `Missing billing/payment action audit setup fragment: ${fragment}`);
}

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-billing-payment-action-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function blockedNoOpResult() {
  return {
    external_send: false,
    invoicePdfEnabled: false,
    invoiceSendingEnabled: false,
    liveBillingEnabled: false,
    no_op: true,
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    payoutAutomationEnabled: false,
    productionAutoBillingEnabled: false,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
  };
}

function assertBillingPaymentActionAuditDisabled(value, label) {
  assert.equal(value.invoicePdfEnabled, false, `${label} must keep invoicePdfEnabled false.`);
  assert.equal(value.invoiceSendingEnabled, false, `${label} must keep invoiceSendingEnabled false.`);
  assert.equal(value.paymentLinksEnabled, false, `${label} must keep paymentLinksEnabled false.`);
  assert.equal(value.payoutAutomationEnabled, false, `${label} must keep payoutAutomationEnabled false.`);
  assert.equal(value.productionAutoBillingEnabled, false, `${label} must keep productionAutoBillingEnabled false.`);
  assert.equal(value.paymentProviderConfigured, false, `${label} must keep paymentProviderConfigured false.`);
  assert.equal(value.liveBillingEnabled, false, `${label} must keep liveBillingEnabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);

  if (Object.hasOwn(value, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assert.deepEqual(value, blockedNoOpResult(), `${label} must stay blocked/no-op.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose provider secrets, payment URLs, invoice numbers, payout, finance, parser, or mock archive text.`,
  );
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-billing-payment-action-audit-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledActionRoute: requireFromHarness(
      path.join(tempDir, disabledActionRoutePath.replace(/\.ts$/, ".js")),
    ),
    readiness: requireFromHarness(path.join(tempDir, readinessHelperPath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminBillingPaymentActionAuditPayloadSetup } = harness.audit;
  const { buildAdminBillingPaymentReadinessSetupFoundation } = harness.readiness;
  const disabledResponse = await harness.disabledActionRoute.GET(
    new Request(
      apiUrl({
        billing_month: "2026-06",
        customer_account: "ACME-CORP",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();
  const setup = buildAdminBillingPaymentReadinessSetupFoundation({
    billing_month: "2026-06",
    customer_account: "ACME-CORP",
  });
  const auditPayload = buildAdminBillingPaymentActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "invoice-pdf",
    disabledAction: disabled.result,
    setup,
  });

  assert.deepEqual(auditPayload, {
    actionSource: "disabled_action_api",
    actionType: "invoice_pdf",
    action_source: "disabled_action_api",
    action_type: "invoice_pdf",
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_action_api",
      actionType: "invoice_pdf",
      action_source: "disabled_action_api",
      action_type: "invoice_pdf",
      auditWriteEnabled: false,
      billing_month: "2026-06",
      billing_readiness_status: "ready_for_future_setup",
      blocked_no_op_result: blockedNoOpResult(),
      customer_account: "ACME-CORP",
      disabledActionStatus: "blocked",
      disabled_action_source: disabledActionSource,
      disabled_action_status: "blocked",
      external_send: false,
      invoicePdfEnabled: false,
      invoiceSendingEnabled: false,
      liveBillingEnabled: false,
      paymentLinksEnabled: false,
      paymentProviderConfigured: false,
      payoutAutomationEnabled: false,
      preview_readiness_source: previewReadinessSource,
      productionAutoBillingEnabled: false,
      result: blockedNoOpResult(),
    },
    audit_write_enabled: false,
    billing_month: "2026-06",
    billing_readiness_status: "ready_for_future_setup",
    blocked_no_op_result: blockedNoOpResult(),
    customer_account: "ACME-CORP",
    delivery_surface: "billing_payment_action_audit_payload_setup_only",
    disabledActionStatus: "blocked",
    disabled_action_status: "blocked",
    external_send: false,
    invoicePdfEnabled: false,
    invoiceSendingEnabled: false,
    liveBillingEnabled: false,
    missing_requirements: [],
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    payoutAutomationEnabled: false,
    productionAutoBillingEnabled: false,
    status: "setup_only",
    version: "admin-billing-payment-action-audit-payload-setup-foundation-v1",
  });
  assertBillingPaymentActionAuditDisabled(auditPayload, "Ready billing/payment action audit payload");
  assertBillingPaymentActionAuditDisabled(
    auditPayload.audit_payload,
    "Ready nested billing/payment action audit payload",
  );
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Ready billing/payment blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Ready nested billing/payment blocked result");
  assertNoUnsafeOutput(auditPayload, "Ready billing/payment action audit payload");

  const actionTypeCases = [
    ["invoice-send", "invoice_send"],
    ["payment link", "payment_link"],
    ["payout-automation", "payout_automation"],
    ["auto billing", "auto_billing"],
  ];

  for (const [rawActionType, normalizedActionType] of actionTypeCases) {
    const actionAudit = buildAdminBillingPaymentActionAuditPayloadSetup({
      action_source: "setup_contract_test",
      action_type: rawActionType,
      billingMonth: "2026-07",
      customerAccount: "BETA-CORP",
      disabled_action: disabled.result,
    });

    assert.equal(actionAudit.actionType, normalizedActionType);
    assert.equal(actionAudit.actionSource, "setup_contract_test");
    assert.equal(actionAudit.billing_month, "2026-07");
    assert.equal(actionAudit.customer_account, "BETA-CORP");
    assert.equal(actionAudit.disabledActionStatus, "blocked");
    assert.deepEqual(actionAudit.missing_requirements, []);
    assertBillingPaymentActionAuditDisabled(actionAudit, `${normalizedActionType} audit payload`);
    assertBlockedNoOp(actionAudit.blocked_no_op_result, `${normalizedActionType} blocked result`);
    assertNoUnsafeOutput(actionAudit, `${normalizedActionType} audit payload`);
  }

  const unsafeAuditPayload = buildAdminBillingPaymentActionAuditPayloadSetup({
    actionSource: "server_secret",
    actionType: "stripe_checkout",
    billing_month: "2026-13",
    customerAccount: "driver_payout_secret",
    disabledAction: {
      delivery_surface: "billing_payment_action_disabled_setup_only",
      external_send: true,
      invoicePdfEnabled: true,
      invoiceSendingEnabled: true,
      liveBillingEnabled: true,
      no_op: false,
      paymentLinksEnabled: true,
      paymentProviderConfigured: true,
      payoutAutomationEnabled: true,
      productionAutoBillingEnabled: true,
      reason: "active",
      result_label: "active",
      status: "active",
    },
  });

  assert.equal(unsafeAuditPayload.actionType, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.billing_month, null);
  assert.equal(unsafeAuditPayload.customer_account, null);
  assert.equal(unsafeAuditPayload.disabledActionStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assertBillingPaymentActionAuditDisabled(unsafeAuditPayload, "Unsafe billing/payment action audit payload");
  assertBillingPaymentActionAuditDisabled(
    unsafeAuditPayload.audit_payload,
    "Unsafe nested billing/payment action audit payload",
  );
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe billing/payment blocked result");
  assertBlockedNoOp(unsafeAuditPayload.audit_payload.result, "Unsafe nested billing/payment blocked result");
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe billing/payment action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin billing/payment action audit payload setup foundation contract passed");
