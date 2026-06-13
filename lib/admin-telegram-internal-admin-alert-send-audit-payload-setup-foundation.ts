import "server-only";

import {
  buildAdminTelegramInternalAdminAlertSetup,
  type AdminTelegramInternalAdminAlertEventType,
  type AdminTelegramInternalAdminAlertSetupResult,
} from "./admin-telegram-internal-admin-alert-setup-foundation";

export const adminTelegramInternalAdminAlertSendAuditPayloadSetupFoundationVersion =
  "admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation-v1";

export type AdminTelegramInternalAdminAlertSendAuditPayloadMissingRequirement =
  | "action_source"
  | "disabled_send_adapter"
  | "event_type"
  | "safe_message";

export type AdminTelegramInternalAdminAlertSendAuditPayloadSetupInput = {
  actionSource?: unknown;
  action_source?: unknown;
  alert?: AdminTelegramInternalAdminAlertSetupResult | null;
  bookingReference?: unknown;
  booking_reference?: unknown;
  eventType?: unknown;
  event_type?: unknown;
  safeMessage?: unknown;
  safeTitle?: unknown;
  safe_message?: unknown;
  safe_title?: unknown;
};

export type AdminTelegramInternalAdminAlertSendAuditBlockedNoOpResult = {
  external_send: false;
  liveSendingEnabled: false;
  no_op: true;
  providerConfigured: false;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  sendingEnabled: false;
  status: "blocked";
};

export type AdminTelegramInternalAdminAlertSendAuditPayloadSetupResult = {
  actionSource: string | null;
  action_source: string | null;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: string | null;
    auditWriteEnabled: false;
    bookingReference: string | null;
    channel: "telegram_internal_admin";
    disabledSendStatus: "blocked" | "missing";
    eventKey: string | null;
    eventType: AdminTelegramInternalAdminAlertEventType | null;
    external_send: false;
    liveSendingEnabled: false;
    preview: {
      safe_message: string | null;
      safe_title: string | null;
    };
    providerConfigured: false;
    result: AdminTelegramInternalAdminAlertSendAuditBlockedNoOpResult;
    sendingEnabled: false;
  };
  blocked_no_op_result: AdminTelegramInternalAdminAlertSendAuditBlockedNoOpResult;
  bookingReference: string | null;
  booking_reference: string | null;
  channel: "telegram_internal_admin";
  delivery_surface: "telegram_internal_admin_alert_send_audit_payload_setup_only";
  disabled_send_status: "blocked" | "missing";
  eventKey: string | null;
  eventType: AdminTelegramInternalAdminAlertEventType | null;
  event_type: AdminTelegramInternalAdminAlertEventType | null;
  external_send: false;
  liveSendingEnabled: false;
  missing_requirements: AdminTelegramInternalAdminAlertSendAuditPayloadMissingRequirement[];
  providerConfigured: false;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminTelegramInternalAdminAlertSendAuditPayloadSetupFoundationVersion;
};

const blockedNoOpResult: AdminTelegramInternalAdminAlertSendAuditBlockedNoOpResult = {
  external_send: false,
  liveSendingEnabled: false,
  no_op: true,
  providerConfigured: false,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  sendingEnabled: false,
  status: "blocked",
};

function alertFrom(
  input: AdminTelegramInternalAdminAlertSendAuditPayloadSetupInput,
): AdminTelegramInternalAdminAlertSetupResult {
  if (input.alert) {
    return input.alert;
  }

  return buildAdminTelegramInternalAdminAlertSetup({
    action_source: input.actionSource ?? input.action_source,
    booking_reference: input.bookingReference ?? input.booking_reference,
    event_type: input.eventType ?? input.event_type,
    safe_message: input.safeMessage ?? input.safe_message,
    safe_title: input.safeTitle ?? input.safe_title,
  });
}

function hasDisabledNoOpAdapter(alert: AdminTelegramInternalAdminAlertSetupResult) {
  return Boolean(
    alert.disabled_adapter &&
      alert.disabled_adapter.delivery_surface === "telegram_disabled" &&
      alert.disabled_adapter.external_send === false &&
      alert.disabled_adapter.status === "disabled",
  );
}

export function buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup(
  input: AdminTelegramInternalAdminAlertSendAuditPayloadSetupInput,
): AdminTelegramInternalAdminAlertSendAuditPayloadSetupResult {
  const alert = alertFrom(input);
  const disabledSendReady = hasDisabledNoOpAdapter(alert);
  const missingRequirements: AdminTelegramInternalAdminAlertSendAuditPayloadMissingRequirement[] = [
    ...alert.missing_requirements,
  ];

  if (!alert.action_source) {
    missingRequirements.unshift("action_source");
  }

  if (!disabledSendReady) {
    missingRequirements.push("disabled_send_adapter");
  }

  const disabledSendStatus = disabledSendReady ? "blocked" : "missing";

  return {
    actionSource: alert.action_source,
    action_source: alert.action_source,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: alert.action_source,
      auditWriteEnabled: false,
      bookingReference: alert.booking_reference,
      channel: alert.channel,
      disabledSendStatus,
      eventKey: alert.disabled_adapter.event_key,
      eventType: alert.event_type,
      external_send: false,
      liveSendingEnabled: false,
      preview: alert.disabled_adapter.preview,
      providerConfigured: false,
      result: blockedNoOpResult,
      sendingEnabled: false,
    },
    blocked_no_op_result: blockedNoOpResult,
    bookingReference: alert.booking_reference,
    booking_reference: alert.booking_reference,
    channel: alert.channel,
    delivery_surface: "telegram_internal_admin_alert_send_audit_payload_setup_only",
    disabled_send_status: disabledSendStatus,
    eventKey: alert.disabled_adapter.event_key,
    eventType: alert.event_type,
    event_type: alert.event_type,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: missingRequirements,
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: adminTelegramInternalAdminAlertSendAuditPayloadSetupFoundationVersion,
  };
}
