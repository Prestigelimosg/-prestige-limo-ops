import {
  adminAiAssistantPurpose,
  requestAdminAiBookingParse,
} from "../../../lib/admin-ai-runtime";
import { resolveAdminDispatcherBoundary } from "../../../lib/admin-dispatcher-auth-boundary";
import { sanitizeAiParseResult } from "../../../lib/ai-parser-schema";

const emptyMessageError = "Paste a booking message before using AI Parse Booking.";
const mockRouteMessage = "AI parser remains in local mock mode. No OpenAI request was made.";
const invalidModeError = "Invalid AI_PARSE_MODE. Use mock or live.";

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
        notes: `Mock AI parser response from ${messageLength} pasted characters. No AI request was made.`,
        confidence: 0.1,
        needsReviewReasons: ["Mock response only — review required"],
      },
    ],
    rawWarnings: [mockRouteMessage],
  });
}

function currentAiParseMode() {
  return (process.env.AI_PARSE_MODE || "mock").trim();
}

function blockedResponse(error: string) {
  return Response.json(
    {
      error,
      external_send: false,
      ok: false,
      write_action: false,
    },
    { status: 403 },
  );
}

export async function POST(request: Request) {
  const boundary = resolveAdminDispatcherBoundary(request, adminAiAssistantPurpose, {
    allowServerSessionRoleMethodsWithoutRequestToken: ["POST"],
  });

  if (!boundary.ok) {
    return blockedResponse(boundary.error);
  }

  const body = await readJsonBody(request);
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!message) {
    return Response.json(
      {
        error: emptyMessageError,
        external_send: false,
        ok: false,
        write_action: false,
      },
      { status: 400 },
    );
  }

  const mode = currentAiParseMode();

  if (mode === "mock") {
    return Response.json({
      external_send: false,
      message: mockRouteMessage,
      mode: "mock",
      ok: true,
      result: buildMockAiParseResult(message),
      write_action: false,
    });
  }

  if (mode !== "live") {
    return Response.json(
      {
        error: invalidModeError,
        external_send: false,
        mode,
        ok: false,
        write_action: false,
      },
      { status: 400 },
    );
  }

  const result = await requestAdminAiBookingParse(message);

  if (!result.ok) {
    return Response.json(
      {
        error: result.error,
        external_send: false,
        mode: "live",
        ok: false,
        write_action: false,
      },
      { status: result.status },
    );
  }

  return Response.json({
    external_send: false,
    mode: "live",
    model: result.model,
    ok: true,
    result: result.data.result,
    usage: result.usage,
    write_action: false,
  });
}
