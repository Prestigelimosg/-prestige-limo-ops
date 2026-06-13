import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  adminTravelersCrmIdentityReadiness,
  adminTravelersCrmIdentityVersion,
  findAdminTravelerCrmIdentity,
} from "../../../lib/admin-travelers-crm-identity";

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
      readiness: adminTravelersCrmIdentityReadiness(),
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
      error: "Admin travelers CRM identity request failed safely.",
      ok: false,
      readiness: adminTravelersCrmIdentityReadiness(),
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
    const result = await findAdminTravelerCrmIdentity(new URL(request.url).searchParams, actor);

    if (!result.ok) {
      return errorResponse(result);
    }

    return Response.json({
      ok: true,
      readiness: adminTravelersCrmIdentityReadiness(),
      traveler: result.data,
      version: adminTravelersCrmIdentityVersion,
    });
  } catch {
    return safeFailureResponse();
  }
}
