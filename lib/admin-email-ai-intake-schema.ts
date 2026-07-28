import {
  aiParseJsonSchema,
  sanitizeAiParseResult,
  type AiParseResult,
} from "./ai-parser-schema";
import {
  adminEmailAiClassifications,
  type AdminEmailAiClassification,
} from "./admin-email-ai-intake-contract";

export type AdminEmailAiAnalysis = {
  bookingResult: AiParseResult;
  classification: AdminEmailAiClassification;
  confidence: number;
  reviewReasons: string[];
  suggestedReply: string;
  summary: string;
};

export const adminEmailAiAnalysisJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "classification",
    "confidence",
    "summary",
    "suggestedReply",
    "reviewReasons",
    "bookingResult",
  ],
  properties: {
    classification: {
      type: "string",
      enum: adminEmailAiClassifications,
    },
    confidence: {
      type: "number",
      minimum: 0,
      maximum: 1,
    },
    summary: {
      type: "string",
    },
    suggestedReply: {
      type: "string",
    },
    reviewReasons: {
      type: "array",
      items: {
        type: "string",
      },
    },
    bookingResult: aiParseJsonSchema,
  },
} as const;

function cleanText(value: unknown, maximumLength: number) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim().slice(0, maximumLength)
    : "";
}

function cleanMultilineText(value: unknown, maximumLength: number) {
  return typeof value === "string" || typeof value === "number"
    ? String(value)
        .replace(/\r\n?/g, "\n")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
        .slice(0, maximumLength)
    : "";
}

function sanitizeAdminEmailAiBookerName(
  value: string,
  needsReviewReasons: string[],
) {
  const cleanedValue = cleanText(value, 240);

  if (!cleanedValue) {
    return "";
  }

  const contaminationPatterns = [
    /\s*(?:[,;|]\s*)?(?=\+?\d[\d\s().-]{6,})/,
    /\s*(?:[,;|]\s*)?(?=[^\s@]+@[^\s@]+\.[^\s@]+)/i,
    /\s*(?:[.,;|:-]\s*)?(?=\b(?:client\s+details?(?:\s+list)?|passenger\s+(?:details?|list)|booking\s+(?:details?|reference)|(?:pax|phone|mobile|whatsapp|contact|email|pickup|drop-?off)\s*:))/i,
  ];
  const contaminationStarts = contaminationPatterns
    .map((pattern) => cleanedValue.search(pattern))
    .filter((index) => index >= 0);
  const contaminationStart =
    contaminationStarts.length > 0
      ? Math.min(...contaminationStarts)
      : -1;
  const candidate = cleanText(
    contaminationStart >= 0
      ? cleanedValue.slice(0, contaminationStart)
      : cleanedValue,
    160,
  ).replace(/[\s,;|:-]+$/g, "");
  const sanitized =
    /@|\d{6,}/.test(candidate) || candidate.length > 120
      ? ""
      : candidate;

  if (sanitized !== cleanedValue) {
    const reason =
      "Removed contact or list text from Email AI booker name";

    if (!needsReviewReasons.includes(reason)) {
      needsReviewReasons.push(reason);
    }
  }

  return sanitized;
}

function sanitizeAdminEmailAiBookingResult(value: unknown): AiParseResult {
  const bookingResult = sanitizeAiParseResult(value);

  return {
    ...bookingResult,
    bookings: bookingResult.bookings.map((booking) => {
      const needsReviewReasons = [...booking.needsReviewReasons];

      return {
        ...booking,
        bookerName: sanitizeAdminEmailAiBookerName(
          booking.bookerName,
          needsReviewReasons,
        ),
        needsReviewReasons,
      };
    }),
  };
}

export function sanitizeAdminEmailAiAnalysis(
  value: unknown,
): AdminEmailAiAnalysis {
  const record =
    value !== null && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  const classification = adminEmailAiClassifications.includes(
    record.classification as AdminEmailAiClassification,
  )
    ? (record.classification as AdminEmailAiClassification)
    : "uncertain";
  const numericConfidence = Number(record.confidence);
  const confidence = Number.isFinite(numericConfidence)
    ? Math.min(1, Math.max(0, numericConfidence))
    : 0;
  const reviewReasons = Array.isArray(record.reviewReasons)
    ? record.reviewReasons
        .map((reason) => cleanText(reason, 240))
        .filter(Boolean)
        .slice(0, 12)
    : [];

  return {
    bookingResult: sanitizeAdminEmailAiBookingResult(record.bookingResult),
    classification,
    confidence,
    reviewReasons,
    suggestedReply: cleanMultilineText(record.suggestedReply, 4_000),
    summary:
      cleanText(record.summary, 1_000) ||
      "Email requires admin review.",
  };
}

export function adminEmailAiCanonicalBookingText(
  analysis: AdminEmailAiAnalysis,
) {
  return analysis.bookingResult.bookings
    .map((booking, index) => {
      const rows = [
        analysis.bookingResult.bookings.length > 1
          ? `Booking ${index + 1}`
          : "",
        `Booking type: ${booking.bookingType}`,
        `Company/account: ${booking.companyAccount}`,
        `Booker: ${booking.bookerName}`,
        `Booker email: ${booking.bookerEmail}`,
        `Contact: ${booking.bookerContact}`,
        `Passenger: ${booking.passengerName}`,
        `Pax: ${booking.pax}`,
        `Vehicle: ${booking.vehicle}`,
        `Pickup date: ${booking.pickupDate}`,
        `Pickup time: ${booking.pickupTime}`,
        `Flight: ${booking.flightNumber}`,
        `Pickup: ${booking.pickup}`,
        `Drop-off: ${booking.dropoff}`,
        `Extra stop: ${booking.extraStopLocation}`,
        `Extra stops: ${booking.extraStops}`,
        `Customer price: ${booking.customerPriceOverride}`,
        `Notes: ${booking.notes}`,
      ];

      return rows.filter((row) => !row.endsWith(": ")).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
}
