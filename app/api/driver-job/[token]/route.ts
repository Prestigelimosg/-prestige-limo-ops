import { getDriverJobPayloadForTokenContract } from "../../../../lib/driver-job-link-contract.ts";
import {
  isProductionDriverJobLinkMode,
  productionDriverJobLinksConfigured,
  productionDriverJobLinksDisabledResult,
} from "../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
} from "../../../../lib/driver-job-link-mock-store.ts";

type DriverJobRouteContext = {
  params: Promise<{
    token: string;
  }>;
};

const blockedStatusByReason = {
  expired: 410,
  not_configured: 503,
  revoked: 403,
  unauthorized: 401,
} as const;

export async function GET(_request: Request, context: DriverJobRouteContext) {
  if (isProductionDriverJobLinkMode() && !productionDriverJobLinksConfigured()) {
    return Response.json(productionDriverJobLinksDisabledResult(), { status: blockedStatusByReason.not_configured });
  }

  const { token } = await context.params;
  const result = getDriverJobPayloadForTokenContract({
    token,
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

  // Mock-backed route skeleton only. No Supabase reads, no Driver Database reads, no production token table yet.
  return Response.json({
    ok: true,
    mode: "mock",
    payload: result.payload,
  });
}
