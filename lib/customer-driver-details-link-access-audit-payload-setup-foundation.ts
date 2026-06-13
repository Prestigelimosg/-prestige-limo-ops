import "server-only";

import {
  buildCustomerDriverDetailsLinkSetup,
  type CustomerDriverDetailsLinkSetupInput,
  type CustomerDriverDetailsLinkSetupResult,
} from "./customer-driver-details-link-setup-foundation";

export const customerDriverDetailsLinkAccessAuditPayloadSetupFoundationVersion =
  "customer-driver-details-link-access-audit-payload-setup-foundation-v1";

export const customerDriverDetailsLinkAccessAuditActionSources = [
  "disabled_access_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type CustomerDriverDetailsLinkAccessAuditActionSource =
  (typeof customerDriverDetailsLinkAccessAuditActionSources)[number];

export type CustomerDriverDetailsLinkAccessAuditPayloadMissingRequirement =
  | "action_source"
  | "booking_reference"
  | "disabled_access_result";

export type CustomerDriverDetailsLinkAccessAuditPayloadSetupInput =
  CustomerDriverDetailsLinkSetupInput & {
    actionSource?: unknown;
    action_source?: unknown;
    disabledAccess?: unknown;
    disabled_access?: unknown;
    linkAccessResult?: unknown;
    link_access_result?: unknown;
    setup?: CustomerDriverDetailsLinkSetupResult | null;
  };

export type CustomerDriverDetailsLinkAccessAuditBlockedNoOpResult = {
  external_send: false;
  linkEnabled: false;
  liveAccessEnabled: false;
  no_op: true;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
  tokenIssued: false;
};

export type CustomerDriverDetailsLinkAccessAuditPayloadSetupResult = {
  actionSource: CustomerDriverDetailsLinkAccessAuditActionSource | null;
  action_source: CustomerDriverDetailsLinkAccessAuditActionSource | null;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: CustomerDriverDetailsLinkAccessAuditActionSource | null;
    action_source: CustomerDriverDetailsLinkAccessAuditActionSource | null;
    auditWriteEnabled: false;
    bookingReference: string | null;
    booking_reference: string | null;
    channel: "customer_driver_details_secure_link";
    disabledAccessStatus: "blocked" | "missing";
    disabled_access_source: "customer-driver-details-link-access-disabled-setup";
    disabled_access_status: "blocked" | "missing";
    external_send: false;
    linkEnabled: false;
    linkReadinessStatus: "ready_for_future_setup" | "blocked";
    link_readiness_status: "ready_for_future_setup" | "blocked";
    liveAccessEnabled: false;
    placeholderTokenReference: string;
    placeholder_token_reference: string;
    preview_readiness_source: "admin-customer-driver-details-link-preview-readiness-setup";
    result: CustomerDriverDetailsLinkAccessAuditBlockedNoOpResult;
    tokenIssued: false;
  };
  audit_write_enabled: false;
  blocked_no_op_result: CustomerDriverDetailsLinkAccessAuditBlockedNoOpResult;
  bookingReference: string | null;
  booking_reference: string | null;
  channel: "customer_driver_details_secure_link";
  delivery_surface: "customer_driver_details_link_access_audit_payload_setup_only";
  disabledAccessStatus: "blocked" | "missing";
  disabled_access_status: "blocked" | "missing";
  external_send: false;
  linkEnabled: false;
  liveAccessEnabled: false;
  missing_requirements: CustomerDriverDetailsLinkAccessAuditPayloadMissingRequirement[];
  placeholderTokenReference: string;
  placeholder_token_reference: string;
  status: "setup_only";
  tokenIssued: false;
  version: typeof customerDriverDetailsLinkAccessAuditPayloadSetupFoundationVersion;
};

const disabledAccessSource = "customer-driver-details-link-access-disabled-setup" as const;
const previewReadinessSource = "admin-customer-driver-details-link-preview-readiness-setup" as const;

const blockedNoOpResult: CustomerDriverDetailsLinkAccessAuditBlockedNoOpResult = {
  external_send: false,
  linkEnabled: false,
  liveAccessEnabled: false,
  no_op: true,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  status: "blocked",
  tokenIssued: false,
};

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeActionSource(
  value: unknown,
): CustomerDriverDetailsLinkAccessAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return customerDriverDetailsLinkAccessAuditActionSources.includes(
    normalized as CustomerDriverDetailsLinkAccessAuditActionSource,
  )
    ? (normalized as CustomerDriverDetailsLinkAccessAuditActionSource)
    : null;
}

function setupFrom(
  input: CustomerDriverDetailsLinkAccessAuditPayloadSetupInput,
): CustomerDriverDetailsLinkSetupResult {
  return input.setup ?? buildCustomerDriverDetailsLinkSetup(input);
}

function disabledAccessFrom(input: CustomerDriverDetailsLinkAccessAuditPayloadSetupInput) {
  return safeRecord(
    firstValue(
      input.disabledAccess,
      input.disabled_access,
      input.linkAccessResult,
      input.link_access_result,
    ),
  );
}

function hasBlockedNoOpAccessResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "customer_driver_details_link_access_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.external_send === false &&
    value.linkEnabled === false &&
    value.liveAccessEnabled === false &&
    value.tokenIssued === false
  );
}

export function buildCustomerDriverDetailsLinkAccessAuditPayloadSetup(
  input: CustomerDriverDetailsLinkAccessAuditPayloadSetupInput,
): CustomerDriverDetailsLinkAccessAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAccess = disabledAccessFrom(input);
  const disabledAccessReady = hasBlockedNoOpAccessResult(disabledAccess);
  const bookingReference = setup.payload.booking_reference;
  const placeholderTokenReference = setup.payload.customer_safe_token_placeholder;
  const missingRequirements: CustomerDriverDetailsLinkAccessAuditPayloadMissingRequirement[] = [];
  const disabledAccessStatus = disabledAccessReady ? "blocked" : "missing";
  const linkReadinessStatus = setup.linkPayloadReady ? "ready_for_future_setup" : "blocked";

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!bookingReference) {
    missingRequirements.push("booking_reference");
  }

  if (!disabledAccessReady) {
    missingRequirements.push("disabled_access_result");
  }

  return {
    actionSource,
    action_source: actionSource,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource,
      action_source: actionSource,
      auditWriteEnabled: false,
      bookingReference,
      booking_reference: bookingReference,
      channel: setup.channel,
      disabledAccessStatus,
      disabled_access_source: disabledAccessSource,
      disabled_access_status: disabledAccessStatus,
      external_send: false,
      linkEnabled: false,
      linkReadinessStatus,
      link_readiness_status: linkReadinessStatus,
      liveAccessEnabled: false,
      placeholderTokenReference,
      placeholder_token_reference: placeholderTokenReference,
      preview_readiness_source: previewReadinessSource,
      result: blockedNoOpResult,
      tokenIssued: false,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    bookingReference,
    booking_reference: bookingReference,
    channel: setup.channel,
    delivery_surface: "customer_driver_details_link_access_audit_payload_setup_only",
    disabledAccessStatus,
    disabled_access_status: disabledAccessStatus,
    external_send: false,
    linkEnabled: false,
    liveAccessEnabled: false,
    missing_requirements: missingRequirements,
    placeholderTokenReference,
    placeholder_token_reference: placeholderTokenReference,
    status: "setup_only",
    tokenIssued: false,
    version: customerDriverDetailsLinkAccessAuditPayloadSetupFoundationVersion,
  };
}
