import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedBookingDeleteVersion = "admin-saved-booking-delete-v1";
export const adminSavedBookingFutureDraftCleanupDeleteScope =
  "future_draft_2099_exact_refs";
export const adminSavedBookingFutureDraftCleanupDeleteVersion =
  "admin-saved-booking-future-draft-cleanup-delete-v1";

export type AdminSavedBookingDeleteInput = {
  booking_id: string;
};

export type AdminSavedBookingFutureDraftCleanupDeleteInput = {
  booking_references: string[];
  cleanup_scope: typeof adminSavedBookingFutureDraftCleanupDeleteScope;
};

const adminSavedBookingDeletableStatuses = ["completed", "cancelled"] as const;

type AdminSavedBookingDeletableStatus = (typeof adminSavedBookingDeletableStatuses)[number];
type AdminSavedBookingDeleteStatusColumn = "admin_internal_status" | "status";

export type AdminSavedBookingDeleteRecord = {
  id: string | number;
  status: AdminSavedBookingDeletableStatus;
};

type AdminSavedBookingDeleteTargetRecord = AdminSavedBookingDeleteRecord & {
  booking_reference: string;
  delete_status_column: AdminSavedBookingDeleteStatusColumn;
  delete_status_value: AdminSavedBookingDeletableStatus;
};

export type AdminSavedBookingDeleteData = {
  booking: AdminSavedBookingDeleteRecord;
  version: typeof adminSavedBookingDeleteVersion;
};

export type AdminSavedBookingFutureDraftCleanupDeleteRecord = {
  booking_reference: string;
  id: string | number;
  pickup_at: string;
  status: "draft";
};

export type AdminSavedBookingFutureDraftCleanupDeleteData = {
  bookings: AdminSavedBookingFutureDraftCleanupDeleteRecord[];
  skipped_references: string[];
  version: typeof adminSavedBookingFutureDraftCleanupDeleteVersion;
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
type SavedBookingDeleteSelectResult<T> = {
  data: T | null;
  error: unknown;
};

const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedPayloadKeys = new Set(["booking_id"]);
const allowedFutureDraftCleanupPayloadKeys = new Set([
  "booking_references",
  "cleanup_scope",
]);
const malformedPayloadError =
  "Admin saved booking delete payload is malformed.";
const safeActorError =
  "Admin saved booking delete requires a verified internal boundary.";
const safeConfigError =
  "Admin saved booking delete configuration is not ready.";
const safeDeleteError = "Admin saved booking delete failed safely.";
const safeDeleteCleanupError =
  "Admin saved booking operational job cleanup failed safely.";
const safeSessionActorError =
  "Admin saved booking delete requires a verified admin or dispatcher server session.";
const safeTargetMissingError =
  "Archived saved booking delete target was not found.";
const safeFutureDraftCleanupError =
  "Future draft saved booking cleanup failed safely.";
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

function validBookingReference(value: unknown) {
  const cleaned = textOrNull(value, 160);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,159}$/.test(cleaned)
    ? cleaned
    : null;
}

function pickupAtIsFutureDraftCleanupDate(value: string | null) {
  if (!value) {
    return false;
  }

  const parsed = new Date(value);

  return Number.isFinite(parsed.getTime()) && parsed.getUTCFullYear() === 2099;
}

function futureDraftCleanupStatus(value: UnknownRecord) {
  return (
    textOrNull(value.status, 40) ||
    textOrNull(value.admin_internal_status, 40) ||
    textOrNull(value.customer_facing_status, 40)
  )?.toLowerCase();
}

function deletableStatusFromValue(value: unknown) {
  const status = textOrNull(value, 40)?.toLowerCase();

  return adminSavedBookingDeletableStatuses.includes(
    status as AdminSavedBookingDeletableStatus,
  )
    ? (status as AdminSavedBookingDeletableStatus)
    : null;
}

function deletableStatusFromRecord(value: UnknownRecord) {
  return (
    deletableStatusFromValue(value.status) ||
    deletableStatusFromValue(value.admin_internal_status) ||
    deletableStatusFromValue(value.customer_facing_status)
  );
}

function toDeleteRecord(value: unknown): AdminSavedBookingDeleteRecord | null {
  const row = asRecord(value);
  const id =
    typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);
  const status = deletableStatusFromRecord(row);

  if (id === null || !status) {
    return null;
  }

  return {
    id,
    status,
  };
}

function toDeleteTargetRecord(
  value: unknown,
  deleteStatusColumn: AdminSavedBookingDeleteStatusColumn,
): AdminSavedBookingDeleteTargetRecord | null {
  const booking = toDeleteRecord(value);
  const row = asRecord(value);
  const bookingReference = validBookingReference(row.booking_reference);
  const deleteStatusValue = deletableStatusFromValue(row[deleteStatusColumn]);

  return booking && bookingReference && deleteStatusValue
    ? {
        ...booking,
        booking_reference: bookingReference,
        delete_status_column: deleteStatusColumn,
        delete_status_value: deleteStatusValue,
      }
    : null;
}

function toFutureDraftCleanupDeleteRecord(
  value: unknown,
  expectedReference: string,
): AdminSavedBookingFutureDraftCleanupDeleteRecord | null {
  const row = asRecord(value);
  const id =
    typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);
  const bookingReference = textOrNull(row.booking_reference, 160);
  const pickupAt = textOrNull(row.pickup_at, 120);
  const status = futureDraftCleanupStatus(row);

  if (
    id === null ||
    bookingReference !== expectedReference ||
    status !== "draft" ||
    !pickupAt ||
    !pickupAtIsFutureDraftCleanupDate(pickupAt)
  ) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    id,
    pickup_at: pickupAt,
    status: "draft",
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

export function isAdminSavedBookingFutureDraftCleanupDeletePayload(input: unknown) {
  const record = asRecord(input);

  return (
    record.cleanup_scope === adminSavedBookingFutureDraftCleanupDeleteScope ||
    Array.isArray(record.booking_references)
  );
}

export function parseAdminSavedBookingFutureDraftCleanupDeletePayload(
  input: unknown,
): AdminSavedBookingDeleteResult<AdminSavedBookingFutureDraftCleanupDeleteInput> {
  const record = asRecord(input);
  const unsupportedKey = Object.keys(record).find(
    (key) => !allowedFutureDraftCleanupPayloadKeys.has(key),
  );
  const rawReferences = Array.isArray(record.booking_references)
    ? record.booking_references
    : [];
  const bookingReferences = rawReferences.map(validBookingReference);
  const uniqueReferences = new Set(bookingReferences.filter(Boolean));

  if (
    unsupportedKey ||
    record.cleanup_scope !== adminSavedBookingFutureDraftCleanupDeleteScope ||
    rawReferences.length === 0 ||
    rawReferences.length > 20 ||
    bookingReferences.some((reference) => !reference) ||
    uniqueReferences.size !== rawReferences.length
  ) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_references: bookingReferences as string[],
      cleanup_scope: adminSavedBookingFutureDraftCleanupDeleteScope,
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

  const targetResult = await findCompletedSavedBookingDeleteTarget(
    clientResult.data,
    parsed.data.booking_id,
  );

  if (targetResult.error) {
    return safeDatabaseFailure(safeDeleteError, 500, targetResult.error);
  }

  const target = targetResult.data;

  if (!target) {
    return {
      error: safeTargetMissingError,
      ok: false,
      status: 404,
    };
  }

  const cleanupResult = await deleteOperationalJobArtifactsForBookingReference(
    clientResult.data,
    target.booking_reference,
  );

  if (!cleanupResult.ok) {
    return cleanupResult;
  }

  const { data, error } = await deleteCompletedSavedBookingTarget(
    clientResult.data,
    target,
  );

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

async function findCompletedSavedBookingDeleteTarget(
  client: SavedBookingDeleteClient,
  bookingId: string,
): Promise<SavedBookingDeleteSelectResult<AdminSavedBookingDeleteTargetRecord>> {
  const currentResult = await client
    .from("bookings")
    .select("id, booking_reference, admin_internal_status, customer_facing_status")
    .eq("id", bookingId)
    .in("admin_internal_status", [...adminSavedBookingDeletableStatuses])
    .maybeSingle();

  if (currentResult.error) {
    if (classifyDatabaseFailure(currentResult.error) !== "column_missing") {
      return {
        data: null,
        error: currentResult.error,
      };
    }
  } else {
    const currentTarget = toDeleteTargetRecord(
      currentResult.data,
      "admin_internal_status",
    );

    if (currentTarget) {
      return {
        data: currentTarget,
        error: null,
      };
    }
  }

  const legacyResult = await client
    .from("bookings")
    .select("id, booking_reference, status")
    .eq("id", bookingId)
    .in("status", [...adminSavedBookingDeletableStatuses])
    .maybeSingle();

  if (legacyResult.error) {
    return {
      data: null,
      error: legacyResult.error,
    };
  }

  return {
    data: toDeleteTargetRecord(legacyResult.data, "status"),
    error: null,
  };
}

async function deleteCompletedSavedBookingTarget(
  client: SavedBookingDeleteClient,
  target: AdminSavedBookingDeleteTargetRecord,
): Promise<SavedBookingDeleteSelectResult<unknown>> {
  const selectedColumns =
    target.delete_status_column === "admin_internal_status"
      ? "id, booking_reference, admin_internal_status, customer_facing_status"
      : "id, booking_reference, status";

  return client
    .from("bookings")
    .delete()
    .eq("id", target.id)
    .eq("booking_reference", target.booking_reference)
    .eq(target.delete_status_column, target.delete_status_value)
    .select(selectedColumns)
    .maybeSingle();
}

async function deleteOperationalJobArtifactsForBookingReference(
  client: SavedBookingDeleteClient,
  bookingReference: string,
): Promise<AdminSavedBookingDeleteResult<null>> {
  const cleanupTables = [
    "customer_driver_app_notification_outbox",
    "driver_live_location_latest_positions",
    "driver_live_location_audit_events",
    "driver_ots_photo_proofs",
    "driver_job_dsp_actual_time_events",
    "driver_job_status_events",
    "driver_job_links",
  ];

  for (const table of cleanupTables) {
    const { error } = await client
      .from(table)
      .delete()
      .eq("booking_reference", bookingReference);

    if (error) {
      return safeDatabaseFailure(safeDeleteCleanupError, 500, error);
    }
  }

  return {
    data: null,
    ok: true,
  };
}

async function findFutureDraftCleanupCandidate(
  client: SavedBookingDeleteClient,
  bookingReference: string,
): Promise<SavedBookingDeleteSelectResult<unknown>> {
  const currentResult = await client
    .from("bookings")
    .select(
      "id, booking_reference, admin_internal_status, customer_facing_status, pickup_at",
    )
    .eq("booking_reference", bookingReference)
    .eq("admin_internal_status", "draft")
    .maybeSingle();

  if (currentResult.error) {
    if (classifyDatabaseFailure(currentResult.error) !== "column_missing") {
      return currentResult;
    }
  } else if (currentResult.data) {
    return currentResult;
  }

  return client
    .from("bookings")
    .select("id, booking_reference, status, pickup_at")
    .eq("booking_reference", bookingReference)
    .eq("status", "draft")
    .maybeSingle();
}

async function deleteFutureDraftCleanupCandidate(
  client: SavedBookingDeleteClient,
  booking: AdminSavedBookingFutureDraftCleanupDeleteRecord,
): Promise<SavedBookingDeleteSelectResult<unknown>> {
  const currentResult = await client
    .from("bookings")
    .delete()
    .eq("booking_reference", booking.booking_reference)
    .eq("admin_internal_status", "draft")
    .eq("id", booking.id)
    .eq("pickup_at", booking.pickup_at)
    .select(
      "id, booking_reference, admin_internal_status, customer_facing_status, pickup_at",
    )
    .maybeSingle();

  if (currentResult.error) {
    if (classifyDatabaseFailure(currentResult.error) !== "column_missing") {
      return currentResult;
    }
  } else if (currentResult.data) {
    return currentResult;
  }

  return client
    .from("bookings")
    .delete()
    .eq("booking_reference", booking.booking_reference)
    .eq("status", "draft")
    .eq("id", booking.id)
    .eq("pickup_at", booking.pickup_at)
    .select("id, booking_reference, status, pickup_at")
    .maybeSingle();
}

export async function deleteAdminFutureDraft2099SavedBookingsByReference(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingDeleteResult<AdminSavedBookingFutureDraftCleanupDeleteData>> {
  const parsed = parseAdminSavedBookingFutureDraftCleanupDeletePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingDeleteClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const bookings: AdminSavedBookingFutureDraftCleanupDeleteRecord[] = [];
  const skippedReferences: string[] = [];

  for (const bookingReference of parsed.data.booking_references) {
    const { data: candidateData, error: candidateError } =
      await findFutureDraftCleanupCandidate(clientResult.data, bookingReference);

    if (candidateError) {
      return safeDatabaseFailure(safeFutureDraftCleanupError, 500, candidateError);
    }

    const candidate = toFutureDraftCleanupDeleteRecord(candidateData, bookingReference);

    if (!candidate) {
      skippedReferences.push(bookingReference);
      continue;
    }

    const { data, error } = await deleteFutureDraftCleanupCandidate(
      clientResult.data,
      candidate,
    );

    if (error) {
      return safeDatabaseFailure(safeFutureDraftCleanupError, 500, error);
    }

    const booking = toFutureDraftCleanupDeleteRecord(data, bookingReference);

    if (booking) {
      bookings.push(booking);
    } else {
      skippedReferences.push(bookingReference);
    }
  }

  return {
    data: {
      bookings,
      skipped_references: skippedReferences,
      version: adminSavedBookingFutureDraftCleanupDeleteVersion,
    },
    ok: true,
  };
}
