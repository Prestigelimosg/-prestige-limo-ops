import {
  createAdminBooking,
  listAdminBookings,
  parseAdminBookingPersistencePayload,
  parseAdminBookingUpdatePayload,
  updateAdminBooking,
} from "../../../lib/admin-booking-persistence";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      ok: false,
      error,
    },
    { status: 403 },
  );
}

type AdminDispatcherBoundaryCheck =
  | {
      ok: true;
      context: AdminDispatcherBoundaryContext;
    }
  | {
      ok: false;
      response: Response;
    };

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok
    ? {
        ok: true,
        context: boundary.context,
      }
    : {
        ok: false,
        response: blockedResponse(boundary.error),
      };
}

function safeFailureResponse() {
  return Response.json(
    {
      ok: false,
      error: "Admin booking persistence request failed safely.",
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

    const result = await listAdminBookings();

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error,
        },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      bookings: result.data,
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

    const parsed = parseAdminBookingPersistencePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          ok: false,
          error: parsed.error,
        },
        { status: parsed.status },
      );
    }

    const result = await createAdminBooking(parsed.data, {
      action: "admin_booking_create",
      source_route: "/api/admin-bookings",
      actor_label: boundary.context.actorLabel,
      change_summary: "Safe operational booking fields saved through the admin-only API contract.",
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error,
        },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      booking: result.data,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminBookingUpdatePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          ok: false,
          error: parsed.error,
        },
        { status: parsed.status },
      );
    }

    const result = await updateAdminBooking(parsed.data, {
      action: "admin_booking_update",
      source_route: "/api/admin-bookings",
      actor_label: boundary.context.actorLabel,
      change_summary: "Safe operational booking fields updated through the admin-only API contract.",
    });

    if (!result.ok) {
      return Response.json(
        {
          ok: false,
          error: result.error,
        },
        { status: result.status },
      );
    }

    return Response.json({
      ok: true,
      booking: result.data,
    });
  } catch {
    return safeFailureResponse();
  }
}
