import "server-only";

export const adminBookingChangeRequestEmailAlertVersion =
  "admin-booking-change-request-email-alert-v1";
export const adminBookingChangeRequestEmailAlertEnvGateName =
  "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_ENABLED";
export const adminBookingChangeRequestEmailAlertRequiredEnvNames = [
  adminBookingChangeRequestEmailAlertEnvGateName,
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_ADMIN_NEW_BOOKING_EMAIL_ALERT_TO",
  "RESEND_API_KEY",
] as const;

type BookingChangeRequestKind = "amendment" | "cancellation";
type AlertStatus = "blocked" | "failed" | "sent";
type AlertReason =
  | "alert_gate_closed"
  | "invalid_request"
  | "provider_failure"
  | "provider_not_configured"
  | "provider_timeout"
  | "send_succeeded";

export type AdminBookingChangeRequestEmailAlertInput = {
  booking_reference: string | null;
  current_dropoff_location: string | null;
  current_pickup_at: string | null;
  current_pickup_location: string | null;
  current_service_type: string | null;
  passenger_name: string | null;
  request_kind: BookingChangeRequestKind;
  request_note: string | null;
  requested_dropoff_location: string | null;
  requested_pickup_date: string | null;
  requested_pickup_location: string | null;
  requested_service_type: string | null;
  requested_pickup_time: string | null;
};

export type AdminBookingChangeRequestEmailAlertResult = {
  batch_send_enabled: false;
  billing_email_enabled: false;
  blast_enabled: false;
  calendar_sync_enabled: false;
  customer_message_enabled: false;
  database_write_enabled: false;
  delivery_surface: "admin_booking_change_request_email_alert";
  email_alert_enabled: boolean;
  env_gate_name: typeof adminBookingChangeRequestEmailAlertEnvGateName;
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
  required_env_names: typeof adminBookingChangeRequestEmailAlertRequiredEnvNames;
  retry_enabled: false;
  scheduler_enabled: false;
  status: AlertStatus;
  version: typeof adminBookingChangeRequestEmailAlertVersion;
};

export type AdminBookingChangeRequestEmailAlertProviderResponse = {
  json?: () => Promise<unknown>;
  ok: boolean;
  status: number;
};

export type AdminBookingChangeRequestEmailAlertOptions = {
  env?: NodeJS.ProcessEnv;
  providerFetch?: (
    url: string,
    init: {
      body: string;
      headers: Record<string, string>;
      method: "POST";
      signal: AbortSignal;
    },
  ) => Promise<AdminBookingChangeRequestEmailAlertProviderResponse>;
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
  "Admin booking change request Email alert provider is not ready on this server.";
const safeProviderFailureError = "Admin booking change request Email alert failed safely.";
const safeProviderTimeoutError = "Admin booking change request Email alert timed out safely.";
const safeInvalidRequestError =
  "Admin booking change request Email alert requires a safe change request.";
const forbiddenFragments = [
  "admin_note",
  "auth",
  "billing",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_payout",
  "driver_payout_rules",
  "finance",
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

function textOrNull(value: unknown, maxLength = 240) {
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

function safeText(value: unknown, maxLength = 240) {
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
      AdminBookingChangeRequestEmailAlertResult,
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
): AdminBookingChangeRequestEmailAlertResult {
  return {
    batch_send_enabled: false,
    billing_email_enabled: false,
    blast_enabled: false,
    calendar_sync_enabled: false,
    customer_message_enabled: false,
    database_write_enabled: false,
    delivery_surface: "admin_booking_change_request_email_alert",
    email_alert_enabled: false,
    env_gate_name: adminBookingChangeRequestEmailAlertEnvGateName,
    external_send: false,
    gps_enabled: false,
    invoice_email_enabled: false,
    message_id: null,
    no_op: true,
    ok: false,
    provider: "resend",
    provider_request_count: 0,
    reason: "alert_gate_closed",
    required_env_names: adminBookingChangeRequestEmailAlertRequiredEnvNames,
    retry_enabled: false,
    scheduler_enabled: false,
    status: "blocked",
    version: adminBookingChangeRequestEmailAlertVersion,
    ...overrides,
  };
}

export function adminBookingChangeRequestEmailAlertGateOpen(
  env: NodeJS.ProcessEnv = process.env,
) {
  return env[adminBookingChangeRequestEmailAlertEnvGateName] === "true";
}

export function adminBookingChangeRequestEmailAlertClosedGateResult() {
  return safeResult({
    error: "Admin booking change request Email alert gate is closed.",
    reason: "alert_gate_closed",
    status: "blocked",
  });
}

function safeTimeoutMs(value: number | undefined) {
  return Number.isFinite(value) && value && value >= 1000 && value <= 10000 ? value : 5000;
}

function normalizeRequest(input: AdminBookingChangeRequestEmailAlertInput) {
  const bookingReference = safeText(input.booking_reference, 120);

  if (!bookingReference) {
    return null;
  }

  const requestKind: BookingChangeRequestKind =
    input.request_kind === "cancellation" ? "cancellation" : "amendment";

  return {
    booking_reference: bookingReference,
    current_dropoff_location: safeText(input.current_dropoff_location),
    current_pickup_at: safeText(input.current_pickup_at, 120),
    current_pickup_location: safeText(input.current_pickup_location),
    current_service_type: safeText(input.current_service_type, 120),
    passenger_name: safeText(input.passenger_name, 140),
    request_kind: requestKind,
    request_note: safeText(input.request_note, 500),
    requested_dropoff_location: safeText(input.requested_dropoff_location),
    requested_pickup_date: safeText(input.requested_pickup_date, 40),
    requested_pickup_location: safeText(input.requested_pickup_location),
    requested_service_type: safeText(input.requested_service_type, 120),
    requested_pickup_time: safeText(input.requested_pickup_time, 40),
  };
}

function requestKindTitle(requestKind: BookingChangeRequestKind) {
  return requestKind === "cancellation" ? "Cancellation" : "Amendment";
}

function buildEmailText(request: NonNullable<ReturnType<typeof normalizeRequest>>) {
  const title = requestKindTitle(request.request_kind);

  return [
    `Customer booking ${request.request_kind} request received.`,
    "",
    `Reference: ${request.booking_reference}`,
    request.passenger_name ? `Passenger: ${request.passenger_name}` : "",
    request.current_service_type ? `Current service: ${request.current_service_type}` : "",
    request.current_pickup_at ? `Current pickup time: ${request.current_pickup_at}` : "",
    request.current_pickup_location ? `Current pickup: ${request.current_pickup_location}` : "",
    request.current_dropoff_location ? `Current drop-off: ${request.current_dropoff_location}` : "",
    request.requested_pickup_date ? `Requested date: ${request.requested_pickup_date}` : "",
    request.requested_pickup_time ? `Requested time: ${request.requested_pickup_time}` : "",
    request.requested_pickup_location ? `Requested pickup: ${request.requested_pickup_location}` : "",
    request.requested_dropoff_location ? `Requested drop-off: ${request.requested_dropoff_location}` : "",
    request.requested_service_type ? `Requested service: ${request.requested_service_type}` : "",
    request.request_note ? `Customer note: ${request.request_note}` : "",
    "",
    `${title} must be reviewed in Prestige before changes are confirmed.`,
    `Open dashboard: ${appDashboardUrl}`,
  ]
    .filter((line) => line !== "")
    .join("\n");
}

function buildProviderBody(
  request: NonNullable<ReturnType<typeof normalizeRequest>>,
  recipient: string,
) {
  return JSON.stringify({
    from: selectedSender,
    reply_to: selectedReplyTo,
    subject: `Booking ${request.request_kind} request: ${request.booking_reference}`,
    text: buildEmailText(request),
    to: [recipient],
  });
}

function safeMessageId(value: unknown) {
  const text = textOrNull(value, 160);

  return text && /^[A-Za-z0-9_./:@-]{1,160}$/.test(text) && !containsForbiddenFragment(text)
    ? text
    : null;
}

async function normalizedMessageId(
  response: AdminBookingChangeRequestEmailAlertProviderResponse,
) {
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

function idempotencyKey(request: NonNullable<ReturnType<typeof normalizeRequest>>) {
  const safeReference = request.booking_reference.replace(/[^A-Za-z0-9._:-]+/g, "-");

  return `booking-change-request-${request.request_kind}-${safeReference}`;
}

export async function sendAdminBookingChangeRequestEmailAlert(
  input: AdminBookingChangeRequestEmailAlertInput,
  options?: AdminBookingChangeRequestEmailAlertOptions,
): Promise<AdminBookingChangeRequestEmailAlertResult> {
  const env = options?.env || process.env;

  if (!adminBookingChangeRequestEmailAlertGateOpen(env)) {
    return adminBookingChangeRequestEmailAlertClosedGateResult();
  }

  const normalizedRequest = normalizeRequest(input);

  if (!normalizedRequest) {
    return safeResult({
      email_alert_enabled: true,
      error: safeInvalidRequestError,
      reason: "invalid_request",
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
      body: buildProviderBody(normalizedRequest, recipient),
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": idempotencyKey(normalizedRequest),
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
