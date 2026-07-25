import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const customerBookingPhoneOtpVersion = "customer-booking-phone-otp-v1";
export const customerBookingPhoneOtpProofVersion =
  "customer-booking-phone-otp-proof-v1";

const customerBookingPhoneOtpTable = "customer_booking_phone_otp_challenges";
const customerBookingPhoneOtpReserveSendRpc =
  "reserve_customer_booking_phone_otp_send";
const customerBookingPhoneOtpReserveCheckRpc =
  "reserve_customer_booking_phone_otp_check";
const customerBookingPhoneOtpProofPrefix =
  "customer_booking_phone_otp_proof_v1";
const customerBookingPhoneOtpChallengePattern = /^[a-f0-9]{32}$/;
const customerBookingPhoneOtpHashPattern = /^[a-f0-9]{64}$/;
const twilioVerifyServiceSidPattern = /^VA[a-f0-9]{32}$/i;
const twilioApiKeySidPattern = /^SK[a-f0-9]{32}$/i;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const otpCodePattern = /^\d{6}$/;
const proofMaxAgeSeconds = 10 * 60;
const providerTimeoutMs = 10_000;

type UnknownRecord = Record<string, unknown>;

type CustomerBookingPhoneOtpProofPayload = {
  challenge_id: string;
  exp: number;
  iat: number;
  phone_hash: string;
  type: typeof customerBookingPhoneOtpProofVersion;
};

type CustomerBookingPhoneOtpConfig = {
  allowedCountryCodes: string[];
  apiKeySecret: string;
  apiKeySid: string;
  proofSecret: string;
  serviceSid: string;
  supabaseServiceRoleKey: string;
  supabaseUrl: string;
};

type CustomerBookingPhoneOtpReservationRow = {
  allowed?: unknown;
  reason?: unknown;
  retry_after_seconds?: unknown;
  verification_attempts?: unknown;
};

export type CustomerBookingPhoneOtpFailureReason =
  | "challenge_expired"
  | "challenge_invalid"
  | "code_invalid"
  | "configuration_unavailable"
  | "phone_invalid"
  | "provider_unavailable"
  | "rate_limited"
  | "request_blocked"
  | "verification_failed";

export type CustomerBookingPhoneOtpStartResult =
  | {
      challengeId: string;
      expiresInSeconds: number;
      ok: true;
      retryAfterSeconds: number;
    }
  | {
      error: CustomerBookingPhoneOtpFailureReason;
      ok: false;
      retryAfterSeconds?: number;
      status: 400 | 403 | 429 | 502 | 503;
    };

export type CustomerBookingPhoneOtpCheckResult =
  | {
      expiresInSeconds: number;
      ok: true;
      proof: string;
    }
  | {
      error: CustomerBookingPhoneOtpFailureReason;
      ok: false;
      retryAfterSeconds?: number;
      status: 400 | 403 | 429 | 502 | 503;
    };

export type VerifiedCustomerBookingPhoneOtpProof = {
  booking_reference: string;
  challenge_id: string;
  expires_at: number;
  phone_hash: string;
};

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function configValue(value: string | undefined) {
  const cleaned = value?.trim() || "";
  const normalized = cleaned.toLowerCase();

  if (
    !cleaned ||
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("next_public") ||
    normalized.includes("<") ||
    normalized.includes(">")
  ) {
    return null;
  }

  return cleaned;
}

function configuredAllowedCountryCodes() {
  const configured =
    process.env.PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_ALLOWED_COUNTRY_CODES
      ?.split(",")
      .map((value) => value.trim())
      .filter((value) => /^\+\d{1,3}$/.test(value)) || [];
  const values = configured.length > 0 ? configured : ["+65"];

  return [...new Set(values)].sort((left, right) => right.length - left.length);
}

function configuredCustomerBookingPhoneOtp() {
  if (process.env.PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_ENABLED !== "true") {
    return null;
  }

  const serviceSid = configValue(
    process.env.PRESTIGE_TWILIO_VERIFY_SERVICE_SID,
  );
  const apiKeySid = configValue(
    process.env.PRESTIGE_TWILIO_VERIFY_API_KEY_SID,
  );
  const apiKeySecret = configValue(
    process.env.PRESTIGE_TWILIO_VERIFY_API_KEY_SECRET,
  );
  const proofSecret = configValue(
    process.env.PRESTIGE_CUSTOMER_BOOKING_PHONE_OTP_SECRET,
  );
  const supabaseUrl = configValue(process.env.SUPABASE_URL);
  const supabaseServiceRoleKey = configValue(
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );

  if (
    !serviceSid ||
    !twilioVerifyServiceSidPattern.test(serviceSid) ||
    !apiKeySid ||
    !twilioApiKeySidPattern.test(apiKeySid) ||
    !apiKeySecret ||
    apiKeySecret.length < 20 ||
    !proofSecret ||
    proofSecret.length < 32 ||
    !supabaseUrl ||
    !/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl) ||
    !supabaseServiceRoleKey ||
    supabaseServiceRoleKey.length < 32
  ) {
    return null;
  }

  return {
    allowedCountryCodes: configuredAllowedCountryCodes(),
    apiKeySecret,
    apiKeySid,
    proofSecret,
    serviceSid,
    supabaseServiceRoleKey,
    supabaseUrl,
  } satisfies CustomerBookingPhoneOtpConfig;
}

function createServerOnlySupabaseClient(config: CustomerBookingPhoneOtpConfig) {
  try {
    return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: {
        persistSession: false,
      },
    });
  } catch {
    return null;
  }
}

export function normalizeCustomerBookingPhoneOtpNumber(
  value: unknown,
  allowedCountryCodes = configuredAllowedCountryCodes(),
) {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.trim().replace(/[\s().-]+/g, "");

  if (/^[89]\d{7}$/.test(normalized) && allowedCountryCodes.includes("+65")) {
    normalized = `+65${normalized}`;
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
    return null;
  }

  const countryCode =
    allowedCountryCodes.find((candidate) => normalized.startsWith(candidate)) ||
    null;

  if (!countryCode) {
    return null;
  }

  const subscriber = normalized.slice(countryCode.length);

  if (countryCode === "+65" && !/^[89]\d{7}$/.test(subscriber)) {
    return null;
  }

  return normalized;
}

export function normalizeCustomerBookingPhoneOtpRequestIp(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const candidate = value.split(",")[0]?.trim() || "";

  return /^[0-9a-f:.]{3,64}$/i.test(candidate) ? candidate.toLowerCase() : null;
}

function digestValue(
  kind: "ip" | "phone",
  value: string,
  proofSecret: string,
) {
  return createHmac("sha256", proofSecret)
    .update(`${kind}:${value}`)
    .digest("hex");
}

function encodeJsonSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeJsonSegment(value: string) {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
  } catch {
    return null;
  }
}

function signSegment(segment: string, secret: string) {
  return createHmac("sha256", secret).update(segment).digest("base64url");
}

function signaturesMatch(left: string, right: string) {
  try {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);

    return (
      leftBuffer.length === rightBuffer.length &&
      timingSafeEqual(leftBuffer, rightBuffer)
    );
  } catch {
    return false;
  }
}

function isProofPayload(
  value: unknown,
): value is CustomerBookingPhoneOtpProofPayload {
  const record = asRecord(value);

  return Boolean(
    record &&
      record.type === customerBookingPhoneOtpProofVersion &&
      typeof record.challenge_id === "string" &&
      customerBookingPhoneOtpChallengePattern.test(record.challenge_id) &&
      typeof record.phone_hash === "string" &&
      customerBookingPhoneOtpHashPattern.test(record.phone_hash) &&
      Number.isInteger(record.iat) &&
      Number.isInteger(record.exp),
  );
}

function createProof(
  challengeId: string,
  phoneHash: string,
  config: CustomerBookingPhoneOtpConfig,
  nowMs = Date.now(),
) {
  const issuedAt = Math.floor(nowMs / 1000);
  const payload: CustomerBookingPhoneOtpProofPayload = {
    challenge_id: challengeId,
    exp: issuedAt + proofMaxAgeSeconds,
    iat: issuedAt,
    phone_hash: phoneHash,
    type: customerBookingPhoneOtpProofVersion,
  };
  const encodedPayload = encodeJsonSegment(payload);

  return `${customerBookingPhoneOtpProofPrefix}.${encodedPayload}.${signSegment(
    encodedPayload,
    config.proofSecret,
  )}`;
}

export function customerBookingPhoneOtpReference(
  challengeId: string,
  proofSecret: string,
) {
  if (
    !customerBookingPhoneOtpChallengePattern.test(challengeId) ||
    proofSecret.length < 32
  ) {
    return null;
  }

  const digest = createHmac("sha256", proofSecret)
    .update(`booking:${challengeId}`)
    .digest("hex")
    .slice(0, 24)
    .toUpperCase();

  return `CBOTP-${digest}`;
}

export function verifyCustomerBookingPhoneOtpProof(
  token: string,
  contactPhone: unknown,
  nowMs = Date.now(),
):
  | { data: VerifiedCustomerBookingPhoneOtpProof; ok: true }
  | { error: CustomerBookingPhoneOtpFailureReason; ok: false; status: 403 } {
  const config = configuredCustomerBookingPhoneOtp();

  if (!config) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 403,
    };
  }

  const normalizedPhone = normalizeCustomerBookingPhoneOtpNumber(
    contactPhone,
    config.allowedCountryCodes,
  );
  const [prefix = "", payloadSegment = "", signature = "", ...extra] =
    token.trim().split(".");

  if (
    !normalizedPhone ||
    prefix !== customerBookingPhoneOtpProofPrefix ||
    !payloadSegment ||
    !signature ||
    extra.length > 0 ||
    !signaturesMatch(signature, signSegment(payloadSegment, config.proofSecret))
  ) {
    return { error: "challenge_invalid", ok: false, status: 403 };
  }

  const payload = decodeJsonSegment(payloadSegment);

  if (!isProofPayload(payload)) {
    return { error: "challenge_invalid", ok: false, status: 403 };
  }

  const nowSeconds = Math.floor(nowMs / 1000);
  const expectedPhoneHash = digestValue(
    "phone",
    normalizedPhone,
    config.proofSecret,
  );

  if (
    payload.iat > nowSeconds + 60 ||
    payload.exp <= nowSeconds ||
    payload.exp - payload.iat !== proofMaxAgeSeconds ||
    !signaturesMatch(payload.phone_hash, expectedPhoneHash)
  ) {
    return { error: "challenge_invalid", ok: false, status: 403 };
  }

  const bookingReference = customerBookingPhoneOtpReference(
    payload.challenge_id,
    config.proofSecret,
  );

  if (!bookingReference) {
    return { error: "challenge_invalid", ok: false, status: 403 };
  }

  return {
    data: {
      booking_reference: bookingReference,
      challenge_id: payload.challenge_id,
      expires_at: payload.exp,
      phone_hash: payload.phone_hash,
    },
    ok: true,
  };
}

function reservationRow(value: unknown) {
  if (!Array.isArray(value) || value.length !== 1) {
    return null;
  }

  return asRecord(value[0]) as CustomerBookingPhoneOtpReservationRow | null;
}

function safeRetryAfter(value: unknown, fallback = 60) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(1, Math.min(86_400, Math.ceil(value)))
    : fallback;
}

async function reserveSend(
  client: SupabaseClient,
  challengeId: string,
  phoneHash: string,
  ipHash: string,
) {
  const result = await client.rpc(customerBookingPhoneOtpReserveSendRpc, {
    p_challenge_id: challengeId,
    p_ip_hash: ipHash,
    p_phone_hash: phoneHash,
  });
  const row = reservationRow(result.data);

  if (result.error || !row || typeof row.allowed !== "boolean") {
    return null;
  }

  return {
    allowed: row.allowed,
    reason: typeof row.reason === "string" ? row.reason : "",
    retryAfterSeconds: safeRetryAfter(row.retry_after_seconds),
  };
}

async function reserveCheck(
  client: SupabaseClient,
  challengeId: string,
  phoneHash: string,
) {
  const result = await client.rpc(customerBookingPhoneOtpReserveCheckRpc, {
    p_challenge_id: challengeId,
    p_phone_hash: phoneHash,
  });
  const row = reservationRow(result.data);

  if (result.error || !row || typeof row.allowed !== "boolean") {
    return null;
  }

  return {
    allowed: row.allowed,
    reason: typeof row.reason === "string" ? row.reason : "",
    retryAfterSeconds: safeRetryAfter(row.retry_after_seconds),
  };
}

async function markChallengeStatus(
  client: SupabaseClient,
  challengeId: string,
  status: "provider_failed" | "verified",
) {
  const update =
    status === "verified"
      ? { status, verified_at: new Date().toISOString() }
      : { status };
  const result = await client
    .from(customerBookingPhoneOtpTable)
    .update(update)
    .eq("challenge_id", challengeId)
    .eq("status", "pending");

  return !result.error;
}

function providerAuthorization(config: CustomerBookingPhoneOtpConfig) {
  return `Basic ${Buffer.from(
    `${config.apiKeySid}:${config.apiKeySecret}`,
    "utf8",
  ).toString("base64")}`;
}

async function readProviderResponse(response: Response) {
  try {
    return asRecord(await response.json());
  } catch {
    return null;
  }
}

async function startTwilioVerification(
  phone: string,
  config: CustomerBookingPhoneOtpConfig,
  fetcher: typeof fetch,
) {
  const body = new URLSearchParams({
    Channel: "sms",
    Locale: "en",
    To: phone,
  });

  try {
    const response = await fetcher(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(
        config.serviceSid,
      )}/Verifications`,
      {
        body,
        cache: "no-store",
        headers: {
          Authorization: providerAuthorization(config),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        signal: AbortSignal.timeout(providerTimeoutMs),
      },
    );
    const payload = await readProviderResponse(response);
    const status = typeof payload?.status === "string" ? payload.status : "";

    return response.ok && (status === "pending" || status === "approved");
  } catch {
    return false;
  }
}

async function checkTwilioVerification(
  code: string,
  phone: string,
  config: CustomerBookingPhoneOtpConfig,
  fetcher: typeof fetch,
) {
  const body = new URLSearchParams({
    Code: code,
    To: phone,
  });

  try {
    const response = await fetcher(
      `https://verify.twilio.com/v2/Services/${encodeURIComponent(
        config.serviceSid,
      )}/VerificationCheck`,
      {
        body,
        cache: "no-store",
        headers: {
          Authorization: providerAuthorization(config),
          "Content-Type": "application/x-www-form-urlencoded",
        },
        method: "POST",
        signal: AbortSignal.timeout(providerTimeoutMs),
      },
    );
    const payload = await readProviderResponse(response);
    const status = typeof payload?.status === "string" ? payload.status : "";

    if (response.ok && status === "approved") {
      return "approved" as const;
    }

    if (response.ok && status === "pending") {
      return "pending" as const;
    }

    return response.status === 404 ? ("expired" as const) : ("failed" as const);
  } catch {
    return "failed" as const;
  }
}

export async function startCustomerBookingPhoneOtp({
  fetcher = fetch,
  phone,
  requestIp,
}: {
  fetcher?: typeof fetch;
  phone: unknown;
  requestIp: unknown;
}): Promise<CustomerBookingPhoneOtpStartResult> {
  const config = configuredCustomerBookingPhoneOtp();

  if (!config) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  const normalizedPhone = normalizeCustomerBookingPhoneOtpNumber(
    phone,
    config.allowedCountryCodes,
  );
  const normalizedIp = normalizeCustomerBookingPhoneOtpRequestIp(requestIp);

  if (!normalizedPhone) {
    return { error: "phone_invalid", ok: false, status: 400 };
  }

  if (!normalizedIp) {
    return { error: "request_blocked", ok: false, status: 403 };
  }

  const client = createServerOnlySupabaseClient(config);

  if (!client) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  const challengeId = randomBytes(16).toString("hex");
  const phoneHash = digestValue(
    "phone",
    normalizedPhone,
    config.proofSecret,
  );
  const ipHash = digestValue("ip", normalizedIp, config.proofSecret);
  const reservation = await reserveSend(
    client,
    challengeId,
    phoneHash,
    ipHash,
  );

  if (!reservation) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  if (!reservation.allowed) {
    return {
      error: "rate_limited",
      ok: false,
      retryAfterSeconds: reservation.retryAfterSeconds,
      status: 429,
    };
  }

  const providerAccepted = await startTwilioVerification(
    normalizedPhone,
    config,
    fetcher,
  );

  if (!providerAccepted) {
    await markChallengeStatus(client, challengeId, "provider_failed");
    return {
      error: "provider_unavailable",
      ok: false,
      status: 502,
    };
  }

  return {
    challengeId,
    expiresInSeconds: proofMaxAgeSeconds,
    ok: true,
    retryAfterSeconds: 60,
  };
}

export async function checkCustomerBookingPhoneOtp({
  challengeId,
  code,
  fetcher = fetch,
  phone,
}: {
  challengeId: unknown;
  code: unknown;
  fetcher?: typeof fetch;
  phone: unknown;
}): Promise<CustomerBookingPhoneOtpCheckResult> {
  const config = configuredCustomerBookingPhoneOtp();

  if (!config) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  const normalizedPhone = normalizeCustomerBookingPhoneOtpNumber(
    phone,
    config.allowedCountryCodes,
  );
  const safeChallengeId =
    typeof challengeId === "string" &&
    customerBookingPhoneOtpChallengePattern.test(challengeId)
      ? challengeId
      : "";
  const safeCode =
    typeof code === "string" && otpCodePattern.test(code.trim())
      ? code.trim()
      : "";

  if (!normalizedPhone || !safeChallengeId || !safeCode) {
    return { error: "challenge_invalid", ok: false, status: 400 };
  }

  const client = createServerOnlySupabaseClient(config);

  if (!client) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  const phoneHash = digestValue(
    "phone",
    normalizedPhone,
    config.proofSecret,
  );
  const reservation = await reserveCheck(client, safeChallengeId, phoneHash);

  if (!reservation) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  if (!reservation.allowed) {
    if (reservation.reason === "expired") {
      return { error: "challenge_expired", ok: false, status: 403 };
    }

    if (reservation.reason === "attempt_limit") {
      return {
        error: "rate_limited",
        ok: false,
        retryAfterSeconds: reservation.retryAfterSeconds,
        status: 429,
      };
    }

    return { error: "challenge_invalid", ok: false, status: 403 };
  }

  const providerStatus = await checkTwilioVerification(
    safeCode,
    normalizedPhone,
    config,
    fetcher,
  );

  if (providerStatus === "pending") {
    return { error: "code_invalid", ok: false, status: 403 };
  }

  if (providerStatus === "expired") {
    return { error: "challenge_expired", ok: false, status: 403 };
  }

  if (providerStatus !== "approved") {
    return { error: "verification_failed", ok: false, status: 502 };
  }

  const markedVerified = await markChallengeStatus(
    client,
    safeChallengeId,
    "verified",
  );

  if (!markedVerified) {
    return {
      error: "configuration_unavailable",
      ok: false,
      status: 503,
    };
  }

  return {
    expiresInSeconds: proofMaxAgeSeconds,
    ok: true,
    proof: createProof(safeChallengeId, phoneHash, config),
  };
}
