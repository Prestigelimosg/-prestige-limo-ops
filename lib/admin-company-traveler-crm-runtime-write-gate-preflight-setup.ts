import "server-only";

import {
  buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup,
  type AdminCompanyTravelerCrmIdentityContactWriteContractInput,
  type AdminCompanyTravelerCrmIdentityContactWriteContractResult,
} from "./admin-company-traveler-crm-identity-contact-write-contract-setup-foundation";

export const adminCompanyTravelerCrmRuntimeWriteGatePreflightSetupVersion =
  "admin-company-traveler-crm-runtime-write-gate-preflight-setup-v1";

export const adminCompanyTravelerCrmRuntimeWriteGateEnvName =
  "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";

export const adminCompanyTravelerCrmRuntimeWriteGatePreflightEnvNames = [
  adminCompanyTravelerCrmRuntimeWriteGateEnvName,
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;

const allowedCompanyFields = ["id", "company_name", "domain"] as const;
const allowedTravelerFields = [
  "id",
  "company_id",
  "traveler_name",
  "preferred_vehicle",
  "default_address",
  "default_pickup_address",
  "default_dropoff_address",
  "booker_name",
  "booker_contact",
  "booker_email",
] as const;
const forbiddenFieldGroups = [
  "rate_overrides",
  "customer_rates",
  "driver_payout_rules",
  "pricing",
  "payout",
  "payment_pdf_billing",
  "provider_send",
  "auth",
  "location_photo_calendar",
  "internal_admin_notes",
  "debug",
  "secrets_tokens",
] as const;
const missingRequirements = [
  "owner_gate_opening_approval",
  "env_name_verification_no_values",
  "companies_table_policy_verification",
  "travelers_table_policy_verification",
  "server_session_admin_dispatcher_verification",
  "rollback_disable_plan",
  "staging_no_post_write_smoke",
] as const;

export type AdminCompanyTravelerCrmRuntimeWriteGatePreflightSetupResult = {
  action_scope: AdminCompanyTravelerCrmIdentityContactWriteContractResult["action_scope"];
  action_type: AdminCompanyTravelerCrmIdentityContactWriteContractResult["action_type"];
  allowed_company_fields: typeof allowedCompanyFields;
  allowed_traveler_fields: typeof allowedTravelerFields;
  contract_ok: boolean;
  databaseClientEnabled: false;
  database_client_enabled: false;
  delivery_surface: "company_traveler_crm_runtime_write_gate_preflight_setup_only";
  env_gate_name: typeof adminCompanyTravelerCrmRuntimeWriteGateEnvName;
  env_names: typeof adminCompanyTravelerCrmRuntimeWriteGatePreflightEnvNames;
  env_values_visible: false;
  external_send: false;
  forbidden_field_groups: typeof forbiddenFieldGroups;
  forbidden_fields_present: string[];
  gateOpeningApproved: false;
  gate_opening_approved: false;
  gate_opening_status: "blocked";
  liveWriteEnabled: false;
  live_write_enabled: false;
  missing_requirements: typeof missingRequirements;
  no_op: true;
  readiness_status: "blocked_pending_gate_opening_approval";
  rejected_fields: string[];
  rollback_plan: {
    disable_env_gate: typeof adminCompanyTravelerCrmRuntimeWriteGateEnvName;
    keep_legacy_rate_override_fallback: true;
    no_live_write_until_verified: true;
    rerun_required_checks: string[];
  };
  safe_company_fields: AdminCompanyTravelerCrmIdentityContactWriteContractResult["company_fields"];
  safe_traveler_fields: AdminCompanyTravelerCrmIdentityContactWriteContractResult["traveler_fields"];
  status: "setup_only";
  table_policy_requirements: {
    companies: {
      allowed_write_fields: readonly ["company_name", "domain"];
      required: true;
      returned_fields: typeof allowedCompanyFields;
    };
    travelers: {
      allowed_write_fields: readonly [
        "company_id",
        "traveler_name",
        "preferred_vehicle",
        "default_address",
        "default_pickup_address",
        "default_dropoff_address",
        "booker_name",
        "booker_contact",
        "booker_email",
      ];
      required: true;
      returned_fields: typeof allowedTravelerFields;
    };
  };
  version: typeof adminCompanyTravelerCrmRuntimeWriteGatePreflightSetupVersion;
  writeEnabled: false;
  write_enabled: false;
};

export function buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup(
  input: AdminCompanyTravelerCrmIdentityContactWriteContractInput = {},
): AdminCompanyTravelerCrmRuntimeWriteGatePreflightSetupResult {
  const contract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup(input);

  return {
    action_scope: contract.action_scope,
    action_type: contract.action_type,
    allowed_company_fields: allowedCompanyFields,
    allowed_traveler_fields: allowedTravelerFields,
    contract_ok: contract.ok,
    databaseClientEnabled: false,
    database_client_enabled: false,
    delivery_surface: "company_traveler_crm_runtime_write_gate_preflight_setup_only",
    env_gate_name: adminCompanyTravelerCrmRuntimeWriteGateEnvName,
    env_names: adminCompanyTravelerCrmRuntimeWriteGatePreflightEnvNames,
    env_values_visible: false,
    external_send: false,
    forbidden_field_groups: forbiddenFieldGroups,
    forbidden_fields_present: contract.forbidden_fields_present,
    gateOpeningApproved: false,
    gate_opening_approved: false,
    gate_opening_status: "blocked",
    liveWriteEnabled: false,
    live_write_enabled: false,
    missing_requirements: missingRequirements,
    no_op: true,
    readiness_status: "blocked_pending_gate_opening_approval",
    rejected_fields: contract.rejected_fields,
    rollback_plan: {
      disable_env_gate: adminCompanyTravelerCrmRuntimeWriteGateEnvName,
      keep_legacy_rate_override_fallback: true,
      no_live_write_until_verified: true,
      rerun_required_checks: [
        "node scripts/test-company-traveler-crm-runtime-write-action-api-contract.mjs",
        "node scripts/test-company-traveler-crm-runtime-write-env-table-policy-guard.mjs",
        "node scripts/test-crm-identity-rate-override-payload-split.mjs",
        "node scripts/test-preactivation-verification-suite.mjs",
        "npm run lint",
        "npm run build",
      ],
    },
    safe_company_fields: contract.company_fields,
    safe_traveler_fields: contract.traveler_fields,
    status: "setup_only",
    table_policy_requirements: {
      companies: {
        allowed_write_fields: ["company_name", "domain"],
        required: true,
        returned_fields: allowedCompanyFields,
      },
      travelers: {
        allowed_write_fields: [
          "company_id",
          "traveler_name",
          "preferred_vehicle",
          "default_address",
          "default_pickup_address",
          "default_dropoff_address",
          "booker_name",
          "booker_contact",
          "booker_email",
        ],
        required: true,
        returned_fields: allowedTravelerFields,
      },
    },
    version: adminCompanyTravelerCrmRuntimeWriteGatePreflightSetupVersion,
    writeEnabled: false,
    write_enabled: false,
  };
}

export function fallbackAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup() {
  return buildAdminCompanyTravelerCrmRuntimeWriteGatePreflightSetup({});
}
