import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

import { opaqueDriverJobLinkKey } from "./driver-device-push-notification.ts";
import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link.ts";

export const driverPortalSessionCookieName = "prestige_driver_portal_session";
export const driverPortalSessionVersion = "driver-portal-session-v1";

const driverPortalSessionMaxAgeSeconds = 60 * 60 * 24 * 30;
const driverPortalSessionSecretEnvName = "PRESTIGE_DRIVER_PORTAL_SESSION_SECRET";
const sessionAad = Buffer.from(driverPortalSessionVersion, "utf8");
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const placeholderPattern =
  /^(?:todo|tbd|none|null|undefined|placeholder|change[-_ ]?me|replace[-_ ]?me|example)$/i;

type DriverPortalSessionClient = Pick<SupabaseClient, "from">;
type DriverPortalSessionEnv = Record<string, string | undefined>;
type UnknownRecord = Record<string, unknown>;

export type DriverPortalSessionClaims = {
  driverId: number;
  expiresAt: number;
  issuedAt: number;
};

export type DriverPortalSessionResolution =
  | {
      claims: DriverPortalSessionClaims;
      ok: true;
      reason: "authenticated";
    }
  | {
      ok: false;
      reason: "invalid_session" | "not_configured" | "session_required";
    };

export type DriverPortalEnrollmentResult =
  | {
      cookie: string;
      jobKey: string;
      ok: true;
      reason: "enrolled";
    }
  | {
      cookie: null;
      jobKey: null;
      ok: false;
      reason:
        | "driver_mismatch"
        | "invalid_driver_link"
        | "invalid_existing_session"
        | "not_configured"
        | "unverified_driver";
    };

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function configuredSecret(env: DriverPortalSessionEnv) {
  const value = env[driverPortalSessionSecretEnvName]?.trim() || "";

  return value.length >= 32 && !placeholderPattern.test(value) ? value : null;
}

function encryptionKey(secret: string) {
  return createHash("sha256")
    .update(`${driverPortalSessionVersion}:${secret}`)
    .digest();
}

function cookieValueFromHeader(cookieHeader: string | null) {
  const values = (cookieHeader || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const separatorIndex = part.indexOf("=");
      if (separatorIndex <= 0 || part.slice(0, separatorIndex).trim() !== driverPortalSessionCookieName) {
        return [];
      }

      try {
        return [decodeURIComponent(part.slice(separatorIndex + 1))];
      } catch {
        return [""];
      }
    });

  if (values.length === 0) {
    return { state: "missing" as const, value: null };
  }

  if (values.length !== 1 || !values[0]) {
    return { state: "invalid" as const, value: null };
  }

  return { state: "present" as const, value: values[0] };
}

function encryptClaims(claims: DriverPortalSessionClaims, secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(sessionAad);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify({
      driver_id: claims.driverId,
      expires_at: claims.expiresAt,
      issued_at: claims.issuedAt,
      version: driverPortalSessionVersion,
    }), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [iv, ciphertext, tag].map((value) => value.toString("base64url")).join(".");
}

function decryptClaims(value: string, secret: string, nowMs: number): DriverPortalSessionClaims | null {
  try {
    const parts = value.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const [iv, ciphertext, tag] = parts.map((part) => Buffer.from(part, "base64url"));
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 16) {
      return null;
    }

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(sessionAad);
    decipher.setAuthTag(tag);
    const payload = asRecord(JSON.parse(Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8")));
    const driverId = positiveInteger(payload.driver_id);
    const issuedAt = Number(payload.issued_at);
    const expiresAt = Number(payload.expires_at);

    if (
      payload.version !== driverPortalSessionVersion ||
      !driverId ||
      !Number.isFinite(issuedAt) ||
      !Number.isFinite(expiresAt) ||
      issuedAt > nowMs + 60_000 ||
      expiresAt <= nowMs ||
      expiresAt - issuedAt > driverPortalSessionMaxAgeSeconds * 1000
    ) {
      return null;
    }

    return { driverId, expiresAt, issuedAt };
  } catch {
    return null;
  }
}

function serializeSessionCookie(value: string) {
  return [
    `${driverPortalSessionCookieName}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${driverPortalSessionMaxAgeSeconds}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    "Priority=High",
  ].join("; ");
}

export function resolveDriverPortalSession(
  cookieHeader: string | null,
  options: {
    env?: DriverPortalSessionEnv;
    now?: Date | string | number;
  } = {},
): DriverPortalSessionResolution {
  const secret = configuredSecret(options.env ?? process.env);
  if (!secret) {
    return { ok: false, reason: "not_configured" };
  }

  const cookie = cookieValueFromHeader(cookieHeader);
  if (cookie.state === "missing") {
    return { ok: false, reason: "session_required" };
  }
  if (cookie.state === "invalid" || !cookie.value) {
    return { ok: false, reason: "invalid_session" };
  }

  const nowMs = options.now === undefined ? Date.now() : new Date(options.now).getTime();
  const claims = Number.isFinite(nowMs) ? decryptClaims(cookie.value, secret, nowMs) : null;

  return claims
    ? { claims, ok: true, reason: "authenticated" }
    : { ok: false, reason: "invalid_session" };
}

function blockedEnrollment(
  reason: Exclude<DriverPortalEnrollmentResult, { ok: true }>["reason"],
): DriverPortalEnrollmentResult {
  return { cookie: null, jobKey: null, ok: false, reason };
}

export async function issueDriverPortalSessionForAcknowledgedToken({
  client,
  cookieHeader,
  env = process.env,
  now = new Date(),
  token,
}: {
  client: DriverPortalSessionClient;
  cookieHeader: string | null;
  env?: DriverPortalSessionEnv;
  now?: Date | string | number;
  token: string;
}): Promise<DriverPortalEnrollmentResult> {
  const secret = configuredSecret(env);
  const nowDate = new Date(now);
  if (!secret || Number.isNaN(nowDate.getTime())) {
    return blockedEnrollment("not_configured");
  }

  let tokenHash = "";
  try {
    tokenHash = hashDriverJobLinkToken(token);
  } catch {
    return blockedEnrollment("invalid_driver_link");
  }

  const { data: linkData, error: linkError } = await client
    .from("driver_job_links")
    .select("id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const link = asRecord(linkData);
  const linkId = typeof link.id === "string" && uuidPattern.test(link.id) ? link.id : null;
  const bookingReference = typeof link.booking_reference === "string"
    ? link.booking_reference.trim()
    : "";
  const linkDriverId = positiveInteger(link.driver_id);
  const expiresAt = typeof link.expires_at === "string" ? link.expires_at : "";
  const acknowledgedAt = asRecord(link.safe_link_context).driver_acknowledged_at;

  if (
    linkError ||
    !linkId ||
    !bookingReference ||
    link.link_status !== "active" ||
    link.revoked_at ||
    !expiresAt ||
    isDriverJobLinkExpired(expiresAt, nowDate) ||
    isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt, nowDate) ||
    typeof acknowledgedAt !== "string" ||
    !acknowledgedAt.trim()
  ) {
    return blockedEnrollment("invalid_driver_link");
  }

  if (!linkDriverId) {
    return blockedEnrollment("unverified_driver");
  }

  const { data: bookingData, error: bookingError } = await client
    .from("bookings")
    .select("booking_reference, driver_id")
    .eq("booking_reference", bookingReference)
    .maybeSingle();
  const booking = asRecord(bookingData);
  const bookingDriverId = positiveInteger(booking.driver_id);
  if (
    bookingError ||
    booking.booking_reference !== bookingReference ||
    !bookingDriverId ||
    bookingDriverId !== linkDriverId
  ) {
    return blockedEnrollment("driver_mismatch");
  }

  const existingCookie = cookieValueFromHeader(cookieHeader);
  if (existingCookie.state === "invalid") {
    return blockedEnrollment("invalid_existing_session");
  }
  if (existingCookie.state === "present" && existingCookie.value) {
    const existingClaims = decryptClaims(existingCookie.value, secret, nowDate.getTime());
    if (!existingClaims) {
      return blockedEnrollment("invalid_existing_session");
    }
    if (existingClaims.driverId !== linkDriverId) {
      return blockedEnrollment("driver_mismatch");
    }
  }

  const issuedAt = nowDate.getTime();
  const value = encryptClaims({
    driverId: linkDriverId,
    expiresAt: issuedAt + driverPortalSessionMaxAgeSeconds * 1000,
    issuedAt,
  }, secret);

  return {
    cookie: serializeSessionCookie(value),
    jobKey: opaqueDriverJobLinkKey(linkId),
    ok: true,
    reason: "enrolled",
  };
}
