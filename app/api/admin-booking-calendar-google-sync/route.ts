import {
  adminBookingGoogleCalendarSyncVersion,
  readAdminBookingCalendarStatusesFromGoogle,
  syncAdminBookingCalendarAgendaToGoogle,
} from "../../../lib/admin-booking-google-calendar-sync";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

function isProductionRuntime() {
  return process.env.NODE_ENV === "production" || process.env.VERCEL_ENV === "production";
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (!boundary.ok) {
    return {
      ok: false,
      response: blockedResponse(boundary.error),
    };
  }

  if (boundary.context.mode === "local-dev-admin-surface" && isProductionRuntime()) {
    return {
      ok: false,
      response: blockedResponse("Admin booking persistence is available only from the internal admin dashboard."),
    };
  }

  return {
    context: boundary.context,
    ok: true,
  };
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin Google Calendar sync request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const mode = new URL(request.url).searchParams.get("mode");
    const payload = await readJsonBody(request);

    if (mode === "status") {
      const result = await readAdminBookingCalendarStatusesFromGoogle(
        payload,
        boundary.context,
      );

      if (!result.ok) {
        return Response.json(
          {
            error: result.error,
            ok: false,
            version: adminBookingGoogleCalendarSyncVersion,
          },
          { status: result.status },
        );
      }

      return Response.json({
        ok: true,
        statuses: result.data.statuses,
        version: adminBookingGoogleCalendarSyncVersion,
      });
    }

    if (mode) {
      return Response.json(
        {
          error: "Admin Google Calendar request mode is not supported.",
          ok: false,
          version: adminBookingGoogleCalendarSyncVersion,
        },
        { status: 400 },
      );
    }

    const result = await syncAdminBookingCalendarAgendaToGoogle(payload, boundary.context);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
          version: adminBookingGoogleCalendarSyncVersion,
        },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      sync: result.data.sync,
      version: adminBookingGoogleCalendarSyncVersion,
    });
  } catch {
    return safeFailureResponse();
  }
}
