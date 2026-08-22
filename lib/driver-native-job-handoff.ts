import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

export const driverNativeJobHandoffVersion = "driver-native-job-handoff-v1";
export const driverNativeJobHandoffSecretEnvName =
  "PRESTIGE_DRIVER_PORTAL_SESSION_SECRET";

type EnvInput = Record<string, string | undefined>;

const placeholderPattern =
  /^(?:todo|tbd|none|null|undefined|placeholder|change[-_ ]?me|replace[-_ ]?me|example)$/i;
const tokenPattern = /^[A-Za-z0-9_-]{20,512}$/;
const hashPattern = /^[0-9a-f]{64}$/;

function cleanText(value: unknown, maxLength: number) {
  const text = typeof value === "string" ? value.trim() : "";
  return text && text.length <= maxLength ? text : null;
}

function configuredSecret(env: EnvInput) {
  const value = cleanText(env[driverNativeJobHandoffSecretEnvName], 4096);
  return value && value.length >= 32 && !placeholderPattern.test(value)
    ? value
    : null;
}

function encryptionKey(secret: string) {
  return createHash("sha256")
    .update(`${driverNativeJobHandoffVersion}:${secret}`)
    .digest();
}

function aad(bookingReference: string, tokenHash: string) {
  return Buffer.from(
    `${driverNativeJobHandoffVersion}:${bookingReference}:${tokenHash}`,
    "utf8",
  );
}

function validBinding(bookingReference: unknown, tokenHash: unknown) {
  const reference = cleanText(bookingReference, 120);
  const hash = cleanText(tokenHash, 64);
  return reference && hashPattern.test(hash || "")
    ? { bookingReference: reference, tokenHash: hash! }
    : null;
}

export function sealDriverNativeJobHandoffToken(
  input: {
    bookingReference: unknown;
    token: unknown;
    tokenHash: unknown;
  },
  env: EnvInput = process.env,
) {
  const binding = validBinding(input.bookingReference, input.tokenHash);
  const token = cleanText(input.token, 512);
  const secret = configuredSecret(env);
  if (!binding || !token || !tokenPattern.test(token) || !secret) {
    return null;
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(aad(binding.bookingReference, binding.tokenHash));
  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return [driverNativeJobHandoffVersion, iv, ciphertext, tag]
    .map((value) => Buffer.isBuffer(value) ? value.toString("base64url") : value)
    .join(".");
}

export function openDriverNativeJobHandoff(
  input: {
    bookingReference: unknown;
    ciphertext: unknown;
    tokenHash: unknown;
  },
  env: EnvInput = process.env,
) {
  const binding = validBinding(input.bookingReference, input.tokenHash);
  const sealed = cleanText(input.ciphertext, 1200);
  const secret = configuredSecret(env);
  if (!binding || !sealed || !secret) {
    return null;
  }

  try {
    const parts = sealed.split(".");
    if (parts.length !== 4 || parts[0] !== driverNativeJobHandoffVersion) {
      return null;
    }
    const iv = Buffer.from(parts[1], "base64url");
    const ciphertext = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length < 20) {
      return null;
    }

    const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
    decipher.setAAD(aad(binding.bookingReference, binding.tokenHash));
    decipher.setAuthTag(tag);
    const token = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]).toString("utf8");

    return tokenPattern.test(token) ? token : null;
  } catch {
    return null;
  }
}
