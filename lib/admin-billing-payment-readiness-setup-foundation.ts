import "server-only";

export const adminBillingPaymentReadinessSetupFoundationVersion =
  "admin-billing-payment-readiness-setup-foundation-v1";

export type AdminBillingPaymentReadinessSetupInput = {
  billingMonth?: unknown;
  billing_month?: unknown;
  customerAccount?: unknown;
  customer_account?: unknown;
};

export type AdminBillingPaymentReadinessMissingRequirement =
  | "invoice_pdf_generation_approval"
  | "invoice_sending_approval"
  | "live_billing_approval"
  | "payment_links_approval"
  | "payment_provider"
  | "payout_automation_approval"
  | "production_auto_billing_approval";

export type AdminBillingPaymentReadinessSetupResult = {
  billing_month: string | null;
  blocked_activation: {
    invoice_pdf_generation: "blocked";
    invoice_sending: "blocked";
    live_billing: "blocked";
    payment_links: "blocked";
    payment_provider: "missing";
    payout_automation: "blocked";
    production_auto_billing: "blocked";
  };
  customer_account: string | null;
  invoice_pdf_generation_planned: true;
  invoice_sending_planned: true;
  invoicePdfEnabled: false;
  invoiceSendingEnabled: false;
  liveBillingEnabled: false;
  missing_requirements: AdminBillingPaymentReadinessMissingRequirement[];
  payment_links_planned: true;
  paymentLinksEnabled: false;
  paymentProviderConfigured: false;
  payout_automation_planned: true;
  payoutAutomationEnabled: false;
  planned_capabilities: {
    invoice_pdf_generation: "planned_only";
    invoice_sending: "planned_only";
    payment_links: "planned_only";
    payout_automation: "planned_only";
    production_auto_billing: "planned_only";
  };
  policyReady: true;
  policy_surface: "billing_payment_readiness_setup_only";
  production_auto_billing_planned: true;
  productionAutoBillingEnabled: false;
  status: "setup_only";
  version: typeof adminBillingPaymentReadinessSetupFoundationVersion;
};

const forbiddenReferenceFragments = [
  "admin_finance",
  "admin_note",
  "auth",
  "billing_secret",
  "contact_email",
  "contact_phone",
  "cookie",
  "debug",
  "dev_archive",
  "driver_payout",
  "finance",
  "internal_admin",
  "internal_note",
  "mock_archive",
  "mock_qa",
  "pay_now",
  "paynow",
  "raw_token",
  "secret",
  "service_role",
  "stripe",
  "token",
];

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenReferenceFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenReferenceFragments.some((fragment) => normalized.includes(fragment));
}

function safeReference(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (
    !cleaned ||
    cleaned.length > 120 ||
    includesForbiddenReferenceFragment(cleaned) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function safeBillingMonth(value: unknown) {
  const cleaned = safeReference(value);
  const match = cleaned?.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? cleaned : null;
}

export function buildAdminBillingPaymentReadinessSetupFoundation(
  input: AdminBillingPaymentReadinessSetupInput = {},
): AdminBillingPaymentReadinessSetupResult {
  return {
    billing_month: safeBillingMonth(firstValue(input.billing_month, input.billingMonth)),
    blocked_activation: {
      invoice_pdf_generation: "blocked",
      invoice_sending: "blocked",
      live_billing: "blocked",
      payment_links: "blocked",
      payment_provider: "missing",
      payout_automation: "blocked",
      production_auto_billing: "blocked",
    },
    customer_account: safeReference(firstValue(input.customer_account, input.customerAccount)),
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
    version: adminBillingPaymentReadinessSetupFoundationVersion,
  };
}
