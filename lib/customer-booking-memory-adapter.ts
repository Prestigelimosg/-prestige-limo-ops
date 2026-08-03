export const customerBookingMemoryApiPath = "/api/customer-booking-memory";

export type CustomerBookingRequestMemoryForm = {
  dropoffLocation: string;
  passengerName: string;
  pickupDate: string;
  pickupLocation: string;
  pickupTime: string;
  serviceType: string;
  vehicleType: string;
};

export type CustomerBookingMemorySuggestion = {
  dropoffLocation: string;
  passengerName: string;
  pickupLocation: string;
  serviceType: string;
  vehicleType: string;
};

export type CustomerBookingMemoryBookerProfile = {
  bookerName: string;
  email: string;
  phone: string;
};

export type CustomerBookingMemoryTraveler = {
  defaultDropoffAddress: string;
  defaultPickupAddress: string;
  id: number;
  preferredVehicle: string;
  travelerName: string;
};

export type CustomerBookingMemoryProfile = {
  bookerProfile: CustomerBookingMemoryBookerProfile | null;
  memories: CustomerBookingMemorySuggestion[];
  travelers: CustomerBookingMemoryTraveler[];
};

type UnknownRecord = Record<string, unknown>;
type CustomerBookingMemoryFetch = typeof fetch;

const maxSafeTextLength = 500;
const allowedApiRecordFields = new Set([
  "dropoff_location",
  "last_used_at",
  "passenger_name",
  "pickup_location",
  "service_type",
  "vehicle_type",
]);
const allowedApiPayloadFields = new Set([
  "booker_profile",
  "memories",
  "ok",
  "travelers",
  "version",
]);
const allowedBookerProfileFields = new Set(["booker_name", "email", "phone"]);
const allowedTravelerFields = new Set([
  "default_dropoff_address",
  "default_pickup_address",
  "id",
  "preferred_vehicle",
  "traveler_name",
]);
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

  return forbiddenCustomerBookingMemoryFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function hasUnsafeApiRecordKeys(record: UnknownRecord) {
  return Object.keys(record).some((key) => !allowedApiRecordFields.has(key) || includesForbiddenFragment(key));
}

function hasUnsafeApiPayloadKeys(record: UnknownRecord) {
  return Object.keys(record).some((key) => !allowedApiPayloadFields.has(key) || includesForbiddenFragment(key));
}

function toCustomerBookingMemorySuggestion(value: unknown): CustomerBookingMemorySuggestion | null {
  const record = asRecord(value);

  if (!record || hasUnsafeApiRecordKeys(record)) {
    return null;
  }

  const passengerName = safeText(record.passenger_name, 160);

  if (!passengerName) {
    return null;
  }

  return {
    dropoffLocation: safeText(record.dropoff_location) || "",
    passengerName,
    pickupLocation: safeText(record.pickup_location) || "",
    serviceType: safeText(record.service_type, 120) || "",
    vehicleType: safeText(record.vehicle_type, 120) || "",
  };
}

function safeEmail(value: unknown) {
  const cleaned = safeText(value, 254)?.toLowerCase() || null;

  return cleaned && /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/.test(cleaned)
    ? cleaned
    : null;
}

function toCustomerBookingMemoryBookerProfile(
  value: unknown,
): CustomerBookingMemoryBookerProfile | null {
  const record = asRecord(value);

  if (!record || hasUnsafeKeys(record, allowedBookerProfileFields)) {
    return null;
  }

  const email = safeEmail(record.email);

  return email
    ? {
        bookerName: safeText(record.booker_name, 160) || "",
        email,
        phone: safeText(record.phone, 80) || "",
      }
    : null;
}

function toCustomerBookingMemoryTraveler(value: unknown): CustomerBookingMemoryTraveler | null {
  const record = asRecord(value);
  const id = Number(record?.id);
  const travelerName = record ? safeText(record.traveler_name, 160) : null;

  if (
    !record ||
    hasUnsafeKeys(record, allowedTravelerFields) ||
    !Number.isSafeInteger(id) ||
    id <= 0 ||
    !travelerName
  ) {
    return null;
  }

  return {
    defaultDropoffAddress: safeText(record.default_dropoff_address) || "",
    defaultPickupAddress: safeText(record.default_pickup_address) || "",
    id,
    preferredVehicle: safeText(record.preferred_vehicle, 120) || "",
    travelerName,
  };
}

function hasUnsafeKeys(record: UnknownRecord, allowedFields: Set<string>) {
  return Object.keys(record).some(
    (key) => !allowedFields.has(key) || includesForbiddenFragment(key),
  );
}

export function mapCustomerBookingMemoryProfilePayload(
  payload: unknown,
): CustomerBookingMemoryProfile | null {
  const record = asRecord(payload);

  if (
    !record ||
    hasUnsafeApiPayloadKeys(record) ||
    record.ok !== true ||
    !Array.isArray(record.memories) ||
    !Array.isArray(record.travelers)
  ) {
    return null;
  }

  const memories = record.memories.map(toCustomerBookingMemorySuggestion);
  const travelers = record.travelers.map(toCustomerBookingMemoryTraveler);

  if (memories.some((memory) => !memory) || travelers.some((traveler) => !traveler)) {
    return null;
  }

  return {
    bookerProfile:
      record.booker_profile === null
        ? null
        : toCustomerBookingMemoryBookerProfile(record.booker_profile),
    memories: memories as CustomerBookingMemorySuggestion[],
    travelers: travelers as CustomerBookingMemoryTraveler[],
  };
}

export function mapCustomerBookingMemoryPayload(payload: unknown): CustomerBookingMemorySuggestion[] | null {
  const record = asRecord(payload);

  if (!record || hasUnsafeApiPayloadKeys(record) || record.ok !== true || !Array.isArray(record.memories)) {
    return null;
  }

  const suggestions = record.memories.map(toCustomerBookingMemorySuggestion);

  return suggestions.some((suggestion) => !suggestion)
    ? null
    : (suggestions as CustomerBookingMemorySuggestion[]);
}

async function fetchCustomerBookingMemoryPayload({
  fetcher = fetch,
  limit = 10,
  q,
  signal,
}: {
  fetcher?: CustomerBookingMemoryFetch;
  limit?: number;
  q?: string;
  signal?: AbortSignal;
} = {}): Promise<unknown | null> {
  const params = new URLSearchParams({
    limit: String(limit),
  });
  const query = safeText(q, 120);

  if (q && !query) {
    return null;
  }

  if (query) {
    params.set("q", query);
  }

  try {
    const response = await fetcher(`${customerBookingMemoryApiPath}?${params}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "x-prestige-customer-purpose": "customer-booking-memory-read",
      },
      signal,
    });

    if (!response.ok) {
      return null;
    }

    return await response.json();
  } catch {
    return null;
  }
}

export async function loadCustomerBookingMemoryProfile(
  options: {
    fetcher?: CustomerBookingMemoryFetch;
    limit?: number;
    signal?: AbortSignal;
  } = {},
): Promise<CustomerBookingMemoryProfile | null> {
  const payload = await fetchCustomerBookingMemoryPayload(options);

  return payload ? mapCustomerBookingMemoryProfilePayload(payload) : null;
}

export async function loadCustomerBookingMemorySuggestions({
  fetcher = fetch,
  limit = 10,
  q,
  signal,
}: {
  fetcher?: CustomerBookingMemoryFetch;
  limit?: number;
  q?: string;
  signal?: AbortSignal;
} = {}): Promise<CustomerBookingMemorySuggestion[] | null> {
  const payload = await fetchCustomerBookingMemoryPayload({ fetcher, limit, q, signal });

  return payload ? mapCustomerBookingMemoryPayload(payload) : null;
}

export function applyCustomerBookingMemorySuggestion<T extends CustomerBookingRequestMemoryForm>(
  form: T,
  suggestion: CustomerBookingMemorySuggestion,
): T {
  return {
    ...form,
    dropoffLocation: suggestion.dropoffLocation || form.dropoffLocation,
    passengerName: suggestion.passengerName,
    pickupLocation: suggestion.pickupLocation || form.pickupLocation,
    serviceType: suggestion.serviceType || form.serviceType,
    vehicleType: suggestion.vehicleType || form.vehicleType,
  };
}
