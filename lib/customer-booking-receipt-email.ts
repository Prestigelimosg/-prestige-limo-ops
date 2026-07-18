import "server-only";

import { createHash } from "node:crypto";

import type { AdminBookingPersistenceRecord } from "./admin-booking-persistence";
import { formatSingaporePickupDisplay } from "./singapore-pickup-display";

export const customerBookingReceiptEmailVersion = "customer-booking-receipt-email-v1";
export const customerBookingReceiptEmailGateName =
  "PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_ENABLED";

export type CustomerBookingReceiptEmailStatus = "blocked" | "failed" | "sent";

export type CustomerBookingReceiptEmailResult = {
  external_send: boolean;
  no_op: boolean;
  ok: boolean;
  provider_request_count: 0 | 1;
  reason:
    | "gate_closed"
    | "invalid_request"
    | "provider_failure"
    | "provider_not_configured"
    | "recipient_not_allowed"
    | "send_succeeded";
  status: CustomerBookingReceiptEmailStatus;
  version: typeof customerBookingReceiptEmailVersion;
};

export type CustomerBookingReceiptEmailOptions = {
  env?: NodeJS.ProcessEnv;
  providerFetch?: (
    url: string,
    init: {
      body: string;
      headers: Record<string, string>;
      method: "POST";
      signal: AbortSignal;
    },
  ) => Promise<{ ok: boolean; status: number }>;
  timeoutMs?: number;
};

const resendEmailApiUrl = "https://api.resend.com/emails";
const selectedProvider = "resend";
const replyTo = "info@prestigelimo.sg";
const placeholderPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenTextFragments = [
  "admin_note",
  "auth_link",
  "debug",
  "driver_note",
  "driver_token",
  "finance",
  "internal_note",
  "mock_archive",
  "mock_qa",
  "parser",
  "payment",
  "payout",
  "raw_provider",
  "secret",
];

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function safeText(value: unknown, maxLength = 500) {
  const cleaned = textOrNull(value, maxLength);
  const normalized = cleaned ? normalizeToken(cleaned) : "";

  return cleaned && !forbiddenTextFragments.some((fragment) => normalized.includes(fragment))
    ? cleaned
    : null;
}

function safeEmail(value: unknown) {
  const cleaned = textOrNull(value, 254)?.toLowerCase() || null;

  return cleaned && /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/.test(cleaned)
    ? cleaned
    : null;
}

function configValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim() || null;

  return value && !placeholderPattern.test(value.toLowerCase()) ? value : null;
}

function recipientAllowlist(value: string | null) {
  if (!value) {
    return null;
  }

  const entries = value
    .split(/[\s,]+/)
    .map(safeEmail)
    .filter((email): email is string => Boolean(email));

  return entries.length > 0 ? new Set(entries) : new Set<string>();
}

function safeResult(
  overrides: Partial<CustomerBookingReceiptEmailResult>,
): CustomerBookingReceiptEmailResult {
  return {
    external_send: false,
    no_op: true,
    ok: false,
    provider_request_count: 0,
    reason: "gate_closed",
    status: "blocked",
    version: customerBookingReceiptEmailVersion,
    ...overrides,
  };
}

function normalizeTrip(record: AdminBookingPersistenceRecord) {
  const booking = asRecord(record);
  const bookingReference =
    safeText(booking.public_booking_reference, 40) ||
    safeText(booking.booking_reference, 120);
  const recipient = safeEmail(booking.contact_email);

  if (!bookingReference || !recipient) {
    return null;
  }

  return {
    bookingReference,
    dropoffLocation: safeText(booking.dropoff_location),
    passengerName: safeText(booking.passenger_name, 160),
    pickupDateTime: formatSingaporePickupDisplay(safeText(booking.pickup_datetime, 120)) || null,
    pickupLocation: safeText(booking.pickup_location),
    recipient,
    serviceType: safeText(booking.route_type, 120),
  };
}

function emailText(trips: Array<NonNullable<ReturnType<typeof normalizeTrip>>>) {
  return [
    "Request received — pending review",
    "This is not a booking confirmation.",
    "",
    ...trips.flatMap((trip, index) => [
      trips.length > 1 ? `Trip ${index + 1}` : "Booking request",
      `Reference: ${trip.bookingReference}`,
      trip.passengerName ? `Passenger: ${trip.passengerName}` : "",
      trip.pickupDateTime ? `Pickup time: ${trip.pickupDateTime}` : "",
      trip.pickupLocation ? `Pickup: ${trip.pickupLocation}` : "",
      trip.dropoffLocation ? `Drop-off: ${trip.dropoffLocation}` : "",
      trip.serviceType ? `Service: ${trip.serviceType}` : "",
      "",
    ]),
    "Our team will review availability and contact you after review.",
  ]
    .filter((line, index, lines) => line !== "" || lines[index - 1] !== "")
    .join("\n")
    .trim();
}

function idempotencyKey(reference: string, recipient: string) {
  const recipientDigest = createHash("sha256").update(recipient).digest("hex").slice(0, 16);

  return `customer-request-receipt-${reference}-${recipientDigest}`;
}

export async function sendCustomerBookingReceiptEmail(
  bookings: AdminBookingPersistenceRecord[],
  options: CustomerBookingReceiptEmailOptions = {},
): Promise<CustomerBookingReceiptEmailResult> {
  const env = options.env || process.env;

  if (env[customerBookingReceiptEmailGateName] !== "true") {
    return safeResult({ reason: "gate_closed" });
  }

  const trips = bookings.map(normalizeTrip);

  if (trips.length === 0 || trips.some((trip) => !trip)) {
    return safeResult({ reason: "invalid_request" });
  }

  const safeTrips = trips as Array<NonNullable<ReturnType<typeof normalizeTrip>>>;
  const recipient = safeTrips[0].recipient;

  if (safeTrips.some((trip) => trip.recipient !== recipient)) {
    return safeResult({ reason: "invalid_request" });
  }

  const provider = configValue(env, "PRESTIGE_EMAIL_PROVIDER")?.toLowerCase();
  const sender = configValue(env, "PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_FROM");
  const apiKey = configValue(env, "RESEND_API_KEY");
  const allowlist = recipientAllowlist(
    configValue(env, "PRESTIGE_CUSTOMER_BOOKING_RECEIPT_EMAIL_RECIPIENT_ALLOWLIST"),
  );

  if (allowlist && !allowlist.has(recipient)) {
    return safeResult({ reason: "recipient_not_allowed" });
  }

  if (provider !== selectedProvider || !sender || !safeEmail(sender.match(/<([^>]+)>/)?.[1] || sender) || !apiKey || apiKey.length < 12) {
    return safeResult({ reason: "provider_not_configured" });
  }

  const providerFetch = options.providerFetch || fetch;
  const timeoutMs =
    Number.isFinite(options.timeoutMs) && (options.timeoutMs || 0) >= 1000 && (options.timeoutMs || 0) <= 10000
      ? (options.timeoutMs as number)
      : 5000;

  try {
    const response = await providerFetch(resendEmailApiUrl, {
      body: JSON.stringify({
        from: sender,
        reply_to: replyTo,
        subject: `Request received: ${safeTrips[0].bookingReference}`,
        text: emailText(safeTrips),
        to: [recipient],
      }),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(safeTrips[0].bookingReference, recipient),
      },
      method: "POST",
      signal: AbortSignal.timeout(timeoutMs),
    });

    return response.ok
      ? safeResult({
          external_send: true,
          no_op: false,
          ok: true,
          provider_request_count: 1,
          reason: "send_succeeded",
          status: "sent",
        })
      : safeResult({
          provider_request_count: 1,
          reason: "provider_failure",
          status: "failed",
        });
  } catch {
    return safeResult({
      provider_request_count: 1,
      reason: "provider_failure",
      status: "failed",
    });
  }
}
