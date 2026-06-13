import "server-only";

import { buildCustomerDriverDetailsEmailSetup } from "./customer-driver-details-email-setup-foundation";

export const smsCustomerDriverDetailsSetupFoundationVersion =
  "sms-customer-driver-details-setup-foundation-v1";

export type SmsCustomerDriverDetailsMissingRequirement =
  | "booking_reference"
  | "driver_name"
  | "driver_phone"
  | "pickup_time"
  | "vehicle_plate"
  | "vehicle_type";

export type SmsCustomerDriverDetailsSetupInput = {
  bookingReference?: unknown;
  booking_reference?: unknown;
  detailsLink?: unknown;
  details_link?: unknown;
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
  secureDetailsLink?: unknown;
  secure_details_link?: unknown;
  vehicle?: {
    plate?: unknown;
    type?: unknown;
  } | null;
  vehiclePlate?: unknown;
  vehicleType?: unknown;
  vehicle_plate?: unknown;
  vehicle_type?: unknown;
};

export type SmsCustomerDriverDetailsSetupResult = {
  channel: "sms_customer";
  customerMessageReady: boolean;
  delivery_surface: "sms_customer_driver_details_setup_only";
  external_send: false;
  liveSendingEnabled: false;
  message: {
    message_key: "customer_assigned_driver_details_sms";
    message_text: string | null;
    preview_text: string | null;
  };
  missing_requirements: SmsCustomerDriverDetailsMissingRequirement[];
  payload: {
    booking_reference: string | null;
    channel: "sms_customer";
    driver_name: string | null;
    driver_phone: string | null;
    external_send: false;
    liveSendingEnabled: false;
    pickup_time: string | null;
    providerConfigured: false;
    secure_details_link: string | null;
    sendingEnabled: false;
    vehicle_plate: string | null;
    vehicle_type: string | null;
  };
  providerConfigured: false;
  sendingEnabled: false;
  smsMessageReady: boolean;
  status: "setup_only";
  version: typeof smsCustomerDriverDetailsSetupFoundationVersion;
};

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function safeDetailsLink(value: unknown, bookingReference: string | null) {
  if (typeof value !== "string" || !bookingReference) {
    return null;
  }

  const cleaned = value.trim();

  if (!cleaned || cleaned.length > 220) {
    return null;
  }

  try {
    const parsed = new URL(cleaned);
    const normalizedPath = parsed.pathname.toLowerCase();

    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash ||
      !normalizedPath.includes("/customer-driver-details/") ||
      !normalizedPath.includes(bookingReference.toLowerCase())
    ) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

function missingRequirements(
  payload: SmsCustomerDriverDetailsSetupResult["payload"],
): SmsCustomerDriverDetailsMissingRequirement[] {
  const missing: SmsCustomerDriverDetailsMissingRequirement[] = [];

  if (!payload.booking_reference) {
    missing.push("booking_reference");
  }

  if (!payload.pickup_time) {
    missing.push("pickup_time");
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

function buildMessageText(payload: SmsCustomerDriverDetailsSetupResult["payload"]) {
  const parts = [
    payload.booking_reference ? `Booking ${payload.booking_reference}` : null,
    payload.pickup_time ? `Pickup ${payload.pickup_time}` : null,
    payload.driver_name || payload.driver_phone
      ? `Driver ${[payload.driver_name, payload.driver_phone].filter(Boolean).join(" ")}`
      : null,
    payload.vehicle_type || payload.vehicle_plate
      ? `Vehicle ${[payload.vehicle_type, payload.vehicle_plate].filter(Boolean).join(" ")}`
      : null,
    payload.secure_details_link ? `Details ${payload.secure_details_link}` : null,
  ].filter((part): part is string => Boolean(part));

  return parts.length === 0 ? null : `Prestige: ${parts.join(". ")}.`;
}

export function buildSmsCustomerDriverDetailsSetup(
  input: SmsCustomerDriverDetailsSetupInput,
): SmsCustomerDriverDetailsSetupResult {
  const driver = safeRecord(input.driver);
  const vehicle = safeRecord(input.vehicle);
  const sharedDriverDetails = buildCustomerDriverDetailsEmailSetup({
    booking_reference: firstValue(input.booking_reference, input.bookingReference),
    driver_name: firstValue(input.driver_name, input.driverName, driver.name),
    driver_phone: firstValue(input.driver_phone, input.driverPhone, driver.phone),
    pickup_time: firstValue(input.pickup_time, input.pickupTime),
    vehicle_plate: firstValue(input.vehicle_plate, input.vehiclePlate, vehicle.plate),
    vehicle_type: firstValue(input.vehicle_type, input.vehicleType, vehicle.type),
  });
  const secureDetailsLink = safeDetailsLink(
    firstValue(
      input.secure_details_link,
      input.secureDetailsLink,
      input.details_link,
      input.detailsLink,
    ),
    sharedDriverDetails.payload.booking_reference,
  );
  const payload: SmsCustomerDriverDetailsSetupResult["payload"] = {
    booking_reference: sharedDriverDetails.payload.booking_reference,
    channel: "sms_customer",
    driver_name: sharedDriverDetails.payload.driver_name,
    driver_phone: sharedDriverDetails.payload.driver_phone,
    external_send: false,
    liveSendingEnabled: false,
    pickup_time: sharedDriverDetails.payload.pickup_time,
    providerConfigured: false,
    secure_details_link: secureDetailsLink,
    sendingEnabled: false,
    vehicle_plate: sharedDriverDetails.payload.vehicle_plate,
    vehicle_type: sharedDriverDetails.payload.vehicle_type,
  };
  const missing = missingRequirements(payload);
  const messageText = buildMessageText(payload);

  return {
    channel: "sms_customer",
    customerMessageReady: missing.length === 0,
    delivery_surface: "sms_customer_driver_details_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    message: {
      message_key: "customer_assigned_driver_details_sms",
      message_text: messageText,
      preview_text: payload.driver_name ? `Driver ${payload.driver_name} assigned.` : null,
    },
    missing_requirements: missing,
    payload,
    providerConfigured: false,
    sendingEnabled: false,
    smsMessageReady: missing.length === 0,
    status: "setup_only",
    version: smsCustomerDriverDetailsSetupFoundationVersion,
  };
}
