import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import type { DriverPayoutRule, DriverPayoutRules, RateRules } from "./pricing";

export const adminRateSetupReadVersion = "stage-admin-rate-setup-read-api-v1";

export type AdminRateSetupSettings = {
  child_seat_customer_surcharge: number | null;
  child_seat_driver_payout: number | null;
  customer_rates: RateRules;
  driver_payout_rules: DriverPayoutRules;
  extra_stop_payout: number | null;
  extra_stop_surcharge: number | null;
  midnight_payout: number | null;
  midnight_surcharge: number | null;
};

export type AdminRateSetupCompany = {
  company_name: string | null;
  customer_rates: RateRules;
  domain: string | null;
  driver_payout_rules: DriverPayoutRules;
  id: number;
  transzend_excel_privacy: boolean | null;
};

export type AdminRateSetupTraveler = {
  company_id: number;
  customer_rates: RateRules;
  driver_payout_rules: DriverPayoutRules;
  id: number;
  traveler_name: string | null;
};

export type AdminRateSetupReadResult = {
  companies: AdminRateSetupCompany[];
  settings: AdminRateSetupSettings | null;
  travelers: AdminRateSetupTraveler[];
  version: typeof adminRateSetupReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type RateSetupClient = Pick<SupabaseClient, "from">;

const safeRateSetupConfigError = "Admin rate setup read configuration is not ready.";
const safeRateSetupActorError =
  "Admin rate setup read requires a verified internal boundary.";
const safeRateSetupServerSessionActorError =
  "Admin rate setup read requires a verified admin or dispatcher server session.";
const safeRateSetupReadError = "Admin rate setup read failed safely.";
const rateSettingsSelect =
  "customer_rates, driver_payout_rules, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout";
const companySelect =
  "id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy";
const travelerSelect =
  "id, company_id, traveler_name, customer_rates, driver_payout_rules";
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const bookingTypes = ["MNG", "DEP", "TRF", "DSP"] as const;
const maxSafeTextLength = 220;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown, maxLength = maxSafeTextLength) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function finiteNumberOrNull(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function rateRulesFromDb(value: unknown): RateRules {
  const source = asRecord(value);
  const rules: RateRules = {};

  for (const bookingType of bookingTypes) {
    const rate = finiteNumberOrNull(source[bookingType]);

    if (rate !== null) {
      rules[bookingType] = rate;
    }
  }

  return rules;
}

function payoutRuleFromDb(value: unknown, bookingType: (typeof bookingTypes)[number]) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "object") {
    const amount = finiteNumberOrNull(value);

    if (amount === null) {
      return null;
    }

    return bookingType === "DSP" ? { amount, perHour: true } : { min: amount, max: amount };
  }

  const source = asRecord(value);
  const amount = finiteNumberOrNull(source.amount);
  const min = finiteNumberOrNull(source.min);
  const max = finiteNumberOrNull(source.max);
  const rule: DriverPayoutRule = {};

  if (amount !== null) {
    rule.amount = amount;
  }

  if (min !== null) {
    rule.min = min;
  }

  if (max !== null) {
    rule.max = max;
  }

  if (typeof source.perHour === "boolean") {
    rule.perHour = source.perHour;
  }

  return Object.keys(rule).length > 0 ? rule : null;
}

function payoutRulesFromDb(value: unknown): DriverPayoutRules {
  const source = asRecord(value);
  const rules: DriverPayoutRules = {};

  for (const bookingType of bookingTypes) {
    const rule = payoutRuleFromDb(source[bookingType], bookingType);

    if (rule) {
      rules[bookingType] = rule;
    }
  }

  return rules;
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function validServerDatabaseUrl(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname.length > 0 &&
      !hostname.includes("localhost") &&
      !hostname.includes("example") &&
      !hostname.includes("placeholder")
    );
  } catch {
    return false;
  }
}

function validServerCredential(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function classifyAdapterDatabaseFailure(
  error: unknown,
): AdminBookingPersistenceSafeErrorCategory {
  const record = asRecord(error);
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = textOrNull(record.code)?.toLowerCase() || "";
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (
    status === 401 ||
    code === "401" ||
    haystack.includes("invalid api") ||
    haystack.includes("invalid jwt") ||
    haystack.includes("jwt")
  ) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("row-level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (
    code === "42p01" ||
    haystack.includes("could not find the table") ||
    (haystack.includes("relation") && haystack.includes("does not exist"))
  ) {
    return "table_unreachable";
  }

  if (
    code === "42703" ||
    code === "pgrst204" ||
    code === "pgrst200" ||
    (haystack.includes("relationship") && haystack.includes("schema cache")) ||
    (haystack.includes("column") &&
      (haystack.includes("does not exist") ||
        haystack.includes("not found") ||
        haystack.includes("schema cache")))
  ) {
    return "column_missing";
  }

  return "unknown_adapter_failure";
}

function safeAdapterFailure<T>(
  error: string,
  status: number,
  databaseError: unknown,
): AdminBookingResult<T> {
  return {
    category: classifyAdapterDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedActorRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      error: safeRateSetupActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role))
  ) {
    return {
      error: safeRateSetupServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getRateSetupClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<RateSetupClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !validServerDatabaseUrl(supabaseUrl) ||
    !validServerCredential(serviceRoleKey)
  ) {
    return {
      error: safeRateSetupConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    return {
      data: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      }),
      ok: true,
    };
  } catch {
    return {
      category: "client_init_failed",
      error: safeRateSetupConfigError,
      ok: false,
      status: 503,
    };
  }
}

function toRateSetupSettings(row: unknown): AdminRateSetupSettings | null {
  const record = asRecord(row);

  if (Object.keys(record).length === 0) {
    return null;
  }

  return {
    child_seat_customer_surcharge: finiteNumberOrNull(record.child_seat_customer_surcharge),
    child_seat_driver_payout: finiteNumberOrNull(record.child_seat_driver_payout),
    customer_rates: rateRulesFromDb(record.customer_rates),
    driver_payout_rules: payoutRulesFromDb(record.driver_payout_rules),
    extra_stop_payout: finiteNumberOrNull(record.extra_stop_payout),
    extra_stop_surcharge: finiteNumberOrNull(record.extra_stop_surcharge),
    midnight_payout: finiteNumberOrNull(record.midnight_payout),
    midnight_surcharge: finiteNumberOrNull(record.midnight_surcharge),
  };
}

function toRateSetupCompany(row: unknown): AdminRateSetupCompany | null {
  const record = asRecord(row);
  const id = positiveIntegerOrNull(record.id);

  if (!id) {
    return null;
  }

  return {
    company_name: textOrNull(record.company_name),
    customer_rates: rateRulesFromDb(record.customer_rates),
    domain: textOrNull(record.domain, 120),
    driver_payout_rules: payoutRulesFromDb(record.driver_payout_rules),
    id,
    transzend_excel_privacy: booleanOrNull(record.transzend_excel_privacy),
  };
}

function toRateSetupTraveler(row: unknown): AdminRateSetupTraveler | null {
  const record = asRecord(row);
  const id = positiveIntegerOrNull(record.id);
  const companyId = positiveIntegerOrNull(record.company_id);

  if (!id || !companyId) {
    return null;
  }

  return {
    company_id: companyId,
    customer_rates: rateRulesFromDb(record.customer_rates),
    driver_payout_rules: payoutRulesFromDb(record.driver_payout_rules),
    id,
    traveler_name: textOrNull(record.traveler_name),
  };
}

export async function loadAdminRateSetup(
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminRateSetupReadResult>> {
  const clientResult = getRateSetupClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const [settingsResult, companiesResult, travelersResult] = await Promise.all([
    clientResult.data
      .from("rate_settings")
      .select(rateSettingsSelect)
      .eq("id", "default")
      .limit(1)
      .maybeSingle(),
    clientResult.data
      .from("companies")
      .select(companySelect)
      .order("company_name", { ascending: true }),
    clientResult.data
      .from("travelers")
      .select(travelerSelect)
      .order("traveler_name", { ascending: true }),
  ]);

  const error = settingsResult.error || companiesResult.error || travelersResult.error;

  if (error) {
    return safeAdapterFailure(safeRateSetupReadError, 500, error);
  }

  return {
    data: {
      companies: asArray(companiesResult.data)
        .map(toRateSetupCompany)
        .filter((company): company is AdminRateSetupCompany => Boolean(company)),
      settings: toRateSetupSettings(settingsResult.data),
      travelers: asArray(travelersResult.data)
        .map(toRateSetupTraveler)
        .filter((traveler): traveler is AdminRateSetupTraveler => Boolean(traveler)),
      version: adminRateSetupReadVersion,
    },
    ok: true,
  };
}
