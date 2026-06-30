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

export const defaultCompanyLogoPath = "/prestige-limo-sg-logo.jpg";

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
  address: "10 Anson Rd, #10-11 Prestige Limo SG, International Plaza, Singapore 079903",
  bank_payment_instructions:
    "Bank Details\nPrestige Limo SG\nDBS Bank account no: 0721478960\nBank Name: DBS Bank Limited\nBank Code: 7171\nBranch Code: 072\nSwift Code: DBSSSGSG\nBank Address: 12 Marina Boulevard, Floor 1, Singapore 018982\nPayNow UEN no: 53387257W",
  company_name: "Prestige Limo SG",
  email: "acc@prestigelimo.sg",
  invoice_footer_terms:
    "Thank you for choosing our service. Payment is due upon completion unless otherwise agreed in writing. Waiting time, surcharge, amendment, cancellation, damage, and excess luggage charges may apply where relevant.",
  logo_image_url: defaultCompanyLogoPath,
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

  if (profileForbiddenPattern.test(raw)) {
    return "";
  }

  if (/^data:image\/(?:png|jpe?g|webp);base64,[a-z0-9+/=\s]+$/i.test(raw)) {
    return raw;
  }

  if (/^\/[a-z0-9][a-z0-9/_-]*\.(?:png|jpe?g|webp)$/i.test(raw)) {
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

function companyProfileContactKey(value: string) {
  const cleaned = value.replace(/\s+/g, " ").trim().toLowerCase();
  const digits = cleaned.replace(/\D/g, "");

  return digits.length >= 7 ? `phone:${digits}` : `text:${cleaned}`;
}

export function companyProfileContactLines(profile: PublicCompanyProfile) {
  const seen = new Set<string>();

  return [profile.whatsapp_phone, profile.phone, profile.email]
    .map((value) => value.replace(/\s+/g, " ").trim())
    .filter((value) => {
      if (!value) {
        return false;
      }

      const key = companyProfileContactKey(value);

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return true;
    });
}
