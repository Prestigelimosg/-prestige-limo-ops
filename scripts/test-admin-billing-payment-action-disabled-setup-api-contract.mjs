import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const helperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const previewReadinessSetupApi = "admin-billing-payment-readiness-preview-setup";
const safeOutputLeakPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|stripe|checkout_session|payment_url|payment_link\b|pdf_url|pdf_link|invoice_number|final_invoice|driver_payout|payout_amount|paynow|customer_price|amount_due|finance|internal_admin|parser_debug|mock_archive/i;
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

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-billing-payment-action-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertBillingPaymentCoreDisabled(value, label) {
  assert.equal(value.invoicePdfEnabled, false, `${label} must keep invoicePdfEnabled false.`);
  assert.equal(value.invoiceSendingEnabled, false, `${label} must keep invoiceSendingEnabled false.`);
  assert.equal(value.paymentLinksEnabled, false, `${label} must keep paymentLinksEnabled false.`);
  assert.equal(value.payoutAutomationEnabled, false, `${label} must keep payoutAutomationEnabled false.`);
  assert.equal(value.productionAutoBillingEnabled, false, `${label} must keep productionAutoBillingEnabled false.`);
  assert.equal(value.paymentProviderConfigured, false, `${label} must keep paymentProviderConfigured false.`);
  assert.equal(value.liveBillingEnabled, false, `${label} must keep liveBillingEnabled false.`);
}

function assertBillingPaymentActionDisabled(value, label) {
  assertBillingPaymentCoreDisabled(value, label);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
}

function assertBlockedActivation(value, label) {
  assert.deepEqual(
    value.blocked_activation,
    expectedBlockedActivation,
    `${label} must keep future billing/payment activation blocked.`,
  );
}

function assertMissingRequirements(value, label) {
  assert.deepEqual(
    value.missing_requirements,
    expectedMissingRequirements,
    `${label} must keep approval/provider blockers.`,
  );
}

function assertPlannedCapabilities(value, label) {
  assert.deepEqual(
    value.planned_capabilities,
    expectedPlannedCapabilities,
    `${label} must keep billing/payment capabilities planned only.`,
  );
}

function assertNoOpResult(result, label) {
  assertBillingPaymentActionDisabled(result, label);
  assert.equal(result.status, "blocked", `${label} must stay blocked.`);
  assert.equal(result.no_op, true, `${label} must stay no-op.`);
  assert.equal(result.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(result.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    result.preview_readiness_source,
    previewReadinessSetupApi,
    `${label} must reference the preview/readiness setup API.`,
  );
  assert.deepEqual(result.invoice_pdf_generation, {
    invoicePdfEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.invoice_sending, {
    external_send: false,
    invoiceSendingEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.payment_links, {
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    status: "blocked",
  });
  assert.deepEqual(result.payout_automation, {
    payoutAutomationEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.production_auto_billing, {
    liveBillingEnabled: false,
    productionAutoBillingEnabled: false,
    status: "blocked",
  });
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(value)),
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

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-billing-payment-action-disabled-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "buildAdminBillingPaymentReadinessSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  previewReadinessSetupApi,
  "billing_payment_action_disabled_setup_only",
  "invoice_pdf_generation",
  "invoice_sending",
  "payment_links",
  "payout_automation",
  "production_auto_billing",
  "external_send: false",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "status: \"blocked\"",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled billing/payment API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  ".from(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "@supabase/supabase-js",
  "stripe",
  "paymentIntent",
  "checkout.sessions",
  "generatePdf",
  "pdfkit",
  "PDFDocument",
  "sendInvoice",
  "sendMail(",
  "payoutTransfer",
  "paynowTransfer",
  "legacy_shim",
  "shim(",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled billing/payment action API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertBillingPaymentActionDisabled(anonymous, "Anonymous blocked response");
  assertBillingPaymentActionDisabled(anonymous.preview, "Anonymous blocked preview");
  assertBillingPaymentActionDisabled(anonymous.readiness, "Anonymous blocked readiness");
  assertBillingPaymentCoreDisabled(anonymous.setup, "Anonymous blocked setup");
  assertNoOpResult(anonymous.result, "Anonymous blocked result");
  assertBlockedActivation(anonymous.readiness, "Anonymous blocked readiness");
  assertBlockedActivation(anonymous.setup, "Anonymous blocked setup");
  assertMissingRequirements(anonymous.readiness, "Anonymous blocked readiness");
  assertMissingRequirements(anonymous.setup, "Anonymous blocked setup");
  assertPlannedCapabilities(anonymous.preview, "Anonymous blocked preview");
  assertPlannedCapabilities(anonymous.setup, "Anonymous blocked setup");
  assert.equal(anonymous.preview_readiness_source, previewReadinessSetupApi);
  assertNoUnsafeOutput(anonymous, "Anonymous blocked response");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        billing_month: "2026-06",
        customer_account: "ACME-CORP",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "blocked");
  assert.equal(ready.version, "admin-billing-payment-readiness-setup-foundation-v1");
  assertBillingPaymentActionDisabled(ready, "Ready response");
  assertBillingPaymentActionDisabled(ready.preview, "Ready preview");
  assertBillingPaymentActionDisabled(ready.readiness, "Ready readiness");
  assertBillingPaymentCoreDisabled(ready.setup, "Ready setup");
  assertNoOpResult(ready.result, "Ready result");
  assertBlockedActivation(ready.readiness, "Ready readiness");
  assertBlockedActivation(ready.setup, "Ready setup");
  assertMissingRequirements(ready.readiness, "Ready readiness");
  assertMissingRequirements(ready.setup, "Ready setup");
  assertPlannedCapabilities(ready.preview, "Ready preview");
  assertPlannedCapabilities(ready.setup, "Ready setup");
  assert.equal(ready.preview.billing_month, "2026-06");
  assert.equal(ready.preview.customer_account, "ACME-CORP");
  assert.equal(ready.result.billing_month, "2026-06");
  assert.equal(ready.result.customer_account, "ACME-CORP");
  assert.equal(ready.preview_readiness_source, previewReadinessSetupApi);
  assert.deepEqual(ready.result, {
    billing_month: "2026-06",
    customer_account: "ACME-CORP",
    delivery_surface: "billing_payment_action_disabled_setup_only",
    external_send: false,
    invoicePdfEnabled: false,
    invoiceSendingEnabled: false,
    invoice_pdf_generation: {
      invoicePdfEnabled: false,
      status: "blocked",
    },
    invoice_sending: {
      external_send: false,
      invoiceSendingEnabled: false,
      status: "blocked",
    },
    liveBillingEnabled: false,
    no_op: true,
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    payment_links: {
      paymentLinksEnabled: false,
      paymentProviderConfigured: false,
      status: "blocked",
    },
    payoutAutomationEnabled: false,
    payout_automation: {
      payoutAutomationEnabled: false,
      status: "blocked",
    },
    preview_readiness_source: previewReadinessSetupApi,
    productionAutoBillingEnabled: false,
    production_auto_billing: {
      liveBillingEnabled: false,
      productionAutoBillingEnabled: false,
      status: "blocked",
    },
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    version: "admin-billing-payment-readiness-setup-foundation-v1",
  });
  assertNoUnsafeOutput(ready, "Ready response");

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        billingMonth: "2026-13",
        customerAccount: "driver_payout_secret",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafe.preview.billing_month, null);
  assert.equal(unsafe.preview.customer_account, null);
  assert.equal(unsafe.result.billing_month, null);
  assert.equal(unsafe.result.customer_account, null);
  assertBillingPaymentActionDisabled(unsafe, "Unsafe response");
  assertNoOpResult(unsafe.result, "Unsafe result");
  assertNoUnsafeOutput(unsafe, "Unsafe response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin billing/payment action disabled setup API contract passed");
