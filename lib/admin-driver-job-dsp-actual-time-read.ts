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

export const adminDriverJobDspActualTimeReadVersion =
  "stage-admin-driver-job-dsp-actual-time-read-api-v1";

export type AdminDriverJobDspActualTimeStatus = "complete" | "started" | "not_started";

export type AdminDriverJobDspActualTimeReadParams = {
  booking_reference: string;
  limit: number;
};

export type AdminDriverJobDspActualTimeSummary = {
  actual_time_status: AdminDriverJobDspActualTimeStatus;
  booking_reference: string;
  dsp_billable_minutes: number | null;
  dsp_ended_at: string | null;
  dsp_started_at: string | null;
  dsp_total_minutes: number | null;
};

export type AdminDriverJobDspActualTimeReadResult = {
  booking_reference: string;
  latest_summary: AdminDriverJobDspActualTimeSummary | null;
  summaries: AdminDriverJobDspActualTimeSummary[];
  summary: {
    complete_summary_count: number;
    has_complete_actual_time: boolean;
    summary_count: number;
  };
  version: typeof adminDriverJobDspActualTimeReadVersion;
};

type UnknownRecord = Record<string, unknown>;

const defaultDspActualTimeLimit = 3;
const maxDspActualTimeLimit = 5;
const maxBookingReferenceLength = 120;
const maxDspMinutes = 60 * 24 * 30;
const dspActualTimeSummarySelect =
  "booking_reference, dsp_started_at, dsp_ended_at, total_minutes, actual_time_status";
const disabledDspActualTimeReadError =
  "Admin driver job DSP actual time read is not enabled on this server.";
const safeDspActualTimeConfigError =
  "Admin driver job DSP actual time read configuration is not ready.";
const safeDspActualTimeActorError =
  "Admin driver job DSP actual time read requires a verified internal boundary.";
const safeDspActualTimeServerSessionActorError =
  "Admin driver job DSP actual time read requires a verified admin or dispatcher server session.";
const safeDspActualTimeReadError = "Admin driver job DSP actual time read failed safely.";
const allowedActualTimeStatuses = new Set<AdminDriverJobDspActualTimeStatus>([
  "complete",
  "started",
  "not_started",
]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);

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
    return defaultDspActualTimeLimit;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxDspActualTimeLimit
    ? parsed
    : null;
}

function integerOrNull(value: unknown, maxValue: number) {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxValue ? parsed : null;
}

function safeDateTextFromDb(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  return cleaned;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

export function parseAdminDriverJobDspActualTimeReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminDriverJobDspActualTimeReadParams> {
  const bookingReference = validBookingReference(readParamsValue(params, "booking_reference"));

  if (!bookingReference) {
    return {
      error: "Missing or malformed driver job DSP actual time booking_reference.",
      ok: false,
      status: 400,
    };
  }

  const limit = validLimit(readParamsValue(params, "limit"));

  if (!limit) {
    return {
      error: "Malformed driver job DSP actual time limit rejected.",
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
    !allowedActorRoles.has(actor.actor_role) ||
    !textOrNull(actor.actor_label) ||
    !["admin_api", "system"].includes(actor.source_surface)
  ) {
    return {
      error: safeDspActualTimeActorError,
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
      error: safeDspActualTimeServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyAdminDriverJobDspActualTimeSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledDspActualTimeReadError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeDspActualTimeConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeDspActualTimeConfigError,
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
      error: safeDspActualTimeConfigError,
      ok: false,
      status: 503,
    };
  }
}

function validActualTimeStatus(value: unknown): AdminDriverJobDspActualTimeStatus | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedActualTimeStatuses.has(cleaned as AdminDriverJobDspActualTimeStatus)
    ? (cleaned as AdminDriverJobDspActualTimeStatus)
    : null;
}

function toAdminDriverJobDspActualTimeSummary(
  row: UnknownRecord,
): AdminDriverJobDspActualTimeSummary | null {
  const bookingReference = validBookingReference(row.booking_reference);
  const actualTimeStatus = validActualTimeStatus(row.actual_time_status);
  const totalMinutes = integerOrNull(row.total_minutes, maxDspMinutes);

  if (!bookingReference || !actualTimeStatus) {
    return null;
  }

  return {
    actual_time_status: actualTimeStatus,
    booking_reference: bookingReference,
    dsp_billable_minutes: actualTimeStatus === "complete" ? totalMinutes : null,
    dsp_ended_at: safeDateTextFromDb(row.dsp_ended_at),
    dsp_started_at: safeDateTextFromDb(row.dsp_started_at),
    dsp_total_minutes: totalMinutes,
  };
}

function summarizeDspActualTime(summaries: AdminDriverJobDspActualTimeSummary[]) {
  const completeSummaryCount = summaries.filter(
    (summary) =>
      summary.actual_time_status === "complete" &&
      summary.dsp_total_minutes !== null &&
      summary.dsp_billable_minutes !== null,
  ).length;

  return {
    complete_summary_count: completeSummaryCount,
    has_complete_actual_time: completeSummaryCount > 0,
    summary_count: summaries.length,
  };
}

export async function loadAdminDriverJobDspActualTimeSummaries(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobDspActualTimeReadResult>> {
  const parsed = parseAdminDriverJobDspActualTimeReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyAdminDriverJobDspActualTimeSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("driver_job_dsp_actual_time_summaries")
    .select(dspActualTimeSummarySelect)
    .eq("booking_reference", parsed.data.booking_reference)
    .order("dsp_ended_at", { ascending: false, nullsFirst: false })
    .limit(parsed.data.limit);

  if (error) {
    return safeAdapterFailure(safeDspActualTimeReadError, 500, error);
  }

  const summaries = asArray(data)
    .map(asRecord)
    .map(toAdminDriverJobDspActualTimeSummary)
    .filter((summary): summary is AdminDriverJobDspActualTimeSummary => Boolean(summary));

  return {
    data: {
      booking_reference: parsed.data.booking_reference,
      latest_summary: summaries[0] || null,
      summaries,
      summary: summarizeDspActualTime(summaries),
      version: adminDriverJobDspActualTimeReadVersion,
    },
    ok: true,
  };
}
