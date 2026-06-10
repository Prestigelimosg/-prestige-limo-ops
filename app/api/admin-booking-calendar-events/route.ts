import {
  adminBookingCalendarEventVersion,
  buildAdminBookingCalendarEvent,
} from "../../../lib/admin-booking-calendar-event";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

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
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

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
      error: "Admin booking calendar event request failed safely.",
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

    const payload = await readJsonBody(request);
    const result = buildAdminBookingCalendarEvent(payload);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
          version: adminBookingCalendarEventVersion,
        },
        { status: result.status },
      );
    }

    return Response.json({
      calendar_event: result.data.calendar_event,
      ics: result.data.ics,
      ok: true,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
