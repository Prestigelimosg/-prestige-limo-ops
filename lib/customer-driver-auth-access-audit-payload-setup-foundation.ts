import "server-only";

import {
  buildCustomerDriverAuthReadinessSetup,
  type CustomerDriverAuthReadinessSetupInput,
  type CustomerDriverAuthReadinessSetupResult,
} from "./customer-driver-auth-readiness-setup-foundation";

export const customerDriverAuthAccessAuditPayloadSetupFoundationVersion =
  "customer-driver-auth-access-audit-payload-setup-foundation-v1";

export const customerDriverAuthAccessAuditActorTypes = ["customer", "driver"] as const;
export const customerDriverAuthAccessAuditTargets = ["saved_booking", "job_visibility"] as const;
export const customerDriverAuthAccessAuditActionSources = [
  "disabled_auth_access_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type CustomerDriverAuthAccessAuditActorType =
  (typeof customerDriverAuthAccessAuditActorTypes)[number];
export type CustomerDriverAuthAccessAuditTarget =
  (typeof customerDriverAuthAccessAuditTargets)[number];
export type CustomerDriverAuthAccessAuditActionSource =
  (typeof customerDriverAuthAccessAuditActionSources)[number];

export type CustomerDriverAuthAccessAuditPayloadMissingRequirement =
  | "access_target"
  | "action_source"
  | "actor_type"
  | "disabled_auth_access_result";

export type CustomerDriverAuthAccessAuditPayloadSetupInput =
  CustomerDriverAuthReadinessSetupInput & {
    accessTarget?: unknown;
    access_target?: unknown;
    actionSource?: unknown;
    action_source?: unknown;
    actorType?: unknown;
    actor_type?: unknown;
    authAccessResult?: unknown;
    auth_access_result?: unknown;
    disabledAuthAccess?: unknown;
    disabled_auth_access?: unknown;
    disabledAuthAccessResult?: unknown;
    disabled_auth_access_result?: unknown;
    setup?: CustomerDriverAuthReadinessSetupResult | null;
  };

export type CustomerDriverAuthAccessAuditBlockedNoOpResult = {
  accessPolicyEnabled: false;
  authProviderConfigured: false;
  customerAuthEnabled: false;
  driverAuthEnabled: false;
  external_send: false;
  liveAccessEnabled: false;
  liveSessionEnabled: false;
  no_op: true;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
  tokenIssued: false;
};

export type CustomerDriverAuthAccessAuditPayloadSetupResult = {
  accessTarget: CustomerDriverAuthAccessAuditTarget | null;
  accessPolicyEnabled: false;
  access_target: CustomerDriverAuthAccessAuditTarget | null;
  actionSource: CustomerDriverAuthAccessAuditActionSource | null;
  action_source: CustomerDriverAuthAccessAuditActionSource | null;
  actorType: CustomerDriverAuthAccessAuditActorType | null;
  actor_type: CustomerDriverAuthAccessAuditActorType | null;
  auditWriteEnabled: false;
  audit_payload: {
    accessPolicyEnabled: false;
    accessTarget: CustomerDriverAuthAccessAuditTarget | null;
    access_target: CustomerDriverAuthAccessAuditTarget | null;
    actionSource: CustomerDriverAuthAccessAuditActionSource | null;
    action_source: CustomerDriverAuthAccessAuditActionSource | null;
    actorType: CustomerDriverAuthAccessAuditActorType | null;
    actor_type: CustomerDriverAuthAccessAuditActorType | null;
    auditWriteEnabled: false;
    authProviderConfigured: false;
    auth_readiness_status: "ready_for_future_setup" | "blocked";
    booking_reference: string | null;
    customerAuthEnabled: false;
    customer_account_reference: string | null;
    disabledAuthAccessStatus: "blocked" | "missing";
    disabled_auth_access_source: "admin-customer-driver-auth-access-disabled-setup";
    disabled_auth_access_status: "blocked" | "missing";
    driverAuthEnabled: false;
    driver_reference: string | null;
    external_send: false;
    liveAccessEnabled: false;
    liveSessionEnabled: false;
    preview_readiness_source: "admin-customer-driver-auth-readiness-preview-setup";
    result: CustomerDriverAuthAccessAuditBlockedNoOpResult;
    tokenIssued: false;
  };
  audit_write_enabled: false;
  authProviderConfigured: false;
  auth_readiness_status: "ready_for_future_setup" | "blocked";
  blocked_no_op_result: CustomerDriverAuthAccessAuditBlockedNoOpResult;
  booking_reference: string | null;
  customerAuthEnabled: false;
  customer_account_reference: string | null;
  delivery_surface: "customer_driver_auth_access_audit_payload_setup_only";
  disabledAuthAccessStatus: "blocked" | "missing";
  disabled_auth_access_status: "blocked" | "missing";
  driverAuthEnabled: false;
  driver_reference: string | null;
  external_send: false;
  liveAccessEnabled: false;
  liveSessionEnabled: false;
  missing_requirements: CustomerDriverAuthAccessAuditPayloadMissingRequirement[];
  status: "setup_only";
  tokenIssued: false;
  version: typeof customerDriverAuthAccessAuditPayloadSetupFoundationVersion;
};

const disabledAuthAccessSource = "admin-customer-driver-auth-access-disabled-setup" as const;
const previewReadinessSource = "admin-customer-driver-auth-readiness-preview-setup" as const;

const blockedNoOpResult: CustomerDriverAuthAccessAuditBlockedNoOpResult = {
  accessPolicyEnabled: false,
  authProviderConfigured: false,
  customerAuthEnabled: false,
  driverAuthEnabled: false,
  external_send: false,
  liveAccessEnabled: false,
  liveSessionEnabled: false,
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

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function normalizeActorType(value: unknown): CustomerDriverAuthAccessAuditActorType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return customerDriverAuthAccessAuditActorTypes.includes(
    normalized as CustomerDriverAuthAccessAuditActorType,
  )
    ? (normalized as CustomerDriverAuthAccessAuditActorType)
    : null;
}

function normalizeAccessTarget(value: unknown): CustomerDriverAuthAccessAuditTarget | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return customerDriverAuthAccessAuditTargets.includes(
    normalized as CustomerDriverAuthAccessAuditTarget,
  )
    ? (normalized as CustomerDriverAuthAccessAuditTarget)
    : null;
}

function normalizeActionSource(value: unknown): CustomerDriverAuthAccessAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return customerDriverAuthAccessAuditActionSources.includes(
    normalized as CustomerDriverAuthAccessAuditActionSource,
  )
    ? (normalized as CustomerDriverAuthAccessAuditActionSource)
    : null;
}

function setupFrom(
  input: CustomerDriverAuthAccessAuditPayloadSetupInput,
): CustomerDriverAuthReadinessSetupResult {
  return input.setup ?? buildCustomerDriverAuthReadinessSetup(input);
}

function disabledAuthAccessFrom(input: CustomerDriverAuthAccessAuditPayloadSetupInput) {
  return safeRecord(
    firstValue(
      input.disabledAuthAccess,
      input.disabled_auth_access,
      input.disabledAuthAccessResult,
      input.disabled_auth_access_result,
      input.authAccessResult,
      input.auth_access_result,
    ),
  );
}

function hasBlockedNoOpAuthAccessResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "customer_driver_auth_access_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.external_send === false &&
    value.customerAuthEnabled === false &&
    value.driverAuthEnabled === false &&
    value.liveSessionEnabled === false &&
    value.authProviderConfigured === false &&
    value.accessPolicyEnabled === false &&
    value.tokenIssued === false &&
    value.liveAccessEnabled === false
  );
}

function authReadinessStatusFrom(setup: CustomerDriverAuthReadinessSetupResult) {
  return setup.policyReady === true ? "ready_for_future_setup" : "blocked";
}

export function buildCustomerDriverAuthAccessAuditPayloadSetup(
  input: CustomerDriverAuthAccessAuditPayloadSetupInput,
): CustomerDriverAuthAccessAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actorType = normalizeActorType(firstValue(input.actorType, input.actor_type));
  const accessTarget = normalizeAccessTarget(firstValue(input.accessTarget, input.access_target));
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAuthAccess = disabledAuthAccessFrom(input);
  const disabledAuthAccessReady = hasBlockedNoOpAuthAccessResult(disabledAuthAccess);
  const disabledAuthAccessStatus = disabledAuthAccessReady ? "blocked" : "missing";
  const authReadinessStatus = authReadinessStatusFrom(setup);
  const missingRequirements: CustomerDriverAuthAccessAuditPayloadMissingRequirement[] = [];

  if (!actorType) {
    missingRequirements.push("actor_type");
  }

  if (!accessTarget) {
    missingRequirements.push("access_target");
  }

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!disabledAuthAccessReady) {
    missingRequirements.push("disabled_auth_access_result");
  }

  return {
    accessPolicyEnabled: false,
    accessTarget,
    access_target: accessTarget,
    actionSource,
    action_source: actionSource,
    actorType,
    actor_type: actorType,
    auditWriteEnabled: false,
    audit_payload: {
      accessPolicyEnabled: false,
      accessTarget,
      access_target: accessTarget,
      actionSource,
      action_source: actionSource,
      actorType,
      actor_type: actorType,
      auditWriteEnabled: false,
      authProviderConfigured: false,
      auth_readiness_status: authReadinessStatus,
      booking_reference: setup.booking_reference,
      customerAuthEnabled: false,
      customer_account_reference: setup.customer_account_reference,
      disabledAuthAccessStatus,
      disabled_auth_access_source: disabledAuthAccessSource,
      disabled_auth_access_status: disabledAuthAccessStatus,
      driverAuthEnabled: false,
      driver_reference: setup.driver_reference,
      external_send: false,
      liveAccessEnabled: false,
      liveSessionEnabled: false,
      preview_readiness_source: previewReadinessSource,
      result: blockedNoOpResult,
      tokenIssued: false,
    },
    audit_write_enabled: false,
    authProviderConfigured: false,
    auth_readiness_status: authReadinessStatus,
    blocked_no_op_result: blockedNoOpResult,
    booking_reference: setup.booking_reference,
    customerAuthEnabled: false,
    customer_account_reference: setup.customer_account_reference,
    delivery_surface: "customer_driver_auth_access_audit_payload_setup_only",
    disabledAuthAccessStatus,
    disabled_auth_access_status: disabledAuthAccessStatus,
    driverAuthEnabled: false,
    driver_reference: setup.driver_reference,
    external_send: false,
    liveAccessEnabled: false,
    liveSessionEnabled: false,
    missing_requirements: missingRequirements,
    status: "setup_only",
    tokenIssued: false,
    version: customerDriverAuthAccessAuditPayloadSetupFoundationVersion,
  };
}
