import "server-only";

import {
  prepareDisabledAdminEmailSend,
  type AdminEmailSendDisabledAdapterResult,
} from "./admin-email-send-disabled-adapter";
import {
  buildCustomerDriverDetailsEmailSetup,
  type CustomerDriverDetailsEmailSetupResult,
} from "./customer-driver-details-email-setup-foundation";

export const driverAckCustomerMessageHandoffSetupFoundationVersion =
  "driver-ack-customer-message-handoff-setup-foundation-v1";

export type DriverAckCustomerMessageHandoffAckStatus =
  | "acknowledged"
  | "blocked"
  | "pending";

export type DriverAckCustomerMessageHandoffMissingRequirement =
  | "booking_reference"
  | "customer_email"
  | "driver_acknowledged"
  | "driver_name"
  | "driver_phone"
  | "vehicle_plate"
  | "vehicle_type";

export type DriverAckCustomerMessageHandoffSetupInput = {
  booking_reference?: unknown;
  customer_email?: unknown;
  driver?: {
    name?: unknown;
    phone?: unknown;
  } | null;
  driver_ack_status?: unknown;
  vehicle?: {
    plate?: unknown;
    type?: unknown;
  } | null;
};

export type DriverAckCustomerMessageHandoffSetupResult = {
  adminReviewRequired: true;
  customerEmailReady: boolean;
  delivery_surface: "driver_ack_customer_message_handoff_setup_only";
  disabled_send: AdminEmailSendDisabledAdapterResult;
  driver_ack_status: DriverAckCustomerMessageHandoffAckStatus;
  external_send: false;
  handoff_status: "blocked_for_admin_review" | "ready_for_admin_review";
  missing_requirements: DriverAckCustomerMessageHandoffMissingRequirement[];
  preview: {
    body_line_count: number;
    delivery_surface: CustomerDriverDetailsEmailSetupResult["delivery_surface"];
    preview_text: string | null;
    recipient_status: CustomerDriverDetailsEmailSetupResult["recipient_status"];
    subject: string | null;
    template_key: CustomerDriverDetailsEmailSetupResult["template"]["template_key"];
  };
  sendingEnabled: false;
  status: "setup_only";
  version: typeof driverAckCustomerMessageHandoffSetupFoundationVersion;
};

function normalizeAckStatus(value: unknown): DriverAckCustomerMessageHandoffAckStatus {
  if (typeof value !== "string") {
    return "pending";
  }

  const normalized = value.trim().replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  if (
    normalized === "acknowledged" ||
    normalized === "acknowledged_by_driver" ||
    normalized === "confirmed" ||
    normalized === "driver_acknowledged"
  ) {
    return "acknowledged";
  }

  return normalized ? "blocked" : "pending";
}

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function missingRequirements(
  ackStatus: DriverAckCustomerMessageHandoffAckStatus,
  template: CustomerDriverDetailsEmailSetupResult,
) {
  const missing: DriverAckCustomerMessageHandoffMissingRequirement[] = [];

  if (ackStatus !== "acknowledged") {
    missing.push("driver_acknowledged");
  }

  if (!template.payload.booking_reference) {
    missing.push("booking_reference");
  }

  if (!template.payload.customer_email) {
    missing.push("customer_email");
  }

  if (!template.payload.driver_name) {
    missing.push("driver_name");
  }

  if (!template.payload.driver_phone) {
    missing.push("driver_phone");
  }

  if (!template.payload.vehicle_type) {
    missing.push("vehicle_type");
  }

  if (!template.payload.vehicle_plate) {
    missing.push("vehicle_plate");
  }

  return missing;
}

export function buildDriverAckCustomerMessageHandoffSetup(
  input: DriverAckCustomerMessageHandoffSetupInput,
): DriverAckCustomerMessageHandoffSetupResult {
  const driver = safeRecord(input.driver);
  const vehicle = safeRecord(input.vehicle);
  const ackStatus = normalizeAckStatus(input.driver_ack_status);
  const template = buildCustomerDriverDetailsEmailSetup({
    booking_reference: input.booking_reference,
    customer_email: input.customer_email,
    driver_name: driver.name,
    driver_phone: driver.phone,
    vehicle_plate: vehicle.plate,
    vehicle_type: vehicle.type,
  });
  const disabledSend = prepareDisabledAdminEmailSend({
    body_lines: template.template.body_lines,
    booking_reference: template.payload.booking_reference,
    recipient_email: template.payload.customer_email,
    subject: template.template.subject,
    template_key: template.template.template_key,
  });
  const missing = missingRequirements(ackStatus, template);

  return {
    adminReviewRequired: true,
    customerEmailReady: missing.length === 0,
    delivery_surface: "driver_ack_customer_message_handoff_setup_only",
    disabled_send: disabledSend,
    driver_ack_status: ackStatus,
    external_send: false,
    handoff_status: missing.length === 0 ? "ready_for_admin_review" : "blocked_for_admin_review",
    missing_requirements: missing,
    preview: {
      body_line_count: template.template.body_lines.length,
      delivery_surface: template.delivery_surface,
      preview_text: template.template.preview_text,
      recipient_status: template.recipient_status,
      subject: template.template.subject,
      template_key: template.template.template_key,
    },
    sendingEnabled: false,
    status: "setup_only",
    version: driverAckCustomerMessageHandoffSetupFoundationVersion,
  };
}
