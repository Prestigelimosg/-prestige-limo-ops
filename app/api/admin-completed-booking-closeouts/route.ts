import {
  loadAdminCompletedBookingCloseout,
  parseAdminCompletedBookingCloseoutLoadParams,
  parseAdminCompletedBookingCloseoutSavePayload,
  saveAdminCompletedBookingCloseout,
} from "../../../lib/admin-completed-booking-closeout-persistence";
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
      error,
      ok: false,
    },
    { status: 403 },
  );
}

const safeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionAuthMode = "server-session-token";

type AdminDispatcherBoundaryCheck =
  | {
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      ok: false;
      response: Response;
    };

function cleanServerValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function hasSameOriginAdminOrCustomerFolderReferer(request: Request) {
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
      (refererUrl.pathname === "/" ||
        refererUrl.pathname === "/customers" ||
        refererUrl.pathname.startsWith("/customers/"))
    );
  } catch {
    return false;
  }
}

function routeCustomerCloseoutReadBoundary(request: Request): AdminDispatcherBoundaryCheck {
  if (
    request.method !== "GET" ||
    request.headers.get("x-prestige-admin-purpose") !== adminBookingPersistencePurpose ||
    !hasSameOriginAdminOrCustomerFolderReferer(request)
  ) {
    return {
      ok: false,
      response: blockedResponse(safeBlockedMessage),
    };
  }

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE === serverSessionAuthMode) {
    const expectedToken = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN);
    const role = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE);

    if (expectedToken && ["admin", "dispatcher"].includes(role || "")) {
      return {
        context: {
          actorLabel:
            cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
            "Admin customer closeout read session",
          mode: "server-session-role-surface",
          role: role as "admin" | "dispatcher",
        },
        ok: true,
      };
    }

    return {
      ok: false,
      response: blockedResponse(safeBlockedMessage),
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
      actorLabel: "Local admin customer closeout read",
      mode: "local-dev-admin-surface",
      role: "local-dev-admin",
    },
    ok: true,
  };
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (boundary.ok) {
    return {
      context: boundary.context,
      ok: true,
    };
  }

  return routeCustomerCloseoutReadBoundary(request);
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin completed booking closeout request failed safely.",
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

    const parsed = parseAdminCompletedBookingCloseoutLoadParams(
      new URL(request.url).searchParams,
    );

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminCompletedBookingCloseout(parsed.data, actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      closeout: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}

export async function POST(request: Request) {
  try {
    const boundary = requireAdminDispatcherBoundary(request);

    if (!boundary.ok) {
      return boundary.response;
    }

    const parsed = parseAdminCompletedBookingCloseoutSavePayload(await readJsonBody(request));

    if (!parsed.ok) {
      return Response.json(
        {
          error: parsed.error,
          ok: false,
        },
        { status: parsed.status },
      );
    }

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await saveAdminCompletedBookingCloseout(parsed.data, actor);

    if (!result.ok) {
      return Response.json(
        {
          error: result.error,
          ok: false,
        },
        { status: result.status },
      );
    }

    return Response.json({
      closeout: result.data,
      ok: true,
    });
  } catch {
    return safeFailureResponse();
  }
}
