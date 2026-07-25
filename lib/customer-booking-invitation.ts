import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { AdminBookingResult } from "./admin-booking-persistence";

export const customerBookingInvitationVersion = "customer-booking-invitation-v1";

const customerBookingInvitationTokenPrefix = "customer_booking_invitation_v1";
const customerBookingInvitationMaxAgeSeconds = 7 * 24 * 60 * 60;
const customerBookingInvitationIdPattern = /^[a-f0-9]{32}$/;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

type CustomerBookingInvitationTokenPayload = {
  exp: number;
  iat: number;
  id: string;
  type: typeof customerBookingInvitationVersion;
};

export type CustomerBookingInvitationResult = {
  booking_reference: string;
  expires_at: string;
  token: string;
  version: typeof customerBookingInvitationVersion;
};

export type VerifiedCustomerBookingInvitation = {
  booking_reference: string;
  expires_at: number;
  invitation_id: string;
  issued_at: number;
  version: typeof customerBookingInvitationVersion;
};

function configuredSigningSecret() {
  if (process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED !== "true") {
    return null;
  }

  const secret = process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET?.trim() || "";
  const normalizedSecret = secret.toLowerCase();

  if (
    secret.length < 32 ||
    placeholderConfigPattern.test(normalizedSecret) ||
    normalizedSecret.includes("placeholder") ||
    normalizedSecret.includes("change_me") ||
    normalizedSecret.includes("changeme") ||
    normalizedSecret.includes("replace_me") ||
    normalizedSecret.includes("your-") ||
    normalizedSecret.includes("your_") ||
    normalizedSecret.includes("next_public") ||
    normalizedSecret.includes("<") ||
    normalizedSecret.includes(">")
  ) {
    return null;
  }

  return secret;
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

    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  } catch {
    return false;
  }
}

function isInvitationPayload(value: unknown): value is CustomerBookingInvitationTokenPayload {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    record.type === customerBookingInvitationVersion &&
    typeof record.id === "string" &&
    customerBookingInvitationIdPattern.test(record.id) &&
    Number.isInteger(record.iat) &&
    Number.isInteger(record.exp)
  );
}

export function customerBookingInvitationReference(invitationId: string) {
  return customerBookingInvitationIdPattern.test(invitationId)
    ? `CUST-INV-${invitationId.toUpperCase()}`
    : null;
}

export function createCustomerBookingInvitationToken(
  nowMs = Date.now(),
): AdminBookingResult<CustomerBookingInvitationResult> {
  const secret = configuredSigningSecret();

  if (!secret) {
    return {
      error: "Customer booking invitation configuration is not ready.",
      ok: false,
      status: 503,
    };
  }

  const issuedAt = Math.floor(nowMs / 1000);
  const expiresAt = issuedAt + customerBookingInvitationMaxAgeSeconds;
  const invitationId = randomBytes(16).toString("hex");
  const bookingReference = customerBookingInvitationReference(invitationId);

  if (!bookingReference) {
    return {
      error: "Customer booking invitation could not be created safely.",
      ok: false,
      status: 500,
    };
  }

  const payloadSegment = encodeJsonSegment({
    exp: expiresAt,
    iat: issuedAt,
    id: invitationId,
    type: customerBookingInvitationVersion,
  } satisfies CustomerBookingInvitationTokenPayload);
  const signature = signSegment(payloadSegment, secret);

  return {
    data: {
      booking_reference: bookingReference,
      expires_at: new Date(expiresAt * 1000).toISOString(),
      token: `${customerBookingInvitationTokenPrefix}.${payloadSegment}.${signature}`,
      version: customerBookingInvitationVersion,
    },
    ok: true,
  };
}

export function verifyCustomerBookingInvitationToken(
  tokenValue: unknown,
  nowMs = Date.now(),
): AdminBookingResult<VerifiedCustomerBookingInvitation> {
  const secret = configuredSigningSecret();
  const token = typeof tokenValue === "string" ? tokenValue.trim() : "";

  if (!secret) {
    return {
      error: "Customer booking invitation configuration is not ready.",
      ok: false,
      status: 503,
    };
  }

  const [prefix, payloadSegment, signature, extraSegment] = token.split(".");

  if (
    prefix !== customerBookingInvitationTokenPrefix ||
    !payloadSegment ||
    !signature ||
    extraSegment !== undefined ||
    !signaturesMatch(signature, signSegment(payloadSegment, secret))
  ) {
    return {
      error: "Customer booking invitation is invalid or expired.",
      ok: false,
      status: 403,
    };
  }

  const payload = decodeJsonSegment(payloadSegment);
  const now = Math.floor(nowMs / 1000);

  if (
    !isInvitationPayload(payload) ||
    payload.iat > now + 60 ||
    payload.exp <= now ||
    payload.exp - payload.iat !== customerBookingInvitationMaxAgeSeconds
  ) {
    return {
      error: "Customer booking invitation is invalid or expired.",
      ok: false,
      status: 403,
    };
  }

  const bookingReference = customerBookingInvitationReference(payload.id);

  if (!bookingReference) {
    return {
      error: "Customer booking invitation is invalid or expired.",
      ok: false,
      status: 403,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      expires_at: payload.exp,
      invitation_id: payload.id,
      issued_at: payload.iat,
      version: customerBookingInvitationVersion,
    },
    ok: true,
  };
}
