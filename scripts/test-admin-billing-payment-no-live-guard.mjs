import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-billing-payment-action-disabled-setup/route.ts",
  "app/api/admin-billing-payment-readiness-preview-setup/route.ts",
];
const helperFiles = [
  "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts",
  "lib/admin-billing-payment-readiness-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const previewReadinessSetupApi = "admin-billing-payment-readiness-preview-setup";
const disabledActionSetupApi = "admin-billing-payment-action-disabled-setup";
const allowedSetupOnlyStrings = [
  "admin-billing-payment-action-disabled-setup",
  "admin-billing-payment-readiness-preview-setup",
  "auto_billing",
  "billing_payment_action_audit_payload_setup_only",
  "billing_payment_action_disabled_setup_only",
  "billing_payment_readiness_setup_only",
  "blocked/no-op",
  "invoice_pdf",
  "invoice_pdf_generation",
  "invoice_send",
  "invoice_sending",
  "payment_link",
  "payment_links",
  "payout_automation",
  "production_auto_billing",
  "setup_only",
  "setup_only_disabled",
];
const disallowedPackageNames = new Set([
  "@adyen/api-library",
  "@paypal/checkout-server-sdk",
  "@sendgrid/mail",
  "@stripe/stripe-js",
  "adyen",
  "braintree",
  "hitpay",
  "jspdf",
  "mailgun.js",
  "nodemailer",
  "omise",
  "paypal-rest-sdk",
  "pdfkit",
  "playwright",
  "puppeteer",
  "resend",
  "square",
  "stripe",
  "xendit-node",
]);
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@adyen\/api-library|@paypal\/checkout-server-sdk|@sendgrid\/mail|@stripe\/stripe-js|@supabase\/supabase-js|adyen|braintree|hitpay|jspdf|mailgun\.js|nodemailer|omise|paypal-rest-sdk|pdfkit|playwright|puppeteer|resend|square|stripe|xendit-node)["']|require\(\s*["'](?:@adyen\/api-library|@paypal\/checkout-server-sdk|@sendgrid\/mail|@stripe\/stripe-js|@supabase\/supabase-js|adyen|braintree|hitpay|jspdf|mailgun\.js|nodemailer|omise|paypal-rest-sdk|pdfkit|playwright|puppeteer|resend|square|stripe|xendit-node)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bSTRIPE_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bBILLING_[A-Z_]*\b|\bINVOICE_[A-Z_]*\b|\bPAYOUT_[A-Z_]*\b|\bPAYPAL_[A-Z_]*\b|\bADYEN_[A-Z_]*\b|\bXENDIT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/;
const dbWritePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMail\s*\(|sendInvoice\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const liveTruePattern =
  /invoicePdfEnabled\s*[:=]\s*true|invoiceSendingEnabled\s*[:=]\s*true|paymentLinksEnabled\s*[:=]\s*true|payoutAutomationEnabled\s*[:=]\s*true|productionAutoBillingEnabled\s*[:=]\s*true|paymentProviderConfigured\s*[:=]\s*true|liveBillingEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const liveBillingActivationPattern =
  /generatePdf|new\s+PDFDocument|renderToStream|createInvoice|sendInvoice|invoiceNumber|finalInvoice|paymentIntent|checkout\.sessions|checkoutSession|createCheckout|paymentLinkUrl|payment_link_url|payment_url|payoutTransfer|paynowTransfer|payout_amount|liveBillingEnabled\s*[:=]\s*true|productionAutoBillingEnabled\s*[:=]\s*true/i;
const shimPattern = /legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|stripe|checkout_session|payment_url|pdf_url|pdf_link|invoice_number|final_invoice|driver_payout|payout_amount|paynow|customer_price|amount_due|finance|internal_admin|parser_debug|mock_archive/i;
const expectedBlockedActivation = {
  invoice_pdf_generation: "blocked",
  invoice_sending: "blocked",
  live_billing: "blocked",
  payment_links: "blocked",
  payment_provider: "missing",
  payout_automation: "blocked",
  production_auto_billing: "blocked",
};
const expectedMissingRequirements = [
  "invoice_pdf_generation_approval",
  "invoice_sending_approval",
  "payment_provider",
  "payment_links_approval",
  "payout_automation_approval",
  "production_auto_billing_approval",
  "live_billing_approval",
];
const expectedPlannedCapabilities = {
  invoice_pdf_generation: "planned_only",
  invoice_sending: "planned_only",
  payment_links: "planned_only",
  payout_automation: "planned_only",
  production_auto_billing: "planned_only",
};
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

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

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertBillingPaymentDisabled(value, label) {
  assert.equal(value?.invoicePdfEnabled, false, `${label} must keep invoicePdfEnabled false.`);
  assert.equal(value?.invoiceSendingEnabled, false, `${label} must keep invoiceSendingEnabled false.`);
  assert.equal(value?.paymentLinksEnabled, false, `${label} must keep paymentLinksEnabled false.`);
  assert.equal(value?.payoutAutomationEnabled, false, `${label} must keep payoutAutomationEnabled false.`);
  assert.equal(
    value?.productionAutoBillingEnabled,
    false,
    `${label} must keep productionAutoBillingEnabled false.`,
  );
  assert.equal(value?.paymentProviderConfigured, false, `${label} must keep paymentProviderConfigured false.`);
  assert.equal(value?.liveBillingEnabled, false, `${label} must keep liveBillingEnabled false.`);
  assert.equal(value?.auditWriteEnabled ?? false, false, `${label} must keep auditWriteEnabled false.`);
  assert.equal(value?.external_send ?? false, false, `${label} must keep external_send false.`);
}

function assertBlockedActivation(value, label) {
  assert.deepEqual(
    value?.blocked_activation,
    expectedBlockedActivation,
    `${label} must keep billing/payment activation blocked.`,
  );
}

function assertMissingRequirements(value, label) {
  assert.deepEqual(
    value?.missing_requirements,
    expectedMissingRequirements,
    `${label} must keep provider/env/approval blockers.`,
  );
}

function assertPlannedCapabilities(value, label) {
  assert.deepEqual(
    value?.planned_capabilities,
    expectedPlannedCapabilities,
    `${label} must keep billing/payment actions planned only.`,
  );
}

function assertBlockedNoOp(value, label) {
  assertBillingPaymentDisabled(value, label);
  assert.equal(value?.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value?.no_op, true, `${label} must stay no-op.`);
  assert.equal(value?.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value?.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose provider secrets, payment links, invoice numbers, payout, finance, parser, or mock archive text.`,
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

async function listFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await listFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }

  return files;
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-billing-payment-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-billing-payment-action-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    readiness: requireFromHarness(
      path.join(tempDir, "lib/admin-billing-payment-readiness-setup-foundation.js"),
    ),
    routes: {
      disabledAction: requireFromHarness(
        path.join(tempDir, "app/api/admin-billing-payment-action-disabled-setup/route.js"),
      ),
      previewReadiness: requireFromHarness(
        path.join(tempDir, "app/api/admin-billing-payment-readiness-preview-setup/route.js"),
      ),
    },
  };
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    disallowedPackageNames.has(packageName),
    false,
    `Billing/payment setup must not add payment/PDF/sending package: ${packageName}`,
  );
}

const appApiFiles = await listFiles("app/api");
const billingPaymentRouteFiles = appApiFiles
  .filter((file) => file.endsWith("route.ts") && file.includes("admin-billing-payment"))
  .sort();

assert.deepEqual(
  billingPaymentRouteFiles,
  [...routeFiles].sort(),
  "Billing/payment setup chain must not add duplicate or live billing/payment routes.",
);

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live billing verbs.`,
  );
}

for (const helperFile of helperFiles) {
  const source = await readFile(helperFile, "utf8");

  assert.equal(source.includes("server-only"), true, `${helperFile} must stay server-only.`);
  assert.equal(
    /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source),
    false,
    `${helperFile} must not define API behavior.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import payment/PDF/DB/sending SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read payment/provider/env secrets.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB reads or writes.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable billing/payment live flags.`);
  assert.equal(
    liveBillingActivationPattern.test(source),
    false,
    `${file} must not generate PDFs, send invoices, create payment links, or automate payouts.`,
  );
  assert.equal(shimPattern.test(source), false, `${file} must not introduce shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only billing/payment string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminBillingPaymentActionAuditPayloadSetup } = harness.auditPayload;
  const { buildAdminBillingPaymentReadinessSetupFoundation } = harness.readiness;
  const setup = buildAdminBillingPaymentReadinessSetupFoundation({
    billing_month: "2026-06",
    customer_account: "ACME-CORP",
  });

  assertBillingPaymentDisabled(setup, "Billing/payment readiness foundation");
  assert.equal(setup.status, "setup_only");
  assert.equal(setup.policy_surface, "billing_payment_readiness_setup_only");
  assertBlockedActivation(setup, "Billing/payment readiness foundation");
  assertMissingRequirements(setup, "Billing/payment readiness foundation");
  assertPlannedCapabilities(setup, "Billing/payment readiness foundation");
  assertNoUnsafeOutput(setup, "Billing/payment readiness foundation");

  const anonymousPreviewResponse = await harness.routes.previewReadiness.GET(
    new Request(apiUrl(`/api/${previewReadinessSetupApi}`)),
  );
  const anonymousPreview = await anonymousPreviewResponse.json();

  assert.equal(anonymousPreviewResponse.status, 403);
  assert.equal(anonymousPreview.ok, false);
  assert.equal(anonymousPreview.status, "blocked");
  assertBillingPaymentDisabled(anonymousPreview, "Anonymous billing/payment readiness preview API");
  assertBillingPaymentDisabled(
    anonymousPreview.preview,
    "Anonymous billing/payment readiness preview API preview",
  );
  assertBillingPaymentDisabled(
    anonymousPreview.readiness,
    "Anonymous billing/payment readiness preview API readiness",
  );
  assertBillingPaymentDisabled(
    anonymousPreview.setup,
    "Anonymous billing/payment readiness preview API setup",
  );
  assertBlockedActivation(
    anonymousPreview.readiness,
    "Anonymous billing/payment readiness preview API readiness",
  );
  assertBlockedActivation(
    anonymousPreview.setup,
    "Anonymous billing/payment readiness preview API setup",
  );
  assertMissingRequirements(
    anonymousPreview.readiness,
    "Anonymous billing/payment readiness preview API readiness",
  );
  assertMissingRequirements(
    anonymousPreview.setup,
    "Anonymous billing/payment readiness preview API setup",
  );
  assertNoUnsafeOutput(anonymousPreview, "Anonymous billing/payment readiness preview API");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl(`/api/${previewReadinessSetupApi}`, {
        billing_month: "2026-07",
        customer_account: "BETA-CORP",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assertBillingPaymentDisabled(preview, "Billing/payment readiness preview API");
  assertBillingPaymentDisabled(preview.preview, "Billing/payment readiness preview API preview");
  assertBillingPaymentDisabled(preview.readiness, "Billing/payment readiness preview API readiness");
  assertBillingPaymentDisabled(preview.setup, "Billing/payment readiness preview API setup");
  assertBlockedActivation(preview.readiness, "Billing/payment readiness preview API readiness");
  assertBlockedActivation(preview.setup, "Billing/payment readiness preview API setup");
  assertMissingRequirements(preview.readiness, "Billing/payment readiness preview API readiness");
  assertMissingRequirements(preview.setup, "Billing/payment readiness preview API setup");
  assertPlannedCapabilities(preview.preview, "Billing/payment readiness preview API preview");
  assertPlannedCapabilities(preview.setup, "Billing/payment readiness preview API setup");
  assert.equal(preview.preview.billing_month, "2026-07");
  assert.equal(preview.preview.customer_account, "BETA-CORP");
  assertNoUnsafeOutput(preview, "Billing/payment readiness preview API");

  const anonymousDisabledResponse = await harness.routes.disabledAction.GET(
    new Request(apiUrl(`/api/${disabledActionSetupApi}`)),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertBillingPaymentDisabled(anonymousDisabled, "Anonymous disabled billing/payment action API");
  assertBillingPaymentDisabled(
    anonymousDisabled.preview,
    "Anonymous disabled billing/payment action API preview",
  );
  assertBillingPaymentDisabled(
    anonymousDisabled.readiness,
    "Anonymous disabled billing/payment action API readiness",
  );
  assertBillingPaymentDisabled(
    anonymousDisabled.setup,
    "Anonymous disabled billing/payment action API setup",
  );
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled billing/payment action API result");
  assertNoUnsafeOutput(anonymousDisabled, "Anonymous disabled billing/payment action API");

  const disabledResponse = await harness.routes.disabledAction.GET(
    new Request(
      apiUrl(`/api/${disabledActionSetupApi}`, {
        billing_month: "2026-08",
        customer_account: "GAMMA-CORP",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();

  assert.equal(disabledResponse.status, 200);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.status, "blocked");
  assertBillingPaymentDisabled(disabled, "Disabled billing/payment action API");
  assertBillingPaymentDisabled(disabled.preview, "Disabled billing/payment action API preview");
  assertBillingPaymentDisabled(disabled.readiness, "Disabled billing/payment action API readiness");
  assertBillingPaymentDisabled(disabled.setup, "Disabled billing/payment action API setup");
  assertBlockedNoOp(disabled.result, "Disabled billing/payment action API result");
  assert.equal(disabled.delivery_surface, "billing_payment_action_disabled_setup_only");
  assert.equal(disabled.preview_readiness_source, previewReadinessSetupApi);
  assert.deepEqual(disabled.result.invoice_pdf_generation, {
    invoicePdfEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.invoice_sending, {
    external_send: false,
    invoiceSendingEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.payment_links, {
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.payout_automation, {
    payoutAutomationEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.production_auto_billing, {
    liveBillingEnabled: false,
    productionAutoBillingEnabled: false,
    status: "blocked",
  });
  assertNoUnsafeOutput(disabled, "Disabled billing/payment action API");

  const auditPayload = buildAdminBillingPaymentActionAuditPayloadSetup({
    actionSource: "disabled-action-api",
    actionType: "payment-link",
    disabledAction: disabled.result,
    setup,
  });

  assertBillingPaymentDisabled(auditPayload, "Billing/payment action audit payload");
  assertBillingPaymentDisabled(
    auditPayload.audit_payload,
    "Billing/payment action audit payload nested audit payload",
  );
  assertBlockedNoOp(
    auditPayload.blocked_no_op_result,
    "Billing/payment action audit payload blocked result",
  );
  assertBlockedNoOp(
    auditPayload.audit_payload.result,
    "Billing/payment action audit payload nested result",
  );
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.actionType, "payment_link");
  assert.equal(auditPayload.actionSource, "disabled_action_api");
  assert.equal(auditPayload.disabledActionStatus, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoUnsafeOutput(auditPayload, "Billing/payment action audit payload");

  const unsafeAuditPayload = buildAdminBillingPaymentActionAuditPayloadSetup({
    actionSource: "server_secret",
    actionType: "stripe-checkout",
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

  assertBillingPaymentDisabled(unsafeAuditPayload, "Unsafe billing/payment action audit payload");
  assertBillingPaymentDisabled(
    unsafeAuditPayload.audit_payload,
    "Unsafe billing/payment action audit payload nested audit payload",
  );
  assertBlockedNoOp(
    unsafeAuditPayload.blocked_no_op_result,
    "Unsafe billing/payment action audit payload blocked result",
  );
  assert.equal(unsafeAuditPayload.actionType, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.customer_account, null);
  assert.equal(unsafeAuditPayload.disabledActionStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_type",
    "action_source",
    "disabled_action_result",
  ]);
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe billing/payment action audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("billing/payment no-live guard passed");
