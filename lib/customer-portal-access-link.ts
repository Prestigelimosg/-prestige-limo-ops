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
const maxCustomerPortalCookieAgeSeconds = 12 * 60 * 60;
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
  exp: number;
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
  expires_at: string;
  token: string;
  version: typeof customerPortalAccessLinkVersion;
};

export type CustomerPortalAccessSessionResult = {
  auth_user_id: string;
  customer_account_reference: string;
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

  return (
    record.type === customerPortalAccessLinkVersion &&
    !!account &&
    Number.isInteger(exp) &&
    Number.isInteger(iat) &&
    exp > iat &&
    exp - iat <= maxCustomerPortalAccessLinkAgeSeconds
  );
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

  if (!accountAllowed(account, config.data.accountAllowlist)) {
    return {
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  const issuedAtSeconds = Math.floor(Date.now() / 1000);
  const expiresAtSeconds = issuedAtSeconds + maxCustomerPortalAccessLinkAgeSeconds;
  const payloadSegment = encodeJsonSegment({
    account,
    exp: expiresAtSeconds,
    iat: issuedAtSeconds,
    type: customerPortalAccessLinkVersion,
  } satisfies CustomerPortalAccessTokenPayload);
  const signatureSegment = signSegment(payloadSegment, config.data.secret);

  return {
    data: {
      customer_account_reference: account,
      expires_at: new Date(expiresAtSeconds * 1000).toISOString(),
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

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return {
      accessToken: true,
      error: customerPortalAccessDisabledError,
      ok: false,
      status: 403,
    };
  }

  if (!accountAllowed(payload.account, config.data.accountAllowlist, runtimeGate)) {
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
      auth_user_id: portalAccessAuthUserId,
      customer_account_reference: payload.account,
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
