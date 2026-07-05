import "server-only";

import type {
  AdminBookingPersistenceRecord,
  AdminBookingResult,
} from "./admin-booking-persistence";
import { listAdminBookings } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminCustomerAccountsReadVersion = "admin-customer-accounts-read-v1";

export type AdminCustomerAccountsReadParams = {
  limit: number;
  search: string | null;
};

export type AdminCustomerAccountSafeRecord = {
  completed_count: number;
  customer_account: string;
  customer_id: string | null;
  latest_booking_reference: string | null;
  latest_pickup_at: string | null;
  latest_service_type: string | null;
  saved_booking_count: number;
  source: "admin_booking_persistence";
  upcoming_count: number;
};

export type AdminCustomerAccountsReadSummary = {
  recent_read_count: number;
  returned_count: number;
  total_account_count: number;
};

export type AdminCustomerAccountsReadData = {
  accounts: AdminCustomerAccountSafeRecord[];
  summary: AdminCustomerAccountsReadSummary;
  version: typeof adminCustomerAccountsReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type MutableCustomerAccount = AdminCustomerAccountSafeRecord & {
  latestSortValue: string;
};

const defaultLimit = 10;
const maxLimit = 25;
const accountSourceReadLimit = 200;
const maxSearchLength = 80;
const malformedParamsError = "Admin customer accounts read parameters are malformed.";
const forbiddenParamsError =
  "Admin customer accounts read parameters include unsupported or unsafe fields.";
const allowedParams = new Set(["limit", "search"]);
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

function textOrNull(value: unknown, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeToken(value: string | null | undefined) {
  return (
    value
      ?.replace(/([a-z])([A-Z])/g, "$1_$2")
      .replace(/[^a-z0-9]+/gi, "_")
      .toLowerCase() || ""
  );
}

function includesForbiddenSafeTextFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenSafeTextFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = 160) {
  const cleaned = textOrNull(value, maxLength);

  if (!cleaned || includesForbiddenSafeTextFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function readParamKeys(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function searchText(value: unknown) {
  const cleaned = textOrNull(value, maxSearchLength);

  if (!cleaned) {
    return null;
  }

  return includesForbiddenSafeTextFragment(cleaned) ? false : cleaned;
}

function filterAccountsBySearch(
  accounts: AdminCustomerAccountSafeRecord[],
  search: string | null,
) {
  const normalizedSearch = search?.trim().toLowerCase();

  if (!normalizedSearch) {
    return accounts;
  }

  return accounts.filter((account) =>
    account.customer_account.toLowerCase().startsWith(normalizedSearch),
  );
}

function accountGroupKey(customerId: string | null, customerAccount: string) {
  return customerId || normalizeToken(customerAccount);
}

function customerAccountDisplayLabel(booking: AdminBookingPersistenceRecord) {
  const customerAccount = safeText(booking.customer_display_name, 120);

  if (!customerAccount) {
    return "";
  }

  const travelerName = safeText(booking.passenger_name, 80);
  const customerKey = normalizeToken(customerAccount);
  const travelerKey = normalizeToken(travelerName);

  if (!travelerName || !travelerKey || customerKey.includes(travelerKey)) {
    return customerAccount;
  }

  return safeText(`${customerAccount} [${travelerName}]`, 160) || customerAccount;
}

function statusToken(value: unknown) {
  return normalizeToken(textOrNull(value, 80));
}

function isCompletedBooking(booking: AdminBookingPersistenceRecord) {
  const adminStatus = statusToken(booking.admin_internal_status);
  const customerStatus = statusToken(booking.customer_facing_status);

  return adminStatus === "completed" || customerStatus === "completed";
}

function isClosedBooking(booking: AdminBookingPersistenceRecord) {
  const adminStatus = statusToken(booking.admin_internal_status);
  const customerStatus = statusToken(booking.customer_facing_status);

  return (
    isCompletedBooking(booking) ||
    adminStatus === "cancelled" ||
    adminStatus === "archived" ||
    customerStatus === "cancelled" ||
    customerStatus === "declined"
  );
}

function pickupSortValue(value: unknown) {
  return safeText(value, 80) || "";
}

function updateLatestBooking(account: MutableCustomerAccount, booking: AdminBookingPersistenceRecord) {
  const pickupAt = pickupSortValue(booking.pickup_at || booking.pickup_datetime);
  const bookingReference = safeText(booking.booking_reference, 120);
  const serviceType = safeText(booking.service_type || booking.route_type, 80);

  if (pickupAt && pickupAt >= account.latestSortValue) {
    account.latestSortValue = pickupAt;
    account.latest_pickup_at = pickupAt;
    account.latest_booking_reference = bookingReference;
    account.latest_service_type = serviceType;
  }
}

function toSafeAccount(account: MutableCustomerAccount): AdminCustomerAccountSafeRecord {
  return {
    completed_count: account.completed_count,
    customer_account: account.customer_account,
    customer_id: account.customer_id,
    latest_booking_reference: account.latest_booking_reference,
    latest_pickup_at: account.latest_pickup_at,
    latest_service_type: account.latest_service_type,
    saved_booking_count: account.saved_booking_count,
    source: account.source,
    upcoming_count: account.upcoming_count,
  };
}

function toCustomerAccounts(
  bookings: AdminBookingPersistenceRecord[],
): AdminCustomerAccountSafeRecord[] {
  const accounts = new Map<string, MutableCustomerAccount>();

  for (const booking of bookings) {
    const customerAccount = customerAccountDisplayLabel(booking);

    if (!customerAccount) {
      continue;
    }

    const customerId = safeText(booking.customer_id, 120);
    const key = accountGroupKey(customerId, customerAccount);
    const current =
      accounts.get(key) ||
      ({
        completed_count: 0,
        customer_account: customerAccount,
        customer_id: customerId,
        latest_booking_reference: null,
        latest_pickup_at: null,
        latest_service_type: null,
        latestSortValue: "",
        saved_booking_count: 0,
        source: "admin_booking_persistence",
        upcoming_count: 0,
      } satisfies MutableCustomerAccount);

    current.saved_booking_count += 1;

    if (isCompletedBooking(booking)) {
      current.completed_count += 1;
    } else if (!isClosedBooking(booking)) {
      current.upcoming_count += 1;
    }

    updateLatestBooking(current, booking);
    accounts.set(key, current);
  }

  return [...accounts.values()]
    .sort(
      (first, second) =>
        second.latestSortValue.localeCompare(first.latestSortValue) ||
        first.customer_account.localeCompare(second.customer_account),
    )
    .map(toSafeAccount);
}

export function parseAdminCustomerAccountsReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminCustomerAccountsReadParams> {
  const unsupportedParam = readParamKeys(params).find((key) => !allowedParams.has(key));

  if (unsupportedParam) {
    return {
      error: forbiddenParamsError,
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(readParamsValue(params, "limit"), defaultLimit, maxLimit);
  const search = searchText(readParamsValue(params, "search"));

  if (!limit || search === false) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      limit,
      search,
    },
    ok: true,
  };
}

export async function loadAdminCustomerAccounts(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerAccountsReadData>> {
  const parsed = parseAdminCustomerAccountsReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const bookingsResult = await listAdminBookings(actor, {
    limit: accountSourceReadLimit,
  });

  if (!bookingsResult.ok) {
    return bookingsResult;
  }

  const accounts = toCustomerAccounts(bookingsResult.data);
  const filteredAccounts = filterAccountsBySearch(accounts, parsed.data.search);
  const returnedAccounts = filteredAccounts.slice(0, parsed.data.limit);

  return {
    data: {
      accounts: returnedAccounts,
      summary: {
        recent_read_count: bookingsResult.data.length,
        returned_count: returnedAccounts.length,
        total_account_count: accounts.length,
      },
      version: adminCustomerAccountsReadVersion,
    },
    ok: true,
  };
}
