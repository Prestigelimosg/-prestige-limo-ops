import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingResult } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

type UnknownRecord = Record<string, unknown>;
type ProfileClient = Pick<SupabaseClient, "rpc">;

export const adminCustomerCompanyBookerProfileVersion =
  "admin-customer-company-booker-profile-v1";

export type AdminCustomerCompanyBookerProfileRecord = {
  booker_email: string | null;
  booker_id: number;
  booker_name: string;
  booker_phone: string | null;
  company_id: number;
  company_name: string;
  customer_display_name: string;
  customer_id: number;
};

const allowedInputFields = new Set([
  "action_type",
  "booker_id",
  "booker_profile",
  "company_id",
  "company_profile",
  "customer_display_name",
  "customer_id",
  "expected_booker_profile",
  "expected_booker_customer_id",
  "expected_company_profile",
  "expected_customer_display_name",
]);
const companyProfileFields = [
  "accounts_email",
  "billing_address",
  "billing_email",
  "company_name",
  "domain",
  "main_phone",
  "mobile_phone",
  "operations_email",
  "primary_contact_name",
  "website",
] as const;
const bookerProfileFields = ["booker_name", "email", "phone"] as const;
const allowedRoles = new Set(["admin", "dispatcher"]);

function record(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function positiveId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeText(value: unknown, maxLength: number, required = false) {
  if (value === null && !required) {
    return null;
  }

  if (typeof value !== "string") {
    return required ? null : undefined;
  }

  const cleaned = value.replace(/\s+/g, " ").trim();

  if ((!cleaned && required) || cleaned.length > maxLength) {
    return null;
  }

  return cleaned || null;
}

function safeProfile(
  value: unknown,
  fields: readonly string[],
  requiredName: "booker_name" | "company_name",
) {
  if (value === null) {
    return null;
  }

  const input = record(value);

  if (Object.keys(input).some((field) => !fields.includes(field))) {
    return undefined;
  }

  const output: UnknownRecord = {};

  for (const field of fields) {
    const cleaned = safeText(
      input[field],
      field === "company_name" || field === "booker_name" ? 220 : 500,
      field === requiredName,
    );

    if (cleaned === undefined || (field === requiredName && !cleaned)) {
      return undefined;
    }

    output[field] = cleaned;
  }

  return output;
}

function client(): ProfileClient | null {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key || !url.startsWith("https://") || key.length < 24) {
    return null;
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function toRecord(value: unknown): AdminCustomerCompanyBookerProfileRecord | null {
  const row = record(value);
  const customerId = positiveId(row.customer_id);
  const companyId = positiveId(row.company_id);
  const bookerId = positiveId(row.booker_id);
  const customerDisplayName = safeText(row.customer_display_name, 120, true);
  const companyName = safeText(row.company_name, 220, true);
  const bookerName = safeText(row.booker_name, 220, true);

  return customerId && companyId && bookerId && customerDisplayName && companyName && bookerName
    ? {
        booker_email: safeText(row.booker_email, 500) || null,
        booker_id: bookerId,
        booker_name: bookerName,
        booker_phone: safeText(row.booker_phone, 500) || null,
        company_id: companyId,
        company_name: companyName,
        customer_display_name: customerDisplayName,
        customer_id: customerId,
      }
    : null;
}

export async function overwriteAdminCustomerCompanyBookerProfile(
  inputValue: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  profileClient?: ProfileClient | null,
): Promise<AdminBookingResult<AdminCustomerCompanyBookerProfileRecord>> {
  const input = record(inputValue);

  if (
    Object.keys(input).some((field) => !allowedInputFields.has(field)) ||
    input.action_type !== "customer_company_booker_profile_overwrite" ||
    !actor ||
    actor.boundary_mode !== "server-session-role-surface" ||
    !allowedRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !safeText(actor.actor_label, 160, true)
  ) {
    return { error: "Customer Company + Booker profile request was rejected safely.", ok: false, status: 403 };
  }

  const customerId = positiveId(input.customer_id);
  const companyId = input.company_id === null ? null : positiveId(input.company_id);
  const bookerId = input.booker_id === null ? null : positiveId(input.booker_id);
  const expectedCustomerName = safeText(input.expected_customer_display_name, 120, true);
  const customerName = safeText(input.customer_display_name, 120, true);
  const companyProfile = safeProfile(input.company_profile, companyProfileFields, "company_name");
  const expectedCompanyProfile = input.expected_company_profile === null
    ? null
    : safeProfile(input.expected_company_profile, companyProfileFields, "company_name");
  const bookerProfile = safeProfile(input.booker_profile, bookerProfileFields, "booker_name");
  const expectedBookerProfile = input.expected_booker_profile === null
    ? null
    : safeProfile(input.expected_booker_profile, bookerProfileFields, "booker_name");
  const expectedBookerCustomerId = input.expected_booker_customer_id === null
    ? null
    : positiveId(input.expected_booker_customer_id);

  if (
    !customerId ||
    !expectedCustomerName ||
    !customerName ||
    !companyProfile ||
    !bookerProfile ||
    expectedCompanyProfile === undefined ||
    expectedBookerProfile === undefined ||
    Boolean(companyId) !== Boolean(expectedCompanyProfile) ||
    Boolean(bookerId) !== Boolean(expectedBookerProfile) ||
    (!bookerId && expectedBookerCustomerId !== null) ||
    (bookerId && input.expected_booker_customer_id !== null && !expectedBookerCustomerId)
  ) {
    return { error: "Customer Company + Booker profile fields are incomplete or stale.", ok: false, status: 400 };
  }

  const resolvedClient = profileClient === undefined ? client() : profileClient;

  if (!resolvedClient) {
    return { error: "Customer Company + Booker profile saving is not configured.", ok: false, status: 503 };
  }

  const { data, error } = await resolvedClient.rpc(
    "apply_admin_customer_company_booker_profile",
    {
      p_actor_label: actor.actor_label,
      p_actor_role: actor.actor_role,
      p_booker_id: bookerId,
      p_booker_profile: bookerProfile,
      p_company_id: companyId,
      p_company_profile: companyProfile,
      p_customer_display_name: customerName,
      p_customer_id: customerId,
      p_expected_booker_profile: expectedBookerProfile,
      p_expected_booker_customer_id: expectedBookerCustomerId,
      p_expected_company_profile: expectedCompanyProfile,
      p_expected_customer_display_name: expectedCustomerName,
    },
  );

  if (error) {
    const code = String((error as { code?: unknown }).code || "");
    const status = code === "40001" || code === "23505" ? 409 : 500;

    return {
      error: status === 409
        ? "Customer Company + Booker profile changed while it was open. Reload before saving."
        : "Customer Company + Booker profile save failed safely.",
      ok: false,
      status,
    };
  }

  const rows = Array.isArray(data) ? data : [];
  const saved = rows.length === 1 ? toRecord(rows[0]) : null;

  return saved
    ? { data: saved, ok: true }
    : { error: "Customer Company + Booker profile could not be reloaded safely.", ok: false, status: 500 };
}
