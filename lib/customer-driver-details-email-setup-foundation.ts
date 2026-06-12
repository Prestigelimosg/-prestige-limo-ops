import "server-only";

export const customerDriverDetailsEmailSetupFoundationVersion =
  "customer-driver-details-email-setup-foundation-v1";

export type CustomerDriverDetailsEmailSetupInput = {
  booking_reference?: unknown;
  customer_email?: unknown;
  driver_name?: unknown;
  driver_phone?: unknown;
  pickup_time?: unknown;
  route?: unknown;
  vehicle_plate?: unknown;
  vehicle_type?: unknown;
};

export type CustomerDriverDetailsEmailSetupResult = {
  delivery_surface: "customer_driver_details_email_setup_only";
  external_send: false;
  payload: {
    booking_reference: string | null;
    customer_email: string | null;
    driver_name: string | null;
    driver_phone: string | null;
    pickup_time: string | null;
    route: string | null;
    vehicle_plate: string | null;
    vehicle_type: string | null;
  };
  recipient_status: "valid" | "blocked";
  sendingEnabled: false;
  status: "setup_only";
  template: {
    body_lines: string[];
    preview_text: string | null;
    subject: string | null;
    template_key: "customer_assigned_driver_details";
  };
  version: typeof customerDriverDetailsEmailSetupFoundationVersion;
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
  "invoice",
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

function safeCustomerEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().toLowerCase();

  if (!cleaned || cleaned.length > maxEmailLength || !basicEmailPattern.test(cleaned)) {
    return null;
  }

  return blockedFragments.some((fragment) => cleaned.includes(fragment)) ? null : cleaned;
}

function buildBodyLines(payload: CustomerDriverDetailsEmailSetupResult["payload"]) {
  return [
    payload.booking_reference ? `Booking: ${payload.booking_reference}` : null,
    payload.pickup_time ? `Pickup: ${payload.pickup_time}` : null,
    payload.route ? `Route: ${payload.route}` : null,
    payload.driver_name ? `Driver: ${payload.driver_name}` : null,
    payload.driver_phone ? `Driver phone: ${payload.driver_phone}` : null,
    payload.vehicle_type || payload.vehicle_plate
      ? `Vehicle: ${[payload.vehicle_type, payload.vehicle_plate].filter(Boolean).join(" / ")}`
      : null,
  ].filter((line): line is string => Boolean(line));
}

export function buildCustomerDriverDetailsEmailSetup(
  input: CustomerDriverDetailsEmailSetupInput,
): CustomerDriverDetailsEmailSetupResult {
  const payload = {
    booking_reference: safeText(input.booking_reference, 120),
    customer_email: safeCustomerEmail(input.customer_email),
    driver_name: safeText(input.driver_name, 120),
    driver_phone: safeText(input.driver_phone, 80),
    pickup_time: safeText(input.pickup_time, 120),
    route: safeText(input.route, 180),
    vehicle_plate: safeText(input.vehicle_plate, 40),
    vehicle_type: safeText(input.vehicle_type, 80),
  };

  return {
    delivery_surface: "customer_driver_details_email_setup_only",
    external_send: false,
    payload,
    recipient_status: payload.customer_email ? "valid" : "blocked",
    sendingEnabled: false,
    status: "setup_only",
    template: {
      body_lines: buildBodyLines(payload),
      preview_text: payload.driver_name ? `Your assigned driver is ${payload.driver_name}.` : null,
      subject: payload.booking_reference
        ? `Assigned driver details for ${payload.booking_reference}`
        : "Assigned driver details",
      template_key: "customer_assigned_driver_details",
    },
    version: customerDriverDetailsEmailSetupFoundationVersion,
  };
}
