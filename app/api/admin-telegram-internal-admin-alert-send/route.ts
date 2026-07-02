import {
  executeAdminTelegramInternalAdminAlertLiveSend,
  type AdminTelegramInternalAdminAlertLiveSendResult,
} from "../../../lib/admin-telegram-internal-admin-alert-live-send";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminDispatcherBoundaryCheck =
  | { context: AdminDispatcherBoundaryContext; ok: true }
  | { ok: false; response: Response };

async function readJsonBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();

    return body !== null && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function blockedResponse(error: string) {
  return Response.json(
    {
      channel: "telegram_internal_admin",
      error,
      external_send: false,
      liveSendingEnabled: false,
      no_op: true,
      ok: false,
      providerConfigured: false,
      sendingEnabled: false,
      status: "blocked",
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      channel: "telegram_internal_admin",
      error: "Telegram internal admin alert send request failed safely.",
      external_send: false,
      liveSendingEnabled: false,
      no_op: true,
      ok: false,
      providerConfigured: false,
      sendingEnabled: false,
      status: "blocked",
    },
    { status: 500 },
  );
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
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

function responseStatus(result: AdminTelegramInternalAdminAlertLiveSendResult) {
  return result.http_status;
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const result = await executeAdminTelegramInternalAdminAlertLiveSend(await readJsonBody(request));

    return Response.json(result, { status: responseStatus(result) });
  } catch {
    return safeFailureResponse();
  }
}
