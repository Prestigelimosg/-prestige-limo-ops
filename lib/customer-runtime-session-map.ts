import "server-only";

export const customerRuntimeSessionMapEnvName =
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP";
export const exactCustomerRuntimeSessionMapEntryCount = 2;
export const exactThreeCustomerRuntimeSessionMapEntryCount = 3;

export type ExactCustomerRuntimeSessionMapResolution =
  | {
      configured: false;
      ok: false;
      reason: "not_configured";
    }
  | {
      auth_user_id: string;
      configured: true;
      customer_account_reference: string;
      ok: true;
    }
  | {
      configured: true;
      ok: false;
      reason: "invalid_config" | "token_not_matched";
    };

const maxCustomerAccountReferenceLength = 120;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const forbiddenCustomerRuntimeSessionFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "customer_price",
  "debug",
  "driver_payout",
  "driver_token",
  "finance",
  "internal_note",
  "invoice",
  "jwt",
  "live_location",
  "parser_debug",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "raw_token",
  "secret",
  "service_role",
  "session_secret",
  "sms",
  "telegram",
  "token_hash",
  "whatsapp",
];

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed || null;
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed && !placeholderConfigPattern.test(trimmed) ? trimmed : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenCustomerRuntimeSessionFragments.some((fragment) => normalized.includes(fragment));
}

function safeUuid(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && uuidPattern.test(cleaned) ? cleaned : null;
}

function safeCustomerAccountReference(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxCustomerAccountReferenceLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function validServerCredential(value: string | null) {
  if (!value || placeholderConfigPattern.test(value) || value.includes("|") || value.includes(";")) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public") &&
    !includesForbiddenFragment(normalized)
  );
}

export function resolveExactTwoCustomerRuntimeSessionMap({
  expectedEntryCount = exactCustomerRuntimeSessionMapEntryCount,
  mapValue,
  providedToken,
}: {
  expectedEntryCount?: number;
  mapValue: string | undefined;
  providedToken: string | null;
}): ExactCustomerRuntimeSessionMapResolution {
  const rawMap = configValueOrNull(mapValue);

  if (!rawMap) {
    return {
      configured: false,
      ok: false,
      reason: "not_configured",
    };
  }

  const entries = rawMap
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean);

  const supportedEntryCounts = [
    exactCustomerRuntimeSessionMapEntryCount,
    exactThreeCustomerRuntimeSessionMapEntryCount,
  ];

  if (!supportedEntryCounts.includes(expectedEntryCount)) {
    return {
      configured: true,
      ok: false,
      reason: "invalid_config",
    };
  }

  if (
    expectedEntryCount === exactCustomerRuntimeSessionMapEntryCount &&
    entries.length !== exactCustomerRuntimeSessionMapEntryCount
  ) {
    return {
      configured: true,
      ok: false,
      reason: "invalid_config",
    };
  }

  if (
    expectedEntryCount !== exactCustomerRuntimeSessionMapEntryCount &&
    entries.length !== expectedEntryCount
  ) {
    return {
      configured: true,
      ok: false,
      reason: "invalid_config",
    };
  }

  const parsedEntries = entries.map((entry) => {
    const [authUserId, sessionToken, customerAccountReference, extra] = entry.split("|");

    return {
      auth_user_id: safeUuid(authUserId),
      customer_account_reference: safeCustomerAccountReference(customerAccountReference),
      extra,
      session_token: configValueOrNull(sessionToken),
    };
  });

  const validEntries = parsedEntries.filter(
    (entry) =>
      entry.auth_user_id &&
      entry.customer_account_reference &&
      entry.extra === undefined &&
      validServerCredential(entry.session_token),
  );
  const uniqueAuthUsers = new Set(validEntries.map((entry) => entry.auth_user_id));
  const uniqueCustomerAccounts = new Set(validEntries.map((entry) => entry.customer_account_reference));
  const uniqueTokens = new Set(validEntries.map((entry) => entry.session_token));

  if (
    expectedEntryCount === exactCustomerRuntimeSessionMapEntryCount &&
    (validEntries.length !== exactCustomerRuntimeSessionMapEntryCount ||
      uniqueAuthUsers.size !== exactCustomerRuntimeSessionMapEntryCount ||
      uniqueCustomerAccounts.size !== exactCustomerRuntimeSessionMapEntryCount ||
      uniqueTokens.size !== exactCustomerRuntimeSessionMapEntryCount)
  ) {
    return {
      configured: true,
      ok: false,
      reason: "invalid_config",
    };
  }

  if (
    expectedEntryCount !== exactCustomerRuntimeSessionMapEntryCount &&
    (validEntries.length !== expectedEntryCount ||
      uniqueAuthUsers.size !== expectedEntryCount ||
      uniqueCustomerAccounts.size !== expectedEntryCount ||
      uniqueTokens.size !== expectedEntryCount)
  ) {
    return {
      configured: true,
      ok: false,
      reason: "invalid_config",
    };
  }

  const matchedEntry = validEntries.find((entry) => entry.session_token === providedToken);

  if (!matchedEntry?.auth_user_id || !matchedEntry.customer_account_reference) {
    return {
      configured: true,
      ok: false,
      reason: "token_not_matched",
    };
  }

  return {
    auth_user_id: matchedEntry.auth_user_id,
    configured: true,
    customer_account_reference: matchedEntry.customer_account_reference,
    ok: true,
  };
}
