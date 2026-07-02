import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import {
  isCustomerPortalAccessToken,
  resolveCustomerPortalAccessSession,
} from "./customer-portal-access-link";
import { resolveExactTwoCustomerRuntimeSessionMap } from "./customer-runtime-session-map";

export const customerSavedBookingsReadVersion =
  "stage-customer-saved-bookings-read-api-v1";

export type CustomerSavedBookingsBoundaryContext = {
  auth_user_id: string;
  customer_account_reference?: string | null;
  mode: "server-session-cookie" | "server-session-token";
  runtime_gate: ControlledCustomerRuntimeGate;
  source_surface: "customer_api";
};

type ControlledCustomerRuntimeMode = "one-customer" | "small-allowlist";

type ControlledCustomerRuntimeGate = {
  account_allowlist: Set<string>;
  mode: ControlledCustomerRuntimeMode;
};

export type CustomerSavedBookingsReadParams = {
  booking_reference: string | null;
  limit: number;
  page: number;
};

export type CustomerSavedBookingRecord = {
  booking_month: string | null;
  booking_reference: string;
  created_at: string | null;
  customer_facing_status: string;
  dropoff_location: string | null;
  passenger_name: string | null;
  pickup_at: string | null;
  pickup_location: string | null;
  service_type: string | null;
  updated_at: string | null;
};

export type CustomerSavedBookingsReadResult = {
  pagination: {
    has_next_page: boolean;
    has_previous_page: boolean;
    page: number;
    page_size: number;
  };
  saved_bookings: CustomerSavedBookingRecord[];
  version: typeof customerSavedBookingsReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type CustomerSavedBookingsClient = Pick<SupabaseClient, "from">;
type CustomerSavedBookingsSessionTokenSource =
  | "ambiguous-cookie"
  | "missing"
  | "request-cookie"
  | "request-header";
type CustomerSavedBookingsAccountFilter = {
  column: "customer_display_name" | "customer_id";
  method: "eq" | "ilike";
  value: string;
};

const defaultSavedBookingsLimit = 10;
const maxSavedBookingsLimit = 25;
const maxSavedBookingsPage = 1000;
const maxBookingReferenceLength = 120;
const maxSafeTextLength = 500;
const customerAccountSelect =
  "customer_account_reference, account_status";
const customerSavedBookingsCurrentSelect =
  "booking_reference, service_type, pickup_at, pickup_location, dropoff_location, passenger_name, customer_facing_status, created_at, updated_at";
const customerSavedBookingsFoundationSelect =
  "booking_reference, route_type, pickup_datetime, pickup_location, dropoff_location, customer_display_name, customer_facing_status, created_at, updated_at";
const customerSavedBookingsAuthRequiredError =
  "Customer saved bookings read requires secure customer account access before saved bookings can be read.";
const customerSavedBookingsDisabledError =
  "Customer saved bookings read is not enabled on this server.";
const customerSavedBookingsConfigError =
  "Customer saved bookings read configuration is not ready.";
const customerSavedBookingsReadError =
  "Customer saved bookings read failed safely.";
const customerPortalRuntimeDisabledError =
  "Controlled customer portal runtime is not enabled for this customer.";
const customerPortalRuntimeConfigError =
  "Controlled customer portal runtime configuration is not ready.";
const customerSavedBookingsSessionCookieName =
  "prestige_customer_saved_bookings_session";
const customerSavedBookingsFallbackSessionCookieName =
  "prestige_customer_session";
const allowedQueryParams = new Set(["booking_reference", "limit", "page"]);
const allowedCustomerStatuses = new Set([
  "cancelled",
  "confirmed",
  "declined",
  "driver_assigned",
  "driver_pending",
  "not_confirmed",
  "pending_review",
  "received",
  "completed",
]);
const controlledCustomerRuntimeModes = new Set<ControlledCustomerRuntimeMode>([
  "one-customer",
  "small-allowlist",
]);
const maxControlledCustomerRuntimeAllowlistEntries = 5;
const forbiddenCustomerSavedBookingsFragments = [
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

  return forbiddenCustomerSavedBookingsFragments.some((fragment) => normalized.includes(fragment));
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
    cleaned.length <= maxBookingReferenceLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) &&
    !includesForbiddenFragment(cleaned)
    ? cleaned
    : null;
}

function parseControlledCustomerRuntimeMode(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && controlledCustomerRuntimeModes.has(cleaned as ControlledCustomerRuntimeMode)
    ? (cleaned as ControlledCustomerRuntimeMode)
    : null;
}

function parseControlledCustomerAccountAllowlist(value: unknown) {
  const raw = textOrNull(value);

  if (!raw) {
    return null;
  }

  const entries = raw
    .split(/[\s,]+/)
    .map((entry) => validBookingReference(entry))
    .filter((entry): entry is string => Boolean(entry));
  const uniqueEntries = [...new Set(entries)];

  if (
    uniqueEntries.length === 0 ||
    uniqueEntries.length > maxControlledCustomerRuntimeAllowlistEntries
  ) {
    return null;
  }

  return new Set(uniqueEntries);
}

function resolveControlledCustomerPortalRuntimeGate(): AdminBookingResult<ControlledCustomerRuntimeGate> {
  if (process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED !== "true") {
    return {
      error: customerPortalRuntimeDisabledError,
      ok: false,
      status: 403,
    };
  }

  const mode = parseControlledCustomerRuntimeMode(process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE);
  const accountAllowlist = parseControlledCustomerAccountAllowlist(
    process.env.PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST,
  );

  if (!mode || !accountAllowlist) {
    return {
      error: customerPortalRuntimeConfigError,
      ok: false,
      status: 503,
    };
  }

  if (mode === "one-customer" && accountAllowlist.size !== 1) {
    return {
      error: customerPortalRuntimeConfigError,
      ok: false,
      status: 503,
    };
  }

  return {
    data: {
      account_allowlist: accountAllowlist,
      mode,
    },
    ok: true,
  };
}

function customerAccountAllowedByControlledRuntime(
  customerAccountReference: string,
  gate: ControlledCustomerRuntimeGate,
) {
  return gate.account_allowlist.has(customerAccountReference);
}

function validLimit(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return defaultSavedBookingsLimit;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxSavedBookingsLimit ? parsed : null;
}

function validPage(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxSavedBookingsPage ? parsed : null;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function paramEntries(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams
    ? [...params.entries()]
    : Object.entries(params).map(([key, value]) => [key, value] as const);
}

function publicSafeStatus(value: unknown) {
  const cleaned = normalizeToken(textOrNull(value) || "");

  return allowedCustomerStatuses.has(cleaned) ? cleaned : "pending_review";
}

function validBookingMonth(value: unknown) {
  const cleaned = safeDateTextFromDb(value);
  const match = cleaned?.match(/^(\d{4})-(\d{2})/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

function customerAccountBookingFilter(
  customerAccountReference: string,
): CustomerSavedBookingsAccountFilter {
  return safeUuid(customerAccountReference)
    ? {
        column: "customer_id",
        method: "eq",
        value: customerAccountReference,
      }
    : {
        column: "customer_display_name",
        method: "ilike",
        value: customerAccountReference,
      };
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

function customerSavedBookingsSessionCookieNames() {
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

function readCustomerSavedBookingsSessionToken(request: Request): {
  source: CustomerSavedBookingsSessionTokenSource;
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

  const cookieValues = customerSavedBookingsSessionCookieNames().flatMap(
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

function getServerOnlyCustomerSavedBookingsSupabaseClient(
  context: CustomerSavedBookingsBoundaryContext,
): AdminBookingResult<CustomerSavedBookingsClient> {
  const signedPortalCookieSession =
    context.mode === "server-session-cookie" &&
    !!context.customer_account_reference &&
    customerAccountAllowedByControlledRuntime(
      context.customer_account_reference,
      context.runtime_gate,
    );

  if (
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true" &&
    !signedPortalCookieSession
  ) {
    return {
      error: customerSavedBookingsDisabledError,
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
      error: customerSavedBookingsConfigError,
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
      error: customerSavedBookingsConfigError,
      ok: false,
      status: 503,
    };
  }
}

function toCustomerSavedBookingRecord(row: UnknownRecord): CustomerSavedBookingRecord | null {
  const bookingReference = validBookingReference(row.booking_reference);
  const pickupAt = safeDateTextFromDb(row.pickup_at) || safeDateTextFromDb(row.pickup_datetime);
  const serviceType = safeTextFromDb(row.service_type) || safeTextFromDb(row.route_type);
  const passengerName = safeTextFromDb(row.passenger_name) || safeTextFromDb(row.customer_display_name);

  if (!bookingReference) {
    return null;
  }

  return {
    booking_month: validBookingMonth(pickupAt),
    booking_reference: bookingReference,
    created_at: safeDateTextFromDb(row.created_at),
    customer_facing_status: publicSafeStatus(row.customer_facing_status),
    dropoff_location: safeTextFromDb(row.dropoff_location),
    passenger_name: passengerName,
    pickup_at: pickupAt,
    pickup_location: safeTextFromDb(row.pickup_location),
    service_type: serviceType,
    updated_at: safeDateTextFromDb(row.updated_at),
  };
}

async function readCustomerSavedBookingRowsForSchema({
  client,
  customerFilter,
  parsed,
  pickupColumn,
  selectedColumns,
}: {
  client: CustomerSavedBookingsClient;
  customerFilter: CustomerSavedBookingsAccountFilter;
  parsed: CustomerSavedBookingsReadParams;
  pickupColumn: "pickup_at" | "pickup_datetime";
  selectedColumns: string;
}): Promise<AdminBookingResult<unknown[]>> {
  const offset = (parsed.page - 1) * parsed.limit;
  const rangeEnd = offset + parsed.limit;
  let bookingQuery = client
    .from("bookings")
    .select(selectedColumns)
    .order(pickupColumn, { ascending: false })
    .range(offset, rangeEnd);

  bookingQuery =
    customerFilter.method === "ilike"
      ? bookingQuery.ilike(customerFilter.column, customerFilter.value)
      : bookingQuery.eq(customerFilter.column, customerFilter.value);

  if (parsed.booking_reference) {
    bookingQuery = bookingQuery.eq("booking_reference", parsed.booking_reference);
  }

  const { data, error } = await bookingQuery;

  if (error) {
    return safeAdapterFailure(customerSavedBookingsReadError, 500, error);
  }

  return {
    data: asArray(data),
    ok: true,
  };
}

async function readCustomerSavedBookingRows(
  client: CustomerSavedBookingsClient,
  customerAccountReference: string,
  parsed: CustomerSavedBookingsReadParams,
): Promise<AdminBookingResult<unknown[]>> {
  const customerFilter = customerAccountBookingFilter(customerAccountReference);
  const currentResult = await readCustomerSavedBookingRowsForSchema({
    client,
    customerFilter,
    parsed,
    pickupColumn: "pickup_at",
    selectedColumns: customerSavedBookingsCurrentSelect,
  });

  if (currentResult.ok || currentResult.category !== "column_missing") {
    return currentResult;
  }

  return readCustomerSavedBookingRowsForSchema({
    client,
    customerFilter,
    parsed,
    pickupColumn: "pickup_datetime",
    selectedColumns: customerSavedBookingsFoundationSelect,
  });
}

export function customerSavedBookingsAuthRequiredResult<T = null>(): AdminBookingResult<T> {
  return {
    error: customerSavedBookingsAuthRequiredError,
    ok: false,
    status: 403,
  };
}

export function parseCustomerSavedBookingsReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<CustomerSavedBookingsReadParams> {
  const entries = paramEntries(params);
  const unsafeParams = entries.filter(
    ([key, value]) =>
      !allowedQueryParams.has(key) ||
      includesForbiddenFragment(key) ||
      includesForbiddenFragment(String(value ?? "")),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Customer saved bookings read includes fields outside the approved read scope.",
      ok: false,
      status: 400,
    };
  }

  const rawBookingReference = readParamsValue(params, "booking_reference");
  const bookingReference =
    rawBookingReference === undefined || rawBookingReference === null || rawBookingReference === ""
      ? null
      : validBookingReference(rawBookingReference);

  if (rawBookingReference && !bookingReference) {
    return {
      error: "Malformed customer saved booking reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = validLimit(readParamsValue(params, "limit"));
  const page = validPage(readParamsValue(params, "page"));

  if (!limit) {
    return {
      error: "Malformed customer saved bookings limit rejected.",
      ok: false,
      status: 400,
    };
  }

  if (!page) {
    return {
      error: "Malformed customer saved bookings page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      limit,
      page,
    },
    ok: true,
  };
}

export function resolveCustomerSavedBookingsBoundary(
  request: Request,
): AdminBookingResult<CustomerSavedBookingsBoundaryContext> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== "customer-saved-bookings-read") {
    return customerSavedBookingsAuthRequiredResult();
  }

  if (origin && origin !== requestUrl.origin) {
    return customerSavedBookingsAuthRequiredResult();
  }

  if (!referer) {
    return customerSavedBookingsAuthRequiredResult();
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== "/my-bookings") {
      return customerSavedBookingsAuthRequiredResult();
    }
  } catch {
    return customerSavedBookingsAuthRequiredResult();
  }

  const providedToken = readCustomerSavedBookingsSessionToken(request);

  if (isCustomerPortalAccessToken(providedToken.token)) {
    const runtimeGate = resolveControlledCustomerPortalRuntimeGate();

    if (!runtimeGate.ok) {
      return runtimeGate;
    }

    const portalAccessSession = resolveCustomerPortalAccessSession(providedToken.token, runtimeGate.data);

    if (!portalAccessSession.ok) {
      return portalAccessSession.status === 503
        ? {
            error: customerSavedBookingsConfigError,
            ok: false,
            status: 503,
          }
        : customerSavedBookingsAuthRequiredResult();
    }

    const effectiveRuntimeGate =
      portalAccessSession.data.access_scope === "stored_document"
        ? {
            ...runtimeGate.data,
            account_allowlist: new Set([
              portalAccessSession.data.customer_account_reference,
            ]),
          }
        : runtimeGate.data;

    return {
      data: {
        auth_user_id: portalAccessSession.data.auth_user_id,
        customer_account_reference: portalAccessSession.data.customer_account_reference,
        mode: "server-session-cookie",
        runtime_gate: effectiveRuntimeGate,
        source_surface: "customer_api",
      },
      ok: true,
    };
  }

  if (process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED !== "true") {
    return customerSavedBookingsAuthRequiredResult();
  }

  const expectedToken = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN);
  const mode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE);

  if (mode !== "server-session-token") {
    return customerSavedBookingsAuthRequiredResult();
  }

  const runtimeGate = resolveControlledCustomerPortalRuntimeGate();

  if (!runtimeGate.ok) {
    return runtimeGate;
  }

  const mappedSession = resolveExactTwoCustomerRuntimeSessionMap({
    expectedEntryCount: runtimeGate.data.account_allowlist.size,
    mapValue: process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP,
    providedToken: providedToken.token,
  });

  let authUserId: string | null = null;
  let customerAccountReference: string | null = null;

  if (mappedSession.configured) {
    if (!mappedSession.ok) {
      return mappedSession.reason === "invalid_config"
        ? {
            error: customerSavedBookingsConfigError,
            ok: false,
            status: 503,
          }
        : customerSavedBookingsAuthRequiredResult();
    }

    authUserId = mappedSession.auth_user_id;
    customerAccountReference = mappedSession.customer_account_reference;
  } else {
    authUserId = safeUuid(process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID);

    if (!validServerCredential(expectedToken) || providedToken.token !== expectedToken || !authUserId) {
      return customerSavedBookingsAuthRequiredResult();
    }
  }

  if (
    customerAccountReference &&
    !customerAccountAllowedByControlledRuntime(customerAccountReference, runtimeGate.data)
  ) {
    return customerSavedBookingsAuthRequiredResult();
  }

  return {
    data: {
      auth_user_id: authUserId,
      customer_account_reference: customerAccountReference,
      mode: providedToken.source === "request-cookie" ? "server-session-cookie" : "server-session-token",
      runtime_gate: runtimeGate.data,
      source_surface: "customer_api",
    },
    ok: true,
  };
}

export async function loadCustomerSavedBookings(
  input: URLSearchParams | UnknownRecord,
  context: CustomerSavedBookingsBoundaryContext,
): Promise<AdminBookingResult<CustomerSavedBookingsReadResult>> {
  const parsed = parseCustomerSavedBookingsReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyCustomerSavedBookingsSupabaseClient(context);

  if (!clientResult.ok) {
    return clientResult;
  }

  let customerAccountReference = validBookingReference(context.customer_account_reference);

  if (!customerAccountReference) {
    const { data: accountRows, error: accountError } = await clientResult.data
      .from("customer_access_accounts")
      .select(customerAccountSelect)
      .eq("auth_user_id", context.auth_user_id)
      .eq("account_status", "active")
      .limit(1);

    if (accountError) {
      return safeAdapterFailure(customerSavedBookingsReadError, 500, accountError);
    }

    customerAccountReference = validBookingReference(
      asRecord(asArray(accountRows)[0]).customer_account_reference,
    );
  }

  if (!customerAccountReference) {
    return {
      data: {
        pagination: {
          has_next_page: false,
          has_previous_page: parsed.data.page > 1,
          page: parsed.data.page,
          page_size: parsed.data.limit,
        },
        saved_bookings: [],
        version: customerSavedBookingsReadVersion,
      },
      ok: true,
    };
  }

  if (!customerAccountAllowedByControlledRuntime(customerAccountReference, context.runtime_gate)) {
    return customerSavedBookingsAuthRequiredResult();
  }

  const bookingRowsResult = await readCustomerSavedBookingRows(
    clientResult.data,
    customerAccountReference,
    parsed.data,
  );

  if (!bookingRowsResult.ok) {
    return bookingRowsResult;
  }

  const rawRows = bookingRowsResult.data;

  if (parsed.data.booking_reference && rawRows.length === 0) {
    // Targeted booking lookups are isolation checks: a ref outside this account must hard-block.
    return customerSavedBookingsAuthRequiredResult();
  }

  const rows = rawRows
    .map(asRecord)
    .map(toCustomerSavedBookingRecord)
    .filter((record): record is CustomerSavedBookingRecord => Boolean(record));

  return {
    data: {
      pagination: {
        has_next_page: rows.length > parsed.data.limit,
        has_previous_page: parsed.data.page > 1,
        page: parsed.data.page,
        page_size: parsed.data.limit,
      },
      saved_bookings: rows.slice(0, parsed.data.limit),
      version: customerSavedBookingsReadVersion,
    },
    ok: true,
  };
}
