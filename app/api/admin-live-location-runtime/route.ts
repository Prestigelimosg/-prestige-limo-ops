import {
  closeAdminLiveLocationRuntimeControl,
  openAdminLiveLocationRuntimeControl,
  readAdminLiveLocationRuntimeControl,
} from "../../../lib/admin-live-location-runtime-control";
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
      customerVisible: false,
      error,
      external_send: false,
      ok: false,
    },
    { status: 403 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(
    request,
    adminBookingPersistencePurpose,
    {
      allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "DELETE"],
    },
  );

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

function responseStatus(reason: string) {
  if (reason === "runtime_active" || reason === "runtime_closed" || reason === "runtime_opened") {
    return 200;
  }

  if (reason === "invalid_booking_reference") {
    return 400;
  }

  if (reason === "admin_session_required") {
    return 403;
  }

  return 503;
}

function safeFailureResponse() {
  return Response.json(
    {
      customerVisible: false,
      error: "Admin live-location runtime request failed safely.",
      external_send: false,
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

    const result = await readAdminLiveLocationRuntimeControl();

    return Response.json(result, { status: responseStatus(result.reason) });
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

    const body = await readJsonBody(request) as { booking_reference?: unknown };
    const result = await openAdminLiveLocationRuntimeControl({
      actor: boundary.context,
      bookingReference: body.booking_reference,
    });

    return Response.json(result, { status: responseStatus(result.reason) });
  } catch {
    return safeFailureResponse();
  }
}

export async function DELETE(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const result = await closeAdminLiveLocationRuntimeControl({
      actor: boundary.context,
    });

    return Response.json(result, { status: responseStatus(result.reason) });
  } catch {
    return safeFailureResponse();
  }
}
