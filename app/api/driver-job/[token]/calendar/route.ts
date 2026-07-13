import { buildDriverJobCalendarDownload } from "../../../../../lib/driver-job-calendar-event.ts";
import { getDriverJobPayloadForTokenContract } from "../../../../../lib/driver-job-link-contract.ts";
import {
  mockDriverJobBookingsById,
  mockDriverJobLinks,
} from "../../../../../lib/driver-job-link-mock-store.ts";
import { isProductionDriverJobLinkMode } from "../../../../../lib/driver-job-link-mode.ts";
import { getProductionDriverJobPayloadForToken } from "../../../../../lib/driver-job-link-production.ts";

export const dynamic = "force-dynamic";

type DriverJobCalendarRouteContext = {
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

export async function GET(_request: Request, context: DriverJobCalendarRouteContext) {
  const { token } = await context.params;
  const payloadResult = isProductionDriverJobLinkMode()
    ? await getProductionDriverJobPayloadForToken(token)
    : getDriverJobPayloadForTokenContract({
        bookingsById: mockDriverJobBookingsById,
        links: mockDriverJobLinks,
        token,
      });

  if (!payloadResult.ok) {
    return Response.json(
      {
        error: "Driver calendar is unavailable for this job link.",
        ok: false,
      },
      { status: blockedStatusByReason[payloadResult.reason] },
    );
  }

  if (!payloadResult.payload.acknowledged) {
    return Response.json(
      {
        error: "Acknowledge this Driver Job before adding it to a calendar.",
        ok: false,
      },
      { status: 409 },
    );
  }

  const calendar = buildDriverJobCalendarDownload(payloadResult.payload);

  if (!calendar.ok) {
    return Response.json(
      {
        error: calendar.error,
        ok: false,
      },
      { status: calendar.status },
    );
  }

  return new Response(calendar.ics, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-disposition": `attachment; filename="${calendar.filename}"`,
      "content-type": "text/calendar; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
    status: 200,
  });
}
