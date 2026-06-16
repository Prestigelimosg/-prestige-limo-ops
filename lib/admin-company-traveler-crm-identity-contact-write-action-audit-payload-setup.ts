import "server-only";

import {
  adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupContractVersion,
  adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion,
  buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup,
  type AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult,
} from "./admin-company-traveler-crm-identity-contact-write-action-disabled-setup";
import type { AdminCompanyTravelerCrmIdentityContactWriteContractInput } from "./admin-company-traveler-crm-identity-contact-write-contract-setup-foundation";

export const adminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetupVersion =
  "admin-company-traveler-crm-identity-contact-write-action-audit-payload-setup-v1";

export type AdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetupResult = {
  actionEnabled: false;
  actionName: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["actionType"];
  actionType: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["actionType"];
  action_enabled: false;
  action_name: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["action_type"];
  action_type: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["action_type"];
  actorLabelPlaceholder: "future-admin-actor";
  actor_label_placeholder: "future-admin-actor";
  adminReviewRequired: true;
  admin_review_required: true;
  auditWriteEnabled: false;
  audit_payload: {
    actionEnabled: false;
    actionName: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["actionType"];
    actionType: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["actionType"];
    action_enabled: false;
    action_name: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["action_type"];
    action_type: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["action_type"];
    actorLabelPlaceholder: "future-admin-actor";
    actor_label_placeholder: "future-admin-actor";
    adminReviewRequired: true;
    admin_review_required: true;
    auditWriteEnabled: false;
    audit_write_enabled: false;
    company_field_names: string[];
    contract_source: "admin-company-traveler-crm-identity-contact-write-contract-setup";
    contract_version: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupContractVersion;
    delivery_surface: "company_traveler_crm_identity_contact_write_action_audit_payload_setup_only";
    disabledActionStatus: "blocked" | "rejected";
    disabledActionSource: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion;
    disabled_action_source: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion;
    disabled_action_status: "blocked" | "rejected";
    external_send: false;
    invalidOrUnknownFieldCount: number;
    invalid_or_unknown_field_count: number;
    liveWriteEnabled: false;
    live_write_enabled: false;
    no_op: true;
    reason: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["reason"];
    rejectedFieldCount: number;
    rejectedForbiddenFieldCount: number;
    rejectedForbiddenFieldSummary: "none" | "forbidden_fields_rejected";
    rejected_field_count: number;
    rejected_forbidden_field_count: number;
    rejected_forbidden_field_summary: "none" | "forbidden_fields_rejected";
    result_label: "blocked/no-op" | "rejected/no-op";
    safe_field_names: string[];
    status: "blocked" | "rejected";
    timestampPlaceholder: "future-audit-timestamp";
    timestamp_placeholder: "future-audit-timestamp";
    traveler_field_names: string[];
    writeEnabled: false;
    write_enabled: false;
  };
  audit_write_enabled: false;
  company_field_names: string[];
  contract_source: "admin-company-traveler-crm-identity-contact-write-contract-setup";
  contract_version: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupContractVersion;
  delivery_surface: "company_traveler_crm_identity_contact_write_action_audit_payload_setup_only";
  disabledActionSource: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion;
  disabledActionStatus: "blocked" | "rejected";
  disabled_action_source: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion;
  disabled_action_status: "blocked" | "rejected";
  external_send: false;
  invalidOrUnknownFieldCount: number;
  invalid_or_unknown_field_count: number;
  liveWriteEnabled: false;
  live_write_enabled: false;
  no_op: true;
  ok: boolean;
  reason: AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult["reason"];
  rejectedFieldCount: number;
  rejectedForbiddenFieldCount: number;
  rejectedForbiddenFieldSummary: "none" | "forbidden_fields_rejected";
  rejected_field_count: number;
  rejected_forbidden_field_count: number;
  rejected_forbidden_field_summary: "none" | "forbidden_fields_rejected";
  result_label: "blocked/no-op" | "rejected/no-op";
  safe_field_names: string[];
  status: "blocked" | "rejected";
  timestampPlaceholder: "future-audit-timestamp";
  timestamp_placeholder: "future-audit-timestamp";
  traveler_field_names: string[];
  version: typeof adminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetupVersion;
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

function presentFieldNames(fields: Record<string, unknown>) {
  return Object.entries(fields)
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([field]) => field)
    .sort();
}

function uniqueSorted(values: string[]) {
  return [...new Set(values)].sort();
}

export function buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup(
  input: AdminCompanyTravelerCrmIdentityContactWriteContractInput = {},
): AdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetupResult {
  const disabledAction = buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup(input);
  const fields = disabledAuditFields();
  const companyFieldNames = presentFieldNames(disabledAction.company_fields);
  const travelerFieldNames = presentFieldNames(disabledAction.traveler_fields);
  const safeFieldNames = uniqueSorted([...companyFieldNames, ...travelerFieldNames]);
  const rejectedForbiddenFieldCount = disabledAction.forbidden_fields_present.length;
  const rejectedFieldCount = disabledAction.rejected_fields.length;
  const invalidOrUnknownFieldCount =
    disabledAction.invalid_fields.length + disabledAction.unknown_fields.length;
  const rejectedForbiddenFieldSummary =
    rejectedForbiddenFieldCount > 0 ? "forbidden_fields_rejected" : "none";
  const resultLabel = disabledAction.status === "blocked" ? "blocked/no-op" : "rejected/no-op";
  const auditPayload = {
    ...fields,
    actionName: disabledAction.actionType,
    actionType: disabledAction.actionType,
    action_name: disabledAction.action_type,
    action_type: disabledAction.action_type,
    company_field_names: companyFieldNames,
    contract_source: "admin-company-traveler-crm-identity-contact-write-contract-setup" as const,
    contract_version: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupContractVersion,
    delivery_surface:
      "company_traveler_crm_identity_contact_write_action_audit_payload_setup_only" as const,
    disabledActionSource: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion,
    disabledActionStatus: disabledAction.status,
    disabled_action_source: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion,
    disabled_action_status: disabledAction.status,
    invalidOrUnknownFieldCount,
    invalid_or_unknown_field_count: invalidOrUnknownFieldCount,
    reason: disabledAction.reason,
    rejectedFieldCount,
    rejectedForbiddenFieldCount,
    rejectedForbiddenFieldSummary,
    rejected_field_count: rejectedFieldCount,
    rejected_forbidden_field_count: rejectedForbiddenFieldCount,
    rejected_forbidden_field_summary: rejectedForbiddenFieldSummary,
    result_label: resultLabel,
    safe_field_names: safeFieldNames,
    status: disabledAction.status,
    traveler_field_names: travelerFieldNames,
  };

  return {
    ...fields,
    actionName: disabledAction.actionType,
    actionType: disabledAction.actionType,
    action_name: disabledAction.action_type,
    action_type: disabledAction.action_type,
    audit_payload: auditPayload,
    company_field_names: companyFieldNames,
    contract_source: "admin-company-traveler-crm-identity-contact-write-contract-setup",
    contract_version: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupContractVersion,
    delivery_surface: "company_traveler_crm_identity_contact_write_action_audit_payload_setup_only",
    disabledActionSource: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion,
    disabledActionStatus: disabledAction.status,
    disabled_action_source: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion,
    disabled_action_status: disabledAction.status,
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
    result_label: resultLabel,
    safe_field_names: safeFieldNames,
    status: disabledAction.status,
    traveler_field_names: travelerFieldNames,
    version: adminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetupVersion,
  };
}

export function fallbackAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup() {
  return buildAdminCompanyTravelerCrmIdentityContactWriteActionAuditPayloadSetup({});
}
