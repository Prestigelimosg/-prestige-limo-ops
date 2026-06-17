import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceSafeErrorCategory } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminFullDriverProfileRuntimeWriteActionVersion =
  "admin-full-driver-profile-runtime-write-action-v1";
export const adminFullDriverProfileRuntimeWriteActionEnvGateName =
  "PRESTIGE_FULL_DRIVER_PROFILE_WRITE_ENABLED";

type RuntimeWriteClient = Pick<SupabaseClient, "from">;
type RuntimeStatus = "blocked" | "deleted" | "rejected" | "saved";
type RuntimeReason =
  | "admin_session_required"
  | "config_not_ready"
  | "db_write_failed"
  | "deleted"
  | "missing_required_fields"
  | "saved"
  | "unsafe_or_unknown_fields"
  | "write_gate_closed";
type RuntimeActionType = "full_driver_profile_delete" | "full_driver_profile_save";
type SafeFailureCategory = AdminBookingPersistenceSafeErrorCategory | "client_init_failed";
type UnknownRecord = Record<string, unknown>;
type RuntimeResultBase = Omit<AdminFullDriverProfileRuntimeWriteActionResult, "reason" | "status">;

export type AdminFullDriverProfileRuntimeFields = {
  availability_status: "available" | "busy" | "inactive" | "off" | null;
  contact_number: string | null;
  driver_name: string | null;
  plate_number: string | null;
  vehicle_type: string | null;
};

export type AdminFullDriverProfileRuntimeRecord = AdminFullDriverProfileRuntimeFields & {
  id: number;
  updated_at: string | null;
};

export type AdminFullDriverProfileRuntimeWriteActionResult = {
  action_type: RuntimeActionType | null;
  category?: SafeFailureCategory;
  database_client_enabled: boolean;
  delivery_surface: "admin_full_driver_profile_runtime_write_action";
  driver_profile_fields: AdminFullDriverProfileRuntimeFields;
  env_gate_name: typeof adminFullDriverProfileRuntimeWriteActionEnvGateName;
  error?: string;
  forbidden_fields_present: string[];
  id: number | null;
  invalid_fields: string[];
  no_op: boolean;
  ok: boolean;
  reason: RuntimeReason;
  record: AdminFullDriverProfileRuntimeRecord | null;
  rejected_fields: string[];
  status: RuntimeStatus;
  unknown_fields: string[];
  version: typeof adminFullDriverProfileRuntimeWriteActionVersion;
  write_enabled: boolean;
  write_gate_open: boolean;
};

export type AdminFullDriverProfileRuntimeWriteActionOptions = {
  clientFactory?: () => RuntimeWriteClient;
};

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const allowedAvailabilityStatuses = new Set(["available", "busy", "inactive", "off"]);
const safeBlockedError =
  "Full driver profile write requires a verified admin or dispatcher session.";
const safeConfigError = "Full driver profile write is not configured on this server.";
const safeWriteError = "Full driver profile write failed safely.";
const fullDriverProfileWriteSelect =
  "id, driver_name, contact_number, vehicle_type, plate_number, availability_status, updated_at";
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenFieldPattern =
  /payout_preferences|driver_payout_rules|driver_payout|customer_rate|customer_price|customer_rates|pricing|price|payout|payment|billing|invoice|pdf|provider|send_state|send_log|auth|location|live_location|photo|calendar|internal|admin_notes|notes|preferred_areas|airport_permit_notes|parser_debug|debug|secret|api_key|access_token|raw_token|paynow|pay_now|mock_archive|mock_qa/i;
const forbiddenValuePattern =
  /admin finance|admin note|billing|debug|driver payout|internal admin|internal note|invoice|parser|payment|paynow|payout|pricing|secret|service role|token/i;

const allowedCanonicalFields = [
  "availability_status",
  "contact_number",
  "driver_name",
  "plate_number",
  "vehicle_type",
] as const;

const fieldAliases = new Map<string, (typeof allowedCanonicalFields)[number]>([
  ["availability_status", "availability_status"],
  ["availabilitystatus", "availability_status"],
  ["contact_number", "contact_number"],
  ["contactnumber", "contact_number"],
  ["driver_name", "driver_name"],
  ["drivername", "driver_name"],
  ["plate_number", "plate_number"],
  ["platenumber", "plate_number"],
  ["vehicle_type", "vehicle_type"],
  ["vehicletype", "vehicle_type"],
]);

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function unique(values: string[]) {
  return [...new Set(values)].sort();
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || forbiddenValuePattern.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeAvailabilityStatus(value: unknown) {
  const cleaned = safeText(value, 80)?.toLowerCase() || null;

  return cleaned && allowedAvailabilityStatuses.has(cleaned)
    ? (cleaned as AdminFullDriverProfileRuntimeFields["availability_status"])
    : null;
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

function writeGateOpen() {
  return process.env[adminFullDriverProfileRuntimeWriteActionEnvGateName] === "true";
}

function canonicalFieldName(key: string) {
  return fieldAliases.get(normalizeToken(key)) || null;
}

function actionTypeFrom(value: unknown): RuntimeActionType | null {
  const cleaned = textOrNull(value)?.toLowerCase() || "";

  if (
    cleaned === "full_driver_profile_save" ||
    cleaned === "driver_save" ||
    cleaned === "save"
  ) {
    return "full_driver_profile_save";
  }

  if (
    cleaned === "full_driver_profile_delete" ||
    cleaned === "driver_delete" ||
    cleaned === "delete"
  ) {
    return "full_driver_profile_delete";
  }

  return null;
}

function normalizeInput(input: unknown) {
  const source = asRecord(input);
  const actionType = actionTypeFrom(source.action_type ?? source.action ?? source.type);
  const forbiddenFields: string[] = [];
  const invalidFields: string[] = [];
  const normalized: Record<string, unknown> = {};
  const unknownFields: string[] = [];
  const id = positiveInteger(source.id ?? source.driver_id ?? source.driverId);

  for (const [key, rawValue] of Object.entries(source)) {
    const normalizedKey = normalizeToken(key);

    if (
      normalizedKey === "action" ||
      normalizedKey === "action_type" ||
      normalizedKey === "driver_id" ||
      normalizedKey === "id" ||
      normalizedKey === "type"
    ) {
      continue;
    }

    const canonical = canonicalFieldName(key);

    if (canonical) {
      if (typeof rawValue === "string" && forbiddenValuePattern.test(rawValue)) {
        forbiddenFields.push(key);
        continue;
      }

      if (normalized[canonical] === undefined) {
        normalized[canonical] = rawValue;
      }
      continue;
    }

    if (forbiddenFieldPattern.test(normalizedKey)) {
      forbiddenFields.push(key);
    } else {
      unknownFields.push(key);
    }
  }

  if (!actionType) {
    invalidFields.push("action_type");
  }

  return {
    actionType,
    forbiddenFields: unique(forbiddenFields),
    id,
    invalidFields,
    normalized,
    unknownFields: unique(unknownFields),
  };
}

function normalizedDriverProfileFields(
  normalized: Record<string, unknown>,
): { fields: AdminFullDriverProfileRuntimeFields; invalidFields: string[] } {
  const fields = {
    availability_status: safeAvailabilityStatus(normalized.availability_status),
    contact_number: safeText(normalized.contact_number, 120),
    driver_name: safeText(normalized.driver_name, 220),
    plate_number: safeText(normalized.plate_number, 80),
    vehicle_type: safeText(normalized.vehicle_type, 120),
  };
  const invalidFields = allowedCanonicalFields.filter(
    (field) => normalized[field] !== undefined && fields[field] === null,
  );

  return { fields, invalidFields };
}

function missingRequiredFields(
  actionType: RuntimeActionType | null,
  id: number | null,
  fields: AdminFullDriverProfileRuntimeFields,
) {
  const missing: string[] = [];

  if (actionType === "full_driver_profile_delete") {
    if (!id) {
      missing.push("id");
    }

    return missing;
  }

  if (!fields.driver_name) {
    missing.push("driver_name");
  }

  if (!fields.contact_number) {
    missing.push("contact_number");
  }

  if (!fields.vehicle_type) {
    missing.push("vehicle_type");
  }

  if (!fields.plate_number) {
    missing.push("plate_number");
  }

  return missing;
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

function resultBase(
  input: {
    actionType: RuntimeActionType | null;
    fields: AdminFullDriverProfileRuntimeFields;
    forbiddenFields?: string[];
    id: number | null;
    invalidFields?: string[];
    unknownFields?: string[];
  },
): RuntimeResultBase {
  return {
    action_type: input.actionType,
    database_client_enabled: false,
    delivery_surface: "admin_full_driver_profile_runtime_write_action",
    driver_profile_fields: input.fields,
    env_gate_name: adminFullDriverProfileRuntimeWriteActionEnvGateName,
    forbidden_fields_present: input.forbiddenFields ?? [],
    id: input.id,
    invalid_fields: input.invalidFields ?? [],
    no_op: true,
    ok: false,
    record: null,
    rejected_fields: unique([
      ...(input.forbiddenFields ?? []),
      ...(input.unknownFields ?? []),
      ...(input.invalidFields ?? []),
    ]),
    unknown_fields: input.unknownFields ?? [],
    version: adminFullDriverProfileRuntimeWriteActionVersion,
    write_enabled: false,
    write_gate_open: false,
  };
}

function blockedResult(
  base: RuntimeResultBase,
  reason: Exclude<RuntimeReason, "db_write_failed" | "deleted" | "saved" | "unsafe_or_unknown_fields">,
  error?: string,
): AdminFullDriverProfileRuntimeWriteActionResult {
  return {
    ...base,
    error,
    reason,
    status: "blocked",
    write_gate_open: base.write_gate_open,
  };
}

function rejectedResult(
  base: RuntimeResultBase,
): AdminFullDriverProfileRuntimeWriteActionResult {
  return {
    ...base,
    reason: "unsafe_or_unknown_fields",
    status: "rejected",
  };
}

function safeAdapterFailure(
  base: RuntimeResultBase,
  error: unknown,
): AdminFullDriverProfileRuntimeWriteActionResult {
  return {
    ...base,
    category: classifyDatabaseFailure(error),
    database_client_enabled: true,
    error: safeWriteError,
    reason: "db_write_failed",
    status: "blocked",
    write_enabled: true,
    write_gate_open: true,
  };
}

function getRuntimeClient(
  options: AdminFullDriverProfileRuntimeWriteActionOptions = {},
): { client: RuntimeWriteClient | null; error?: string } {
  if (options.clientFactory) {
    return { client: options.clientFactory() };
  }

  const supabaseUrl = cleanConfigValue(process.env.SUPABASE_URL);
  const serviceRoleKey = cleanConfigValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !validServerDatabaseUrl(supabaseUrl) ||
    !validServerCredential(serviceRoleKey)
  ) {
    return { client: null, error: safeConfigError };
  }

  try {
    return {
      client: createClient(supabaseUrl, serviceRoleKey, {
        auth: {
          persistSession: false,
        },
      }),
    };
  } catch {
    return { client: null, error: safeConfigError };
  }
}

function validateActor(actor: AdminBookingPersistenceAdapterActor) {
  return Boolean(
    actor &&
      allowedActorRoles.has(actor.actor_role) &&
      actor.boundary_mode === "server-session-role-surface" &&
      actor.source_surface === "admin_api" &&
      textOrNull(actor.actor_label),
  );
}

function writePayload(fields: AdminFullDriverProfileRuntimeFields) {
  return {
    availability_status: fields.availability_status ?? "available",
    contact_number: fields.contact_number,
    driver_name: fields.driver_name,
    plate_number: fields.plate_number,
    updated_at: new Date().toISOString(),
    vehicle_type: fields.vehicle_type,
  };
}

function toRuntimeRecord(value: unknown): AdminFullDriverProfileRuntimeRecord | null {
  const source = asRecord(value);
  const id = positiveInteger(source.id);

  if (!id) {
    return null;
  }

  return {
    availability_status: safeAvailabilityStatus(source.availability_status),
    contact_number: safeText(source.contact_number, 120),
    driver_name: safeText(source.driver_name, 220),
    id,
    plate_number: safeText(source.plate_number, 80),
    updated_at: safeText(source.updated_at, 80),
    vehicle_type: safeText(source.vehicle_type, 120),
  };
}

async function saveRuntimeRecord(
  client: RuntimeWriteClient,
  id: number | null,
  fields: AdminFullDriverProfileRuntimeFields,
) {
  const payload = writePayload(fields);

  if (id) {
    return client
      .from("drivers")
      .update(payload)
      .eq("id", id)
      .select(fullDriverProfileWriteSelect)
      .single();
  }

  return client.from("drivers").insert(payload).select(fullDriverProfileWriteSelect).single();
}

async function deleteRuntimeRecord(client: RuntimeWriteClient, id: number) {
  return client.from("drivers").delete().eq("id", id).select(fullDriverProfileWriteSelect).single();
}

export async function executeAdminFullDriverProfileRuntimeWriteAction(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  options: AdminFullDriverProfileRuntimeWriteActionOptions = {},
): Promise<AdminFullDriverProfileRuntimeWriteActionResult> {
  const normalizedInput = normalizeInput(input);
  const { fields, invalidFields } = normalizedDriverProfileFields(normalizedInput.normalized);
  const base = resultBase({
    actionType: normalizedInput.actionType,
    fields,
    forbiddenFields: normalizedInput.forbiddenFields,
    id: normalizedInput.id,
    invalidFields: unique([...normalizedInput.invalidFields, ...invalidFields]),
    unknownFields: normalizedInput.unknownFields,
  });

  if (
    base.forbidden_fields_present.length > 0 ||
    base.unknown_fields.length > 0 ||
    base.invalid_fields.length > 0
  ) {
    return rejectedResult(base);
  }

  const deleteExtraFields =
    normalizedInput.actionType === "full_driver_profile_delete"
      ? allowedCanonicalFields.filter((field) => normalizedInput.normalized[field] !== undefined)
      : [];

  if (deleteExtraFields.length > 0) {
    return rejectedResult({
      ...base,
      invalid_fields: unique([...base.invalid_fields, ...deleteExtraFields]),
      rejected_fields: unique([...base.rejected_fields, ...deleteExtraFields]),
    });
  }

  const missingFields = missingRequiredFields(normalizedInput.actionType, normalizedInput.id, fields);

  if (missingFields.length > 0) {
    return blockedResult(
      {
        ...base,
        invalid_fields: missingFields,
        rejected_fields: missingFields,
      },
      "missing_required_fields",
      "Full driver profile write is missing required safe fields.",
    );
  }

  if (!writeGateOpen()) {
    return blockedResult(base, "write_gate_closed");
  }

  const openGateBase = {
    ...base,
    write_gate_open: true,
  };

  if (!validateActor(actor)) {
    return blockedResult(openGateBase, "admin_session_required", safeBlockedError);
  }

  const clientResult = getRuntimeClient(options);

  if (!clientResult.client) {
    return blockedResult(openGateBase, "config_not_ready", clientResult.error || safeConfigError);
  }

  try {
    const databaseResult =
      normalizedInput.actionType === "full_driver_profile_delete"
        ? await deleteRuntimeRecord(clientResult.client, normalizedInput.id as number)
        : await saveRuntimeRecord(clientResult.client, normalizedInput.id, fields);

    if (databaseResult.error) {
      return safeAdapterFailure(openGateBase, databaseResult.error);
    }

    const record = toRuntimeRecord(databaseResult.data);
    const status =
      normalizedInput.actionType === "full_driver_profile_delete" ? "deleted" : "saved";

    return {
      ...openGateBase,
      database_client_enabled: true,
      no_op: false,
      ok: true,
      reason: status,
      record,
      status,
      write_enabled: true,
    };
  } catch (error) {
    return safeAdapterFailure(openGateBase, error);
  }
}
