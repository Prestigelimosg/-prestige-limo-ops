import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceSafeErrorCategory } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup,
  type AdminCompanyTravelerCrmIdentityContactWriteContractInput,
  type AdminCompanyTravelerCrmIdentityContactWriteContractResult,
} from "./admin-company-traveler-crm-identity-contact-write-contract-setup-foundation";

export const adminCompanyTravelerCrmRuntimeWriteActionVersion =
  "admin-company-traveler-crm-runtime-write-action-v1";
export const adminCompanyTravelerCrmRuntimeWriteActionEnvGateName =
  "PRESTIGE_COMPANY_TRAVELER_CRM_IDENTITY_CONTACT_WRITE_ENABLED";

type UnknownRecord = Record<string, unknown>;
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

export type AdminCompanyTravelerCrmRuntimeWriteActionRecord = {
  booker_contact?: string | null;
  booker_email?: string | null;
  booker_name?: string | null;
  company_id?: number | null;
  company_name?: string | null;
  default_address?: string | null;
  default_dropoff_address?: string | null;
  default_pickup_address?: string | null;
  domain?: string | null;
  id: number;
  preferred_vehicle?: string | null;
  traveler_name?: string | null;
};

export type AdminCompanyTravelerCrmRuntimeWriteActionResult = {
  action_scope: AdminCompanyTravelerCrmIdentityContactWriteContractResult["action_scope"];
  action_type: AdminCompanyTravelerCrmIdentityContactWriteContractResult["action_type"];
  category?: AdminBookingPersistenceSafeErrorCategory | "client_init_failed";
  company_fields: AdminCompanyTravelerCrmIdentityContactWriteContractResult["company_fields"];
  database_client_enabled: boolean;
  delivery_surface: "company_traveler_crm_identity_contact_runtime_write_action";
  env_gate_name: typeof adminCompanyTravelerCrmRuntimeWriteActionEnvGateName;
  error?: string;
  forbidden_fields_present: string[];
  invalid_fields: string[];
  no_op: boolean;
  ok: boolean;
  reason: RuntimeWriteReason;
  record: AdminCompanyTravelerCrmRuntimeWriteActionRecord | null;
  rejected_fields: string[];
  status: RuntimeWriteStatus;
  traveler_fields: AdminCompanyTravelerCrmIdentityContactWriteContractResult["traveler_fields"];
  unknown_fields: string[];
  version: typeof adminCompanyTravelerCrmRuntimeWriteActionVersion;
  write_enabled: boolean;
  write_gate_open: boolean;
};

export type AdminCompanyTravelerCrmRuntimeWriteActionOptions = {
  clientFactory?: () => RuntimeWriteClient;
};

type SafeFailureCategory = AdminBookingPersistenceSafeErrorCategory | "client_init_failed";

const safeBlockedError =
  "Company/traveler CRM identity/contact write requires a verified admin or dispatcher session.";
const safeConfigError =
  "Company/traveler CRM identity/contact write is not configured on this server.";
const safeWriteError = "Company/traveler CRM identity/contact write failed safely.";
const allowedActorRoles = new Set(["admin", "dispatcher"]);
const companyWriteSelect = "id, company_name, domain";
const travelerWriteSelect =
  "id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email";
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
  return process.env[adminCompanyTravelerCrmRuntimeWriteActionEnvGateName] === "true";
}

function safeResult(
  contract: AdminCompanyTravelerCrmIdentityContactWriteContractResult,
  overrides: Omit<
    Partial<AdminCompanyTravelerCrmRuntimeWriteActionResult>,
    | "action_scope"
    | "action_type"
    | "company_fields"
    | "delivery_surface"
    | "env_gate_name"
    | "forbidden_fields_present"
    | "invalid_fields"
    | "rejected_fields"
    | "traveler_fields"
    | "unknown_fields"
    | "version"
  >,
): AdminCompanyTravelerCrmRuntimeWriteActionResult {
  const gateOpen = writeGateOpen();

  return {
    action_scope: contract.action_scope,
    action_type: contract.action_type,
    company_fields: contract.company_fields,
    database_client_enabled: false,
    delivery_surface: "company_traveler_crm_identity_contact_runtime_write_action",
    env_gate_name: adminCompanyTravelerCrmRuntimeWriteActionEnvGateName,
    forbidden_fields_present: contract.forbidden_fields_present,
    invalid_fields: contract.invalid_fields,
    no_op: true,
    ok: false,
    reason: "write_gate_closed",
    record: null,
    rejected_fields: contract.rejected_fields,
    status: "blocked",
    traveler_fields: contract.traveler_fields,
    unknown_fields: contract.unknown_fields,
    version: adminCompanyTravelerCrmRuntimeWriteActionVersion,
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
  options: AdminCompanyTravelerCrmRuntimeWriteActionOptions | undefined,
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

function companyPayload(contract: AdminCompanyTravelerCrmIdentityContactWriteContractResult) {
  return {
    ...(contract.company_fields.company_name ? { company_name: contract.company_fields.company_name } : {}),
    ...(contract.company_fields.domain ? { domain: contract.company_fields.domain } : {}),
  };
}

function travelerPayload(contract: AdminCompanyTravelerCrmIdentityContactWriteContractResult) {
  return {
    ...(contract.traveler_fields.booker_contact ? { booker_contact: contract.traveler_fields.booker_contact } : {}),
    ...(contract.traveler_fields.booker_email ? { booker_email: contract.traveler_fields.booker_email } : {}),
    ...(contract.traveler_fields.booker_name ? { booker_name: contract.traveler_fields.booker_name } : {}),
    ...(contract.traveler_fields.company_id ? { company_id: contract.traveler_fields.company_id } : {}),
    ...(contract.traveler_fields.default_address ? { default_address: contract.traveler_fields.default_address } : {}),
    ...(contract.traveler_fields.default_dropoff_address
      ? { default_dropoff_address: contract.traveler_fields.default_dropoff_address }
      : {}),
    ...(contract.traveler_fields.default_pickup_address
      ? { default_pickup_address: contract.traveler_fields.default_pickup_address }
      : {}),
    ...(contract.traveler_fields.preferred_vehicle ? { preferred_vehicle: contract.traveler_fields.preferred_vehicle } : {}),
    ...(contract.traveler_fields.traveler_name ? { traveler_name: contract.traveler_fields.traveler_name } : {}),
  };
}

function toCompanyRecord(value: unknown): AdminCompanyTravelerCrmRuntimeWriteActionRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    company_name: textOrNull(record.company_name),
    domain: textOrNull(record.domain),
    id,
  };
}

function toTravelerRecord(value: unknown): AdminCompanyTravelerCrmRuntimeWriteActionRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    booker_contact: textOrNull(record.booker_contact),
    booker_email: textOrNull(record.booker_email),
    booker_name: textOrNull(record.booker_name),
    company_id: positiveInteger(record.company_id),
    default_address: textOrNull(record.default_address),
    default_dropoff_address: textOrNull(record.default_dropoff_address),
    default_pickup_address: textOrNull(record.default_pickup_address),
    id,
    preferred_vehicle: textOrNull(record.preferred_vehicle),
    traveler_name: textOrNull(record.traveler_name),
  };
}

async function writeCompany(
  client: RuntimeWriteClient,
  contract: AdminCompanyTravelerCrmIdentityContactWriteContractResult,
) {
  const payload = companyPayload(contract);
  const payloadFields = Object.keys(payload);

  if (payloadFields.length === 0) {
    return {
      error: "Company CRM identity/contact write requires a safe company name or domain.",
      ok: false as const,
      reason: "missing_required_fields" as const,
      status: 400,
    };
  }

  const query = contract.action_type === "company_update" && contract.company_fields.id
    ? client
        .from("companies")
        .update(payload)
        .eq("id", contract.company_fields.id)
        .select(companyWriteSelect)
        .single()
    : client.from("companies").insert(payload).select(companyWriteSelect).single();
  const { data, error } = await query;

  if (error) {
    return {
      category: classifyDatabaseFailure(error),
      error: safeWriteError,
      ok: false as const,
      reason: "db_write_failed" as const,
      status: 500,
    };
  }

  return {
    data: toCompanyRecord(data),
    ok: true as const,
  };
}

async function writeTraveler(
  client: RuntimeWriteClient,
  contract: AdminCompanyTravelerCrmIdentityContactWriteContractResult,
) {
  const payload = travelerPayload(contract);
  const payloadFields = Object.keys(payload);

  if (payloadFields.length === 0 || (!contract.traveler_fields.id && !contract.traveler_fields.traveler_name)) {
    return {
      error: "Traveler CRM identity/contact write requires a safe traveler name or update id.",
      ok: false as const,
      reason: "missing_required_fields" as const,
      status: 400,
    };
  }

  const query = contract.action_type === "traveler_update" && contract.traveler_fields.id
    ? client
        .from("travelers")
        .update(payload)
        .eq("id", contract.traveler_fields.id)
        .select(travelerWriteSelect)
        .single()
    : client.from("travelers").insert(payload).select(travelerWriteSelect).single();
  const { data, error } = await query;

  if (error) {
    return {
      category: classifyDatabaseFailure(error),
      error: safeWriteError,
      ok: false as const,
      reason: "db_write_failed" as const,
      status: 500,
    };
  }

  return {
    data: toTravelerRecord(data),
    ok: true as const,
  };
}

export async function executeAdminCompanyTravelerCrmRuntimeWriteAction(
  input: AdminCompanyTravelerCrmIdentityContactWriteContractInput,
  actor: AdminBookingPersistenceAdapterActor,
  options?: AdminCompanyTravelerCrmRuntimeWriteActionOptions,
): Promise<AdminCompanyTravelerCrmRuntimeWriteActionResult> {
  const contract = buildAdminCompanyTravelerCrmIdentityContactWriteContractSetup(input);

  if (!contract.ok) {
    return safeResult(contract, {
      reason: contract.reason === "unsafe_or_unknown_fields" ? "unsafe_or_unknown_fields" : "missing_required_fields",
      status: "rejected",
    });
  }

  if (!writeGateOpen()) {
    return safeResult(contract, {
      error: "Company/traveler CRM identity/contact write gate is closed.",
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

  const writeResult = contract.action_scope === "company"
    ? await writeCompany(client, contract)
    : await writeTraveler(client, contract);

  if (!writeResult.ok) {
    return safeResult(contract, {
      category: "category" in writeResult ? writeResult.category : undefined,
      database_client_enabled: true,
      error: writeResult.error,
      no_op: true,
      reason: writeResult.reason,
      status: writeResult.status === 400 ? "rejected" : "blocked",
      write_gate_open: true,
    });
  }

  return safeResult(contract, {
    database_client_enabled: true,
    no_op: false,
    ok: true,
    reason: "saved",
    record: writeResult.data,
    status: "saved",
    write_enabled: true,
    write_gate_open: true,
  });
}
