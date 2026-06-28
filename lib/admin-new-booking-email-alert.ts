import "server-only";

import type { AdminBookingPersistenceRecord } from "./admin-booking-persistence";

export const adminNewBookingEmailAlertVersion = "admin-new-booking-email-alert-v1";
export const adminNewBookingEmailAlertEnvGateName =
  "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED";
export const adminNewBookingEmailAlertRequiredEnvNames = [
  adminNewBookingEmailAlertEnvGateName,
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO",
  "RESEND_API_KEY",
] as const;

type AlertStatus = "blocked" | "failed" | "sent";
type AlertReason =
  | "alert_gate_closed"
  | "invalid_booking"
  | "provider_failure"
  | "provider_not_configured"
  | "provider_timeout"
  | "send_succeeded";

export type AdminNewBookingEmailAlertResult = {
  batch_send_enabled: false;
  billing_email_enabled: false;
  blast_enabled: false;
  calendar_sync_enabled: false;
  customer_message_enabled: false;
  database_write_enabled: false;
  delivery_surface: "admin_new_booking_email_alert";
  email_alert_enabled: boolean;
  env_gate_name: typeof adminNewBookingEmailAlertEnvGateName;
  error?: string;
  external_send: boolean;
  gps_enabled: false;
  invoice_email_enabled: false;
  message_id: string | null;
  no_op: boolean;
  ok: boolean;
  provider: "resend";
  provider_request_count: 0 | 1;
  reason: AlertReason;
  required_env_names: typeof adminNewBookingEmailAlertRequiredEnvNames;
  retry_enabled: false;
  scheduler_enabled: false;
  status: AlertStatus;
  version: typeof adminNewBookingEmailAlertVersion;
};

export type AdminNewBookingEmailAlertProviderResponse = {
  json?: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

export type AdminNewBookingEmailAlertOptions = {
  env?: NodeJS.ProcessEnv;
  providerFetch?: (
    url: string,
    init: {
      body: string;
      headers: Record<string, string>;
      method: "POST";
      signal: AbortSignal;
    },
  ) => Promise<AdminNewBookingEmailAlertProviderResponse>;
  timeoutMs?: number;
};

type UnknownRecord = Record<string, unknown>;

const resendEmailApiUrl = "https://api.resend.com/emails";
const selectedProvider = "resend";
const selectedSender = "Prestige Limo Dispatch <info@prestigelimo.sg>";
const selectedReplyTo = "info@prestigelimo.sg";
const appDashboardUrl = "https://app.prestigelimo.sg/";
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const safeProviderConfigError =
  "Admin New Booking Email alert provider is not ready on this server.";
const safeProviderFailureError = "Admin New Booking Email alert failed safely.";
const safeProviderTimeoutError = "Admin New Booking Email alert timed out safely.";
const safeInvalidBookingError = "Admin New Booking Email alert requires a safe saved booking.";
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
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "photo",
  "pricing",
  "raw_provider",
  "secret",
  "token",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = 220) {
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

function safeText(value: unknown, maxLength = 220) {
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

function cleanConfigValue(env: NodeJS.ProcessEnv, key: string) {
  const value = env[key]?.trim();

  return value ? value : null;
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

function validProviderToken(value: string | null) {
  return Boolean(value && !isPlaceholderConfigValue(value) && value.trim().length >= 12);
}

function validConfigValue(value: string | null) {
  return Boolean(value && !isPlaceholderConfigValue(value));
}

function safeResult(
  overrides: Partial<
    Omit<
      AdminNewBookingEmailAlertResult,
      | "batch_send_enabled"
      | "billing_email_enabled"
      | "blast_enabled"
      | "calendar_sync_enabled"
      | "customer_message_enabled"
      | "database_write_enabled"
      | "delivery_surface"
      | "env_gate_name"
      | "gps_enabled"
      | "invoice_email_enabled"
      | "provider"
      | "required_env_names"
      | "retry_enabled"
      | "scheduler_enabled"
      | "version"
    >
  >,
): AdminNewBookingEmailAlertResult {
  return {
    batch_send_enabled: false,
    billing_email_enabled: false,
    blast_enabled: false,
    calendar_sync_enabled: false,
    customer_message_enabled: false,
    database_write_enabled: false,
    delivery_surface: "admin_new_booking_email_alert",
    email_alert_enabled: false,
    env_gate_name: adminNewBookingEmailAlertEnvGateName,
    external_send: false,
    gps_enabled: false,
    invoice_email_enabled: false,
    message_id: null,
    no_op: true,
    ok: false,
    provider: "resend",
    provider_request_count: 0,
    reason: "alert_gate_closed",
    required_env_names: adminNewBookingEmailAlertRequiredEnvNames,
    retry_enabled: false,
    scheduler_enabled: false,
    status: "blocked",
    version: adminNewBookingEmailAlertVersion,
    ...overrides,
  };
}

export function adminNewBookingEmailAlertGateOpen(env: NodeJS.ProcessEnv = process.env) {
  return env[adminNewBookingEmailAlertEnvGateName] === "true";
}

export function adminNewBookingEmailAlertClosedGateResult() {
  return safeResult({
    error: "Admin New Booking Email alert gate is closed.",
    reason: "alert_gate_closed",
    status: "blocked",
  });
}

function safeTimeoutMs(value: number | undefined) {
  return Number.isFinite(value) && value && value >= 1000 && value <= 10000 ? value : 5000;
}

function normalizeBooking(booking: AdminBookingPersistenceRecord) {
  const bookingRecord = asRecord(booking);
  const bookingReference = safeText(bookingRecord.booking_reference, 120);

  if (!bookingReference) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    contact_phone: safeText(bookingRecord.contact_phone, 80),
    customer_display_name: safeText(bookingRecord.customer_display_name, 140),
    dropoff_location: safeText(bookingRecord.dropoff_location, 220),
    passenger_name: safeText(bookingRecord.passenger_name, 140),
    pickup_datetime: safeText(bookingRecord.pickup_datetime, 120),
    pickup_location: safeText(bookingRecord.pickup_location, 220),
    route_type: safeText(bookingRecord.route_type, 120),
  };
}

function buildEmailText(booking: NonNullable<ReturnType<typeof normalizeBooking>>) {
  return [
    "New booking request received.",
    "",
    `Reference: ${booking.booking_reference}`,
    booking.customer_display_name ? `Customer/account: ${booking.customer_display_name}` : "",
    booking.passenger_name ? `Passenger: ${booking.passenger_name}` : "",
    booking.contact_phone ? `Contact: ${booking.contact_phone}` : "",
    booking.pickup_datetime ? `Pickup time: ${booking.pickup_datetime}` : "",
    booking.pickup_location ? `Pickup: ${booking.pickup_location}` : "",
    booking.dropoff_location ? `Drop-off: ${booking.dropoff_location}` : "",
    booking.route_type ? `Trip type: ${booking.route_type}` : "",
    "",
    `Open dashboard: ${appDashboardUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildProviderBody(
  booking: NonNullable<ReturnType<typeof normalizeBooking>>,
  recipient: string,
) {
  return JSON.stringify({
    from: selectedSender,
    reply_to: selectedReplyTo,
    subject: `New booking request: ${booking.booking_reference}`,
    text: buildEmailText(booking),
    to: [recipient],
  });
}

function safeMessageId(value: unknown) {
  const text = textOrNull(value, 160);

  return text && /^[A-Za-z0-9_./:@-]{1,160}$/.test(text) && !containsForbiddenFragment(text)
    ? text
    : null;
}

async function normalizedMessageId(response: AdminNewBookingEmailAlertProviderResponse) {
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

export async function sendAdminNewBookingEmailAlert(
  booking: AdminBookingPersistenceRecord,
  options?: AdminNewBookingEmailAlertOptions,
): Promise<AdminNewBookingEmailAlertResult> {
  const env = options?.env || process.env;

  if (!adminNewBookingEmailAlertGateOpen(env)) {
    return adminNewBookingEmailAlertClosedGateResult();
  }

  const normalizedBooking = normalizeBooking(booking);

  if (!normalizedBooking) {
    return safeResult({
      email_alert_enabled: true,
      error: safeInvalidBookingError,
      reason: "invalid_booking",
      status: "blocked",
    });
  }

  const provider = cleanConfigValue(env, "PRESTIGE_EMAIL_PROVIDER")?.toLowerCase() || null;
  const recipient = safeEmail(cleanConfigValue(env, "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO"));
  const apiKey = cleanConfigValue(env, "RESEND_API_KEY");

  if (
    provider !== selectedProvider ||
    !recipient ||
    !validConfigValue(recipient) ||
    !validProviderToken(apiKey)
  ) {
    return safeResult({
      email_alert_enabled: true,
      error: safeProviderConfigError,
      reason: "provider_not_configured",
      status: "blocked",
    });
  }

  const providerFetch = options?.providerFetch || fetch;
  const signal = AbortSignal.timeout(safeTimeoutMs(options?.timeoutMs));

  try {
    const response = await providerFetch(resendEmailApiUrl, {
      body: buildProviderBody(normalizedBooking, recipient),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `new-booking-${normalizedBooking.booking_reference}`,
      },
      method: "POST",
      signal,
    });

    if (!response.ok) {
      return safeResult({
        email_alert_enabled: true,
        error: safeProviderFailureError,
        provider_request_count: 1,
        reason: "provider_failure",
        status: "failed",
      });
    }

    return safeResult({
      email_alert_enabled: true,
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
      email_alert_enabled: true,
      error: isProviderTimeout(error) ? safeProviderTimeoutError : safeProviderFailureError,
      provider_request_count: 1,
      reason: isProviderTimeout(error) ? "provider_timeout" : "provider_failure",
      status: "failed",
    });
  }
}
