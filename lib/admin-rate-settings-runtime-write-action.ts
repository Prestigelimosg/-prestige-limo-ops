import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceSafeErrorCategory } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  buildAdminRateSettingsWriteActionDisabledSetup,
  type AdminRateSettingsWriteActionDisabledSetupInput,
  type AdminRateSettingsWriteActionDisabledSetupResult,
} from "./admin-rate-settings-write-action-disabled-setup";

export const adminRateSettingsRuntimeWriteActionVersion =
  "admin-rate-settings-runtime-write-action-v1";
export const adminRateSettingsRuntimeWriteActionEnvGateName =
  "PRESTIGE_RATE_SETTINGS_WRITE_ENABLED";

type RuntimeWriteClient = Pick<SupabaseClient, "from">;
type RuntimeWriteStatus = "blocked" | "rejected" | "saved";
type RuntimeWriteReason =
  | "admin_session_required"
  | "config_not_ready"
  | "db_write_failed"
  | "missing_required_fields"
  | "saved"
  | "unsafe_or_unknown_fields"
  | "write_gate_closed";
type RateSettingsFields = AdminRateSettingsWriteActionDisabledSetupResult["rate_settings_fields"];
type SafeFailureCategory = AdminBookingPersistenceSafeErrorCategory | "client_init_failed";
type UnknownRecord = Record<string, unknown>;

export type AdminRateSettingsRuntimeWriteActionRecord = RateSettingsFields;

export type AdminRateSettingsRuntimeWriteActionResult = {
  action_name: "default_rate_settings_write";
  action_type: "default_rate_settings_write";
  category?: SafeFailureCategory;
  database_client_enabled: boolean;
  delivery_surface: "admin_rate_settings_runtime_write_action";
  env_gate_name: typeof adminRateSettingsRuntimeWriteActionEnvGateName;
  error?: string;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  no_op: boolean;
  ok: boolean;
  rate_settings_field_names: string[];
  rate_settings_fields: RateSettingsFields;
  reason: RuntimeWriteReason;
  record: AdminRateSettingsRuntimeWriteActionRecord | null;
  rejected_fields: string[];
  status: RuntimeWriteStatus;
  unknown_fields: string[];
  version: typeof adminRateSettingsRuntimeWriteActionVersion;
  write_enabled: boolean;
  write_gate_open: boolean;
};

export type AdminRateSettingsRuntimeWriteActionOptions = {
  clientFactory?: () => RuntimeWriteClient;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const safeBlockedError =
  "Rate settings write requires a verified admin or dispatcher session.";
const safeConfigError = "Rate settings write is not configured on this server.";
const safeWriteError = "Rate settings write failed safely.";
const rateSettingsWriteSelect =
  "id, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout";
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function finiteNonNegativeNumber(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && value.trim() === "")
  ) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function cleanConfigValue(value: string | undefined) {
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

function classifyDatabaseFailure(error: unknown): SafeFailureCategory {
  const record = asRecord(error);
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = textOrNull(record.code)?.toLowerCase() || "";
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (status === 401 || code === "401" || haystack.includes("invalid jwt")) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (code === "42p01" || (haystack.includes("relation") && haystack.includes("does not exist"))) {
    return "table_unreachable";
  }

  if (code === "42703" || code === "pgrst204" || (haystack.includes("column") && haystack.includes("not found"))) {
    return "column_missing";
  }

  return "unknown_adapter_failure";
}

function writeGateOpen() {
  return process.env[adminRateSettingsRuntimeWriteActionEnvGateName] === "true";
}

function safeResult(
  setup: AdminRateSettingsWriteActionDisabledSetupResult,
  overrides: Omit<
    Partial<AdminRateSettingsRuntimeWriteActionResult>,
    | "action_name"
    | "action_type"
    | "delivery_surface"
    | "env_gate_name"
    | "forbidden_fields_present"
    | "invalid_fields"
    | "rate_settings_field_names"
    | "rate_settings_fields"
    | "rejected_fields"
    | "unknown_fields"
    | "version"
  >,
): AdminRateSettingsRuntimeWriteActionResult {
  const gateOpen = writeGateOpen();

  return {
    action_name: "default_rate_settings_write",
    action_type: "default_rate_settings_write",
    database_client_enabled: false,
    delivery_surface: "admin_rate_settings_runtime_write_action",
    env_gate_name: adminRateSettingsRuntimeWriteActionEnvGateName,
    forbidden_fields_present: setup.forbidden_fields_present,
    invalid_fields: setup.invalid_fields,
    no_op: true,
    ok: false,
    rate_settings_field_names: setup.rate_settings_field_names,
    rate_settings_fields: setup.rate_settings_fields,
    reason: "write_gate_closed",
    record: null,
    rejected_fields: setup.rejected_fields,
    status: "blocked",
    unknown_fields: setup.unknown_fields,
    version: adminRateSettingsRuntimeWriteActionVersion,
    write_enabled: false,
    write_gate_open: gateOpen,
    ...overrides,
  };
}

function actorCanWrite(actor: AdminBookingPersistenceAdapterActor) {
  return Boolean(
    actor &&
      actor.boundary_mode === "server-session-role-surface" &&
      allowedActorRoles.has(actor.actor_role) &&
      actor.source_surface === "admin_api" &&
      textOrNull(actor.actor_label),
  );
}

function getRuntimeWriteClient(
  options: AdminRateSettingsRuntimeWriteActionOptions | undefined,
): RuntimeWriteClient | null {
  if (options?.clientFactory) {
    return options.clientFactory();
  }

  const supabaseUrl = cleanConfigValue(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanConfigValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!validServerDatabaseUrl(supabaseUrl) || !validServerCredential(serviceRoleKey)) {
    return null;
  }

  return createClient(supabaseUrl as string, serviceRoleKey as string, {
    auth: {
      persistSession: false,
    },
  });
}

function writePayload(fields: RateSettingsFields) {
  return {
    id: fields.id || "default",
    ...(fields.child_seat_customer_surcharge !== null
      ? { child_seat_customer_surcharge: fields.child_seat_customer_surcharge }
      : {}),
    ...(fields.child_seat_driver_payout !== null
      ? { child_seat_driver_payout: fields.child_seat_driver_payout }
      : {}),
    ...(fields.extra_stop_payout !== null ? { extra_stop_payout: fields.extra_stop_payout } : {}),
    ...(fields.extra_stop_surcharge !== null ? { extra_stop_surcharge: fields.extra_stop_surcharge } : {}),
    ...(fields.midnight_payout !== null ? { midnight_payout: fields.midnight_payout } : {}),
    ...(fields.midnight_surcharge !== null ? { midnight_surcharge: fields.midnight_surcharge } : {}),
    updated_at: new Date().toISOString(),
  };
}

function writableFieldCount(fields: RateSettingsFields) {
  return Object.entries(fields).filter(([field, value]) => field !== "id" && value !== null).length;
}

function toRateSettingsRecord(value: unknown): AdminRateSettingsRuntimeWriteActionRecord | null {
  const record = asRecord(value);
  const id = textOrNull(record.id)?.toLowerCase() === "default" ? "default" : null;

  if (!id) {
    return null;
  }

  return {
    child_seat_customer_surcharge: finiteNonNegativeNumber(record.child_seat_customer_surcharge),
    child_seat_driver_payout: finiteNonNegativeNumber(record.child_seat_driver_payout),
    extra_stop_payout: finiteNonNegativeNumber(record.extra_stop_payout),
    extra_stop_surcharge: finiteNonNegativeNumber(record.extra_stop_surcharge),
    id,
    midnight_payout: finiteNonNegativeNumber(record.midnight_payout),
    midnight_surcharge: finiteNonNegativeNumber(record.midnight_surcharge),
  };
}

export async function executeAdminRateSettingsRuntimeWriteAction(
  input: AdminRateSettingsWriteActionDisabledSetupInput,
  actor: AdminBookingPersistenceAdapterActor,
  options?: AdminRateSettingsRuntimeWriteActionOptions,
): Promise<AdminRateSettingsRuntimeWriteActionResult> {
  const setup = buildAdminRateSettingsWriteActionDisabledSetup(input);

  if (!setup.ok) {
    return safeResult(setup, {
      reason: "unsafe_or_unknown_fields",
      status: "rejected",
    });
  }

  if (writableFieldCount(setup.rate_settings_fields) === 0) {
    return safeResult(setup, {
      error: "Rate settings write requires at least one safe scalar rate setting field.",
      reason: "missing_required_fields",
      status: "rejected",
    });
  }

  if (!writeGateOpen()) {
    return safeResult(setup, {
      error: "Rate settings write gate is closed.",
      reason: "write_gate_closed",
      status: "blocked",
    });
  }

  if (!actorCanWrite(actor)) {
    return safeResult(setup, {
      error: safeBlockedError,
      reason: "admin_session_required",
      status: "blocked",
      write_gate_open: true,
    });
  }

  let client: RuntimeWriteClient | null = null;

  try {
    client = getRuntimeWriteClient(options);
  } catch {
    return safeResult(setup, {
      category: "client_init_failed",
      database_client_enabled: false,
      error: safeConfigError,
      reason: "config_not_ready",
      status: "blocked",
      write_gate_open: true,
    });
  }

  if (!client) {
    return safeResult(setup, {
      database_client_enabled: false,
      error: safeConfigError,
      reason: "config_not_ready",
      status: "blocked",
      write_gate_open: true,
    });
  }

  const { data, error } = await client
    .from("rate_settings")
    .upsert(writePayload(setup.rate_settings_fields), { onConflict: "id" })
    .select(rateSettingsWriteSelect)
    .single();

  if (error) {
    return safeResult(setup, {
      category: classifyDatabaseFailure(error),
      database_client_enabled: true,
      error: safeWriteError,
      no_op: true,
      reason: "db_write_failed",
      status: "blocked",
      write_gate_open: true,
    });
  }

  return safeResult(setup, {
    database_client_enabled: true,
    no_op: false,
    ok: true,
    reason: "saved",
    record: toRateSettingsRecord(data),
    status: "saved",
    write_enabled: true,
    write_gate_open: true,
  });
}
