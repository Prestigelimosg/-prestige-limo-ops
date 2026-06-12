import "server-only";

export const adminEmailNotificationSetupFoundationVersion =
  "admin-email-notification-setup-foundation-v1";

export type AdminEmailNotificationSetupInput = {
  body_lines?: unknown;
  booking_reference?: unknown;
  event_key?: unknown;
  notification_type?: unknown;
  preview_text?: unknown;
  recipient_role?: unknown;
  safe_context?: Record<string, unknown> | null;
  subject?: unknown;
};

export type AdminEmailNotificationSetupResult = {
  delivery_surface: "email_setup_only";
  external_send: false;
  payload: {
    body_lines: string[];
    booking_reference: string | null;
    event_key: string | null;
    notification_type: string | null;
    preview_text: string | null;
    recipient_role: string | null;
    subject: string | null;
  };
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminEmailNotificationSetupFoundationVersion;
};

const maxTextLength = 240;
const maxBodyLineCount = 8;
const blockedFragments = [
  "amount_due",
  "auth_link",
  "billing_amount",
  "billing_rate",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "debug",
  "delivery_payload",
  "driver_auth",
  "driver_payout",
  "external_delivery",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice_pdf",
  "live_location",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "stripe",
  "token",
];

function safeText(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  const normalized = cleaned.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  return blockedFragments.some((fragment) => normalized.includes(fragment)) ? null : cleaned;
}

function safeBodyLines(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((line) => safeText(line))
    .filter((line): line is string => Boolean(line))
    .slice(0, maxBodyLineCount);
}

export function buildAdminEmailNotificationSetupPayload(
  input: AdminEmailNotificationSetupInput,
): AdminEmailNotificationSetupResult {
  return {
    delivery_surface: "email_setup_only",
    external_send: false,
    payload: {
      body_lines: safeBodyLines(input.body_lines),
      booking_reference: safeText(input.booking_reference, 120),
      event_key: safeText(input.event_key, 160),
      notification_type: safeText(input.notification_type, 80),
      preview_text: safeText(input.preview_text, 160),
      recipient_role: safeText(input.recipient_role, 80),
      subject: safeText(input.subject, 120),
    },
    sendingEnabled: false,
    status: "setup_only",
    version: adminEmailNotificationSetupFoundationVersion,
  };
}
