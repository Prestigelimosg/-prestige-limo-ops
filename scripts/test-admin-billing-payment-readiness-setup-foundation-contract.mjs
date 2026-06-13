import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Billing/payment readiness helper must stay server-only.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Billing/payment readiness helper must not define API behavior.");
assert.equal(/\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bSTRIPE_[A-Z_]*\b|\bPAYMENT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(source), false, "Billing/payment readiness helper must not read env/provider secrets.");
assert.equal(/import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun)["']|require\(\s*["'](?:@supabase\/supabase-js|stripe|pdfkit|jspdf|puppeteer|playwright|nodemailer|resend|sendgrid|mailgun)["']\s*\)/i.test(source), false, "Billing/payment readiness helper must not import DB, payment, PDF, or sending SDKs.");
assert.equal(/createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i.test(source), false, "Billing/payment readiness helper must not use DB reads or writes.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(/i.test(source), false, "Billing/payment readiness helper must not use network APIs.");
assert.equal(/generatePdf|pdfkit|new\s+PDFDocument|renderToStream|createInvoice|paymentIntent|checkout\.sessions|payoutTransfer|paynowTransfer|sendInvoice|sendMail\s*\(|messages\.create|client\.messages/i.test(source), false, "Billing/payment readiness helper must not generate PDFs, create payments, automate payouts, or send invoices.");
assert.equal(/invoicePdfEnabled\s*[:=]\s*true|invoiceSendingEnabled\s*[:=]\s*true|paymentLinksEnabled\s*[:=]\s*true|payoutAutomationEnabled\s*[:=]\s*true|productionAutoBillingEnabled\s*[:=]\s*true|paymentProviderConfigured\s*[:=]\s*true|liveBillingEnabled\s*[:=]\s*true/i.test(source), false, "Billing/payment readiness helper must not enable live billing flags.");
assert.equal(/legacy_shim|shim\s*\(/i.test(source), false, "Billing/payment readiness helper must not introduce shims.");

for (const fragment of [
  "adminBillingPaymentReadinessSetupFoundationVersion",
  "buildAdminBillingPaymentReadinessSetupFoundation",
  "billing_payment_readiness_setup_only",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "paymentLinksEnabled: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "paymentProviderConfigured: false",
  "liveBillingEnabled: false",
  "invoice_pdf_generation: \"planned_only\"",
  "invoice_sending: \"planned_only\"",
  "payment_links: \"planned_only\"",
  "payout_automation: \"planned_only\"",
  "production_auto_billing: \"planned_only\"",
]) {
  assert.ok(source.includes(fragment), `Missing billing/payment readiness setup fragment: ${fragment}`);
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-billing-payment-readiness-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

function assertBillingPaymentDisabled(value, label) {
  assert.equal(value.invoicePdfEnabled, false, `${label} must keep invoicePdfEnabled false.`);
  assert.equal(value.invoiceSendingEnabled, false, `${label} must keep invoiceSendingEnabled false.`);
  assert.equal(value.paymentLinksEnabled, false, `${label} must keep paymentLinksEnabled false.`);
  assert.equal(value.payoutAutomationEnabled, false, `${label} must keep payoutAutomationEnabled false.`);
  assert.equal(value.productionAutoBillingEnabled, false, `${label} must keep productionAutoBillingEnabled false.`);
  assert.equal(value.paymentProviderConfigured, false, `${label} must keep paymentProviderConfigured false.`);
  assert.equal(value.liveBillingEnabled, false, `${label} must keep liveBillingEnabled false.`);
}

const harness = await loadHelper();

try {
  const { buildAdminBillingPaymentReadinessSetupFoundation } = harness.helper;
  const setup = buildAdminBillingPaymentReadinessSetupFoundation({
    billing_month: "2026-06",
    customer_account: "ACME-CORP",
  });

  assert.deepEqual(setup, {
    billing_month: "2026-06",
    blocked_activation: {
      invoice_pdf_generation: "blocked",
      invoice_sending: "blocked",
      live_billing: "blocked",
      payment_links: "blocked",
      payment_provider: "missing",
      payout_automation: "blocked",
      production_auto_billing: "blocked",
    },
    customer_account: "ACME-CORP",
    invoice_pdf_generation_planned: true,
    invoice_sending_planned: true,
    invoicePdfEnabled: false,
    invoiceSendingEnabled: false,
    liveBillingEnabled: false,
    missing_requirements: [
      "invoice_pdf_generation_approval",
      "invoice_sending_approval",
      "payment_provider",
      "payment_links_approval",
      "payout_automation_approval",
      "production_auto_billing_approval",
      "live_billing_approval",
    ],
    payment_links_planned: true,
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    payout_automation_planned: true,
    payoutAutomationEnabled: false,
    planned_capabilities: {
      invoice_pdf_generation: "planned_only",
      invoice_sending: "planned_only",
      payment_links: "planned_only",
      payout_automation: "planned_only",
      production_auto_billing: "planned_only",
    },
    policyReady: true,
    policy_surface: "billing_payment_readiness_setup_only",
    production_auto_billing_planned: true,
    productionAutoBillingEnabled: false,
    status: "setup_only",
    version: "admin-billing-payment-readiness-setup-foundation-v1",
  });
  assertBillingPaymentDisabled(setup, "billing/payment readiness setup");

  const fallback = buildAdminBillingPaymentReadinessSetupFoundation();

  assert.equal(fallback.billing_month, null);
  assert.equal(fallback.customer_account, null);
  assertBillingPaymentDisabled(fallback, "fallback billing/payment readiness setup");

  const unsafe = buildAdminBillingPaymentReadinessSetupFoundation({
    billingMonth: "2026-13",
    customerAccount: "driver_payout_secret",
  });

  assert.equal(unsafe.billing_month, null);
  assert.equal(unsafe.customer_account, null);
  assertBillingPaymentDisabled(unsafe, "unsafe billing/payment readiness setup");
} finally {
  await harness.cleanup();
}

console.log("admin billing/payment readiness setup foundation contract passed");
