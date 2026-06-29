export const companyProfileSettingsVersion = "company-profile-settings-v1";

export type PublicCompanyProfile = {
  address: string;
  bank_payment_instructions: string;
  company_name: string;
  email: string;
  invoice_footer_terms: string;
  logo_image_url: string;
  phone: string;
  stripe_card_fee_percent: number;
  stripe_card_fee_required: boolean;
  stripe_card_payment_enabled: boolean;
  uen: string;
  updated_at: string | null;
  whatsapp_phone: string;
};

export type CompanyProfileSanitizeResult = {
  profile: PublicCompanyProfile;
  rejectedFields: string[];
};

type UnknownRecord = Record<string, unknown>;

const profileForbiddenPattern =
  /driver[_\s-]*payout|paynow[_\s-]*payout|internal[_\s-]*admin|internal[_\s-]*finance|admin[_\s-]*finance|parser|debug|service[_\s-]*role|secret|api[_\s-]*key|access[_\s-]*token|raw[_\s-]*token|customer[_\s-]*price|mock[_\s-]*qa|dev[_\s-]*archive|payout[_\s-]*comparison/i;

const maxFieldLengths: Record<keyof PublicCompanyProfile, number> = {
  address: 500,
  bank_payment_instructions: 1000,
  company_name: 120,
  email: 180,
  invoice_footer_terms: 1400,
  logo_image_url: 200000,
  phone: 80,
  stripe_card_fee_percent: 10,
  stripe_card_fee_required: 10,
  stripe_card_payment_enabled: 10,
  uen: 80,
  updated_at: 80,
  whatsapp_phone: 80,
};

export const defaultCompanyProfile: PublicCompanyProfile = {
  address: "",
  bank_payment_instructions: "",
  company_name: "Prestige Limo SG",
  email: "acc@prestigelimo.sg",
  invoice_footer_terms:
    "Thank you for choosing our service. Bookings are confirmed upon receipt of the required payment or deposit. Waiting time includes a 15-minute grace period; additional waiting time may be chargeable. Requests made less than 12 hours before pickup may incur a SGD $50 change fee.",
  logo_image_url: "",
  phone: "+65 9655 0807",
  stripe_card_fee_percent: 10,
  stripe_card_fee_required: false,
  stripe_card_payment_enabled: false,
  uen: "",
  updated_at: null,
  whatsapp_phone: "+65 9655 0807",
};

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function compactText(value: unknown, maxLength: number) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  return String(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim().slice(0, maxLength);
}

function booleanValue(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function safeFeePercent(value: unknown, fallback: number) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(25, Math.max(0, Math.round(parsed * 100) / 100));
}

function safeLogoUrl(value: unknown) {
  const raw = compactText(value, maxFieldLengths.logo_image_url);

  if (!raw) {
    return "";
  }

  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw;
  }

  try {
    const parsed = new URL(raw);

    return parsed.protocol === "https:" ? parsed.href : "";
  } catch {
    return "";
  }
}

function safePublicText(
  source: UnknownRecord,
  field: keyof PublicCompanyProfile,
  fallback: string,
  rejectedFields: string[],
) {
  const value = compactText(source[field], maxFieldLengths[field]);

  if (!value) {
    return fallback;
  }

  if (profileForbiddenPattern.test(value)) {
    rejectedFields.push(field);
    return fallback;
  }

  return value;
}

export function sanitizePublicCompanyProfile(input: unknown): CompanyProfileSanitizeResult {
  const source = asRecord(input);
  const rejectedFields: string[] = [];
  const logoImageUrl = safeLogoUrl(source.logo_image_url);

  if (compactText(source.logo_image_url, maxFieldLengths.logo_image_url) && !logoImageUrl) {
    rejectedFields.push("logo_image_url");
  }

  const profile: PublicCompanyProfile = {
    address: safePublicText(source, "address", defaultCompanyProfile.address, rejectedFields),
    bank_payment_instructions: safePublicText(
      source,
      "bank_payment_instructions",
      defaultCompanyProfile.bank_payment_instructions,
      rejectedFields,
    ),
    company_name: safePublicText(
      source,
      "company_name",
      defaultCompanyProfile.company_name,
      rejectedFields,
    ),
    email: safePublicText(source, "email", defaultCompanyProfile.email, rejectedFields),
    invoice_footer_terms: safePublicText(
      source,
      "invoice_footer_terms",
      defaultCompanyProfile.invoice_footer_terms,
      rejectedFields,
    ),
    logo_image_url: logoImageUrl,
    phone: safePublicText(source, "phone", defaultCompanyProfile.phone, rejectedFields),
    stripe_card_fee_percent: safeFeePercent(
      source.stripe_card_fee_percent,
      defaultCompanyProfile.stripe_card_fee_percent,
    ),
    stripe_card_fee_required: booleanValue(
      source.stripe_card_fee_required,
      defaultCompanyProfile.stripe_card_fee_required,
    ),
    stripe_card_payment_enabled: booleanValue(
      source.stripe_card_payment_enabled,
      defaultCompanyProfile.stripe_card_payment_enabled,
    ),
    uen: safePublicText(source, "uen", defaultCompanyProfile.uen, rejectedFields),
    updated_at: compactText(source.updated_at, maxFieldLengths.updated_at) || null,
    whatsapp_phone: safePublicText(
      source,
      "whatsapp_phone",
      defaultCompanyProfile.whatsapp_phone,
      rejectedFields,
    ),
  };

  return {
    profile,
    rejectedFields: Array.from(new Set(rejectedFields)),
  };
}

export function companyProfilePaymentSummary(profile: PublicCompanyProfile) {
  const lines = [profile.bank_payment_instructions];

  if (profile.stripe_card_payment_enabled) {
    lines.push(
      profile.stripe_card_fee_required
        ? `Credit card payment available via Stripe. A ${profile.stripe_card_fee_percent}% card fee applies.`
        : "Credit card payment available via Stripe. No card fee is applied for this customer.",
    );
  }

  return lines.map((line) => line.trim()).filter(Boolean).join("\n");
}
