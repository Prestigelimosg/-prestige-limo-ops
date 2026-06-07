import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import {
  checkAdminBookingPersistenceStagingConfigReadiness,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";
import type { DriverJobStatusUpdate } from "./driver-job-status-workflow";

export const adminDriverJobStatusReadVersion =
  "stage-admin-driver-job-status-read-api-v1";

export type AdminDriverJobStatusValue =
  | "acknowledged"
  | DriverJobStatusUpdate
  | "needs_call";

export type AdminDriverJobStatusReadParams = {
  booking_reference: string;
  limit: number;
};

export type AdminDriverJobStatusEvent = {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "driver" | "system";
  booking_reference: string;
  created_at: string | null;
  occurred_at: string | null;
  safe_status_note: string | null;
  source_surface: "admin_api" | "admin_dashboard" | "driver_job_api" | "migration" | "system";
  status_source: "admin_api" | "driver_job_api" | "system";
  status_value: AdminDriverJobStatusValue;
};

export type AdminDriverJobStatusReadResult = {
  booking_reference: string;
  latest_status: AdminDriverJobStatusValue | null;
  statuses: AdminDriverJobStatusEvent[];
  summary: {
    event_count: number;
    has_status_history: boolean;
  };
  version: typeof adminDriverJobStatusReadVersion;
};

type UnknownRecord = Record<string, unknown>;

const defaultStatusHistoryLimit = 10;
const maxStatusHistoryLimit = 25;
const maxBookingReferenceLength = 120;
const maxSafeTextLength = 500;
const driverJobStatusEventSelect =
  "booking_reference, status_value, status_source, safe_status_note, occurred_at, source_surface, actor_role, actor_label, created_at";
const disabledDriverJobStatusReadError =
  "Admin driver job status read is not enabled on this server.";
const safeDriverJobStatusConfigError =
  "Admin driver job status read configuration is not ready.";
const safeDriverJobStatusActorError =
  "Admin driver job status read requires a verified internal boundary.";
const safeDriverJobStatusServerSessionActorError =
  "Admin driver job status read requires a verified admin or dispatcher server session.";
const safeDriverJobStatusReadError = "Admin driver job status read failed safely.";
const allowedStatusValues = new Set<AdminDriverJobStatusValue>([
  "acknowledged",
  "driver_otw",
  "ots",
  "pob",
  "completed",
  "needs_call",
]);
const allowedStatusSources = new Set<AdminDriverJobStatusEvent["status_source"]>([
  "admin_api",
  "driver_job_api",
  "system",
]);
const allowedSourceSurfaces = new Set<AdminDriverJobStatusEvent["source_surface"]>([
  "admin_api",
  "admin_dashboard",
  "driver_job_api",
  "migration",
  "system",
]);
const allowedActorRoles = new Set<AdminDriverJobStatusEvent["actor_role"]>([
  "admin",
  "dispatcher",
  "driver",
  "system",
]);
const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const forbiddenSafeTextFragments = [
  "amount_due",
  "auth_link",
  "billing",
  "customer_auth",
  "customer_charge",
  "customer_price",
  "debug",
  "driver_auth",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
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
  "proof",
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "stripe",
  "telegram",
  "token",
  "whatsapp_send",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed ? trimmed : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenSafeTextFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenSafeTextFragments.some((fragment) => normalized.includes(fragment));
}

function safeTextFromDb(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > maxLength || includesForbiddenSafeTextFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeDateTextFromDb(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  return cleaned;
}

function validBookingReference(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxBookingReferenceLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function validLimit(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return defaultStatusHistoryLimit;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxStatusHistoryLimit
    ? parsed
    : null;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

export function parseAdminDriverJobStatusReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminDriverJobStatusReadParams> {
  const bookingReference = validBookingReference(readParamsValue(params, "booking_reference"));

  if (!bookingReference) {
    return {
      error: "Missing or malformed driver job status booking_reference.",
      ok: false,
      status: 400,
    };
  }

  const limit = validLimit(readParamsValue(params, "limit"));

  if (!limit) {
    return {
      error: "Malformed driver job status limit rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      limit,
    },
    ok: true,
  };
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function classifyAdapterDatabaseFailure(
  error: unknown,
): AdminBookingPersistenceSafeErrorCategory {
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

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedAdapterActorRoles.has(actor.actor_role) ||
    !textOrNull(actor.actor_label) ||
    !["admin_api", "system"].includes(actor.source_surface)
  ) {
    return {
      error: safeDriverJobStatusActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role) ||
      actor.source_surface !== "admin_api")
  ) {
    return {
      error: safeDriverJobStatusServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyAdminDriverJobStatusSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledDriverJobStatusReadError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeDriverJobStatusConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeDriverJobStatusConfigError,
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
      error: safeDriverJobStatusConfigError,
      ok: false,
      status: 503,
    };
  }
}

function validStatusValue(value: unknown): AdminDriverJobStatusValue | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedStatusValues.has(cleaned as AdminDriverJobStatusValue)
    ? (cleaned as AdminDriverJobStatusValue)
    : null;
}

function validStatusSource(value: unknown): AdminDriverJobStatusEvent["status_source"] | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedStatusSources.has(cleaned as AdminDriverJobStatusEvent["status_source"])
    ? (cleaned as AdminDriverJobStatusEvent["status_source"])
    : null;
}

function validSourceSurface(value: unknown): AdminDriverJobStatusEvent["source_surface"] | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedSourceSurfaces.has(cleaned as AdminDriverJobStatusEvent["source_surface"])
    ? (cleaned as AdminDriverJobStatusEvent["source_surface"])
    : null;
}

function validActorRole(value: unknown): AdminDriverJobStatusEvent["actor_role"] | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedActorRoles.has(cleaned as AdminDriverJobStatusEvent["actor_role"])
    ? (cleaned as AdminDriverJobStatusEvent["actor_role"])
    : null;
}

function toAdminDriverJobStatusEvent(row: UnknownRecord): AdminDriverJobStatusEvent | null {
  const bookingReference = validBookingReference(row.booking_reference);
  const statusValue = validStatusValue(row.status_value);
  const statusSource = validStatusSource(row.status_source);
  const sourceSurface = validSourceSurface(row.source_surface);
  const actorRole = validActorRole(row.actor_role);

  if (!bookingReference || !statusValue || !statusSource || !sourceSurface || !actorRole) {
    return null;
  }

  return {
    actor_label: safeTextFromDb(row.actor_label, 160),
    actor_role: actorRole,
    booking_reference: bookingReference,
    created_at: safeDateTextFromDb(row.created_at),
    occurred_at: safeDateTextFromDb(row.occurred_at),
    safe_status_note: safeTextFromDb(row.safe_status_note),
    source_surface: sourceSurface,
    status_source: statusSource,
    status_value: statusValue,
  };
}

function summarizeEvents(statuses: AdminDriverJobStatusEvent[]) {
  return {
    event_count: statuses.length,
    has_status_history: statuses.length > 0,
  };
}

export async function loadAdminDriverJobStatuses(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobStatusReadResult>> {
  const parsed = parseAdminDriverJobStatusReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyAdminDriverJobStatusSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("driver_job_status_events")
    .select(driverJobStatusEventSelect)
    .eq("booking_reference", parsed.data.booking_reference)
    .order("occurred_at", { ascending: false })
    .limit(parsed.data.limit);

  if (error) {
    return safeAdapterFailure(safeDriverJobStatusReadError, 500, error);
  }

  const statuses = asArray(data)
    .map(asRecord)
    .map(toAdminDriverJobStatusEvent)
    .filter((status): status is AdminDriverJobStatusEvent => Boolean(status));

  return {
    data: {
      booking_reference: parsed.data.booking_reference,
      latest_status: statuses[0]?.status_value || null,
      statuses,
      summary: summarizeEvents(statuses),
      version: adminDriverJobStatusReadVersion,
    },
    ok: true,
  };
}
