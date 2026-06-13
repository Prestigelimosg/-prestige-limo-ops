import "server-only";

import {
  prepareDisabledAdminTelegramAlert,
  type AdminTelegramDisabledAlertResult,
} from "./admin-telegram-alert-disabled-adapter";

export const adminTelegramInternalAdminAlertSetupFoundationVersion =
  "admin-telegram-internal-admin-alert-setup-foundation-v1";

export const adminTelegramInternalAdminAlertEventTypes = [
  "driver_ack_customer_message_ready",
  "customer_driver_details_email_ready",
  "urgent_review_required",
] as const;

export type AdminTelegramInternalAdminAlertEventType =
  (typeof adminTelegramInternalAdminAlertEventTypes)[number];

export type AdminTelegramInternalAdminAlertSetupInput = {
  action_source?: unknown;
  booking_reference?: unknown;
  event_type?: unknown;
  safe_message?: unknown;
  safe_title?: unknown;
};

export type AdminTelegramInternalAdminAlertSetupResult = {
  action_source: string | null;
  alert_payload: {
    action_source: string | null;
    booking_reference: string | null;
    channel: "telegram_internal_admin";
    event_type: AdminTelegramInternalAdminAlertEventType | null;
    external_send: false;
    providerConfigured: false;
    safe_message: string | null;
    safe_title: string | null;
    sendingEnabled: false;
  };
  booking_reference: string | null;
  channel: "telegram_internal_admin";
  delivery_surface: "telegram_internal_admin_alert_setup_only";
  disabled_adapter: AdminTelegramDisabledAlertResult;
  event_type: AdminTelegramInternalAdminAlertEventType | null;
  external_send: false;
  missing_requirements: Array<"event_type" | "safe_message">;
  providerConfigured: false;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminTelegramInternalAdminAlertSetupFoundationVersion;
};

const maxTextLength = 240;
const blockedFragments = [
  "amount_due",
  "auth_link",
  "billing_amount",
  "billing_rate",
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
  "invoice",
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
  "send_log",
  "send_state",
  "server_secret",
  "service_role",
  "sms",
  "stripe",
  "token",
  "whatsapp",
];

function normalizeToken(value: string) {
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

  return blockedFragments.some((fragment) => normalizeToken(cleaned).includes(fragment))
    ? null
    : cleaned;
}

function normalizeEventType(value: unknown): AdminTelegramInternalAdminAlertEventType | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = normalizeToken(value);

  return adminTelegramInternalAdminAlertEventTypes.includes(
    normalized as AdminTelegramInternalAdminAlertEventType,
  )
    ? (normalized as AdminTelegramInternalAdminAlertEventType)
    : null;
}

function defaultTitle(eventType: AdminTelegramInternalAdminAlertEventType | null) {
  switch (eventType) {
    case "driver_ack_customer_message_ready":
      return "Driver acknowledgement customer message ready";
    case "customer_driver_details_email_ready":
      return "Customer driver details email ready";
    case "urgent_review_required":
      return "Urgent admin review required";
    default:
      return null;
  }
}

function defaultMessage(
  eventType: AdminTelegramInternalAdminAlertEventType | null,
  bookingReference: string | null,
) {
  const bookingText = bookingReference ? ` for ${bookingReference}` : "";

  switch (eventType) {
    case "driver_ack_customer_message_ready":
      return `Driver acknowledgement customer message is ready${bookingText}.`;
    case "customer_driver_details_email_ready":
      return `Customer driver details email is ready${bookingText}.`;
    case "urgent_review_required":
      return `Urgent admin review is required${bookingText}.`;
    default:
      return null;
  }
}

export function buildAdminTelegramInternalAdminAlertSetup(
  input: AdminTelegramInternalAdminAlertSetupInput,
): AdminTelegramInternalAdminAlertSetupResult {
  const eventType = normalizeEventType(input.event_type);
  const bookingReference = safeText(input.booking_reference, 120);
  const actionSource = safeText(input.action_source, 120);
  const safeTitle = safeText(input.safe_title, 120) || defaultTitle(eventType);
  const safeMessage = safeText(input.safe_message) || defaultMessage(eventType, bookingReference);
  const disabledAdapter = prepareDisabledAdminTelegramAlert({
    booking_reference: bookingReference,
    event_key: eventType && bookingReference ? `${eventType}-${bookingReference}` : eventType,
    notification_type: eventType,
    priority: eventType === "urgent_review_required" ? "urgent" : "normal",
    safe_message: safeMessage,
    safe_title: safeTitle,
    workflow_area: "internal_admin_alert",
  });
  const missingRequirements: Array<"event_type" | "safe_message"> = [];

  if (!eventType) {
    missingRequirements.push("event_type");
  }

  if (!safeMessage) {
    missingRequirements.push("safe_message");
  }

  return {
    action_source: actionSource,
    alert_payload: {
      action_source: actionSource,
      booking_reference: bookingReference,
      channel: "telegram_internal_admin",
      event_type: eventType,
      external_send: false,
      providerConfigured: false,
      safe_message: disabledAdapter.preview.safe_message,
      safe_title: disabledAdapter.preview.safe_title,
      sendingEnabled: false,
    },
    booking_reference: bookingReference,
    channel: "telegram_internal_admin",
    delivery_surface: "telegram_internal_admin_alert_setup_only",
    disabled_adapter: disabledAdapter,
    event_type: eventType,
    external_send: false,
    missing_requirements: missingRequirements,
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: adminTelegramInternalAdminAlertSetupFoundationVersion,
  };
}
