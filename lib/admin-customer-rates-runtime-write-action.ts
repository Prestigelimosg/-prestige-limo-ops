import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceSafeErrorCategory } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import type { BookingType, RateRules } from "./pricing";

export const adminCustomerRatesRuntimeWriteActionVersion =
  "admin-customer-rates-runtime-write-action-v1";
export const adminCustomerRatesRuntimeWriteActionEnvGateName =
  "PRESTIGE_CUSTOMER_RATES_WRITE_ENABLED";

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
type CustomerRatesActionType =
  | "company_customer_rates_update"
  | "traveler_customer_rates_update";
type CustomerRatesActionScope = "company" | "traveler";
type SafeFailureCategory = AdminBookingPersistenceSafeErrorCategory | "client_init_failed";
type UnknownRecord = Record<string, unknown>;

export type AdminCustomerRatesRuntimeWriteActionRecord = {
  customer_rates: RateRules;
  id: number;
};

export type AdminCustomerRatesRuntimeWriteActionResult = {
  action_scope: CustomerRatesActionScope | null;
  action_type: CustomerRatesActionType | null;
  category?: SafeFailureCategory;
  customer_rate_field_names: BookingType[];
  customer_rates: RateRules;
  database_client_enabled: boolean;
  delivery_surface: "admin_customer_rates_runtime_write_action";
  env_gate_name: typeof adminCustomerRatesRuntimeWriteActionEnvGateName;
  error?: string;
  forbidden_fields_present: string[];
  id: number | null;
  invalid_fields: string[];
  no_op: boolean;
  ok: boolean;
  reason: RuntimeWriteReason;
  record: AdminCustomerRatesRuntimeWriteActionRecord | null;
  rejected_fields: string[];
  status: RuntimeWriteStatus;
  unknown_fields: string[];
  version: typeof adminCustomerRatesRuntimeWriteActionVersion;
  write_enabled: boolean;
  write_gate_open: boolean;
};

export type AdminCustomerRatesRuntimeWriteActionOptions = {
  clientFactory?: () => RuntimeWriteClient;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const allowedCustomerRateKeys: BookingType[] = ["MNG", "DEP", "TRF", "DSP"];
const safeBlockedError =
  "Customer rates write requires a verified admin or dispatcher session.";
const safeConfigError = "Customer rates write is not configured on this server.";
const safeWriteError = "Customer rates write failed safely.";
const customerRatesWriteSelect = "id, customer_rates";
const forbiddenFieldPattern =
  /driver_payout|driver_payout_rules|payout|paynow|pay_now|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|live_location|photo|calendar|internal|admin_notes|parser_debug|debug|secret|api_key|access_token|raw_token|mock_archive|mock_qa/i;
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

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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
  return process.env[adminCustomerRatesRuntimeWriteActionEnvGateName] === "true";
}

function actionScope(actionType: CustomerRatesActionType | null): CustomerRatesActionScope | null {
  if (actionType === "company_customer_rates_update") {
    return "company";
  }

  if (actionType === "traveler_customer_rates_update") {
    return "traveler";
  }

  return null;
}

function customerRateFieldsFrom(value: unknown) {
  const source = asRecord(value);
  const customerRates: RateRules = {};
  const invalidFields: string[] = [];
  const unknownFields: string[] = [];

  for (const [key, rawValue] of Object.entries(source)) {
    if (!allowedCustomerRateKeys.includes(key as BookingType)) {
      unknownFields.push(`customer_rates.${key}`);
      continue;
    }

    const parsedValue = finiteNonNegativeNumber(rawValue);

    if (parsedValue === null) {
      invalidFields.push(`customer_rates.${key}`);
      continue;
    }

    customerRates[key as BookingType] = parsedValue;
  }

  return {
    customerRates,
    invalidFields,
    unknownFields,
  };
}

function collectForbiddenFields(value: unknown, prefix = ""): string[] {
  if (value === null || typeof value !== "object") {
    return [];
  }

  const record = asRecord(value);
  const fields: string[] = [];

  for (const [key, nestedValue] of Object.entries(record)) {
    const fieldName = prefix ? `${prefix}.${key}` : key;

    if (forbiddenFieldPattern.test(key)) {
      fields.push(fieldName);
    }

    fields.push(...collectForbiddenFields(nestedValue, fieldName));
  }

  return [...new Set(fields)];
}

function buildContract(input: unknown) {
  const record = asRecord(input);
  const requestedAction = textOrNull(record.action_type);
  const action: CustomerRatesActionType | null =
    requestedAction === "company_customer_rates_update" ||
    requestedAction === "traveler_customer_rates_update"
      ? requestedAction
      : null;
  const id = positiveInteger(record.id);
  const invalidFields: string[] = [];
  const unknownFields: string[] = [];
  const forbiddenFields = collectForbiddenFields(record);

  if (!action) {
    invalidFields.push("action_type");
  }

  if (!id) {
    invalidFields.push("id");
  }

  for (const key of Object.keys(record)) {
    if (!["action_type", "customer_rates", "id"].includes(key)) {
      unknownFields.push(key);
    }
  }

  const customerRateFields = customerRateFieldsFrom(record.customer_rates);
  invalidFields.push(...customerRateFields.invalidFields);
  unknownFields.push(...customerRateFields.unknownFields);

  return {
    action_scope: actionScope(action),
    action_type: action,
    customer_rate_field_names: Object.keys(customerRateFields.customerRates) as BookingType[],
    customer_rates: customerRateFields.customerRates,
    forbidden_fields_present: forbiddenFields,
    id,
    invalid_fields: [...new Set(invalidFields)],
    ok:
      forbiddenFields.length === 0 &&
      invalidFields.length === 0 &&
      unknownFields.length === 0,
    rejected_fields: [...new Set([...forbiddenFields, ...invalidFields, ...unknownFields])],
    unknown_fields: [...new Set(unknownFields)],
  };
}

function safeResult(
  contract: ReturnType<typeof buildContract>,
  overrides: Omit<
    Partial<AdminCustomerRatesRuntimeWriteActionResult>,
    | "action_scope"
    | "action_type"
    | "customer_rate_field_names"
    | "customer_rates"
    | "delivery_surface"
    | "env_gate_name"
    | "forbidden_fields_present"
    | "id"
    | "invalid_fields"
    | "rejected_fields"
    | "unknown_fields"
    | "version"
  >,
): AdminCustomerRatesRuntimeWriteActionResult {
  const gateOpen = writeGateOpen();

  return {
    action_scope: contract.action_scope,
    action_type: contract.action_type,
    customer_rate_field_names: contract.customer_rate_field_names,
    customer_rates: contract.customer_rates,
    database_client_enabled: false,
    delivery_surface: "admin_customer_rates_runtime_write_action",
    env_gate_name: adminCustomerRatesRuntimeWriteActionEnvGateName,
    forbidden_fields_present: contract.forbidden_fields_present,
    id: contract.id,
    invalid_fields: contract.invalid_fields,
    no_op: true,
    ok: false,
    reason: "write_gate_closed",
    record: null,
    rejected_fields: contract.rejected_fields,
    status: "blocked",
    unknown_fields: contract.unknown_fields,
    version: adminCustomerRatesRuntimeWriteActionVersion,
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
  options: AdminCustomerRatesRuntimeWriteActionOptions | undefined,
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

function writableFieldCount(fields: RateRules) {
  return Object.keys(fields).length;
}

function writePayload(fields: RateRules) {
  return {
    customer_rates: fields,
    updated_at: new Date().toISOString(),
  };
}

function toCustomerRatesRecord(value: unknown): AdminCustomerRatesRuntimeWriteActionRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    customer_rates: customerRateFieldsFrom(record.customer_rates).customerRates,
    id,
  };
}

export async function executeAdminCustomerRatesRuntimeWriteAction(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  options?: AdminCustomerRatesRuntimeWriteActionOptions,
): Promise<AdminCustomerRatesRuntimeWriteActionResult> {
  const contract = buildContract(input);

  if (!contract.ok) {
    return safeResult(contract, {
      reason: "unsafe_or_unknown_fields",
      status: "rejected",
    });
  }

  if (writableFieldCount(contract.customer_rates) === 0) {
    return safeResult(contract, {
      error: "Customer rates write requires at least one safe customer rate field.",
      reason: "missing_required_fields",
      status: "rejected",
    });
  }

  if (!writeGateOpen()) {
    return safeResult(contract, {
      error: "Customer rates write gate is closed.",
      reason: "write_gate_closed",
      status: "blocked",
    });
  }

  if (!actorCanWrite(actor)) {
    return safeResult(contract, {
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
    return safeResult(contract, {
      category: "client_init_failed",
      database_client_enabled: false,
      error: safeConfigError,
      reason: "config_not_ready",
      status: "blocked",
      write_gate_open: true,
    });
  }

  if (!client) {
    return safeResult(contract, {
      database_client_enabled: false,
      error: safeConfigError,
      reason: "config_not_ready",
      status: "blocked",
      write_gate_open: true,
    });
  }

  const targetTable = contract.action_scope === "company" ? "companies" : "travelers";
  const { data, error } = await client
    .from(targetTable)
    .update(writePayload(contract.customer_rates))
    .eq("id", contract.id as number)
    .select(customerRatesWriteSelect)
    .single();

  if (error) {
    return safeResult(contract, {
      category: classifyDatabaseFailure(error),
      database_client_enabled: true,
      error: safeWriteError,
      no_op: true,
      reason: "db_write_failed",
      status: "blocked",
      write_gate_open: true,
    });
  }

  return safeResult(contract, {
    database_client_enabled: true,
    no_op: false,
    ok: true,
    reason: "saved",
    record: toCustomerRatesRecord(data),
    status: "saved",
    write_enabled: true,
    write_gate_open: true,
  });
}
