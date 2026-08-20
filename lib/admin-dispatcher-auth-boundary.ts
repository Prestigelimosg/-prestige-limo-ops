import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const adminAccountSessionCookieName = "prestige_admin_account_session";
export const adminAccountSessionVersion = "admin-account-session-v1";

const adminAccountSessionMaxAgeSeconds = 60 * 60 * 8;
const adminAccountSessionSecretEnvName = "PRESTIGE_ADMIN_ACCOUNT_SESSION_SECRET";
const adminAccountAuthEnabledEnvName = "PRESTIGE_ADMIN_ACCOUNT_AUTH_ENABLED";
const sessionAad = Buffer.from(adminAccountSessionVersion, "utf8");
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholderPattern =
  /^(?:todo|tbd|none|null|undefined|placeholder|change[-_ ]?me|replace[-_ ]?me|example)$/i;

export type AdminAccountRole = "admin" | "dispatcher";
type Env = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;

export type AdminAccountSessionClaims = {
  accountId: string;
  actorLabel: string;
  authUserId: string;
  expiresAt: number;
  issuedAt: number;
  role: AdminAccountRole;
};

export type AdminAccountSessionResolution =
  | {
      claims: AdminAccountSessionClaims;
      ok: true;
      reason: "authenticated";
    }
  | {
      ok: false;
      reason: "invalid_session" | "not_configured" | "session_required";
    };

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function configuredValue(env: Env, name: string) {
  const value = env[name]?.trim() || "";
  return value && !placeholderPattern.test(value) ? value : "";
}

export function adminAccountAuthIsEnabled(env: Env = process.env) {
  return configuredValue(env, adminAccountAuthEnabledEnvName) === "true";
}

function configuredSecret(env: Env) {
  const value = configuredValue(env, adminAccountSessionSecretEnvName);
  return value.length >= 32 ? value : "";
}

function encryptionKey(secret: string) {
  return createHash("sha256")
    .update(`${adminAccountSessionVersion}:${secret}`)
    .digest();
}

function safeAccountRole(value: unknown): AdminAccountRole | null {
  return value === "admin" || value === "dispatcher" ? value : null;
}

function safeActorLabel(value: unknown) {
  const label = text(value);
  return label.length > 0 && label.length <= 160 ? label : "";
}

function cookieValueFromHeader(cookieHeader: string | null) {
  const values = (cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separatorIndex = part.indexOf("=");
      if (
        separatorIndex <= 0 ||
        part.slice(0, separatorIndex).trim() !== adminAccountSessionCookieName
      ) {
        return [];
      }

      try {
        return [decodeURIComponent(part.slice(separatorIndex + 1))];
      } catch {
        return [""];
      }
    });

  if (values.length === 0) return { state: "missing" as const, value: null };
  if (values.length !== 1 || !values[0]) {
    return { state: "invalid" as const, value: null };
  }
  return { state: "present" as const, value: values[0] };
}

function encryptClaims(claims: AdminAccountSessionClaims, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(sessionAad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({
      account_id: claims.accountId,
      actor_label: claims.actorLabel,
      auth_user_id: claims.authUserId,
      expires_at: claims.expiresAt,
      issued_at: claims.issuedAt,
      role: claims.role,
      version: adminAccountSessionVersion,
    }), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, ciphertext, tag]
    .map((value) => value.toString("base64url"))
    .join(".");
}

function decryptClaims(value: string, secret: string, nowMs: number) {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) return null;

    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 16) return null;

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(sessionAad);
    decipher.setAuthTag(tag);
    const payload = record(JSON.parse(Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")));
    const accountId = text(payload.account_id);
    const authUserId = text(payload.auth_user_id);
    const actorLabel = safeActorLabel(payload.actor_label);
    const role = safeAccountRole(payload.role);
    const issuedAt = Number(payload.issued_at);
    const expiresAt = Number(payload.expires_at);

    if (
      payload.version !== adminAccountSessionVersion ||
      !uuidPattern.test(accountId) ||
      !uuidPattern.test(authUserId) ||
      !actorLabel ||
      !role ||
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(expiresAt) ||
      issuedAt > nowMs + 60_000 ||
      expiresAt <= nowMs ||
      expiresAt - issuedAt > adminAccountSessionMaxAgeSeconds * 1000
    ) {
      return null;
    }

    return { accountId, actorLabel, authUserId, expiresAt, issuedAt, role };
  } catch {
    return null;
  }
}

function serializeSessionCookie(value: string) {
  return [
    `${adminAccountSessionCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${adminAccountSessionMaxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

export function clearAdminAccountSessionCookie() {
  return [
    `${adminAccountSessionCookieName}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

export function issueAdminAccountSession({
  accountId,
  actorLabel,
  authUserId,
  env = process.env,
  now = new Date(),
  role,
}: {
  accountId: string;
  actorLabel: string;
  authUserId: string;
  env?: Env;
  now?: Date | string | number;
  role: AdminAccountRole;
}) {
  const secret = configuredSecret(env);
  const nowDate = new Date(now);
  const safeLabel = safeActorLabel(actorLabel);
  if (
    !adminAccountAuthIsEnabled(env) ||
    !secret ||
    Number.isNaN(nowDate.getTime()) ||
    !uuidPattern.test(accountId) ||
    !uuidPattern.test(authUserId) ||
    !safeLabel ||
    !safeAccountRole(role)
  ) {
    return null;
  }

  const issuedAt = nowDate.getTime();
  const value = encryptClaims({
    accountId,
    actorLabel: safeLabel,
    authUserId,
    expiresAt: issuedAt + adminAccountSessionMaxAgeSeconds * 1000,
    issuedAt,
    role,
  }, secret);
  return serializeSessionCookie(value);
}

export function resolveAdminAccountSession(
  cookieHeader: string | null,
  options: { env?: Env; now?: Date | string | number } = {},
): AdminAccountSessionResolution {
  const env = options.env ?? process.env;
  if (!adminAccountAuthIsEnabled(env) || !configuredSecret(env)) {
    return { ok: false, reason: "not_configured" };
  }

  const cookie = cookieValueFromHeader(cookieHeader);
  if (cookie.state === "missing") {
    return { ok: false, reason: "session_required" };
  }
  if (cookie.state === "invalid" || !cookie.value) {
    return { ok: false, reason: "invalid_session" };
  }

  const nowMs = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  const claims = Number.isFinite(nowMs)
    ? decryptClaims(cookie.value, configuredSecret(env), nowMs)
    : null;
  return claims
    ? { claims, ok: true, reason: "authenticated" }
    : { ok: false, reason: "invalid_session" };
}

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
  additionalSameOriginRefererPathPrefixes?: readonly string[];
  additionalSameOriginRefererPathnames?: readonly string[];
  allowServerSessionRoleMethodsWithoutRequestToken?: readonly string[];
};

const safeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionAuthMode = "server-session-token";
const adminDispatcherRoles = new Set<AdminDispatcherBoundaryRole>(["admin", "dispatcher"]);
const internalAdminDashboardRefererPathnames = new Set(["/", "/settings/invoice"]);

function adminBookingPersistenceWritesEnabled() {
  return process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true";
}

function hasSameOriginAdminDashboardReferer(
  request: Request,
  options: AdminDispatcherBoundaryOptions = {},
) {
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
    const pathname = refererUrl.pathname;
    const additionalPathnames = new Set(options.additionalSameOriginRefererPathnames || []);
    const additionalPrefixes = options.additionalSameOriginRefererPathPrefixes || [];

    return (
      refererUrl.origin === requestUrl.origin &&
      (internalAdminDashboardRefererPathnames.has(pathname) ||
        additionalPathnames.has(pathname) ||
        additionalPrefixes.some((prefix) => pathname.startsWith(prefix)))
    );
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
    ((request.method === "GET" && !requestToken) ||
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

  if (purpose !== expectedPurpose || !hasSameOriginAdminDashboardReferer(request, options)) {
    return {
      ok: false,
      status: 403,
      error: safeBlockedMessage,
    };
  }

  if (adminAccountAuthIsEnabled()) {
    const session = resolveAdminAccountSession(request.headers.get("cookie"));
    if (!session.ok) {
      return {
        ok: false,
        status: 403,
        error: safeBlockedMessage,
      };
    }

    return {
      ok: true,
      context: {
        actorLabel: session.claims.actorLabel,
        mode: "server-session-role-surface",
        role: session.claims.role,
      },
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
