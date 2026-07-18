import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import type { AdminBookingResult } from "./admin-booking-persistence";

export const customerPortalAccessLinkVersion = "customer-portal-access-link-v1";

const customerPortalAccessDisabledError = "Customer portal access links are not available.";
const customerPortalAccessConfigError =
  "Customer portal access link configuration is not ready.";
const customerSavedBookingsSessionCookieName =
  "prestige_customer_saved_bookings_session";
const customerPortalAccessTokenPrefix = "portal_access_v1";
const maxCustomerPortalAccessLinkAgeSeconds = 7 * 24 * 60 * 60;
const maxCustomerPortalCookieAgeSeconds = 400 * 24 * 60 * 60;
const maxAccountAllowlistEntries = 50;
const portalAccessAuthUserId = "00000000-0000-4000-8000-000000000001";
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;
const forbiddenCustomerPortalAccessFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "billing",
  "customer_price",
  "debug",
  "driver_payout",
  "driver_token",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "jwt",
  "live_location",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "raw_token",
  "refresh_token",
  "secret",
  "server_secret",
  "service_role",
  "session_secret",
  "session_token",
  "token_hash",
];

export type CustomerPortalAccessRuntimeGate = {
  account_allowlist: Set<string>;
};

type CustomerPortalAccessTokenPayload = {
  account: string;
  rev?: string;
  scope?: "portal_account" | "stored_document";
  exp?: number;
  iat: number;
  type: typeof customerPortalAccessLinkVersion;
};

type CustomerPortalAccessConfig = {
  accountAllowlist: Set<string>;
  cookieName: string;
  secret: string;
};

export type CustomerPortalAccessLinkResult = {
  customer_account_reference: string;
  expires_at: string | null;
  token: string;
  version: typeof customerPortalAccessLinkVersion;
};

export type CustomerPortalAccessSessionResult = {
  access_scope: "allowlisted" | "portal_account" | "stored_document";
  auth_user_id: string;
  customer_account_reference: string;
  issued_at: number;
  link_revision: string | null;
  version: typeof customerPortalAccessLinkVersion;
};

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenCustomerPortalAccessFragments.some((fragment) => normalized.includes(fragment));
}

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed && !isPlaceholderConfigValue(trimmed) ? trimmed : null;
}

function validServerCredential(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 32 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

export function safeCustomerPortalAccessAccountReference(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= 120 &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

export function safeCustomerPortalPublicBookingReference(value: unknown) {
  const cleaned = textOrNull(value)?.toUpperCase() || "";

  return /^(?:[0-9]{5}|[A-Z0-9]{2,12}-[0-9]{5})$/.test(cleaned)
    ? cleaned
    : null;
}

function safeCookieName(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    safeCookieNamePattern.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function parseAccountAllowlist(value: string | undefined) {
  const raw = configValueOrNull(value);

  if (!raw) {
    return null;
  }

  const entries = raw
    .split(/[\s,]+/)
    .map((entry) => safeCustomerPortalAccessAccountReference(entry))
    .filter((entry): entry is string => Boolean(entry));
  const uniqueEntries = [...new Set(entries)];

  if (uniqueEntries.length === 0 || uniqueEntries.length > maxAccountAllowlistEntries) {
    return null;
  }

  return new Set(uniqueEntries);
}

function customerSavedBookingsSessionCookieNameForAccess() {
  const configuredValue = configValueOrNull(
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
  );
  const configuredName = safeCookieName(configuredValue);

  if (configuredValue && !configuredName) {
    return null;
  }

  return configuredName || customerSavedBookingsSessionCookieName;
}

function resolveCustomerPortalAccessConfig(): AdminBookingResult<CustomerPortalAccessConfig> {
  if (process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED !== "true") {
    return {
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    } satisfies AdminBookingResult<never>;
  }

  const secret = configValueOrNull(process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET);
  const accountAllowlist = parseAccountAllowlist(
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST,
  );
  const cookieName = customerSavedBookingsSessionCookieNameForAccess();

  if (!secret || !validServerCredential(secret) || !accountAllowlist || !cookieName) {
    return {
      error: customerPortalAccessConfigError,
      ok: false,
      status: 503,
    } satisfies AdminBookingResult<never>;
  }

  return {
    data: {
      accountAllowlist,
      cookieName,
      secret,
    },
    ok: true,
  };
}

function encodeJsonSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJsonSegment(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function signSegment(segment: string, secret: string) {
  return createHmac("sha256", secret).update(segment).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function isPortalAccessPayload(value: unknown): value is CustomerPortalAccessTokenPayload {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const account = safeCustomerPortalAccessAccountReference(record.account);
  const exp = Number(record.exp);
  const iat = Number(record.iat);
  const scope = portalAccessScope(record.scope);
  const revision = safeLinkRevision(record.rev);
  const hasExpiry = record.exp !== undefined && record.exp !== null;

  if (record.type !== customerPortalAccessLinkVersion || !account || !Number.isInteger(iat)) {
    return false;
  }

  if (scope === "portal_account") {
    return (
      (!hasExpiry || (Number.isInteger(exp) && exp > iat)) &&
      (record.rev === undefined || revision !== null)
    );
  }

  return (
    Number.isInteger(exp) &&
    exp > iat &&
    exp - iat <= maxCustomerPortalAccessLinkAgeSeconds
  );
}

function safeLinkRevision(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  const timestamp = Date.parse(cleaned);

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function tokenParts(value: string) {
  const [prefix, payloadSegment, signatureSegment, extra] = value.split(".");

  if (
    prefix !== customerPortalAccessTokenPrefix ||
    !payloadSegment ||
    !signatureSegment ||
    extra !== undefined
  ) {
    return null;
  }

  return {
    payloadSegment,
    signatureSegment,
  };
}

function accountAllowed(
  account: string,
  configAllowlist: Set<string>,
  runtimeGate?: CustomerPortalAccessRuntimeGate,
) {
  return configAllowlist.has(account) && (!runtimeGate || runtimeGate.account_allowlist.has(account));
}

function portalAccessScope(value: unknown) {
  return value === "portal_account"
    ? "portal_account"
    : value === "stored_document"
      ? "stored_document"
      : "allowlisted";
}

export function isCustomerPortalAccessToken(value: string | null | undefined) {
  return !!value?.startsWith(`${customerPortalAccessTokenPrefix}.`);
}

export function serializeCustomerPortalAccessCookie(name: string, value: string) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxCustomerPortalCookieAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

export function createCustomerPortalAccessLinkToken(
  customerAccountReference: unknown,
  options: {
    linkRevision?: unknown;
    scope?: "portal_account" | "stored_document";
  } = {},
): AdminBookingResult<CustomerPortalAccessLinkResult> {
  const account = safeCustomerPortalAccessAccountReference(customerAccountReference);

  if (!account) {
    return {
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const config = resolveCustomerPortalAccessConfig();

  if (!config.ok) {
    return config;
  }

  const scope =
    options.scope === "portal_account"
      ? "portal_account"
      : options.scope === "stored_document"
        ? "stored_document"
        : "allowlisted";

  if (scope === "allowlisted" && !accountAllowed(account, config.data.accountAllowlist)) {
    return {
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const linkRevision = safeLinkRevision(options.linkRevision);

  if (scope === "portal_account" && !linkRevision) {
    return {
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const expiresAtSeconds = issuedAtSeconds + maxCustomerPortalAccessLinkAgeSeconds;
  const payloadSegment = encodeJsonSegment({
    account,
    ...(scope === "portal_account" ? {} : { exp: expiresAtSeconds }),
    iat: issuedAtSeconds,
    ...(linkRevision ? { rev: linkRevision } : {}),
    ...(scope === "allowlisted" ? {} : { scope }),
    type: customerPortalAccessLinkVersion,
  } satisfies CustomerPortalAccessTokenPayload);
  const signatureSegment = signSegment(payloadSegment, config.data.secret);

  return {
    data: {
      customer_account_reference: account,
      expires_at: scope === "portal_account" ? null : new Date(expiresAtSeconds * 1000).toISOString(),
      token: `${customerPortalAccessTokenPrefix}.${payloadSegment}.${signatureSegment}`,
      version: customerPortalAccessLinkVersion,
    },
    ok: true,
  };
}

export function resolveCustomerPortalAccessSession(
  token: string | null | undefined,
  runtimeGate?: CustomerPortalAccessRuntimeGate,
): AdminBookingResult<CustomerPortalAccessSessionResult> & { accessToken?: boolean } {
  if (!isCustomerPortalAccessToken(token)) {
    return {
      accessToken: false,
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const config = resolveCustomerPortalAccessConfig();

  if (!config.ok) {
    return {
      ...config,
      accessToken: true,
    };
  }

  const parts = tokenParts(token || "");
  const payload = parts ? decodeJsonSegment(parts.payloadSegment) : null;

  if (!parts || !isPortalAccessPayload(payload)) {
    return {
      accessToken: true,
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const expectedSignature = signSegment(parts.payloadSegment, config.data.secret);

  if (!signaturesMatch(parts.signatureSegment, expectedSignature)) {
    return {
      accessToken: true,
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  if (typeof payload.exp === "number" && payload.exp <= Math.floor(Date.now() / 1000)) {
    return {
      accessToken: true,
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const scope = portalAccessScope(payload.scope);

  if (
    scope === "allowlisted" &&
    !accountAllowed(payload.account, config.data.accountAllowlist, runtimeGate)
  ) {
    return {
      accessToken: true,
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  return {
    accessToken: true,
    data: {
      access_scope: scope,
      auth_user_id: portalAccessAuthUserId,
      customer_account_reference: payload.account,
      issued_at: payload.iat,
      link_revision: safeLinkRevision(payload.rev),
      version: customerPortalAccessLinkVersion,
    },
    ok: true,
  };
}

export function customerPortalAccessCookieHeader(token: string): AdminBookingResult<string> {
  const config = resolveCustomerPortalAccessConfig();

  if (!config.ok) {
    return config;
  }

  return {
    data: serializeCustomerPortalAccessCookie(config.data.cookieName, token),
    ok: true,
  };
}
