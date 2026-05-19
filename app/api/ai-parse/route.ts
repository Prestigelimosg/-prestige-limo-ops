import { sanitizeAiParseResult } from "../../../lib/ai-parser-schema";

const emptyMessageError = "Paste a booking message before using AI Assist Parse.";
const mockRouteMessage = "AI parser API route is ready but not connected to OpenAI yet.";
const liveModeDisabledError = "Live AI parsing is not enabled yet. Use AI_PARSE_MODE=mock.";
const invalidModeError = "Invalid AI_PARSE_MODE. Use mock.";

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function readJsonBody(request: Request) {
  try {
    return asRecord(await request.json());
  } catch {
    return {};
  }
}

function buildMockAiParseResult(message: string) {
  const messageLength = message.length;

  return sanitizeAiParseResult({
    multipleBookingsDetected: false,
    bookings: [
      {
        bookingType: "",
        companyAccount: "",
        bookerName: "",
        bookerEmail: "",
        bookerContact: "",
        passengerName: "",
        pax: "",
        vehicle: "",
        pickupDate: "",
        pickupTime: "",
        flightNumber: "",
        pickup: "",
        dropoff: "",
        extraStopLocation: "",
        extraStops: "",
        customerPriceOverride: "",
        notes: `Mock AI parser API skeleton response from ${messageLength} pasted characters. No AI request was made.`,
        confidence: 0.1,
        needsReviewReasons: ["Mock response only — review required"],
      },
    ],
    rawWarnings: [mockRouteMessage],
  });
}

function buildEmptyAiParseResult(warning: string) {
  return sanitizeAiParseResult({
    multipleBookingsDetected: false,
    bookings: [],
    rawWarnings: [warning],
  });
}

function currentAiParseMode() {
  return (process.env.AI_PARSE_MODE || "mock").trim();
}

export async function POST(request: Request) {
  const body = await readJsonBody(request);
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json(
      {
        ok: false,
        error: emptyMessageError,
      },
      { status: 400 },
    );
  }

  const mode = currentAiParseMode();

  if (mode === "live") {
    return Response.json(
      {
        ok: false,
        mode: "live",
        error: liveModeDisabledError,
        result: buildEmptyAiParseResult(liveModeDisabledError),
      },
      { status: 503 },
    );
  }

  if (mode !== "mock") {
    return Response.json(
      {
        ok: false,
        mode,
        error: invalidModeError,
        result: buildEmptyAiParseResult(invalidModeError),
      },
      { status: 400 },
    );
  }

  return Response.json({
    ok: true,
    mode: "mock",
    message: mockRouteMessage,
    result: buildMockAiParseResult(message),
  });
}
