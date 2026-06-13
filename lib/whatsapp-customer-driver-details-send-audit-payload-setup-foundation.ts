import "server-only";

import {
  buildWhatsAppCustomerDriverDetailsSetup,
  type WhatsAppCustomerDriverDetailsSetupInput,
  type WhatsAppCustomerDriverDetailsSetupResult,
} from "./whatsapp-customer-driver-details-setup-foundation";

export const whatsAppCustomerDriverDetailsSendAuditPayloadSetupFoundationVersion =
  "whatsapp-customer-driver-details-send-audit-payload-setup-foundation-v1";

export const whatsAppCustomerDriverDetailsSendAuditActionSources = [
  "disabled_send_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type WhatsAppCustomerDriverDetailsSendAuditActionSource =
  (typeof whatsAppCustomerDriverDetailsSendAuditActionSources)[number];

export type WhatsAppCustomerDriverDetailsSendAuditPayloadMissingRequirement =
  | "action_source"
  | "booking_reference"
  | "disabled_send_adapter";

export type WhatsAppCustomerDriverDetailsSendAuditPayloadSetupInput =
  WhatsAppCustomerDriverDetailsSetupInput & {
    actionSource?: unknown;
    action_source?: unknown;
    customerPhone?: unknown;
    customer_phone?: unknown;
    messageTarget?: unknown;
    message_target?: unknown;
    setup?: WhatsAppCustomerDriverDetailsSetupResult | null;
  };

export type WhatsAppCustomerDriverDetailsSendAuditBlockedNoOpResult = {
  external_send: false;
  liveSendingEnabled: false;
  no_op: true;
  providerConfigured: false;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  sendingEnabled: false;
  status: "blocked";
};

export type WhatsAppCustomerDriverDetailsSendAuditPayloadSetupResult = {
  actionSource: WhatsAppCustomerDriverDetailsSendAuditActionSource | null;
  action_source: WhatsAppCustomerDriverDetailsSendAuditActionSource | null;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: WhatsAppCustomerDriverDetailsSendAuditActionSource | null;
    auditWriteEnabled: false;
    bookingReference: string | null;
    booking_reference: string | null;
    channel: "whatsapp_customer";
    customerPhone: string | null;
    customer_phone: string | null;
    disabledSendStatus: "blocked" | "missing";
    eventKey: string | null;
    external_send: false;
    liveSendingEnabled: false;
    messageKey: "customer_assigned_driver_details_whatsapp";
    messageTarget: string | null;
    message_target: string | null;
    preview: {
      safe_message: string | null;
      safe_title: string | null;
    };
    providerConfigured: false;
    readinessStatus: "ready_for_future_setup" | "blocked";
    result: WhatsAppCustomerDriverDetailsSendAuditBlockedNoOpResult;
    sendingEnabled: false;
  };
  audit_write_enabled: false;
  blocked_no_op_result: WhatsAppCustomerDriverDetailsSendAuditBlockedNoOpResult;
  bookingReference: string | null;
  booking_reference: string | null;
  channel: "whatsapp_customer";
  customerPhone: string | null;
  customer_phone: string | null;
  delivery_surface: "whatsapp_customer_driver_details_send_audit_payload_setup_only";
  disabled_send_status: "blocked" | "missing";
  eventKey: string | null;
  external_send: false;
  liveSendingEnabled: false;
  messageTarget: string | null;
  message_target: string | null;
  missing_requirements: WhatsAppCustomerDriverDetailsSendAuditPayloadMissingRequirement[];
  providerConfigured: false;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof whatsAppCustomerDriverDetailsSendAuditPayloadSetupFoundationVersion;
};

const blockedNoOpResult: WhatsAppCustomerDriverDetailsSendAuditBlockedNoOpResult = {
  external_send: false,
  liveSendingEnabled: false,
  no_op: true,
  providerConfigured: false,
  reason: "setup_only_disabled",
  result_label: "blocked/no-op",
  sendingEnabled: false,
  status: "blocked",
};

const blockedFragments = [
  "amount_due",
  "auth_link",
  "billing",
  "contact_email",
  "customer_price",
  "debug",
  "driver_payout",
  "finance",
  "internal_admin",
  "internal_finance",
  "invoice",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "secret",
  "server_secret",
  "service_role",
  "token",
];

function normalizedText(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function safeShortText(value: unknown, maxLength = 120) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  return blockedFragments.some((fragment) => normalizedText(cleaned).includes(fragment)) ? null : cleaned;
}

function normalizeActionSource(value: unknown): WhatsAppCustomerDriverDetailsSendAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return whatsAppCustomerDriverDetailsSendAuditActionSources.includes(
    normalized as WhatsAppCustomerDriverDetailsSendAuditActionSource,
  )
    ? (normalized as WhatsAppCustomerDriverDetailsSendAuditActionSource)
    : null;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function setupFrom(
  input: WhatsAppCustomerDriverDetailsSendAuditPayloadSetupInput,
): WhatsAppCustomerDriverDetailsSetupResult {
  return input.setup ?? buildWhatsAppCustomerDriverDetailsSetup(input);
}

function hasDisabledNoOpAdapter(setup: WhatsAppCustomerDriverDetailsSetupResult) {
  return Boolean(
    setup.disabled_message &&
      setup.disabled_message.delivery_surface === "whatsapp_disabled" &&
      setup.disabled_message.external_send === false &&
      setup.disabled_message.status === "disabled",
  );
}

export function buildWhatsAppCustomerDriverDetailsSendAuditPayloadSetup(
  input: WhatsAppCustomerDriverDetailsSendAuditPayloadSetupInput,
): WhatsAppCustomerDriverDetailsSendAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const bookingReference = setup.payload.booking_reference;
  const customerPhone = safeShortText(firstValue(input.customerPhone, input.customer_phone), 80);
  const messageTarget = safeShortText(
    firstValue(input.messageTarget, input.message_target, customerPhone),
    120,
  );
  const disabledSendReady = hasDisabledNoOpAdapter(setup);
  const disabledSendStatus = disabledSendReady ? "blocked" : "missing";
  const missingRequirements: WhatsAppCustomerDriverDetailsSendAuditPayloadMissingRequirement[] = [];
  const readinessStatus = setup.customerMessageReady ? "ready_for_future_setup" : "blocked";

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!bookingReference) {
    missingRequirements.push("booking_reference");
  }

  if (!disabledSendReady) {
    missingRequirements.push("disabled_send_adapter");
  }

  return {
    actionSource,
    action_source: actionSource,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource,
      auditWriteEnabled: false,
      bookingReference,
      booking_reference: bookingReference,
      channel: setup.channel,
      customerPhone,
      customer_phone: customerPhone,
      disabledSendStatus,
      eventKey: setup.disabled_message.event_key,
      external_send: false,
      liveSendingEnabled: false,
      messageKey: setup.message.message_key,
      messageTarget,
      message_target: messageTarget,
      preview: setup.disabled_message.preview,
      providerConfigured: false,
      readinessStatus,
      result: blockedNoOpResult,
      sendingEnabled: false,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    bookingReference,
    booking_reference: bookingReference,
    channel: setup.channel,
    customerPhone,
    customer_phone: customerPhone,
    delivery_surface: "whatsapp_customer_driver_details_send_audit_payload_setup_only",
    disabled_send_status: disabledSendStatus,
    eventKey: setup.disabled_message.event_key,
    external_send: false,
    liveSendingEnabled: false,
    messageTarget,
    message_target: messageTarget,
    missing_requirements: missingRequirements,
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: whatsAppCustomerDriverDetailsSendAuditPayloadSetupFoundationVersion,
  };
}
