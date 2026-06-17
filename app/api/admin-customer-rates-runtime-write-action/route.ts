import {
  adminCustomerRatesRuntimeWriteActionEnvGateName,
  executeAdminCustomerRatesRuntimeWriteAction,
} from "../../../lib/admin-customer-rates-runtime-write-action";
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
      env_gate_name: adminCustomerRatesRuntimeWriteActionEnvGateName,
      no_op: true,
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
  if (status === "saved") {
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
      ok: false,
      error: "Customer rates write request failed safely.",
      env_gate_name: adminCustomerRatesRuntimeWriteActionEnvGateName,
      no_op: true,
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
    const result = await executeAdminCustomerRatesRuntimeWriteAction(
      await readJsonBody(request),
      actor,
    );

    return Response.json(result, { status: responseStatus(result.reason, result.status) });
  } catch {
    return safeFailureResponse();
  }
}
