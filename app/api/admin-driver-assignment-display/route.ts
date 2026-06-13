import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  adminDriverAssignmentDisplayReadiness,
  adminDriverAssignmentDisplayVersion,
  listAdminDriverAssignmentDisplay,
} from "../../../lib/admin-driver-assignment-display";

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

function errorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: result.error,
      ok: false,
      readiness: adminDriverAssignmentDisplayReadiness(),
    },
    { status: result.status },
  );
}

function blockedResponse(error: string) {
  return errorResponse({ error, status: 403 });
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin driver assignment display request failed safely.",
      ok: false,
      readiness: adminDriverAssignmentDisplayReadiness(),
    },
    { status: 500 },
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

export async function GET(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await listAdminDriverAssignmentDisplay(new URL(request.url).searchParams, actor);

    if (!result.ok) {
      return errorResponse(result);
    }

    return Response.json({
      drivers: result.data,
      ok: true,
      readiness: adminDriverAssignmentDisplayReadiness(),
      version: adminDriverAssignmentDisplayVersion,
    });
  } catch {
    return safeFailureResponse();
  }
}
