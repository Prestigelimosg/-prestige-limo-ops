import { getDriverJobPayloadForTokenContract } from "../../../../../lib/driver-job-link-contract.ts";
import {
  isProductionDriverJobLinkMode,
} from "../../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
} from "../../../../../lib/driver-job-link-mock-store.ts";
import {
  driverOtsPhotoProofPersistenceVersion,
  uploadDriverOtsPhotoProofForToken,
  type DriverOtsPhotoProofBlockedReason,
} from "../../../../../lib/driver-ots-photo-proof-persistence.ts";

type DriverJobOtsPhotoRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const blockedStatusByReason: Record<DriverOtsPhotoProofBlockedReason, number> = {
  expired: 410,
  invalid_file: 400,
  not_configured: 503,
  ots_required: 409,
  revoked: 403,
  storage_failed: 500,
  too_large: 413,
  unauthorized: 401,
  unsupported_type: 415,
};

function fileFromFormData(formData: FormData) {
  const value = formData.get("photo") ?? formData.get("ots_photo") ?? formData.get("file");

  return value instanceof File ? value : null;
}

function mockUploadResultForToken(token: string, file: File | null) {
  const payloadResult = getDriverJobPayloadForTokenContract({
    token,
    bookingsById: mockDriverJobBookingsById,
    links: mockDriverJobLinks,
  });

  if (!payloadResult.ok) {
    return {
      ok: false as const,
      reason: payloadResult.reason,
      status: payloadResult.reason === "expired" ? 410 : payloadResult.reason === "revoked" ? 403 : 401,
    };
  }

  const hasOtsStatus = payloadResult.payload.status === "ots" ||
    payloadResult.payload.status === "pob" ||
    payloadResult.payload.status === "completed" ||
    payloadResult.payload.statusHistory.some((status) => status.status === "ots");

  if (!hasOtsStatus) {
    return {
      ok: false as const,
      reason: "ots_required" as const,
      status: blockedStatusByReason.ots_required,
    };
  }

  if (!file || file.size <= 0) {
    return {
      ok: false as const,
      reason: "invalid_file" as const,
      status: blockedStatusByReason.invalid_file,
    };
  }

  return {
    mode: "mock" as const,
    ok: true as const,
    proof: {
      booking_reference: payloadResult.payload.reference,
      content_type: file.type || "image/jpeg",
      customerVisible: false as const,
      external_send: false as const,
      file_size_bytes: file.size,
      photo_type: "ots" as const,
      proof_status: "uploaded" as const,
      uploaded_at: new Date().toISOString(),
    },
    version: driverOtsPhotoProofPersistenceVersion,
  };
}

export async function POST(request: Request, context: DriverJobOtsPhotoRouteContext) {
  const { token } = await context.params;
  const formData = await request.formData().catch(() => null);
  const file = formData ? fileFromFormData(formData) : null;

  if (isProductionDriverJobLinkMode()) {
    const result = await uploadDriverOtsPhotoProofForToken({
      file,
      token,
    });

    if (!result.ok) {
      return Response.json(result, { status: blockedStatusByReason[result.reason] });
    }

    return Response.json({
      ok: true,
      mode: "production",
      proof: result.proof,
      version: result.version,
    });
  }

  const mockResult = mockUploadResultForToken(token, file);

  if (!mockResult.ok) {
    return Response.json(
      {
        ok: false,
        proof: null,
        reason: mockResult.reason,
        version: driverOtsPhotoProofPersistenceVersion,
      },
      { status: mockResult.status },
    );
  }

  return Response.json(mockResult);
}
