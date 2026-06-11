import "server-only";

import type { AdminBookingResult } from "./admin-booking-persistence";

export const customerPortalSessionIssueVersion =
  "customer-portal-session-issue-v1";

const customerPortalSessionIssueAuthRequiredError =
  "Customer portal session issue is not available.";
const customerPortalSessionIssueConfigError =
  "Customer portal session issue configuration is not ready.";
const customerSavedBookingsSessionCookieName =
  "prestige_customer_saved_bookings_session";
const maxSessionCookieAgeSeconds = 60 * 60;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenCustomerSessionFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "billing",
  "customer_price",
  "debug",
  "driver_payout",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "jwt",
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

export type CustomerPortalSessionIssueResult = {
  cookie: string;
  version: typeof customerPortalSessionIssueVersion;
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

  return forbiddenCustomerSessionFragments.some((fragment) => normalized.includes(fragment));
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

  return trimmed ? trimmed : null;
}

function validServerCredential(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function safeUuid(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && uuidPattern.test(cleaned) ? cleaned : null;
}

function safeCookieName(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    safeCookieNamePattern.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function customerSavedBookingsSessionCookieNameForIssue() {
  const configuredValue = configValueOrNull(
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
  );
  const configuredName = safeCookieName(configuredValue);

  if (configuredValue && !configuredName) {
    return null;
  }

  return configuredName || customerSavedBookingsSessionCookieName;
}

function sameOriginMyBookingsRequest(request: Request) {
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

    return refererUrl.origin === requestUrl.origin && refererUrl.pathname === "/my-bookings";
  } catch {
    return false;
  }
}

function serializeCustomerSavedBookingsSessionCookie(name: string, value: string) {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${maxSessionCookieAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

export function customerPortalSessionIssueAuthRequiredResult<T = null>(): AdminBookingResult<T> {
  return {
    error: customerPortalSessionIssueAuthRequiredError,
    ok: false,
    status: 403,
  };
}

export function resolveCustomerPortalSessionIssue(
  request: Request,
): AdminBookingResult<CustomerPortalSessionIssueResult> {
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (request.method !== "POST" || purpose !== "customer-portal-session-issue") {
    return customerPortalSessionIssueAuthRequiredResult();
  }

  if (!sameOriginMyBookingsRequest(request)) {
    return customerPortalSessionIssueAuthRequiredResult();
  }

  if (process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED !== "true") {
    return customerPortalSessionIssueAuthRequiredResult();
  }

  const issueMode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE);
  const expectedIssueToken = configValueOrNull(
    process.env.PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN,
  );
  const providedIssueToken =
    request.headers.get("x-prestige-customer-session-issue-token")?.trim() || "";
  const savedBookingsSessionToken = configValueOrNull(
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
  );
  const authUserId = safeUuid(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);
  const cookieName = customerSavedBookingsSessionCookieNameForIssue();

  if (expectedIssueToken && providedIssueToken && providedIssueToken !== expectedIssueToken) {
    return customerPortalSessionIssueAuthRequiredResult();
  }

  if (
    issueMode !== "server-session-token" ||
    !validServerCredential(expectedIssueToken) ||
    !savedBookingsSessionToken ||
    !validServerCredential(savedBookingsSessionToken) ||
    !authUserId ||
    !cookieName
  ) {
    return {
      error: customerPortalSessionIssueConfigError,
      ok: false,
      status: 503,
    };
  }

  if (!providedIssueToken || providedIssueToken !== expectedIssueToken) {
    return customerPortalSessionIssueAuthRequiredResult();
  }

  return {
    data: {
      cookie: serializeCustomerSavedBookingsSessionCookie(cookieName, savedBookingsSessionToken),
      version: customerPortalSessionIssueVersion,
    },
    ok: true,
  };
}
