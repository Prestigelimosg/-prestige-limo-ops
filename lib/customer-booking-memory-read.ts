import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import { resolveCustomerSavedBookingsBoundaryForPurpose } from "./customer-saved-bookings-read";
import { assertActiveCustomerPortalAccessAccount } from "./customer-portal-access-account";

export const customerBookingMemoryReadVersion =
  "customer-booking-memory-read-v1";

export type CustomerBookingMemoryBoundaryContext = {
  auth_user_id: string;
  booker_id?: number | null;
  company_id?: number | null;
  customer_account_reference?: string | null;
  mode: "server-session-cookie" | "server-session-token";
  portal_link_issued_at?: number | null;
  portal_link_revision?: string | null;
  source_surface: "customer_api";
};

export type CustomerBookingMemoryReadParams = {
  limit: number;
  q: string | null;
};

export type CustomerBookingMemoryRecord = {
  dropoff_location: string | null;
  last_used_at: string | null;
  passenger_name: string;
  pickup_location: string | null;
  service_type: string | null;
  vehicle_type: string | null;
};

export type CustomerBookingMemoryReadResult = {
  booker_profile: CustomerBookingMemoryBookerProfile | null;
  memories: CustomerBookingMemoryRecord[];
  travelers: CustomerBookingMemoryTraveler[];
  version: typeof customerBookingMemoryReadVersion;
};

export type CustomerBookingMemoryBookerProfile = {
  booker_name: string | null;
  email: string;
  phone: string | null;
};

export type CustomerBookingMemoryTraveler = {
  default_dropoff_address: string | null;
  default_pickup_address: string | null;
  id: number;
  preferred_vehicle: string | null;
  traveler_name: string;
};

type UnknownRecord = Record<string, unknown>;
type CustomerBookingMemoryClient = Pick<SupabaseClient, "from">;
type CustomerBookingMemorySessionTokenSource =
  | "ambiguous-cookie"
  | "missing"
  | "request-cookie"
  | "request-header";

const defaultMemoryLimit = 10;
const maxMemoryLimit = 10;
const maxMemoryQueryLength = 120;
const maxSafeTextLength = 500;
const customerAccountSelect =
  "customer_account_reference, account_status, company_id, booker_id";
const customerBookerProfileSelect = "id, company_id, booker_name, email, phone";
const customerTravelerSelect =
  "id, company_id, booker_id, traveler_name, preferred_vehicle, default_pickup_address, default_dropoff_address";
const customerBookingMemorySelect =
  "booking_reference, passenger_name, pickup_location, dropoff_location, service_type, route_type, vehicle_type, vehicle, pickup_at, pickup_datetime, updated_at, created_at";
const customerBookingMemoryAuthRequiredError =
  "Customer booking memory read requires secure customer account access.";
const customerBookingMemoryDisabledError =
  "Customer booking memory read is not enabled on this server.";
const customerBookingMemoryConfigError =
  "Customer booking memory read configuration is not ready.";
const customerBookingMemoryReadError =
  "Customer booking memory read failed safely.";
const customerSavedBookingsSessionCookieName =
  "prestige_customer_saved_bookings_session";
const customerSavedBookingsFallbackSessionCookieName =
  "prestige_customer_session";
const allowedQueryParams = new Set(["limit", "q"]);
const forbiddenCustomerBookingMemoryFragments = [
  "admin_finance",
  "admin_internal_status",
  "admin_note",
  "amount_due",
  "auth_link",
  "billing",
  "contact_email",
  "contact_phone",
  "customer_price",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_note",
  "driver_payout",
  "driver_token",
  "fare_amount",
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
  "proof",
  "quoted_price",
  "rate_amount",
  "raw_ai",
  "raw_token",
  "refresh_token",
  "secret",
  "server_secret",
  "service_role",
  "session_secret",
  "session_token",
  "sms",
  "telegram",
  "token_hash",
  "whatsapp",
];
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeCookieNamePattern = /^[A-Za-z0-9_][A-Za-z0-9_.:-]{0,79}$/;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

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

  return forbiddenCustomerBookingMemoryFragments.some((fragment) => normalized.includes(fragment));
}

function safeTextFromDb(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeDateTextFromDb(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80 || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeUuid(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && uuidPattern.test(cleaned) ? cleaned : null;
}

function validBookingReference(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxMemoryQueryLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeEmailFromDb(value: unknown) {
  const cleaned = safeTextFromDb(value, 254)?.toLowerCase() || null;

  return cleaned && /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/.test(cleaned)
    ? cleaned
    : null;
}

function validLimit(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return defaultMemoryLimit;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxMemoryLimit ? parsed : null;
}

function validMemoryQuery(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxMemoryQueryLength &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function paramEntries(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams
    ? [...params.entries()]
    : Object.entries(params).map(([key, value]) => [key, value] as const);
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

function validServerDatabaseUrl(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname.length > 0 &&
      !hostname.includes("localhost") &&
      !hostname.includes("example") &&
      !hostname.includes("placeholder")
    );
  } catch {
    return false;
  }
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

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function safeCookieName(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    safeCookieNamePattern.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseCookieHeader(value: string | null) {
  const cookies = new Map<string, string[]>();

  if (!value) {
    return cookies;
  }

  for (const cookie of value.split(";")) {
    const trimmed = cookie.trim();

    if (!trimmed) {
      continue;
    }

    const equalsIndex = trimmed.indexOf("=");
    const rawName = equalsIndex >= 0 ? trimmed.slice(0, equalsIndex).trim() : trimmed;
    const name = safeCookieName(rawName);

    if (!name) {
      continue;
    }

    const rawValue = equalsIndex >= 0 ? trimmed.slice(equalsIndex + 1) : "";
    const decodedValue = decodeCookieValue(rawValue).trim();

    if (!decodedValue) {
      continue;
    }

    cookies.set(name, [...(cookies.get(name) || []), decodedValue]);
  }

  return cookies;
}

function customerSessionCookieNames() {
  const configuredValue = configValueOrNull(
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
  );
  const configuredName = safeCookieName(configuredValue);

  if (configuredValue && !configuredName) {
    return [];
  }

  if (configuredName) {
    return [configuredName];
  }

  return [
    customerSavedBookingsSessionCookieName,
    customerSavedBookingsFallbackSessionCookieName,
  ];
}

function readCustomerBookingMemorySessionToken(request: Request): {
  source: CustomerBookingMemorySessionTokenSource;
  token: string;
} {
  const headerToken = request.headers.get("x-prestige-customer-session-token")?.trim();

  if (headerToken) {
    return {
      source: "request-header",
      token: headerToken,
    };
  }

  const cookies = parseCookieHeader(request.headers.get("cookie"));
  const cookieValues = customerSessionCookieNames().flatMap(
    (cookieName) => cookies.get(cookieName) || [],
  );

  if (cookieValues.length === 1) {
    return {
      source: "request-cookie",
      token: cookieValues[0],
    };
  }

  if (cookieValues.length > 1) {
    return {
      source: "ambiguous-cookie",
      token: "",
    };
  }

  return {
    source: "missing",
    token: "",
  };
}

function classifyAdapterDatabaseFailure(
  error: unknown,
): AdminBookingPersistenceSafeErrorCategory {
  const record = asRecord(error);
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = textOrNull(record.code)?.toLowerCase() || "";
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (
    status === 401 ||
    code === "401" ||
    haystack.includes("invalid api") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt")
  ) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("row-level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (
    code === "42p01" ||
    haystack.includes("could not find the table") ||
    (haystack.includes("relation") && haystack.includes("does not exist"))
  ) {
    return "table_unreachable";
  }

  if (
    code === "42703" ||
    code === "pgrst204" ||
    code === "pgrst200" ||
    (haystack.includes("relationship") && haystack.includes("schema cache")) ||
    (haystack.includes("column") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  ) {
    return "column_missing";
  }

  return "unknown_adapter_failure";
}

function safeAdapterFailure<T>(
  error: string,
  status: number,
  databaseError: unknown,
): AdminBookingResult<T> {
  return {
    category: classifyAdapterDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function getServerOnlyCustomerBookingMemoryClient(
  context: CustomerBookingMemoryBoundaryContext,
): AdminBookingResult<CustomerBookingMemoryClient> {
  const signedPortalCookieSession =
    context.mode === "server-session-cookie" &&
    Boolean(context.customer_account_reference) &&
    (Boolean(context.portal_link_revision) ||
      (context.portal_link_issued_at != null &&
        Number.isInteger(context.portal_link_issued_at)));

  if (
    process.env.PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED !== "true" &&
    !signedPortalCookieSession
  ) {
    return {
      error: customerBookingMemoryDisabledError,
      ok: false,
      status: 403,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !validServerDatabaseUrl(supabaseUrl) ||
    !validServerCredential(serviceRoleKey)
  ) {
    return {
      error: customerBookingMemoryConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    return {
      data: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      }),
      ok: true,
    };
  } catch {
    return {
      category: "client_init_failed",
      error: customerBookingMemoryConfigError,
      ok: false,
      status: 503,
    };
  }
}

function toCustomerBookingMemoryRecord(row: UnknownRecord): CustomerBookingMemoryRecord | null {
  const passengerName = safeTextFromDb(row.passenger_name, 160);

  if (!passengerName) {
    return null;
  }

  return {
    dropoff_location: safeTextFromDb(row.dropoff_location),
    last_used_at:
      safeDateTextFromDb(row.updated_at) ||
      safeDateTextFromDb(row.pickup_at) ||
      safeDateTextFromDb(row.pickup_datetime) ||
      safeDateTextFromDb(row.created_at),
    passenger_name: passengerName,
    pickup_location: safeTextFromDb(row.pickup_location),
    service_type: safeTextFromDb(row.service_type, 120) || safeTextFromDb(row.route_type, 120),
    vehicle_type: safeTextFromDb(row.vehicle_type, 120) || safeTextFromDb(row.vehicle, 120),
  };
}

function memoryMatchesQuery(memory: CustomerBookingMemoryRecord, query: string | null) {
  if (!query) {
    return true;
  }

  const normalizedQuery = query.toLowerCase();

  return [
    memory.passenger_name,
    memory.pickup_location,
    memory.dropoff_location,
    memory.service_type,
    memory.vehicle_type,
  ].some((value) => value?.toLowerCase().includes(normalizedQuery));
}

function dedupeMemoryRows(rows: UnknownRecord[], query: string | null, limit: number) {
  const seen = new Set<string>();
  const memories: CustomerBookingMemoryRecord[] = [];

  for (const row of rows) {
    const memory = toCustomerBookingMemoryRecord(row);

    if (!memory || !memoryMatchesQuery(memory, query)) {
      continue;
    }

    const key = normalizeToken(memory.passenger_name);

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    memories.push(memory);

    if (memories.length >= limit) {
      break;
    }
  }

  return memories;
}

export function customerBookingMemoryAuthRequiredResult<T = null>(): AdminBookingResult<T> {
  return {
    error: customerBookingMemoryAuthRequiredError,
    ok: false,
    status: 403,
  };
}

export function parseCustomerBookingMemoryReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<CustomerBookingMemoryReadParams> {
  const unsafeParams = paramEntries(params).filter(
    ([key, value]) =>
      !allowedQueryParams.has(key) ||
      includesForbiddenFragment(key) ||
      includesForbiddenFragment(String(value ?? "")),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Customer booking memory read includes fields outside the approved read scope.",
      ok: false,
      status: 400,
    };
  }

  const limit = validLimit(readParamsValue(params, "limit"));

  if (!limit) {
    return {
      error: "Malformed customer booking memory limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const rawQuery = readParamsValue(params, "q");
  const query =
    rawQuery === undefined || rawQuery === null || rawQuery === ""
      ? null
      : validMemoryQuery(rawQuery);

  if (rawQuery && !query) {
    return {
      error: "Malformed customer booking memory query rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      limit,
      q: query,
    },
    ok: true,
  };
}

export function resolveCustomerBookingMemoryBoundary(
  request: Request,
): AdminBookingResult<CustomerBookingMemoryBoundaryContext> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== "customer-booking-memory-read") {
    return customerBookingMemoryAuthRequiredResult();
  }

  if (origin && origin !== requestUrl.origin) {
    return customerBookingMemoryAuthRequiredResult();
  }

  if (!referer) {
    return customerBookingMemoryAuthRequiredResult();
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== "/book") {
      return customerBookingMemoryAuthRequiredResult();
    }
  } catch {
    return customerBookingMemoryAuthRequiredResult();
  }

  const portalBoundary = resolveCustomerSavedBookingsBoundaryForPurpose(
    request,
    "customer-booking-memory-read",
    "/book",
  );

  if (portalBoundary.ok) {
    return {
      data: {
        auth_user_id: portalBoundary.data.auth_user_id,
        booker_id: portalBoundary.data.booker_id,
        company_id: portalBoundary.data.company_id,
        customer_account_reference: portalBoundary.data.customer_account_reference,
        mode: portalBoundary.data.mode,
        portal_link_issued_at: portalBoundary.data.portal_link_issued_at,
        portal_link_revision: portalBoundary.data.portal_link_revision,
        source_surface: "customer_api",
      },
      ok: true,
    };
  }

  if (process.env.PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED !== "true") {
    return customerBookingMemoryAuthRequiredResult();
  }

  const expectedToken = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN);
  const providedToken = readCustomerBookingMemorySessionToken(request);
  const mode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_MODE);
  const authUserId = safeUuid(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);

  if (
    mode !== "server-session-token" ||
    !validServerCredential(expectedToken) ||
    providedToken.token !== expectedToken ||
    !authUserId
  ) {
    return customerBookingMemoryAuthRequiredResult();
  }

  return {
    data: {
      auth_user_id: authUserId,
      mode: providedToken.source === "request-cookie" ? "server-session-cookie" : "server-session-token",
      source_surface: "customer_api",
    },
    ok: true,
  };
}

export async function loadCustomerBookingMemory(
  input: URLSearchParams | UnknownRecord,
  context: CustomerBookingMemoryBoundaryContext,
): Promise<AdminBookingResult<CustomerBookingMemoryReadResult>> {
  const parsed = parseCustomerBookingMemoryReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyCustomerBookingMemoryClient(context);

  if (!clientResult.ok) {
    return clientResult;
  }

  let accountRow: UnknownRecord;

  if (context.customer_account_reference) {
    const activeAccount = await assertActiveCustomerPortalAccessAccount(
      context.customer_account_reference,
      clientResult.data,
      context.portal_link_revision || context.portal_link_issued_at
        ? {
            issuedAt: context.portal_link_issued_at,
            linkRevision: context.portal_link_revision,
          }
        : undefined,
    );

    if (!activeAccount.ok) {
      return customerBookingMemoryAuthRequiredResult();
    }

    accountRow = activeAccount.data;
  } else {
    const { data: accountRows, error: accountError } = await clientResult.data
      .from("customer_access_accounts")
      .select(customerAccountSelect)
      .eq("auth_user_id", context.auth_user_id)
      .eq("account_status", "active")
      .limit(1);

    if (accountError) {
      return safeAdapterFailure(customerBookingMemoryReadError, 500, accountError);
    }

    accountRow = asRecord(asArray(accountRows)[0]);
  }
  const customerAccountReference = validBookingReference(accountRow.customer_account_reference);
  const companyId = positiveInteger(accountRow.company_id) || positiveInteger(context.company_id);
  const bookerId = positiveInteger(accountRow.booker_id) || positiveInteger(context.booker_id);

  if (!customerAccountReference) {
    return {
      data: {
        booker_profile: null,
        memories: [],
        travelers: [],
        version: customerBookingMemoryReadVersion,
      },
      ok: true,
    };
  }

  const { data: bookingRows, error: bookingError } = await clientResult.data
    .from("bookings")
    .select(customerBookingMemorySelect)
    .eq("customer_id", customerAccountReference)
    .order("updated_at", { ascending: false })
    .limit(parsed.data.limit * 5);

  if (bookingError) {
    return safeAdapterFailure(customerBookingMemoryReadError, 500, bookingError);
  }

  let bookerProfile: CustomerBookingMemoryBookerProfile | null = null;
  let travelers: CustomerBookingMemoryTraveler[] = [];

  if (companyId && bookerId) {
    const [bookerResult, travelerResult] = await Promise.all([
      clientResult.data
        .from("bookers")
        .select(customerBookerProfileSelect)
        .eq("id", bookerId)
        .eq("company_id", companyId)
        .limit(1),
      clientResult.data
        .from("travelers")
        .select(customerTravelerSelect)
        .eq("company_id", companyId)
        .eq("booker_id", bookerId)
        .order("traveler_name", { ascending: true })
        .limit(50),
    ]);

    if (bookerResult.error || travelerResult.error) {
      return safeAdapterFailure(
        customerBookingMemoryReadError,
        500,
        bookerResult.error || travelerResult.error,
      );
    }

    const bookerRow = asRecord(asArray(bookerResult.data)[0]);
    const bookerEmail = safeEmailFromDb(bookerRow.email);

    if (positiveInteger(bookerRow.id) === bookerId && bookerEmail) {
      bookerProfile = {
        booker_name: safeTextFromDb(bookerRow.booker_name, 160),
        email: bookerEmail,
        phone: safeTextFromDb(bookerRow.phone, 80),
      };
    }

    travelers = asArray(travelerResult.data)
      .map(asRecord)
      .map((row) => {
        const id = positiveInteger(row.id);
        const travelerName = safeTextFromDb(row.traveler_name, 160);

        return id && travelerName && positiveInteger(row.booker_id) === bookerId
          ? {
              default_dropoff_address: safeTextFromDb(row.default_dropoff_address),
              default_pickup_address: safeTextFromDb(row.default_pickup_address),
              id,
              preferred_vehicle: safeTextFromDb(row.preferred_vehicle, 120),
              traveler_name: travelerName,
            }
          : null;
      })
      .filter((traveler): traveler is CustomerBookingMemoryTraveler => Boolean(traveler));
  }

  return {
    data: {
      booker_profile: bookerProfile,
      memories: dedupeMemoryRows(asArray(bookingRows).map(asRecord), parsed.data.q, parsed.data.limit),
      travelers,
      version: customerBookingMemoryReadVersion,
    },
    ok: true,
  };
}
