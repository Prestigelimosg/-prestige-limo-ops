import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  loadAdminDriverJobDspActualTimeSummaries,
  saveAdminDriverJobDspBillingTimeCorrection,
} from "../../../lib/admin-driver-job-dsp-actual-time-read";

export const dynamic = "force-dynamic";

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    additionalSameOriginRefererPathPrefixes: ["/customers/"],
    additionalSameOriginRefererPathnames: ["/customers"],
  });

  return boundary.ok
    ? {
        context: boundary.context,
        ok: true,
      }
    : {
        ok: false,
        response: blockedResponse(boundary.error),
      };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin driver job DSP actual time request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminDriverJobDspActualTimeSummaries(
      new URL(request.url).searchParams,
      actor,
    );

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      booking_reference: result.data.booking_reference,
      latest_summary: result.data.latest_summary,
      ok: true,
      summaries: result.data.summaries,
      summary: result.data.summary,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const input = (await request.json().catch(() => null)) as Record<string, unknown> | null;

    if (!input) {
      return Response.json(
        {
          error: "Malformed DSP billing time correction request.",
          ok: false,
        },
        { status: 400 },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await saveAdminDriverJobDspBillingTimeCorrection(input, actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      booking_reference: result.data.booking_reference,
      corrected_summary: result.data.corrected_summary,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
