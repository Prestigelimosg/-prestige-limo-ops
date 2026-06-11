import "server-only";

import type { AdminAppNotificationPriority, AdminAppNotificationType } from "./admin-app-notification-persistence";

export const adminTelegramAlertDisabledAdapterVersion =
  "admin-telegram-alert-disabled-adapter-v1";

export type AdminTelegramDisabledAlertInput = {
  booking_reference?: string | null;
  event_key?: string | null;
  notification_type?: AdminAppNotificationType | string | null;
  priority?: AdminAppNotificationPriority | string | null;
  safe_context?: Record<string, unknown> | null;
  safe_message?: string | null;
  safe_title?: string | null;
  workflow_area?: string | null;
};

export type AdminTelegramDisabledAlertResult = {
  delivery_surface: "telegram_disabled";
  event_key: string | null;
  external_send: false;
  notification_type: string | null;
  preview: {
    safe_message: string | null;
    safe_title: string | null;
  };
  status: "disabled";
  version: typeof adminTelegramAlertDisabledAdapterVersion;
};

const maxTextLength = 240;
const forbiddenFragments = [
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

function textOrNull(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  const normalized = cleaned.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  return forbiddenFragments.some((fragment) => normalized.includes(fragment)) ? null : cleaned;
}

export function prepareDisabledAdminTelegramAlert(
  input: AdminTelegramDisabledAlertInput,
): AdminTelegramDisabledAlertResult {
  return {
    delivery_surface: "telegram_disabled",
    event_key: textOrNull(input.event_key, 160),
    external_send: false,
    notification_type: textOrNull(input.notification_type, 80),
    preview: {
      safe_message: textOrNull(input.safe_message, maxTextLength),
      safe_title: textOrNull(input.safe_title, 120),
    },
    status: "disabled",
    version: adminTelegramAlertDisabledAdapterVersion,
  };
}
