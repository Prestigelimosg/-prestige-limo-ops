import { adminDispatcherBoundaryToPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  adminBookingPersistencePurpose,
  type AdminDispatcherBoundaryContext,
  resolveAdminDispatcherBoundary,
} from "./admin-dispatcher-auth-boundary";

type AdminCustomerInvoiceBoundaryResult =
  | {
      actor: AdminBookingPersistenceAdapterActor;
      context: AdminDispatcherBoundaryContext;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 403;
    };

const safeBlockedMessage =
  "Customer invoice records are available only from the internal admin dashboard.";
const serverSessionAuthMode = "server-session-token";

function cleanServerValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function hasSameOriginAdminCustomerReferer(request: Request) {
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

function serverSessionContextForCustomerInvoice(request: Request) {
  void request;

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE !== serverSessionAuthMode) {
    return null;
  }

  const expectedToken = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN);
  const role = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE);

  if (!expectedToken || !role || !["admin", "dispatcher"].includes(role)) {
    return null;
  }

  return {
    actorLabel:
      cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
      "Admin customer invoice session",
    mode: "server-session-role-surface" as const,
    role: role as "admin" | "dispatcher",
  } satisfies AdminDispatcherBoundaryContext;
}

export function resolveAdminCustomerInvoiceBoundary(
  request: Request,
): AdminCustomerInvoiceBoundaryResult {
  const rootBoundary = resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["DELETE", "PATCH", "POST"],
  });

  if (rootBoundary.ok) {
    return {
      actor: adminDispatcherBoundaryToPersistenceAdapterActor(rootBoundary.context),
      context: rootBoundary.context,
      ok: true,
    };
  }

  if (
    request.headers.get("x-prestige-admin-purpose") !== adminBookingPersistencePurpose ||
    !hasSameOriginAdminCustomerReferer(request)
  ) {
    return {
      error: safeBlockedMessage,
      ok: false,
      status: 403,
    };
  }

  const serverContext = serverSessionContextForCustomerInvoice(request);

  if (serverContext) {
    return {
      actor: adminDispatcherBoundaryToPersistenceAdapterActor(serverContext),
      context: serverContext,
      ok: true,
    };
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true") {
    return {
      error: safeBlockedMessage,
      ok: false,
      status: 403,
    };
  }

  const localContext = {
    actorLabel: "Local admin customer invoice",
    mode: "local-dev-admin-surface" as const,
    role: "local-dev-admin" as const,
  } satisfies AdminDispatcherBoundaryContext;

  return {
    actor: adminDispatcherBoundaryToPersistenceAdapterActor(localContext),
    context: localContext,
    ok: true,
  };
}
