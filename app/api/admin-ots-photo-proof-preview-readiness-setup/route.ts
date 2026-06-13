import { buildAdminOtsPhotoProofSetupFoundation } from "../../../lib/admin-ots-photo-proof-setup-foundation";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

const futureStoragePathPattern = "bookings/{bookingRef}/ots/{timestamp}-{driverId}.jpg";
const storageBucketPlanned = "ots-photo-proofs";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

type AdminOtsPhotoProofSetup = ReturnType<typeof buildAdminOtsPhotoProofSetupFoundation>;

function fallbackSetup() {
  return buildAdminOtsPhotoProofSetupFoundation({});
}

function disabledPreviewFields() {
  return {
    adminViewerEnabled: false,
    customerVisible: false,
    futureStoragePathPattern,
    liveAccessEnabled: false,
    photoUploadEnabled: false,
    storageBucketPlanned,
    storageEnabled: false,
  };
}

function readinessFor(setup: AdminOtsPhotoProofSetup) {
  return {
    ...disabledPreviewFields(),
    admin_photo_viewer_planned: setup.admin_photo_viewer_planned,
    driver_ots_photo_proof_planned: setup.driver_ots_photo_proof_planned,
    future_customer_visibility: setup.future_customer_visibility,
    proof_scope: setup.proof_scope,
    status: setup.status,
    storage_bucket_planned: setup.storage_bucket_planned,
  };
}

function previewFor(setup: AdminOtsPhotoProofSetup) {
  return {
    ...disabledPreviewFields(),
    admin_photo_viewer_planned: setup.admin_photo_viewer_planned,
    booking_ref: setup.booking_ref,
    driver_ots_photo_proof_planned: setup.driver_ots_photo_proof_planned,
    future_customer_visibility: setup.future_customer_visibility,
    future_trigger: setup.future_trigger,
    future_visibility: setup.future_visibility,
    policy: setup.policy,
    proof_scope: setup.proof_scope,
    status: setup.status,
    storage_bucket_planned: setup.storage_bucket_planned,
    version: setup.version,
  };
}

function blockedResponse(error: string) {
  const setup = fallbackSetup();

  return Response.json(
    {
      ...disabledPreviewFields(),
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
  const setup = fallbackSetup();

  return Response.json(
    {
      ...disabledPreviewFields(),
      error: "Admin OTS photo proof preview readiness setup request failed safely.",
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
    const setup = buildAdminOtsPhotoProofSetupFoundation({
      booking_ref: firstParam(searchParams, "booking_ref", "bookingReference", "booking_reference"),
      driver_job_token: firstParam(searchParams, "driver_job_token", "driverJobToken"),
      service_code: firstParam(searchParams, "service_code", "serviceCode"),
    });

    return Response.json({
      ...disabledPreviewFields(),
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
