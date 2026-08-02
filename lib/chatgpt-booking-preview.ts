import "server-only";

import {
  parseAdminBookingPersistencePayload,
  type AdminBookingPersistenceInput,
} from "./admin-booking-persistence";

export type ChatGptBookingPreviewValidationIssue = {
  code: string;
  field: string;
  message: string;
  severity: "error" | "warning";
};

export type ChatGptBookingSafePreview = {
  bag_count: number | null;
  contact_email: string | null;
  contact_name: string;
  contact_phone: string;
  customer_or_company_name: string;
  customer_price_preview_only: number | null;
  dropoff_location: string;
  flight_number: string | null;
  notes_preview_only: string | null;
  passenger_count: number | null;
  passenger_name: string;
  pickup_date: string;
  pickup_datetime_sgt: string;
  pickup_location: string;
  pickup_time: string;
  service_type: "MNG" | "DEP" | "TRF" | "DSP";
  source_message_received: boolean;
  vehicle_type: "E" | "S" | "AVF" | "VVV" | "Combi";
};

export type ChatGptBookingPreviewResult = {
  canonical_payload: AdminBookingPersistenceInput | null;
  missing_required_fields: string[];
  ok: boolean;
  preview: ChatGptBookingSafePreview | null;
  validation_issues: ChatGptBookingPreviewValidationIssue[];
};

type UnknownRecord = Record<string, unknown>;

const previewInputFields = new Set([
  "service_type",
  "vehicle_type",
  "vehicle_fallback",
  "pickup_date",
  "pickup_time",
  "pickup_location",
  "dropoff_location",
  "flight_number",
  "passenger_name",
  "passenger_count",
  "bag_count",
  "customer_or_company_name",
  "contact_name",
  "contact_phone",
  "contact_email",
  "customer_price",
  "notes",
  "source_message",
]);
const requiredPreviewFields = [
  "service_type",
  "vehicle_type",
  "pickup_date",
  "pickup_time",
  "pickup_location",
  "dropoff_location",
  "passenger_name",
  "contact_phone",
] as const;
const serviceTypes = new Set(["MNG", "DEP", "TRF", "DSP"]);
const vehicleAliases = new Map<string, ChatGptBookingSafePreview["vehicle_type"]>([
  ["E", "E"],
  ["E CLASS", "E"],
  ["S", "S"],
  ["S CLASS", "S"],
  ["AVF", "AVF"],
  ["ALPHARD", "AVF"],
  ["VELLFIRE", "AVF"],
  ["ALPHARD VELLFIRE", "AVF"],
  ["VVV", "VVV"],
  ["V CLASS", "VVV"],
  ["VIANO", "VVV"],
  ["VITO", "VVV"],
  ["COMBI", "Combi"],
]);
const emailPattern = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanText(value: unknown, maxLength = 1000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).trim().replace(/\s+/g, " ").slice(0, maxLength);
}

function normalizedToken(value: unknown) {
  return cleanText(value, 80).toUpperCase().replace(/[^A-Z0-9]+/g, " ").trim();
}

function validationIssue(
  field: string,
  code: string,
  message: string,
  severity: ChatGptBookingPreviewValidationIssue["severity"] = "error",
): ChatGptBookingPreviewValidationIssue {
  return {
    code,
    field,
    message,
    severity,
  };
}

function normalizeServiceType(value: unknown) {
  const token = normalizedToken(value);

  return serviceTypes.has(token)
    ? (token as ChatGptBookingSafePreview["service_type"])
    : null;
}

function normalizeVehicleType(value: unknown) {
  return vehicleAliases.get(normalizedToken(value)) || null;
}

function normalizeDate(value: unknown) {
  const cleaned = cleanText(value, 20);
  const match = cleaned.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
    ? cleaned
    : null;
}

function normalizeTime(value: unknown) {
  const cleaned = cleanText(value, 24).toLowerCase().replace(/hrs?\.?$/, "").trim();
  const compact = cleaned.replace(/[^0-9]/g, "");

  if (compact.length !== 4) {
    return null;
  }

  const hours = Number(compact.slice(0, 2));
  const minutes = Number(compact.slice(2, 4));

  return Number.isInteger(hours) && Number.isInteger(minutes) && hours <= 23 && minutes <= 59
    ? compact
    : null;
}

function normalizeInteger(value: unknown, minimum: number) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(cleanText(value, 24));

  return Number.isSafeInteger(parsed) && parsed >= minimum ? parsed : null;
}

function normalizeCustomerPrice(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(cleanText(value, 40));

  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1_000_000
    ? Number(parsed.toFixed(2))
    : null;
}

export function normalizeChatGptBookingPreview(value: unknown): ChatGptBookingPreviewResult {
  const body = asRecord(value);
  const issues: ChatGptBookingPreviewValidationIssue[] = [];
  const missingRequiredFields = requiredPreviewFields.filter((field) => !cleanText(body[field]));

  for (const field of Object.keys(body).filter((key) => !previewInputFields.has(key))) {
    issues.push(
      validationIssue(
        field,
        "unknown_field",
        `Unknown booking preview field rejected: ${field}.`,
      ),
    );
  }

  const serviceType = normalizeServiceType(body.service_type);
  const requestedVehicle = normalizeVehicleType(body.vehicle_type);
  const explicitVehicleFallback = normalizeVehicleType(body.vehicle_fallback);
  const vehicleFallbackAllowed = explicitVehicleFallback === "E" || explicitVehicleFallback === "AVF";
  const vehicleType = requestedVehicle || (vehicleFallbackAllowed ? explicitVehicleFallback : null);
  const pickupDate = normalizeDate(body.pickup_date);
  const pickupTime = normalizeTime(body.pickup_time);
  const pickupLocation = cleanText(body.pickup_location);
  const dropoffLocation = cleanText(body.dropoff_location);
  const passengerName = cleanText(body.passenger_name);
  const contactPhone = cleanText(body.contact_phone, 120);
  const contactEmail = cleanText(body.contact_email, 320).toLowerCase();
  const contactName = cleanText(body.contact_name) || passengerName;
  const customerOrCompanyName = cleanText(body.customer_or_company_name) || passengerName;
  const flightNumber = cleanText(body.flight_number, 120).toUpperCase();
  const passengerCount = normalizeInteger(body.passenger_count, 1);
  const bagCount = normalizeInteger(body.bag_count, 0);
  const customerPrice = normalizeCustomerPrice(body.customer_price);
  const notes = cleanText(body.notes);
  const sourceMessage = typeof body.source_message === "string" ? body.source_message.trim() : "";

  if (cleanText(body.service_type) && !serviceType) {
    issues.push(
      validationIssue(
        "service_type",
        "invalid_service_type",
        "service_type must be one of MNG, DEP, TRF, or DSP.",
      ),
    );
  }

  if (cleanText(body.vehicle_type) && !requestedVehicle && !vehicleFallbackAllowed) {
    issues.push(
      validationIssue(
        "vehicle_type",
        "invalid_vehicle_type",
        "vehicle_type must resolve to E, S, AVF, VVV, or Combi.",
      ),
    );
  }

  if (!requestedVehicle && vehicleFallbackAllowed) {
    issues.push(
      validationIssue(
        "vehicle_type",
        "explicit_vehicle_fallback",
        `Unrecognised vehicle replaced only by the explicitly requested ${explicitVehicleFallback} fallback.`,
        "warning",
      ),
    );
  }

  if (cleanText(body.pickup_date) && !pickupDate) {
    issues.push(
      validationIssue("pickup_date", "invalid_pickup_date", "pickup_date must be a real YYYY-MM-DD date."),
    );
  }

  if (cleanText(body.pickup_time) && !pickupTime) {
    issues.push(
      validationIssue("pickup_time", "invalid_pickup_time", "pickup_time must be a valid 24-hour time."),
    );
  }

  if (body.passenger_count !== null && body.passenger_count !== undefined && body.passenger_count !== "" && passengerCount === null) {
    issues.push(
      validationIssue(
        "passenger_count",
        "invalid_passenger_count",
        "passenger_count must be a positive whole number.",
      ),
    );
  }

  if (body.bag_count !== null && body.bag_count !== undefined && body.bag_count !== "" && bagCount === null) {
    issues.push(
      validationIssue("bag_count", "invalid_bag_count", "bag_count must be a non-negative whole number."),
    );
  }

  if (contactEmail && !emailPattern.test(contactEmail)) {
    issues.push(
      validationIssue("contact_email", "invalid_contact_email", "contact_email must be valid when provided."),
    );
  }

  if (body.customer_price !== null && body.customer_price !== undefined && body.customer_price !== "") {
    if (customerPrice === null) {
      issues.push(
        validationIssue(
          "customer_price",
          "invalid_customer_price",
          "customer_price must be a non-negative amount no greater than 1000000.",
        ),
      );
    } else {
      issues.push(
        validationIssue(
          "customer_price",
          "preview_only_customer_price",
          "customer_price is preview-only and is excluded from the canonical booking DTO.",
          "warning",
        ),
      );
    }
  }

  if (notes) {
    issues.push(
      validationIssue(
        "notes",
        "preview_only_notes",
        "notes are preview-only because the canonical booking DTO has no approved general notes field.",
        "warning",
      ),
    );
  }

  if (sourceMessage.length > 50_000) {
    issues.push(
      validationIssue(
        "source_message",
        "source_message_too_long",
        "source_message exceeds the 50000-character preview limit.",
      ),
    );
  }

  const hasErrors = missingRequiredFields.length > 0 || issues.some((issue) => issue.severity === "error");

  if (
    hasErrors ||
    !serviceType ||
    !vehicleType ||
    !pickupDate ||
    !pickupTime ||
    !pickupLocation ||
    !dropoffLocation ||
    !passengerName ||
    !contactPhone
  ) {
    return {
      canonical_payload: null,
      missing_required_fields: missingRequiredFields,
      ok: false,
      preview: null,
      validation_issues: issues,
    };
  }

  const pickupDateTimeSgt = `${pickupDate}T${pickupTime.slice(0, 2)}:${pickupTime.slice(2, 4)}:00+08:00`;
  const canonicalCandidate = {
    booking: {
      booking_reference: "PREVIEW-ONLY",
      source_channel: "chatgpt-booking-preview",
      source_surface: "chatgpt-booking-preview",
      customer_id: null,
      company_id: null,
      booker_id: null,
      traveler_id: null,
      pickup_datetime: pickupDateTimeSgt,
      dropoff_datetime: null,
      pickup_location: pickupLocation,
      dropoff_location: dropoffLocation,
      route_type: serviceType,
      service_type: serviceType,
      route_summary: `${pickupLocation} > ${dropoffLocation}`,
      customer_display_name: customerOrCompanyName,
      contact_display_name: contactName,
      contact_phone: contactPhone,
      contact_email: contactEmail || null,
      passenger_name: passengerName,
      passenger_phone: null,
      flight_no: flightNumber || null,
      driver_id: null,
      driver_contact: null,
      driver_name: null,
      driver_plate_number: null,
      pax_count: passengerCount,
      luggage_count: bagCount,
      vehicle_type_or_category: vehicleType,
      customer_facing_status: "Received",
      admin_internal_status: "Draft",
      short_notice_review_status: "Not Required",
      request_review_status: "pending_review",
      parser_source_reference: sourceMessage
        ? "ChatGPT booking preview source supplied; raw source not retained"
        : "ChatGPT booking preview",
    },
    route_points: [
      {
        point_type: "pickup",
        sequence_number: 1,
        location_text: pickupLocation,
        timing_note: null,
      },
      {
        point_type: "dropoff",
        sequence_number: 2,
        location_text: dropoffLocation,
        timing_note: null,
      },
    ],
    service_items: [],
  };
  const canonical = parseAdminBookingPersistencePayload(canonicalCandidate);

  if (!canonical.ok) {
    return {
      canonical_payload: null,
      missing_required_fields: missingRequiredFields,
      ok: false,
      preview: null,
      validation_issues: [
        ...issues,
        validationIssue(
          "canonical_booking",
          "canonical_booking_validation_failed",
          canonical.error,
        ),
      ],
    };
  }

  return {
    canonical_payload: canonical.data,
    missing_required_fields: [],
    ok: true,
    preview: {
      bag_count: bagCount,
      contact_email: contactEmail || null,
      contact_name: contactName,
      contact_phone: contactPhone,
      customer_or_company_name: customerOrCompanyName,
      customer_price_preview_only: customerPrice,
      dropoff_location: dropoffLocation,
      flight_number: flightNumber || null,
      notes_preview_only: notes || null,
      passenger_count: passengerCount,
      passenger_name: passengerName,
      pickup_date: pickupDate,
      pickup_datetime_sgt: pickupDateTimeSgt,
      pickup_location: pickupLocation,
      pickup_time: pickupTime,
      service_type: serviceType,
      source_message_received: Boolean(sourceMessage),
      vehicle_type: vehicleType,
    },
    validation_issues: issues,
  };
}
