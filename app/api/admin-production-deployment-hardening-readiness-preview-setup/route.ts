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
    status: setup.status,
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
    live_location_enabled: setup.live_location_enabled,
    pdfGenerationEnabled: setup.pdfGenerationEnabled,
    pdf_generation_enabled: setup.pdf_generation_enabled,
    photoUploadEnabled: setup.photoUploadEnabled,
    photo_upload_enabled: setup.photo_upload_enabled,
    planned_capabilities: setup.planned_capabilities,
    release_candidate: setup.release_candidate,
    rollbackReviewRequired: setup.rollbackReviewRequired,
    rollback_review_required: setup.rollback_review_required,
    status: setup.status,
    version: setup.version,
  };
}

function blockedResponse(error: string) {
  const setup = fallbackReadiness();

  return Response.json(
    {
      ...disabledProductionHardeningFields(),
      error,
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
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

  return Response.json(
    {
      ...disabledProductionHardeningFields(),
      error: "Production deployment hardening readiness preview setup request failed safely.",
      ok: false,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
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

    return Response.json({
      ...disabledProductionHardeningFields(),
      ok: true,
      preview: previewFor(setup),
      readiness: readinessFor(setup),
      setup,
      status: setup.status,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
