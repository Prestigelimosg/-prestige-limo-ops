import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedBookingStatusVersion = "admin-saved-booking-status-v1";

export type AdminSavedBookingStatusValue =
  | "assigned"
  | "completed"
  | "confirmed"
  | "driver_otw"
  | "pob";

export type AdminSavedBookingStatusInput = {
  booking_id: string;
  status: AdminSavedBookingStatusValue;
};

export type AdminSavedBookingStatusRecord = {
  id: string | number;
  status: AdminSavedBookingStatusValue;
  updated_at: string;
};

export type AdminSavedBookingStatusData = {
  booking: AdminSavedBookingStatusRecord;
  version: typeof adminSavedBookingStatusVersion;
};

type AdminSavedBookingStatusFailureCategory =
  | "auth_or_key_rejected"
  | "client_init_failed"
  | "column_missing"
  | "permission_or_rls_denied"
  | "table_unreachable"
  | "unknown_adapter_failure";

type AdminSavedBookingStatusResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      category?: AdminSavedBookingStatusFailureCategory;
      error: string;
      ok: false;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;
type SavedBookingStatusClient = Pick<SupabaseClient, "from">;
type SavedBookingStatusStorageShape = "current" | "legacy";

const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedStatuses = new Set<AdminSavedBookingStatusValue>([
  "assigned",
  "completed",
  "confirmed",
  "driver_otw",
  "pob",
]);
const allowedPayloadKeys = new Set(["booking_id", "status"]);
const malformedPayloadError =
  "Admin saved booking status payload is malformed.";
const safeActorError =
  "Admin saved booking status update requires a verified internal boundary.";
const safeConfigError =
  "Admin saved booking status update configuration is not ready.";
const safeSessionActorError =
  "Admin saved booking status update requires a verified admin or dispatcher server session.";
const safeStatusUpdateError =
  "Admin saved booking status update failed safely.";
const safeTargetMissingError =
  "Admin saved booking status target was not found.";
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = 1000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
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

function classifyDatabaseFailure(
  error: unknown,
): AdminSavedBookingStatusFailureCategory {
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

function safeDatabaseFailure<T>(
  error: string,
  status: number,
  databaseError: unknown,
): AdminSavedBookingStatusResult<T> {
  return {
    category: classifyDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingStatusResult<null> {
  if (
    !actor ||
    !allowedAdapterActorRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      error: safeActorError,
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
      error: safeSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getSavedBookingStatusClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingStatusResult<SavedBookingStatusClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!validServerDatabaseUrl(supabaseUrl) || !validServerCredential(serviceRoleKey)) {
    return {
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    return {
      data: createClient(supabaseUrl as string, serviceRoleKey as string, {
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

function validBookingId(value: unknown) {
  const cleaned = textOrNull(value, 120);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function bookingStatusTargetColumn(bookingId: string): "booking_reference" | "id" {
  return /^[A-Z]{2,8}-\d{8,}[A-Z0-9-]*$/.test(bookingId)
    ? "booking_reference"
    : "id";
}

function validStatus(value: unknown) {
  const normalized = textOrNull(value, 40)?.toLowerCase() || "";

  return allowedStatuses.has(normalized as AdminSavedBookingStatusValue)
    ? (normalized as AdminSavedBookingStatusValue)
    : null;
}

function currentSchemaAdminStatus(status: AdminSavedBookingStatusValue) {
  if (status === "assigned") {
    return "driver_assigned";
  }

  if (status === "driver_otw" || status === "pob") {
    return "in_progress";
  }

  return status;
}

function toStatusRecord(
  value: unknown,
  targetColumn: "booking_reference" | "id",
  requestedStatus: AdminSavedBookingStatusValue,
): AdminSavedBookingStatusRecord | null {
  const row = asRecord(value);
  const bookingReference = textOrNull(row.booking_reference, 120);
  const id =
    targetColumn === "booking_reference" && bookingReference
      ? bookingReference
      : typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);
  const updatedAt = textOrNull(row.updated_at, 80);

  if (id === null || !updatedAt) {
    return null;
  }

  return {
    id,
    status: requestedStatus,
    updated_at: updatedAt,
  };
}

async function updateSavedBookingStatusRow(
  client: SavedBookingStatusClient,
  targetColumn: "booking_reference" | "id",
  bookingId: string,
  status: AdminSavedBookingStatusValue,
  updatedAt: string,
  storageShape: SavedBookingStatusStorageShape,
) {
  const payload =
    storageShape === "current"
      ? {
          admin_internal_status: currentSchemaAdminStatus(status),
          updated_at: updatedAt,
        }
      : {
          status,
          updated_at: updatedAt,
        };
  const selectedColumns =
    storageShape === "current"
      ? "id, booking_reference, admin_internal_status, updated_at"
      : "id, booking_reference, status, updated_at";

  return client
    .from("bookings")
    .update(payload)
    .eq(targetColumn, bookingId)
    .select(selectedColumns)
    .maybeSingle();
}

export function parseAdminSavedBookingStatusPayload(
  input: unknown,
): AdminSavedBookingStatusResult<AdminSavedBookingStatusInput> {
  const record = asRecord(input);
  const unsupportedKey = Object.keys(record).find((key) => !allowedPayloadKeys.has(key));
  const bookingId = validBookingId(record.booking_id);
  const status = validStatus(record.status);

  if (unsupportedKey || !bookingId || !status) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_id: bookingId,
      status,
    },
    ok: true,
  };
}

export async function updateAdminSavedBookingStatus(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingStatusResult<AdminSavedBookingStatusData>> {
  const parsed = parseAdminSavedBookingStatusPayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingStatusClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const updatedAt = new Date().toISOString();
  const targetColumn = bookingStatusTargetColumn(parsed.data.booking_id);
  const currentSchemaResult = await updateSavedBookingStatusRow(
    clientResult.data,
    targetColumn,
    parsed.data.booking_id,
    parsed.data.status,
    updatedAt,
    "current",
  );
  const updateResult =
    currentSchemaResult.error &&
    classifyDatabaseFailure(currentSchemaResult.error) === "column_missing"
      ? await updateSavedBookingStatusRow(
          clientResult.data,
          targetColumn,
          parsed.data.booking_id,
          parsed.data.status,
          updatedAt,
          "legacy",
        )
      : currentSchemaResult;
  const { data, error } = updateResult;

  if (error) {
    return safeDatabaseFailure(safeStatusUpdateError, 500, error);
  }

  if (currentSchemaResult === updateResult && data) {
    const legacyMirrorResult = await updateSavedBookingStatusRow(
      clientResult.data,
      targetColumn,
      parsed.data.booking_id,
      parsed.data.status,
      updatedAt,
      "legacy",
    );

    if (
      legacyMirrorResult.error &&
      classifyDatabaseFailure(legacyMirrorResult.error) !== "column_missing"
    ) {
      return safeDatabaseFailure(safeStatusUpdateError, 500, legacyMirrorResult.error);
    }
  }

  const booking = toStatusRecord(data, targetColumn, parsed.data.status);

  if (!booking) {
    return {
      error: safeTargetMissingError,
      ok: false,
      status: 404,
    };
  }

  return {
    data: {
      booking,
      version: adminSavedBookingStatusVersion,
    },
    ok: true,
  };
}
