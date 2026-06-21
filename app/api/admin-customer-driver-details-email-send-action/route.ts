import {
  adminCustomerDriverDetailsEmailClosedGateResult,
  adminCustomerDriverDetailsEmailSendActionEnvGateName,
  adminCustomerDriverDetailsEmailSendGateOpen,
  executeAdminCustomerDriverDetailsEmailSendAction,
} from "../../../lib/admin-customer-driver-details-email-send-action";
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
      email_send_enabled: false,
      env_gate_name: adminCustomerDriverDetailsEmailSendActionEnvGateName,
      error,
      external_send: false,
      no_op: true,
      ok: false,
    },
    { status: 403 },
  );
}

function hasSameOriginAdminDashboardReferer(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-admin-purpose");

  if (purpose !== adminBookingPersistencePurpose || !referer) {
    return false;
  }

  if (origin && origin !== requestUrl.origin) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);

    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/";
  } catch {
    return false;
  }
}

function closedGateResponse() {
  return Response.json(adminCustomerDriverDetailsEmailClosedGateResult(), { status: 503 });
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
  if (status === "sent") {
    return 200;
  }

  if (reason === "recipient_not_allowlisted" || reason === "admin_session_required") {
    return 403;
  }

  if (status === "rejected") {
    return 400;
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
      email_send_enabled: false,
      env_gate_name: adminCustomerDriverDetailsEmailSendActionEnvGateName,
      error: "Driver Details Email send request failed safely.",
      external_send: false,
      no_op: true,
      ok: false,
    },
    { status: 500 },
  );
}

export async function POST(request: Request) {
  try {
    if (
      !adminCustomerDriverDetailsEmailSendGateOpen() &&
      hasSameOriginAdminDashboardReferer(request)
    ) {
      return closedGateResponse();
    }

    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await executeAdminCustomerDriverDetailsEmailSendAction(
      await readJsonBody(request),
      actor,
    );

    return Response.json(result, { status: responseStatus(result.reason, result.status) });
  } catch {
    return safeFailureResponse();
  }
}
