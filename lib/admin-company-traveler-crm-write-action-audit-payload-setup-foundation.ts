import "server-only";

import {
  adminCompanyTravelerCrmWriteReadinessActionTypes,
  buildAdminCompanyTravelerCrmWriteReadinessSetup,
  type AdminCompanyTravelerCrmWriteReadinessActionScope,
  type AdminCompanyTravelerCrmWriteReadinessActionType,
  type AdminCompanyTravelerCrmWriteReadinessCompanyFields,
  type AdminCompanyTravelerCrmWriteReadinessSetupInput,
  type AdminCompanyTravelerCrmWriteReadinessSetupResult,
  type AdminCompanyTravelerCrmWriteReadinessTravelerFields,
} from "./admin-company-traveler-crm-write-readiness-setup-foundation";

export const adminCompanyTravelerCrmWriteActionAuditPayloadSetupFoundationVersion =
  "admin-company-traveler-crm-write-action-audit-payload-setup-foundation-v1";

export const adminCompanyTravelerCrmWriteActionAuditActionSources = [
  "disabled_action_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type AdminCompanyTravelerCrmWriteActionAuditActionSource =
  (typeof adminCompanyTravelerCrmWriteActionAuditActionSources)[number];

export type AdminCompanyTravelerCrmWriteActionAuditPayloadMissingRequirement =
  | "action_source"
  | "action_type"
  | "disabled_action_result";

export type AdminCompanyTravelerCrmWriteActionAuditPayloadSetupInput =
  AdminCompanyTravelerCrmWriteReadinessSetupInput & {
    actionResult?: unknown;
    actionSource?: unknown;
    action_result?: unknown;
    action_source?: unknown;
    companyTravelerCrmWriteActionResult?: unknown;
    company_traveler_crm_write_action_result?: unknown;
    disabledAction?: unknown;
    disabledActionResult?: unknown;
    disabled_action?: unknown;
    disabled_action_result?: unknown;
    setup?: AdminCompanyTravelerCrmWriteReadinessSetupResult | null;
  };

export type AdminCompanyTravelerCrmWriteActionAuditBlockedNoOpResult = {
  actionEnabled: false;
  adminReviewRequired: true;
  companyCreateEnabled: false;
  companyUpdateEnabled: false;
  external_send: false;
  liveWriteEnabled: false;
  nameMemoryWriteEnabled: false;
  no_op: true;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
  travelerCreateEnabled: false;
  travelerUpdateEnabled: false;
  writeEnabled: false;
};

export type AdminCompanyTravelerCrmWriteActionAuditPayloadSetupResult = {
  actionEnabled: false;
  actionSource: AdminCompanyTravelerCrmWriteActionAuditActionSource | null;
  actionType: AdminCompanyTravelerCrmWriteReadinessActionType | null;
  action_enabled: false;
  action_source: AdminCompanyTravelerCrmWriteActionAuditActionSource | null;
  action_type: AdminCompanyTravelerCrmWriteReadinessActionType | null;
  adminReviewRequired: true;
  admin_review_required: true;
  auditWriteEnabled: false;
  audit_payload: {
    actionEnabled: false;
    actionSource: AdminCompanyTravelerCrmWriteActionAuditActionSource | null;
    actionType: AdminCompanyTravelerCrmWriteReadinessActionType | null;
    action_enabled: false;
    action_source: AdminCompanyTravelerCrmWriteActionAuditActionSource | null;
    action_type: AdminCompanyTravelerCrmWriteReadinessActionType | null;
    adminReviewRequired: true;
    admin_review_required: true;
    auditWriteEnabled: false;
    blocked_no_op_result: AdminCompanyTravelerCrmWriteActionAuditBlockedNoOpResult;
    companyCreateEnabled: false;
    companyUpdateEnabled: false;
    company_create_enabled: false;
    company_fields: AdminCompanyTravelerCrmWriteReadinessCompanyFields;
    company_update_enabled: false;
    disabledActionStatus: "blocked" | "missing";
    disabled_action_source: "admin-company-traveler-crm-write-action-disabled-setup";
    disabled_action_status: "blocked" | "missing";
    entityType: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
    entity_type: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
    external_send: false;
    liveWriteEnabled: false;
    live_write_enabled: false;
    nameMemoryWriteEnabled: false;
    name_memory_write_enabled: false;
    preview_readiness_source: "admin-company-traveler-crm-write-readiness-preview-setup";
    result: AdminCompanyTravelerCrmWriteActionAuditBlockedNoOpResult;
    travelerCreateEnabled: false;
    travelerUpdateEnabled: false;
    traveler_create_enabled: false;
    traveler_fields: AdminCompanyTravelerCrmWriteReadinessTravelerFields;
    traveler_update_enabled: false;
    writeEnabled: false;
    write_enabled: false;
  };
  audit_write_enabled: false;
  blocked_no_op_result: AdminCompanyTravelerCrmWriteActionAuditBlockedNoOpResult;
  companyCreateEnabled: false;
  companyUpdateEnabled: false;
  company_create_enabled: false;
  company_fields: AdminCompanyTravelerCrmWriteReadinessCompanyFields;
  company_update_enabled: false;
  delivery_surface: "company_traveler_crm_write_action_audit_payload_setup_only";
  disabledActionStatus: "blocked" | "missing";
  disabled_action_status: "blocked" | "missing";
  entityType: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
  entity_type: AdminCompanyTravelerCrmWriteReadinessActionScope | null;
  external_send: false;
  liveWriteEnabled: false;
  live_write_enabled: false;
  missing_requirements: AdminCompanyTravelerCrmWriteActionAuditPayloadMissingRequirement[];
  nameMemoryWriteEnabled: false;
  name_memory_write_enabled: false;
  status: "setup_only";
  travelerCreateEnabled: false;
  travelerUpdateEnabled: false;
  traveler_create_enabled: false;
  traveler_fields: AdminCompanyTravelerCrmWriteReadinessTravelerFields;
  traveler_update_enabled: false;
  version: typeof adminCompanyTravelerCrmWriteActionAuditPayloadSetupFoundationVersion;
  writeEnabled: false;
  write_enabled: false;
};

const disabledActionSource = "admin-company-traveler-crm-write-action-disabled-setup" as const;
const previewReadinessSource = "admin-company-traveler-crm-write-readiness-preview-setup" as const;

const blockedNoOpResult: AdminCompanyTravelerCrmWriteActionAuditBlockedNoOpResult = {
  actionEnabled: false,
  adminReviewRequired: true,
  companyCreateEnabled: false,
  companyUpdateEnabled: false,
  external_send: false,
  liveWriteEnabled: false,
  nameMemoryWriteEnabled: false,
  no_op: true,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  status: "blocked",
  travelerCreateEnabled: false,
  travelerUpdateEnabled: false,
  writeEnabled: false,
};

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function normalizeActionSource(value: unknown): AdminCompanyTravelerCrmWriteActionAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminCompanyTravelerCrmWriteActionAuditActionSources.includes(
    normalized as AdminCompanyTravelerCrmWriteActionAuditActionSource,
  )
    ? (normalized as AdminCompanyTravelerCrmWriteActionAuditActionSource)
    : null;
}

function setupFrom(
  input: AdminCompanyTravelerCrmWriteActionAuditPayloadSetupInput,
): AdminCompanyTravelerCrmWriteReadinessSetupResult {
  return input.setup ?? buildAdminCompanyTravelerCrmWriteReadinessSetup(input);
}

function disabledActionFrom(input: AdminCompanyTravelerCrmWriteActionAuditPayloadSetupInput) {
  return safeRecord(
    firstValue(
      input.disabledAction,
      input.disabled_action,
      input.disabledActionResult,
      input.disabled_action_result,
      input.companyTravelerCrmWriteActionResult,
      input.company_traveler_crm_write_action_result,
      input.actionResult,
      input.action_result,
    ),
  );
}

function hasBlockedNoOpCrmWriteActionResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "company_traveler_crm_write_action_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.actionEnabled === false &&
    value.writeEnabled === false &&
    value.liveWriteEnabled === false &&
    value.adminReviewRequired === true &&
    value.companyCreateEnabled === false &&
    value.companyUpdateEnabled === false &&
    value.travelerCreateEnabled === false &&
    value.travelerUpdateEnabled === false &&
    value.nameMemoryWriteEnabled === false &&
    value.external_send === false
  );
}

function auditDisabledFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    adminReviewRequired: true,
    admin_review_required: true,
    auditWriteEnabled: false,
    audit_write_enabled: false,
    companyCreateEnabled: false,
    companyUpdateEnabled: false,
    company_create_enabled: false,
    company_update_enabled: false,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    nameMemoryWriteEnabled: false,
    name_memory_write_enabled: false,
    travelerCreateEnabled: false,
    travelerUpdateEnabled: false,
    traveler_create_enabled: false,
    traveler_update_enabled: false,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

export function buildAdminCompanyTravelerCrmWriteActionAuditPayloadSetup(
  input: AdminCompanyTravelerCrmWriteActionAuditPayloadSetupInput = {},
): AdminCompanyTravelerCrmWriteActionAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionType = adminCompanyTravelerCrmWriteReadinessActionTypes.includes(
    setup.actionType as AdminCompanyTravelerCrmWriteReadinessActionType,
  )
    ? setup.actionType
    : null;
  const entityType = setup.actionScope;
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledActionReady = hasBlockedNoOpCrmWriteActionResult(disabledActionFrom(input));
  const disabledActionStatus: "blocked" | "missing" = disabledActionReady ? "blocked" : "missing";
  const missingRequirements: AdminCompanyTravelerCrmWriteActionAuditPayloadMissingRequirement[] = [];
  const disabledFields = auditDisabledFields();

  if (!actionType) {
    missingRequirements.push("action_type");
  }

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!disabledActionReady) {
    missingRequirements.push("disabled_action_result");
  }

  const auditPayload = {
    ...disabledFields,
    actionSource,
    actionType,
    action_source: actionSource,
    action_type: actionType,
    blocked_no_op_result: blockedNoOpResult,
    company_fields: setup.company_fields,
    disabled_action_source: disabledActionSource,
    disabled_action_status: disabledActionStatus,
    disabledActionStatus,
    entityType,
    entity_type: entityType,
    preview_readiness_source: previewReadinessSource,
    result: blockedNoOpResult,
    traveler_fields: setup.traveler_fields,
  };

  return {
    ...disabledFields,
    actionSource,
    actionType,
    action_source: actionSource,
    action_type: actionType,
    audit_payload: auditPayload,
    blocked_no_op_result: blockedNoOpResult,
    company_fields: setup.company_fields,
    delivery_surface: "company_traveler_crm_write_action_audit_payload_setup_only",
    disabled_action_status: disabledActionStatus,
    disabledActionStatus,
    entityType,
    entity_type: entityType,
    missing_requirements: missingRequirements,
    status: "setup_only",
    traveler_fields: setup.traveler_fields,
    version: adminCompanyTravelerCrmWriteActionAuditPayloadSetupFoundationVersion,
  };
}
