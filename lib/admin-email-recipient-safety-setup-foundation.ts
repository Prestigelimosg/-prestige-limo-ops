import "server-only";

export const adminEmailRecipientSafetySetupFoundationVersion =
  "admin-email-recipient-safety-setup-foundation-v1";

export type AdminEmailRecipientSafetySetupInput = {
  booking_reference?: unknown;
  customer_account_label?: unknown;
  recipient_email?: unknown;
};

export type AdminEmailRecipientSafetySetupResult = {
  delivery_surface: "email_recipient_safety_setup_only";
  external_send: false;
  recipient: {
    booking_reference: string | null;
    customer_account_label: string | null;
    recipient_email: string | null;
    recipient_status: "valid" | "blocked";
  };
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminEmailRecipientSafetySetupFoundationVersion;
};

const maxTextLength = 120;
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
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "invoice_pdf",
  "password",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "private_key",
  "quoted_price",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "smtp",
  "stripe",
  "token",
];

const basicEmailPattern = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]+$/;

function safeText(value: unknown, maxLength = maxTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  const normalized = cleaned.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();

  return blockedFragments.some((fragment) => normalized.includes(fragment)) ? null : cleaned;
}

function safeRecipientEmail(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim().toLowerCase();

  if (!cleaned || cleaned.length > maxEmailLength || !basicEmailPattern.test(cleaned)) {
    return null;
  }

  return blockedFragments.some((fragment) => cleaned.includes(fragment)) ? null : cleaned;
}

export function buildAdminEmailRecipientSafetySetup(
  input: AdminEmailRecipientSafetySetupInput,
): AdminEmailRecipientSafetySetupResult {
  const recipientEmail = safeRecipientEmail(input.recipient_email);

  return {
    delivery_surface: "email_recipient_safety_setup_only",
    external_send: false,
    recipient: {
      booking_reference: safeText(input.booking_reference, 120),
      customer_account_label: safeText(input.customer_account_label, 120),
      recipient_email: recipientEmail,
      recipient_status: recipientEmail ? "valid" : "blocked",
    },
    sendingEnabled: false,
    status: "setup_only",
    version: adminEmailRecipientSafetySetupFoundationVersion,
  };
}
