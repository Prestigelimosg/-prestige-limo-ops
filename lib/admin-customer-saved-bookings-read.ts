import "server-only";

import type {
  AdminBookingPersistenceRecord,
  AdminBookingResult,
} from "./admin-booking-persistence";
import { listAdminBookings } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminCustomerSavedBookingsReadVersion =
  "admin-customer-saved-bookings-read-v1";

export type AdminCustomerSavedBookingsReadParams = {
  account_scope_key: string | null;
  customer_account: string | null;
  customer_id: string | null;
  limit: number;
};

export type AdminCustomerSavedBookingSafeRecord = {
  account_scope_key: string;
  account_scope_label: string | null;
  admin_status: string | null;
  booking_month: string | null;
  booking_reference: string;
  customer_account: string | null;
  customer_id: string | null;
  customer_status: string | null;
  pickup_at: string | null;
  service_type: string | null;
  source: "admin_booking_persistence";
};

export type AdminCustomerSavedBookingsReadSummary = {
  matched_count: number;
  recent_read_count: number;
  returned_count: number;
};

export type AdminCustomerSavedBookingsReadData = {
  saved_bookings: AdminCustomerSavedBookingSafeRecord[];
  summary: AdminCustomerSavedBookingsReadSummary;
  version: typeof adminCustomerSavedBookingsReadVersion;
};

type UnknownRecord = Record<string, unknown>;

const defaultLimit = 10;
const maxLimit = 25;
const customerFolderSavedBookingSourceReadLimit = 200;
const maxSafeTextLength = 160;
const malformedParamsError = "Admin customer saved bookings read parameters are malformed.";
const forbiddenParamsError =
  "Admin customer saved bookings read parameters include unsupported or unsafe fields.";
const forbiddenSafeTextFragments = [
  "admin_finance",
  "admin_note",
  "auth_link",
  "contact_email",
  "contact_phone",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_note",
  "driver_payout",
  "email_payload",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "raw_ai",
  "raw_token",
  "secret",
  "send",
  "server_secret",
  "service_role",
  "stripe",
  "token",
  "whatsapp",
];

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function normalizeAccountScopeKey(value: string) {
  const scopeParts = value
    .split(/__+/)
    .map((part) => normalizeToken(part).replace(/^_+|_+$/g, ""))
    .filter(Boolean);

  return scopeParts.length > 1
    ? scopeParts.join("__")
    : normalizeToken(value).replace(/^_+|_+$/g, "");
}

function includesForbiddenSafeTextFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenSafeTextFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > maxLength || includesForbiddenSafeTextFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function validBookingMonth(value: unknown) {
  const cleaned = textOrNull(value);
  const match = cleaned?.match(/^(\d{4})-(\d{2})/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? `${match[1]}-${match[2]}` : null;
}

function safeStatus(value: unknown) {
  return safeText(value, 80);
}

function normalizeForMatch(value: unknown) {
  return safeText(value)?.replace(/[^a-z0-9]+/gi, "").toLowerCase() || "";
}

function accountScopeFromBooking(booking: AdminBookingPersistenceRecord) {
  const bookerName = safeText(booking.contact_display_name, 80);
  const travellerName = safeText(booking.passenger_name, 80);
  const bookerKey = normalizeToken(bookerName || "");
  const travellerKey = normalizeToken(travellerName || "");
  const labelParts = [
    travellerName ? `Passenger: ${travellerName}` : null,
    bookerName && bookerKey !== travellerKey ? `Booker: ${bookerName}` : null,
  ].filter((value): value is string => Boolean(value));

  return {
    key: travellerKey || (bookerKey ? `booker_${bookerKey}` : "booker_traveller_not_set"),
    label: labelParts.length > 0 ? labelParts.join(" / ") : null,
  };
}

function bookingMatchesCustomer(
  booking: AdminBookingPersistenceRecord,
  params: AdminCustomerSavedBookingsReadParams,
) {
  const customerId = normalizeForMatch(booking.customer_id);
  const customerAccount = normalizeForMatch(booking.customer_display_name);
  const baseMatches =
    (params.customer_id && customerId === normalizeForMatch(params.customer_id)) ||
    (params.customer_account && customerAccount === normalizeForMatch(params.customer_account));

  if (!baseMatches) {
    return false;
  }

  if (!params.account_scope_key) {
    return true;
  }

  return (
    normalizeAccountScopeKey(accountScopeFromBooking(booking).key) ===
    normalizeAccountScopeKey(params.account_scope_key)
  );
}

function toSafeSavedBooking(
  booking: AdminBookingPersistenceRecord,
): AdminCustomerSavedBookingSafeRecord | null {
  const bookingReference = safeText(booking.booking_reference, 120);

  if (!bookingReference) {
    return null;
  }

  const accountScope = accountScopeFromBooking(booking);

  return {
    account_scope_key: accountScope.key,
    account_scope_label: accountScope.label,
    admin_status: safeStatus(booking.admin_internal_status),
    booking_month: validBookingMonth(booking.pickup_at || booking.pickup_datetime),
    booking_reference: bookingReference,
    customer_account: safeText(booking.customer_display_name),
    customer_id: safeText(booking.customer_id, 120),
    customer_status: safeStatus(booking.customer_facing_status),
    pickup_at: safeText(booking.pickup_at || booking.pickup_datetime, 80),
    service_type: safeText(booking.service_type || booking.route_type, 80),
    source: "admin_booking_persistence",
  };
}

export function parseAdminCustomerSavedBookingsReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminCustomerSavedBookingsReadParams> {
  const customerAccountValue =
    readParamsValue(params, "customer_account") ||
    readParamsValue(params, "customer_account_search") ||
    readParamsValue(params, "customer_search");
  const customerAccount =
    customerAccountValue === undefined || customerAccountValue === null || customerAccountValue === ""
      ? null
      : safeText(customerAccountValue);
  const customerIdValue = readParamsValue(params, "customer_id");
  const customerId =
    customerIdValue === undefined || customerIdValue === null || customerIdValue === ""
      ? null
      : safeText(customerIdValue, 120);
  const accountScopeKeyValue = readParamsValue(params, "account_scope_key");
  const accountScopeKey =
    accountScopeKeyValue === undefined || accountScopeKeyValue === null || accountScopeKeyValue === ""
      ? null
      : safeText(accountScopeKeyValue, 220);

  if (
    (customerAccountValue && !customerAccount) ||
    (customerIdValue && !customerId) ||
    (accountScopeKeyValue && !accountScopeKey)
  ) {
    return {
      error: forbiddenParamsError,
      ok: false,
      status: 400,
    };
  }

  if (!customerAccount && !customerId) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(readParamsValue(params, "limit"), defaultLimit, maxLimit);

  if (!limit) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      account_scope_key: accountScopeKey ? normalizeAccountScopeKey(accountScopeKey) : null,
      customer_account: customerAccount,
      customer_id: customerId,
      limit,
    },
    ok: true,
  };
}

export async function loadAdminCustomerSavedBookings(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerSavedBookingsReadData>> {
  const parsed = parseAdminCustomerSavedBookingsReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const bookingsResult = await listAdminBookings(actor, {
    limit: customerFolderSavedBookingSourceReadLimit,
  });

  if (!bookingsResult.ok) {
    return bookingsResult;
  }

  const matchedBookings = bookingsResult.data
    .filter((booking) => bookingMatchesCustomer(booking, parsed.data))
    .map(toSafeSavedBooking)
    .filter((booking): booking is AdminCustomerSavedBookingSafeRecord => Boolean(booking))
    .sort(
      (first, second) =>
        (second.pickup_at || "").localeCompare(first.pickup_at || "") ||
        first.booking_reference.localeCompare(second.booking_reference),
    );
  const savedBookings = matchedBookings.slice(0, parsed.data.limit);

  return {
    data: {
      saved_bookings: savedBookings,
      summary: {
        matched_count: matchedBookings.length,
        recent_read_count: bookingsResult.data.length,
        returned_count: savedBookings.length,
      },
      version: adminCustomerSavedBookingsReadVersion,
    },
    ok: true,
  };
}
