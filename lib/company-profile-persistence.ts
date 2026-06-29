import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  checkAdminBookingPersistenceStagingConfigReadiness,
  checkCustomerBookingRequestPersistenceConfigReadiness,
} from "./admin-booking-supabase-adapter";
import {
  companyProfileSettingsVersion,
  defaultCompanyProfile,
  sanitizePublicCompanyProfile,
  type PublicCompanyProfile,
} from "./company-profile-shared";

export const companyProfileTableName = "company_profile_settings";

type UnknownRecord = Record<string, unknown>;
type CompanyProfileClient = Pick<SupabaseClient, "from">;

type CompanyProfileReadResult = {
  ok: true;
  persistence_status: "default" | "persisted";
  profile: PublicCompanyProfile;
  source: "default" | "supabase";
  version: typeof companyProfileSettingsVersion;
};

type CompanyProfileWriteResult =
  | {
      ok: true;
      profile: PublicCompanyProfile;
      rejected_fields: string[];
      version: typeof companyProfileSettingsVersion;
    }
  | {
      error: string;
      ok: false;
      rejected_fields?: string[];
      status: 400 | 403 | 503;
      version: typeof companyProfileSettingsVersion;
    };

const companyProfileSelect = [
  "profile_key",
  "logo_image_url",
  "company_name",
  "whatsapp_phone",
  "phone",
  "email",
  "address",
  "uen",
  "bank_payment_instructions",
  "stripe_card_payment_enabled",
  "stripe_card_fee_required",
  "stripe_card_fee_percent",
  "invoice_footer_terms",
  "source_surface",
  "actor_role",
  "actor_label",
  "updated_at",
].join(", ");
const safeCompanyProfileReadError = "Company profile settings are using safe defaults.";
const safeCompanyProfileSaveConfigError =
  "Company profile settings cannot be saved until persistence is ready.";
const safeCompanyProfileSaveActorError =
  "Company profile settings require a verified internal admin boundary.";
const safeCompanyProfileSaveValidationError =
  "Company profile settings contain customer-hidden or invalid fields.";

function createServerClient() {
  return createClient(
    process.env.SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || "",
    {
      auth: {
        persistSession: false,
      },
    },
  );
}

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function profileFromRow(row: unknown) {
  return sanitizePublicCompanyProfile(asRecord(row)).profile;
}

function fallbackReadResult(): CompanyProfileReadResult {
  return {
    ok: true,
    persistence_status: "default",
    profile: defaultCompanyProfile,
    source: "default",
    version: companyProfileSettingsVersion,
  };
}

function verifiedAdminActor(actor: AdminBookingPersistenceAdapterActor | null | undefined) {
  return (
    !!actor &&
    actor.source_surface === "admin_api" &&
    (actor.actor_role === "admin" || actor.actor_role === "dispatcher")
  );
}

export async function loadPublicCompanyProfile(
  client: CompanyProfileClient = createServerClient(),
): Promise<CompanyProfileReadResult> {
  const readiness = checkCustomerBookingRequestPersistenceConfigReadiness();

  if (!readiness.ok) {
    return fallbackReadResult();
  }

  try {
    const { data, error } = await client
      .from(companyProfileTableName)
      .select(companyProfileSelect)
      .eq("profile_key", "default")
      .maybeSingle();

    if (error || !data) {
      return fallbackReadResult();
    }

    return {
      ok: true,
      persistence_status: "persisted",
      profile: profileFromRow(data),
      source: "supabase",
      version: companyProfileSettingsVersion,
    };
  } catch {
    return fallbackReadResult();
  }
}

export async function loadAdminCompanyProfile(
  actor: AdminBookingPersistenceAdapterActor,
  client: CompanyProfileClient = createServerClient(),
): Promise<CompanyProfileReadResult> {
  if (!verifiedAdminActor(actor)) {
    return fallbackReadResult();
  }

  return loadPublicCompanyProfile(client);
}

export async function saveAdminCompanyProfile(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  client: CompanyProfileClient = createServerClient(),
): Promise<CompanyProfileWriteResult> {
  if (!verifiedAdminActor(actor)) {
    return {
      error: safeCompanyProfileSaveActorError,
      ok: false,
      status: 403,
      version: companyProfileSettingsVersion,
    };
  }

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return {
      error: safeCompanyProfileSaveConfigError,
      ok: false,
      status: 503,
      version: companyProfileSettingsVersion,
    };
  }

  const sanitized = sanitizePublicCompanyProfile(input);

  if (sanitized.rejectedFields.length > 0) {
    return {
      error: safeCompanyProfileSaveValidationError,
      ok: false,
      rejected_fields: sanitized.rejectedFields,
      status: 400,
      version: companyProfileSettingsVersion,
    };
  }

  const payload = {
    ...sanitized.profile,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    profile_key: "default",
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await client
      .from(companyProfileTableName)
      .upsert(payload, { onConflict: "profile_key" })
      .select(companyProfileSelect)
      .single();

    if (error || !data) {
      return {
        error: safeCompanyProfileReadError,
        ok: false,
        status: 503,
        version: companyProfileSettingsVersion,
      };
    }

    return {
      ok: true,
      profile: profileFromRow(data),
      rejected_fields: [],
      version: companyProfileSettingsVersion,
    };
  } catch {
    return {
      error: safeCompanyProfileReadError,
      ok: false,
      status: 503,
      version: companyProfileSettingsVersion,
    };
  }
}
