import {
  checkCustomerBookingPhoneOtp,
  startCustomerBookingPhoneOtp,
  type CustomerBookingPhoneOtpFailureReason,
} from "../../../lib/customer-booking-phone-otp";

export const dynamic = "force-dynamic";

const customerBookingPhoneOtpPurpose =
  "customer-booking-phone-verification";
const allowedStartFields = new Set(["action", "phone"]);
const allowedCheckFields = new Set(["action", "challengeId", "code", "phone"]);

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function isCustomerBookingPhoneOtpRequest(request: Request) {
  const requestUrl = new URL(request.url);
  const origin = request.headers.get("origin");
  const referer = request.headers.get("referer");
  const purpose = request.headers.get("x-prestige-customer-purpose");

  if (purpose !== customerBookingPhoneOtpPurpose) {
    return false;
  }

  if (origin && origin !== requestUrl.origin) {
    return false;
  }

  if (!referer) {
    return false;
  }

  try {
    const refererUrl = new URL(referer);

    return (
      refererUrl.origin === requestUrl.origin &&
      refererUrl.pathname === "/book"
    );
  } catch {
    return false;
  }
}

async function readJsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

function hasOnlyAllowedFields(
  record: UnknownRecord,
  allowedFields: Set<string>,
) {
  return Object.keys(record).every((key) => allowedFields.has(key));
}

function blockedResponse() {
  return Response.json(
    {
      ok: false,
      error:
        "Phone verification is available only from the customer booking form.",
    },
    {
      headers: { "Cache-Control": "no-store" },
      status: 403,
    },
  );
}

function safeErrorMessage(reason: CustomerBookingPhoneOtpFailureReason) {
  switch (reason) {
    case "phone_invalid":
      return "Enter a valid supported mobile number.";
    case "code_invalid":
      return "The verification code is incorrect.";
    case "challenge_expired":
      return "The verification code expired. Request a new code.";
    case "rate_limited":
      return "Too many verification requests. Please wait before trying again.";
    case "configuration_unavailable":
      return "Phone verification is not available right now.";
    case "provider_unavailable":
    case "verification_failed":
      return "Phone verification could not be completed right now.";
    default:
      return "Phone verification request was rejected safely.";
  }
}

function failureResponse(result: {
  error: CustomerBookingPhoneOtpFailureReason;
  retryAfterSeconds?: number;
  status: number;
}) {
  const headers = new Headers({ "Cache-Control": "no-store" });

  if (
    result.status === 429 &&
    typeof result.retryAfterSeconds === "number"
  ) {
    headers.set("Retry-After", String(result.retryAfterSeconds));
  }

  return Response.json(
    {
      ok: false,
      reason: result.error,
      retry_after_seconds: result.retryAfterSeconds || null,
      error: safeErrorMessage(result.error),
    },
    {
      headers,
      status: result.status,
    },
  );
}

function requestIp(request: Request) {
  return (
    request.headers.get("x-forwarded-for") ||
    request.headers.get("x-real-ip") ||
    ""
  );
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
  if (!isCustomerBookingPhoneOtpRequest(request)) {
    return blockedResponse();
  }

  const body = asRecord(await readJsonBody(request));

  if (!body || (body.action !== "start" && body.action !== "check")) {
    return blockedResponse();
  }

  if (body.action === "start") {
    if (!hasOnlyAllowedFields(body, allowedStartFields)) {
      return blockedResponse();
    }

    const result = await startCustomerBookingPhoneOtp({
      phone: body.phone,
      requestIp: requestIp(request),
    });

    if (!result.ok) {
      return failureResponse(result);
    }

    return Response.json(
      {
        challenge_id: result.challengeId,
        expires_in_seconds: result.expiresInSeconds,
        ok: true,
        retry_after_seconds: result.retryAfterSeconds,
      },
      {
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  if (!hasOnlyAllowedFields(body, allowedCheckFields)) {
    return blockedResponse();
  }

  const result = await checkCustomerBookingPhoneOtp({
    challengeId: body.challengeId,
    code: body.code,
    phone: body.phone,
  });

  if (!result.ok) {
    return failureResponse(result);
  }

  return Response.json(
    {
      expires_in_seconds: result.expiresInSeconds,
      ok: true,
      proof: result.proof,
    },
    {
      headers: { "Cache-Control": "no-store" },
    },
  );
}
