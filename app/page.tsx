"use client";

import { useMemo, useRef, useState } from "react";
import {
  mergeParsedBookingState,
  parseBookingMessage,
} from "../lib/booking-parser";
import {
  calculateProfit,
  defaultChildSeatCustomerSurcharge,
  defaultChildSeatDriverPayout,
  defaultCustomerRates,
  defaultDriverPayoutRules,
  initialRateSettings,
  normalizeBookingType,
  normalizeChildSeatCount,
  normalizeExtraStopCount,
  numericRate,
  payoutAmountFromRule,
  resolvePricing,
  type DriverPayoutRule,
  type DriverPayoutRules,
  type RateRules,
  type RateSettings,
} from "../lib/pricing";
import { supabase } from "../lib/supabase";

type BookingForm = {
  company: string;
  bookingType: string;
  vehicle: string;
  date: string;
  time: string;
  flight: string;
  pickup: string;
  dropoff: string;
  booker: string;
  bookerContact: string;
  bookerEmail: string;
  name: string;
  pax: string;
  childSeatRequired: string;
  childSeatCount: string;
  childSeatType: string;
  extraStopCount: string;
  extraStopLocation: string;
  driverId: string;
  driverName: string;
  driverContact: string;
  customerPriceOverride: string;
  customerPriceOverrideReason: string;
  driverPayoutOverride: string;
  driverPayoutReason: string;
  driverNotes: string;
  driverIncludePayout: string;
};

type CompanyRecord = {
  id: number;
  company_name: string | null;
  domain: string | null;
  customer_rates?: RateRules | null;
  driver_payout_rules?: DriverPayoutRules | null;
  transzend_excel_privacy?: boolean | null;
};

type BookerRecord = {
  id: number;
  company_id: number;
  booker_name: string | null;
  email: string | null;
  phone: string | null;
};

type TravelerRecord = {
  id: number;
  company_id: number;
  traveler_name: string | null;
  preferred_vehicle?: string | null;
  default_address?: string | null;
  default_pickup_address?: string | null;
  default_dropoff_address?: string | null;
  booker_id?: number | null;
  booker_name?: string | null;
  booker_contact?: string | null;
  booker_email?: string | null;
  customer_rates?: RateRules | null;
  driver_payout_rules?: DriverPayoutRules | null;
};

type SavedAddressRecord = {
  id: number;
  company_id: number | null;
  traveler_id: number | null;
  label: string | null;
  address: string | null;
  address_role: string | null;
  is_default: boolean | null;
  use_count: number | null;
};

type DriverRecord = {
  id: number;
  driver_name: string | null;
  contact_number: string | null;
  vehicle_type: string | null;
  plate_number: string | null;
  payout_preferences: string | null;
  driver_payout_rules?: DriverPayoutRules | null;
  availability_status: string | null;
  notes: string | null;
  preferred_areas: string | null;
  airport_permit_notes: string | null;
};

type NameMemory = {
  company?: string;
  companyId?: number;
  travelerId?: number;
  savedAddress?: string;
  preferredVehicle?: string;
};

type BookingRecord = {
  id: string | number;
  company_id: number | null;
  booker_id: number | null;
  traveler_id: number | null;
  booking_type: string | null;
  vehicle: string | null;
  pickup_time: string | null;
  pickup_address: string | null;
  dropoff_address: string | null;
  flight_no: string | null;
  route: string | null;
  pax: number | null;
  job_card: string | null;
  status: string | null;
  driver_id?: number | null;
  driver_name: string | null;
  driver_contact?: string | null;
  driver_plate_number?: string | null;
  customer_rate?: number | null;
  customer_rate_unit?: string | null;
  customer_price_amount?: number | null;
  customer_rate_override?: number | null;
  customer_price_override_reason?: string | null;
  driver_payout_min?: number | null;
  driver_payout_max?: number | null;
  driver_payout_amount?: number | null;
  driver_payout_override?: number | null;
  driver_payout_reason?: string | null;
  driver_payout_unit?: string | null;
  driver_notes?: string | null;
  driver_dispatch_include_payout?: boolean | null;
  midnight_surcharge?: number | null;
  midnight_payout?: number | null;
  extra_stop_count?: number | null;
  extra_stop_surcharge?: number | null;
  extra_stop_payout?: number | null;
  child_seat_required?: boolean | null;
  child_seat_count?: number | null;
  child_seat_type?: string | null;
  child_seat_customer_surcharge?: number | null;
  child_seat_driver_payout?: number | null;
  pricing_source?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  companies?: {
    company_name: string | null;
    domain: string | null;
  } | null;
  bookers?: {
    booker_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  travelers?: {
    traveler_name: string | null;
  } | null;
};

type Message = {
  tone: "info" | "success" | "error";
  text: string;
};

type ParsedBooking = Partial<BookingForm> & {
  success?: boolean;
  cleanedLines?: string[];
  extractedBookingsPreview?: Array<{
    passenger?: string;
    date?: string;
    time?: string;
    type?: string;
    flight?: string;
    pickup?: string;
    dropoff?: string;
  }>;
  parserWarning?: string;
  multipleBookingsDetected?: boolean;
};
type ParsedDebugBooking = BookingForm & {
  success?: boolean;
  cleanedLines?: string[];
  extractedBookingsPreview?: Array<{
    passenger?: string;
    date?: string;
    time?: string;
    type?: string;
    flight?: string;
    pickup?: string;
    dropoff?: string;
  }>;
  parserWarning?: string;
  multipleBookingsDetected?: boolean;
};

type DriverDraft = {
  driverId: string;
  driverName: string;
  driverContact: string;
  driverPlate: string;
  payoutOverride: string;
  payoutReason: string;
  notes: string;
  includePayout: boolean;
};

type RateOverrideDraft = {
  companyName: string;
  bossName: string;
  customerRates: RateRules;
  driverPayoutRules: DriverPayoutRules;
  transzendExcelPrivacy: boolean;
};

type DriverProfileDraft = {
  driverName: string;
  contactNumber: string;
  vehicleType: string;
  plateNumber: string;
  payoutPreferences: string;
  availabilityStatus: string;
  notes: string;
  preferredAreas: string;
  airportPermitNotes: string;
  payoutRules: DriverPayoutRules;
};

const initialRateOverrideDraft: RateOverrideDraft = {
  companyName: "",
  bossName: "",
  customerRates: {},
  driverPayoutRules: {},
  transzendExcelPrivacy: false,
};

const initialDriverProfileDraft: DriverProfileDraft = {
  driverName: "",
  contactNumber: "",
  vehicleType: "",
  plateNumber: "",
  payoutPreferences: "",
  availabilityStatus: "available",
  notes: "",
  preferredAreas: "",
  airportPermitNotes: "",
  payoutRules: {},
};

const rateBookingTypes: Array<keyof Required<RateRules>> = ["MNG", "DEP", "TRF", "DSP"];

const rateLabels: Record<keyof Required<RateRules>, string> = {
  MNG: "MNG / Arrival",
  DEP: "DEP / Departure",
  TRF: "TRF / Transfer",
  DSP: "DSP / Hourly",
};

const childSeatTypeOptions = [
  "infant seat",
  "toddler seat",
  "booster seat",
  "customer did not specify",
] as const;

const requiredFields: Array<keyof BookingForm> = [
  "date",
  "time",
  "pickup",
  "dropoff",
  "booker",
];

function createInitialBooking(): BookingForm {
  return {
    company: "",
    bookingType: "MNG",
    vehicle: "AVF",
    date: "",
    time: "",
    flight: "",
    pickup: "",
    dropoff: "",
    booker: "",
    bookerContact: "",
    bookerEmail: "",
    name: "",
    pax: "1",
    childSeatRequired: "",
    childSeatCount: "",
    childSeatType: "",
    extraStopCount: "",
    extraStopLocation: "",
    driverId: "",
    driverName: "",
    driverContact: "",
    customerPriceOverride: "",
    customerPriceOverrideReason: "",
    driverPayoutOverride: "",
    driverPayoutReason: "",
    driverNotes: "",
    driverIncludePayout: "",
  };
}

const fieldLabels: Record<keyof BookingForm, string> = {
  company: "Company / Account",
  bookingType: "Booking type",
  vehicle: "Vehicle",
  date: "Pickup date",
  time: "Pickup time",
  flight: "Flight number",
  pickup: "Pickup",
  dropoff: "Drop-off",
  booker: "Booker",
  bookerContact: "Booker WhatsApp / Contact",
  bookerEmail: "Booker email (optional)",
  name: "Name",
  pax: "Pax",
  childSeatRequired: "Child seat required",
  childSeatCount: "Child seat count",
  childSeatType: "Child seat type",
  extraStopCount: "Extra stops",
  extraStopLocation: "Extra stop location",
  driverId: "Driver",
  driverName: "Driver Name",
  driverContact: "Driver Contact",
  customerPriceOverride: "Customer price override",
  customerPriceOverrideReason: "Customer override reason",
  driverPayoutOverride: "Driver payout override",
  driverPayoutReason: "Override reason",
  driverNotes: "Driver notes",
  driverIncludePayout: "Include payout in dispatch",
};

const fieldOrder: Array<keyof BookingForm> = [
  "company",
  "bookingType",
  "vehicle",
  "date",
  "time",
  "flight",
  "pickup",
  "dropoff",
  "booker",
  "bookerContact",
  "bookerEmail",
  "name",
  "pax",
  "driverName",
  "driverContact",
];

function clean(value: string | null | undefined) {
  return (value ?? "").trim();
}

function getNeedsReviewWarnings(booking: BookingForm) {
  const warnings: string[] = [];
  const bookingType = normalizeBookingType(booking.bookingType);
  const paxValue = Number(clean(booking.pax));
  const customerPriceOverride = clean(booking.customerPriceOverride);
  const customerPriceOverrideValue = Number(customerPriceOverride);

  if (!clean(booking.date)) {
    warnings.push("Missing pickup date");
  }

  if (!clean(booking.time)) {
    warnings.push("Missing pickup time");
  }

  if (!clean(booking.pickup)) {
    warnings.push("Missing pickup");
  }

  if (!clean(booking.dropoff)) {
    warnings.push("Missing drop-off");
  }

  if (!clean(booking.bookingType)) {
    warnings.push("Missing booking type");
  }

  if (!clean(booking.vehicle)) {
    warnings.push("Missing vehicle");
  }

  if (!clean(booking.pax) || !Number.isFinite(paxValue) || paxValue < 1) {
    warnings.push("Missing or invalid pax");
  }

  if (!clean(booking.name)) {
    warnings.push("Missing traveler / name");
  }

  if (bookingType === "MNG" && !clean(booking.flight)) {
    warnings.push("Missing flight for arrival");
  }

  if (normalizeExtraStopCount(booking.extraStopCount) > 0 && !clean(booking.extraStopLocation)) {
    warnings.push("Extra stop location missing");
  }

  if (
    clean(booking.childSeatRequired) === "yes" &&
    normalizeChildSeatCount(booking.childSeatRequired, booking.childSeatCount) < 1
  ) {
    warnings.push("Child seat count missing");
  }

  if (
    customerPriceOverride &&
    (!Number.isFinite(customerPriceOverrideValue) || customerPriceOverrideValue < 0)
  ) {
    warnings.push("Quoted price override is not a valid number");
  }

  return warnings;
}

function getReviewAcceptanceKey(booking: BookingForm, warnings = getNeedsReviewWarnings(booking)) {
  return JSON.stringify({
    booking,
    warnings,
  });
}

function formatPrivacySafePlace(value: string | null | undefined, fallback: string) {
  const text = clean(value);

  if (!text) {
    return fallback;
  }

  const sanitized = text
    .replace(/(?:^|[,\s])#\s*[a-z0-9]+(?:[-/][a-z0-9]+)?/gi, " ")
    .replace(/\b(?:unit|floor|level|lvl)\s*#?\s*[a-z0-9]+(?:[-/][a-z0-9]+)?/gi, " ")
    .replace(/\b(?:blk|block)\s*\d+[a-z]?\b/gi, " ")
    .replace(/\b(?:postal|singapore)\s*\d{5,6}\b/gi, " ")
    .replace(/\b\d{5,6}\b/g, " ")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/^,+\s*/, "")
    .replace(/^\d+[a-z]?(?:[-/]\d+[a-z]?)?\s+/i, "")
    .replace(/^,+\s*/, "")
    .trim();
  const firstSafeSegment = sanitized
    .split(",")
    .map((part) => clean(part))
    .find(Boolean);

  return firstSafeSegment || fallback;
}

type ItineraryDisplayStop = {
  location: string;
  time: string;
};

function formatItineraryTimeForDispatch(value: string) {
  const compactTime = clean(value).replace(/\s+/g, "").toLowerCase();
  const amPmMatch = compactTime.match(/^(\d{1,2})(?::?(\d{2}))?(am|pm)$/);

  if (amPmMatch) {
    let hour = Number(amPmMatch[1]);
    const minute = amPmMatch[2] || "00";

    if (amPmMatch[3] === "pm" && hour < 12) {
      hour += 12;
    }

    if (amPmMatch[3] === "am" && hour === 12) {
      hour = 0;
    }

    return `${String(hour).padStart(2, "0")}${minute}hrs`;
  }

  return formatPickupTime(compactTime);
}

function formatDriverItineraryLocation(value: string) {
  const sanitized = clean(value)
    .replace(/\s*,?\s*#\s*[a-z0-9]+(?:[-/][a-z0-9]+)?\s*,?\s*/gi, ", ")
    .replace(/\bSingapore\s+\d{5,6}\b/gi, "")
    .replace(/\b\d{5,6}\b/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/(?:,\s*){2,}/g, ", ")
    .replace(/\s+/g, " ")
    .replace(/,\s*$/g, "")
    .replace(/^,\s*/g, "")
    .trim();
  const parts = sanitized
    .split(",")
    .map((part) => clean(part))
    .filter((part) => part && !/^singapore$/i.test(part));

  if (parts.length <= 1) {
    return parts[0] || sanitized;
  }

  if (/^\d+[a-z]?\b/i.test(parts[0]) && /\b(?:square|hotel|office|atrium|sands)\b/i.test(parts[1])) {
    return `${parts[1]}, ${parts[0]}`;
  }

  const namedLandmark =
    parts.find((part, index) => index > 0 && part.includes("@")) ||
    parts.find((part, index) => index > 0 && /\b(?:tower|square|hotel|atrium|sands|bay)\b/i.test(part));

  if (namedLandmark) {
    return `${parts[0]}, ${namedLandmark}`;
  }

  return parts.slice(0, 2).join(", ");
}

function parseItineraryDisplayStops(value: string) {
  const rawStops = clean(value)
    .split(/\s*>\s*/g)
    .map((part) => clean(part))
    .filter(Boolean);

  if (rawStops.length < 2) {
    return [];
  }

  const stops = rawStops
    .map((rawStop): ItineraryDisplayStop => {
      const stopMatch = rawStop.match(/^(.+?)\s+(?:at|by)\s+(\d{1,2}(?::\d{2})?\s*(?:am|pm)|\d{3,4}\s*hrs?)$/i);

      if (!stopMatch?.[1] || !stopMatch[2]) {
        return {
          location: formatDriverItineraryLocation(rawStop),
          time: "",
        };
      }

      return {
        location: formatDriverItineraryLocation(stopMatch[1]),
        time: formatItineraryTimeForDispatch(stopMatch[2]),
      };
    })
    .filter((stop) => clean(stop.location));
  const timedStopCount = stops.filter((stop) => clean(stop.time)).length;

  return timedStopCount >= 2 ? stops : [];
}

function isDspMultiStopItineraryBooking(
  bookingValue: Pick<BookingForm, "bookingType" | "extraStopCount" | "extraStopLocation">,
  itineraryStops = parseItineraryDisplayStops(bookingValue.extraStopLocation),
) {
  return clean(bookingValue.bookingType).toUpperCase() === "DSP" &&
    normalizeExtraStopCount(bookingValue.extraStopCount) >= 2 &&
    itineraryStops.length >= 2;
}

function formatPrivacySafeRoute(
  bookingValue: Pick<BookingForm, "bookingType" | "pickup" | "extraStopCount" | "extraStopLocation" | "dropoff">,
) {
  const pickup = formatPrivacySafePlace(bookingValue.pickup, "Pickup");
  const dropoff = formatPrivacySafePlace(bookingValue.dropoff, "Drop-off");
  const itineraryStops = parseItineraryDisplayStops(bookingValue.extraStopLocation);

  if (isDspMultiStopItineraryBooking(bookingValue, itineraryStops)) {
    return [pickup, "Multi-stop itinerary hidden for privacy", dropoff].filter(Boolean).join(" > ");
  }

  const extraStop = clean(bookingValue.extraStopLocation)
    ? formatPrivacySafePlace(bookingValue.extraStopLocation, "Extra stop")
    : "";

  return [pickup, extraStop, dropoff].filter(Boolean).join(" > ");
}

function hasParsedValue(value: unknown) {
  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return clean(value).length > 0;
  }

  return value !== null && value !== undefined;
}

function normaliseEmail(value: string) {
  return clean(value).toLowerCase();
}

function getEmailDomain(value: string) {
  const email = normaliseEmail(value);
  const domain = email.split("@")[1];

  return domain ? domain.replace(/^www\./, "") : "";
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normaliseEmail(value));
}

function normalizePhone(value: string) {
  return clean(value).replace(/[^\d+]/g, "");
}

function isRatesSetupErrorMessage(value: string) {
  const text = clean(value).toLowerCase();

  return (
    (text.includes("schema cache") &&
      (text.includes("rate_settings") ||
        text.includes("customer_rates") ||
        text.includes("driver_payout_rules"))) ||
    text.includes("relation \"public.rate_settings\" does not exist") ||
    text.includes("relation \"rate_settings\" does not exist") ||
    text.includes("column \"customer_rates\" does not exist") ||
    text.includes("column \"driver_payout_rules\" does not exist") ||
    text.includes("column \"midnight_surcharge\" does not exist") ||
    text.includes("column \"extra_stop_surcharge\" does not exist") ||
    text.includes("column \"midnight_payout\" does not exist") ||
    text.includes("column \"extra_stop_payout\" does not exist") ||
    text.includes("column \"child_seat_customer_surcharge\" does not exist") ||
    text.includes("column \"child_seat_driver_payout\" does not exist")
  );
}

function formatRatesSetupError(value: string, fallbackPrefix: string) {
  return isRatesSetupErrorMessage(value)
    ? `${fallbackPrefix}Rates database not set up. Run Supabase migration.`
    : `${fallbackPrefix}${value}`;
}

function formatSupabaseError(error: unknown) {
  if (!error || typeof error !== "object") {
    return error instanceof Error ? error.message : "Unknown Supabase error.";
  }

  const details = error as {
    message?: string;
    details?: string;
    hint?: string;
    code?: string;
  };

  return [
    details.message,
    details.details ? `Details: ${details.details}` : "",
    details.hint ? `Hint: ${details.hint}` : "",
    details.code ? `Code: ${details.code}` : "",
  ].filter(Boolean).join(" ");
}

function compactParsedBooking(parsedBooking: ParsedBooking | null | undefined) {
  return Object.fromEntries(
    Object.entries(parsedBooking ?? {}).filter(([key, value]) =>
      key === "success" ? typeof value === "boolean" : key === "time" ? value !== undefined : hasParsedValue(value),
    ),
  ) as ParsedBooking;
}

function parseBookingMessageForState(messageText: string): ParsedBooking {
  return compactParsedBooking(parseBookingMessage(messageText));
}

function mergeParsedBookingIntoForm(
  currentBooking: BookingForm,
  parsedBooking: ParsedBooking,
): BookingForm {
  const parsedName = clean(parsedBooking.name);
  const parsedExtraStopLocation = clean(parsedBooking.extraStopLocation);
  const parsedExtraStopCount = parsedExtraStopLocation ? clean(parsedBooking.extraStopCount) || "1" : parsedBooking.extraStopCount;
  const bookingFields = Object.fromEntries(
    Object.entries(parsedBooking).filter(
      ([key]) => !["success", "cleanedLines", "extractedBookingsPreview", "parserWarning", "multipleBookingsDetected", "standbyUntil", "returnDestination"].includes(key),
    ),
  ) as Partial<BookingForm>;
  const mergedBooking = mergeParsedBookingState(currentBooking, {
    ...bookingFields,
    ...(parsedName ? { name: parsedName } : {}),
    ...(parsedExtraStopCount ? { extraStopCount: parsedExtraStopCount } : {}),
  });

  return {
    ...currentBooking,
    ...mergedBooking,
    booker:
      clean(mergedBooking.booker) ||
      clean(currentBooking.booker) ||
      (!clean(mergedBooking.company) && parsedName ? parsedName : ""),
    name: parsedName,
  };
}

function mergeCrmUpdatesIntoForm(
  currentBooking: BookingForm,
  crmUpdates: ParsedBooking,
): BookingForm {
  const currentName = clean(currentBooking.name);
  const crmName = clean(crmUpdates.name);
  const bookingFields = Object.fromEntries(
    Object.entries(crmUpdates).filter(
      ([key]) => !["success", "cleanedLines", "extractedBookingsPreview", "parserWarning", "multipleBookingsDetected", "standbyUntil", "returnDestination"].includes(key),
    ),
  ) as Partial<BookingForm>;
  const mergedBooking = mergeParsedBookingState(currentBooking, {
    ...bookingFields,
    name: currentName || crmName,
  });

  return {
    ...currentBooking,
    ...mergedBooking,
    name: currentName || crmName,
  };
}

function formatDate(value: string) {
  if (!value) {
    return "Date TBC";
  }

  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function formatMoney(value: string | number | null | undefined) {
  return numericRate(value).toFixed(2);
}

function formatCompactMoney(value: string | number | null | undefined) {
  const formattedValue = formatMoney(value);

  return formattedValue.endsWith(".00") ? formattedValue.slice(0, -3) : formattedValue;
}

function finiteNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !clean(value))
  ) {
    return null;
  }

  const parsedValue = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsedValue) ? parsedValue : null;
}

function positiveRateOrDefault(value: unknown, fallback: number) {
  const numericValue = finiteNumber(value);

  return numericValue !== null && numericValue > 0 ? numericValue : fallback;
}

function normalizeCustomerRateRules(rules: RateRules | null | undefined) {
  const source = (rules ?? {}) as Record<string, unknown>;
  const normalizedRules: RateRules = {};

  for (const bookingType of rateBookingTypes) {
    const numericValue = finiteNumber(source[bookingType]);

    if (numericValue !== null) {
      normalizedRules[bookingType] = numericValue;
    }
  }

  return normalizedRules;
}

function normalizeDriverPayoutRules(rules: DriverPayoutRules | null | undefined) {
  const source = (rules ?? {}) as Record<string, DriverPayoutRule | number | string | null | undefined>;
  const normalizedRules: DriverPayoutRules = {};

  for (const bookingType of rateBookingTypes) {
    const rule = source[bookingType];

    if (rule === null || rule === undefined) {
      continue;
    }

    if (typeof rule !== "object") {
      const amount = finiteNumber(rule);

      if (amount !== null) {
        normalizedRules[bookingType] =
          bookingType === "DSP" ? { amount, perHour: true } : { min: amount, max: amount };
      }

      continue;
    }

    const amount = finiteNumber(rule.amount);
    const min = finiteNumber(rule.min);
    const max = finiteNumber(rule.max);
    const normalizedRule: DriverPayoutRule = {};

    if (amount !== null) {
      normalizedRule.amount = amount;
    }

    if (min !== null) {
      normalizedRule.min = min;
    }

    if (max !== null) {
      normalizedRule.max = max;
    }

    if (rule.perHour !== undefined) {
      normalizedRule.perHour = Boolean(rule.perHour);
    }

    if (Object.keys(normalizedRule).length > 0) {
      normalizedRules[bookingType] = normalizedRule;
    }
  }

  return normalizedRules;
}

function formatOverrideSummary(
  customerRates: RateRules | null | undefined,
  driverPayoutRules: DriverPayoutRules | null | undefined,
) {
  const normalizedCustomerRates = normalizeCustomerRateRules(customerRates);
  const normalizedDriverPayoutRules = normalizeDriverPayoutRules(driverPayoutRules);
  const customerLabels = rateBookingTypes
    .filter((bookingType) => normalizedCustomerRates[bookingType] !== undefined)
    .map((bookingType) => `${bookingType} ${formatMoney(normalizedCustomerRates[bookingType])}`);
  const driverLabels = rateBookingTypes
    .filter((bookingType) => normalizedDriverPayoutRules[bookingType] !== undefined)
    .map((bookingType) => {
      const payoutRule = normalizedDriverPayoutRules[bookingType]!;

      return `${bookingType} ${formatMoney(payoutAmountFromRule(payoutRule))}`;
    });

  return {
    customerText: customerLabels.length > 0 ? `Customer: ${customerLabels.join(", ")}` : "Customer: None",
    driverText: driverLabels.length > 0 ? `Driver: ${driverLabels.join(", ")}` : "Driver: None",
    hasOverrides: customerLabels.length > 0 || driverLabels.length > 0,
  };
}

function hasRateOverrideValues(record: Pick<CompanyRecord, "customer_rates" | "driver_payout_rules">) {
  return formatOverrideSummary(record.customer_rates, record.driver_payout_rules).hasOverrides;
}

function statusClass(tone: Message["tone"]) {
  if (tone === "success") {
    return "border-emerald-200 bg-emerald-50 text-emerald-800";
  }

  if (tone === "error") {
    return "border-red-200 bg-red-50 text-red-800";
  }

  return "border-slate-200 bg-slate-50 text-slate-700";
}

function bookingStatusClass(status: string | null) {
  const normalizedStatus = clean(status).toLowerCase();

  if (normalizedStatus === "confirmed") {
    return "bg-emerald-50 text-emerald-700 ring-emerald-200";
  }

  if (normalizedStatus === "assigned") {
    return "bg-sky-50 text-sky-700 ring-sky-200";
  }

  if (normalizedStatus === "completed") {
    return "bg-slate-100 text-slate-700 ring-slate-300";
  }

  if (normalizedStatus === "cancelled") {
    return "bg-red-50 text-red-700 ring-red-200";
  }

  return "bg-orange-50 text-orange-700 ring-orange-200";
}

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseJobCardDate(jobCard: string | null) {
  if (!jobCard) {
    return null;
  }

  const match = jobCard.match(/(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/);
  if (!match) {
    return null;
  }

  const parsedDate = new Date(match[1]);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function normaliseTimeForSort(value: string | null) {
  const digits = clean(value).replace(/\D/g, "");

  if (digits.length >= 4) {
    return Number(digits.slice(0, 2)) * 60 + Number(digits.slice(2, 4));
  }

  if (digits.length > 0) {
    return Number(digits) * 60;
  }

  return 0;
}

function formatPickupTime(value: string | null | undefined) {
  const digits = clean(value).replace(/\D/g, "");

  if (digits.length >= 4) {
    return `${digits.slice(0, 2)}${digits.slice(2, 4)}hrs`;
  }

  if (digits.length > 0) {
    return `${digits.padStart(2, "0")}00hrs`;
  }

  return "Time TBC";
}

function normalizePickupTimeForStorage(value: string | null | undefined) {
  return formatPickupTime(value).replace("hrs", "").replace("Time TBC", "");
}

function getKnownCompanyForRelationship(bookerName: string, personName: string, companyName: string) {
  const key = [bookerName, personName, companyName].map((value) => clean(value).toLowerCase()).join(" ");

  if (/\bjune\s+aw\b|\btiger\s+global\b|\bmr\s+deep\b|\bmr\s+stanley\b/.test(key)) {
    return "Tiger Global";
  }

  if (/\bnicole\s+yap\b|\bmr\s+rohan\s+singh\b|\bbny\b/.test(key)) {
    return "BNY";
  }

  if (/\bsharron\b|\bshiseido\b/.test(key)) {
    return "Shiseido";
  }

  if (/\bpolly\s+wong\b|\bapollo\b/.test(key)) {
    return "Apollo";
  }

  return "";
}

function blankCompanyRecord(companyName: string, customerRates: RateRules = {}, driverPayoutRules: DriverPayoutRules = {}): CompanyRecord {
  return {
    id: 0,
    company_name: companyName || "Draft",
    domain: null,
    customer_rates: customerRates,
    driver_payout_rules: driverPayoutRules,
  };
}

function calculateSavedDriverPayout(
  bookingRecord: BookingRecord,
  selectedDriver: DriverRecord | undefined,
  settings: RateSettings,
  manualPayoutOverride = "",
) {
  const manualPayout = clean(manualPayoutOverride) ? numericRate(manualPayoutOverride) : null;

  if (manualPayout !== null) {
    return manualPayout;
  }

  const bookingType = normalizeBookingType(bookingRecord.booking_type);
  const midnightPayout = numericRate(bookingRecord.midnight_payout);
  const extraStopCount = normalizeExtraStopCount(bookingRecord.extra_stop_count);
  const extraStopPayout =
    bookingType === "DSP" ? 0 : numericRate(bookingRecord.extra_stop_payout ?? settings.extraStopPayout);
  const extraStopDriverAmount =
    extraStopCount * extraStopPayout;
  const childSeatDriverAmount = numericRate(bookingRecord.child_seat_driver_payout);
  const storedBasePayout =
    numericRate(bookingRecord.driver_payout_max) ||
    Math.max(
      0,
      numericRate(bookingRecord.driver_payout_amount) -
        midnightPayout -
        extraStopDriverAmount -
        childSeatDriverAmount,
    );
  const selectedDriverBasePayout = selectedDriver?.driver_payout_rules?.[bookingType]
    ? payoutAmountFromRule(selectedDriver.driver_payout_rules[bookingType]!)
    : 0;
  const basePayout = selectedDriverBasePayout || storedBasePayout;

  return basePayout + midnightPayout + extraStopDriverAmount + childSeatDriverAmount;
}

function formatChildSeatNote(countValue: string | number | null | undefined, typeValue: string | null | undefined) {
  const count = normalizeChildSeatCount(true, countValue);
  const seatType = clean(typeValue);

  if (count <= 0) {
    return "";
  }

  if (seatType) {
    return `Child seat: ${count} x ${seatType}`;
  }

  return `Child seat: ${count}`;
}

function formatPickupDateTime(dateValue: string, timeValue: string | null | undefined) {
  return `${formatDate(dateValue)}, ${formatPickupTime(timeValue)}`;
}

function getBookingDate(bookingRecord: BookingRecord) {
  const jobCardDate = parseJobCardDate(bookingRecord.job_card);

  if (jobCardDate) {
    return jobCardDate;
  }

  if (bookingRecord.created_at) {
    const createdAt = new Date(bookingRecord.created_at);

    if (!Number.isNaN(createdAt.getTime())) {
      return createdAt;
    }
  }

  return new Date(0);
}

function getBookingDateKey(bookingRecord: BookingRecord) {
  return toDateKey(getBookingDate(bookingRecord));
}

function getBookingSortValue(bookingRecord: BookingRecord) {
  const parsedCreatedAt = bookingRecord.created_at ? new Date(bookingRecord.created_at).getTime() : Number.NaN;

  if (Number.isFinite(parsedCreatedAt)) {
    return parsedCreatedAt;
  }

  const parsedUpdatedAt = bookingRecord.updated_at ? new Date(bookingRecord.updated_at).getTime() : Number.NaN;

  if (Number.isFinite(parsedUpdatedAt)) {
    return parsedUpdatedAt;
  }

  return Number(bookingRecord.id) || 0;
}

function sortBookingsNewestFirst(bookingRecords: BookingRecord[]) {
  return [...bookingRecords].sort(
    (firstBooking, secondBooking) => getBookingSortValue(secondBooking) - getBookingSortValue(firstBooking),
  );
}

function getBookingCompany(bookingRecord: BookingRecord) {
  return bookingRecord.companies?.company_name || "Unlinked company";
}

function getJobCardName(jobCard: string | null) {
  const match = clean(jobCard).match(/^\s*(?:name|passenger)\s*:\s*(.+)$/im);

  return clean(match?.[1]);
}

function getBookingName(bookingRecord: BookingRecord) {
  return clean(bookingRecord.travelers?.traveler_name) || getJobCardName(bookingRecord.job_card);
}

function getBookerName(bookingRecord: BookingRecord) {
  const jobCardBooker = clean(bookingRecord.job_card).match(/^\s*booker\s*:\s*(.+)$/im);

  return clean(bookingRecord.bookers?.booker_name) || clean(jobCardBooker?.[1]);
}

function formatCreatedAt(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return clean(value);
  }

  return new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function getRoutePoints(bookingRecord: BookingRecord) {
  const routePoints = clean(bookingRecord.route)
    .split(/\s*>\s*/)
    .map((point) => clean(point))
    .filter(Boolean);

  if (routePoints.length >= 2) {
    return routePoints;
  }

  return [
    clean(bookingRecord.pickup_address),
    clean(bookingRecord.dropoff_address),
  ].filter(Boolean);
}

function bookingRecordToForm(bookingRecord: BookingRecord): BookingForm {
  const routePoints = getRoutePoints(bookingRecord);
  const pickup = clean(bookingRecord.pickup_address) || routePoints[0] || "";
  const dropoff = clean(bookingRecord.dropoff_address) || routePoints[routePoints.length - 1] || "";
  const extraStopLocations = routePoints.slice(1, -1);
  const extraStopCount = normalizeExtraStopCount(bookingRecord.extra_stop_count) || extraStopLocations.length;
  const childSeatRequired = Boolean(bookingRecord.child_seat_required);

  return {
    ...createInitialBooking(),
    company: clean(bookingRecord.companies?.company_name),
    bookingType: clean(bookingRecord.booking_type) || "MNG",
    vehicle: clean(bookingRecord.vehicle) || "AVF",
    date: getBookingDateKey(bookingRecord),
    time: formatPickupTime(bookingRecord.pickup_time),
    flight: clean(bookingRecord.flight_no),
    pickup,
    extraStopLocation: extraStopLocations.join(" > "),
    dropoff,
    booker: getBookerName(bookingRecord),
    bookerContact: clean(bookingRecord.bookers?.phone),
    bookerEmail: clean(bookingRecord.bookers?.email),
    name: getBookingName(bookingRecord),
    pax: String(bookingRecord.pax || 1),
    driverId: bookingRecord.driver_id ? String(bookingRecord.driver_id) : "",
    driverName: clean(bookingRecord.driver_name),
    driverContact: clean(bookingRecord.driver_contact),
    childSeatRequired: childSeatRequired ? "yes" : "",
    childSeatCount: childSeatRequired ? String(normalizeChildSeatCount(true, bookingRecord.child_seat_count)) : "",
    childSeatType: childSeatRequired ? clean(bookingRecord.child_seat_type) : "",
    extraStopCount: extraStopCount ? String(extraStopCount) : "",
    customerPriceOverride:
      bookingRecord.customer_rate_override === null || bookingRecord.customer_rate_override === undefined
        ? ""
        : String(bookingRecord.customer_rate_override),
    customerPriceOverrideReason: clean(bookingRecord.customer_price_override_reason),
    driverPayoutOverride:
      bookingRecord.driver_payout_override === null || bookingRecord.driver_payout_override === undefined
        ? ""
        : String(bookingRecord.driver_payout_override),
    driverPayoutReason: clean(bookingRecord.driver_payout_reason),
    driverNotes: clean(bookingRecord.driver_notes),
    driverIncludePayout: bookingRecord.driver_dispatch_include_payout ? "yes" : "",
  };
}

function stripBookerFromJobCard(jobCard: string) {
  return jobCard
    .split("\n")
    .filter((line) => !/^\s*booker\s*:/i.test(line))
    .join("\n")
    .trim();
}

function getBookingJobCard(bookingRecord: BookingRecord) {
  if (bookingRecord.job_card) {
    return stripBookerFromJobCard(bookingRecord.job_card);
  }

  const childSeatLine = bookingRecord.child_seat_required
    ? formatChildSeatNote(bookingRecord.child_seat_count, bookingRecord.child_seat_type)
    : "";

  return [
    `${bookingRecord.vehicle || "Vehicle"} ${bookingRecord.booking_type || "Booking"}`,
    formatPickupDateTime(getBookingDateKey(bookingRecord), bookingRecord.pickup_time),
    "",
    bookingRecord.flight_no
      ? `Flight: ${bookingRecord.flight_no}\n${bookingRecord.route || "Route TBC"}`
      : bookingRecord.route || "Route TBC",
    "",
    getBookingName(bookingRecord) ? `Name: ${getBookingName(bookingRecord)}` : "",
    `Pax: ${bookingRecord.pax || 1}`,
    childSeatLine,
  ]
    .filter(Boolean)
    .join("\n");
}

function getDriverDispatchCard(bookingRecord: BookingRecord, driverDraft: DriverDraft) {
  const driverName = clean(driverDraft.driverName) || clean(bookingRecord.driver_name) || "Driver TBC";
  const driverContact = clean(driverDraft.driverContact) || clean(bookingRecord.driver_contact);
  const payoutAmount =
    numericRate(driverDraft.payoutOverride) ||
    numericRate(bookingRecord.driver_payout_override) ||
    numericRate(bookingRecord.driver_payout_amount) ||
    numericRate(bookingRecord.driver_payout_max);
  const includePayout = driverDraft.includePayout || Boolean(bookingRecord.driver_dispatch_include_payout);
  const childSeatLine = bookingRecord.child_seat_required
    ? formatChildSeatNote(bookingRecord.child_seat_count, bookingRecord.child_seat_type)
    : "";

  return [
    "DRIVER DISPATCH",
    "",
    `Driver: ${driverName}`,
    driverContact ? `Contact: ${driverContact}` : "",
    "",
    `${bookingRecord.vehicle || "Vehicle"} ${bookingRecord.booking_type || "Booking"}`,
    formatPickupDateTime(getBookingDateKey(bookingRecord), bookingRecord.pickup_time),
    "",
    bookingRecord.flight_no ? `Flight: ${bookingRecord.flight_no}` : "",
    bookingRecord.route ||
      `${bookingRecord.pickup_address || "Pickup"} > ${bookingRecord.dropoff_address || "Drop-off"}`,
    "",
    getBookingName(bookingRecord) ? `Passenger: ${getBookingName(bookingRecord)}` : "",
    `Pax: ${bookingRecord.pax || 1}`,
    childSeatLine,
    includePayout && payoutAmount ? `Payout: $${payoutAmount}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export default function Home() {
  const [booking, setBooking] = useState<BookingForm>(() => createInitialBooking());
  const [bookingMessage, setBookingMessage] = useState("");
  const [bookingMessageResetKey, setBookingMessageResetKey] = useState(0);
  const [parsedDebugBooking, setParsedDebugBooking] = useState<ParsedDebugBooking | null>(null);
  const [showParserDebug, setShowParserDebug] = useState(false);
  const [multiBookingNotice, setMultiBookingNotice] = useState<ParsedBooking | null>(null);
  const bookingMessageRef = useRef<HTMLTextAreaElement | null>(null);
  const [bookings, setBookings] = useState<BookingRecord[]>([]);
  const [drivers, setDrivers] = useState<DriverRecord[]>([]);
  const [driverDrafts, setDriverDrafts] = useState<Record<string, DriverDraft>>({});
  const [driverProfileDraft, setDriverProfileDraft] =
    useState<DriverProfileDraft>(initialDriverProfileDraft);
  const [assigningBookingId, setAssigningBookingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rateSettings, setRateSettings] = useState<RateSettings>(initialRateSettings);
  const [rateOverrideDraft, setRateOverrideDraft] =
    useState<RateOverrideDraft>(initialRateOverrideDraft);
  const [rateCompanies, setRateCompanies] = useState<CompanyRecord[]>([]);
  const [rateTravelers, setRateTravelers] = useState<TravelerRecord[]>([]);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [savingRates, setSavingRates] = useState(false);
  const [bookingSaveMessage, setBookingSaveMessage] = useState<Message | null>(null);
  const [acceptedReviewWarningKey, setAcceptedReviewWarningKey] = useState("");
  const [message, setMessage] = useState<Message>({
    tone: "info",
    text: "Ready for dispatch.",
  });

  const route = useMemo(() => {
    const pickup = clean(booking.pickup);
    const dropoff = clean(booking.dropoff);
    const extraStopLocation = clean(booking.extraStopLocation);

    if (!pickup && !dropoff && !extraStopLocation) {
      return "Pickup > Drop-off";
    }

    return [
      pickup || "Pickup",
      extraStopLocation,
      dropoff || "Drop-off",
    ].filter(Boolean).join(" > ");
  }, [booking.dropoff, booking.extraStopLocation, booking.pickup]);

  const itineraryDisplayStops = useMemo(
    () => parseItineraryDisplayStops(booking.extraStopLocation),
    [booking.extraStopLocation],
  );
  const isDspItinerary = isDspMultiStopItineraryBooking(booking, itineraryDisplayStops);

  const jobCard = useMemo(() => {
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}\n` : "";
    const companyLine = clean(booking.company) ? `Company: ${clean(booking.company)}\n` : "";
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";

    return [
      `${clean(booking.vehicle) || "Vehicle"} ${clean(booking.bookingType) || "Booking"}`,
      formatPickupDateTime(booking.date, booking.time),
      "",
      `${flightLine}${route}`,
      "",
      companyLine.trimEnd(),
      clean(booking.name) ? `Name: ${clean(booking.name)}` : "",
      `Pax: ${Number(clean(booking.pax)) || 1}`,
      childSeatLine,
    ]
      .filter(Boolean)
      .join("\n");
  }, [booking, route]);

  const jobCardPreview = useMemo(() => {
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}\n` : "";
    const companyLine = clean(booking.company) ? `Company: ${clean(booking.company)}\n` : "";
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";

    return [
      `${clean(booking.vehicle) || "Vehicle"} ${clean(booking.bookingType) || "Booking"}`,
      formatPickupDateTime(booking.date, booking.time),
      "",
      `${flightLine}${formatPrivacySafeRoute(booking)}`,
      "",
      companyLine.trimEnd(),
      "Guest details hidden for privacy",
      `Pax: ${Number(clean(booking.pax)) || 1}`,
      childSeatLine,
    ]
      .filter(Boolean)
      .join("\n");
  }, [booking]);

  const draftPricing = useMemo(() => {
    const matchingCompany = rateCompanies.find(
      (company) => clean(company.company_name).toLowerCase() === clean(booking.company).toLowerCase(),
    );
    const matchingTraveler = rateTravelers.find(
      (traveler) => clean(traveler.traveler_name).toLowerCase() === clean(booking.name).toLowerCase(),
    );
    const bookingDriverId = clean(booking.driverId);
    const bookingDriverName = clean(booking.driverName).toLowerCase();
    const matchingDriver = drivers.find(
      (driver) =>
        (bookingDriverId && String(driver.id) === bookingDriverId) ||
        (bookingDriverName && clean(driver.driver_name).toLowerCase() === bookingDriverName),
    );
    const pricing = resolvePricing(
      booking,
      matchingCompany ?? blankCompanyRecord(clean(booking.company)),
      matchingTraveler ?? null,
      rateSettings,
      matchingDriver ?? null,
    );

    return {
      ...pricing,
      ...calculateProfit(pricing, booking.customerPriceOverride, booking.driverPayoutOverride),
    };
  }, [booking, drivers, rateCompanies, rateSettings, rateTravelers]);

  const visibleChildSeatTypeOptions = useMemo(() => {
    const currentChildSeatType = clean(booking.childSeatType);

    if (
      currentChildSeatType &&
      !childSeatTypeOptions.includes(currentChildSeatType as (typeof childSeatTypeOptions)[number])
    ) {
      return [currentChildSeatType, ...childSeatTypeOptions];
    }

    return [...childSeatTypeOptions];
  }, [booking.childSeatType]);

  const needsReviewWarnings = useMemo(() => getNeedsReviewWarnings(booking), [booking]);
  const needsReviewAcceptanceKey = useMemo(
    () => getReviewAcceptanceKey(booking, needsReviewWarnings),
    [booking, needsReviewWarnings],
  );
  const hasNeedsReviewWarnings = needsReviewWarnings.length > 0;
  const reviewWarningsAccepted = hasNeedsReviewWarnings && acceptedReviewWarningKey === needsReviewAcceptanceKey;

  const companyOverrideRecords = useMemo(
    () => rateCompanies.filter((companyRecord) => hasRateOverrideValues(companyRecord)),
    [rateCompanies],
  );
  const bossOverrideRecords = useMemo(
    () => rateTravelers.filter((travelerRecord) => hasRateOverrideValues(travelerRecord)),
    [rateTravelers],
  );

  const assignedDriverId = clean(booking.driverId);
  const assignedDriverName = clean(booking.driverName).toLowerCase();
  const assignedDriverRecord = drivers.find(
    (driver) =>
      (assignedDriverId && String(driver.id) === assignedDriverId) ||
      (assignedDriverName && clean(driver.driver_name).toLowerCase() === assignedDriverName),
  );
  const assignedDriverSelectValue = assignedDriverId || (assignedDriverRecord ? String(assignedDriverRecord.id) : "");
  const showSavedAssignedDriverOption = Boolean(assignedDriverId && !assignedDriverRecord);

  const draftDriverDispatchCard = useMemo(() => {
    const bookingDriverId = clean(booking.driverId);
    const bookingDriverName = clean(booking.driverName).toLowerCase();
    const selectedDriver = drivers.find(
      (driver) =>
        (bookingDriverId && String(driver.id) === bookingDriverId) ||
        (bookingDriverName && clean(driver.driver_name).toLowerCase() === bookingDriverName),
    );
    const driverPayout = draftPricing.driverPayout;
    const childSeatLine =
      clean(booking.childSeatRequired) === "yes"
        ? formatChildSeatNote(booking.childSeatCount, booking.childSeatType)
        : "";
    const flightLine = clean(booking.flight) ? `Flight: ${clean(booking.flight)}` : "";
    const routeLines = isDspItinerary
      ? [
          flightLine,
          `Pickup: ${clean(booking.pickup) || "Pickup"}`,
          "",
          "Itinerary:",
          ...itineraryDisplayStops.map((stop) => `${stop.time || "Time TBC"} - ${stop.location}`),
        ]
      : [
          flightLine,
          route,
        ];
    const sections = [
      ["DRIVER DISPATCH"],
      [
        `Driver: ${clean(booking.driverName) || "Driver TBC"}`,
        clean(booking.driverContact) ? `Contact: ${clean(booking.driverContact)}` : "",
        clean(selectedDriver?.plate_number) ? `Plate: ${clean(selectedDriver?.plate_number)}` : "",
      ],
      [
        `${clean(booking.vehicle) || "Vehicle"} ${clean(booking.bookingType) || "Booking"}`,
        formatPickupDateTime(booking.date, booking.time),
      ],
      routeLines,
      [
        clean(booking.name) ? `Passenger: ${clean(booking.name)}` : "",
        `Pax: ${Number(clean(booking.pax)) || 1}`,
        childSeatLine,
        booking.driverIncludePayout && driverPayout ? `Payout: $${driverPayout}` : "",
      ],
    ];

    return sections
      .filter((section) => section.some((line) => clean(line)))
      .map((section) => section.join("\n").trim())
      .join("\n\n");
  }, [booking, draftPricing.driverPayout, drivers, isDspItinerary, itineraryDisplayStops, route]);

  const dashboardBookings = useMemo(() => {
    const query = clean(searchTerm).toLowerCase();

    return bookings
      .filter((bookingRecord) => {
        if (!query) {
          return true;
        }

        const searchableText = [
          getBookingName(bookingRecord),
          getBookingCompany(bookingRecord),
          bookingRecord.flight_no,
          bookingRecord.route,
          bookingRecord.driver_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return searchableText.includes(query);
      })
      .sort((firstBooking, secondBooking) => {
        const firstDate = getBookingDateKey(firstBooking);
        const secondDate = getBookingDateKey(secondBooking);

        if (firstDate !== secondDate) {
          return firstDate.localeCompare(secondDate);
        }

        return (
          normaliseTimeForSort(firstBooking.pickup_time) -
          normaliseTimeForSort(secondBooking.pickup_time)
        );
      });
  }, [bookings, searchTerm]);

  const multiBookingPreviewItems = Array.isArray(multiBookingNotice?.extractedBookingsPreview)
    ? multiBookingNotice.extractedBookingsPreview.filter(Boolean)
    : [];
  const parsedDebugPreviewItems = Array.isArray(parsedDebugBooking?.extractedBookingsPreview)
    ? parsedDebugBooking.extractedBookingsPreview.filter(Boolean)
    : [];
  const shouldShowParserDebugPanel = Boolean(
    parsedDebugBooking &&
      (showParserDebug ||
        parsedDebugBooking.parserWarning ||
        parsedDebugPreviewItems.length > 0 ||
        parsedDebugBooking.multipleBookingsDetected),
  );

  const todayKey = toDateKey(new Date());
  const todayBookings = dashboardBookings.filter(
    (bookingRecord) => getBookingDateKey(bookingRecord) === todayKey,
  );
  const upcomingBookings = dashboardBookings.filter(
    (bookingRecord) => getBookingDateKey(bookingRecord) > todayKey,
  );
  const otherBookings = dashboardBookings.filter(
    (bookingRecord) => getBookingDateKey(bookingRecord) < todayKey,
  );

  function update(field: keyof BookingForm, value: string) {
    setBooking((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function clearParseArtifacts() {
    setParsedDebugBooking(null);
    setShowParserDebug(false);
    setMultiBookingNotice(null);
    setMessage({
      tone: "info",
      text: "Ready for dispatch.",
    });
  }

  function clearBookingMessageInput() {
    clearParseArtifacts();
    setBookingMessage("");
    setBookingMessageResetKey((current) => current + 1);

    if (bookingMessageRef.current) {
      bookingMessageRef.current.value = "";
    }
  }

  function applyExtractedBooking(preview: NonNullable<ParsedBooking["extractedBookingsPreview"]>[number]) {
    const safePreview = preview ?? {};

    setBooking((current) => ({
      ...current,
      name: clean(safePreview.passenger),
      bookingType: clean(safePreview.type) || current.bookingType,
      date: clean(safePreview.date),
      time: clean(safePreview.time),
      flight: clean(safePreview.flight),
      pickup: clean(safePreview.pickup),
      dropoff: clean(safePreview.dropoff),
    }));
    setMessage({
      tone: "success",
      text: "Selected extracted booking. Review before saving.",
    });
    setMultiBookingNotice(null);
  }

  function updateDefaultCustomerRate(bookingType: keyof Required<RateRules>, value: string) {
    setRateSettings((current) => ({
      ...current,
      customerRates: {
        ...current.customerRates,
        [bookingType]: numericRate(value),
      },
    }));
  }

  function updateDefaultDriverPayout(bookingType: keyof Required<RateRules>, value: string) {
    setRateSettings((current) => ({
      ...current,
      driverPayoutRules: {
        ...current.driverPayoutRules,
        [bookingType]:
          bookingType === "DSP"
            ? { amount: numericRate(value), perHour: true }
            : { min: numericRate(value), max: numericRate(value) },
      },
    }));
  }

  function updateCompanyOverrideRate(bookingType: keyof Required<RateRules>, value: string) {
    setRateOverrideDraft((current) => ({
      ...current,
      customerRates: clean(value)
        ? {
            ...current.customerRates,
            [bookingType]: numericRate(value),
          }
        : Object.fromEntries(
            Object.entries(current.customerRates).filter(([key]) => key !== bookingType),
          ) as RateRules,
    }));
  }

  function updateCompanyOverridePayout(bookingType: keyof Required<RateRules>, value: string) {
    setRateOverrideDraft((current) => ({
      ...current,
      driverPayoutRules: clean(value)
        ? {
            ...current.driverPayoutRules,
            [bookingType]:
              bookingType === "DSP"
                ? { amount: numericRate(value), perHour: true }
                : { min: numericRate(value), max: numericRate(value) },
          }
        : Object.fromEntries(
            Object.entries(current.driverPayoutRules).filter(([key]) => key !== bookingType),
          ) as DriverPayoutRules,
    }));
  }

  function getDriverDraft(bookingRecord: BookingRecord) {
    return (
      driverDrafts[String(bookingRecord.id)] ?? {
        driverId: clean(bookingRecord.driver_id ? String(bookingRecord.driver_id) : ""),
        driverName: clean(bookingRecord.driver_name),
        driverContact: clean(bookingRecord.driver_contact),
        driverPlate: clean(bookingRecord.driver_plate_number),
        payoutOverride: clean(bookingRecord.driver_payout_override ? String(bookingRecord.driver_payout_override) : ""),
        payoutReason: clean(bookingRecord.driver_payout_reason),
        notes: clean(bookingRecord.driver_notes),
        includePayout: Boolean(bookingRecord.driver_dispatch_include_payout),
      }
    );
  }

  function applyDriverToBooking(driverId: string) {
    if (!driverId) {
      setBooking((current) => ({
        ...current,
        driverId: "",
        driverName: "",
        driverContact: "",
        driverNotes: "",
      }));
      return;
    }

    const selectedDriver = drivers.find((driver) => String(driver.id) === driverId);

    if (!selectedDriver) {
      setBooking((current) => ({
        ...current,
        driverId,
      }));
      return;
    }

    setBooking((current) => ({
      ...current,
      driverId,
      driverName: clean(selectedDriver.driver_name),
      driverContact: clean(selectedDriver.contact_number),
      driverNotes: clean(selectedDriver.notes),
    }));
  }

  function updateDriverProfilePayout(bookingType: keyof Required<RateRules>, value: string) {
    setDriverProfileDraft((current) => ({
      ...current,
      payoutRules: {
        ...current.payoutRules,
        [bookingType]:
          bookingType === "DSP"
            ? { amount: numericRate(value), perHour: true }
            : { min: numericRate(value), max: numericRate(value) },
      },
    }));
  }

  function updateDriverDraft(
    bookingRecord: BookingRecord,
    field: keyof DriverDraft,
    value: string | boolean,
  ) {
    const bookingId = String(bookingRecord.id);
    const selectedDriver =
      field === "driverId" ? drivers.find((driver) => String(driver.id) === value) : null;

    setDriverDrafts((current) => ({
      ...current,
      [bookingId]: {
        ...getDriverDraft(bookingRecord),
        [field]: value,
        ...(selectedDriver
          ? {
              driverName: clean(selectedDriver.driver_name),
              driverContact: clean(selectedDriver.contact_number),
              driverPlate: clean(selectedDriver.plate_number),
              notes: clean(selectedDriver.notes),
            }
          : {}),
      },
    }));
  }

  function validateBooking() {
    if (clean(booking.bookerEmail) && !isValidEmail(booking.bookerEmail)) {
      setMessage({
        tone: "error",
        text: "Booker email must be valid when provided.",
      });
      return false;
    }

    return true;
  }

  function isAirportAddress(value: string) {
    return /\b(?:changi|airport|terminal|t[1-4])\b/i.test(value);
  }

  function getReusableNameAddress() {
    const pickup = clean(booking.pickup);
    const dropoff = clean(booking.dropoff);

    if (pickup && isAirportAddress(pickup) && dropoff && !isAirportAddress(dropoff)) {
      return dropoff;
    }

    if (dropoff && isAirportAddress(dropoff) && pickup && !isAirportAddress(pickup)) {
      return pickup;
    }

    return dropoff || pickup;
  }

  function applyNameMemory(parsedBooking: ParsedBooking, nameMemory: NameMemory) {
    const enrichedBooking = { ...parsedBooking };
    const bookingType = clean(enrichedBooking.bookingType || booking.bookingType).toUpperCase();

    if (!clean(enrichedBooking.company) && nameMemory.company) {
      enrichedBooking.company = nameMemory.company;
    }

    if (!clean(enrichedBooking.vehicle) && nameMemory.preferredVehicle) {
      enrichedBooking.vehicle = nameMemory.preferredVehicle;
    }

    if (nameMemory.savedAddress) {
      if (bookingType === "DEP" && !clean(enrichedBooking.pickup)) {
        enrichedBooking.pickup = nameMemory.savedAddress;
      } else if (!clean(enrichedBooking.dropoff)) {
        enrichedBooking.dropoff = nameMemory.savedAddress;
      }
    }

    return enrichedBooking;
  }

  async function lookupNameMemory(personName: string): Promise<NameMemory | null> {
    if (!supabase || !personName) {
      return null;
    }

    const nameResult = await supabase
      .from("travelers")
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .ilike("traveler_name", personName)
      .limit(1)
      .maybeSingle();

    if (nameResult.error || !nameResult.data) {
      return null;
    }

    const nameRecord = nameResult.data as TravelerRecord;
    const [companyResult, addressResult] = await Promise.all([
      supabase
        .from("companies")
      .select("id, company_name")
        .eq("id", nameRecord.company_id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from("saved_addresses")
        .select("id, company_id, traveler_id, label, address, address_role, is_default, use_count")
        .eq("traveler_id", nameRecord.id)
        .order("is_default", { ascending: false })
        .order("use_count", { ascending: false })
        .order("last_used_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (companyResult.error || addressResult.error) {
      return null;
    }

    const savedAddress = addressResult.data as SavedAddressRecord | null;

    return {
      company: clean(companyResult.data?.company_name),
      companyId: nameRecord.company_id,
      travelerId: nameRecord.id,
      savedAddress: clean(savedAddress?.address) || clean(nameRecord.default_address),
      preferredVehicle: clean(nameRecord.preferred_vehicle),
    };
  }

  async function applyParsedBookingMessage(messageText: string) {
    if (!clean(messageText)) {
      setMessage({ tone: "error", text: "Paste a booking message before parsing." });
      return;
    }

    setBooking(() => createInitialBooking());
    clearParseArtifacts();

    const parsedBooking = parseBookingMessageForState(messageText);

    const detectedFields = Object.entries(parsedBooking).filter(([, value]) => hasParsedValue(value)).length;

    if (detectedFields === 0) {
      setMessage({
        tone: "error",
        text: "No booking details detected. Add labels like pickup, dropoff, date, time, name, or flight.",
      });
      return;
    }

    if (parsedBooking.multipleBookingsDetected) {
      const finalForm = createInitialBooking();

      setMultiBookingNotice(parsedBooking);
      setParsedDebugBooking({
        ...finalForm,
        ...(parsedBooking.cleanedLines ? { cleanedLines: parsedBooking.cleanedLines } : {}),
        ...(parsedBooking.extractedBookingsPreview
          ? { extractedBookingsPreview: parsedBooking.extractedBookingsPreview }
          : {}),
        ...(parsedBooking.company ? { company: parsedBooking.company } : {}),
        ...(parsedBooking.booker ? { booker: parsedBooking.booker } : {}),
        success: false,
        multipleBookingsDetected: true,
        parserWarning: parsedBooking.parserWarning,
      });
      setMessage({
        tone: "error",
        text: parsedBooking.parserWarning || "Multiple bookings detected. Please select one extracted booking.",
      });
      return;
    }

    setMultiBookingNotice(null);
    const parsedBookingForMerge = { ...parsedBooking };
    const finalForm = mergeParsedBookingIntoForm(createInitialBooking(), parsedBookingForMerge);

    const finalDebugBooking = {
      ...finalForm,
      ...(parsedBookingForMerge.cleanedLines ? { cleanedLines: parsedBookingForMerge.cleanedLines } : {}),
    };

    setBooking(() => finalForm);
    setParsedDebugBooking(() => ({
      ...finalForm,
      ...(parsedBookingForMerge.cleanedLines ? { cleanedLines: parsedBookingForMerge.cleanedLines } : {}),
    }));
    setMessage({
      tone: "success",
      text: `Parsed ${detectedFields} field${detectedFields === 1 ? "" : "s"}. Review before saving.`,
    });

    const nameMemory = await lookupNameMemory(parsedBooking.name || "");

    if (nameMemory) {
      const crmEnrichedBooking = applyNameMemory(parsedBookingForMerge, nameMemory);
      const crmUpdatesForMerge = {
        ...crmEnrichedBooking,
        name: clean(parsedBookingForMerge.name) || clean(crmEnrichedBooking.name),
      };

      setBooking((prev) => mergeCrmUpdatesIntoForm(prev, crmUpdatesForMerge));
      setParsedDebugBooking((prev) => ({
        ...mergeCrmUpdatesIntoForm(prev ?? finalDebugBooking, crmUpdatesForMerge),
        ...(crmUpdatesForMerge.cleanedLines ? { cleanedLines: crmUpdatesForMerge.cleanedLines } : {}),
      }));
      setMessage({
        tone: "success",
        text: `Parsed ${detectedFields} fields and applied CRM memory. Review before saving.`,
      });
    }
  }

  async function handleParseBookingMessage() {
    await applyParsedBookingMessage(bookingMessage);
  }

  async function resolveCompany() {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const client = supabase;
    const detectedCompany = getKnownCompanyForRelationship(
      booking.booker,
      booking.name,
      booking.company,
    );
    const companyName = detectedCompany || clean(booking.company);
    const bookerName = clean(booking.booker);
    const personName = clean(booking.name);
    const bookerContact = normalizePhone(booking.bookerContact);
    const domain = getEmailDomain(booking.bookerEmail);

    async function getCompanyById(companyId: number | null) {
      if (!companyId) {
        return null;
      }

      const companyResult = await client
        .from("companies")
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .eq("id", companyId)
        .limit(1)
        .maybeSingle();

      if (companyResult.error) {
        throw new Error(companyResult.error.message);
      }

      return companyResult.data as CompanyRecord | null;
    }

    if (companyName) {
      const existingByName = await client
        .from("companies")
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .ilike("company_name", companyName)
        .limit(1)
        .maybeSingle();

      if (existingByName.error) {
        throw new Error(existingByName.error.message);
      }

      if (existingByName.data) {
        return existingByName.data as CompanyRecord;
      }
    }

    if (bookerContact) {
      const existingByContact = await client
        .from("bookers")
        .select("company_id")
        .eq("phone", bookerContact)
        .limit(1)
        .maybeSingle();

      if (existingByContact.error) {
        throw new Error(existingByContact.error.message);
      }

      const companyByContact = await getCompanyById(existingByContact.data?.company_id ?? null);

      if (companyByContact) {
        return companyByContact;
      }
    }

    if (domain) {
      const existingByDomain = await client
        .from("companies")
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .eq("domain", domain)
        .limit(1)
        .maybeSingle();

      if (existingByDomain.error) {
        throw new Error(existingByDomain.error.message);
      }

      if (existingByDomain.data) {
        return existingByDomain.data as CompanyRecord;
      }
    }

    if (bookerName) {
      const existingByBooker = await client
        .from("bookers")
        .select("company_id")
        .ilike("booker_name", bookerName)
        .limit(1)
        .maybeSingle();

      if (existingByBooker.error) {
        throw new Error(existingByBooker.error.message);
      }

      const companyByBooker = await getCompanyById(existingByBooker.data?.company_id ?? null);

      if (companyByBooker) {
        return companyByBooker;
      }
    }

    if (personName) {
      const existingByName = await client
        .from("travelers")
        .select("company_id")
        .ilike("traveler_name", personName)
        .limit(1)
        .maybeSingle();

      if (existingByName.error) {
        throw new Error(existingByName.error.message);
      }

      const companyByName = await getCompanyById(existingByName.data?.company_id ?? null);

      if (companyByName) {
        return companyByName;
      }
    }

    const createdCompany = await client
      .from("companies")
      .insert({
        company_name:
          companyName ||
          domain ||
          (bookerName && bookerName.toLowerCase() !== personName.toLowerCase() ? bookerName : "") ||
          "Internal Account",
        domain: domain || null,
        customer_rates: {},
        driver_payout_rules: {},
      })
      .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
      .single();

    if (createdCompany.error) {
      throw new Error(createdCompany.error.message);
    }

    return createdCompany.data as CompanyRecord;
  }

  async function resolveBooker(companyId: number) {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const client = supabase;
    const email = normaliseEmail(booking.bookerEmail);
    const phone = normalizePhone(booking.bookerContact);
    const bookerName = clean(booking.booker) || (!clean(booking.company) ? clean(booking.name) : "");

    if (!bookerName) {
      return null;
    }

    async function updateBookerIfNeeded(bookerRecord: BookerRecord) {
      const updatePayload = {
        booker_name: bookerRecord.booker_name || bookerName,
        email: bookerRecord.email || email || null,
        phone: bookerRecord.phone || phone || null,
      };

      const { error } = await client.from("bookers").update(updatePayload).eq("id", bookerRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        ...bookerRecord,
        ...updatePayload,
      };
    }

    if (phone) {
      const existingByPhone = await client
        .from("bookers")
        .select("id, company_id, booker_name, email, phone")
        .eq("company_id", companyId)
        .eq("phone", phone)
        .limit(1)
        .maybeSingle();

      if (existingByPhone.error) {
        throw new Error(existingByPhone.error.message);
      }

      if (existingByPhone.data) {
        return updateBookerIfNeeded(existingByPhone.data as BookerRecord);
      }
    }

    if (email) {
      const existingByEmail = await client
        .from("bookers")
        .select("id, company_id, booker_name, email, phone")
        .eq("company_id", companyId)
        .eq("email", email)
        .limit(1)
        .maybeSingle();

      if (existingByEmail.error) {
        throw new Error(existingByEmail.error.message);
      }

      if (existingByEmail.data) {
        return updateBookerIfNeeded(existingByEmail.data as BookerRecord);
      }
    }

    const existingByName = await client
      .from("bookers")
      .select("id, company_id, booker_name, email, phone")
      .eq("company_id", companyId)
      .ilike("booker_name", bookerName)
      .limit(1)
      .maybeSingle();

    if (existingByName.error) {
      throw new Error(existingByName.error.message);
    }

    if (existingByName.data) {
      return updateBookerIfNeeded(existingByName.data as BookerRecord);
    }

    const createdBooker = await client
      .from("bookers")
      .insert({
        company_id: companyId,
        booker_name: bookerName,
        email: email || null,
        phone: phone || null,
      })
      .select("id, company_id, booker_name, email, phone")
      .single();

    if (createdBooker.error) {
      throw new Error(createdBooker.error.message);
    }

    return createdBooker.data as BookerRecord;
  }

  async function resolveName(companyId: number, booker: BookerRecord | null) {
    if (!supabase) {
      throw new Error("Supabase is not configured.");
    }

    const personName = clean(booking.name);

    if (!personName) {
      return null;
    }

    const existingName = await supabase
      .from("travelers")
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .eq("company_id", companyId)
      .ilike("traveler_name", personName)
      .limit(1)
      .maybeSingle();

    if (existingName.error) {
      throw new Error(existingName.error.message);
    }

    if (existingName.data) {
      const existingRecord = existingName.data as TravelerRecord;
      const updatePayload: Partial<TravelerRecord> = {
        booker_id: existingRecord.booker_id || booker?.id || null,
        booker_name: existingRecord.booker_name || clean(booker?.booker_name),
        booker_contact: existingRecord.booker_contact || clean(booker?.phone),
        booker_email: existingRecord.booker_email || clean(booker?.email),
      };

      const { error } = await supabase.from("travelers").update(updatePayload).eq("id", existingRecord.id);

      if (error) {
        throw new Error(error.message);
      }

      return {
        ...existingRecord,
        ...updatePayload,
      };
    }

    const createdName = await supabase
      .from("travelers")
      .insert({
        company_id: companyId,
        traveler_name: personName,
        booker_id: booker?.id ?? null,
        booker_name: clean(booker?.booker_name) || null,
        booker_contact: clean(booker?.phone) || null,
        booker_email: clean(booker?.email) || null,
      })
      .select("id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_id, booker_name, booker_contact, booker_email, customer_rates, driver_payout_rules")
      .single();

    if (createdName.error) {
      throw new Error(createdName.error.message);
    }

    return createdName.data as TravelerRecord;
  }

  async function rememberNameCrmDetails(companyId: number, travelerId: number | null) {
    if (!supabase || !travelerId) {
      return;
    }

    const address = getReusableNameAddress();
    const preferredVehicle = clean(booking.vehicle);
    const updatePayload: Partial<TravelerRecord> = {};

    if (preferredVehicle) {
      updatePayload.preferred_vehicle = preferredVehicle;
    }

    if (address) {
      updatePayload.default_address = address;
    }

    if (clean(booking.pickup) && !isAirportAddress(booking.pickup)) {
      updatePayload.default_pickup_address = clean(booking.pickup);
    }

    if (clean(booking.dropoff) && !isAirportAddress(booking.dropoff)) {
      updatePayload.default_dropoff_address = clean(booking.dropoff);
    }

    if (Object.keys(updatePayload).length > 0) {
      const { error } = await supabase.from("travelers").update(updatePayload).eq("id", travelerId);

      if (error) {
        throw new Error(error.message);
      }
    }

    if (!address) {
      return;
    }

    const existingAddress = await supabase
      .from("saved_addresses")
      .select("id, company_id, traveler_id, label, address, address_role, is_default, use_count")
      .eq("traveler_id", travelerId)
      .ilike("address", address)
      .limit(1)
      .maybeSingle();

    if (existingAddress.error) {
      throw new Error(existingAddress.error.message);
    }

    if (existingAddress.data) {
      const savedAddress = existingAddress.data as SavedAddressRecord;
      const { error } = await supabase
        .from("saved_addresses")
        .update({
          company_id: companyId,
          address,
          is_default: true,
          use_count: (savedAddress.use_count ?? 0) + 1,
          last_used_at: new Date().toISOString(),
        })
        .eq("id", savedAddress.id);

      if (error) {
        throw new Error(error.message);
      }

      return;
    }

    const { error } = await supabase.from("saved_addresses").insert({
      company_id: companyId,
      traveler_id: travelerId,
      label: "Default",
      address,
      address_role: "traveler_default",
      is_default: true,
      use_count: 1,
      last_used_at: new Date().toISOString(),
    });

    if (error) {
      throw new Error(error.message);
    }
  }

  async function loadRates(successText = "Rates loaded.") {
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Load failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    setSavingRates(true);
    setMessage({ tone: "info", text: "Loading rates..." });

    try {
      const [settingsResult, companiesResult, travelersResult] = await Promise.all([
        supabase
          .from("rate_settings")
          .select("customer_rates, driver_payout_rules, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout")
          .eq("id", "default")
          .limit(1)
          .maybeSingle(),
        supabase
          .from("companies")
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .order("company_name", { ascending: true }),
        supabase
          .from("travelers")
          .select("id, company_id, traveler_name, customer_rates, driver_payout_rules")
          .order("traveler_name", { ascending: true }),
      ]);

      const loadError = settingsResult.error || companiesResult.error || travelersResult.error;

      if (loadError) {
        throw new Error(formatSupabaseError(loadError));
      }

      const settings = settingsResult.data;
      const loadedCustomerRates = normalizeCustomerRateRules(settings?.customer_rates as RateRules | null | undefined);
      const loadedDriverPayoutRules = normalizeDriverPayoutRules(
        settings?.driver_payout_rules as DriverPayoutRules | null | undefined,
      );

      setRateSettings({
        customerRates: {
          ...defaultCustomerRates,
          ...loadedCustomerRates,
        },
        driverPayoutRules: {
          ...defaultDriverPayoutRules,
          ...loadedDriverPayoutRules,
        },
        midnightSurcharge: settings ? numericRate(settings.midnight_surcharge) : initialRateSettings.midnightSurcharge,
        extraStopSurcharge: settings
          ? positiveRateOrDefault(settings.extra_stop_surcharge, initialRateSettings.extraStopSurcharge)
          : initialRateSettings.extraStopSurcharge,
        midnightPayout: settings ? numericRate(settings.midnight_payout) : initialRateSettings.midnightPayout,
        extraStopPayout: settings
          ? positiveRateOrDefault(settings.extra_stop_payout, initialRateSettings.extraStopPayout)
          : initialRateSettings.extraStopPayout,
        childSeatCustomerSurcharge: settings?.child_seat_customer_surcharge === undefined
          ? defaultChildSeatCustomerSurcharge
          : positiveRateOrDefault(settings.child_seat_customer_surcharge, defaultChildSeatCustomerSurcharge),
        childSeatDriverPayout: settings?.child_seat_driver_payout === undefined
          ? defaultChildSeatDriverPayout
          : positiveRateOrDefault(settings.child_seat_driver_payout, defaultChildSeatDriverPayout),
      });

      setRateCompanies(
        ((companiesResult.data ?? []) as CompanyRecord[]).map((companyRecord) => ({
          ...companyRecord,
          customer_rates: normalizeCustomerRateRules(companyRecord.customer_rates),
          driver_payout_rules: normalizeDriverPayoutRules(companyRecord.driver_payout_rules),
        })),
      );
      setRateTravelers(
        ((travelersResult.data ?? []) as TravelerRecord[]).map((travelerRecord) => ({
          ...travelerRecord,
          customer_rates: normalizeCustomerRateRules(travelerRecord.customer_rates),
          driver_payout_rules: normalizeDriverPayoutRules(travelerRecord.driver_payout_rules),
        })),
      );
      setRatesLoaded(true);
      setMessage({ tone: "success", text: successText });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown rate load error.";

      setMessage({
        tone: "error",
        text: formatRatesSetupError(errorMessage, "Load failed: "),
      });
    } finally {
      setSavingRates(false);
    }
  }

  async function saveDefaultRates() {
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Save failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    setSavingRates(true);
    setMessage({ tone: "info", text: "Saving default rates..." });

    try {
      const customerRates = {
        ...defaultCustomerRates,
        ...normalizeCustomerRateRules(rateSettings.customerRates),
      };
      const driverPayoutRules = {
        ...defaultDriverPayoutRules,
        ...normalizeDriverPayoutRules(rateSettings.driverPayoutRules),
      };
      const { error } = await supabase
        .from("rate_settings")
        .upsert({
          id: "default",
          customer_rates: customerRates,
          driver_payout_rules: driverPayoutRules,
          midnight_surcharge: rateSettings.midnightSurcharge,
          extra_stop_surcharge: rateSettings.extraStopSurcharge,
          midnight_payout: rateSettings.midnightPayout,
          extra_stop_payout: rateSettings.extraStopPayout,
          child_seat_customer_surcharge: rateSettings.childSeatCustomerSurcharge,
          child_seat_driver_payout: rateSettings.childSeatDriverPayout,
          updated_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (error) {
        throw new Error(formatSupabaseError(error));
      }

      setRateSettings((current) => ({
        ...current,
        customerRates,
        driverPayoutRules,
      }));
      setMessage({ tone: "success", text: "Default rates saved." });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown default rate save error.";

      setMessage({
        tone: "error",
        text: formatRatesSetupError(errorMessage, "Save failed: "),
      });
    } finally {
      setSavingRates(false);
    }
  }

  async function saveRateOverride() {
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Save failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    const companyName = clean(rateOverrideDraft.companyName);
    const bossName = clean(rateOverrideDraft.bossName);
    const overrideCustomerRates = normalizeCustomerRateRules(rateOverrideDraft.customerRates);
    const overrideDriverPayoutRules = normalizeDriverPayoutRules(rateOverrideDraft.driverPayoutRules);

    if (!companyName && !bossName) {
      setMessage({ tone: "error", text: "Save failed: Enter a company/account or boss/name before saving overrides." });
      return;
    }

    setSavingRates(true);
    setMessage({ tone: "info", text: "Saving rate override..." });

    try {
      let company: CompanyRecord | null = rateCompanies.find(
        (companyRecord) => clean(companyRecord.company_name).toLowerCase() === companyName.toLowerCase(),
      ) ?? null;

      if (!company) {
        const existingCompany = await supabase
          .from("companies")
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .ilike("company_name", companyName || "Internal Account")
          .limit(1)
          .maybeSingle();

        if (existingCompany.error) {
          throw new Error(existingCompany.error.message);
        }

        company = existingCompany.data as CompanyRecord | null;
      }

      if (!company) {
        const createdCompany = await supabase
          .from("companies")
          .insert({
            company_name: companyName || "Internal Account",
            customer_rates: bossName ? {} : overrideCustomerRates,
            driver_payout_rules: bossName ? {} : overrideDriverPayoutRules,
            transzend_excel_privacy: rateOverrideDraft.transzendExcelPrivacy,
          })
          .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
          .single();

        if (createdCompany.error) {
          throw new Error(createdCompany.error.message);
        }

        company = createdCompany.data as CompanyRecord;
      }

      const mergedCompanyRates = bossName
        ? normalizeCustomerRateRules(company.customer_rates)
        : {
            ...normalizeCustomerRateRules(company.customer_rates),
            ...overrideCustomerRates,
          };
      const mergedCompanyPayouts = bossName
        ? normalizeDriverPayoutRules(company.driver_payout_rules)
        : {
            ...normalizeDriverPayoutRules(company.driver_payout_rules),
            ...overrideDriverPayoutRules,
          };

      const companyUpdate = await supabase
        .from("companies")
        .update({
          customer_rates: mergedCompanyRates,
          driver_payout_rules: mergedCompanyPayouts,
          transzend_excel_privacy: rateOverrideDraft.transzendExcelPrivacy,
          updated_at: new Date().toISOString(),
        })
        .eq("id", company.id)
        .select("id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy")
        .single();

      if (companyUpdate.error) {
        throw new Error(companyUpdate.error.message);
      }

      if (bossName) {
        const existingTraveler = await supabase
          .from("travelers")
          .select("id, company_id, traveler_name, customer_rates, driver_payout_rules")
          .eq("company_id", company.id)
          .ilike("traveler_name", bossName)
          .limit(1)
          .maybeSingle();

        if (existingTraveler.error) {
          throw new Error(existingTraveler.error.message);
        }

        if (existingTraveler.data) {
          const traveler = existingTraveler.data as TravelerRecord;
          const travelerUpdate = await supabase
            .from("travelers")
            .update({
              customer_rates: {
                ...normalizeCustomerRateRules(traveler.customer_rates),
                ...overrideCustomerRates,
              },
              driver_payout_rules: {
                ...normalizeDriverPayoutRules(traveler.driver_payout_rules),
                ...overrideDriverPayoutRules,
              },
              updated_at: new Date().toISOString(),
            })
            .eq("id", traveler.id);

          if (travelerUpdate.error) {
            throw new Error(travelerUpdate.error.message);
          }
        } else {
          const travelerInsert = await supabase.from("travelers").insert({
            company_id: company.id,
            traveler_name: bossName,
            customer_rates: overrideCustomerRates,
            driver_payout_rules: overrideDriverPayoutRules,
          });

          if (travelerInsert.error) {
            throw new Error(travelerInsert.error.message);
          }
        }
      }

      setRateOverrideDraft({
        companyName: companyName || "Internal Account",
        bossName,
        customerRates: overrideCustomerRates,
        driverPayoutRules: overrideDriverPayoutRules,
        transzendExcelPrivacy: rateOverrideDraft.transzendExcelPrivacy,
      });
      await loadRates("Override saved.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown rate save error.";
      setMessage({
        tone: "error",
        text: formatRatesSetupError(errorMessage, "Save failed: "),
      });
      setSavingRates(false);
    }
  }

  async function loadDrivers(successText = "Drivers loaded.") {
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    setMessage({ tone: "info", text: "Loading drivers..." });

    const { data, error } = await supabase
      .from("drivers")
      .select("id, driver_name, contact_number, vehicle_type, plate_number, payout_preferences, driver_payout_rules, availability_status, notes, preferred_areas, airport_permit_notes")
      .order("driver_name", { ascending: true });

    if (error) {
      setMessage({ tone: "error", text: `Driver load failed: ${error.message}` });
      return;
    }

    setDrivers((data ?? []) as DriverRecord[]);
    setMessage({ tone: "success", text: successText });
  }

  async function saveDriverProfile() {
    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    const driverName = clean(driverProfileDraft.driverName);

    if (!driverName) {
      setMessage({ tone: "error", text: "Driver name is required." });
      return;
    }

    setMessage({ tone: "info", text: "Saving driver profile..." });

    let existingDriver: DriverRecord | null = drivers.find(
      (driver) => clean(driver.driver_name).toLowerCase() === driverName.toLowerCase(),
    ) ?? null;

    if (!existingDriver) {
      const existingResult = await supabase
        .from("drivers")
        .select("id, driver_name, contact_number, vehicle_type, plate_number, payout_preferences, driver_payout_rules, availability_status, notes, preferred_areas, airport_permit_notes")
        .ilike("driver_name", driverName)
        .limit(1)
        .maybeSingle();

      if (existingResult.error) {
        setMessage({ tone: "error", text: `Driver lookup failed: ${existingResult.error.message}` });
        return;
      }

      existingDriver = existingResult.data as DriverRecord | null;
    }

    const payload = {
      driver_name: driverName,
      contact_number: clean(driverProfileDraft.contactNumber) || null,
      vehicle_type: clean(driverProfileDraft.vehicleType) || null,
      plate_number: clean(driverProfileDraft.plateNumber) || null,
      payout_preferences: clean(driverProfileDraft.payoutPreferences) || null,
      driver_payout_rules: driverProfileDraft.payoutRules,
      availability_status: clean(driverProfileDraft.availabilityStatus) || "available",
      notes: clean(driverProfileDraft.notes) || null,
      preferred_areas: clean(driverProfileDraft.preferredAreas) || null,
      airport_permit_notes: clean(driverProfileDraft.airportPermitNotes) || null,
      updated_at: new Date().toISOString(),
    };
    const result = existingDriver
      ? await supabase.from("drivers").update(payload).eq("id", existingDriver.id)
      : await supabase.from("drivers").insert(payload);

    if (result.error) {
      setMessage({ tone: "error", text: `Driver save failed: ${result.error.message}` });
      return;
    }

    setDriverProfileDraft(initialDriverProfileDraft);
    await loadDrivers("Driver profile saved.");
  }

  async function saveBooking() {
    setBookingSaveMessage(null);

    const currentNeedsReviewWarnings = getNeedsReviewWarnings(booking);
    const currentReviewAcceptanceKey = getReviewAcceptanceKey(booking, currentNeedsReviewWarnings);

    if (
      currentNeedsReviewWarnings.length > 0 &&
      acceptedReviewWarningKey !== currentReviewAcceptanceKey
    ) {
      const reviewMessage = {
        tone: "error",
        text: "Please review warnings before saving.",
      } satisfies Message;

      setMessage(reviewMessage);
      setBookingSaveMessage(reviewMessage);
      return;
    }

    if (!validateBooking()) {
      return;
    }

    if (!supabase) {
      const saveMessage = {
        tone: "error",
        text: "Booking save failed: Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      } satisfies Message;

      setMessage({
        tone: saveMessage.tone,
        text: saveMessage.text,
      });
      setBookingSaveMessage(saveMessage);
      return;
    }

    setSaving(true);
    setMessage({ tone: "info", text: "Saving booking + CRM..." });
    setBookingSaveMessage({ tone: "info", text: "Saving booking + CRM..." });

    try {
      const fallbackCompanyName =
        getKnownCompanyForRelationship(booking.booker, booking.name, booking.company) || clean(booking.company);
      let company: CompanyRecord = blankCompanyRecord(fallbackCompanyName);
      let booker: BookerRecord | null = null;
      let name: TravelerRecord | null = null;
      let crmUpdateFailed = false;
      let crmErrorMessage = "";

      try {
        company = await resolveCompany();
        booker = await resolveBooker(company.id);
        name = await resolveName(company.id, booker);
      } catch (error) {
        crmUpdateFailed = true;
        crmErrorMessage = error instanceof Error ? error.message : "Unknown CRM update error.";
      }

      const bookingDriverId = clean(booking.driverId);
      const bookingDriverName = clean(booking.driverName).toLowerCase();
      const selectedDriver = drivers.find(
        (driver) =>
          (bookingDriverId && String(driver.id) === bookingDriverId) ||
          (bookingDriverName && clean(driver.driver_name).toLowerCase() === bookingDriverName),
      ) ?? null;
      const fallbackDriverId = Number(bookingDriverId);
      const resolvedDriverId =
        selectedDriver?.id ?? (Number.isFinite(fallbackDriverId) && fallbackDriverId > 0 ? fallbackDriverId : null);
      const pricing = resolvePricing(
        booking,
        company,
        name,
        rateSettings,
        selectedDriver,
      );
      const pricingSnapshot = calculateProfit(
        pricing,
        booking.customerPriceOverride,
        booking.driverPayoutOverride,
      );

      const bookingPayload = {
        company_id: company.id || null,
        booker_id: booker?.id ?? null,
        traveler_id: name?.id ?? null,
        booking_type: clean(booking.bookingType),
        vehicle: clean(booking.vehicle),
        pickup_time: normalizePickupTimeForStorage(booking.time),
        pickup_address: clean(booking.pickup),
        dropoff_address: clean(booking.dropoff),
        flight_no: clean(booking.flight),
        route,
        pax: Number(clean(booking.pax)) || 1,
        job_card: jobCard,
        driver_id: resolvedDriverId,
        driver_name: clean(booking.driverName) || null,
        driver_contact: clean(booking.driverContact) || clean(selectedDriver?.contact_number) || null,
        driver_plate_number: clean(selectedDriver?.plate_number) || null,
        customer_rate: pricing.customerRate,
        customer_rate_unit: pricing.customerRateUnit,
        customer_price_amount: pricingSnapshot.customerPrice,
        customer_rate_override: clean(booking.customerPriceOverride)
          ? numericRate(booking.customerPriceOverride)
          : null,
        customer_price_override_reason: clean(booking.customerPriceOverrideReason) || null,
        driver_payout_min: pricing.driverPayoutMin,
        driver_payout_max: pricing.driverPayoutMax,
        driver_payout_amount: pricingSnapshot.driverPayout,
        driver_payout_override: clean(booking.driverPayoutOverride)
          ? numericRate(booking.driverPayoutOverride)
          : null,
        driver_payout_reason: clean(booking.driverPayoutReason) || null,
        driver_payout_unit: pricing.driverPayoutUnit,
        driver_notes: clean(booking.driverNotes) || null,
        driver_dispatch_include_payout: Boolean(booking.driverIncludePayout),
        midnight_surcharge: pricing.midnightSurcharge,
        midnight_payout: pricing.midnightPayout,
        extra_stop_count: pricing.extraStopCount,
        extra_stop_surcharge: pricing.extraStopSurcharge,
        extra_stop_payout: pricing.extraStopPayout,
        child_seat_required: clean(booking.childSeatRequired) === "yes",
        child_seat_count: pricing.childSeatCount,
        child_seat_type:
          clean(booking.childSeatRequired) === "yes" ? clean(booking.childSeatType) || null : null,
        child_seat_customer_surcharge: pricing.childSeatCustomerAmount,
        child_seat_driver_payout: pricing.childSeatDriverAmount,
        pricing_source: pricingSnapshot.customerPriceSource,
        status: clean(booking.driverName) ? "assigned" : "confirmed",
      };
      const { data: savedBooking, error } = await supabase.from("bookings").insert(bookingPayload).select("id").single();

      if (error || !savedBooking) {
        const saveMessage = {
          tone: "error",
          text: `Booking save failed: ${error ? formatSupabaseError(error) : "No saved booking id returned."}`,
        } satisfies Message;

        setMessage(saveMessage);
        setBookingSaveMessage(saveMessage);
      } else {
        if (!crmUpdateFailed) {
          try {
            await rememberNameCrmDetails(company.id, name?.id ?? null);
          } catch (error) {
            crmUpdateFailed = true;
            crmErrorMessage = error instanceof Error ? error.message : "Unknown CRM memory update error.";
          }
        }

        const savedBookingResult = await fetchSavedBookingById(savedBooking.id);

        if (savedBookingResult.error || !savedBookingResult.data) {
          const saveMessage = {
            tone: "success",
            text: `Booking saved successfully: ${savedBooking.id}`,
          } satisfies Message;

          setMessage({
            tone: saveMessage.tone,
            text: `${saveMessage.text}. Recent booking reload failed: ${
              savedBookingResult.error ? formatSupabaseError(savedBookingResult.error) : "No booking row returned."
            }`,
          });
          setBookingSaveMessage(saveMessage);
          setAcceptedReviewWarningKey("");
          return;
        }

        const savedBookingRecord = savedBookingResult.data as BookingRecord;
        setBookings((currentBookings) =>
          sortBookingsNewestFirst([
            savedBookingRecord,
            ...currentBookings.filter((currentBooking) => String(currentBooking.id) !== String(savedBookingRecord.id)),
          ]),
        );
        const saveMessage = {
          tone: crmUpdateFailed ? "error" : "success",
          text: crmUpdateFailed
            ? `Booking saved successfully. CRM update failed: ${crmErrorMessage || "Unknown CRM error."}`
            : `Booking saved successfully: ${savedBooking.id}`,
        } satisfies Message;

        setMessage(saveMessage);
        setBookingSaveMessage(saveMessage);
        setAcceptedReviewWarningKey("");
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown save error.";
      const saveMessage = { tone: "error", text: `Booking save failed: ${errorMessage}` } satisfies Message;
      setMessage(saveMessage);
      setBookingSaveMessage(saveMessage);
    } finally {
      setSaving(false);
    }
  }

  async function fetchSavedBookingById(bookingId: string | number) {
    if (!supabase) {
      return {
        data: null,
        error: new Error("Supabase is not configured."),
      };
    }

    return supabase
      .from("bookings")
      .select("*, companies(company_name, domain), bookers(booker_name, email, phone), travelers(traveler_name)")
      .eq("id", bookingId)
      .limit(1)
      .maybeSingle();
  }

  async function loadBookings(successText = "Bookings loaded.", options?: { silent?: boolean }) {
    if (!supabase) {
      if (!options?.silent) {
        setMessage({
          tone: "error",
          text: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        });
      }
      return;
    }

    setLoading(true);
    if (!options?.silent) {
      setMessage({ tone: "info", text: "Loading bookings..." });
    }

    const { data, error } = await supabase
      .from("bookings")
      .select("*, companies(company_name, domain), bookers(booker_name, email, phone), travelers(traveler_name)")
      .order("created_at", { ascending: false })
      .limit(25);

    if (error) {
      if (!options?.silent) {
        setMessage({ tone: "error", text: `Load failed: ${error.message}` });
      }
    } else {
      const loadedBookings = sortBookingsNewestFirst((data ?? []) as BookingRecord[]);
      setBookings(loadedBookings);
      if (!options?.silent) {
        if (loadedBookings.length === 0) {
          setMessage({ tone: "info", text: "No bookings found." });
        } else {
          setMessage({ tone: "success", text: `${successText} Choose a booking below.` });
        }
      }
    }

    setLoading(false);
  }

  function loadSelectedBooking(bookingRecord: BookingRecord) {
    setBooking(() => bookingRecordToForm(bookingRecord));
    setParsedDebugBooking(null);
    setShowParserDebug(false);
    setMultiBookingNotice(null);
    setMessage({
      tone: "success",
      text: `Booking ${bookingRecord.id || clean(bookingRecord.flight_no) || getBookingDateKey(bookingRecord)} loaded.`,
    });
  }

  async function copyJobCard() {
    try {
      await navigator.clipboard.writeText(jobCardPreview);
      setMessage({ tone: "success", text: "Job card copied." });
    } catch {
      setMessage({ tone: "error", text: "Copy failed. Select the preview text manually." });
    }
  }

  function assignDraftDriver() {
    if (!clean(booking.driverName)) {
      setMessage({ tone: "error", text: "Enter a driver name before assigning this draft." });
      return;
    }

    setMessage({
      tone: "success",
      text: "Driver assigned for this draft. Save Booking + CRM will store driver details.",
    });
  }

  async function copyDraftDriverDispatch() {
    try {
      await navigator.clipboard.writeText(draftDriverDispatchCard);
      setMessage({ tone: "success", text: "Draft driver dispatch copied." });
    } catch {
      setMessage({ tone: "error", text: "Copy failed. Select the dispatch preview manually." });
    }
  }

  async function copySavedJobCard(bookingRecord: BookingRecord) {
    try {
      await navigator.clipboard.writeText(getBookingJobCard(bookingRecord));
      setMessage({ tone: "success", text: "Booking job card copied." });
    } catch {
      setMessage({ tone: "error", text: "Copy failed. Select the booking details manually." });
    }
  }

  async function assignDriver(bookingRecord: BookingRecord) {
    const driverDraft = getDriverDraft(bookingRecord);
    const selectedDriver = drivers.find((driver) => String(driver.id) === driverDraft.driverId);
    const driverName = clean(driverDraft.driverName) || clean(selectedDriver?.driver_name);
    const calculatedPayout = calculateSavedDriverPayout(
      bookingRecord,
      selectedDriver,
      rateSettings,
      driverDraft.payoutOverride,
    );

    if (!driverName) {
      setMessage({ tone: "error", text: "Driver name is required before assignment." });
      return;
    }

    if (!supabase) {
      setMessage({
        tone: "error",
        text: "Supabase is not configured. Check NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
      });
      return;
    }

    const bookingId = String(bookingRecord.id);
    setAssigningBookingId(bookingId);
    setMessage({ tone: "info", text: "Assigning driver..." });

    const { error } = await supabase
      .from("bookings")
      .update({
        driver_id: selectedDriver?.id ?? null,
        driver_name: driverName,
        driver_contact: clean(driverDraft.driverContact) || clean(selectedDriver?.contact_number) || null,
        driver_plate_number: clean(driverDraft.driverPlate) || clean(selectedDriver?.plate_number) || null,
        driver_payout_amount: calculatedPayout || null,
        driver_payout_override: clean(driverDraft.payoutOverride)
          ? numericRate(driverDraft.payoutOverride)
          : null,
        driver_payout_reason: clean(driverDraft.payoutReason) || null,
        driver_notes: clean(driverDraft.notes) || null,
        driver_dispatch_include_payout: driverDraft.includePayout,
        status: "assigned",
      })
      .eq("id", bookingRecord.id);

    if (error) {
      setMessage({ tone: "error", text: `Driver assignment failed: ${error.message}` });
    } else {
      setBookings((current) =>
        current.map((currentBooking) =>
          currentBooking.id === bookingRecord.id
            ? {
                ...currentBooking,
                driver_id: selectedDriver?.id ?? null,
                driver_name: driverName,
                driver_contact: clean(driverDraft.driverContact) || clean(selectedDriver?.contact_number),
                driver_plate_number: clean(driverDraft.driverPlate) || clean(selectedDriver?.plate_number),
                driver_payout_amount: calculatedPayout,
                driver_payout_override: clean(driverDraft.payoutOverride)
                  ? numericRate(driverDraft.payoutOverride)
                  : null,
                driver_payout_reason: clean(driverDraft.payoutReason),
                driver_notes: clean(driverDraft.notes),
                driver_dispatch_include_payout: driverDraft.includePayout,
                status: "assigned",
              }
            : currentBooking,
        ),
      );
      setMessage({ tone: "success", text: `Driver assigned to booking ${bookingRecord.id}.` });
    }

    setAssigningBookingId(null);
  }

  async function copyDriverDispatch(bookingRecord: BookingRecord) {
    try {
      await navigator.clipboard.writeText(getDriverDispatchCard(bookingRecord, getDriverDraft(bookingRecord)));
      setMessage({ tone: "success", text: "Driver dispatch copied." });
    } catch {
      setMessage({ tone: "error", text: "Copy failed. Select the dispatch details manually." });
    }
  }

  function renderBookingCards(sectionBookings: BookingRecord[], emptyText: string) {
    if (sectionBookings.length === 0) {
      return (
        <div className="rounded-md border border-dashed border-stone-300 p-6 text-center text-sm text-slate-500">
          {emptyText}
        </div>
      );
    }

    return (
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sectionBookings.map((savedBooking) => {
          const driverDraft = getDriverDraft(savedBooking);
          const bookingId = String(savedBooking.id);
          const isAssigned = clean(savedBooking.status).toLowerCase() === "assigned";
          const hasDriver = Boolean(clean(savedBooking.driver_name) || clean(driverDraft.driverName));

          return (
            <article
              className="rounded-lg border border-stone-200 bg-stone-50 p-4"
              key={savedBooking.id}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-semibold">
                    {savedBooking.vehicle || "Vehicle"} {savedBooking.booking_type || "Booking"}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    {formatPickupDateTime(getBookingDateKey(savedBooking), savedBooking.pickup_time)}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${bookingStatusClass(
                    savedBooking.status,
                  )}`}
                >
                  {savedBooking.status || "pending"}
                </span>
              </div>

              <div className="mt-3 space-y-1 text-sm text-slate-700">
                {getBookingName(savedBooking) ? (
                  <p className="font-medium text-slate-900">{getBookingName(savedBooking)}</p>
                ) : null}
                <p>{getBookingCompany(savedBooking)}</p>
                <p>
                  {savedBooking.route ||
                    `${savedBooking.pickup_address || "Pickup"} > ${
                      savedBooking.dropoff_address || "Drop-off"
                    }`}
                </p>
                {savedBooking.flight_no ? <p>Flight: {savedBooking.flight_no}</p> : null}
                <p>Pax {savedBooking.pax || 1}</p>
                {savedBooking.child_seat_required ? (
                  <p>{formatChildSeatNote(savedBooking.child_seat_count, savedBooking.child_seat_type)}</p>
                ) : null}
                {normalizeExtraStopCount(savedBooking.extra_stop_count) > 0 ? (
                  <p>Extra stops: {normalizeExtraStopCount(savedBooking.extra_stop_count)}</p>
                ) : null}
                {savedBooking.customer_price_amount || savedBooking.driver_payout_amount ? (
                  <p>
                    Customer ${savedBooking.customer_price_amount ?? savedBooking.customer_rate ?? 0} / Driver $
                    {savedBooking.driver_payout_amount ?? savedBooking.driver_payout_max ?? 0}
                  </p>
                ) : null}
                {savedBooking.customer_price_override_reason ? (
                  <p>Customer override: {savedBooking.customer_price_override_reason}</p>
                ) : null}
              </div>

              <div className="mt-4 rounded-md border border-stone-200 bg-white p-3">
	                <div className="grid gap-3 sm:grid-cols-2">
	                  <label className="sm:col-span-2">
	                    <span className="mb-1 block text-xs font-medium text-slate-600">
	                      Driver
	                    </span>
	                    <select
	                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                      onChange={(event) =>
	                        updateDriverDraft(savedBooking, "driverId", event.target.value)
	                      }
	                      value={driverDraft.driverId}
	                    >
	                      <option value="">Manual / unselected</option>
	                      {drivers.map((driver) => (
	                        <option key={driver.id} value={driver.id}>
	                          {driver.driver_name} {driver.availability_status ? `(${driver.availability_status})` : ""}
	                        </option>
	                      ))}
	                    </select>
	                  </label>
	                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Driver Name
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      onChange={(event) =>
                        updateDriverDraft(savedBooking, "driverName", event.target.value)
                      }
                      placeholder="Driver name"
                      value={driverDraft.driverName}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-xs font-medium text-slate-600">
                      Driver Contact
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      onChange={(event) =>
                        updateDriverDraft(savedBooking, "driverContact", event.target.value)
                      }
                      placeholder="Phone / WhatsApp"
	                      value={driverDraft.driverContact}
	                    />
	                  </label>
	                  <label>
	                    <span className="mb-1 block text-xs font-medium text-slate-600">
	                      Override Payout
	                    </span>
	                    <input
	                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                      min={0}
	                      onChange={(event) =>
	                        updateDriverDraft(savedBooking, "payoutOverride", event.target.value)
	                      }
	                      placeholder={`${savedBooking.driver_payout_amount || savedBooking.driver_payout_max || ""}`}
	                      type="number"
	                      value={driverDraft.payoutOverride}
	                    />
	                  </label>
	                  <label>
	                    <span className="mb-1 block text-xs font-medium text-slate-600">
	                      Override Reason
	                    </span>
	                    <input
	                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                      onChange={(event) =>
	                        updateDriverDraft(savedBooking, "payoutReason", event.target.value)
	                      }
	                      placeholder="Tuas / VIP / midnight"
	                      value={driverDraft.payoutReason}
	                    />
	                  </label>
	                  <label className="sm:col-span-2">
	                    <span className="mb-1 block text-xs font-medium text-slate-600">
	                      Driver Notes
	                    </span>
	                    <input
	                      className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                      onChange={(event) =>
	                        updateDriverDraft(savedBooking, "notes", event.target.value)
	                      }
	                      placeholder="Assignment notes"
	                      value={driverDraft.notes}
	                    />
	                  </label>
	                  <label className="flex items-center gap-2 text-sm text-slate-700">
	                    <input
	                      checked={driverDraft.includePayout}
	                      onChange={(event) =>
	                        updateDriverDraft(savedBooking, "includePayout", event.target.checked)
	                      }
	                      type="checkbox"
	                    />
	                    Include payout
	                  </label>
	                </div>
                <button
                  className="mt-3 h-10 w-full rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                  disabled={assigningBookingId === bookingId}
                  onClick={() => assignDriver(savedBooking)}
                  type="button"
                >
                  {assigningBookingId === bookingId ? "Assigning..." : "Assign Driver"}
                </button>
              </div>

              {isAssigned || hasDriver ? (
                <div className="mt-4 rounded-md border border-sky-200 bg-sky-50 p-3 text-sm text-slate-800">
                  <p className="font-semibold text-sky-900">Dispatch</p>
                  <p className="mt-1">Driver: {clean(savedBooking.driver_name) || driverDraft.driverName}</p>
                  {driverDraft.driverContact ? <p>Contact: {driverDraft.driverContact}</p> : null}
                  {getBookingName(savedBooking) ? (
                    <p>Passenger: {getBookingName(savedBooking)}</p>
                  ) : null}
                  <button
                    className="mt-3 h-10 w-full rounded-md border border-sky-300 bg-white px-3 text-sm font-semibold text-sky-900 transition hover:bg-sky-50"
                    onClick={() => copyDriverDispatch(savedBooking)}
                    type="button"
                  >
                    Copy Driver Dispatch
                  </button>
                </div>
              ) : null}

              <button
                className="mt-4 h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                onClick={() => copySavedJobCard(savedBooking)}
                type="button"
              >
                Copy WhatsApp Job Card
              </button>
            </article>
          );
        })}
      </div>
    );
  }

  const pricingPanel = (
    <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-xl font-semibold">Pricing</h2>
      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border border-stone-200 bg-stone-50 px-2 py-3">
          <p className="text-xs text-slate-500">Customer</p>
          <p className="text-lg font-semibold">${formatMoney(draftPricing.customerPrice)}</p>
        </div>
        <div className="rounded-md border border-stone-200 bg-stone-50 px-2 py-3">
          <p className="text-xs text-slate-500">Driver</p>
          <p className="text-lg font-semibold">${formatMoney(draftPricing.driverPayout)}</p>
        </div>
        <div className="rounded-md border border-stone-200 bg-stone-50 px-2 py-3">
          <p className="text-xs text-slate-500">Profit</p>
          <p className="text-lg font-semibold">${formatMoney(draftPricing.profit)}</p>
        </div>
      </div>
      <p className="mt-3 text-sm text-slate-600">
        Source: {draftPricing.customerPriceSource}; customer rate ${formatMoney(draftPricing.customerRate)}/
        {draftPricing.customerRateUnit}; driver payout ${formatMoney(draftPricing.driverPayoutMin)}
        {draftPricing.driverPayoutMax !== draftPricing.driverPayoutMin
          ? `-${formatMoney(draftPricing.driverPayoutMax)}`
          : ""}
        /{draftPricing.driverPayoutUnit} ({draftPricing.driverPayoutSource})
      </p>
      {draftPricing.midnightSurcharge ||
      draftPricing.midnightPayout ||
      draftPricing.extraStopCount ||
      draftPricing.childSeatCount ? (
        <div className="mt-3 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-slate-700">
          {draftPricing.midnightSurcharge || draftPricing.midnightPayout ? (
            <p>
              Midnight: customer +${formatMoney(draftPricing.midnightSurcharge)} / driver +$
              {formatMoney(draftPricing.midnightPayout)}
            </p>
          ) : null}
          {draftPricing.extraStopCount ? (
            <p>
              Extra stops: {draftPricing.extraStopCount} x customer +$
              {formatCompactMoney(draftPricing.extraStopSurcharge)} / driver +$
              {formatCompactMoney(draftPricing.extraStopPayout)}
            </p>
          ) : null}
          {draftPricing.childSeatCount ? (
            <p>
              Child seat: {draftPricing.childSeatCount} x customer +$
              {formatCompactMoney(draftPricing.childSeatCustomerSurcharge)} / driver +$
              {formatCompactMoney(draftPricing.childSeatDriverPayout)}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Customer Price Override
          </span>
          <input
            className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            min={0}
            onChange={(event) => update("customerPriceOverride", event.target.value)}
            placeholder={formatMoney(draftPricing.customerPrice)}
            type="number"
            value={booking.customerPriceOverride}
          />
        </label>
        <label className="sm:col-span-2">
          <span className="mb-1 block text-sm font-medium text-slate-700">
            Override Reason
          </span>
          <input
            className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
            onChange={(event) => update("customerPriceOverrideReason", event.target.value)}
            placeholder="Custom quote / VIP / account rule"
            value={booking.customerPriceOverrideReason}
          />
        </label>
      </div>
    </div>
  );

  return (
    <main className="min-h-screen bg-stone-50 text-slate-950">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 border-b border-stone-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-slate-500">
              Internal limousine operations
            </p>
            <h1 className="mt-1 text-3xl font-semibold tracking-normal text-slate-950">
              Prestige Limo Ops Dispatch
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:min-w-80">
            <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">Saved</p>
              <p className="text-lg font-semibold">{bookings.length}</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">Status</p>
              <p className="text-lg font-semibold">Live</p>
            </div>
            <div className="rounded-md border border-stone-200 bg-white px-3 py-2">
              <p className="text-xs text-slate-500">Mode</p>
              <p className="text-lg font-semibold">Admin</p>
            </div>
          </div>
        </header>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
          <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-semibold">Dispatcher Intake</h2>
                <p className="text-sm text-slate-500">Paste, parse, assign, dispatch, then save.</p>
              </div>
              <button
                className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                type="button"
                onClick={() => {
                  setBooking(() => createInitialBooking());
                  clearBookingMessageInput();
                }}
              >
                Clear
              </button>
            </div>

            <div className="mb-5 rounded-lg border border-stone-200 bg-stone-50 p-3">
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Paste Booking Message
                </span>
                <textarea
                  key={bookingMessageResetKey}
                  className="min-h-32 w-full resize-y rounded-md border border-stone-300 bg-white px-3 py-2 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  ref={bookingMessageRef}
                  onChange={(event) => setBookingMessage(event.target.value)}
                  placeholder="Paste WhatsApp, email, or screenshot OCR text here."
                  value={bookingMessage}
                />
              </label>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <button
                  className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800"
                  onClick={handleParseBookingMessage}
                  type="button"
                >
                  Parse Booking
                </button>
                <button
                  className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 transition hover:bg-slate-50"
                  onClick={clearBookingMessageInput}
                  type="button"
                >
                  Clear Message
                </button>
              </div>
              {multiBookingNotice?.multipleBookingsDetected ? (
                <div className="mt-4 rounded-lg border-2 border-amber-400 bg-amber-50 p-4 shadow-sm">
                  <p className="text-base font-semibold text-amber-950">
                    Multiple bookings detected. Please select one extracted booking.
                  </p>
                  <div className="mt-3 grid gap-2 rounded-md border border-amber-200 bg-white/70 p-3 text-xs text-amber-950 sm:grid-cols-3">
                    <span>
                      <strong>multipleBookingsDetected:</strong>{" "}
                      {String(Boolean(multiBookingNotice.multipleBookingsDetected))}
                    </span>
                    <span>
                      <strong>parserWarning:</strong>{" "}
                      {clean(multiBookingNotice.parserWarning) || "none"}
                    </span>
                    <span>
                      <strong>extractedBookingsPreview.length:</strong>{" "}
                      {multiBookingPreviewItems.length}
                    </span>
                  </div>
                  {multiBookingPreviewItems.length > 0 ? (
                    <div className="mt-3 grid gap-3">
                      {multiBookingPreviewItems.map((preview, index) => {
                        const routeText = [preview.pickup, preview.dropoff].filter(Boolean).join(" > ");

                        return (
                          <div
                            className="rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800"
                            key={`${preview.passenger || "booking"}-${preview.flight || index}-${index}`}
                          >
                            <div className="grid gap-1 sm:grid-cols-2">
                              <p>
                                <strong>Passenger:</strong> {clean(preview.passenger) || "Not detected"}
                              </p>
                              <p>
                                <strong>Type:</strong> {clean(preview.type) || "Not detected"}
                              </p>
                              <p>
                                <strong>Date/time:</strong>{" "}
                                {[preview.date, preview.time].filter(Boolean).join(" ") || "Not detected"}
                              </p>
                              <p>
                                <strong>Flight:</strong> {clean(preview.flight) || "None"}
                              </p>
                              <p className="sm:col-span-2">
                                <strong>Route:</strong> {routeText || "Not detected"}
                              </p>
                            </div>
                            <button
                              className="mt-3 h-9 rounded-md bg-amber-900 px-3 text-sm font-semibold text-white transition hover:bg-amber-800"
                              onClick={() => applyExtractedBooking(preview)}
                              type="button"
                            >
                              Use this booking
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-amber-950">
                      No extracted booking previews were generated. Split the pasted message and parse one booking at a time.
                    </p>
                  )}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {fieldOrder.map((field) => (
                <label
                  className={field === "pickup" || field === "dropoff" ? "sm:col-span-2" : ""}
                  key={field}
                >
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {fieldLabels[field]}
                    {requiredFields.includes(field) ? (
                      <span className="text-red-600"> *</span>
                    ) : null}
                  </span>
                  <input
                    className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    inputMode={
                      field === "pax"
                        ? "numeric"
                        : field === "bookerContact" || field === "driverContact"
                          ? "tel"
                          : undefined
                    }
                    min={field === "pax" ? 1 : undefined}
                    onChange={(event) => update(field, event.target.value)}
                    placeholder={fieldLabels[field]}
                    type={
                      field === "date"
                        ? "date"
                        : field === "bookerEmail"
                            ? "email"
                          : field === "bookerContact" || field === "driverContact"
                            ? "tel"
                          : field === "pax"
                            ? "number"
                            : "text"
                    }
                    value={booking[field]}
                  />
                </label>
              ))}
            </div>

            <div className="mt-5">
              {pricingPanel}
            </div>

            <div className="mt-5 rounded-md border border-stone-200 bg-stone-50 p-3">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-slate-900">Route Extras & Child Seat</h3>
                <p className="text-sm text-slate-600">Review extra stops and child seat requirements together.</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <label className="sm:col-span-2 lg:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra stop location</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("extraStopLocation", event.target.value)}
                    placeholder="Marina Bay Sands"
                    value={booking.extraStopLocation}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra Stops</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => update("extraStopCount", event.target.value)}
                    placeholder="0"
                    step={1}
                    type="number"
                    value={booking.extraStopCount}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat required</span>
                  <select
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) =>
                      setBooking((current) => ({
                        ...current,
                        childSeatRequired: event.target.value,
                        childSeatCount:
                          event.target.value === "yes"
                            ? current.childSeatCount || "1"
                            : "",
                        childSeatType:
                          event.target.value === "yes"
                            ? current.childSeatType || "customer did not specify"
                            : "",
                      }))
                    }
                    value={booking.childSeatRequired}
                  >
                    <option value="">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat count</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    inputMode="numeric"
                    min={0}
                    onChange={(event) => update("childSeatCount", event.target.value)}
                    placeholder="0"
                    step={1}
                    type="number"
                    value={booking.childSeatCount}
                  />
                </label>
                <label className="sm:col-span-2 lg:col-span-5">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat type / note</span>
                  <select
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("childSeatType", event.target.value)}
                    value={booking.childSeatType}
                  >
                    <option value="">Select type</option>
                    {visibleChildSeatTypeOptions.map((seatType) => (
                      <option key={seatType} value={seatType}>
                        {seatType}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {isDspItinerary ? (
                <div className="mt-3 border-t border-stone-200 pt-3 text-sm text-slate-800">
                  <p className="font-medium text-slate-900">Itinerary preview</p>
                  <div className="mt-2 space-y-1">
                    {itineraryDisplayStops.map((stop, index) => (
                      <div
                        className="grid gap-1 sm:grid-cols-[5rem_1fr]"
                        key={`${stop.time}-${stop.location}-${index}`}
                      >
                        <span className="font-mono text-xs text-slate-600">{stop.time || "Time TBC"}</span>
                        <span>{stop.location}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>

            <div className="mt-5 rounded-md border border-sky-200 bg-sky-50 p-3">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-sky-950">Assigned Driver</h3>
                  <p className="text-sm text-slate-600">Manual assignment with payout control.</p>
                </div>
                <button
                  className="h-9 rounded-md border border-sky-300 bg-white px-3 text-sm font-medium text-sky-900 transition hover:bg-sky-50"
                  onClick={() => loadDrivers()}
                  type="button"
                >
                  Load Drivers
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver</span>
                  <select
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => applyDriverToBooking(event.target.value)}
                    value={assignedDriverSelectValue}
                  >
                    <option value="">Select driver</option>
                    {showSavedAssignedDriverOption ? (
                      <option value={assignedDriverId}>
                        Saved: {clean(booking.driverName) || `Driver ${assignedDriverId}`}
                      </option>
                    ) : null}
                    {drivers.map((driver) => (
                      <option key={driver.id} value={driver.id}>
                        {driver.driver_name} {driver.availability_status ? `(${driver.availability_status})` : ""}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Override Payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) => update("driverPayoutOverride", event.target.value)}
                    placeholder={formatMoney(draftPricing.driverPayout)}
                    type="number"
                    value={booking.driverPayoutOverride}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Override Reason</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverPayoutReason", event.target.value)}
                    placeholder="Tuas / VIP / midnight"
                    value={booking.driverPayoutReason}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Driver Notes</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    onChange={(event) => update("driverNotes", event.target.value)}
                    placeholder="Permit, vehicle, handover notes"
                    value={booking.driverNotes}
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={Boolean(booking.driverIncludePayout)}
                    onChange={(event) => update("driverIncludePayout", event.target.checked ? "yes" : "")}
                    type="checkbox"
                  />
                  Include payout in dispatch
                </label>
              </div>
            </div>

            {shouldShowParserDebugPanel && parsedDebugBooking ? (
              <div className="mt-5 rounded-md border border-slate-200 bg-slate-50 p-3">
                {parsedDebugBooking.parserWarning ? (
                  <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                    {parsedDebugBooking.parserWarning}
                  </div>
                ) : null}
                {parsedDebugPreviewItems.length > 0 ? (
                  <div className="mb-3 grid gap-2">
                    {parsedDebugPreviewItems.map((preview, index) => {
                      const safePreview = preview ?? {};

                      return (
                        <div
                          className="rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-800"
                          key={`${safePreview.flight || safePreview.pickup || "preview"}-${index}`}
                        >
                          <p className="font-semibold">Extracted booking {index + 1}</p>
                          {safePreview.passenger ? <p>Passenger: {safePreview.passenger}</p> : null}
                          {safePreview.type ? <p>Type: {safePreview.type}</p> : null}
                          {safePreview.date || safePreview.time ? (
                            <p>
                              Time: {[safePreview.date, safePreview.time].filter(Boolean).join(" ")}
                            </p>
                          ) : null}
                          {safePreview.flight ? <p>Flight: {safePreview.flight}</p> : null}
                          <p>
                            Route: {safePreview.pickup || "Pickup TBC"} &gt;{" "}
                            {safePreview.dropoff || "Drop-off TBC"}
                          </p>
                          <button
                            className="mt-3 h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                            onClick={() => applyExtractedBooking(safePreview)}
                            type="button"
                          >
                            Use this booking
                          </button>
                        </div>
                      );
                    })}
                  </div>
                ) : parsedDebugBooking.multipleBookingsDetected ? (
                  <div className="mb-3 rounded-md border border-amber-200 bg-white p-3 text-sm text-slate-700">
                    No extracted booking preview available. Split the message and parse one booking at a time.
                  </div>
                ) : null}
                {showParserDebug ? (
                  <div className="mt-3">
                    <p className="mb-2 text-sm font-semibold text-slate-800">Parsed booking state</p>
                    <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs leading-5 text-slate-700">
                      {JSON.stringify(parsedDebugBooking, null, 2)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}

            {parsedDebugBooking ? (
              <div className="mt-5 flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-slate-900">Parser debug</p>
                  <p className="text-xs text-slate-500">Hidden by default for daily operations.</p>
                </div>
                <button
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                  onClick={() => setShowParserDebug((current) => !current)}
                  type="button"
                >
                  {showParserDebug ? "Hide parser debug" : "Show parser debug"}
                </button>
              </div>
            ) : null}

            {hasNeedsReviewWarnings ? (
              <div className="mt-5 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <p className="font-semibold">Needs review before saving</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {needsReviewWarnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
                <label className="mt-3 flex items-start gap-2 text-sm font-medium">
                  <input
                    checked={reviewWarningsAccepted}
                    className="mt-0.5 h-4 w-4 rounded border-amber-400 text-slate-950 focus:ring-slate-900"
                    onChange={(event) =>
                      setAcceptedReviewWarningKey(event.target.checked ? needsReviewAcceptanceKey : "")
                    }
                    type="checkbox"
                  />
                  <span>I reviewed these warnings and still want to save</span>
                </label>
              </div>
            ) : null}

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                className="h-12 rounded-md border border-sky-300 bg-sky-50 px-5 text-base font-semibold text-sky-900 transition hover:bg-sky-100"
                onClick={assignDraftDriver}
                type="button"
              >
                Assign Driver
              </button>
              <button
                className="h-12 rounded-md bg-slate-950 px-5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={saving}
                onClick={saveBooking}
                type="button"
              >
                {saving ? "Saving..." : "Save Booking + CRM"}
              </button>
              <button
                className="h-12 rounded-md border border-slate-300 bg-white px-5 text-base font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={loading}
                onClick={() => loadBookings()}
                type="button"
              >
                {loading ? "Loading..." : "Load Bookings"}
              </button>
            </div>
            {bookingSaveMessage ? (
              <div className={`mt-3 rounded-md border px-4 py-3 text-sm ${statusClass(bookingSaveMessage.tone)}`}>
                {bookingSaveMessage.text}
              </div>
            ) : null}

            {bookings.length > 0 ? (
              <div className="mt-4 rounded-md border border-stone-200 bg-stone-50 p-3">
                <h3 className="text-sm font-semibold text-slate-800">Recent Bookings</h3>
                <div className="mt-3 max-h-80 space-y-2 overflow-auto">
                  {bookings.map((savedBooking) => {
                    const routePoints = getRoutePoints(savedBooking);
                    const pickup = clean(savedBooking.pickup_address) || routePoints[0] || "Pickup";
                    const dropoff =
                      clean(savedBooking.dropoff_address) ||
                      routePoints[routePoints.length - 1] ||
                      "Drop-off";
                    const routeText = routePoints.length >= 2 ? routePoints.join(" > ") : `${pickup} > ${dropoff}`;
                    const createdAt = formatCreatedAt(savedBooking.created_at);

                    return (
                      <article
                        className="rounded-md border border-stone-200 bg-white p-3 text-sm"
                        key={`recent-${savedBooking.id}`}
                      >
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="space-y-1 text-slate-700">
                            <p className="font-semibold text-slate-950">
                              {getBookingCompany(savedBooking)} · {formatPickupDateTime(getBookingDateKey(savedBooking), savedBooking.pickup_time)}
                            </p>
                            <p>
                              {clean(savedBooking.flight_no) ? `Flight ${clean(savedBooking.flight_no)} · ` : ""}
                              Booker: {getBookerName(savedBooking) || "Unknown"} · Name:{" "}
                              {getBookingName(savedBooking) || "Unknown"}
                            </p>
                            <p>{routeText}</p>
                            {createdAt ? <p className="text-xs text-slate-500">Created {createdAt}</p> : null}
                          </div>
                          <button
                            className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
                            onClick={() => loadSelectedBooking(savedBooking)}
                            type="button"
                          >
                            Load this booking
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              </div>
            ) : null}
          </div>

          <aside className="flex flex-col gap-5">
            <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Job Card Preview</h2>
                  <p className="text-sm text-slate-500">WhatsApp-ready driver message.</p>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  {parsedDebugBooking ? (
                    <button
                      className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                      onClick={() => setShowParserDebug((current) => !current)}
                      type="button"
                    >
                      {showParserDebug ? "Hide parser debug" : "Show parser debug"}
                    </button>
                  ) : null}
                  <button
                    className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={copyJobCard}
                    type="button"
                  >
                    Copy
                  </button>
                </div>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-[#dcf8c6] p-4 text-sm leading-6 text-slate-900 shadow-sm">
                {jobCardPreview}
              </pre>
            </div>

            <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Driver Dispatch</h2>
                  <p className="text-sm text-slate-500">Internal WhatsApp copy for assigned driver.</p>
                </div>
                <button
                  className="rounded-md border border-sky-300 px-3 py-2 text-sm font-medium text-sky-900 transition hover:bg-sky-50"
                  onClick={copyDraftDriverDispatch}
                  type="button"
                >
                  Copy
                </button>
              </div>
              <pre className="whitespace-pre-wrap rounded-lg bg-sky-50 p-4 text-sm leading-6 text-slate-900 shadow-sm">
                {draftDriverDispatchCard}
              </pre>
            </div>

            <div className={`rounded-md border px-4 py-3 text-sm ${statusClass(message.tone)}`}>
              {message.text}
            </div>
          </aside>
	        </section>

	        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
	          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
	            <div>
	              <h2 className="text-xl font-semibold">Drivers</h2>
	              <p className="text-sm text-slate-500">Driver profiles, availability, payout rules, and notes.</p>
	            </div>
	            <div className="flex flex-col gap-2 sm:flex-row">
	              <button
	                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
	                onClick={() => loadDrivers()}
	                type="button"
	              >
	                Load Drivers
	              </button>
	              <button
	                className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800"
	                onClick={saveDriverProfile}
	                type="button"
	              >
	                Save Driver
	              </button>
	            </div>
	          </div>

	          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.75fr)]">
	            <div className="grid gap-3 sm:grid-cols-2">
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Driver name</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, driverName: event.target.value }))
	                  }
	                  value={driverProfileDraft.driverName}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Contact number</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, contactNumber: event.target.value }))
	                  }
	                  value={driverProfileDraft.contactNumber}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Vehicle type</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, vehicleType: event.target.value }))
	                  }
	                  value={driverProfileDraft.vehicleType}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Plate number</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, plateNumber: event.target.value }))
	                  }
	                  value={driverProfileDraft.plateNumber}
	                />
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Availability</span>
	                <select
	                  className="h-10 w-full rounded-md border border-stone-300 bg-white px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, availabilityStatus: event.target.value }))
	                  }
	                  value={driverProfileDraft.availabilityStatus}
	                >
	                  <option value="available">Available</option>
	                  <option value="busy">Busy</option>
	                  <option value="off">Off</option>
	                </select>
	              </label>
	              <label>
	                <span className="mb-1 block text-sm font-medium text-slate-700">Preferred areas</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, preferredAreas: event.target.value }))
	                  }
	                  value={driverProfileDraft.preferredAreas}
	                />
	              </label>
	              <label className="sm:col-span-2">
	                <span className="mb-1 block text-sm font-medium text-slate-700">Payout preferences</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, payoutPreferences: event.target.value }))
	                  }
	                  value={driverProfileDraft.payoutPreferences}
	                />
	              </label>
	              <label className="sm:col-span-2">
	                <span className="mb-1 block text-sm font-medium text-slate-700">Airport permit notes</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, airportPermitNotes: event.target.value }))
	                  }
	                  value={driverProfileDraft.airportPermitNotes}
	                />
	              </label>
	              <label className="sm:col-span-2">
	                <span className="mb-1 block text-sm font-medium text-slate-700">Driver notes</span>
	                <input
	                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                  onChange={(event) =>
	                    setDriverProfileDraft((current) => ({ ...current, notes: event.target.value }))
	                  }
	                  value={driverProfileDraft.notes}
	                />
	              </label>
	              {rateBookingTypes.map((bookingType) => {
	                const payoutRule = driverProfileDraft.payoutRules[bookingType];
	                const payoutValue = payoutRule?.amount ?? payoutRule?.max ?? payoutRule?.min ?? "";

	                return (
	                  <label key={`driver-profile-${bookingType}`}>
	                    <span className="mb-1 block text-sm font-medium text-slate-700">
	                      {bookingType} payout
	                    </span>
	                    <input
	                      className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
	                      min={0}
	                      onChange={(event) => updateDriverProfilePayout(bookingType, event.target.value)}
	                      type="number"
	                      value={payoutValue}
	                    />
	                  </label>
	                );
	              })}
	            </div>

	            <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
	              <h3 className="text-base font-semibold">Driver Database</h3>
	              <div className="mt-3 max-h-96 space-y-2 overflow-auto">
	                {drivers.length === 0 ? (
	                  <p className="text-sm text-slate-500">No drivers loaded.</p>
	                ) : (
	                  drivers.map((driver) => (
	                    <button
	                      className="w-full rounded-md border border-stone-200 bg-white p-3 text-left text-sm transition hover:bg-stone-50"
	                      key={driver.id}
	                      onClick={() =>
	                        setDriverProfileDraft({
	                          driverName: clean(driver.driver_name),
	                          contactNumber: clean(driver.contact_number),
	                          vehicleType: clean(driver.vehicle_type),
	                          plateNumber: clean(driver.plate_number),
	                          payoutPreferences: clean(driver.payout_preferences),
	                          availabilityStatus: clean(driver.availability_status) || "available",
	                          notes: clean(driver.notes),
	                          preferredAreas: clean(driver.preferred_areas),
	                          airportPermitNotes: clean(driver.airport_permit_notes),
	                          payoutRules: driver.driver_payout_rules ?? {},
	                        })
	                      }
	                      type="button"
	                    >
	                      <p className="font-semibold">{driver.driver_name}</p>
	                      <p className="text-slate-600">
	                        {[driver.vehicle_type, driver.plate_number, driver.availability_status]
	                          .map(clean)
	                          .filter(Boolean)
	                          .join(" / ")}
	                      </p>
	                      <p className="text-xs text-slate-500">
	                        Assigned jobs:{" "}
	                        {
	                          bookings.filter(
	                            (bookingRecord) =>
	                              bookingRecord.driver_id === driver.id ||
	                              clean(bookingRecord.driver_name).toLowerCase() === clean(driver.driver_name).toLowerCase(),
	                          ).length
	                        }
	                      </p>
	                    </button>
	                  ))
	                )}
	              </div>
	            </div>
	          </div>
	        </section>

	        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Rates</h2>
              <p className="text-sm text-slate-500">Internal customer pricing, driver payouts, and overrides.</p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <button
                className="h-10 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={savingRates}
                onClick={() => loadRates()}
                type="button"
              >
                Load Rates
              </button>
              <button
                className="h-10 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={savingRates}
                onClick={saveDefaultRates}
                type="button"
              >
                Save Defaults
              </button>
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div>
              <h3 className="text-base font-semibold">Default Prestige Rates</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rateBookingTypes.map((bookingType) => (
                  <label key={`customer-${bookingType}`}>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {rateLabels[bookingType]}
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      min={0}
                      onChange={(event) => updateDefaultCustomerRate(bookingType, event.target.value)}
                      type="number"
                      value={rateSettings.customerRates[bookingType]}
                    />
                  </label>
                ))}
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Midnight surcharge</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        midnightSurcharge: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.midnightSurcharge}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra stop surcharge</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        extraStopSurcharge: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.extraStopSurcharge}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat surcharge</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        childSeatCustomerSurcharge: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.childSeatCustomerSurcharge}
                  />
                </label>
              </div>
            </div>

            <div>
              <h3 className="text-base font-semibold">Default Driver Payout</h3>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {rateBookingTypes.map((bookingType) => {
                  const payoutRule = rateSettings.driverPayoutRules[bookingType];
                  const payoutValue = payoutRule.amount ?? payoutRule.max ?? payoutRule.min ?? 0;

                  return (
                    <label key={`driver-${bookingType}`}>
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        {bookingType === "DSP" ? "DSP hourly" : bookingType}
                      </span>
                      <input
                        className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                        min={0}
                        onChange={(event) => updateDefaultDriverPayout(bookingType, event.target.value)}
                        type="number"
                        value={payoutValue}
                      />
                    </label>
                  );
                })}
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Midnight payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        midnightPayout: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.midnightPayout}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Extra stop payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        extraStopPayout: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.extraStopPayout}
                  />
                </label>
                <label>
                  <span className="mb-1 block text-sm font-medium text-slate-700">Child seat payout</span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) =>
                      setRateSettings((current) => ({
                        ...current,
                        childSeatDriverPayout: numericRate(event.target.value),
                      }))
                    }
                    type="number"
                    value={rateSettings.childSeatDriverPayout}
                  />
                </label>
              </div>
            </div>
          </div>

          <div className="mt-6 border-t border-stone-200 pt-5">
            <h3 className="text-base font-semibold">Company / Boss Overrides</h3>
            <div className="mt-3 grid gap-3 lg:grid-cols-4">
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">Company / Account</span>
                <input
                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  onChange={(event) =>
                    setRateOverrideDraft((current) => ({ ...current, companyName: event.target.value }))
                  }
                  placeholder="Tiger Global"
                  value={rateOverrideDraft.companyName}
                />
              </label>
              <label>
                <span className="mb-1 block text-sm font-medium text-slate-700">Boss / Name</span>
                <input
                  className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  onChange={(event) =>
                    setRateOverrideDraft((current) => ({ ...current, bossName: event.target.value }))
                  }
                  placeholder="Su Ling"
                  value={rateOverrideDraft.bossName}
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                <input
                  checked={rateOverrideDraft.transzendExcelPrivacy}
                  onChange={(event) =>
                    setRateOverrideDraft((current) => ({
                      ...current,
                      transzendExcelPrivacy: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Transzend privacy
              </label>
              <button
                className="h-10 self-end rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={savingRates}
                onClick={saveRateOverride}
                type="button"
              >
                Save Override
              </button>
            </div>

            <div className="mt-3 grid gap-3 sm:grid-cols-4">
              {rateBookingTypes.map((bookingType) => (
                <label key={`override-customer-${bookingType}`}>
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    {bookingType} customer
                  </span>
                  <input
                    className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                    min={0}
                    onChange={(event) => updateCompanyOverrideRate(bookingType, event.target.value)}
                    placeholder="-"
                    type="number"
                    value={rateOverrideDraft.customerRates[bookingType] ?? ""}
                  />
                </label>
              ))}
              {rateBookingTypes.map((bookingType) => {
                const payoutRule = rateOverrideDraft.driverPayoutRules[bookingType];
                const payoutValue = payoutRule?.amount ?? payoutRule?.max ?? payoutRule?.min ?? "";

                return (
                  <label key={`override-driver-${bookingType}`}>
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {bookingType} driver
                    </span>
                    <input
                      className="h-10 w-full rounded-md border border-stone-300 px-3 text-sm outline-none transition focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                      min={0}
                      onChange={(event) => updateCompanyOverridePayout(bookingType, event.target.value)}
                      placeholder="-"
                      type="number"
                      value={payoutValue}
                    />
                  </label>
                );
              })}
            </div>

            <div className="mt-5 border-t border-stone-200 pt-5">
              <h3 className="text-base font-semibold">Saved Rate Overrides</h3>
              <div className="mt-3 grid gap-3 lg:grid-cols-2">
                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <h4 className="text-sm font-semibold text-slate-800">Company Overrides</h4>
                  <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                    {!ratesLoaded ? (
                      <p className="text-sm text-slate-500">Load rates to view saved company overrides.</p>
                    ) : companyOverrideRecords.length === 0 ? (
                      <p className="text-sm text-slate-500">No company overrides found.</p>
                    ) : (
                      companyOverrideRecords.map((companyRecord) => {
                        const summary = formatOverrideSummary(
                          companyRecord.customer_rates,
                          companyRecord.driver_payout_rules,
                        );

                        return (
                          <button
                            className="w-full rounded-md border border-stone-200 bg-white p-3 text-left text-sm transition hover:bg-stone-50"
                            key={companyRecord.id}
                            onClick={() =>
                              setRateOverrideDraft({
                                companyName: clean(companyRecord.company_name),
                                bossName: "",
                                customerRates: normalizeCustomerRateRules(companyRecord.customer_rates),
                                driverPayoutRules: normalizeDriverPayoutRules(companyRecord.driver_payout_rules),
                                transzendExcelPrivacy: Boolean(companyRecord.transzend_excel_privacy),
                              })
                            }
                            type="button"
                          >
                            <p className="font-medium">{companyRecord.company_name}</p>
                            <p className="text-xs text-slate-600">{summary.customerText}</p>
                            <p className="text-xs text-slate-600">{summary.driverText}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-stone-200 bg-stone-50 p-3">
                  <h4 className="text-sm font-semibold text-slate-800">Boss / Name Overrides</h4>
                  <div className="mt-2 max-h-56 space-y-2 overflow-auto">
                    {!ratesLoaded ? (
                      <p className="text-sm text-slate-500">Load rates to view saved boss/name overrides.</p>
                    ) : bossOverrideRecords.length === 0 ? (
                      <p className="text-sm text-slate-500">No boss/name overrides found.</p>
                    ) : (
                      bossOverrideRecords.map((travelerRecord) => {
                        const companyRecord = rateCompanies.find(
                          (company) => company.id === travelerRecord.company_id,
                        );
                        const summary = formatOverrideSummary(
                          travelerRecord.customer_rates,
                          travelerRecord.driver_payout_rules,
                        );

                        return (
                          <button
                            className="w-full rounded-md border border-stone-200 bg-white p-3 text-left text-sm transition hover:bg-stone-50"
                            key={travelerRecord.id}
                            onClick={() =>
                              setRateOverrideDraft({
                                companyName: clean(companyRecord?.company_name),
                                bossName: clean(travelerRecord.traveler_name),
                                customerRates: normalizeCustomerRateRules(travelerRecord.customer_rates),
                                driverPayoutRules: normalizeDriverPayoutRules(travelerRecord.driver_payout_rules),
                                transzendExcelPrivacy: Boolean(companyRecord?.transzend_excel_privacy),
                              })
                            }
                            type="button"
                          >
                            <p className="font-medium">{travelerRecord.traveler_name}</p>
                            <p className="text-xs text-slate-500">
                              {clean(companyRecord?.company_name) || "Internal Account"}
                            </p>
                            <p className="text-xs text-slate-600">{summary.customerText}</p>
                            <p className="text-xs text-slate-600">{summary.driverText}</p>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold">Operations Dashboard</h2>
              <p className="text-sm text-slate-500">Today, upcoming jobs, and quick CRM search.</p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row lg:min-w-[520px]">
              <label className="flex-1">
                <span className="sr-only">Search bookings</span>
                <input
                  className="h-11 w-full rounded-md border border-stone-300 bg-white px-3 text-base outline-none transition placeholder:text-slate-400 focus:border-slate-900 focus:ring-2 focus:ring-slate-900/10"
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search name, company, or flight"
                  type="search"
                  value={searchTerm}
                />
              </label>
              <button
                className="h-11 rounded-md border border-slate-300 px-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                disabled={loading}
                onClick={() => loadBookings()}
                type="button"
              >
                Refresh
              </button>
            </div>
          </div>

          <div className="grid gap-3 border-y border-stone-200 py-4 text-center sm:grid-cols-3">
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Today</p>
              <p className="text-2xl font-semibold">{todayBookings.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Upcoming</p>
              <p className="text-2xl font-semibold">{upcomingBookings.length}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-slate-500">Matching</p>
              <p className="text-2xl font-semibold">{dashboardBookings.length}</p>
            </div>
          </div>

          <div className="mt-5 space-y-6">
            <div>
              <h3 className="mb-3 text-base font-semibold">Today Bookings</h3>
              {renderBookingCards(todayBookings, "No bookings for today.")}
            </div>

            <div>
              <h3 className="mb-3 text-base font-semibold">Upcoming Bookings</h3>
              {renderBookingCards(upcomingBookings, "No upcoming bookings.")}
            </div>

            {otherBookings.length > 0 ? (
              <div>
                <h3 className="mb-3 text-base font-semibold">Earlier Bookings</h3>
                {renderBookingCards(otherBookings, "No earlier bookings.")}
              </div>
            ) : null}
          </div>
        </section>
      </div>
    </main>
  );
}
