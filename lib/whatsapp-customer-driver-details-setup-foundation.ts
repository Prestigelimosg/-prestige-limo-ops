import "server-only";

import {
  prepareDisabledAdminWhatsAppMessage,
  type AdminWhatsAppDisabledMessageResult,
} from "./admin-whatsapp-message-disabled-adapter";
import { buildCustomerDriverDetailsEmailSetup } from "./customer-driver-details-email-setup-foundation";

export const whatsAppCustomerDriverDetailsSetupFoundationVersion =
  "whatsapp-customer-driver-details-setup-foundation-v1";

export type WhatsAppCustomerDriverDetailsMissingRequirement =
  | "booking_reference"
  | "driver_name"
  | "driver_phone"
  | "pickup_time"
  | "route"
  | "vehicle_plate"
  | "vehicle_type";

export type WhatsAppCustomerDriverDetailsSetupInput = {
  bookingReference?: unknown;
  booking_reference?: unknown;
  driver?: {
    name?: unknown;
    phone?: unknown;
  } | null;
  driverName?: unknown;
  driverPhone?: unknown;
  driver_name?: unknown;
  driver_phone?: unknown;
  pickupTime?: unknown;
  pickup_time?: unknown;
  route?: unknown;
  vehicle?: {
    plate?: unknown;
    type?: unknown;
  } | null;
  vehiclePlate?: unknown;
  vehicleType?: unknown;
  vehicle_plate?: unknown;
  vehicle_type?: unknown;
};

export type WhatsAppCustomerDriverDetailsSetupResult = {
  adminReviewRequired: true;
  channel: "whatsapp_customer";
  customerMessageReady: boolean;
  delivery_surface: "whatsapp_customer_driver_details_setup_only";
  disabled_message: AdminWhatsAppDisabledMessageResult;
  external_send: false;
  liveSendingEnabled: false;
  message: {
    body_lines: string[];
    message_key: "customer_assigned_driver_details_whatsapp";
    message_text: string | null;
    preview_text: string | null;
  };
  missing_requirements: WhatsAppCustomerDriverDetailsMissingRequirement[];
  payload: {
    booking_reference: string | null;
    channel: "whatsapp_customer";
    driver_name: string | null;
    driver_phone: string | null;
    external_send: false;
    liveSendingEnabled: false;
    pickup_time: string | null;
    providerConfigured: false;
    route: string | null;
    sendingEnabled: false;
    vehicle_plate: string | null;
    vehicle_type: string | null;
  };
  providerConfigured: false;
  sendingEnabled: false;
  status: "setup_only";
  version: typeof whatsAppCustomerDriverDetailsSetupFoundationVersion;
};

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function missingRequirements(
  payload: WhatsAppCustomerDriverDetailsSetupResult["payload"],
): WhatsAppCustomerDriverDetailsMissingRequirement[] {
  const missing: WhatsAppCustomerDriverDetailsMissingRequirement[] = [];

  if (!payload.booking_reference) {
    missing.push("booking_reference");
  }

  if (!payload.pickup_time) {
    missing.push("pickup_time");
  }

  if (!payload.route) {
    missing.push("route");
  }

  if (!payload.driver_name) {
    missing.push("driver_name");
  }

  if (!payload.driver_phone) {
    missing.push("driver_phone");
  }

  if (!payload.vehicle_type) {
    missing.push("vehicle_type");
  }

  if (!payload.vehicle_plate) {
    missing.push("vehicle_plate");
  }

  return missing;
}

function buildMessageText(bodyLines: string[]) {
  if (bodyLines.length === 0) {
    return null;
  }

  return ["Prestige update: assigned driver details.", ...bodyLines].join("\n");
}

export function buildWhatsAppCustomerDriverDetailsSetup(
  input: WhatsAppCustomerDriverDetailsSetupInput,
): WhatsAppCustomerDriverDetailsSetupResult {
  const driver = safeRecord(input.driver);
  const vehicle = safeRecord(input.vehicle);
  const sharedDriverDetails = buildCustomerDriverDetailsEmailSetup({
    booking_reference: firstValue(input.booking_reference, input.bookingReference),
    driver_name: firstValue(input.driver_name, input.driverName, driver.name),
    driver_phone: firstValue(input.driver_phone, input.driverPhone, driver.phone),
    pickup_time: firstValue(input.pickup_time, input.pickupTime),
    route: input.route,
    vehicle_plate: firstValue(input.vehicle_plate, input.vehiclePlate, vehicle.plate),
    vehicle_type: firstValue(input.vehicle_type, input.vehicleType, vehicle.type),
  });
  const payload: WhatsAppCustomerDriverDetailsSetupResult["payload"] = {
    booking_reference: sharedDriverDetails.payload.booking_reference,
    channel: "whatsapp_customer",
    driver_name: sharedDriverDetails.payload.driver_name,
    driver_phone: sharedDriverDetails.payload.driver_phone,
    external_send: false,
    liveSendingEnabled: false,
    pickup_time: sharedDriverDetails.payload.pickup_time,
    providerConfigured: false,
    route: sharedDriverDetails.payload.route,
    sendingEnabled: false,
    vehicle_plate: sharedDriverDetails.payload.vehicle_plate,
    vehicle_type: sharedDriverDetails.payload.vehicle_type,
  };
  const bodyLines = sharedDriverDetails.template.body_lines;
  const messageText = buildMessageText(bodyLines);
  const missing = missingRequirements(payload);
  const disabledMessage = prepareDisabledAdminWhatsAppMessage({
    booking_reference: payload.booking_reference,
    event_key: payload.booking_reference
      ? `customer-driver-details-whatsapp-${payload.booking_reference}`
      : "customer-driver-details-whatsapp",
    notification_type: "customer_driver_details",
    priority: "normal",
    safe_message: messageText,
    safe_title: "Assigned driver details",
    workflow_area: "customer_driver_details",
  });

  return {
    adminReviewRequired: true,
    channel: "whatsapp_customer",
    customerMessageReady: missing.length === 0,
    delivery_surface: "whatsapp_customer_driver_details_setup_only",
    disabled_message: disabledMessage,
    external_send: false,
    liveSendingEnabled: false,
    message: {
      body_lines: bodyLines,
      message_key: "customer_assigned_driver_details_whatsapp",
      message_text: messageText,
      preview_text: payload.driver_name ? `Your assigned driver is ${payload.driver_name}.` : null,
    },
    missing_requirements: missing,
    payload,
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: whatsAppCustomerDriverDetailsSetupFoundationVersion,
  };
}
