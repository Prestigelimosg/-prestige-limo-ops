import {
  adminFlightAwareAeroApiLiveLookupActionEnvGateName,
  executeAdminFlightAwareAeroApiLiveLookupAction,
} from "../../../lib/admin-flightaware-aeroapi-live-lookup-action";
import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
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
      env_gate_name: adminFlightAwareAeroApiLiveLookupActionEnvGateName,
      lookup_enabled: false,
      no_op: true,
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

function responseStatus(reason: string, status: string) {
  if (status === "looked_up") {
    return 200;
  }

  if (status === "rejected") {
    return 400;
  }

  if (reason === "admin_session_required") {
    return 403;
  }

  if (reason === "provider_timeout") {
    return 504;
  }

  if (reason === "provider_failure") {
    return 502;
  }

  return 503;
}

function safeFailureResponse() {
  return Response.json(
    {
      ok: false,
      error: "FlightAware AeroAPI lookup request failed safely.",
      env_gate_name: adminFlightAwareAeroApiLiveLookupActionEnvGateName,
      lookup_enabled: false,
      no_op: true,
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await executeAdminFlightAwareAeroApiLiveLookupAction(
      await readJsonBody(request),
      actor,
    );

    return Response.json(result, { status: responseStatus(result.reason, result.status) });
  } catch {
    return safeFailureResponse();
  }
}
