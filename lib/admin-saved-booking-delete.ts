import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedBookingDeleteVersion = "admin-saved-booking-delete-v1";

export type AdminSavedBookingDeleteInput = {
  booking_id: string;
};

const adminSavedBookingDeletableStatuses = ["completed", "cancelled"] as const;

type AdminSavedBookingDeletableStatus = (typeof adminSavedBookingDeletableStatuses)[number];

export type AdminSavedBookingDeleteRecord = {
  id: string | number;
  status: AdminSavedBookingDeletableStatus;
};

export type AdminSavedBookingDeleteData = {
  booking: AdminSavedBookingDeleteRecord;
  version: typeof adminSavedBookingDeleteVersion;
};

type AdminSavedBookingDeleteFailureCategory =
  | "auth_or_key_rejected"
  | "client_init_failed"
  | "column_missing"
  | "permission_or_rls_denied"
  | "table_unreachable"
  | "unknown_adapter_failure";

type AdminSavedBookingDeleteResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      category?: AdminSavedBookingDeleteFailureCategory;
      error: string;
      ok: false;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;
type SavedBookingDeleteClient = Pick<SupabaseClient, "from">;

const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedPayloadKeys = new Set(["booking_id"]);
const malformedPayloadError =
  "Admin saved booking delete payload is malformed.";
const safeActorError =
  "Admin saved booking delete requires a verified internal boundary.";
const safeConfigError =
  "Admin saved booking delete configuration is not ready.";
const safeDeleteError = "Admin saved booking delete failed safely.";
const safeSessionActorError =
  "Admin saved booking delete requires a verified admin or dispatcher server session.";
const safeTargetMissingError =
  "Archived saved booking delete target was not found.";
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
): AdminSavedBookingDeleteFailureCategory {
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
): AdminSavedBookingDeleteResult<T> {
  return {
    category: classifyDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingDeleteResult<null> {
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

function getSavedBookingDeleteClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingDeleteResult<SavedBookingDeleteClient> {
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

function toDeleteRecord(value: unknown): AdminSavedBookingDeleteRecord | null {
  const row = asRecord(value);
  const id =
    typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);
  const status = textOrNull(row.status, 40)?.toLowerCase();

  if (
    id === null ||
    !adminSavedBookingDeletableStatuses.includes(
      status as AdminSavedBookingDeletableStatus,
    )
  ) {
    return null;
  }

  return {
    id,
    status: status as AdminSavedBookingDeletableStatus,
  };
}

export function parseAdminSavedBookingDeletePayload(
  input: unknown,
): AdminSavedBookingDeleteResult<AdminSavedBookingDeleteInput> {
  const record = asRecord(input);
  const unsupportedKey = Object.keys(record).find((key) => !allowedPayloadKeys.has(key));
  const bookingId = validBookingId(record.booking_id);

  if (unsupportedKey || !bookingId) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_id: bookingId,
    },
    ok: true,
  };
}

export async function deleteAdminCompletedSavedBooking(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingDeleteResult<AdminSavedBookingDeleteData>> {
  const parsed = parseAdminSavedBookingDeletePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingDeleteClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("bookings")
    .delete()
    .eq("id", parsed.data.booking_id)
    .in("status", [...adminSavedBookingDeletableStatuses])
    .select("id, status")
    .maybeSingle();

  if (error) {
    return safeDatabaseFailure(safeDeleteError, 500, error);
  }

  const booking = toDeleteRecord(data);

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
      version: adminSavedBookingDeleteVersion,
    },
    ok: true,
  };
}
