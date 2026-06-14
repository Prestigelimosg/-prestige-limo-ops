import { buildAdminProductionDeploymentHardeningReadinessSetup } from "../../../lib/admin-production-deployment-hardening-readiness-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type ProductionHardeningReadinessSetup = ReturnType<
  typeof buildAdminProductionDeploymentHardeningReadinessSetup
>;

const previewReadinessSetupApi =
  "admin-production-deployment-hardening-readiness-preview-setup" as const;

function fallbackReadiness() {
  return buildAdminProductionDeploymentHardeningReadinessSetup({});
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
    live_location_enabled: false,
    live_sending_enabled: false,
    manualApprovalRequired: true,
    manual_approval_required: true,
    migrationEnabled: false,
    migration_enabled: false,
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
  };
}

function readinessFor(setup: ProductionHardeningReadinessSetup) {
  return {
    ...disabledProductionHardeningFields(),
    approval_gates: setup.approval_gates,
    deployment_surface: setup.deployment_surface,
    missing_requirements: setup.missing_requirements,
    readiness_status: setup.readiness_status,
    rollbackReviewRequired: setup.rollbackReviewRequired,
    rollback_review_required: setup.rollback_review_required,
    status: "blocked",
  };
}

function previewFor(setup: ProductionHardeningReadinessSetup) {
  return {
    ...disabledProductionHardeningFields(),
    buildReadinessReady: setup.buildReadinessReady,
    build_readiness_ready: setup.build_readiness_ready,
    deployment_label: setup.deployment_label,
    deployment_surface: setup.deployment_surface,
    environmentReadinessReady: setup.environmentReadinessReady,
    environment_readiness_ready: setup.environment_readiness_ready,
    planned_capabilities: setup.planned_capabilities,
    release_candidate: setup.release_candidate,
    rollbackReviewRequired: setup.rollbackReviewRequired,
    rollback_review_required: setup.rollback_review_required,
    status: "blocked",
    version: setup.version,
  };
}

function disabledProductionHardeningActionFor(setup: ProductionHardeningReadinessSetup) {
  return {
    ...disabledProductionHardeningFields(),
    action_groups: {
      deployment_hardening: {
        productionDeploymentEnabled: false,
        status: "blocked",
      },
      external_api_provider_env_activation: {
        externalApiEnabled: false,
        providerEnvEnabled: false,
        status: "blocked",
      },
      live_db_write_approval: {
        liveDbWriteEnabled: false,
        status: "blocked",
      },
      migration_approval: {
        migrationEnabled: false,
        status: "blocked",
      },
      payment_pdf_payout_auth_live_sending_location_photo_activation: {
        authActivationEnabled: false,
        liveSendingEnabled: false,
        live_location_enabled: false,
        paymentActivationEnabled: false,
        pdfGenerationEnabled: false,
        photoUploadEnabled: false,
        status: "blocked",
      },
    },
    deployment_label: setup.deployment_label,
    delivery_surface: "production_deployment_hardening_action_disabled_setup_only",
    no_op: true,
    preview_readiness_source: previewReadinessSetupApi,
    reason: "setup_only_disabled",
    release_candidate: setup.release_candidate,
    result_label: "blocked/no-op",
    status: "blocked",
    version: setup.version,
  } as const;
}

function blockedResponse(error: string) {
  const setup = fallbackReadiness();
  const result = disabledProductionHardeningActionFor(setup);

  return Response.json(
    {
      ...disabledProductionHardeningFields(),
      delivery_surface: result.delivery_surface,
      error,
      ok: false,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
      setup,
      status: "blocked",
      version: setup.version,
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? { context: boundary.context, ok: true }
    : { ok: false, response: blockedResponse(boundary.error) };
}

function safeFailureResponse() {
  const setup = fallbackReadiness();
  const result = disabledProductionHardeningActionFor(setup);

  return Response.json(
    {
      ...disabledProductionHardeningFields(),
      delivery_surface: result.delivery_surface,
      error: "Production deployment hardening action disabled setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
      setup,
      status: "blocked",
      version: setup.version,
    },
    { status: 500 },
  );
}

function firstParam(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);

    if (value !== null) {
      return value;
    }
  }

  return null;
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const searchParams = new URL(request.url).searchParams;
    const setup = buildAdminProductionDeploymentHardeningReadinessSetup({
      deployment_label: firstParam(searchParams, "deployment_label", "deploymentLabel"),
      release_candidate: firstParam(searchParams, "release_candidate", "releaseCandidate"),
    });
    const result = disabledProductionHardeningActionFor(setup);

    return Response.json({
      ...disabledProductionHardeningFields(),
      delivery_surface: result.delivery_surface,
      ok: true,
      preview: previewFor(setup),
      preview_readiness_source: previewReadinessSetupApi,
      readiness: readinessFor(setup),
      reason: result.reason,
      result,
      setup,
      status: "blocked",
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
