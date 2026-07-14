import {
  readAdminAutomationRuntimeControl,
  setAdminAutomationRuntimeControl,
} from "../../../lib/admin-automation-runtime-control";
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

const allowedBodyFields = new Set(["enabled"]);

async function readJsonBody(request: Request) {
  try {
    const parsed = await request.json();

    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
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
      allowServerSessionRoleMethodsWithoutRequestToken: ["PATCH"],
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
  if (
    reason === "runtime_active" ||
    reason === "runtime_closed" ||
    reason === "runtime_enabled" ||
    reason === "runtime_disabled"
  ) {
    return 200;
  }

  if (reason === "invalid_request") {
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
      error: "Admin automation control failed safely.",
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

    const result = await readAdminAutomationRuntimeControl();

    return Response.json(result, { status: responseStatus(result.reason) });
  } catch {
    return safeFailureResponse();
  }
}

export async function PATCH(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const body = await readJsonBody(request);
    const bodyKeys = Object.keys(body);

    if (
      bodyKeys.length !== 1 ||
      bodyKeys.some((key) => !allowedBodyFields.has(key)) ||
      typeof body.enabled !== "boolean"
    ) {
      return Response.json(
        {
          customerVisible: false,
          error: "Automation control requires one enabled value.",
          external_send: false,
          ok: false,
          reason: "invalid_request",
        },
        { status: 400 },
      );
    }

    const result = await setAdminAutomationRuntimeControl({
      actor: boundary.context,
      enabled: body.enabled,
    });

    return Response.json(result, { status: responseStatus(result.reason) });
  } catch {
    return safeFailureResponse();
  }
}
