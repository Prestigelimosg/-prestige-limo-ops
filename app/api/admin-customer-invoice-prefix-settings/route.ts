import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
} from "../../../lib/admin-dispatcher-auth-boundary";
import {
  loadAdminCustomerInvoicePrefixSetting,
  parseAdminCustomerInvoicePrefixSettingsSavePayload,
  saveAdminCustomerInvoicePrefixSetting,
} from "../../../lib/admin-customer-invoice-prefix-settings";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

const safeBlockedMessage =
  "Customer invoice prefix settings are available only from internal customer folders.";
const serverSessionAuthMode = "server-session-token";

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      ok: false,
    },
    { status: 403 },
  );
}

function safeErrorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: result.error,
      ok: false,
    },
    { status: result.status },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Customer invoice prefix settings request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

function cleanServerValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function hasSameOriginCustomerFolderReferer(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");

  if (origin && origin !== requestUrl.origin) {
    return false;
  }

  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);

    return (
      refererUrl.origin === requestUrl.origin &&
      (refererUrl.pathname === "/customers" || refererUrl.pathname.startsWith("/customers/"))
    );
  } catch {
    return false;
  }
}

function methodMayUseServerSessionRoleWithoutRequestToken(method: string) {
  return method === "GET" || method === "POST";
}

function requireCustomerFolderAdminBoundary(request: Request): AdminDispatcherBoundaryCheck {
  if (
    request.headers.get("x-prestige-admin-purpose") !== adminBookingPersistencePurpose ||
    !hasSameOriginCustomerFolderReferer(request)
  ) {
    return {
      ok: false,
      response: blockedResponse(safeBlockedMessage),
    };
  }

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE === serverSessionAuthMode) {
    const expectedToken = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN);
    const requestToken = cleanServerValue(
      request.headers.get("x-prestige-admin-session-token") || undefined,
    );
    const role = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE);
    const roleIsAllowed = role === "admin" || role === "dispatcher";

    if (
      expectedToken &&
      roleIsAllowed &&
      !requestToken &&
      methodMayUseServerSessionRoleWithoutRequestToken(request.method)
    ) {
      return {
        context: {
          actorLabel:
            cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
            "Admin customer invoice prefix session",
          mode: "server-session-role-surface",
          role: role as "admin" | "dispatcher",
        },
        ok: true,
      };
    }

    if (!expectedToken || requestToken !== expectedToken || !roleIsAllowed) {
      return {
        ok: false,
        response: blockedResponse(safeBlockedMessage),
      };
    }

    return {
      context: {
        actorLabel:
          cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
          "Admin customer invoice prefix session",
        mode: "server-session-role-surface",
        role: role as "admin" | "dispatcher",
      },
      ok: true,
    };
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true") {
    return {
      ok: false,
      response: blockedResponse(safeBlockedMessage),
    };
  }

  return {
    context: {
      actorLabel: "Local admin customer invoice prefix",
      mode: "local-dev-admin-surface",
      role: "local-dev-admin",
    },
    ok: true,
  };
}

function requireAdminPrefixWriteBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = requireCustomerFolderAdminBoundary(request);

  if (!boundary.ok) {
    return boundary;
  }

  if (boundary.context.role !== "admin" && boundary.context.role !== "local-dev-admin") {
    return {
      ok: false,
      response: blockedResponse(safeBlockedMessage),
    };
  }

  return boundary;
}

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

export async function GET(request: Request) {
  try {
    const boundary = requireCustomerFolderAdminBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminCustomerInvoicePrefixSetting(
      new URL(request.url).searchParams,
      actor,
    );

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      customer_account: result.data.customer_account,
      ok: true,
      prefix_setting: result.data.prefix_setting,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminPrefixWriteBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminCustomerInvoicePrefixSettingsSavePayload(
      await readJsonBody(request),
    );

    if (!parsed.ok) {
      return safeErrorResponse(parsed);
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await saveAdminCustomerInvoicePrefixSetting(parsed.data, actor);

    if (!result.ok) {
      return safeErrorResponse(result);
    }

    return Response.json({
      customer_account: result.data.customer_account,
      ok: true,
      prefix_setting: result.data.prefix_setting,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
