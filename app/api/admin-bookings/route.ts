import {
  createAdminBooking,
  listAdminBookings,
  parseAdminBookingPersistencePayload,
  parseAdminBookingUpdatePayload,
  updateAdminBooking,
} from "../../../lib/admin-booking-persistence";

export const dynamic = "force-dynamic";

const adminPurposeHeader = "admin-booking-persistence";

function isAdminDashboardRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-admin-purpose");

  if (purpose !== adminPurposeHeader) {
    return false;
  }

  if (origin && origin !== requestUrl.origin) {
    return false;
  }

  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);

    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/";
  } catch {
    return false;
  }
}

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
    if (!isAdminDashboardRequest(request)) {
      return blockedResponse();
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
    if (!isAdminDashboardRequest(request)) {
      return blockedResponse();
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
    if (!isAdminDashboardRequest(request)) {
      return blockedResponse();
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
