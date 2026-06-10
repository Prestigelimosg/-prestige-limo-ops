export const customerPortalSavedBookingsApiPath = "/api/customer-saved-bookings";

export type BookingStatus = "Cancelled" | "Completed" | "Confirmed" | "Pending Staff Review" | "Requested";

export type CustomerPortalBooking = {
  dropoffLocation: string;
  flightNumber?: string;
  id: string;
  passengerName: string;
  pickupDateTime: string;
  pickupLocation: string;
  serviceType: string;
  specialRequest?: string;
  status: BookingStatus;
  vehicleType: string;
};

type UnknownRecord = Record<string, unknown>;
type CustomerPortalSavedBookingsFetch = typeof fetch;

const maxSafeTextLength = 500;
const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const allowedApiRecordFields = new Set([
  "booking_month",
  "booking_reference",
  "created_at",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "service_type",
  "updated_at",
]);
const allowedApiPayloadFields = new Set(["ok", "pagination", "saved_bookings", "version"]);
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

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
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

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeBookingReference(value: unknown) {
  const cleaned = safeText(value, 120);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : null;
}

function safeStatus(value: unknown): BookingStatus {
  const normalized = normalizeToken(textOrNull(value) || "");

  if (normalized === "completed") {
    return "Completed";
  }

  if (normalized === "cancelled" || normalized === "declined") {
    return "Cancelled";
  }

  if (normalized === "confirmed" || normalized === "driver_assigned") {
    return "Confirmed";
  }

  if (normalized === "received") {
    return "Requested";
  }

  return "Pending Staff Review";
}

function findMonthIndex(value: string) {
  const normalized = value.toLowerCase();

  return monthNames.findIndex(
    (month) => month.toLowerCase() === normalized || month.slice(0, 3).toLowerCase() === normalized,
  );
}

function formatPickupDateTime(value: unknown) {
  const cleaned = safeText(value, 80);

  if (!cleaned) {
    return "Pickup time to confirm";
  }

  const isoLikeMatch = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}))?/);

  if (isoLikeMatch) {
    const [, year, month, day, hour = "", minute = ""] = isoLikeMatch;
    const monthIndex = Number(month) - 1;

    if (monthNames[monthIndex]) {
      return `${Number(day)} ${monthNames[monthIndex]} ${year}${hour && minute ? `, ${hour}:${minute}` : ""}`;
    }
  }

  const displayMatch = cleaned.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})(?:,\s*(\d{2}:\d{2}))?/);

  if (displayMatch) {
    const [, day, monthText, year, time = ""] = displayMatch;
    const monthIndex = findMonthIndex(monthText);

    if (monthIndex >= 0) {
      return `${Number(day)} ${monthNames[monthIndex]} ${year}${time ? `, ${time}` : ""}`;
    }
  }

  return cleaned;
}

function hasUnsafeApiRecordKeys(record: UnknownRecord) {
  return Object.keys(record).some((key) => !allowedApiRecordFields.has(key) || includesForbiddenFragment(key));
}

function hasUnsafeApiPayloadKeys(record: UnknownRecord) {
  return Object.keys(record).some((key) => !allowedApiPayloadFields.has(key) || includesForbiddenFragment(key));
}

function toCustomerPortalBooking(value: unknown): CustomerPortalBooking | null {
  const record = asRecord(value);

  if (!record || hasUnsafeApiRecordKeys(record)) {
    return null;
  }

  const bookingReference = safeBookingReference(record.booking_reference);

  if (!bookingReference) {
    return null;
  }

  return {
    dropoffLocation: safeText(record.dropoff_location) || "Drop-off to confirm",
    id: `saved-${bookingReference}`,
    passengerName: safeText(record.passenger_name) || "Passenger to confirm",
    pickupDateTime: formatPickupDateTime(record.pickup_at),
    pickupLocation: safeText(record.pickup_location) || "Pickup to confirm",
    serviceType: safeText(record.service_type, 120) || "Service to confirm",
    status: safeStatus(record.customer_facing_status),
    vehicleType: "To confirm",
  };
}

export function mapCustomerSavedBookingsPayload(payload: unknown): CustomerPortalBooking[] | null {
  const record = asRecord(payload);

  if (!record || hasUnsafeApiPayloadKeys(record) || record.ok !== true || !Array.isArray(record.saved_bookings)) {
    return null;
  }

  const mappedBookings: CustomerPortalBooking[] = [];

  for (const savedBooking of record.saved_bookings) {
    const mappedBooking = toCustomerPortalBooking(savedBooking);

    if (!mappedBooking) {
      return null;
    }

    mappedBookings.push(mappedBooking);
  }

  return mappedBookings;
}

export async function loadCustomerPortalSavedBookings({
  fetcher = fetch,
  signal,
}: {
  fetcher?: CustomerPortalSavedBookingsFetch;
  signal?: AbortSignal;
} = {}): Promise<CustomerPortalBooking[] | null> {
  try {
    const response = await fetcher(`${customerPortalSavedBookingsApiPath}?limit=25&page=1`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-prestige-customer-purpose": "customer-saved-bookings-read",
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    return mapCustomerSavedBookingsPayload(await response.json());
  } catch {
    return null;
  }
}
