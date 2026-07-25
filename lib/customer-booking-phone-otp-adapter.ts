export const customerBookingPhoneOtpApiPath =
  "/api/customer-booking-phone-verification";

export type CustomerBookingPhoneOtpClientReason =
  | "challenge_expired"
  | "challenge_invalid"
  | "code_invalid"
  | "configuration_unavailable"
  | "phone_invalid"
  | "provider_unavailable"
  | "rate_limited"
  | "request_blocked"
  | "verification_failed";

type CustomerBookingPhoneOtpFetch = typeof fetch;
type UnknownRecord = Record<string, unknown>;

export type CustomerBookingPhoneOtpStartClientResult =
  | {
      challengeId: string;
      expiresInSeconds: number;
      ok: true;
      retryAfterSeconds: number;
    }
  | {
      ok: false;
      reason: CustomerBookingPhoneOtpClientReason | "unknown";
      retryAfterSeconds: number | null;
    };

export type CustomerBookingPhoneOtpCheckClientResult =
  | {
      expiresInSeconds: number;
      ok: true;
      proof: string;
    }
  | {
      ok: false;
      reason: CustomerBookingPhoneOtpClientReason | "unknown";
      retryAfterSeconds: number | null;
    };

const allowedReasons = new Set<CustomerBookingPhoneOtpClientReason>([
  "challenge_expired",
  "challenge_invalid",
  "code_invalid",
  "configuration_unavailable",
  "phone_invalid",
  "provider_unavailable",
  "rate_limited",
  "request_blocked",
  "verification_failed",
]);
const challengePattern = /^[a-f0-9]{32}$/;
const proofPattern =
  /^customer_booking_phone_otp_proof_v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function positiveInteger(value: unknown, fallback: number | null) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 86_400
    ? value
    : fallback;
}

function safeReason(value: unknown) {
  return typeof value === "string" &&
    allowedReasons.has(value as CustomerBookingPhoneOtpClientReason)
    ? (value as CustomerBookingPhoneOtpClientReason)
    : "unknown";
}

async function readResponse(response: Response) {
  try {
    return asRecord(await response.json());
  } catch {
    return null;
  }
}

async function postPhoneOtp(
  body: UnknownRecord,
  {
    fetcher,
    signal,
  }: {
    fetcher: CustomerBookingPhoneOtpFetch;
    signal?: AbortSignal;
  },
) {
  return fetcher(customerBookingPhoneOtpApiPath, {
    body: JSON.stringify(body),
    cache: "no-store",
    credentials: "same-origin",
    headers: {
      "Content-Type": "application/json",
      "x-prestige-customer-purpose":
        "customer-booking-phone-verification",
    },
    method: "POST",
    signal,
  });
}

export async function startCustomerBookingPhoneOtpVerification(
  phone: string,
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: CustomerBookingPhoneOtpFetch;
    signal?: AbortSignal;
  } = {},
): Promise<CustomerBookingPhoneOtpStartClientResult> {
  try {
    const response = await postPhoneOtp(
      { action: "start", phone },
      { fetcher, signal },
    );
    const payload = await readResponse(response);

    if (!response.ok || !payload || payload.ok !== true) {
      return {
        ok: false,
        reason: safeReason(payload?.reason),
        retryAfterSeconds: positiveInteger(
          payload?.retry_after_seconds,
          positiveInteger(Number(response.headers.get("Retry-After")), null),
        ),
      };
    }

    const challengeId =
      typeof payload.challenge_id === "string" &&
      challengePattern.test(payload.challenge_id)
        ? payload.challenge_id
        : "";
    const expiresInSeconds = positiveInteger(
      payload.expires_in_seconds,
      null,
    );
    const retryAfterSeconds = positiveInteger(
      payload.retry_after_seconds,
      null,
    );

    if (!challengeId || !expiresInSeconds || !retryAfterSeconds) {
      return { ok: false, reason: "unknown", retryAfterSeconds: null };
    }

    return {
      challengeId,
      expiresInSeconds,
      ok: true,
      retryAfterSeconds,
    };
  } catch {
    return { ok: false, reason: "unknown", retryAfterSeconds: null };
  }
}

export async function checkCustomerBookingPhoneOtpVerification(
  {
    challengeId,
    code,
    phone,
  }: {
    challengeId: string;
    code: string;
    phone: string;
  },
  {
    fetcher = fetch,
    signal,
  }: {
    fetcher?: CustomerBookingPhoneOtpFetch;
    signal?: AbortSignal;
  } = {},
): Promise<CustomerBookingPhoneOtpCheckClientResult> {
  try {
    const response = await postPhoneOtp(
      { action: "check", challengeId, code, phone },
      { fetcher, signal },
    );
    const payload = await readResponse(response);

    if (!response.ok || !payload || payload.ok !== true) {
      return {
        ok: false,
        reason: safeReason(payload?.reason),
        retryAfterSeconds: positiveInteger(
          payload?.retry_after_seconds,
          positiveInteger(Number(response.headers.get("Retry-After")), null),
        ),
      };
    }

    const proof =
      typeof payload.proof === "string" && proofPattern.test(payload.proof)
        ? payload.proof
        : "";
    const expiresInSeconds = positiveInteger(
      payload.expires_in_seconds,
      null,
    );

    if (!proof || !expiresInSeconds) {
      return { ok: false, reason: "unknown", retryAfterSeconds: null };
    }

    return {
      expiresInSeconds,
      ok: true,
      proof,
    };
  } catch {
    return { ok: false, reason: "unknown", retryAfterSeconds: null };
  }
}
