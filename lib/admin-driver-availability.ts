import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminDriverAvailabilityVersion = "admin-driver-availability-api-v1";

export type AdminDriverAvailabilityRecord = {
  availability_status: string | null;
  id: number;
  updated_at: string | null;
};

type UnknownRecord = Record<string, unknown>;
type AdminDriverAvailabilityClient = Pick<SupabaseClient, "from">;

const adminDriverAvailabilitySelect = "id, availability_status, updated_at";
const safeBlockedError = "Admin driver availability requires a verified internal boundary.";
const safeConfigError = "Admin driver availability is not configured on this server.";
const safeWriteError = "Admin driver availability save failed safely.";
const allowedRoles = new Set(["admin", "dispatcher", "system"]);
const allowedStatuses = new Set(["available", "busy", "inactive"]);
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenFragments = [
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

  return forbiddenFragments.some((fragment) => normalized.includes(fragment));
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeStatus(value: unknown) {
  const cleaned = textOrNull(value)?.toLowerCase() || null;

  return cleaned && allowedStatuses.has(cleaned) ? cleaned : null;
}

function safeTimestamp(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || includesForbiddenFragment(cleaned)) {
    return null;
  }

  const parsed = Date.parse(cleaned);

  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
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

function getAdminDriverAvailabilityClient(): AdminBookingResult<AdminDriverAvailabilityClient> {
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

function toAdminDriverAvailabilityRecord(value: unknown): AdminDriverAvailabilityRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    availability_status: safeStatus(record.availability_status),
    id,
    updated_at: safeTimestamp(record.updated_at),
  };
}

export async function updateAdminDriverAvailability(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverAvailabilityRecord>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminDriverAvailabilityClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const id = positiveInteger(input.id);
  const availabilityStatus = safeStatus(input.availability_status);
  const updatedAt = safeTimestamp(input.updated_at);

  if (!id || !availabilityStatus || !updatedAt) {
    return {
      error: "Admin driver availability update requires safe id, availability_status, and updated_at.",
      ok: false,
      status: 400,
    };
  }

  const { data, error } = await clientResult.data
    .from("drivers")
    .update({
      availability_status: availabilityStatus,
      updated_at: updatedAt,
    })
    .eq("id", id)
    .select(adminDriverAvailabilitySelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeWriteError, 500, error);
  }

  const record = toAdminDriverAvailabilityRecord(data);

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
