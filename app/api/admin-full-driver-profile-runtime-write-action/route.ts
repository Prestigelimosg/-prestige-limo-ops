import {
  adminFullDriverProfileRuntimeWriteActionEnvGateName,
  executeAdminFullDriverProfileRuntimeWriteAction,
} from "../../../lib/admin-full-driver-profile-runtime-write-action";
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
      env_gate_name: adminFullDriverProfileRuntimeWriteActionEnvGateName,
      error,
      no_op: true,
      ok: false,
      write_enabled: false,
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
  if (status === "deleted" || status === "saved") {
    return 200;
  }

  if (status === "rejected") {
    return 400;
  }

  if (reason === "admin_session_required") {
    return 403;
  }

  if (reason === "db_write_failed") {
    return 500;
  }

  return 503;
}

function safeFailureResponse() {
  return Response.json(
    {
      env_gate_name: adminFullDriverProfileRuntimeWriteActionEnvGateName,
      error: "Full driver profile write request failed safely.",
      no_op: true,
      ok: false,
      write_enabled: false,
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
    const result = await executeAdminFullDriverProfileRuntimeWriteAction(
      await readJsonBody(request),
      actor,
    );

    return Response.json(result, { status: responseStatus(result.reason, result.status) });
  } catch {
    return safeFailureResponse();
  }
}
