import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";

export const customerBookingStatusReadVersion =
  "stage-customer-booking-status-read-api-v1";

export type CustomerBookingStatusBoundaryContext = {
  auth_user_id: string;
  mode: "server-session-token";
  source_surface: "customer_api";
};

export type CustomerBookingStatusReadParams = {
  booking_reference: string | null;
  limit: number;
  page: number;
};

export type CustomerBookingStatusRecord = {
  booking_reference: string;
  cancellation_review_status: string | null;
  change_review_status: string | null;
  created_at: string | null;
  customer_facing_status: string;
  dropoff_location: string | null;
  passenger_name: string | null;
  pickup_at: string | null;
  pickup_location: string | null;
  request_review_status: string | null;
  service_type: string | null;
  short_notice_review_status: string | null;
  updated_at: string | null;
};

export type CustomerBookingStatusReadResult = {
  pagination: {
    has_next_page: boolean;
    has_previous_page: boolean;
    page: number;
    page_size: number;
  };
  statuses: CustomerBookingStatusRecord[];
  version: typeof customerBookingStatusReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type CustomerBookingStatusClient = Pick<SupabaseClient, "from">;

const defaultStatusLimit = 10;
const maxStatusLimit = 25;
const maxStatusPage = 1000;
const maxBookingReferenceLength = 120;
const maxSafeTextLength = 500;
const customerAccountSelect =
  "customer_account_reference, account_status";
const customerBookingStatusSelect =
  "booking_reference, service_type, pickup_at, pickup_datetime, pickup_location, dropoff_location, route_type, passenger_name, customer_facing_status, short_notice_review_status, request_review_status, change_review_status, cancellation_review_status, created_at, updated_at";
const customerStatusAuthRequiredError =
  "Customer booking status lookup requires secure customer account access before saved booking statuses can be read.";
const customerStatusDisabledError =
  "Customer booking status lookup is not enabled on this server.";
const customerStatusConfigError =
  "Customer booking status lookup configuration is not ready.";
const customerStatusReadError =
  "Customer booking status lookup failed safely.";
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
const allowedReviewStatuses = new Set([
  "admin_review_required",
  "approved",
  "cancelled",
  "completed",
  "declined",
  "needs_review",
  "not_required",
  "pending_review",
  "requested",
  "reviewed",
]);
const forbiddenCustomerStatusFragments = [
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

  return forbiddenCustomerStatusFragments.some((fragment) => normalized.includes(fragment));
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

  if (!cleaned || cleaned.length > 80) {
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

function validLimit(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return defaultStatusLimit;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxStatusLimit ? parsed : null;
}

function validPage(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxStatusPage ? parsed : null;
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

function publicSafeReviewStatus(value: unknown) {
  const cleaned = normalizeToken(textOrNull(value) || "");

  return allowedReviewStatuses.has(cleaned) ? cleaned : null;
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

function getServerOnlyCustomerBookingStatusSupabaseClient(): AdminBookingResult<CustomerBookingStatusClient> {
  if (process.env.PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_ENABLED !== "true") {
    return {
      error: customerStatusDisabledError,
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
      error: customerStatusConfigError,
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
      error: customerStatusConfigError,
      ok: false,
      status: 503,
    };
  }
}

function toCustomerBookingStatusRecord(row: UnknownRecord): CustomerBookingStatusRecord | null {
  const bookingReference = validBookingReference(row.booking_reference);

  if (!bookingReference) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    cancellation_review_status: publicSafeReviewStatus(row.cancellation_review_status),
    change_review_status: publicSafeReviewStatus(row.change_review_status),
    created_at: safeDateTextFromDb(row.created_at),
    customer_facing_status: publicSafeStatus(row.customer_facing_status),
    dropoff_location: safeTextFromDb(row.dropoff_location),
    passenger_name: safeTextFromDb(row.passenger_name),
    pickup_at: safeDateTextFromDb(row.pickup_at) || safeDateTextFromDb(row.pickup_datetime),
    pickup_location: safeTextFromDb(row.pickup_location),
    request_review_status: publicSafeReviewStatus(row.request_review_status),
    service_type: safeTextFromDb(row.service_type) || safeTextFromDb(row.route_type),
    short_notice_review_status: publicSafeReviewStatus(row.short_notice_review_status),
    updated_at: safeDateTextFromDb(row.updated_at),
  };
}

export function customerBookingStatusAuthRequiredResult<T = null>(): AdminBookingResult<T> {
  return {
    error: customerStatusAuthRequiredError,
    ok: false,
    status: 403,
  };
}

export function parseCustomerBookingStatusReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<CustomerBookingStatusReadParams> {
  const entries = paramEntries(params);
  const unsafeParams = entries.filter(
    ([key, value]) =>
      !allowedQueryParams.has(key) ||
      includesForbiddenFragment(key) ||
      includesForbiddenFragment(String(value ?? "")),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Customer booking status lookup includes fields outside the approved read scope.",
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
      error: "Malformed customer booking status booking_reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = validLimit(readParamsValue(params, "limit"));
  const page = validPage(readParamsValue(params, "page"));

  if (!limit) {
    return {
      error: "Malformed customer booking status limit rejected.",
      ok: false,
      status: 400,
    };
  }

  if (!page) {
    return {
      error: "Malformed customer booking status page rejected.",
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

export function resolveCustomerBookingStatusBoundary(
  request: Request,
): AdminBookingResult<CustomerBookingStatusBoundaryContext> {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== "customer-booking-status-read") {
    return customerBookingStatusAuthRequiredResult();
  }

  if (origin && origin !== requestUrl.origin) {
    return customerBookingStatusAuthRequiredResult();
  }

  if (!referer) {
    return customerBookingStatusAuthRequiredResult();
  }

  try {
    const refererUrl = new URL(referer);

    if (refererUrl.origin !== requestUrl.origin || refererUrl.pathname !== "/my-bookings") {
      return customerBookingStatusAuthRequiredResult();
    }
  } catch {
    return customerBookingStatusAuthRequiredResult();
  }

  if (process.env.PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_ENABLED !== "true") {
    return customerBookingStatusAuthRequiredResult();
  }

  const expectedToken = configValueOrNull(process.env.PRESTIGE_CUSTOMER_BOOKING_STATUS_SESSION_TOKEN);
  const providedToken = request.headers.get("x-prestige-customer-session-token")?.trim() || "";
  const mode = configValueOrNull(process.env.PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_MODE);
  const authUserId = safeUuid(process.env.PRESTIGE_CUSTOMER_BOOKING_STATUS_AUTH_USER_ID);

  if (
    mode !== "server-session-token" ||
    !validServerCredential(expectedToken) ||
    providedToken !== expectedToken ||
    !authUserId
  ) {
    return customerBookingStatusAuthRequiredResult();
  }

  return {
    data: {
      auth_user_id: authUserId,
      mode: "server-session-token",
      source_surface: "customer_api",
    },
    ok: true,
  };
}

export async function loadCustomerBookingStatuses(
  input: URLSearchParams | UnknownRecord,
  context: CustomerBookingStatusBoundaryContext,
): Promise<AdminBookingResult<CustomerBookingStatusReadResult>> {
  const parsed = parseCustomerBookingStatusReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyCustomerBookingStatusSupabaseClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data: accountRows, error: accountError } = await clientResult.data
    .from("customer_access_accounts")
    .select(customerAccountSelect)
    .eq("auth_user_id", context.auth_user_id)
    .eq("account_status", "active")
    .limit(1);

  if (accountError) {
    return safeAdapterFailure(customerStatusReadError, 500, accountError);
  }

  const customerAccountReference = validBookingReference(
    asRecord(asArray(accountRows)[0]).customer_account_reference,
  );

  if (!customerAccountReference) {
    return {
      data: {
        pagination: {
          has_next_page: false,
          has_previous_page: parsed.data.page > 1,
          page: parsed.data.page,
          page_size: parsed.data.limit,
        },
        statuses: [],
        version: customerBookingStatusReadVersion,
      },
      ok: true,
    };
  }

  const offset = (parsed.data.page - 1) * parsed.data.limit;
  const rangeEnd = offset + parsed.data.limit;
  let bookingQuery = clientResult.data
    .from("bookings")
    .select(customerBookingStatusSelect)
    .eq("customer_id", customerAccountReference)
    .order("updated_at", { ascending: false })
    .range(offset, rangeEnd);

  if (parsed.data.booking_reference) {
    bookingQuery = bookingQuery.eq("booking_reference", parsed.data.booking_reference);
  }

  const { data: bookingRows, error: bookingError } = await bookingQuery;

  if (bookingError) {
    return safeAdapterFailure(customerStatusReadError, 500, bookingError);
  }

  const rows = asArray(bookingRows)
    .map(asRecord)
    .map(toCustomerBookingStatusRecord)
    .filter((record): record is CustomerBookingStatusRecord => Boolean(record));

  return {
    data: {
      pagination: {
        has_next_page: rows.length > parsed.data.limit,
        has_previous_page: parsed.data.page > 1,
        page: parsed.data.page,
        page_size: parsed.data.limit,
      },
      statuses: rows.slice(0, parsed.data.limit),
      version: customerBookingStatusReadVersion,
    },
    ok: true,
  };
}
