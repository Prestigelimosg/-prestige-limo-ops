import "server-only";

import {
  adminFullDriverProfileActionDisabledSetupVersion,
  buildAdminFullDriverProfileActionDisabledSetup,
  type AdminFullDriverProfileActionDisabledSetupInput,
  type AdminFullDriverProfileActionDisabledSetupResult,
} from "./admin-full-driver-profile-action-disabled-setup";

export const adminFullDriverProfileActionAuditPayloadSetupVersion =
  "admin-full-driver-profile-action-audit-payload-setup-v1";

type FullDriverProfileActionType = AdminFullDriverProfileActionDisabledSetupResult["actionType"];
type FullDriverProfileActionName = AdminFullDriverProfileActionDisabledSetupResult["action_name"];
type FullDriverProfileActionReason = AdminFullDriverProfileActionDisabledSetupResult["reason"];
type FullDriverProfileActionStatus = AdminFullDriverProfileActionDisabledSetupResult["status"];

export type AdminFullDriverProfileActionAuditPayloadSetupResult = {
  actionEnabled: false;
  actionName: FullDriverProfileActionType;
  actionType: FullDriverProfileActionType;
  action_enabled: false;
  action_name: FullDriverProfileActionName;
  action_type: FullDriverProfileActionName;
  actorLabelPlaceholder: "future-admin-actor";
  actor_label_placeholder: "future-admin-actor";
  adminReviewRequired: true;
  admin_review_required: true;
  auditWriteEnabled: false;
  audit_payload: {
    actionEnabled: false;
    actionName: FullDriverProfileActionType;
    actionType: FullDriverProfileActionType;
    action_enabled: false;
    action_name: FullDriverProfileActionName;
    action_type: FullDriverProfileActionName;
    actorLabelPlaceholder: "future-admin-actor";
    actor_label_placeholder: "future-admin-actor";
    adminReviewRequired: true;
    admin_review_required: true;
    auditWriteEnabled: false;
    audit_write_enabled: false;
    contract_source: "admin-full-driver-profile-action-disabled-setup";
    delivery_surface: "admin_full_driver_profile_action_audit_payload_setup_only";
    disabledActionSource: typeof adminFullDriverProfileActionDisabledSetupVersion;
    disabledActionStatus: FullDriverProfileActionStatus;
    disabled_action_source: typeof adminFullDriverProfileActionDisabledSetupVersion;
    disabled_action_status: FullDriverProfileActionStatus;
    driver_profile_field_names: string[];
    external_send: false;
    invalidOrUnknownFieldCount: number;
    invalid_or_unknown_field_count: number;
    liveWriteEnabled: false;
    live_write_enabled: false;
    no_op: true;
    reason: FullDriverProfileActionReason;
    rejectedFieldCount: number;
    rejectedForbiddenFieldCount: number;
    rejectedForbiddenFieldSummary: "none" | "forbidden_fields_rejected";
    rejected_field_count: number;
    rejected_forbidden_field_count: number;
    rejected_forbidden_field_summary: "none" | "forbidden_fields_rejected";
    result_label: "blocked/no-op" | "rejected/no-op";
    safe_field_names: string[];
    status: FullDriverProfileActionStatus;
    timestampPlaceholder: "future-audit-timestamp";
    timestamp_placeholder: "future-audit-timestamp";
    writeEnabled: false;
    write_enabled: false;
  };
  audit_write_enabled: false;
  contract_source: "admin-full-driver-profile-action-disabled-setup";
  delivery_surface: "admin_full_driver_profile_action_audit_payload_setup_only";
  disabledActionSource: typeof adminFullDriverProfileActionDisabledSetupVersion;
  disabledActionStatus: FullDriverProfileActionStatus;
  disabled_action_source: typeof adminFullDriverProfileActionDisabledSetupVersion;
  disabled_action_status: FullDriverProfileActionStatus;
  driver_profile_field_names: string[];
  external_send: false;
  invalidOrUnknownFieldCount: number;
  invalid_or_unknown_field_count: number;
  liveWriteEnabled: false;
  live_write_enabled: false;
  no_op: true;
  ok: boolean;
  reason: FullDriverProfileActionReason;
  rejectedFieldCount: number;
  rejectedForbiddenFieldCount: number;
  rejectedForbiddenFieldSummary: "none" | "forbidden_fields_rejected";
  rejected_field_count: number;
  rejected_forbidden_field_count: number;
  rejected_forbidden_field_summary: "none" | "forbidden_fields_rejected";
  result_label: "blocked/no-op" | "rejected/no-op";
  safe_field_names: string[];
  status: FullDriverProfileActionStatus;
  timestampPlaceholder: "future-audit-timestamp";
  timestamp_placeholder: "future-audit-timestamp";
  version: typeof adminFullDriverProfileActionAuditPayloadSetupVersion;
  writeEnabled: false;
  write_enabled: false;
};

function disabledAuditFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    actorLabelPlaceholder: "future-admin-actor",
    actor_label_placeholder: "future-admin-actor",
    adminReviewRequired: true,
    admin_review_required: true,
    auditWriteEnabled: false,
    audit_write_enabled: false,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    no_op: true,
    timestampPlaceholder: "future-audit-timestamp",
    timestamp_placeholder: "future-audit-timestamp",
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

export function buildAdminFullDriverProfileActionAuditPayloadSetup(
  input: AdminFullDriverProfileActionDisabledSetupInput = {},
): AdminFullDriverProfileActionAuditPayloadSetupResult {
  const disabledAction = buildAdminFullDriverProfileActionDisabledSetup(input);
  const fields = disabledAuditFields();
  const safeFieldNames = [...disabledAction.driver_profile_field_names].sort();
  const rejectedForbiddenFieldCount = disabledAction.forbidden_fields_present.length;
  const rejectedFieldCount = disabledAction.rejected_fields.length;
  const invalidOrUnknownFieldCount =
    disabledAction.invalid_fields.length + disabledAction.unknown_fields.length;
  const rejectedForbiddenFieldSummary =
    rejectedForbiddenFieldCount > 0 ? "forbidden_fields_rejected" : "none";
  const auditPayload = {
    ...fields,
    actionName: disabledAction.actionType,
    actionType: disabledAction.actionType,
    action_name: disabledAction.action_type,
    action_type: disabledAction.action_type,
    contract_source: "admin-full-driver-profile-action-disabled-setup" as const,
    delivery_surface: "admin_full_driver_profile_action_audit_payload_setup_only" as const,
    disabledActionSource: adminFullDriverProfileActionDisabledSetupVersion,
    disabledActionStatus: disabledAction.status,
    disabled_action_source: adminFullDriverProfileActionDisabledSetupVersion,
    disabled_action_status: disabledAction.status,
    driver_profile_field_names: safeFieldNames,
    invalidOrUnknownFieldCount,
    invalid_or_unknown_field_count: invalidOrUnknownFieldCount,
    reason: disabledAction.reason,
    rejectedFieldCount,
    rejectedForbiddenFieldCount,
    rejectedForbiddenFieldSummary,
    rejected_field_count: rejectedFieldCount,
    rejected_forbidden_field_count: rejectedForbiddenFieldCount,
    rejected_forbidden_field_summary: rejectedForbiddenFieldSummary,
    result_label: disabledAction.result_label,
    safe_field_names: safeFieldNames,
    status: disabledAction.status,
  };

  return {
    ...fields,
    actionName: disabledAction.actionType,
    actionType: disabledAction.actionType,
    action_name: disabledAction.action_type,
    action_type: disabledAction.action_type,
    audit_payload: auditPayload,
    contract_source: "admin-full-driver-profile-action-disabled-setup",
    delivery_surface: "admin_full_driver_profile_action_audit_payload_setup_only",
    disabledActionSource: adminFullDriverProfileActionDisabledSetupVersion,
    disabledActionStatus: disabledAction.status,
    disabled_action_source: adminFullDriverProfileActionDisabledSetupVersion,
    disabled_action_status: disabledAction.status,
    driver_profile_field_names: safeFieldNames,
    invalidOrUnknownFieldCount,
    invalid_or_unknown_field_count: invalidOrUnknownFieldCount,
    ok: disabledAction.ok,
    reason: disabledAction.reason,
    rejectedFieldCount,
    rejectedForbiddenFieldCount,
    rejectedForbiddenFieldSummary,
    rejected_field_count: rejectedFieldCount,
    rejected_forbidden_field_count: rejectedForbiddenFieldCount,
    rejected_forbidden_field_summary: rejectedForbiddenFieldSummary,
    result_label: disabledAction.result_label,
    safe_field_names: safeFieldNames,
    status: disabledAction.status,
    version: adminFullDriverProfileActionAuditPayloadSetupVersion,
  };
}

export function fallbackAdminFullDriverProfileActionAuditPayloadSetup() {
  return buildAdminFullDriverProfileActionAuditPayloadSetup({});
}
