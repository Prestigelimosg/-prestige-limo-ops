import "server-only";

export const adminProductionDeploymentHardeningReadinessSetupFoundationVersion =
  "admin-production-deployment-hardening-readiness-setup-foundation-v1";

export type AdminProductionDeploymentHardeningReadinessSetupInput = {
  deploymentLabel?: unknown;
  deployment_label?: unknown;
  releaseCandidate?: unknown;
  release_candidate?: unknown;
};

export type AdminProductionDeploymentHardeningMissingRequirement =
  | "build_verification"
  | "db_write_migration_approval"
  | "environment_approval"
  | "live_risk_approval"
  | "manual_approval"
  | "provider_env_approval"
  | "rollback_review";

export type AdminProductionDeploymentHardeningReadinessSetupResult = {
  approval_gates: {
    build_readiness: "manual_review_required";
    db_write_migration: "manual_approval_required";
    environment_readiness: "manual_review_required";
    no_live_activation: "manual_approval_required";
    payment_pdf_payout_auth_location_photo_live_sending: "manual_approval_required";
    provider_env: "manual_approval_required";
    rollback_manual_review: "required";
  };
  authActivationEnabled: false;
  auth_activation_enabled: false;
  buildReadinessReady: false;
  build_readiness_ready: false;
  deployment_label: string | null;
  deployment_surface: "production_deployment_hardening_readiness_setup_only";
  environmentReadinessReady: false;
  environment_readiness_ready: false;
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
  missing_requirements: AdminProductionDeploymentHardeningMissingRequirement[];
  paymentActivationEnabled: false;
  payment_activation_enabled: false;
  pdfGenerationEnabled: false;
  pdf_generation_enabled: false;
  photoUploadEnabled: false;
  photo_upload_enabled: false;
  planned_capabilities: {
    build_verification: "planned_only";
    deployment: "planned_only";
    environment_readiness: "planned_only";
    rollback_plan: "manual_review_required";
  };
  productionDeploymentEnabled: false;
  production_deployment_enabled: false;
  providerEnvEnabled: false;
  provider_env_enabled: false;
  release_candidate: string | null;
  readiness_status: "blocked_pending_manual_approval";
  rollbackReviewRequired: true;
  rollback_review_required: true;
  status: "setup_only";
  version: typeof adminProductionDeploymentHardeningReadinessSetupFoundationVersion;
};

const forbiddenReferenceFragments = [
  "access_token",
  "admin_finance",
  "api_key",
  "debug",
  "driver_payout",
  "internal_admin",
  "internal_note",
  "mock_archive",
  "mock_qa",
  "password",
  "pay_now",
  "paynow",
  "private_key",
  "raw_token",
  "secret",
  "service_role",
  "token",
];

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenReferenceFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenReferenceFragments.some((fragment) => normalized.includes(fragment));
}

function safeReference(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (
    !cleaned ||
    cleaned.length > 120 ||
    includesForbiddenReferenceFragment(cleaned) ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

export function buildAdminProductionDeploymentHardeningReadinessSetup(
  input: AdminProductionDeploymentHardeningReadinessSetupInput = {},
): AdminProductionDeploymentHardeningReadinessSetupResult {
  return {
    approval_gates: {
      build_readiness: "manual_review_required",
      db_write_migration: "manual_approval_required",
      environment_readiness: "manual_review_required",
      no_live_activation: "manual_approval_required",
      payment_pdf_payout_auth_location_photo_live_sending: "manual_approval_required",
      provider_env: "manual_approval_required",
      rollback_manual_review: "required",
    },
    authActivationEnabled: false,
    auth_activation_enabled: false,
    buildReadinessReady: false,
    build_readiness_ready: false,
    deployment_label: safeReference(firstValue(input.deployment_label, input.deploymentLabel)),
    deployment_surface: "production_deployment_hardening_readiness_setup_only",
    environmentReadinessReady: false,
    environment_readiness_ready: false,
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
    missing_requirements: [
      "environment_approval",
      "build_verification",
      "live_risk_approval",
      "provider_env_approval",
      "db_write_migration_approval",
      "manual_approval",
      "rollback_review",
    ],
    paymentActivationEnabled: false,
    payment_activation_enabled: false,
    pdfGenerationEnabled: false,
    pdf_generation_enabled: false,
    photoUploadEnabled: false,
    photo_upload_enabled: false,
    planned_capabilities: {
      build_verification: "planned_only",
      deployment: "planned_only",
      environment_readiness: "planned_only",
      rollback_plan: "manual_review_required",
    },
    productionDeploymentEnabled: false,
    production_deployment_enabled: false,
    providerEnvEnabled: false,
    provider_env_enabled: false,
    release_candidate: safeReference(firstValue(input.release_candidate, input.releaseCandidate)),
    readiness_status: "blocked_pending_manual_approval",
    rollbackReviewRequired: true,
    rollback_review_required: true,
    status: "setup_only",
    version: adminProductionDeploymentHardeningReadinessSetupFoundationVersion,
  };
}
