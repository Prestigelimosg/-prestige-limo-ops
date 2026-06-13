import "server-only";

import { buildCustomerDriverDetailsEmailSetup } from "./customer-driver-details-email-setup-foundation";

export const customerDriverDetailsLinkSetupFoundationVersion =
  "customer-driver-details-link-setup-foundation-v1";

export const customerDriverDetailsLinkChannels = ["email", "whatsapp", "sms"] as const;

export type CustomerDriverDetailsLinkChannel = (typeof customerDriverDetailsLinkChannels)[number];

export type CustomerDriverDetailsLinkMissingRequirement = "booking_reference";

export type CustomerDriverDetailsLinkSetupInput = {
  bookingReference?: unknown;
  booking_reference?: unknown;
  channel?: unknown;
  channels?: unknown;
  customerSafeTokenPlaceholder?: unknown;
  customer_safe_token_placeholder?: unknown;
  driver?: {
    name?: unknown;
    phone?: unknown;
  } | null;
  driverName?: unknown;
  driverPhone?: unknown;
  driver_name?: unknown;
  driver_phone?: unknown;
  expiryLabel?: unknown;
  expiry_label?: unknown;
  pickupTime?: unknown;
  pickup_time?: unknown;
  route?: unknown;
  tokenPlaceholder?: unknown;
  token_placeholder?: unknown;
  vehicle?: {
    plate?: unknown;
    type?: unknown;
  } | null;
  vehiclePlate?: unknown;
  vehicleType?: unknown;
  vehicle_plate?: unknown;
  vehicle_type?: unknown;
};

export type CustomerDriverDetailsVisibilityFlags = {
  booking_reference: boolean;
  driver_name: boolean;
  driver_phone: boolean;
  pickup_time: boolean;
  route: boolean;
  vehicle_plate: boolean;
  vehicle_type: boolean;
};

export type CustomerDriverDetailsLinkSetupResult = {
  authActivationEnabled: false;
  channel: "customer_driver_details_secure_link";
  channels: CustomerDriverDetailsLinkChannel[];
  customer_safe_token_placeholder: string;
  dbWriteEnabled: false;
  delivery_surface: "customer_driver_details_link_setup_only";
  external_send: false;
  expiry_label: string;
  linkEnabled: false;
  linkPayloadReady: boolean;
  liveAccessEnabled: false;
  missing_requirements: CustomerDriverDetailsLinkMissingRequirement[];
  payload: {
    authActivationEnabled: false;
    booking_reference: string | null;
    channels: CustomerDriverDetailsLinkChannel[];
    customer_safe_token_placeholder: string;
    dbWriteEnabled: false;
    driver_details_visibility_flags: CustomerDriverDetailsVisibilityFlags;
    external_send: false;
    expiry_label: string;
    linkEnabled: false;
    liveAccessEnabled: false;
    tokenIssued: false;
  };
  providerConfigured: false;
  status: "setup_only";
  tokenIssued: false;
  version: typeof customerDriverDetailsLinkSetupFoundationVersion;
};

const defaultTokenPlaceholder = "customer-safe-placeholder";
const defaultExpiryLabel = "Short-lived setup placeholder";
const maxLabelLength = 120;
const unsafePlaceholderFragments = [
  "amount_due",
  "billing",
  "card_number",
  "customer_auth",
  "customer_price",
  "driver_auth",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal",
  "invoice",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pricing",
  "private_key",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "smtp",
  "stripe",
];

function safeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function firstValue(...values: unknown[]) {
  return values.find((value) => value !== undefined && value !== null);
}

function normalizedText(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function safeSetupLabel(value: unknown, fallback: string) {
  if (typeof value !== "string" && typeof value !== "number") {
    return fallback;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();
  const normalized = normalizedText(cleaned);

  if (
    !cleaned ||
    cleaned.length > maxLabelLength ||
    unsafePlaceholderFragments.some((fragment) => normalized.includes(fragment))
  ) {
    return fallback;
  }

  return cleaned;
}

function normalizeChannels(input: unknown) {
  const rawChannels = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];
  const requestedChannels = new Set(
    rawChannels
      .map((channel) => (typeof channel === "string" ? channel.trim().toLowerCase() : null))
      .filter((channel): channel is CustomerDriverDetailsLinkChannel =>
        customerDriverDetailsLinkChannels.includes(channel as CustomerDriverDetailsLinkChannel),
      ),
  );

  if (requestedChannels.size === 0) {
    return [...customerDriverDetailsLinkChannels];
  }

  return customerDriverDetailsLinkChannels.filter((channel) => requestedChannels.has(channel));
}

function missingRequirements(
  payload: CustomerDriverDetailsLinkSetupResult["payload"],
): CustomerDriverDetailsLinkMissingRequirement[] {
  return payload.booking_reference ? [] : ["booking_reference"];
}

export function buildCustomerDriverDetailsLinkSetup(
  input: CustomerDriverDetailsLinkSetupInput,
): CustomerDriverDetailsLinkSetupResult {
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
  const channels = normalizeChannels(firstValue(input.channels, input.channel));
  const customerSafeTokenPlaceholder = safeSetupLabel(
    firstValue(
      input.customer_safe_token_placeholder,
      input.customerSafeTokenPlaceholder,
      input.token_placeholder,
      input.tokenPlaceholder,
    ),
    defaultTokenPlaceholder,
  );
  const expiryLabel = safeSetupLabel(firstValue(input.expiry_label, input.expiryLabel), defaultExpiryLabel);
  const driverDetailsVisibilityFlags = {
    booking_reference: Boolean(sharedDriverDetails.payload.booking_reference),
    driver_name: Boolean(sharedDriverDetails.payload.driver_name),
    driver_phone: Boolean(sharedDriverDetails.payload.driver_phone),
    pickup_time: Boolean(sharedDriverDetails.payload.pickup_time),
    route: Boolean(sharedDriverDetails.payload.route),
    vehicle_plate: Boolean(sharedDriverDetails.payload.vehicle_plate),
    vehicle_type: Boolean(sharedDriverDetails.payload.vehicle_type),
  };
  const payload: CustomerDriverDetailsLinkSetupResult["payload"] = {
    authActivationEnabled: false,
    booking_reference: sharedDriverDetails.payload.booking_reference,
    channels,
    customer_safe_token_placeholder: customerSafeTokenPlaceholder,
    dbWriteEnabled: false,
    driver_details_visibility_flags: driverDetailsVisibilityFlags,
    external_send: false,
    expiry_label: expiryLabel,
    linkEnabled: false,
    liveAccessEnabled: false,
    tokenIssued: false,
  };
  const missing = missingRequirements(payload);

  return {
    authActivationEnabled: false,
    channel: "customer_driver_details_secure_link",
    channels,
    customer_safe_token_placeholder: customerSafeTokenPlaceholder,
    dbWriteEnabled: false,
    delivery_surface: "customer_driver_details_link_setup_only",
    external_send: false,
    expiry_label: expiryLabel,
    linkEnabled: false,
    linkPayloadReady: missing.length === 0,
    liveAccessEnabled: false,
    missing_requirements: missing,
    payload,
    providerConfigured: false,
    status: "setup_only",
    tokenIssued: false,
    version: customerDriverDetailsLinkSetupFoundationVersion,
  };
}
