import { adminDispatcherBoundaryToPersistenceAdapterActor } from "../../../lib/admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "../../../lib/admin-dispatcher-auth-boundary";
import { loadAdminCustomerSavedBookings } from "../../../lib/admin-customer-saved-bookings-read";

export const dynamic = "force-dynamic";

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

function routeLocalCustomerFolderBoundary(request: Request): AdminDispatcherBoundaryCheck {
  if (
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
    const requestToken = cleanServerValue(
      request.headers.get("x-prestige-admin-session-token") || undefined,
    );
    const role = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE);

    if (request.method === "GET" && expectedToken && ["admin", "dispatcher"].includes(role || "")) {
      return {
        context: {
          actorLabel:
            cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
            "Admin customer folder read session",
          mode: "server-session-role-surface",
          role: role as "admin" | "dispatcher",
        },
        ok: true,
      };
    }

    if (!expectedToken || requestToken !== expectedToken || !["admin", "dispatcher"].includes(role || "")) {
      return {
        ok: false,
        response: blockedResponse(safeBlockedMessage),
      };
    }

    return {
      context: {
        actorLabel: cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) || "Admin dispatcher session",
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
      actorLabel: "Local admin customer folder",
      mode: "local-dev-admin-surface",
      role: "local-dev-admin",
    },
    ok: true,
  };
}

function requireAdminDispatcherBoundary(request: Request): AdminDispatcherBoundaryCheck {
  const boundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose);

  if (boundary.ok) {
    return {
      context: boundary.context,
      ok: true,
    };
  }

  return routeLocalCustomerFolderBoundary(request);
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Admin customer saved bookings read request failed safely.",
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

    const actor = adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context);
    const result = await loadAdminCustomerSavedBookings(new URL(request.url).searchParams, actor);

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
      ok: true,
      saved_bookings: result.data.saved_bookings,
      summary: result.data.summary,
      version: result.data.version,
    });
  } catch {
    return safeFailureResponse();
  }
}
