export const customerPortalSavedBookingsApiPath = "/api/customer-saved-bookings";

export type BookingStatus = "Cancelled" | "Completed" | "Confirmed" | "Pending Staff Review" | "Requested";

export type CustomerPortalDriverDetails = {
  carPlate: string;
  carType: string;
  driverContact: string;
  driverName: string;
};

export type CustomerPortalBooking = {
  driverDetails?: CustomerPortalDriverDetails;
  dropoffLocation: string;
  flightNumber?: string;
  id: string;
  passengerName: string;
  pickupDateTime: string;
  pickupLocation: string;
  publicBookingReference: string;
  serviceType: string;
  specialRequest?: string;
  status: BookingStatus;
  vehicleType: string;
};

export type CustomerPortalSavedBookingMatch = {
  booking: CustomerPortalBooking;
  page: number;
};

type CustomerPortalSavedBookingsPage = {
  bookings: CustomerPortalBooking[];
  hasNextPage: boolean;
  page: number;
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
  "customer_driver_details",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "public_booking_reference",
  "service_type",
  "updated_at",
]);
const allowedCustomerDriverDetailFields = new Set([
  "car_plate",
  "car_type",
  "driver_contact",
  "driver_name",
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

function customerVehicleDisplayLabel(value: unknown) {
  const cleaned = safeText(value, 120) || "";

  if (cleaned.toUpperCase() === "AVF") {
    return "Alphard";
  }

  if (cleaned.toUpperCase() === "VVV") {
    return "Viano";
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

function formatSingaporeDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(date);
  const partValue = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value || "";
  const year = partValue("year");
  const month = partValue("month");
  const day = partValue("day");
  const hour = partValue("hour");
  const minute = partValue("minute");
  const monthName = monthNames[Number(month) - 1];

  if (!year || !monthName || !day || !hour || !minute) {
    return null;
  }

  return `${Number(day)} ${monthName} ${year}, ${hour}:${minute}`;
}

function formatPickupDateTime(value: unknown) {
  const cleaned = safeText(value, 80);

  if (!cleaned) {
    return "Pickup time to confirm";
  }

  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/i.test(cleaned)) {
    const parsed = new Date(cleaned);

    if (!Number.isNaN(parsed.getTime())) {
      const singaporeDateTime = formatSingaporeDateTime(parsed);

      if (singaporeDateTime) {
        return singaporeDateTime;
      }
    }
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

function toCustomerPortalDriverDetails(value: unknown): CustomerPortalDriverDetails | undefined {
  const record = asRecord(value);

  if (!record) {
    return undefined;
  }

  if (
    Object.keys(record).some(
      (key) => !allowedCustomerDriverDetailFields.has(key) || includesForbiddenFragment(key),
    )
  ) {
    return undefined;
  }

  const driverName = safeText(record.driver_name, 120) || "";
  const driverContact = safeText(record.driver_contact, 80) || "";
  const carPlate = safeText(record.car_plate, 80) || "";
  const carType = customerVehicleDisplayLabel(record.car_type);

  if (!driverName && !driverContact && !carPlate && !carType) {
    return undefined;
  }

  return {
    carPlate,
    carType,
    driverContact,
    driverName,
  };
}

function toCustomerPortalBooking(value: unknown): CustomerPortalBooking | null {
  const record = asRecord(value);

  if (!record || hasUnsafeApiRecordKeys(record)) {
    return null;
  }

  const internalBookingReference = safeBookingReference(record.booking_reference);
  const publicBookingReference =
    safeBookingReference(record.public_booking_reference) || internalBookingReference;

  if (!internalBookingReference || !publicBookingReference) {
    return null;
  }

  const driverDetails = toCustomerPortalDriverDetails(record.customer_driver_details);

  const storedServiceType = safeText(record.service_type, 120) || "";
  const customerServiceType =
    ({
      MNG: "Arrival",
      DEP: "Departure",
      TRF: "City Transfer",
      DSP: "Hourly",
    } as const)[storedServiceType.toUpperCase() as "MNG" | "DEP" | "TRF" | "DSP"] ||
    storedServiceType ||
    "Service to confirm";

  return {
    ...(driverDetails ? { driverDetails } : {}),
    dropoffLocation: safeText(record.dropoff_location) || "Drop-off to confirm",
    id: `saved-${internalBookingReference}`,
    passengerName: safeText(record.passenger_name) || "Passenger to confirm",
    pickupDateTime: formatPickupDateTime(record.pickup_at),
    pickupLocation: safeText(record.pickup_location) || "Pickup to confirm",
    publicBookingReference,
    serviceType: customerServiceType,
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

function mapCustomerSavedBookingsPagePayload(
  payload: unknown,
): CustomerPortalSavedBookingsPage | null {
  const record = asRecord(payload);
  const pagination = asRecord(record?.pagination);
  const page = Number(pagination?.page);
  const bookings = mapCustomerSavedBookingsPayload(payload);
  if (
    !pagination ||
    bookings === null ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    typeof pagination.has_next_page !== "boolean"
  ) {
    return null;
  }

  return {
    bookings,
    hasNextPage: pagination.has_next_page,
    page,
  };
}

async function loadCustomerPortalSavedBookingsPage({
  fetcher = fetch,
  page = 1,
  signal,
  travelerId,
}: {
  fetcher?: CustomerPortalSavedBookingsFetch;
  page?: number;
  signal?: AbortSignal;
  travelerId?: number | null;
} = {}): Promise<CustomerPortalSavedBookingsPage | null> {
  try {
    if (!Number.isSafeInteger(page) || page < 1) {
      return null;
    }
    const params = new URLSearchParams({ limit: "25", page: "1" });
    if (page !== 1) params.set("page", String(page));
    if (travelerId && Number.isSafeInteger(travelerId)) params.set("traveler_id", String(travelerId));
    const response = await fetcher(`${customerPortalSavedBookingsApiPath}?${params.toString()}`, {
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

    const mappedPage = mapCustomerSavedBookingsPagePayload(await response.json());
    return mappedPage?.page === page ? mappedPage : null;
  } catch {
    return null;
  }
}

export async function loadCustomerPortalSavedBookings({
  fetcher = fetch,
  page = 1,
  signal,
  travelerId,
}: {
  fetcher?: CustomerPortalSavedBookingsFetch;
  page?: number;
  signal?: AbortSignal;
  travelerId?: number | null;
} = {}): Promise<CustomerPortalBooking[] | null> {
  const result = await loadCustomerPortalSavedBookingsPage({ fetcher, page, signal, travelerId });
  return result?.bookings || null;
}

export async function findCustomerPortalSavedBooking({
  fetcher = fetch,
  publicBookingReference,
  signal,
  travelerId,
}: {
  fetcher?: CustomerPortalSavedBookingsFetch;
  publicBookingReference: string;
  signal?: AbortSignal;
  travelerId?: number | null;
}): Promise<CustomerPortalSavedBookingMatch | null> {
  const safeReference = safeBookingReference(publicBookingReference);
  if (!safeReference) {
    return null;
  }

  let page = 1;
  while (!signal?.aborted) {
    const result = await loadCustomerPortalSavedBookingsPage({
      fetcher,
      page,
      signal,
      travelerId,
    });
    if (!result) {
      return null;
    }
    const booking = result.bookings.find(
      (candidate) => candidate.publicBookingReference === safeReference,
    );
    if (booking) {
      return { booking, page };
    }
    if (!result.hasNextPage) {
      return null;
    }
    page += 1;
  }

  return null;
}
