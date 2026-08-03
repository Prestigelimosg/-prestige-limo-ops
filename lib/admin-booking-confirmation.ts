import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { AdminBookingPersistenceInput } from "./admin-booking-persistence";
import type { ChatGptBookingSafePreview } from "./chatgpt-booking-preview";

const confirmationAudience = "prestige-admin-booking-confirmed-preview";
const confirmationLifetimeSeconds = 10 * 60;
const minimumConfirmationSecretLength = 32;

type ConfirmationTokenPayload = {
  aud: typeof confirmationAudience;
  exp: number;
  iat: number;
  payload_hash: string;
  version: 1;
};

export type AdminBookingConfirmationIssueResult =
  | {
      expires_at: string;
      ok: true;
      payload_hash: string;
      token: string;
    }
  | {
      code: "confirmation_unavailable";
      message: string;
      ok: false;
    };

export type AdminBookingConfirmationVerifyResult =
  | {
      ok: true;
      payload_hash: string;
    }
  | {
      code:
        | "confirmation_expired"
        | "confirmation_invalid"
        | "confirmation_payload_mismatch"
        | "confirmation_unavailable";
      message: string;
      ok: false;
    };

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(stableValue);
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, stableValue(nestedValue)]),
    );
  }

  return value;
}

function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function confirmationSecret() {
  const value = process.env.PRESTIGE_ADMIN_BOOKING_CONFIRMATION_SECRET?.trim() || "";

  return value.length >= minimumConfirmationSecretLength ? value : null;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function sourceMessageDigest(sourceInput: unknown) {
  const sourceMessage = asRecord(sourceInput).source_message;

  return typeof sourceMessage === "string" && sourceMessage.trim()
    ? sha256(sourceMessage.trim())
    : null;
}

export function adminBookingConfirmedPayloadHash(
  canonicalPayload: AdminBookingPersistenceInput,
  safePreview: ChatGptBookingSafePreview,
  sourceInput: unknown,
) {
  return sha256(
    stableJson({
      canonical_booking: canonicalPayload,
      preview_only: {
        customer_price: safePreview.customer_price_preview_only,
        notes: safePreview.notes_preview_only,
        source_message_digest: sourceMessageDigest(sourceInput),
      },
    }),
  );
}

function signature(segment: string, secret: string) {
  return createHmac("sha256", secret).update(segment, "utf8").digest("base64url");
}

export function issueAdminBookingConfirmationToken(
  canonicalPayload: AdminBookingPersistenceInput,
  safePreview: ChatGptBookingSafePreview,
  sourceInput: unknown,
  nowMs = Date.now(),
): AdminBookingConfirmationIssueResult {
  const secret = confirmationSecret();

  if (!secret) {
    return {
      code: "confirmation_unavailable",
      message: "Booking confirmation is not configured on this server.",
      ok: false,
    };
  }

  const issuedAt = Math.floor(nowMs / 1000);
  const payload: ConfirmationTokenPayload = {
    aud: confirmationAudience,
    exp: issuedAt + confirmationLifetimeSeconds,
    iat: issuedAt,
    payload_hash: adminBookingConfirmedPayloadHash(canonicalPayload, safePreview, sourceInput),
    version: 1,
  };
  const segment = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");

  return {
    expires_at: new Date(payload.exp * 1000).toISOString(),
    ok: true,
    payload_hash: payload.payload_hash,
    token: `${segment}.${signature(segment, secret)}`,
  };
}

export function verifyAdminBookingConfirmationToken(
  token: unknown,
  canonicalPayload: AdminBookingPersistenceInput,
  safePreview: ChatGptBookingSafePreview,
  sourceInput: unknown,
  nowMs = Date.now(),
): AdminBookingConfirmationVerifyResult {
  const secret = confirmationSecret();

  if (!secret) {
    return {
      code: "confirmation_unavailable",
      message: "Booking confirmation is not configured on this server.",
      ok: false,
    };
  }

  if (typeof token !== "string" || token.length < 40 || token.length > 4096) {
    return {
      code: "confirmation_invalid",
      message: "Booking confirmation is missing or invalid.",
      ok: false,
    };
  }

  const [segment, suppliedSignature, extraSegment] = token.split(".");

  if (!segment || !suppliedSignature || extraSegment || !safeEqual(signature(segment, secret), suppliedSignature)) {
    return {
      code: "confirmation_invalid",
      message: "Booking confirmation is missing or invalid.",
      ok: false,
    };
  }

  let payload: ConfirmationTokenPayload;

  try {
    payload = JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as ConfirmationTokenPayload;
  } catch {
    return {
      code: "confirmation_invalid",
      message: "Booking confirmation is missing or invalid.",
      ok: false,
    };
  }

  const nowSeconds = Math.floor(nowMs / 1000);

  if (
    payload.version !== 1 ||
    payload.aud !== confirmationAudience ||
    !Number.isSafeInteger(payload.iat) ||
    !Number.isSafeInteger(payload.exp) ||
    payload.iat > nowSeconds + 30 ||
    payload.exp <= payload.iat ||
    typeof payload.payload_hash !== "string" ||
    !/^[a-f0-9]{64}$/.test(payload.payload_hash)
  ) {
    return {
      code: "confirmation_invalid",
      message: "Booking confirmation is missing or invalid.",
      ok: false,
    };
  }

  if (payload.exp <= nowSeconds) {
    return {
      code: "confirmation_expired",
      message: "Booking confirmation has expired. Review and confirm the preview again.",
      ok: false,
    };
  }

  const expectedPayloadHash = adminBookingConfirmedPayloadHash(
    canonicalPayload,
    safePreview,
    sourceInput,
  );

  if (!safeEqual(payload.payload_hash, expectedPayloadHash)) {
    return {
      code: "confirmation_payload_mismatch",
      message: "Booking details changed after confirmation. Review and confirm the preview again.",
      ok: false,
    };
  }

  return {
    ok: true,
    payload_hash: payload.payload_hash,
  };
}
