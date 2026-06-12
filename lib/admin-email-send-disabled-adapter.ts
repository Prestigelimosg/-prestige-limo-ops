import "server-only";

export const adminEmailSendDisabledAdapterVersion =
  "admin-email-send-disabled-adapter-v1";

export type AdminEmailPreparedPayload = {
  body_lines?: unknown;
  booking_reference?: unknown;
  recipient_email?: unknown;
  sender_key?: unknown;
  subject?: unknown;
  template_key?: unknown;
};

export type AdminEmailSendDisabledAdapterResult = {
  delivery_surface: "email_disabled";
  external_send: false;
  payload_preview: {
    booking_reference: string | null;
    body_line_count: number;
    recipient_email: string | null;
    sender_key: string | null;
    subject: string | null;
    template_key: string | null;
  };
  reason: "setup_only_disabled";
  sendingEnabled: false;
  status: "blocked";
  version: typeof adminEmailSendDisabledAdapterVersion;
};

const maxTextLength = 180;
const maxEmailLength = 254;
const blockedFragments = [
  "amount_due",
  "auth_link",
  "billing_amount",
  "card_number",
  "customer_auth",
  "customer_price",
  "driver_auth",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "invoice_pdf",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pricing",
  "private_key",
  "quoted_price",
  "rate_amount",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "smtp",
  "stripe",
  "token",
];

const basicEmailPattern = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;

function normalizedText(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function safeText(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  return blockedFragments.some((fragment) => normalizedText(cleaned).includes(fragment)) ? null : cleaned;
}

function safeEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().toLowerCase();

  if (!cleaned || cleaned.length > maxEmailLength || !basicEmailPattern.test(cleaned)) {
    return null;
  }

  return blockedFragments.some((fragment) => cleaned.includes(fragment)) ? null : cleaned;
}

function safeBodyLineCount(value: unknown) {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.filter((line) => safeText(line)).length;
}

export function prepareDisabledAdminEmailSend(
  payload: AdminEmailPreparedPayload,
): AdminEmailSendDisabledAdapterResult {
  return {
    delivery_surface: "email_disabled",
    external_send: false,
    payload_preview: {
      booking_reference: safeText(payload.booking_reference, 120),
      body_line_count: safeBodyLineCount(payload.body_lines),
      recipient_email: safeEmail(payload.recipient_email),
      sender_key: safeText(payload.sender_key, 80),
      subject: safeText(payload.subject, 120),
      template_key: safeText(payload.template_key, 80),
    },
    reason: "setup_only_disabled",
    sendingEnabled: false,
    status: "blocked",
    version: adminEmailSendDisabledAdapterVersion,
  };
}
