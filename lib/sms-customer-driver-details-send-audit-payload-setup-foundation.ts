import "server-only";

import {
  buildSmsCustomerDriverDetailsSetup,
  type SmsCustomerDriverDetailsSetupInput,
  type SmsCustomerDriverDetailsSetupResult,
} from "./sms-customer-driver-details-setup-foundation";

export const smsCustomerDriverDetailsSendAuditPayloadSetupFoundationVersion =
  "sms-customer-driver-details-send-audit-payload-setup-foundation-v1";

export const smsCustomerDriverDetailsSendAuditActionSources = [
  "disabled_send_api",
  "preview_readiness_api",
  "setup_contract_test",
] as const;

export type SmsCustomerDriverDetailsSendAuditActionSource =
  (typeof smsCustomerDriverDetailsSendAuditActionSources)[number];

export type SmsCustomerDriverDetailsSendAuditPayloadMissingRequirement =
  | "action_source"
  | "booking_reference";

export type SmsCustomerDriverDetailsSendAuditPayloadSetupInput =
  SmsCustomerDriverDetailsSetupInput & {
    actionSource?: unknown;
    action_source?: unknown;
    customerPhone?: unknown;
    customer_phone?: unknown;
    messageTarget?: unknown;
    message_target?: unknown;
    setup?: SmsCustomerDriverDetailsSetupResult | null;
  };

export type SmsCustomerDriverDetailsSendAuditBlockedNoOpResult = {
  external_send: false;
  liveSendingEnabled: false;
  no_op: true;
  providerConfigured: false;
  reason: "setup_only_disabled";
  result_label: "blocked/no-op";
  sendingEnabled: false;
  status: "blocked";
};

export type SmsCustomerDriverDetailsSendAuditPayloadSetupResult = {
  actionSource: SmsCustomerDriverDetailsSendAuditActionSource | null;
  action_source: SmsCustomerDriverDetailsSendAuditActionSource | null;
  auditWriteEnabled: false;
  audit_payload: {
    actionSource: SmsCustomerDriverDetailsSendAuditActionSource | null;
    auditWriteEnabled: false;
    bookingReference: string | null;
    booking_reference: string | null;
    channel: "sms_customer";
    customerPhone: string | null;
    customer_phone: string | null;
    disabledSendStatus: "blocked";
    external_send: false;
    liveSendingEnabled: false;
    messageKey: "customer_assigned_driver_details_sms";
    messageTarget: string | null;
    message_target: string | null;
    preview: SmsCustomerDriverDetailsSetupResult["message"];
    providerConfigured: false;
    readinessStatus: "ready_for_future_setup" | "blocked";
    result: SmsCustomerDriverDetailsSendAuditBlockedNoOpResult;
    secure_details_link: string | null;
    sendingEnabled: false;
  };
  audit_write_enabled: false;
  blocked_no_op_result: SmsCustomerDriverDetailsSendAuditBlockedNoOpResult;
  bookingReference: string | null;
  booking_reference: string | null;
  channel: "sms_customer";
  customerPhone: string | null;
  customer_phone: string | null;
  delivery_surface: "sms_customer_driver_details_send_audit_payload_setup_only";
  disabled_send_status: "blocked";
  external_send: false;
  liveSendingEnabled: false;
  messageTarget: string | null;
  message_target: string | null;
  missing_requirements: SmsCustomerDriverDetailsSendAuditPayloadMissingRequirement[];
  providerConfigured: false;
  secure_details_link: string | null;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof smsCustomerDriverDetailsSendAuditPayloadSetupFoundationVersion;
};

const blockedNoOpResult: SmsCustomerDriverDetailsSendAuditBlockedNoOpResult = {
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

function normalizeActionSource(value: unknown): SmsCustomerDriverDetailsSendAuditActionSource | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toLowerCase().replace(/[\s-]+/g, "_");

  return smsCustomerDriverDetailsSendAuditActionSources.includes(
    normalized as SmsCustomerDriverDetailsSendAuditActionSource,
  )
    ? (normalized as SmsCustomerDriverDetailsSendAuditActionSource)
    : null;
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function setupFrom(
  input: SmsCustomerDriverDetailsSendAuditPayloadSetupInput,
): SmsCustomerDriverDetailsSetupResult {
  return input.setup ?? buildSmsCustomerDriverDetailsSetup(input);
}

export function buildSmsCustomerDriverDetailsSendAuditPayloadSetup(
  input: SmsCustomerDriverDetailsSendAuditPayloadSetupInput,
): SmsCustomerDriverDetailsSendAuditPayloadSetupResult {
  const setup = setupFrom(input);
  const actionSource = normalizeActionSource(firstValue(input.actionSource, input.action_source));
  const bookingReference = setup.payload.booking_reference;
  const customerPhone = safeShortText(firstValue(input.customerPhone, input.customer_phone), 80);
  const messageTarget = safeShortText(
    firstValue(input.messageTarget, input.message_target, customerPhone),
    120,
  );
  const missingRequirements: SmsCustomerDriverDetailsSendAuditPayloadMissingRequirement[] = [];
  const readinessStatus = setup.smsMessageReady ? "ready_for_future_setup" : "blocked";

  if (!actionSource) {
    missingRequirements.push("action_source");
  }

  if (!bookingReference) {
    missingRequirements.push("booking_reference");
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
      disabledSendStatus: "blocked",
      external_send: false,
      liveSendingEnabled: false,
      messageKey: setup.message.message_key,
      messageTarget,
      message_target: messageTarget,
      preview: setup.message,
      providerConfigured: false,
      readinessStatus,
      result: blockedNoOpResult,
      secure_details_link: setup.payload.secure_details_link,
      sendingEnabled: false,
    },
    audit_write_enabled: false,
    blocked_no_op_result: blockedNoOpResult,
    bookingReference,
    booking_reference: bookingReference,
    channel: setup.channel,
    customerPhone,
    customer_phone: customerPhone,
    delivery_surface: "sms_customer_driver_details_send_audit_payload_setup_only",
    disabled_send_status: "blocked",
    external_send: false,
    liveSendingEnabled: false,
    messageTarget,
    message_target: messageTarget,
    missing_requirements: missingRequirements,
    providerConfigured: false,
    secure_details_link: setup.payload.secure_details_link,
    sendingEnabled: false,
    status: "setup_only",
    version: smsCustomerDriverDetailsSendAuditPayloadSetupFoundationVersion,
  };
}
