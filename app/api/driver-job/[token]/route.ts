import { getDriverJobPayloadForTokenContract } from "../../../../lib/driver-job-link-contract.ts";
import { getProductionDriverJobPayloadForToken } from "../../../../lib/driver-job-link-production.ts";
import {
  isProductionDriverJobLinkMode,
} from "../../../../lib/driver-job-link-mode.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
  resetMockDriverJobLinkDataForTests,
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

export async function GET(request: Request, context: DriverJobRouteContext) {
  const { token } = await context.params;

  if (isProductionDriverJobLinkMode()) {
    const result = await getProductionDriverJobPayloadForToken(token);

    return Response.json(result, { status: blockedStatusByReason[result.reason] });
  }

  if (request.headers.get("x-prestige-driver-job-mock-reset") === "1") {
    // Test-only reset for mock-backed browser guards. Production mode returns before this branch.
    resetMockDriverJobLinkDataForTests();
  }

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
