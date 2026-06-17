import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceSafeErrorCategory } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import type { BookingType, DriverPayoutRule, DriverPayoutRules } from "./pricing";

export const adminDriverPayoutRulesRuntimeWriteActionVersion =
  "admin-driver-payout-rules-runtime-write-action-v1";
export const adminDriverPayoutRulesRuntimeWriteActionEnvGateName =
  "PRESTIGE_DRIVER_PAYOUT_RULES_WRITE_ENABLED";

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
type DriverPayoutRulesActionType =
  | "company_driver_payout_rules_update"
  | "traveler_driver_payout_rules_update";
type DriverPayoutRulesActionScope = "company" | "traveler";
type SafeFailureCategory = AdminBookingPersistenceSafeErrorCategory | "client_init_failed";
type UnknownRecord = Record<string, unknown>;

export type AdminDriverPayoutRulesRuntimeWriteActionRecord = {
  driver_payout_rules: DriverPayoutRules;
  id: number;
};

export type AdminDriverPayoutRulesRuntimeWriteActionResult = {
  action_scope: DriverPayoutRulesActionScope | null;
  action_type: DriverPayoutRulesActionType | null;
  category?: SafeFailureCategory;
  database_client_enabled: boolean;
  delivery_surface: "admin_driver_payout_rules_runtime_write_action";
  driver_payout_rule_field_names: BookingType[];
  driver_payout_rules: DriverPayoutRules;
  env_gate_name: typeof adminDriverPayoutRulesRuntimeWriteActionEnvGateName;
  error?: string;
  forbidden_fields_present: string[];
  id: number | null;
  invalid_fields: string[];
  no_op: boolean;
  ok: boolean;
  reason: RuntimeWriteReason;
  record: AdminDriverPayoutRulesRuntimeWriteActionRecord | null;
  rejected_fields: string[];
  status: RuntimeWriteStatus;
  unknown_fields: string[];
  version: typeof adminDriverPayoutRulesRuntimeWriteActionVersion;
  write_enabled: boolean;
  write_gate_open: boolean;
};

export type AdminDriverPayoutRulesRuntimeWriteActionOptions = {
  clientFactory?: () => RuntimeWriteClient;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const allowedDriverPayoutRuleKeys: BookingType[] = ["MNG", "DEP", "TRF", "DSP"];
const allowedRuleFields = new Set(["amount", "max", "min", "perHour"]);
const safeBlockedError =
  "Driver payout rules write requires a verified admin or dispatcher session.";
const safeConfigError = "Driver payout rules write is not configured on this server.";
const safeWriteError = "Driver payout rules write failed safely.";
const driverPayoutRulesWriteSelect = "id, driver_payout_rules";
const forbiddenFieldPattern =
  /customer_rate|customer_price|customer_rates|pricing|price|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|live_location|photo|calendar|internal|admin_notes|parser_debug|debug|secret|api_key|access_token|raw_token|paynow|pay_now|payout_preferences|mock_archive|mock_qa/i;
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
  return process.env[adminDriverPayoutRulesRuntimeWriteActionEnvGateName] === "true";
}

function actionScope(
  actionType: DriverPayoutRulesActionType | null,
): DriverPayoutRulesActionScope | null {
  if (actionType === "company_driver_payout_rules_update") {
    return "company";
  }

  if (actionType === "traveler_driver_payout_rules_update") {
    return "traveler";
  }

  return null;
}

function driverPayoutRuleFrom(value: unknown, fieldName: string) {
  const source = asRecord(value);
  const rule: DriverPayoutRule = {};
  const invalidFields: string[] = [];
  const unknownFields: string[] = [];

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalidFields.push(fieldName);
    return { invalidFields, rule, unknownFields };
  }

  for (const [key, rawValue] of Object.entries(source)) {
    const nestedFieldName = `${fieldName}.${key}`;

    if (!allowedRuleFields.has(key)) {
      unknownFields.push(nestedFieldName);
      continue;
    }

    if (key === "perHour") {
      if (typeof rawValue !== "boolean") {
        invalidFields.push(nestedFieldName);
        continue;
      }

      rule.perHour = rawValue;
      continue;
    }

    const parsedValue = finiteNonNegativeNumber(rawValue);

    if (parsedValue === null) {
      invalidFields.push(nestedFieldName);
      continue;
    }

    rule[key as "amount" | "max" | "min"] = parsedValue;
  }

  if (
    rule.min !== undefined &&
    rule.max !== undefined &&
    rule.min > rule.max
  ) {
    invalidFields.push(`${fieldName}.min_max_range`);
  }

  if (
    Object.keys(rule).length === 0 &&
    invalidFields.length === 0 &&
    unknownFields.length === 0
  ) {
    invalidFields.push(fieldName);
  }

  return {
    invalidFields,
    rule,
    unknownFields,
  };
}

function driverPayoutRulesFrom(value: unknown) {
  const source = asRecord(value);
  const driverPayoutRules: DriverPayoutRules = {};
  const invalidFields: string[] = [];
  const unknownFields: string[] = [];

  for (const [key, rawValue] of Object.entries(source)) {
    if (!allowedDriverPayoutRuleKeys.includes(key as BookingType)) {
      unknownFields.push(`driver_payout_rules.${key}`);
      continue;
    }

    const parsedRule = driverPayoutRuleFrom(rawValue, `driver_payout_rules.${key}`);
    invalidFields.push(...parsedRule.invalidFields);
    unknownFields.push(...parsedRule.unknownFields);

    if (Object.keys(parsedRule.rule).length > 0) {
      driverPayoutRules[key as BookingType] = parsedRule.rule;
    }
  }

  return {
    driverPayoutRules,
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
  const action: DriverPayoutRulesActionType | null =
    requestedAction === "company_driver_payout_rules_update" ||
    requestedAction === "traveler_driver_payout_rules_update"
      ? requestedAction
      : null;
  const id = positiveInteger(record.id);
  const invalidFields: string[] = [];
  const unknownFields: string[] = [];
  const forbiddenFields = collectForbiddenFields(record);
  const driverPayoutRulesProvided =
    record.driver_payout_rules !== null &&
    record.driver_payout_rules !== undefined &&
    typeof record.driver_payout_rules === "object" &&
    !Array.isArray(record.driver_payout_rules);

  if (!action) {
    invalidFields.push("action_type");
  }

  if (!id) {
    invalidFields.push("id");
  }

  for (const key of Object.keys(record)) {
    if (!["action_type", "driver_payout_rules", "id"].includes(key)) {
      unknownFields.push(key);
    }
  }

  if (!driverPayoutRulesProvided) {
    invalidFields.push("driver_payout_rules");
  }

  const driverPayoutRuleFields = driverPayoutRulesFrom(record.driver_payout_rules);
  invalidFields.push(...driverPayoutRuleFields.invalidFields);
  unknownFields.push(...driverPayoutRuleFields.unknownFields);

  return {
    action_scope: actionScope(action),
    action_type: action,
    driver_payout_rule_field_names: Object.keys(driverPayoutRuleFields.driverPayoutRules) as BookingType[],
    driver_payout_rules: driverPayoutRuleFields.driverPayoutRules,
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
    Partial<AdminDriverPayoutRulesRuntimeWriteActionResult>,
    | "action_scope"
    | "action_type"
    | "delivery_surface"
    | "driver_payout_rule_field_names"
    | "driver_payout_rules"
    | "env_gate_name"
    | "forbidden_fields_present"
    | "id"
    | "invalid_fields"
    | "rejected_fields"
    | "unknown_fields"
    | "version"
  >,
): AdminDriverPayoutRulesRuntimeWriteActionResult {
  const gateOpen = writeGateOpen();

  return {
    action_scope: contract.action_scope,
    action_type: contract.action_type,
    database_client_enabled: false,
    delivery_surface: "admin_driver_payout_rules_runtime_write_action",
    driver_payout_rule_field_names: contract.driver_payout_rule_field_names,
    driver_payout_rules: contract.driver_payout_rules,
    env_gate_name: adminDriverPayoutRulesRuntimeWriteActionEnvGateName,
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
    version: adminDriverPayoutRulesRuntimeWriteActionVersion,
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
  options: AdminDriverPayoutRulesRuntimeWriteActionOptions | undefined,
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

function writePayload(fields: DriverPayoutRules) {
  return {
    driver_payout_rules: fields,
    updated_at: new Date().toISOString(),
  };
}

function toDriverPayoutRulesRecord(
  value: unknown,
): AdminDriverPayoutRulesRuntimeWriteActionRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    driver_payout_rules: driverPayoutRulesFrom(record.driver_payout_rules).driverPayoutRules,
    id,
  };
}

export async function executeAdminDriverPayoutRulesRuntimeWriteAction(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  options?: AdminDriverPayoutRulesRuntimeWriteActionOptions,
): Promise<AdminDriverPayoutRulesRuntimeWriteActionResult> {
  const contract = buildContract(input);

  if (!contract.ok) {
    return safeResult(contract, {
      reason: "unsafe_or_unknown_fields",
      status: "rejected",
    });
  }

  if (!writeGateOpen()) {
    return safeResult(contract, {
      error: "Driver payout rules write gate is closed.",
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
    .update(writePayload(contract.driver_payout_rules))
    .eq("id", contract.id as number)
    .select(driverPayoutRulesWriteSelect)
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
    record: toDriverPayoutRulesRecord(data),
    status: "saved",
    write_enabled: true,
    write_gate_open: true,
  });
}
