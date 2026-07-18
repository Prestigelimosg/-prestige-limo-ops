export const customerBookingRequestApiPath = "/api/customer-booking-requests";

export type CustomerBookingRequestSubmitInput = {
  companyName?: string;
  contactNo: string;
  emailAddress?: string;
  passengerName: string;
  travelerId?: string;
  pickupDate: string;
  pickupTime: string;
  flightNumber?: string;
  pickupLocation: string;
  dropoffLocation: string;
  returnTripRequested?: string | boolean;
  returnPickupDate?: string;
  returnPickupTime?: string;
  returnFlightNumber?: string;
  returnPickupLocation?: string;
  returnDropoffLocation?: string;
  returnExtraStops?: string;
  serviceType: string;
  vehicleType?: string;
  passengerCount?: string;
  luggage?: string;
  extraStops?: string;
};

export type CustomerBookingRequestSubmitResult =
  | {
      ok: true;
      bookingReference: string;
      receiptStatus: "blocked" | "failed" | "sent";
      returnBookingReference: string | null;
      returnTripRequested: boolean;
      shortNoticeReviewRequired: boolean;
    }
  | {
      ok: false;
      reason?: "portal_access_cleared";
    };

type CustomerBookingRequestFetch = typeof fetch;
type UnknownRecord = Record<string, unknown>;

const allowedApiPayloadFields = new Set(["ok", "request"]);
const allowedApiRequestFields = new Set([
  "booking_reference",
  "customer_facing_status",
  "return_booking_reference",
  "return_trip_requested",
  "receipt_status",
  "short_notice_review_required",
]);
const forbiddenCustomerBookingRequestFragments = [
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

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenCustomerBookingRequestFragments.some((fragment) => normalized.includes(fragment));
}

function hasUnsafeKeys(record: UnknownRecord, allowedFields: Set<string>) {
  return Object.keys(record).some((key) => !allowedFields.has(key) || includesForbiddenFragment(key));
}

function hasUnsafeValues(value: unknown): boolean {
  if (typeof value === "string") {
    return includesForbiddenFragment(value);
  }

  if (Array.isArray(value)) {
    return value.some((item) => hasUnsafeValues(item));
  }

  const record = asRecord(value);

  return record ? Object.values(record).some((item) => hasUnsafeValues(item)) : false;
}

function toCustomerBookingRequestApiBody(input: CustomerBookingRequestSubmitInput) {
  return {
    companyName: input.companyName,
    contactNo: input.contactNo,
    emailAddress: input.emailAddress,
    passengerName: input.passengerName,
    travelerId: input.travelerId,
    pickupDate: input.pickupDate,
    pickupTime: input.pickupTime,
    flightNumber: input.flightNumber,
    pickupLocation: input.pickupLocation,
    dropoffLocation: input.dropoffLocation,
    returnTripRequested: input.returnTripRequested,
    returnPickupDate: input.returnPickupDate,
    returnPickupTime: input.returnPickupTime,
    returnFlightNumber: input.returnFlightNumber,
    returnPickupLocation: input.returnPickupLocation,
    returnDropoffLocation: input.returnDropoffLocation,
    returnExtraStops: input.returnExtraStops,
    serviceType: input.serviceType,
    vehicleType: input.vehicleType,
    passengerCount: input.passengerCount,
    luggage: input.luggage,
    extraStops: input.extraStops,
  };
}

export function mapCustomerBookingRequestSubmitPayload(
  payload: unknown,
): CustomerBookingRequestSubmitResult {
  const record = asRecord(payload);

  if (
    !record ||
    hasUnsafeKeys(record, allowedApiPayloadFields) ||
    hasUnsafeValues(record) ||
    record.ok !== true
  ) {
    return { ok: false };
  }

  const request = asRecord(record.request);

  if (!request || hasUnsafeKeys(request, allowedApiRequestFields)) {
    return { ok: false };
  }

  const bookingReference =
    typeof request.booking_reference === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(request.booking_reference)
      ? request.booking_reference
      : "";
  const returnBookingReference =
    request.return_booking_reference === null
      ? null
      : typeof request.return_booking_reference === "string" &&
          /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(request.return_booking_reference)
        ? request.return_booking_reference
        : "";
  const receiptStatus =
    request.receipt_status === "sent" ||
    request.receipt_status === "failed" ||
    request.receipt_status === "blocked"
      ? request.receipt_status
      : null;

  if (!bookingReference || returnBookingReference === "" || !receiptStatus) {
    return { ok: false };
  }

  return {
    bookingReference,
    ok: true,
    receiptStatus,
    returnBookingReference,
    returnTripRequested: request.return_trip_requested === true,
    shortNoticeReviewRequired: request.short_notice_review_required === true,
  };
}

export async function submitCustomerBookingRequest(
  input: CustomerBookingRequestSubmitInput,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: CustomerBookingRequestFetch;
    signal?: AbortSignal;
  } = {},
): Promise<CustomerBookingRequestSubmitResult> {
  try {
    const response = await fetcher(customerBookingRequestApiPath, {
      body: JSON.stringify(toCustomerBookingRequestApiBody(input)),
      cache: "no-store",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        "x-prestige-customer-purpose": "customer-booking-request",
      },
      method: "POST",
      signal,
    });

    if (!response.ok) {
      return response.status === 409
        ? { ok: false, reason: "portal_access_cleared" }
        : { ok: false };
    }

    return mapCustomerBookingRequestSubmitPayload(await response.json());
  } catch {
    return { ok: false };
  }
}
