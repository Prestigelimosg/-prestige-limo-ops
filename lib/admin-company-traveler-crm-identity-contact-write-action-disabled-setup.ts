import "server-only";

import {
  adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion,
  buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup,
  type AdminCompanyTravelerCrmIdentityContactWriteContractInput,
  type AdminCompanyTravelerCrmIdentityContactWriteContractResult,
} from "./admin-company-traveler-crm-identity-contact-write-contract-setup-foundation";

export const adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion =
  "admin-company-traveler-crm-identity-contact-write-action-disabled-setup-v1";

export type AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult = {
  actionEnabled: false;
  actionScope: AdminCompanyTravelerCrmIdentityContactWriteContractResult["actionScope"];
  actionType: AdminCompanyTravelerCrmIdentityContactWriteContractResult["actionType"];
  action_enabled: false;
  action_scope: AdminCompanyTravelerCrmIdentityContactWriteContractResult["action_scope"];
  action_type: AdminCompanyTravelerCrmIdentityContactWriteContractResult["action_type"];
  adminReviewRequired: true;
  admin_review_required: true;
  company_fields: AdminCompanyTravelerCrmIdentityContactWriteContractResult["company_fields"];
  contract: AdminCompanyTravelerCrmIdentityContactWriteContractResult;
  contractReady: boolean;
  contract_ready: boolean;
  contract_source: "admin-company-traveler-crm-identity-contact-write-contract-setup";
  delivery_surface: "company_traveler_crm_identity_contact_write_action_disabled_setup_only";
  external_send: false;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  liveWriteEnabled: false;
  live_write_enabled: false;
  missing_requirements: AdminCompanyTravelerCrmIdentityContactWriteContractResult["missing_requirements"];
  no_op: true;
  ok: boolean;
  reason: "setup_only_disabled" | AdminCompanyTravelerCrmIdentityContactWriteContractResult["reason"];
  rejected_fields: string[];
  result_label: "blocked/no-op" | "rejected/no-op";
  status: "blocked" | "rejected";
  traveler_fields: AdminCompanyTravelerCrmIdentityContactWriteContractResult["traveler_fields"];
  unknown_fields: string[];
  version: typeof adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion;
  writeEnabled: false;
  write_enabled: false;
};

function disabledFields() {
  return {
    actionEnabled: false,
    action_enabled: false,
    adminReviewRequired: true,
    admin_review_required: true,
    external_send: false,
    liveWriteEnabled: false,
    live_write_enabled: false,
    writeEnabled: false,
    write_enabled: false,
  } as const;
}

export function buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup(
  input: AdminCompanyTravelerCrmIdentityContactWriteContractInput = {},
): AdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupResult {
  const contract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup(input);
  const status = contract.ok ? "blocked" : "rejected";

  return {
    ...disabledFields(),
    actionScope: contract.actionScope,
    actionType: contract.actionType,
    action_scope: contract.action_scope,
    action_type: contract.action_type,
    company_fields: contract.company_fields,
    contract,
    contractReady: contract.contractReady,
    contract_ready: contract.contract_ready,
    contract_source: "admin-company-traveler-crm-identity-contact-write-contract-setup",
    delivery_surface: "company_traveler_crm_identity_contact_write_action_disabled_setup_only",
    forbidden_fields_present: contract.forbidden_fields_present,
    invalid_fields: contract.invalid_fields,
    missing_requirements: contract.missing_requirements,
    no_op: true,
    ok: contract.ok,
    reason: contract.ok ? "setup_only_disabled" : contract.reason,
    rejected_fields: contract.rejected_fields,
    result_label: contract.ok ? "blocked/no-op" : "rejected/no-op",
    status,
    traveler_fields: contract.traveler_fields,
    unknown_fields: contract.unknown_fields,
    version: adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupVersion,
  };
}

export function fallbackAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup() {
  return buildAdminCompanyTravelerCrmIdentityContactWriteActionDisabledSetup({});
}

export const adminCompanyTravelerCrmIdentityContactWriteActionDisabledSetupContractVersion =
  adminCompanyTravelerCrmIdentityContactWriteContractSetupFoundationVersion;
