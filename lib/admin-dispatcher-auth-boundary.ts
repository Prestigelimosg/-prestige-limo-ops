export type AdminDispatcherBoundaryRole = "local-dev-admin" | "admin" | "dispatcher";

export type AdminDispatcherBoundaryContext = {
  actorLabel: string;
  mode: "local-dev-admin-surface" | "future-authenticated-admin-surface";
  role: AdminDispatcherBoundaryRole;
};

export type AdminDispatcherBoundaryResult =
  | {
      ok: true;
      context: AdminDispatcherBoundaryContext;
    }
  | {
      ok: false;
      status: 403;
      error: string;
    };

export const adminBookingPersistencePurpose = "admin-booking-persistence";

const safeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";

function hasSameOriginAdminDashboardReferer(request: Request) {
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

    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/";
  } catch {
    return false;
  }
}

export function resolveAdminDispatcherBoundary(
  request: Request,
  expectedPurpose = adminBookingPersistencePurpose,
): AdminDispatcherBoundaryResult {
  const purpose = request.headers.get("x-prestige-admin-purpose");

  if (purpose !== expectedPurpose || !hasSameOriginAdminDashboardReferer(request)) {
    return {
      ok: false,
      status: 403,
      error: safeBlockedMessage,
    };
  }

  // Future real auth should replace this local dashboard scaffold with a
  // server-side session/claims check before production writes are enabled.
  return {
    ok: true,
    context: {
      actorLabel: "Local admin dashboard",
      mode: "local-dev-admin-surface",
      role: "local-dev-admin",
    },
  };
}
