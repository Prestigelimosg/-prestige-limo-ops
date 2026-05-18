export const allowedAiBookingTypes = ["MNG", "DEP", "TRF", "DSP"] as const;

export type AiBookingType = (typeof allowedAiBookingTypes)[number];

export type AiParsedBooking = {
  bookingType: AiBookingType | "";
  companyAccount: string;
  bookerName: string;
  bookerEmail: string;
  bookerContact: string;
  passengerName: string;
  pax: string;
  vehicle: string;
  pickupDate: string;
  pickupTime: string;
  flightNumber: string;
  pickup: string;
  dropoff: string;
  extraStopLocation: string;
  extraStops: string;
  customerPriceOverride: string;
  notes: string;
  confidence: number;
  needsReviewReasons: string[];
};

export type AiParseResult = {
  multipleBookingsDetected: boolean;
  bookings: AiParsedBooking[];
  rawWarnings: string[];
};

const publicEmailDomains = new Set([
  "126.com",
  "163.com",
  "aol.com",
  "daum.net",
  "fastmail.com",
  "gmail.com",
  "gmx.com",
  "gmx.net",
  "googlemail.com",
  "hanmail.net",
  "hey.com",
  "hotmail.com",
  "icloud.com",
  "kakao.com",
  "live.com",
  "mac.com",
  "mail.com",
  "me.com",
  "msn.com",
  "naver.com",
  "outlook.com",
  "pm.me",
  "proton.me",
  "protonmail.com",
  "qq.com",
  "rediffmail.com",
  "rocketmail.com",
  "sina.com",
  "tutanota.com",
  "tutamail.com",
  "yahoo.com",
  "yahoo.com.sg",
  "yandex.com",
  "yandex.ru",
  "ymail.com",
  "zoho.com",
]);
const internalPrestigeEmailDomains = new Set([
  "prestige-limo.sg",
  "prestigelimo.sg",
  "prestigetransport.sg",
]);
const ownCompanyNames = new Set(["prestige transport"]);
const countryCodeSecondLevelDomains = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);
const allowedAiBookingTypeSet = new Set<string>(allowedAiBookingTypes);
const aiStringFields = [
  "bookerName",
  "bookerEmail",
  "bookerContact",
  "passengerName",
  "pax",
  "vehicle",
  "pickupDate",
  "pickupTime",
  "pickup",
  "dropoff",
  "extraStopLocation",
  "extraStops",
  "customerPriceOverride",
  "notes",
] as const;

function clean(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => clean(item)).filter(Boolean)
    : [];
}

function normalizedDomain(value: string) {
  const cleanedValue = clean(value).toLowerCase();
  const emailDomain = cleanedValue.includes("@") ? cleanedValue.split("@")[1] || "" : cleanedValue;
  const domainMatch = emailDomain.match(/\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/);

  return domainMatch?.[0]?.replace(/^www\./, "") || "";
}

function isIgnoredAccountEmailDomain(value: string) {
  return publicEmailDomains.has(value) || internalPrestigeEmailDomains.has(value);
}

function accountFromDomain(value: string) {
  const domain = normalizedDomain(value);

  if (!domain || isIgnoredAccountEmailDomain(domain)) {
    return "";
  }

  const domainParts = domain.split(".").filter(Boolean);
  const suffix = domainParts[domainParts.length - 1] || "";
  const secondLevel = domainParts[domainParts.length - 2] || "";
  const organization =
    domainParts.length >= 3 && suffix.length === 2 && countryCodeSecondLevelDomains.has(secondLevel)
      ? domainParts[domainParts.length - 3]
      : domainParts.length > 1 ? secondLevel : domainParts[0];

  return organization ? organization.toUpperCase() : "";
}

function sanitizeCompanyAccount(value: unknown, needsReviewReasons: string[]) {
  const company = clean(value).replace(/[|,;.]+$/g, "");
  const domain = normalizedDomain(company);

  if (!company) {
    return "";
  }

  if (ownCompanyNames.has(company.toLowerCase())) {
    needsReviewReasons.push("Ignored internal Prestige company as company/account");
    return "";
  }

  if (domain) {
    if (isIgnoredAccountEmailDomain(domain)) {
      needsReviewReasons.push("Ignored public or internal email domain as company/account");
      return "";
    }

    if (company.toLowerCase() === domain || company.includes("@")) {
      return accountFromDomain(company);
    }
  }

  return company;
}

function sanitizeBookingType(value: unknown, needsReviewReasons: string[]) {
  const bookingType = clean(value).toUpperCase();

  if (!bookingType) {
    return "";
  }

  if (allowedAiBookingTypeSet.has(bookingType)) {
    return bookingType as AiBookingType;
  }

  needsReviewReasons.push("Invalid booking type from AI output");
  return "";
}

function sanitizeFlightNumber(value: unknown, needsReviewReasons: string[]) {
  const flightNumber = clean(value).toUpperCase().replace(/\s+/g, "");

  if (!flightNumber) {
    return "";
  }

  if (/^[A-Z]{2}\d{1,4}$/.test(flightNumber)) {
    return flightNumber;
  }

  needsReviewReasons.push("Invalid or non-commercial flight number from AI output");
  return "";
}

function sanitizeConfidence(value: unknown, needsReviewReasons: string[]) {
  const numericValue = typeof value === "number" ? value : Number(clean(value));

  if (!Number.isFinite(numericValue)) {
    needsReviewReasons.push("Missing AI confidence score");
    return 0;
  }

  return Math.max(0, Math.min(1, numericValue));
}

function sanitizeAiParsedBooking(value: unknown): AiParsedBooking {
  const input = asRecord(value);
  const needsReviewReasons = stringArray(input.needsReviewReasons);
  const booking: AiParsedBooking = {
    bookingType: sanitizeBookingType(input.bookingType, needsReviewReasons),
    companyAccount: sanitizeCompanyAccount(input.companyAccount, needsReviewReasons),
    bookerName: "",
    bookerEmail: "",
    bookerContact: "",
    passengerName: "",
    pax: "",
    vehicle: "",
    pickupDate: "",
    pickupTime: "",
    flightNumber: sanitizeFlightNumber(input.flightNumber, needsReviewReasons),
    pickup: "",
    dropoff: "",
    extraStopLocation: "",
    extraStops: "",
    customerPriceOverride: "",
    notes: "",
    confidence: sanitizeConfidence(input.confidence, needsReviewReasons),
    needsReviewReasons,
  };

  for (const field of aiStringFields) {
    booking[field] = clean(input[field]);
  }

  return booking;
}

export function sanitizeAiParseResult(value: unknown): AiParseResult {
  const input = asRecord(value);
  const bookingsInput = Array.isArray(input.bookings) ? input.bookings : [];
  const bookings = bookingsInput.map(sanitizeAiParsedBooking);

  return {
    multipleBookingsDetected:
      typeof input.multipleBookingsDetected === "boolean"
        ? input.multipleBookingsDetected
        : bookings.length > 1,
    bookings,
    rawWarnings: stringArray(input.rawWarnings),
  };
}
