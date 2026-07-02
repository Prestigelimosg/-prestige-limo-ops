export const customerPortalBookingChangeRequestsApiPath =
  "/api/customer-booking-change-requests";

export type CustomerPortalBookingChangeRequestKind = "amendment" | "cancellation";

export type CustomerPortalBookingChangeRequestInput = {
  bookingReference: string;
  requestKind: CustomerPortalBookingChangeRequestKind;
  requestNote: string;
  requestedDropoffLocation: string;
  requestedPickupDate: string;
  requestedPickupLocation: string;
  requestedPickupTime: string;
};

export type CustomerPortalBookingChangeRequestResult = {
  bookingReference: string;
  calendarUpdate: false;
  crmUpdate: false;
  externalSend: false;
  requestKind: CustomerPortalBookingChangeRequestKind;
  reviewStatus: "pending_admin_review";
};

type UnknownRecord = Record<string, unknown>;
type CustomerPortalBookingChangeRequestFetch = typeof fetch;

const allowedResponseFields = new Set(["ok", "request"]);
const allowedRequestFields = new Set([
  "booking_reference",
  "calendar_update",
  "crm_update",
  "external_send",
  "request_kind",
  "review_status",
]);
const forbiddenChangeRequestFragments = [
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
  "stripe",
  "telegram",
  "token",
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

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenChangeRequestFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = 240) {
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

function hasUnsafeKeys(record: UnknownRecord, allowedFields: Set<string>) {
  return Object.keys(record).some((key) => !allowedFields.has(key) || includesForbiddenFragment(key));
}

function mapBookingChangeRequestPayload(
  payload: unknown,
): CustomerPortalBookingChangeRequestResult | null {
  const record = asRecord(payload);

  if (!record || record.ok !== true || hasUnsafeKeys(record, allowedResponseFields)) {
    return null;
  }

  const request = asRecord(record.request);

  if (!request || hasUnsafeKeys(request, allowedRequestFields)) {
    return null;
  }

  const bookingReference = safeBookingReference(request.booking_reference);
  const requestKind =
    request.request_kind === "amendment" || request.request_kind === "cancellation"
      ? request.request_kind
      : null;

  if (
    !bookingReference ||
    !requestKind ||
    request.calendar_update !== false ||
    request.crm_update !== false ||
    request.external_send !== false ||
    request.review_status !== "pending_admin_review"
  ) {
    return null;
  }

  return {
    bookingReference,
    calendarUpdate: false,
    crmUpdate: false,
    externalSend: false,
    requestKind,
    reviewStatus: "pending_admin_review",
  };
}

export async function submitCustomerPortalBookingChangeRequest({
  fetcher = fetch,
  input,
  signal,
}: {
  fetcher?: CustomerPortalBookingChangeRequestFetch;
  input: CustomerPortalBookingChangeRequestInput;
  signal?: AbortSignal;
}): Promise<CustomerPortalBookingChangeRequestResult> {
  const response = await fetcher(customerPortalBookingChangeRequestsApiPath, {
    body: JSON.stringify({
      booking_reference: input.bookingReference,
      request_kind: input.requestKind,
      request_note: input.requestNote,
      requested_dropoff_location: input.requestedDropoffLocation,
      requested_pickup_date: input.requestedPickupDate,
      requested_pickup_location: input.requestedPickupLocation,
      requested_pickup_time: input.requestedPickupTime,
    }),
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-prestige-customer-purpose": "customer-booking-change-request",
    },
    method: "POST",
    signal,
  });
  const result = await response.json().catch(() => null);
  const mapped = mapBookingChangeRequestPayload(result);

  if (!response.ok || !mapped) {
    throw new Error(
      asRecord(result)?.error
        ? String(asRecord(result)?.error)
        : "Booking change request could not be saved safely.",
    );
  }

  return mapped;
}
