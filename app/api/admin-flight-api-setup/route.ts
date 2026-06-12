import {
  adminFlightApiSetupFoundationVersion,
  buildAdminFlightApiSetupFoundation,
} from "../../../lib/admin-flight-api-setup-foundation";
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

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

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
      error: "Admin flight API setup request failed safely.",
      ok: false,
      version: adminFlightApiSetupFoundationVersion,
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

    const searchParams = new URL(request.url).searchParams;

    const setup = buildAdminFlightApiSetupFoundation({
      airport_code: searchParams.get("airport_code"),
      booking_ref: searchParams.get("booking_ref"),
      flight_no: searchParams.get("flight_no"),
      service_code: searchParams.get("service_code"),
    });

    return Response.json({
      ok: true,
      setup,
      version: setup.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
