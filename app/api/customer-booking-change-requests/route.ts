import { createCustomerBookingChangeRequestAdminAppNotification } from "../../../lib/admin-app-notification-persistence";
import {
  loadCustomerSavedBookings,
  resolveCustomerSavedBookingsBoundaryForPurpose,
  type CustomerSavedBookingRecord,
} from "../../../lib/customer-saved-bookings-read";

export const dynamic = "force-dynamic";

const customerBookingChangePurposeHeader = "customer-booking-change-request";
const allowedBodyFields = new Set([
  "booking_reference",
  "request_kind",
  "request_note",
  "request_type",
  "requested_dropoff_location",
  "requested_pickup_date",
  "requested_pickup_location",
  "requested_pickup_time",
]);
const maxBookingReferenceLength = 120;
const maxSafeTextLength = 240;
const forbiddenCustomerChangeFragments = [
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

type UnknownRecord = Record<string, unknown>;
type BookingChangeRequestKind = "amendment" | "cancellation";
type ParsedBookingChangeRequest = {
  booking_reference: string;
  request_kind: BookingChangeRequestKind;
  request_note: string | null;
  requested_dropoff_location: string | null;
  requested_pickup_date: string | null;
  requested_pickup_location: string | null;
  requested_pickup_time: string | null;
};
type ParseResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: number;
    };

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenCustomerChangeFragments.some((fragment) => normalized.includes(fragment));
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeBookingReference(value: unknown) {
  const cleaned = safeText(value, maxBookingReferenceLength);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : null;
}

function safePickupDate(value: unknown) {
  const cleaned = safeText(value, 10);

  if (!cleaned || !/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) {
    return null;
  }

  const date = new Date(`${cleaned}T00:00:00Z`);

  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cleaned) {
    return null;
  }

  return cleaned;
}

function safePickupTime(value: unknown) {
  const cleaned = safeText(value, 5);

  return cleaned && /^([01]\d|2[0-3]):[0-5]\d$/.test(cleaned) ? cleaned : null;
}

function parseBookingChangeRequestPayload(value: unknown): ParseResult<ParsedBookingChangeRequest> {
  const record = asRecord(value);
  const unknownKeys = Object.keys(record).filter(
    (key) => !allowedBodyFields.has(key) || includesForbiddenFragment(key),
  );

  if (unknownKeys.length > 0) {
    return {
      error: "Booking change request includes fields outside the approved request scope.",
      ok: false,
      status: 400,
    };
  }

  if (Object.values(record).some((fieldValue) => textOrNull(fieldValue) && includesForbiddenFragment(String(fieldValue)))) {
    return {
      error: "Booking change request includes unsafe request text.",
      ok: false,
      status: 400,
    };
  }

  const bookingReference = safeBookingReference(record.booking_reference);
  const rawRequestKind = normalizeToken(
    safeText(record.request_kind || record.request_type, 40) || "",
  );
  const requestKind: BookingChangeRequestKind | null =
    rawRequestKind === "amendment" || rawRequestKind === "change"
      ? "amendment"
      : rawRequestKind === "cancellation" || rawRequestKind === "cancel"
        ? "cancellation"
        : null;
  const requestedPickupDate = record.requested_pickup_date
    ? safePickupDate(record.requested_pickup_date)
    : null;
  const requestedPickupTime = record.requested_pickup_time
    ? safePickupTime(record.requested_pickup_time)
    : null;
  const requestedPickupLocation = record.requested_pickup_location
    ? safeText(record.requested_pickup_location)
    : null;
  const requestedDropoffLocation = record.requested_dropoff_location
    ? safeText(record.requested_dropoff_location)
    : null;
  const requestNote = record.request_note ? safeText(record.request_note, 500) : null;

  if (!bookingReference || !requestKind) {
    return {
      error: "Booking change request details are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    (record.requested_pickup_date && !requestedPickupDate) ||
    (record.requested_pickup_time && !requestedPickupTime) ||
    (record.requested_pickup_location && !requestedPickupLocation) ||
    (record.requested_dropoff_location && !requestedDropoffLocation) ||
    (record.request_note && !requestNote)
  ) {
    return {
      error: "Booking change request details need review before submission.",
      ok: false,
      status: 400,
    };
  }

  const hasAmendmentValue = Boolean(
    requestedPickupDate ||
      requestedPickupTime ||
      requestedPickupLocation ||
      requestedDropoffLocation,
  );

  if (requestKind === "amendment" && !hasAmendmentValue) {
    return {
      error: "Booking amendment request requires at least one new date, time, pickup, or drop-off value.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      request_kind: requestKind,
      request_note: requestNote,
      requested_dropoff_location: requestedDropoffLocation,
      requested_pickup_date: requestedPickupDate,
      requested_pickup_location: requestedPickupLocation,
      requested_pickup_time: requestedPickupTime,
    },
    ok: true,
  };
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

function blockedResponse() {
  return Response.json(
    {
      error: "Booking change requests can be submitted only from the customer portal.",
      ok: false,
    },
    { status: 403 },
  );
}

function safeFailureResponse() {
  return Response.json(
    {
      error: "Booking change request failed safely.",
      ok: false,
    },
    { status: 500 },
  );
}

function customerSafeError(rawError: string) {
  const normalized = rawError.toLowerCase();

  if (/not enabled|configuration/.test(normalized)) {
    return "Booking change request review is not enabled or configured on this server.";
  }

  if (/auth|secure|forbidden|outside/.test(normalized)) {
    return "Booking change request is not available for this customer booking.";
  }

  if (/missing|required/.test(normalized)) {
    return "Booking change request is missing required details.";
  }

  if (/malformed|invalid|review/.test(normalized)) {
    return "Booking change request details need review before submission.";
  }

  return "Booking change request could not be saved safely.";
}

function safeErrorResponse(result: { error: string; status: number }) {
  return Response.json(
    {
      error: customerSafeError(result.error),
      ok: false,
    },
    { status: result.status },
  );
}

function bookingIsReadOnly(booking: CustomerSavedBookingRecord) {
  const status = normalizeToken(booking.customer_facing_status || "");

  return status === "completed" || status === "cancelled" || status === "declined";
}

export async function GET() {
  return blockedResponse();
}

export async function PUT() {
  return blockedResponse();
}

export async function PATCH() {
  return blockedResponse();
}

export async function DELETE() {
  return blockedResponse();
}

export async function HEAD() {
  return blockedResponse();
}

export async function OPTIONS() {
  return blockedResponse();
}

export async function POST(request: Request) {
  try {
    const boundary = resolveCustomerSavedBookingsBoundaryForPurpose(
      request,
      customerBookingChangePurposeHeader,
    );

    if (!boundary.ok) {
      return safeErrorResponse(boundary);
    }

    const parsed = parseBookingChangeRequestPayload(await readJsonBody(request));

    if (!parsed.ok) {
      return safeErrorResponse(parsed);
    }

    const savedBookingResult = await loadCustomerSavedBookings(
      new URLSearchParams({
        booking_reference: parsed.data.booking_reference,
        limit: "1",
        page: "1",
      }),
      boundary.data,
    );

    if (!savedBookingResult.ok) {
      return safeErrorResponse(savedBookingResult);
    }

    const booking = savedBookingResult.data.saved_bookings[0];

    if (!booking || bookingIsReadOnly(booking)) {
      return Response.json(
        {
          error:
            "Completed or cancelled bookings are read-only here. Please contact our team if you need help.",
          ok: false,
        },
        { status: 409 },
      );
    }

    const notification = await createCustomerBookingChangeRequestAdminAppNotification({
      booking_reference: parsed.data.booking_reference,
      current_dropoff_location: booking.dropoff_location,
      current_pickup_at: booking.pickup_at,
      current_pickup_location: booking.pickup_location,
      current_service_type: booking.service_type,
      passenger_name: booking.passenger_name,
      request_kind: parsed.data.request_kind,
      request_note: parsed.data.request_note,
      requested_dropoff_location: parsed.data.requested_dropoff_location,
      requested_pickup_date: parsed.data.requested_pickup_date,
      requested_pickup_location: parsed.data.requested_pickup_location,
      requested_pickup_time: parsed.data.requested_pickup_time,
    });

    if (!notification.ok) {
      return safeErrorResponse(notification);
    }

    return Response.json({
      ok: true,
      request: {
        booking_reference: parsed.data.booking_reference,
        calendar_update: false,
        crm_update: false,
        external_send: false,
        request_kind: parsed.data.request_kind,
        review_status: "pending_admin_review",
      },
    });
  } catch {
    return safeFailureResponse();
  }
}
