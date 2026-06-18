import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-public-billing-payment-surface-guard.mjs";

const disabledActionRoutePath = "app/api/admin-billing-payment-action-disabled-setup/route.ts";
const previewReadinessRoutePath = "app/api/admin-billing-payment-readiness-preview-setup/route.ts";
const readinessHelperPath = "lib/admin-billing-payment-readiness-setup-foundation.ts";
const auditPayloadHelperPath =
  "lib/admin-billing-payment-action-audit-payload-setup-foundation.ts";
const publicClientPaths = [
  "app/book/page.tsx",
  "app/my-bookings/page.tsx",
  "app/driver-job/[token]/page.tsx",
];

const contractChecks = [
  {
    label: "admin billing/payment readiness setup foundation contract",
    script: "scripts/test-admin-billing-payment-readiness-setup-foundation-contract.mjs",
    requiredFragments: [
      "billing_payment_readiness_setup_only",
      "planned_only",
      "admin billing/payment readiness setup foundation contract passed",
    ],
  },
  {
    label: "admin billing/payment readiness preview setup API contract",
    script: "scripts/test-admin-billing-payment-readiness-preview-setup-api-contract.mjs",
    requiredFragments: [
      "admin-billing-payment-readiness-preview-setup",
      "Billing/payment readiness preview API must stay admin-gated.",
      "admin billing/payment readiness preview setup API contract passed",
    ],
  },
  {
    label: "admin billing/payment action disabled setup API contract",
    script: "scripts/test-admin-billing-payment-action-disabled-setup-api-contract.mjs",
    requiredFragments: [
      "billing_payment_action_disabled_setup_only",
      "Disabled billing/payment action API must stay admin-gated.",
      "admin billing/payment action disabled setup API contract passed",
    ],
  },
  {
    label: "admin billing/payment action audit payload setup foundation contract",
    script: "scripts/test-admin-billing-payment-action-audit-payload-setup-foundation-contract.mjs",
    requiredFragments: [
      "billing_payment_action_audit_payload_setup_only",
      "auditWriteEnabled: false",
      "admin billing/payment action audit payload setup foundation contract passed",
    ],
  },
  {
    label: "billing/payment no-live guard",
    script: "scripts/test-admin-billing-payment-no-live-guard.mjs",
    requiredFragments: [
      "Billing/payment setup chain must not add duplicate or live billing/payment routes.",
      "billing/payment no-live guard passed",
    ],
  },
];

const routeForbiddenRuntimeFragments = [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "request.json",
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
  "cookies(",
  "headers(",
  "sendMail(",
  "sendInvoice(",
  "messages.create",
  "FormData",
  "createObjectURL",
];

const providerPaymentOrPdfPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@adyen\/api-library|@paypal\/checkout-server-sdk|@sendgrid\/mail|@stripe\/stripe-js|@supabase\/supabase-js|adyen|braintree|hitpay|jspdf|mailgun\.js|nodemailer|omise|paypal-rest-sdk|pdfkit|playwright|puppeteer|resend|square|stripe|xendit-node)["']|require\(\s*["'](?:@adyen\/api-library|@paypal\/checkout-server-sdk|@sendgrid\/mail|@stripe\/stripe-js|@supabase\/supabase-js|adyen|braintree|hitpay|jspdf|mailgun\.js|nodemailer|omise|paypal-rest-sdk|pdfkit|playwright|puppeteer|resend|square|stripe|xendit-node)["']\s*\)|\b(?:Adyen|Braintree|HitPay|JsPDF|Omise|PayPal|PDFDocument|Resend|Square|Stripe|Xendit)\b|sendMail\s*\(|sendInvoice\s*\(|messages\.create|checkout\.sessions|paymentIntent|paymentLinkUrl|payment_url|pdf_url|payout_amount|paynow/i;
const liveBillingFlagPattern =
  /invoicePdfEnabled\s*[:=]\s*true|invoiceSendingEnabled\s*[:=]\s*true|paymentLinksEnabled\s*[:=]\s*true|payoutAutomationEnabled\s*[:=]\s*true|productionAutoBillingEnabled\s*[:=]\s*true|paymentProviderConfigured\s*[:=]\s*true|liveBillingEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const liveBillingActivationPattern =
  /\b(?:generatePdf|createPdf|new\s+PDFDocument|renderToStream|createInvoice|sendInvoice|invoiceNumber|finalInvoice|paymentIntent|checkoutSession|createCheckout|paymentLinkUrl|payment_link_url|payment_url|payoutTransfer|paynowTransfer|payout_amount)\b/i;
const unsafeOutputPattern =
  /raw_token|service_role|server_secret|secret|api_key|access_token|checkout_session|payment_url|pdf_url|pdf_link|invoice_number|final_invoice|driver_payout|payout_amount|paynow|customer_price|amount_due|internal_admin|parser_debug|mock_archive/i;

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.toLowerCase().includes(String(fragmentOrPattern).toLowerCase());

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function exportedMethods(source) {
  return [...source.matchAll(/\bexport\s+async\s+function\s+(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\b/g)]
    .map((match) => match[1])
    .sort();
}

function stripForbiddenReferenceDenylist(source) {
  return source.replace(/const forbiddenReferenceFragments = \[[\s\S]*?\];\n/, "");
}

function runContractCheck({ label, script, requiredFragments }) {
  const scriptSource = files[script];

  for (const fragment of requiredFragments) {
    assertIncludes(scriptSource, fragment, `${label} contract fragment`);
  }

  const result = spawnSync(process.execPath, [script], {
    cwd: process.cwd(),
    encoding: "utf8",
    stdio: "pipe",
  });

  assert.equal(
    result.status,
    0,
    [
      `${label} failed while running ${script}.`,
      result.stdout.trim(),
      result.stderr.trim(),
    ]
      .filter(Boolean)
      .join("\n"),
  );
}

const allPaths = [
  ledgerPath,
  preactivationSuitePath,
  disabledActionRoutePath,
  previewReadinessRoutePath,
  readinessHelperPath,
  auditPayloadHelperPath,
  ...publicClientPaths,
  ...contractChecks.map(({ script }) => script),
];
const fileEntries = await Promise.all(
  [...new Set(allPaths)].map(async (path) => [path, await readFile(path, "utf8")]),
);
const files = Object.fromEntries(fileEntries);

const ledger = files[ledgerPath];
const preactivationSuite = files[preactivationSuitePath];
const disabledActionRoute = files[disabledActionRoutePath];
const previewReadinessRoute = files[previewReadinessRoutePath];
const readinessHelper = files[readinessHelperPath];
const auditPayloadHelper = files[auditPayloadHelperPath];
const ledgerSection = sectionBetween(ledger, "### Public Billing/Payment Surface Guard Lock");

for (const phrase of [
  "Public billing/payment setup surfaces are guarded across `/api/admin-billing-payment-action-disabled-setup`, `/api/admin-billing-payment-readiness-preview-setup`, `lib/admin-billing-payment-readiness-setup-foundation.ts`, `lib/admin-billing-payment-action-audit-payload-setup-foundation.ts`, and public client pages.",
  "This is a docs/test-only/read-only guard; it does not approve endpoint migration, env changes, deployment, live reads, DB writes, provider sends, migrations, parser changes, Save Booking changes, `/api/admin-saved-bookings` changes, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sectors, invoice PDF generation, invoice sending, payment links, payout automation, production auto-billing, or new shims.",
  "`/api/admin-billing-payment-action-disabled-setup` must remain behind the internal admin/dispatcher boundary, GET-only, setup-only, disabled/no-op, provider-free, payment-link-free, invoice-PDF-free, invoice-send-free, payout-automation-free, live-billing-free, cookie-free, and limited to blocked billing/payment action/readiness/preview payloads.",
  "`/api/admin-billing-payment-readiness-preview-setup` must remain behind the internal admin/dispatcher boundary and return setup-only preview/readiness payloads with `invoicePdfEnabled`, `invoiceSendingEnabled`, `paymentLinksEnabled`, `payoutAutomationEnabled`, `productionAutoBillingEnabled`, `paymentProviderConfigured`, and `liveBillingEnabled` all false.",
  "The readiness and action audit helpers must stay server-only, setup-only, no-live, no-op, and must not generate PDFs, send invoices, create payment links, automate payouts, read env, create Supabase clients, write audits, send providers, set cookies, or use file APIs.",
  "Public client pages must not call the billing/payment disabled action or admin preview routes until separate billing/payment activation/UI approval exists.",
  "Billing/payment setup surfaces must exclude customer price, driver payout, PayNow payout details, invoice numbers, payment URLs, PDF URLs, internal finance/admin notes, parser/debug internals, tokens/secrets, provider/send payloads, live location/photo fields, and mock QA/dev archive fields.",
  "This guard coordinates the readiness setup foundation contract, admin preview/readiness API contract, disabled action API contract, action audit payload setup contract, and billing/payment no-live guard in the preactivation suite.",
  "No Save Booking + CRM change.",
  "No `/api/admin-saved-bookings` change.",
  "Parser behavior and `/api/ai-parse` remain unchanged.",
  "No new shims are added.",
  "This lock adds `scripts/test-public-billing-payment-surface-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `Public billing/payment ledger phrase: ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation billing/payment guard registration");

for (const check of contractChecks) {
  runContractCheck(check);
}

assert.deepEqual(exportedMethods(disabledActionRoute), ["GET"], "disabled billing/payment action route exported methods");
assert.deepEqual(exportedMethods(previewReadinessRoute), ["GET"], "preview/readiness route exported methods");

for (const fragment of [
  "buildAdminBillingPaymentReadinessSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "billing_payment_action_disabled_setup_only",
  "preview_readiness_source: previewReadinessSetupApi",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "liveBillingEnabled: false",
  "paymentLinksEnabled: false",
  "paymentProviderConfigured: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "external_send: false",
  "no_op: true",
  "reason: \"setup_only_disabled\"",
  "result_label: \"blocked/no-op\"",
  "status: \"blocked\"",
]) {
  assertIncludes(disabledActionRoute, fragment, `disabled billing/payment action route ${fragment}`);
}

for (const fragment of [
  "buildAdminBillingPaymentReadinessSetupFoundation",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "requireAdminDispatcherBoundary(request)",
  "if (!boundary.ok)",
  "invoice_pdf_generation_planned",
  "invoice_sending_planned",
  "payment_links_planned",
  "payout_automation_planned",
  "production_auto_billing_planned",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "liveBillingEnabled: false",
  "paymentLinksEnabled: false",
  "paymentProviderConfigured: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
]) {
  assertIncludes(previewReadinessRoute, fragment, `preview/readiness route ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "liveBillingEnabled: false",
  "paymentLinksEnabled: false",
  "paymentProviderConfigured: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "policy_surface: \"billing_payment_readiness_setup_only\"",
  "invoice_pdf_generation: \"planned_only\"",
  "invoice_sending: \"planned_only\"",
  "payment_links: \"planned_only\"",
  "payout_automation: \"planned_only\"",
  "production_auto_billing: \"planned_only\"",
]) {
  assertIncludes(readinessHelper, fragment, `readiness helper ${fragment}`);
}

for (const fragment of [
  "import \"server-only\"",
  "delivery_surface: \"billing_payment_action_audit_payload_setup_only\"",
  "auditWriteEnabled: false",
  "audit_write_enabled: false",
  "external_send: false",
  "invoicePdfEnabled: false",
  "invoiceSendingEnabled: false",
  "liveBillingEnabled: false",
  "paymentLinksEnabled: false",
  "paymentProviderConfigured: false",
  "payoutAutomationEnabled: false",
  "productionAutoBillingEnabled: false",
  "blocked_no_op_result",
  "disabled_action_source: disabledActionSource",
  "preview_readiness_source: previewReadinessSource",
]) {
  assertIncludes(auditPayloadHelper, fragment, `action audit helper ${fragment}`);
}

for (const fragment of routeForbiddenRuntimeFragments) {
  assertExcludes(disabledActionRoute, fragment, "disabled billing/payment action route forbidden runtime fragment");
  assertExcludes(previewReadinessRoute, fragment, "preview/readiness route forbidden runtime fragment");
}

for (const [path, source] of [
  [disabledActionRoutePath, disabledActionRoute],
  [previewReadinessRoutePath, previewReadinessRoute],
  [readinessHelperPath, readinessHelper],
  [auditPayloadHelperPath, auditPayloadHelper],
]) {
  const scannedSource =
    path === readinessHelperPath ? stripForbiddenReferenceDenylist(source) : source;

  assertExcludes(scannedSource, providerPaymentOrPdfPattern, `${path} provider/payment/PDF fragment`);
  assertExcludes(scannedSource, liveBillingFlagPattern, `${path} live billing flag`);
  assertExcludes(scannedSource, liveBillingActivationPattern, `${path} live billing activation`);
  assertExcludes(scannedSource, unsafeOutputPattern, `${path} unsafe billing/payment output`);
}

for (const path of publicClientPaths) {
  const source = files[path];

  for (const fragment of [
    "/api/admin-billing-payment-action-disabled-setup",
    "/api/admin-billing-payment-readiness-preview-setup",
    "admin-billing-payment-action-disabled-setup",
    "admin-billing-payment-readiness-preview-setup",
    "invoicePdfEnabled",
    "invoiceSendingEnabled",
    "liveBillingEnabled",
    "paymentLinksEnabled",
    "paymentProviderConfigured",
    "payoutAutomationEnabled",
    "productionAutoBillingEnabled",
    "paymentLinkUrl",
    "payment_url",
    "pdf_url",
    "invoice_number",
    "x-prestige-admin-purpose",
    "x-prestige-admin-session-token",
    "Authorization",
    "document.cookie",
    "localStorage",
    "sessionStorage",
    "service_role",
    "SUPABASE_SERVICE",
    "STRIPE_",
  ]) {
    assertExcludes(source, fragment, `${path} billing/payment caller fragment`);
  }
}

console.log("Public billing/payment surface guard passed");
