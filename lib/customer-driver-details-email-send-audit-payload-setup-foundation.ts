import "server-only";

import type { AdminEmailSendDisabledAdapterResult } from "./admin-email-send-disabled-adapter";
import type { AdminEmailSendPolicySetupResult } from "./admin-email-send-policy-setup-foundation";
import type { CustomerDriverDetailsEmailReadinessSetupResult } from "./customer-driver-details-email-readiness-setup-foundation";
import type { CustomerDriverDetailsEmailSetupResult } from "./customer-driver-details-email-setup-foundation";

export const customerDriverDetailsEmailSendAuditPayloadSetupFoundationVersion =
  "customer-driver-details-email-send-audit-payload-setup-foundation-v1";

export const customerDriverDetailsEmailSendAuditActionSources = [
  "customer_copy_disabled_send_button",
  "disabled_send_api",
  "setup_contract_test",
] as const;

export type CustomerDriverDetailsEmailSendAuditActionSource =
  (typeof customerDriverDetailsEmailSendAuditActionSources)[number];

export type CustomerDriverDetailsEmailSendAuditPayloadMissingRequirement =
  | "action_source"
  | "booking_reference"
  | "customer_email"
  | "disabled_send_adapter";

export type CustomerDriverDetailsEmailSendAuditPayloadSetupInput = {
  actionSource?: unknown;
  disabledSend: AdminEmailSendDisabledAdapterResult | null;
  policy?: AdminEmailSendPolicySetupResult | null;
  readiness?: CustomerDriverDetailsEmailReadinessSetupResult | null;
  template?: CustomerDriverDetailsEmailSetupResult | null;
};

export type CustomerDriverDetailsEmailSendAuditBlockedNoOpResult = {
  external_send: false;
  liveSendingEnabled: false;
  no_op: true;
  reason: "setup_only_disabled";
  sendingEnabled: false;
  status: "blocked";
};

export type CustomerDriverDetailsEmailSendAuditPayloadSetupResult = {
  action_source: CustomerDriverDetailsEmailSendAuditActionSource | null;
  auditWriteEnabled: false;
  audit_payload: {
    action_source: CustomerDriverDetailsEmailSendAuditActionSource | null;
    auditWriteEnabled: false;
    booking_reference: string | null;
    customer_email: string | null;
    disabled_send_status: "blocked" | "missing";
    policy_decision: "allowed_for_future_setup" | "blocked";
    readiness_status: "ready_for_future_setup" | "blocked";
    result: CustomerDriverDetailsEmailSendAuditBlockedNoOpResult;
    template_key: string | null;
  };
  blocked_no_op_result: CustomerDriverDetailsEmailSendAuditBlockedNoOpResult;
  booking_reference: string | null;
  customer_email: string | null;
  delivery_surface: "customer_driver_details_email_send_audit_payload_setup_only";
  external_send: false;
  liveSendingEnabled: false;
  missing_requirements: CustomerDriverDetailsEmailSendAuditPayloadMissingRequirement[];
  sendingEnabled: false;
  status: "setup_only";
  version: typeof customerDriverDetailsEmailSendAuditPayloadSetupFoundationVersion;
};

function normalizeActionSource(value: unknown): CustomerDriverDetailsEmailSendAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return customerDriverDetailsEmailSendAuditActionSources.includes(
    normalized as CustomerDriverDetailsEmailSendAuditActionSource,
  )
    ? (normalized as CustomerDriverDetailsEmailSendAuditActionSource)
    : null;
}

function hasDisabledNoOpResult(disabledSend: AdminEmailSendDisabledAdapterResult | null) {
  return Boolean(
    disabledSend &&
      disabledSend.delivery_surface === "email_disabled" &&
      disabledSend.status === "blocked" &&
      disabledSend.reason === "setup_only_disabled" &&
      disabledSend.external_send === false &&
      disabledSend.sendingEnabled === false,
  );
}

function bookingReferenceFrom(input: CustomerDriverDetailsEmailSendAuditPayloadSetupInput) {
  return (
    input.disabledSend?.payload_preview.booking_reference ||
    input.template?.payload.booking_reference ||
    null
  );
}

function customerEmailFrom(input: CustomerDriverDetailsEmailSendAuditPayloadSetupInput) {
  return (
    input.disabledSend?.payload_preview.recipient_email ||
    input.template?.payload.customer_email ||
    null
  );
}

function templateKeyFrom(input: CustomerDriverDetailsEmailSendAuditPayloadSetupInput) {
  return input.template?.template.template_key || input.disabledSend?.payload_preview.template_key || null;
}

function policyDecisionFrom(input: CustomerDriverDetailsEmailSendAuditPayloadSetupInput) {
  return input.policy?.decision === "allowed_for_future_setup" ||
    input.readiness?.policy_decision === "allowed_for_future_setup"
    ? "allowed_for_future_setup"
    : "blocked";
}

function readinessStatusFrom(readiness: CustomerDriverDetailsEmailReadinessSetupResult | null | undefined) {
  return readiness?.readyForFutureSetup === true ? "ready_for_future_setup" : "blocked";
}

export function buildCustomerDriverDetailsEmailSendAuditPayloadSetup(
  input: CustomerDriverDetailsEmailSendAuditPayloadSetupInput,
): CustomerDriverDetailsEmailSendAuditPayloadSetupResult {
  const actionSource = normalizeActionSource(input.actionSource);
  const bookingReference = bookingReferenceFrom(input);
  const customerEmail = customerEmailFrom(input);
  const disabledSendReady = hasDisabledNoOpResult(input.disabledSend);
  const missingRequirements: CustomerDriverDetailsEmailSendAuditPayloadMissingRequirement[] = [];
  const blockedNoOpResult: CustomerDriverDetailsEmailSendAuditBlockedNoOpResult = {
    external_send: false,
    liveSendingEnabled: false,
    no_op: true,
    reason: "setup_only_disabled",
    sendingEnabled: false,
    status: "blocked",
  };

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!bookingReference) {
    missingRequirements.push("booking_reference");
  }

  if (!customerEmail) {
    missingRequirements.push("customer_email");
  }

  if (!disabledSendReady) {
    missingRequirements.push("disabled_send_adapter");
  }

  return {
    action_source: actionSource,
    auditWriteEnabled: false,
    audit_payload: {
      action_source: actionSource,
      auditWriteEnabled: false,
      booking_reference: bookingReference,
      customer_email: customerEmail,
      disabled_send_status: disabledSendReady ? "blocked" : "missing",
      policy_decision: policyDecisionFrom(input),
      readiness_status: readinessStatusFrom(input.readiness),
      result: blockedNoOpResult,
      template_key: templateKeyFrom(input),
    },
    blocked_no_op_result: blockedNoOpResult,
    booking_reference: bookingReference,
    customer_email: customerEmail,
    delivery_surface: "customer_driver_details_email_send_audit_payload_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: missingRequirements,
    sendingEnabled: false,
    status: "setup_only",
    version: customerDriverDetailsEmailSendAuditPayloadSetupFoundationVersion,
  };
}
