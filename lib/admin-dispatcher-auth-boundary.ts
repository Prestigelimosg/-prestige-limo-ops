export type AdminDispatcherBoundaryRole = "local-dev-admin" | "admin" | "dispatcher";

export type AdminDispatcherBoundaryContext = {
  actorLabel: string;
  mode: "local-dev-admin-surface" | "server-session-role-surface";
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

type AdminDispatcherBoundaryOptions = {
  allowServerSessionRoleMethodsWithoutRequestToken?: readonly string[];
};

const safeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionAuthMode = "server-session-token";
const adminDispatcherRoles = new Set<AdminDispatcherBoundaryRole>(["admin", "dispatcher"]);

function adminBookingPersistenceWritesEnabled() {
  return process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true";
}

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

function cleanServerValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function readServerSessionRole() {
  const configuredRole = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE);

  return configuredRole && adminDispatcherRoles.has(configuredRole as AdminDispatcherBoundaryRole)
    ? (configuredRole as "admin" | "dispatcher")
    : null;
}

function methodIsAllowedWithoutRequestToken(
  method: string,
  allowedMethods: readonly string[] | undefined,
) {
  return !!allowedMethods?.some((allowedMethod) => allowedMethod.toUpperCase() === method.toUpperCase());
}

function resolveServerSessionRole(
  request: Request,
  options: AdminDispatcherBoundaryOptions = {},
): AdminDispatcherBoundaryResult {
  const expectedToken = cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN);
  const requestToken = cleanServerValue(request.headers.get("x-prestige-admin-session-token") || undefined);
  const role = readServerSessionRole();
  const methodAllowedWithoutRequestToken = methodIsAllowedWithoutRequestToken(
    request.method,
    options.allowServerSessionRoleMethodsWithoutRequestToken,
  );

  if (
    expectedToken &&
    role &&
    (request.method === "GET" ||
      (methodAllowedWithoutRequestToken && !requestToken))
  ) {
    return {
      ok: true,
      context: {
        actorLabel:
          cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) ||
          "Admin dashboard read session",
        mode: "server-session-role-surface",
        role,
      },
    };
  }

  if (!expectedToken || requestToken !== expectedToken || !role) {
    return {
      ok: false,
      status: 403,
      error: safeBlockedMessage,
    };
  }

  return {
    ok: true,
    context: {
      actorLabel: cleanServerValue(process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL) || "Admin dispatcher session",
      mode: "server-session-role-surface",
      role,
    },
  };
}

export function resolveAdminDispatcherBoundary(
  request: Request,
  expectedPurpose = adminBookingPersistencePurpose,
  options: AdminDispatcherBoundaryOptions = {},
): AdminDispatcherBoundaryResult {
  const purpose = request.headers.get("x-prestige-admin-purpose");

  if (purpose !== expectedPurpose || !hasSameOriginAdminDashboardReferer(request)) {
    return {
      ok: false,
      status: 403,
      error: safeBlockedMessage,
    };
  }

  if (process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE === serverSessionAuthMode) {
    return resolveServerSessionRole(request, options);
  }

  if (adminBookingPersistenceWritesEnabled()) {
    return {
      ok: false,
      status: 403,
      error: safeBlockedMessage,
    };
  }

  // Future Supabase auth should replace the server-session-token source with
  // a server-side session/claims check before production writes are expanded.
  return {
    ok: true,
    context: {
      actorLabel: "Local admin dashboard",
      mode: "local-dev-admin-surface",
      role: "local-dev-admin",
    },
  };
}
