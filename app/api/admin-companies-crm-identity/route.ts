import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  adminCompaniesCrmIdentityReadiness,
  adminCompaniesCrmIdentityVersion,
  findAdminCompanyCrmIdentity,
} from "../../../lib/admin-companies-crm-identity";

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
      readiness: adminCompaniesCrmIdentityReadiness(),
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
      error: "Admin companies CRM identity request failed safely.",
      ok: false,
      readiness: adminCompaniesCrmIdentityReadiness(),
    },
    { status: 500 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    additionalSameOriginRefererPathPrefixes: ["/customers"],
  });

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
    const result = await findAdminCompanyCrmIdentity(new URL(request.url).searchParams, actor);

    if (!result.ok) {
      return errorResponse(result);
    }

    return Response.json({
      company: result.data,
      ok: true,
      readiness: adminCompaniesCrmIdentityReadiness(),
      version: adminCompaniesCrmIdentityVersion,
    });
  } catch {
    return safeFailureResponse();
  }
}
