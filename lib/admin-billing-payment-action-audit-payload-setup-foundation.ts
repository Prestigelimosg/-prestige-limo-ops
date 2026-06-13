import "server-only";

import {
  buildAdminBillingPaymentReadinessSetupFoundation,
  type AdminBillingPaymentReadinessSetupInput,
  type AdminBillingPaymentReadinessSetupResult,
} from "./admin-billing-payment-readiness-setup-foundation";

export const adminBillingPaymentActionAuditPayloadSetupFoundationVersion =
  "admin-billing-payment-action-audit-payload-setup-foundation-v1";

export const adminBillingPaymentActionAuditActionTypes = [
  "invoice_pdf",
  "invoice_send",
  "payment_link",
  "payout_automation",
  "auto_billing",
] as const;
export const adminBillingPaymentActionAuditActionSources = [
  "disabled_action_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type AdminBillingPaymentActionAuditActionType =
  (typeof adminBillingPaymentActionAuditActionTypes)[number];
export type AdminBillingPaymentActionAuditActionSource =
  (typeof adminBillingPaymentActionAuditActionSources)[number];

export type AdminBillingPaymentActionAuditPayloadMissingRequirement =
  | "action_source"
  | "action_type"
  | "disabled_action_result";

export type AdminBillingPaymentActionAuditPayloadSetupInput =
  AdminBillingPaymentReadinessSetupInput & {
    actionResult?: unknown;
    actionSource?: unknown;
    actionType?: unknown;
    action_result?: unknown;
    action_source?: unknown;
    action_type?: unknown;
    billingPaymentActionResult?: unknown;
    billing_payment_action_result?: unknown;
    disabledAction?: unknown;
    disabledActionResult?: unknown;
    disabled_action?: unknown;
    disabled_action_result?: unknown;
    setup?: AdminBillingPaymentReadinessSetupResult | null;
  };

export type AdminBillingPaymentActionAuditBlockedNoOpResult = {
  external_send: false;
  invoicePdfEnabled: false;
  invoiceSendingEnabled: false;
  liveBillingEnabled: false;
  no_op: true;
  paymentLinksEnabled: false;
  paymentProviderConfigured: false;
  payoutAutomationEnabled: false;
  productionAutoBillingEnabled: false;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
};

export type AdminBillingPaymentActionAuditPayloadSetupResult = {
  actionSource: AdminBillingPaymentActionAuditActionSource | null;
  actionType: AdminBillingPaymentActionAuditActionType | null;
  action_source: AdminBillingPaymentActionAuditActionSource | null;
  action_type: AdminBillingPaymentActionAuditActionType | null;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: AdminBillingPaymentActionAuditActionSource | null;
    actionType: AdminBillingPaymentActionAuditActionType | null;
    action_source: AdminBillingPaymentActionAuditActionSource | null;
    action_type: AdminBillingPaymentActionAuditActionType | null;
    auditWriteEnabled: false;
    billing_month: string | null;
    billing_readiness_status: "ready_for_future_setup" | "blocked";
    blocked_no_op_result: AdminBillingPaymentActionAuditBlockedNoOpResult;
    customer_account: string | null;
    disabled_action_source: "admin-billing-payment-action-disabled-setup";
    disabled_action_status: "blocked" | "missing";
    disabledActionStatus: "blocked" | "missing";
    external_send: false;
    invoicePdfEnabled: false;
    invoiceSendingEnabled: false;
    liveBillingEnabled: false;
    paymentLinksEnabled: false;
    paymentProviderConfigured: false;
    payoutAutomationEnabled: false;
    preview_readiness_source: "admin-billing-payment-readiness-preview-setup";
    productionAutoBillingEnabled: false;
    result: AdminBillingPaymentActionAuditBlockedNoOpResult;
  };
  audit_write_enabled: false;
  billing_month: string | null;
  billing_readiness_status: "ready_for_future_setup" | "blocked";
  blocked_no_op_result: AdminBillingPaymentActionAuditBlockedNoOpResult;
  customer_account: string | null;
  delivery_surface: "billing_payment_action_audit_payload_setup_only";
  disabled_action_status: "blocked" | "missing";
  disabledActionStatus: "blocked" | "missing";
  external_send: false;
  invoicePdfEnabled: false;
  invoiceSendingEnabled: false;
  liveBillingEnabled: false;
  missing_requirements: AdminBillingPaymentActionAuditPayloadMissingRequirement[];
  paymentLinksEnabled: false;
  paymentProviderConfigured: false;
  payoutAutomationEnabled: false;
  productionAutoBillingEnabled: false;
  status: "setup_only";
  version: typeof adminBillingPaymentActionAuditPayloadSetupFoundationVersion;
};

const disabledActionSource = "admin-billing-payment-action-disabled-setup" as const;
const previewReadinessSource = "admin-billing-payment-readiness-preview-setup" as const;

const blockedNoOpResult: AdminBillingPaymentActionAuditBlockedNoOpResult = {
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

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeActionType(value: unknown): AdminBillingPaymentActionAuditActionType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminBillingPaymentActionAuditActionTypes.includes(
    normalized as AdminBillingPaymentActionAuditActionType,
  )
    ? (normalized as AdminBillingPaymentActionAuditActionType)
    : null;
}

function normalizeActionSource(value: unknown): AdminBillingPaymentActionAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminBillingPaymentActionAuditActionSources.includes(
    normalized as AdminBillingPaymentActionAuditActionSource,
  )
    ? (normalized as AdminBillingPaymentActionAuditActionSource)
    : null;
}

function setupFrom(
  input: AdminBillingPaymentActionAuditPayloadSetupInput,
): AdminBillingPaymentReadinessSetupResult {
  return input.setup ?? buildAdminBillingPaymentReadinessSetupFoundation(input);
}

function disabledActionFrom(input: AdminBillingPaymentActionAuditPayloadSetupInput) {
  return safeRecord(
    firstValue(
      input.disabledAction,
      input.disabled_action,
      input.disabledActionResult,
      input.disabled_action_result,
      input.billingPaymentActionResult,
      input.billing_payment_action_result,
      input.actionResult,
      input.action_result,
    ),
  );
}

function hasBlockedNoOpBillingPaymentActionResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "billing_payment_action_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.external_send === false &&
    value.invoicePdfEnabled === false &&
    value.invoiceSendingEnabled === false &&
    value.paymentLinksEnabled === false &&
    value.payoutAutomationEnabled === false &&
    value.productionAutoBillingEnabled === false &&
    value.paymentProviderConfigured === false &&
    value.liveBillingEnabled === false
  );
}

function billingReadinessStatusFrom(setup: AdminBillingPaymentReadinessSetupResult) {
  return setup.policyReady === true ? "ready_for_future_setup" : "blocked";
}

export function buildAdminBillingPaymentActionAuditPayloadSetup(
  input: AdminBillingPaymentActionAuditPayloadSetupInput,
): AdminBillingPaymentActionAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionType = normalizeActionType(firstValue(input.actionType, input.action_type));
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAction = disabledActionFrom(input);
  const disabledActionReady = hasBlockedNoOpBillingPaymentActionResult(disabledAction);
  const disabledActionStatus = disabledActionReady ? "blocked" : "missing";
  const billingReadinessStatus = billingReadinessStatusFrom(setup);
  const missingRequirements: AdminBillingPaymentActionAuditPayloadMissingRequirement[] = [];

  if (!actionType) {
    missingRequirements.push("action_type");
  }

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!disabledActionReady) {
    missingRequirements.push("disabled_action_result");
  }

  return {
    actionSource,
    actionType,
    action_source: actionSource,
    action_type: actionType,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource,
      actionType,
      action_source: actionSource,
      action_type: actionType,
      auditWriteEnabled: false,
      billing_month: setup.billing_month,
      billing_readiness_status: billingReadinessStatus,
      blocked_no_op_result: blockedNoOpResult,
      customer_account: setup.customer_account,
      disabled_action_source: disabledActionSource,
      disabled_action_status: disabledActionStatus,
      disabledActionStatus,
      external_send: false,
      invoicePdfEnabled: false,
      invoiceSendingEnabled: false,
      liveBillingEnabled: false,
      paymentLinksEnabled: false,
      paymentProviderConfigured: false,
      payoutAutomationEnabled: false,
      preview_readiness_source: previewReadinessSource,
      productionAutoBillingEnabled: false,
      result: blockedNoOpResult,
    },
    audit_write_enabled: false,
    billing_month: setup.billing_month,
    billing_readiness_status: billingReadinessStatus,
    blocked_no_op_result: blockedNoOpResult,
    customer_account: setup.customer_account,
    delivery_surface: "billing_payment_action_audit_payload_setup_only",
    disabled_action_status: disabledActionStatus,
    disabledActionStatus,
    external_send: false,
    invoicePdfEnabled: false,
    invoiceSendingEnabled: false,
    liveBillingEnabled: false,
    missing_requirements: missingRequirements,
    paymentLinksEnabled: false,
    paymentProviderConfigured: false,
    payoutAutomationEnabled: false,
    productionAutoBillingEnabled: false,
    status: "setup_only",
    version: adminBillingPaymentActionAuditPayloadSetupFoundationVersion,
  };
}
