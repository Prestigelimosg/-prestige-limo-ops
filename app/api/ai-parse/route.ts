import { sanitizeAiParseResult } from "../../../lib/ai-parser-schema";

const emptyMessageError = "Paste a booking message before using AI Assist Parse.";
const mockRouteMessage = "AI parser API route is ready but not connected to OpenAI yet.";

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

  return Response.json({
    ok: true,
    mode: "mock",
    message: mockRouteMessage,
    result: buildMockAiParseResult(message),
  });
}
