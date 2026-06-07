import { applyDriverJobStatusUpdateContract } from "../../../../../lib/driver-job-link-contract.ts";
import { applyProductionDriverJobStatusUpdate } from "../../../../../lib/driver-job-link-production.ts";
import {
  isProductionDriverJobLinkMode,
} from "../../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
} from "../../../../../lib/driver-job-link-mock-store.ts";

type DriverJobStatusRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const blockedStatusByReason = {
  expired: 410,
  invalid_status: 400,
  not_configured: 503,
  revoked: 403,
  unauthorized: 401,
} as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function readJsonBody(request: Request) {
  try {
    return asRecord(await request.json());
  } catch {
    return {};
  }
}

export async function PATCH(request: Request, context: DriverJobStatusRouteContext) {
  const [{ token }, body] = await Promise.all([context.params, readJsonBody(request)]);
  const status = typeof body.status === "string" ? body.status : "";

  if (isProductionDriverJobLinkMode()) {
    const result = await applyProductionDriverJobStatusUpdate({ token, status });

    if (result.ok) {
      return Response.json({
        ok: true,
        mode: "production",
        payload: result.payload,
        status: result.status,
      });
    }

    return Response.json(result, { status: blockedStatusByReason[result.reason] });
  }

  const result = applyDriverJobStatusUpdateContract({
    token,
    status,
    links: mockDriverJobLinks,
    bookingsById: mockDriverJobBookingsById,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        reason: result.reason,
        payload: null,
      },
      { status: blockedStatusByReason[result.reason] },
    );
  }

  // Mock-backed route skeleton only. No Supabase writes and no Driver Database access.
  return Response.json({
    ok: true,
    mode: "mock",
    status: result.status,
    payload: result.payload,
  });
}
