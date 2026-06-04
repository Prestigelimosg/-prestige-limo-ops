import {
  createAdminBooking,
  listAdminBookings,
  parseAdminBookingPersistencePayload,
  parseAdminBookingUpdatePayload,
  updateAdminBooking,
} from "../../../lib/admin-booking-persistence";
import {
  adminBookingPersistencePurpose,
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

function blockedResponse() {
  return Response.json(
    {
      ok: false,
      error: "Admin booking persistence is available only from the internal admin dashboard.",
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  return boundary.ok ? null : blockedResponse();
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
    const boundaryResponse = requireAdminDispatcherBoundary(request);

    if (boundaryResponse) {
      return boundaryResponse;
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
    const boundaryResponse = requireAdminDispatcherBoundary(request);

    if (boundaryResponse) {
      return boundaryResponse;
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

    const result = await createAdminBooking(parsed.data);

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
    const boundaryResponse = requireAdminDispatcherBoundary(request);

    if (boundaryResponse) {
      return boundaryResponse;
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

    const result = await updateAdminBooking(parsed.data);

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
