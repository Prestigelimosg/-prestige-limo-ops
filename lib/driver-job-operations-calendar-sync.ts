import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { syncVerifiedDriverDetailsToAdminBookingCalendar } from "./admin-booking-google-calendar-sync";

type DriverJobOperationsCalendarClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

const operationsCalendarBookingSelect =
  "booking_reference, company_id, service_type, route_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, contact_display_name, flight_no, driver_name, driver_contact, driver_plate_number, vehicle_type_or_category, pax_count, admin_internal_status, customer_facing_status, short_notice_review_status, companies(company_name), bookers(booker_name)";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function nestedRecord(value: unknown) {
  if (Array.isArray(value)) {
    return asRecord(value[0]);
  }

  return asRecord(value);
}

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(cleanText(value, 40));

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeProviderMethod(value: unknown) {
  const method = cleanText(value, 20).toUpperCase();

  return ["GET", "POST", "PUT"].includes(method) ? method : "OTHER";
}

function safeProviderTrace(trace: string[]) {
  return trace.length > 0 ? trace.join(",") : "none";
}

function singaporeCalendarPickupAt(value: unknown) {
  const pickupAt = cleanText(value, 80);

  if (!pickupAt || !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(pickupAt)) {
    return pickupAt;
  }

  const parsed = new Date(pickupAt);

  if (Number.isNaN(parsed.getTime())) {
    return pickupAt;
  }

  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  }).formatToParts(parsed);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value || "";
  const year = part("year");
  const month = part("month");
  const day = part("day");
  const rawHour = part("hour");
  const hour = rawHour === "24" ? "00" : rawHour;
  const minute = part("minute");

  return year && month && day && hour && minute
    ? `${year}-${month}-${day}T${hour}:${minute}`
    : pickupAt;
}

function calendarStatus(booking: UnknownRecord) {
  const status =
    cleanText(booking.admin_internal_status, 80) ||
    cleanText(booking.short_notice_review_status, 80) ||
    cleanText(booking.customer_facing_status, 80) ||
    "Draft";
  const normalizedStatus = status
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (normalizedStatus === "admin review required") {
    return "Admin Review Required";
  }

  if (normalizedStatus === "needs review") {
    return "Needs Review";
  }

  if (normalizedStatus === "approved internal" || normalizedStatus === "ready for confirmation") {
    return "Ready for Confirmation";
  }

  if (normalizedStatus === "declined internal" || normalizedStatus === "declined internally") {
    return "Declined Internally";
  }

  return normalizedStatus === "draft" ? "Draft" : status;
}

function calendarPayload(booking: UnknownRecord, pickupAtOverride: string) {
  const bookingReference = cleanText(booking.booking_reference, 120);
  const pickupLocation = cleanText(booking.pickup_location);
  const dropoffLocation = cleanText(booking.dropoff_location);
  const route =
    cleanText(booking.route_summary) ||
    [pickupLocation, dropoffLocation].filter(Boolean).join(" > ");
  const company = nestedRecord(booking.companies);
  const booker = nestedRecord(booking.bookers);

  return {
    booking_reference: bookingReference,
    booking_type:
      cleanText(booking.service_type, 80) || cleanText(booking.route_type, 80),
    booker_name:
      cleanText(booker.booker_name, 160) ||
      cleanText(booking.contact_display_name, 160),
    company_name: positiveInteger(booking.company_id)
      ? cleanText(company.company_name, 160)
      : "",
    driver_contact: cleanText(booking.driver_contact, 120),
    driver_name: cleanText(booking.driver_name, 160),
    driver_plate_number: cleanText(booking.driver_plate_number, 80),
    dropoff_address: dropoffLocation,
    flight_no: cleanText(booking.flight_no, 80),
    id: bookingReference,
    pax: positiveInteger(booking.pax_count) || 1,
    pickup_address: pickupLocation,
    pickup_at:
      cleanText(pickupAtOverride, 80) ||
      singaporeCalendarPickupAt(booking.pickup_at),
    route,
    status: calendarStatus(booking),
    traveler_name: cleanText(booking.passenger_name, 160),
    vehicle: cleanText(booking.vehicle_type_or_category, 120),
  };
}

export async function syncAcknowledgedDriverDetailsToOperationsCalendar({
  bookingReference,
  client,
  pickupAt,
  syncer = syncVerifiedDriverDetailsToAdminBookingCalendar,
}: {
  bookingReference: string;
  client: DriverJobOperationsCalendarClient;
  pickupAt?: string;
  syncer?: typeof syncVerifiedDriverDetailsToAdminBookingCalendar;
}) {
  const exactBookingReference = cleanText(bookingReference, 120);

  if (
    !exactBookingReference ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(exactBookingReference)
  ) {
    return false;
  }

  const { data, error } = await client
    .from("bookings")
    .select(operationsCalendarBookingSelect)
    .eq("booking_reference", exactBookingReference)
    .maybeSingle();

  if (error || !data) {
    return false;
  }

  const booking = calendarPayload(asRecord(data), cleanText(pickupAt, 80));
  const payload = {
    bookings: [booking],
    date_label: exactBookingReference,
  };
  const providerTrace: string[] = [];
  const observedFetcher: typeof fetch = async (input, init) => {
    const response = await fetch(input, init);

    providerTrace.push(`${safeProviderMethod(init?.method)}:${response.status}`);

    return response;
  };
  const result = await syncer(payload, {
    fetcher: observedFetcher,
  });

  if (result.ok) {
    return true;
  }

  if (result.status !== 502) {
    console.warn(
      `Driver acknowledgement Operations Calendar result failed safely: sync=${result.status}; calendar_error=${JSON.stringify(result.error)}; provider_http=${safeProviderTrace(providerTrace)}.`,
    );
    return false;
  }

  const retryResult = await syncer(payload, {
    fetcher: observedFetcher,
  });

  if (!retryResult.ok) {
    console.warn(
      `Driver acknowledgement Operations Calendar result failed safely: sync=${retryResult.status}; calendar_error=${JSON.stringify(retryResult.error)}; provider_http=${safeProviderTrace(providerTrace)}.`,
    );
  }

  return retryResult.ok;
}
