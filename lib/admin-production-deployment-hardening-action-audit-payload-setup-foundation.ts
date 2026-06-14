import "server-only";

import {
  buildAdminProductionDeploymentHardeningReadinessSetup,
  type AdminProductionDeploymentHardeningReadinessSetupInput,
  type AdminProductionDeploymentHardeningReadinessSetupResult,
} from "./admin-production-deployment-hardening-readiness-setup-foundation";

export const adminProductionDeploymentHardeningActionAuditPayloadSetupFoundationVersion =
  "admin-production-deployment-hardening-action-audit-payload-setup-foundation-v1";

export const adminProductionDeploymentHardeningActionAuditActionTypes = [
  "deployment_hardening",
  "live_db_write_approval",
  "migration_approval",
  "external_api_provider_env_activation",
  "payment_pdf_payout_auth_live_sending_live_location_photo_upload_activation",
] as const;
export const adminProductionDeploymentHardeningActionAuditActionSources = [
  "disabled_action_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type AdminProductionDeploymentHardeningActionAuditActionType =
  (typeof adminProductionDeploymentHardeningActionAuditActionTypes)[number];
export type AdminProductionDeploymentHardeningActionAuditActionSource =
  (typeof adminProductionDeploymentHardeningActionAuditActionSources)[number];

export type AdminProductionDeploymentHardeningActionAuditPayloadMissingRequirement =
  | "action_source"
  | "action_type"
  | "disabled_action_result";

export type AdminProductionDeploymentHardeningActionAuditPayloadSetupInput =
  AdminProductionDeploymentHardeningReadinessSetupInput & {
    actionResult?: unknown;
    actionSource?: unknown;
    actionType?: unknown;
    action_result?: unknown;
    action_source?: unknown;
    action_type?: unknown;
    disabledAction?: unknown;
    disabledActionResult?: unknown;
    disabled_action?: unknown;
    disabled_action_result?: unknown;
    productionHardeningActionResult?: unknown;
    production_hardening_action_result?: unknown;
    setup?: AdminProductionDeploymentHardeningReadinessSetupResult | null;
  };

export type AdminProductionDeploymentHardeningActionAuditBlockedNoOpResult = {
  authActivationEnabled: false;
  auth_activation_enabled: false;
  externalApiEnabled: false;
  external_api_enabled: false;
  liveDbWriteEnabled: false;
  liveSendingEnabled: false;
  live_db_write_enabled: false;
  live_location_enabled: false;
  live_sending_enabled: false;
  manualApprovalRequired: true;
  manual_approval_required: true;
  migrationEnabled: false;
  migration_enabled: false;
  no_op: true;
  paymentActivationEnabled: false;
  payment_activation_enabled: false;
  pdfGenerationEnabled: false;
  pdf_generation_enabled: false;
  photoUploadEnabled: false;
  photo_upload_enabled: false;
  productionDeploymentEnabled: false;
  production_deployment_enabled: false;
  providerEnvEnabled: false;
  provider_env_enabled: false;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  status: "blocked";
};

export type AdminProductionDeploymentHardeningActionAuditPayloadSetupResult = {
  actionSource: AdminProductionDeploymentHardeningActionAuditActionSource | null;
  actionType: AdminProductionDeploymentHardeningActionAuditActionType | null;
  action_source: AdminProductionDeploymentHardeningActionAuditActionSource | null;
  action_type: AdminProductionDeploymentHardeningActionAuditActionType | null;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: AdminProductionDeploymentHardeningActionAuditActionSource | null;
    actionType: AdminProductionDeploymentHardeningActionAuditActionType | null;
    action_source: AdminProductionDeploymentHardeningActionAuditActionSource | null;
    action_type: AdminProductionDeploymentHardeningActionAuditActionType | null;
    auditWriteEnabled: false;
    authActivationEnabled: false;
    auth_activation_enabled: false;
    blocked_no_op_result: AdminProductionDeploymentHardeningActionAuditBlockedNoOpResult;
    deployment_label: string | null;
    disabled_action_source: "admin-production-deployment-hardening-action-disabled-setup";
    disabled_action_status: "blocked" | "missing";
    disabledActionStatus: "blocked" | "missing";
    externalApiEnabled: false;
    external_api_enabled: false;
    liveDbWriteEnabled: false;
    liveSendingEnabled: false;
    live_db_write_enabled: false;
    live_sending_enabled: false;
    manualApprovalRequired: true;
    manual_approval_required: true;
    migrationEnabled: false;
    migration_enabled: false;
    paymentActivationEnabled: false;
    payment_activation_enabled: false;
    preview_readiness_source: "admin-production-deployment-hardening-readiness-preview-setup";
    productionDeploymentEnabled: false;
    production_deployment_enabled: false;
    production_readiness_status: "ready_for_future_setup" | "blocked";
    providerEnvEnabled: false;
    provider_env_enabled: false;
    release_candidate: string | null;
    result: AdminProductionDeploymentHardeningActionAuditBlockedNoOpResult;
  };
  audit_write_enabled: false;
  authActivationEnabled: false;
  auth_activation_enabled: false;
  blocked_no_op_result: AdminProductionDeploymentHardeningActionAuditBlockedNoOpResult;
  delivery_surface: "production_deployment_hardening_action_audit_payload_setup_only";
  deployment_label: string | null;
  disabled_action_status: "blocked" | "missing";
  disabledActionStatus: "blocked" | "missing";
  externalApiEnabled: false;
  external_api_enabled: false;
  liveDbWriteEnabled: false;
  liveSendingEnabled: false;
  live_db_write_enabled: false;
  live_sending_enabled: false;
  manualApprovalRequired: true;
  manual_approval_required: true;
  migrationEnabled: false;
  migration_enabled: false;
  missing_requirements: AdminProductionDeploymentHardeningActionAuditPayloadMissingRequirement[];
  paymentActivationEnabled: false;
  payment_activation_enabled: false;
  productionDeploymentEnabled: false;
  production_deployment_enabled: false;
  production_readiness_status: "ready_for_future_setup" | "blocked";
  providerEnvEnabled: false;
  provider_env_enabled: false;
  release_candidate: string | null;
  status: "setup_only";
  version: typeof adminProductionDeploymentHardeningActionAuditPayloadSetupFoundationVersion;
};

const disabledActionSource =
  "admin-production-deployment-hardening-action-disabled-setup" as const;
const previewReadinessSource =
  "admin-production-deployment-hardening-readiness-preview-setup" as const;

const blockedNoOpResult: AdminProductionDeploymentHardeningActionAuditBlockedNoOpResult = {
  authActivationEnabled: false,
  auth_activation_enabled: false,
  externalApiEnabled: false,
  external_api_enabled: false,
  liveDbWriteEnabled: false,
  liveSendingEnabled: false,
  live_db_write_enabled: false,
  live_location_enabled: false,
  live_sending_enabled: false,
  manualApprovalRequired: true,
  manual_approval_required: true,
  migrationEnabled: false,
  migration_enabled: false,
  no_op: true,
  paymentActivationEnabled: false,
  payment_activation_enabled: false,
  pdfGenerationEnabled: false,
  pdf_generation_enabled: false,
  photoUploadEnabled: false,
  photo_upload_enabled: false,
  productionDeploymentEnabled: false,
  production_deployment_enabled: false,
  providerEnvEnabled: false,
  provider_env_enabled: false,
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

function normalizeActionType(
  value: unknown,
): AdminProductionDeploymentHardeningActionAuditActionType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminProductionDeploymentHardeningActionAuditActionTypes.includes(
    normalized as AdminProductionDeploymentHardeningActionAuditActionType,
  )
    ? (normalized as AdminProductionDeploymentHardeningActionAuditActionType)
    : null;
}

function normalizeActionSource(
  value: unknown,
): AdminProductionDeploymentHardeningActionAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminProductionDeploymentHardeningActionAuditActionSources.includes(
    normalized as AdminProductionDeploymentHardeningActionAuditActionSource,
  )
    ? (normalized as AdminProductionDeploymentHardeningActionAuditActionSource)
    : null;
}

function setupFrom(
  input: AdminProductionDeploymentHardeningActionAuditPayloadSetupInput,
): AdminProductionDeploymentHardeningReadinessSetupResult {
  return input.setup ?? buildAdminProductionDeploymentHardeningReadinessSetup(input);
}

function disabledActionFrom(
  input: AdminProductionDeploymentHardeningActionAuditPayloadSetupInput,
) {
  return safeRecord(
    firstValue(
      input.disabledAction,
      input.disabled_action,
      input.disabledActionResult,
      input.disabled_action_result,
      input.productionHardeningActionResult,
      input.production_hardening_action_result,
      input.actionResult,
      input.action_result,
    ),
  );
}

function hasBlockedNoOpProductionHardeningActionResult(value: Record<string, unknown>) {
  return (
    value.delivery_surface === "production_deployment_hardening_action_disabled_setup_only" &&
    value.status === "blocked" &&
    value.reason === "setup_only_disabled" &&
    value.result_label === "blocked/no-op" &&
    value.no_op === true &&
    value.productionDeploymentEnabled === false &&
    value.liveDbWriteEnabled === false &&
    value.migrationEnabled === false &&
    value.externalApiEnabled === false &&
    value.providerEnvEnabled === false &&
    value.paymentActivationEnabled === false &&
    value.authActivationEnabled === false &&
    value.liveSendingEnabled === false &&
    value.manualApprovalRequired === true
  );
}

function productionReadinessStatusFrom(
  setup: AdminProductionDeploymentHardeningReadinessSetupResult,
) {
  return setup.status === "setup_only" ? "ready_for_future_setup" : "blocked";
}

function disabledProductionHardeningFields() {
  return {
    authActivationEnabled: false,
    auth_activation_enabled: false,
    externalApiEnabled: false,
    external_api_enabled: false,
    liveDbWriteEnabled: false,
    liveSendingEnabled: false,
    live_db_write_enabled: false,
    live_sending_enabled: false,
    manualApprovalRequired: true,
    manual_approval_required: true,
    migrationEnabled: false,
    migration_enabled: false,
    paymentActivationEnabled: false,
    payment_activation_enabled: false,
    productionDeploymentEnabled: false,
    production_deployment_enabled: false,
    providerEnvEnabled: false,
    provider_env_enabled: false,
  } as const;
}

export function buildAdminProductionDeploymentHardeningActionAuditPayloadSetup(
  input: AdminProductionDeploymentHardeningActionAuditPayloadSetupInput,
): AdminProductionDeploymentHardeningActionAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionType = normalizeActionType(firstValue(input.actionType, input.action_type));
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const disabledAction = disabledActionFrom(input);
  const disabledActionReady = hasBlockedNoOpProductionHardeningActionResult(disabledAction);
  const disabledActionStatus: "blocked" | "missing" = disabledActionReady ? "blocked" : "missing";
  const productionReadinessStatus = productionReadinessStatusFrom(setup);
  const missingRequirements: AdminProductionDeploymentHardeningActionAuditPayloadMissingRequirement[] =
    [];

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
      ...disabledProductionHardeningFields(),
      blocked_no_op_result: blockedNoOpResult,
      deployment_label: setup.deployment_label,
      disabled_action_source: disabledActionSource,
      disabled_action_status: disabledActionStatus,
      disabledActionStatus,
      preview_readiness_source: previewReadinessSource,
      production_readiness_status: productionReadinessStatus,
      release_candidate: setup.release_candidate,
      result: blockedNoOpResult,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    delivery_surface: "production_deployment_hardening_action_audit_payload_setup_only",
    deployment_label: setup.deployment_label,
    disabled_action_status: disabledActionStatus,
    disabledActionStatus,
    ...disabledProductionHardeningFields(),
    missing_requirements: missingRequirements,
    production_readiness_status: productionReadinessStatus,
    release_candidate: setup.release_candidate,
    status: "setup_only",
    version: adminProductionDeploymentHardeningActionAuditPayloadSetupFoundationVersion,
  };
}
