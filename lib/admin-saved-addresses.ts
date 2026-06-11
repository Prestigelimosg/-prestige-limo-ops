import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedAddressesVersion = "admin-saved-addresses-api-v1";

export type AdminSavedAddressRecord = {
  address: string | null;
  address_role: string | null;
  company_id: number | null;
  id: number;
  is_default: boolean | null;
  label: string | null;
  last_used_at: string | null;
  traveler_id: number | null;
  use_count: number | null;
};

type UnknownRecord = Record<string, unknown>;
type AdminSavedAddressesClient = Pick<SupabaseClient, "from">;

const adminSavedAddressSelect =
  "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at";
const safeBlockedError = "Admin saved address records require a verified internal boundary.";
const safeConfigError = "Admin saved address records are not configured on this server.";
const safeReadError = "Admin saved address lookup failed safely.";
const safeWriteError = "Admin saved address save failed safely.";
const allowedRoles = new Set(["admin", "dispatcher", "system"]);
const maxTextLength = 500;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenAddressFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "customer_price",
  "driver_payout",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "raw_ai",
  "secret",
  "server_secret",
  "service_role",
  "token",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenAddressFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxTextLength) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function nonNegativeInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function safeTimestamp(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || includesForbiddenFragment(cleaned)) {
    return null;
  }

  const parsed = Date.parse(cleaned);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function hasOwnValue(input: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(input, key) && input[key] !== null && input[key] !== undefined;
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

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
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

function classifyAdapterDatabaseFailure(error: unknown): AdminBookingPersistenceSafeErrorCategory {
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

  if (code === "42p01" || haystack.includes("relation") && haystack.includes("does not exist")) {
    return "table_unreachable";
  }

  if (code === "42703" || code === "pgrst204" || haystack.includes("column") && haystack.includes("not found")) {
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

function getAdminSavedAddressesClient(): AdminBookingResult<AdminSavedAddressesClient> {
  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !validServerDatabaseUrl(supabaseUrl) ||
    !validServerCredential(serviceRoleKey)
  ) {
    return {
      error: safeConfigError,
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
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      error: safeBlockedError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function toAdminSavedAddressRecord(value: unknown): AdminSavedAddressRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    address: safeText(record.address),
    address_role: safeText(record.address_role, 80),
    company_id: positiveInteger(record.company_id),
    id,
    is_default: booleanOrNull(record.is_default),
    label: safeText(record.label, 120),
    last_used_at: safeTimestamp(record.last_used_at),
    traveler_id: positiveInteger(record.traveler_id),
    use_count: nonNegativeInteger(record.use_count),
  };
}

export async function findAdminSavedAddress(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminSavedAddressRecord | null>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminSavedAddressesClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const params = input instanceof URLSearchParams ? Object.fromEntries(input.entries()) : input;
  const id = positiveInteger(params.id);
  const travelerId = positiveInteger(params.traveler_id);
  const address = safeText(params.address);

  if (!id && !travelerId && !address) {
    return {
      error: "Admin saved address lookup requires a safe id, traveler_id, or address.",
      ok: false,
      status: 400,
    };
  }

  let query = clientResult.data.from("saved_addresses").select(adminSavedAddressSelect);

  if (id) {
    query = query.eq("id", id);
  }

  if (travelerId) {
    query = query.eq("traveler_id", travelerId);
  }

  if (address) {
    query = query.ilike("address", address);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return safeAdapterFailure(safeReadError, 500, error);
  }

  return {
    data: toAdminSavedAddressRecord(data),
    ok: true,
  };
}

export async function createAdminSavedAddress(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminSavedAddressRecord>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminSavedAddressesClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const companyId = positiveInteger(input.company_id);
  const travelerId = positiveInteger(input.traveler_id);
  const address = safeText(input.address);
  const addressRole = hasOwnValue(input, "address_role") ? safeText(input.address_role, 80) : null;
  const isDefault = hasOwnValue(input, "is_default") ? booleanOrNull(input.is_default) : null;
  const label = hasOwnValue(input, "label") ? safeText(input.label, 120) : null;
  const lastUsedAt = hasOwnValue(input, "last_used_at") ? safeTimestamp(input.last_used_at) : null;
  const useCount = hasOwnValue(input, "use_count") ? nonNegativeInteger(input.use_count) : null;
  const payload = {
    address,
    address_role: addressRole,
    company_id: companyId,
    is_default: isDefault,
    label,
    last_used_at: lastUsedAt,
    traveler_id: travelerId,
    use_count: useCount,
  };

  if (
    !companyId ||
    !travelerId ||
    !address ||
    (hasOwnValue(input, "address_role") && !addressRole) ||
    (hasOwnValue(input, "is_default") && isDefault === null) ||
    (hasOwnValue(input, "label") && !label) ||
    (hasOwnValue(input, "last_used_at") && !lastUsedAt) ||
    (hasOwnValue(input, "use_count") && useCount === null)
  ) {
    return {
      error: "Admin saved address create requires safe fields.",
      ok: false,
      status: 400,
    };
  }

  const { data, error } = await clientResult.data
    .from("saved_addresses")
    .insert(payload)
    .select(adminSavedAddressSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeWriteError, 500, error);
  }

  const record = toAdminSavedAddressRecord(data);

  if (!record) {
    return {
      error: safeWriteError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: record,
    ok: true,
  };
}

export async function updateAdminSavedAddress(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminSavedAddressRecord>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminSavedAddressesClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const id = positiveInteger(input.id);
  const payload: Record<string, string | number | boolean> = {};

  for (const [key, parser] of [
    ["address", safeText],
    ["company_id", positiveInteger],
    ["is_default", booleanOrNull],
    ["last_used_at", safeTimestamp],
    ["use_count", nonNegativeInteger],
  ] as const) {
    if (hasOwnValue(input, key)) {
      const value = parser(input[key]);

      if (value === null) {
        return {
          error: "Admin saved address update requires safe fields.",
          ok: false,
          status: 400,
        };
      }

      payload[key] = value;
    }
  }

  if (!id || Object.keys(payload).length === 0) {
    return {
      error: "Admin saved address update requires a safe id and at least one safe field.",
      ok: false,
      status: 400,
    };
  }

  const { data, error } = await clientResult.data
    .from("saved_addresses")
    .update(payload)
    .eq("id", id)
    .select(adminSavedAddressSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeWriteError, 500, error);
  }

  const record = toAdminSavedAddressRecord(data);

  if (!record) {
    return {
      error: safeWriteError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: record,
    ok: true,
  };
}
