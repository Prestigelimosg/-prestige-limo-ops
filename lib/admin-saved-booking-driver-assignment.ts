import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedBookingDriverAssignmentVersion =
  "admin-saved-booking-driver-assignment-v1";

export type AdminSavedBookingDriverAssignmentStatus = "assigned" | "completed" | "confirmed";

export type AdminSavedBookingDriverAssignmentInput =
  | {
      action: "assign";
      booking_id: string;
      driver_contact: string | null;
      driver_dispatch_include_payout: boolean;
      driver_id: number | null;
      driver_name: string;
      driver_notes: string | null;
      driver_payout_amount: number | null;
      driver_payout_max?: number | null;
      driver_payout_min?: number | null;
      driver_payout_override: number | null;
      driver_payout_reason: string | null;
      driver_payout_unit?: "hour" | "job" | null;
      driver_plate_number: string | null;
    }
  | {
      action: "clear";
      booking_id: string;
      status: "completed" | "confirmed";
    };

export type AdminSavedBookingDriverAssignmentRecord = {
  id: string | number;
  status: AdminSavedBookingDriverAssignmentStatus;
  updated_at: string;
};

export type AdminSavedBookingDriverAssignmentData = {
  booking: AdminSavedBookingDriverAssignmentRecord;
  version: typeof adminSavedBookingDriverAssignmentVersion;
};

type AdminSavedBookingDriverAssignmentFailureCategory =
  | "auth_or_key_rejected"
  | "client_init_failed"
  | "column_missing"
  | "permission_or_rls_denied"
  | "table_unreachable"
  | "unknown_adapter_failure";

type AdminSavedBookingDriverAssignmentResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      category?: AdminSavedBookingDriverAssignmentFailureCategory;
      error: string;
      ok: false;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;
type SavedBookingDriverAssignmentClient = Pick<SupabaseClient, "from">;

const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedAssignPayloadKeys = new Set([
  "action",
  "booking_id",
  "driver_contact",
  "driver_dispatch_include_payout",
  "driver_id",
  "driver_name",
  "driver_notes",
  "driver_payout_amount",
  "driver_payout_max",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_plate_number",
]);
const allowedClearPayloadKeys = new Set(["action", "booking_id", "status"]);
const allowedClearStatuses = new Set(["completed", "confirmed"]);
const allowedResponseStatuses = new Set(["assigned", "completed", "confirmed"]);
const allowedPayoutUnits = new Set(["hour", "job"]);
const malformedPayloadError =
  "Admin saved booking driver assignment payload is malformed.";
const safeActorError =
  "Admin saved booking driver assignment requires a verified internal boundary.";
const safeConfigError =
  "Admin saved booking driver assignment configuration is not ready.";
const safeSessionActorError =
  "Admin saved booking driver assignment requires a verified admin or dispatcher server session.";
const safeUpdateError =
  "Admin saved booking driver assignment update failed safely.";
const safeTargetMissingError =
  "Admin saved booking driver assignment target was not found.";
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

function numberOrNull(value: unknown) {
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

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  const parsed = numberOrNull(value);

  return parsed === null
    ? {
        ok: false as const,
        value: null,
      }
    : {
        ok: true as const,
        value: parsed,
      };
}

function optionalPositiveInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  const parsed = numberOrNull(value);

  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0
    ? {
        ok: true as const,
        value: parsed,
      }
    : {
        ok: false as const,
        value: null,
      };
}

function optionalBoolean(value: unknown) {
  return typeof value === "boolean"
    ? {
        ok: true as const,
        value,
      }
    : {
        ok: false as const,
        value: null,
      };
}

function optionalPayoutUnit(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  const normalized = textOrNull(value, 20)?.toLowerCase() || "";

  return allowedPayoutUnits.has(normalized)
    ? {
        ok: true as const,
        value: normalized as "hour" | "job",
      }
    : {
        ok: false as const,
        value: null,
      };
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
): AdminSavedBookingDriverAssignmentFailureCategory {
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
): AdminSavedBookingDriverAssignmentResult<T> {
  return {
    category: classifyDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingDriverAssignmentResult<null> {
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

function getSavedBookingDriverAssignmentClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingDriverAssignmentResult<SavedBookingDriverAssignmentClient> {
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

function validClearStatus(value: unknown) {
  const normalized = textOrNull(value, 40)?.toLowerCase() || "";

  return allowedClearStatuses.has(normalized)
    ? (normalized as "completed" | "confirmed")
    : null;
}

function toAssignmentRecord(value: unknown): AdminSavedBookingDriverAssignmentRecord | null {
  const row = asRecord(value);
  const id =
    typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);
  const status = textOrNull(row.status, 40)?.toLowerCase() || "";
  const updatedAt = textOrNull(row.updated_at, 80);

  if (
    id === null ||
    !allowedResponseStatuses.has(status) ||
    !updatedAt
  ) {
    return null;
  }

  return {
    id,
    status: status as AdminSavedBookingDriverAssignmentStatus,
    updated_at: updatedAt,
  };
}

function parseAssignPayload(
  record: UnknownRecord,
): AdminSavedBookingDriverAssignmentResult<AdminSavedBookingDriverAssignmentInput> {
  const unsupportedKey = Object.keys(record).find((key) => !allowedAssignPayloadKeys.has(key));
  const bookingId = validBookingId(record.booking_id);
  const driverId = optionalPositiveInteger(record.driver_id);
  const driverName = textOrNull(record.driver_name, 160);
  const driverContact = textOrNull(record.driver_contact, 80);
  const driverPlateNumber = textOrNull(record.driver_plate_number, 40);
  const driverPayoutAmount = optionalNumber(record.driver_payout_amount);
  const driverPayoutMin = optionalNumber(record.driver_payout_min);
  const driverPayoutMax = optionalNumber(record.driver_payout_max);
  const driverPayoutOverride = optionalNumber(record.driver_payout_override);
  const driverPayoutUnit = optionalPayoutUnit(record.driver_payout_unit);
  const driverPayoutReason = textOrNull(record.driver_payout_reason, 500);
  const driverNotes = textOrNull(record.driver_notes, 2000);
  const includePayout = optionalBoolean(record.driver_dispatch_include_payout);

  if (
    unsupportedKey ||
    !bookingId ||
    !driverId.ok ||
    !driverName ||
    !driverPayoutAmount.ok ||
    !driverPayoutMin.ok ||
    !driverPayoutMax.ok ||
    !driverPayoutOverride.ok ||
    !driverPayoutUnit.ok ||
    !includePayout.ok
  ) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  const payload: AdminSavedBookingDriverAssignmentInput = {
    action: "assign",
    booking_id: bookingId,
    driver_contact: driverContact,
    driver_dispatch_include_payout: includePayout.value,
    driver_id: driverId.value,
    driver_name: driverName,
    driver_notes: driverNotes,
    driver_payout_amount: driverPayoutAmount.value,
    driver_payout_override: driverPayoutOverride.value,
    driver_payout_reason: driverPayoutReason,
    driver_plate_number: driverPlateNumber,
  };

  if ("driver_payout_min" in record) {
    payload.driver_payout_min = driverPayoutMin.value;
  }

  if ("driver_payout_max" in record) {
    payload.driver_payout_max = driverPayoutMax.value;
  }

  if ("driver_payout_unit" in record) {
    payload.driver_payout_unit = driverPayoutUnit.value;
  }

  return {
    data: payload,
    ok: true,
  };
}

function parseClearPayload(
  record: UnknownRecord,
): AdminSavedBookingDriverAssignmentResult<AdminSavedBookingDriverAssignmentInput> {
  const unsupportedKey = Object.keys(record).find((key) => !allowedClearPayloadKeys.has(key));
  const bookingId = validBookingId(record.booking_id);
  const status = validClearStatus(record.status);

  if (unsupportedKey || !bookingId || !status) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      action: "clear",
      booking_id: bookingId,
      status,
    },
    ok: true,
  };
}

export function parseAdminSavedBookingDriverAssignmentPayload(
  input: unknown,
): AdminSavedBookingDriverAssignmentResult<AdminSavedBookingDriverAssignmentInput> {
  const record = asRecord(input);
  const action = textOrNull(record.action, 20)?.toLowerCase() || "";

  if (action === "assign") {
    return parseAssignPayload(record);
  }

  if (action === "clear") {
    return parseClearPayload(record);
  }

  return {
    error: malformedPayloadError,
    ok: false,
    status: 400,
  };
}

function updatePayloadForAssignment(input: AdminSavedBookingDriverAssignmentInput) {
  const updatedAt = new Date().toISOString();

  if (input.action === "clear") {
    return {
      driver_contact: null,
      driver_dispatch_include_payout: false,
      driver_id: null,
      driver_name: null,
      driver_notes: null,
      driver_payout_override: null,
      driver_payout_reason: null,
      driver_plate_number: null,
      status: input.status,
      updated_at: updatedAt,
    };
  }

  const payload: Record<string, unknown> = {
    driver_contact: input.driver_contact,
    driver_dispatch_include_payout: input.driver_dispatch_include_payout,
    driver_id: input.driver_id,
    driver_name: input.driver_name,
    driver_notes: input.driver_notes,
    driver_payout_amount: input.driver_payout_amount,
    driver_payout_override: input.driver_payout_override,
    driver_payout_reason: input.driver_payout_reason,
    driver_plate_number: input.driver_plate_number,
    status: "assigned",
    updated_at: updatedAt,
  };

  if ("driver_payout_min" in input) {
    payload.driver_payout_min = input.driver_payout_min;
  }

  if ("driver_payout_max" in input) {
    payload.driver_payout_max = input.driver_payout_max;
  }

  if ("driver_payout_unit" in input) {
    payload.driver_payout_unit = input.driver_payout_unit;
  }

  return payload;
}

export async function updateAdminSavedBookingDriverAssignment(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingDriverAssignmentResult<AdminSavedBookingDriverAssignmentData>> {
  const parsed = parseAdminSavedBookingDriverAssignmentPayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingDriverAssignmentClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("bookings")
    .update(updatePayloadForAssignment(parsed.data))
    .eq("id", parsed.data.booking_id)
    .select("id, status, updated_at")
    .maybeSingle();

  if (error) {
    return safeDatabaseFailure(safeUpdateError, 500, error);
  }

  const booking = toAssignmentRecord(data);

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
      version: adminSavedBookingDriverAssignmentVersion,
    },
    ok: true,
  };
}
