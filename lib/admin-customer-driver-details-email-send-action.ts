import "server-only";

import { createHash } from "node:crypto";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminCustomerDriverDetailsEmailSendActionVersion =
  "admin-customer-driver-details-email-send-action-v1";
export const adminCustomerDriverDetailsEmailSendActionEnvGateName =
  "PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED";
export const adminCustomerDriverDetailsEmailRequiredEnvNames = [
  adminCustomerDriverDetailsEmailSendActionEnvGateName,
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_FROM",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST",
  "RESEND_API_KEY",
] as const;

type UnknownRecord = Record<string, unknown>;
type SendStatus = "blocked" | "failed" | "rejected" | "sent";
type SendReason =
  | "admin_session_required"
  | "email_send_gate_closed"
  | "invalid_input"
  | "lookup_not_used"
  | "provider_failure"
  | "provider_not_configured"
  | "provider_timeout"
  | "recipient_not_allowlisted"
  | "send_succeeded";

export type CustomerDriverDetailsEmailSendInput = {
  customer_booking_details?: unknown;
  driver_details?: unknown;
  recipient_email?: unknown;
};

export type CustomerDriverDetailsEmailPayload = {
  customer_booking_details: {
    booking_reference: string;
    customer_visible_booking_reference: string;
    customer_passenger_traveler_name: string | null;
    customer_facing_flight_number: string | null;
    drop_off_location: string;
    passenger_count: string;
    pickup_date: string;
    pickup_location: string;
    pickup_time: string;
    service_type: string;
  };
  driver_details: {
    car_plate: string;
    car_type: string;
    driver_contact: string;
    driver_name: string;
  };
  recipient_email: string;
};

export type AdminCustomerDriverDetailsEmailSendResult = {
  batch_send_enabled: false;
  blast_enabled: false;
  database_persistence_enabled: false;
  delivery_surface: "admin_customer_driver_details_email_send_action";
  email_send_enabled: boolean;
  env_gate_name: typeof adminCustomerDriverDetailsEmailSendActionEnvGateName;
  error?: string;
  external_send: boolean;
  fallback_enabled: false;
  invoice_email_enabled: false;
  live_location_email_enabled: false;
  message_id: string | null;
  no_op: boolean;
  notification_table_write_enabled: false;
  ok: boolean;
  polling_enabled: false;
  provider: "resend";
  provider_request_count: 0 | 1;
  reason: SendReason;
  required_env_names: typeof adminCustomerDriverDetailsEmailRequiredEnvNames;
  retry_enabled: false;
  scheduler_enabled: false;
  status: SendStatus;
  version: typeof adminCustomerDriverDetailsEmailSendActionVersion;
};

export type ResendEmailProviderResponse = {
  json?: () => Promise<unknown>;
  ok: boolean;
  status: number;
  text?: () => Promise<string>;
};

export type AdminCustomerDriverDetailsEmailSendOptions = {
  providerFetch?: (
    url: string,
    init: {
      body: string;
      headers: Record<string, string>;
      method: "POST";
      signal: AbortSignal;
    },
  ) => Promise<ResendEmailProviderResponse>;
  timeoutMs?: number;
};

const resendEmailApiUrl = "https://api.resend.com/emails";
const selectedProvider = "resend";
const selectedSender = "Prestige Limo Dispatch <info@prestigelimo.sg>";
const selectedReplyTo = "info@prestigelimo.sg";
const allowedActorRoles = new Set(["admin", "dispatcher"]);
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeAdminSessionError =
  "Driver Details Email requires a verified admin or dispatcher session.";
const safeInvalidInputError =
  "Driver Details Email requires safe customer booking details and driver details.";
const safeProviderConfigError =
  "Driver Details Email provider configuration is not ready on this server.";
const safeRecipientAllowlistError =
  "Driver Details Email recipient is not approved for staging send evidence.";
const safeProviderFailureError = "Driver Details Email provider send failed safely.";
const safeProviderTimeoutError = "Driver Details Email provider send timed out safely.";

const allowedTopLevelKeys = new Set([
  "customer_booking_details",
  "driver_details",
  "recipient_email",
]);
const allowedCustomerBookingKeys = new Set([
  "booking_reference",
  "customer_visible_booking_reference",
  "customer_passenger_traveler_name",
  "customer_facing_flight_number",
  "drop_off_location",
  "passenger_count",
  "pickup_date",
  "pickup_location",
  "pickup_time",
  "service_type",
]);
const allowedDriverKeys = new Set([
  "car_plate",
  "car_type",
  "driver_contact",
  "driver_name",
]);
const forbiddenFragments = [
  "admin_note",
  "auth",
  "billing",
  "calendar",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_payout",
  "driver_payout_rules",
  "internal",
  "invoice",
  "ots",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "payout_preferences",
  "photo",
  "pricing",
  "raw_provider",
  "saved_booking",
  "secret",
  "token",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = 200) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function normalizedForScan(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1_$2")
    .replace(/[^a-z0-9]+/gi, "_")
    .toLowerCase();
}

function containsForbiddenFragment(value: string) {
  const normalized = normalizedForScan(value);

  return forbiddenFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = 200) {
  const text = textOrNull(value, maxLength);

  if (!text || containsForbiddenFragment(text)) {
    return null;
  }

  return text;
}

function safeEmail(value: unknown) {
  const text = textOrNull(value, 254)?.toLowerCase();

  if (!text || containsForbiddenFragment(text)) {
    return null;
  }

  return /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/.test(text)
    ? text
    : null;
}

function cleanConfigValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me")
  );
}

export function adminCustomerDriverDetailsEmailSendGateOpen() {
  return process.env[adminCustomerDriverDetailsEmailSendActionEnvGateName] === "true";
}

function sendGateOpen() {
  return adminCustomerDriverDetailsEmailSendGateOpen();
}

function actorCanSend(actor: AdminBookingPersistenceAdapterActor) {
  return Boolean(
    actor &&
      actor.boundary_mode === "server-session-role-surface" &&
      allowedActorRoles.has(actor.actor_role) &&
      actor.source_surface === "admin_api" &&
      textOrNull(actor.actor_label),
  );
}

function validConfigValue(value: string | null) {
  return Boolean(value && !isPlaceholderConfigValue(value));
}

function validProviderToken(value: string | null) {
  return Boolean(value && !isPlaceholderConfigValue(value) && value.trim().length >= 12);
}

function parseAllowlist(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return [];
  }

  return value
    .split(/[,;\s]+/)
    .map((entry) => safeEmail(entry))
    .filter((entry): entry is string => Boolean(entry));
}

function keysAreAllowed(record: UnknownRecord, allowedKeys: Set<string>) {
  return Object.keys(record).every((key) => allowedKeys.has(key) && !containsForbiddenFragment(key));
}

function normalizePayload(input: CustomerDriverDetailsEmailSendInput) {
  const record = asRecord(input);
  const customerBooking = asRecord(record.customer_booking_details);
  const driver = asRecord(record.driver_details);

  if (!keysAreAllowed(record, allowedTopLevelKeys)) {
    return null;
  }

  if (!keysAreAllowed(customerBooking, allowedCustomerBookingKeys)) {
    return null;
  }

  if (!keysAreAllowed(driver, allowedDriverKeys)) {
    return null;
  }

  const payload: CustomerDriverDetailsEmailPayload = {
    customer_booking_details: {
      booking_reference: safeText(customerBooking.booking_reference, 120) || "",
      customer_visible_booking_reference:
        safeText(customerBooking.customer_visible_booking_reference, 120) ||
        safeText(customerBooking.booking_reference, 120) ||
        "",
      customer_passenger_traveler_name: safeText(
        customerBooking.customer_passenger_traveler_name,
        120,
      ),
      customer_facing_flight_number: safeText(
        customerBooking.customer_facing_flight_number,
        60,
      ),
      drop_off_location: safeText(customerBooking.drop_off_location, 220) || "",
      passenger_count: safeText(customerBooking.passenger_count, 40) || "",
      pickup_date: safeText(customerBooking.pickup_date, 80) || "",
      pickup_location: safeText(customerBooking.pickup_location, 220) || "",
      pickup_time: safeText(customerBooking.pickup_time, 80) || "",
      service_type: safeText(customerBooking.service_type, 120) || "",
    },
    driver_details: {
      car_plate: safeText(driver.car_plate, 60) || "",
      car_type: safeText(driver.car_type, 120) || "",
      driver_contact: safeText(driver.driver_contact, 80) || "",
      driver_name: safeText(driver.driver_name, 120) || "",
    },
    recipient_email: safeEmail(record.recipient_email) || "",
  };

  const requiredValues = [
    payload.recipient_email,
    payload.customer_booking_details.booking_reference,
    payload.customer_booking_details.service_type,
    payload.customer_booking_details.pickup_date,
    payload.customer_booking_details.pickup_time,
    payload.customer_booking_details.pickup_location,
    payload.customer_booking_details.drop_off_location,
    payload.customer_booking_details.passenger_count,
    payload.driver_details.driver_name,
    payload.driver_details.driver_contact,
    payload.driver_details.car_plate,
    payload.driver_details.car_type,
  ];

  return requiredValues.every(Boolean) ? payload : null;
}

function providerIdempotencyKey(payload: CustomerDriverDetailsEmailPayload) {
  const safeBookingReference = payload.customer_booking_details.booking_reference.replace(
    /[^A-Za-z0-9._:-]+/g,
    "-",
  );
  const payloadHasher = createHash("sha256");

  payloadHasher.write(JSON.stringify(payload));
  payloadHasher.end();

  const payloadVersion = payloadHasher.digest("hex");

  return `driver-details/${safeBookingReference}/${payloadVersion}`;
}

function safeResult(
  overrides: Partial<
    Omit<
      AdminCustomerDriverDetailsEmailSendResult,
      | "batch_send_enabled"
      | "blast_enabled"
      | "database_persistence_enabled"
      | "delivery_surface"
      | "env_gate_name"
      | "fallback_enabled"
      | "invoice_email_enabled"
      | "live_location_email_enabled"
      | "notification_table_write_enabled"
      | "polling_enabled"
      | "provider"
      | "required_env_names"
      | "retry_enabled"
      | "scheduler_enabled"
      | "version"
    >
  >,
): AdminCustomerDriverDetailsEmailSendResult {
  return {
    batch_send_enabled: false,
    blast_enabled: false,
    database_persistence_enabled: false,
    delivery_surface: "admin_customer_driver_details_email_send_action",
    email_send_enabled: false,
    env_gate_name: adminCustomerDriverDetailsEmailSendActionEnvGateName,
    external_send: false,
    fallback_enabled: false,
    invoice_email_enabled: false,
    live_location_email_enabled: false,
    message_id: null,
    no_op: true,
    notification_table_write_enabled: false,
    ok: false,
    polling_enabled: false,
    provider: "resend",
    provider_request_count: 0,
    reason: "email_send_gate_closed",
    required_env_names: adminCustomerDriverDetailsEmailRequiredEnvNames,
    retry_enabled: false,
    scheduler_enabled: false,
    status: "blocked",
    version: adminCustomerDriverDetailsEmailSendActionVersion,
    ...overrides,
  };
}

export function adminCustomerDriverDetailsEmailClosedGateResult() {
  return safeResult({
    error: "Driver Details Email send gate is closed.",
    reason: "email_send_gate_closed",
    status: "blocked",
  });
}

function safeTimeoutMs(value: number | undefined) {
  return Number.isFinite(value) && value && value >= 1000 && value <= 10000 ? value : 5000;
}

function buildEmailText(payload: CustomerDriverDetailsEmailPayload) {
  const customerName = payload.customer_booking_details.customer_passenger_traveler_name;
  const greetingLines = customerName ? [`Hi ${customerName},`, ""] : [];
  const customerNameLine = customerName
    ? [`Passenger name: ${customerName}`]
    : [];
  const flightLine = payload.customer_booking_details.customer_facing_flight_number
    ? [`Customer-facing flight number: ${payload.customer_booking_details.customer_facing_flight_number}`]
    : [];

  return [
    ...greetingLines,
    "CUSTOMER BOOKING DETAILS",
    ...customerNameLine,
    `Booking reference: ${payload.customer_booking_details.customer_visible_booking_reference}`,
    `Service type: ${payload.customer_booking_details.service_type}`,
    `Pickup date: ${payload.customer_booking_details.pickup_date}`,
    `Pickup time: ${payload.customer_booking_details.pickup_time}`,
    `Pickup location: ${payload.customer_booking_details.pickup_location}`,
    `Drop-off location: ${payload.customer_booking_details.drop_off_location}`,
    `Passenger count: ${payload.customer_booking_details.passenger_count}`,
    ...flightLine,
    "",
    "DRIVER DETAILS",
    `Driver name: ${payload.driver_details.driver_name}`,
    `Driver contact: ${payload.driver_details.driver_contact}`,
    `Car plate: ${payload.driver_details.car_plate}`,
    `Car type: ${payload.driver_details.car_type}`,
  ].join("\n");
}

function buildProviderBody(payload: CustomerDriverDetailsEmailPayload, from: string, replyTo: string) {
  return JSON.stringify({
    from,
    reply_to: replyTo,
    subject: `Driver details for ${payload.customer_booking_details.customer_visible_booking_reference}`,
    text: buildEmailText(payload),
    to: [payload.recipient_email],
  });
}

function safeMessageId(value: unknown) {
  const text = textOrNull(value, 160);

  return text && /^[A-Za-z0-9_./:@-]{1,160}$/.test(text) && !containsForbiddenFragment(text)
    ? text
    : null;
}

async function normalizedMessageId(response: ResendEmailProviderResponse) {
  const body = response.json ? await response.json() : {};
  const record = asRecord(body);

  return safeMessageId(record.id) || safeMessageId(record.message_id);
}

function isProviderTimeout(error: unknown) {
  const record = asRecord(error);
  const name = textOrNull(record.name)?.toLowerCase() || "";
  const message = textOrNull(record.message)?.toLowerCase() || "";

  return name.includes("abort") || name.includes("timeout") || message.includes("timeout");
}

export async function executeAdminCustomerDriverDetailsEmailSendAction(
  input: CustomerDriverDetailsEmailSendInput,
  actor: AdminBookingPersistenceAdapterActor,
  options?: AdminCustomerDriverDetailsEmailSendOptions,
): Promise<AdminCustomerDriverDetailsEmailSendResult> {
  if (!sendGateOpen()) {
    return adminCustomerDriverDetailsEmailClosedGateResult();
  }

  if (!actorCanSend(actor)) {
    return safeResult({
      error: safeAdminSessionError,
      reason: "admin_session_required",
      status: "blocked",
    });
  }

  const payload = normalizePayload(input);

  if (!payload) {
    return safeResult({
      error: safeInvalidInputError,
      reason: "invalid_input",
      status: "rejected",
    });
  }

  const provider = cleanConfigValue(process.env.PRESTIGE_EMAIL_PROVIDER)?.toLowerCase() || null;
  const from = cleanConfigValue(process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_FROM);
  const replyTo = cleanConfigValue(process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO);
  const allowlist = parseAllowlist(
    cleanConfigValue(process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST),
  );
  const apiKey = cleanConfigValue(process.env.RESEND_API_KEY);

  if (
    provider !== selectedProvider ||
    from !== selectedSender ||
    replyTo?.toLowerCase() !== selectedReplyTo ||
    allowlist.length === 0 ||
    !validProviderToken(apiKey) ||
    !validConfigValue(from) ||
    !validConfigValue(replyTo)
  ) {
    return safeResult({
      error: safeProviderConfigError,
      reason: "provider_not_configured",
      status: "blocked",
    });
  }

  if (!allowlist.includes(payload.recipient_email)) {
    return safeResult({
      error: safeRecipientAllowlistError,
      reason: "recipient_not_allowlisted",
      status: "rejected",
    });
  }

  const providerFetch = options?.providerFetch || fetch;
  const signal = AbortSignal.timeout(safeTimeoutMs(options?.timeoutMs));

  try {
    const response = await providerFetch(resendEmailApiUrl, {
      body: buildProviderBody(payload, from, replyTo),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": providerIdempotencyKey(payload),
      },
      method: "POST",
      signal,
    });

    if (!response.ok) {
      return safeResult({
        email_send_enabled: true,
        error: safeProviderFailureError,
        provider_request_count: 1,
        reason: "provider_failure",
        status: "failed",
      });
    }

    return safeResult({
      email_send_enabled: true,
      external_send: true,
      message_id: await normalizedMessageId(response),
      no_op: false,
      ok: true,
      provider_request_count: 1,
      reason: "send_succeeded",
      status: "sent",
    });
  } catch (error) {
    return safeResult({
      email_send_enabled: true,
      error: isProviderTimeout(error) ? safeProviderTimeoutError : safeProviderFailureError,
      provider_request_count: 1,
      reason: isProviderTimeout(error) ? "provider_timeout" : "provider_failure",
      status: "failed",
    });
  }
}
