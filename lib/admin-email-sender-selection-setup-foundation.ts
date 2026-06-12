import "server-only";

export const adminEmailSenderSelectionSetupFoundationVersion =
  "admin-email-sender-selection-setup-foundation-v1";

export type AdminEmailSenderSelectionProfileInput = {
  customer_keys?: unknown;
  is_default?: unknown;
  sender_key?: unknown;
  sender_label?: unknown;
  sender_role?: unknown;
};

export type AdminEmailSenderSelectionSetupInput = {
  customer_key?: unknown;
  profiles?: unknown;
};

export type AdminEmailSenderSelectionSetupResult = {
  delivery_surface: "email_sender_selection_setup_only";
  external_send: false;
  selected_sender: {
    match_reason: "customer_match" | "default_sender" | "none";
    sender_key: string | null;
    sender_label: string | null;
    sender_role: string | null;
  };
  sendingEnabled: false;
  status: "setup_only";
  version: typeof adminEmailSenderSelectionSetupFoundationVersion;
};

type SafeSenderProfile = {
  customer_keys: string[];
  is_default: boolean;
  sender_key: string;
  sender_label: string;
  sender_role: string | null;
};

const maxTextLength = 120;
const maxProfiles = 25;
const maxCustomerKeys = 25;
const blockedFragments = [
  "amount_due",
  "auth_link",
  "billing_amount",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "driver_auth",
  "driver_payout",
  "fare_amount",
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

function safeCustomerKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((key) => safeText(key, 80)?.toLowerCase())
    .filter((key): key is string => Boolean(key))
    .slice(0, maxCustomerKeys);
}

function safeProfiles(value: unknown): SafeSenderProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((profile): SafeSenderProfile | null => {
      if (!profile || typeof profile !== "object" || Array.isArray(profile)) {
        return null;
      }

      const record = profile as AdminEmailSenderSelectionProfileInput;
      const senderKey = safeText(record.sender_key, 80);
      const senderLabel = safeText(record.sender_label, 120);

      if (!senderKey || !senderLabel) {
        return null;
      }

      return {
        customer_keys: safeCustomerKeys(record.customer_keys),
        is_default: record.is_default === true,
        sender_key: senderKey,
        sender_label: senderLabel,
        sender_role: safeText(record.sender_role, 80),
      };
    })
    .filter((profile): profile is SafeSenderProfile => Boolean(profile))
    .slice(0, maxProfiles);
}

export function buildAdminEmailSenderSelectionSetup(
  input: AdminEmailSenderSelectionSetupInput,
): AdminEmailSenderSelectionSetupResult {
  const customerKey = safeText(input.customer_key, 80)?.toLowerCase() || null;
  const profiles = safeProfiles(input.profiles);
  const customerMatch = customerKey
    ? profiles.find((profile) => profile.customer_keys.includes(customerKey))
    : null;
  const selected = customerMatch || profiles.find((profile) => profile.is_default) || null;

  return {
    delivery_surface: "email_sender_selection_setup_only",
    external_send: false,
    selected_sender: {
      match_reason: customerMatch ? "customer_match" : selected ? "default_sender" : "none",
      sender_key: selected?.sender_key || null,
      sender_label: selected?.sender_label || null,
      sender_role: selected?.sender_role || null,
    },
    sendingEnabled: false,
    status: "setup_only",
    version: adminEmailSenderSelectionSetupFoundationVersion,
  };
}
