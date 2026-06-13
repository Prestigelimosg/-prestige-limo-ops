import { buildAdminOtsPhotoProofSetupFoundation } from "../../../lib/admin-ots-photo-proof-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

const deliverySurface = "ots_photo_proof_access_upload_disabled_setup_only" as const;
const futureStoragePathPattern = "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg";
const plannedPrivateBucket = "ots-photo-proofs";
const previewReadinessSetupApi = "admin-ots-photo-proof-preview-readiness-setup" as const;

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type AdminOtsPhotoProofSetup = ReturnType<typeof buildAdminOtsPhotoProofSetupFoundation>;

function fallbackSetup() {
  return buildAdminOtsPhotoProofSetupFoundation({});
}

function disabledFields() {
  return {
    adminViewerEnabled: false,
    customerVisible: false,
    external_send: false,
    liveAccessEnabled: false,
    photoUploadEnabled: false,
    storageEnabled: false,
  };
}

function setupMetadata(setup: AdminOtsPhotoProofSetup) {
  return {
    booking_ref: setup.booking_ref,
    futureStoragePathPattern,
    plannedPrivateBucket,
    preview_readiness_source: previewReadinessSetupApi,
    proof_scope: setup.proof_scope,
  };
}

function readinessFor(setup: AdminOtsPhotoProofSetup) {
  return {
    ...disabledFields(),
    admin_photo_viewer_planned: setup.admin_photo_viewer_planned,
    driver_ots_photo_proof_planned: setup.driver_ots_photo_proof_planned,
    future_customer_visibility: setup.future_customer_visibility,
    metadata: setupMetadata(setup),
    proof_scope: setup.proof_scope,
    status: "blocked",
    storage_bucket_planned: setup.storage_bucket_planned,
  };
}

function previewFor(setup: AdminOtsPhotoProofSetup) {
  return {
    ...disabledFields(),
    admin_photo_viewer_planned: setup.admin_photo_viewer_planned,
    booking_ref: setup.booking_ref,
    driver_ots_photo_proof_planned: setup.driver_ots_photo_proof_planned,
    future_customer_visibility: setup.future_customer_visibility,
    future_trigger: setup.future_trigger,
    future_visibility: setup.future_visibility,
    metadata: setupMetadata(setup),
    policy: setup.policy,
    proof_scope: setup.proof_scope,
    status: "blocked",
    storage_bucket_planned: setup.storage_bucket_planned,
    version: setup.version,
  };
}

function disabledAccessUploadFor(setup: AdminOtsPhotoProofSetup) {
  return {
    ...disabledFields(),
    admin_photo_viewer: {
      adminViewerEnabled: false,
      status: "blocked",
    },
    booking_ref: setup.booking_ref,
    customer_access: {
      customerVisible: false,
      liveAccessEnabled: false,
      status: "blocked",
    },
    delivery_surface: deliverySurface,
    metadata: setupMetadata(setup),
    no_op: true,
    photo_upload: {
      photoUploadEnabled: false,
      status: "blocked",
    },
    preview_readiness_source: previewReadinessSetupApi,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    storage: {
      status: "blocked",
      storageEnabled: false,
    },
    version: setup.version,
  } as const;
}

function blockedResponse(error: string) {
  const setup = fallbackSetup();
  const result = disabledAccessUploadFor(setup);

  return Response.json(
    {
      ...disabledFields(),
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
  const setup = fallbackSetup();
  const result = disabledAccessUploadFor(setup);

  return Response.json(
    {
      ...disabledFields(),
      delivery_surface: result.delivery_surface,
      error: "Admin OTS photo proof access upload disabled setup request failed safely.",
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
    const setup = buildAdminOtsPhotoProofSetupFoundation({
      booking_ref: firstParam(searchParams, "booking_ref", "bookingReference", "booking_reference"),
      driver_job_token: firstParam(searchParams, "driver_job_token", "driverJobToken"),
      service_code: firstParam(searchParams, "service_code", "serviceCode"),
    });
    const result = disabledAccessUploadFor(setup);

    return Response.json({
      ...disabledFields(),
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
