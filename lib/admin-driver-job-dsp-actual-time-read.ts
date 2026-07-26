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
import { calculateDspBillableMinutes } from "./hourly-billing";

export const adminDriverJobDspActualTimeReadVersion =
  "stage-admin-driver-job-dsp-actual-time-read-api-v2";

export type AdminDriverJobDspActualTimeStatus = "complete" | "started" | "not_started";
export type AdminDriverJobDspBillingTimeSource = "admin_correction" | "automatic";

export type AdminDriverJobDspActualTimeReadParams = {
  booking_reference: string;
  limit: number;
};

export type AdminDriverJobDspActualTimeSummary = {
  actual_time_status: AdminDriverJobDspActualTimeStatus;
  billing_time_correction_reason: string | null;
  billing_time_source: AdminDriverJobDspBillingTimeSource;
  booking_reference: string;
  dsp_billable_minutes: number | null;
  dsp_ended_at: string | null;
  dsp_started_at: string | null;
  dsp_total_minutes: number | null;
};

export type AdminDriverJobDspBillingTimeCorrectionParams = {
  booking_reference: string;
  correction_reason: string;
  dsp_ended_at: string;
  dsp_started_at: string;
};

export type AdminDriverJobDspBillingTimeCorrectionResult = {
  booking_reference: string;
  corrected_summary: AdminDriverJobDspActualTimeSummary;
  version: typeof adminDriverJobDspActualTimeReadVersion;
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
const maxCorrectionReasonLength = 500;
const dspActualTimeSummarySelect =
  "booking_reference, dsp_started_at, dsp_ended_at, total_minutes, actual_time_status";
const dspBillingTimeCorrectionSelect =
  "booking_reference, event_type, occurred_at, safe_event_note, safe_event_context, source_surface, actor_role, created_at";
const dspBillingTimeCorrectionInsertSelect =
  "booking_reference, event_type, occurred_at, safe_event_note, safe_event_context, source_surface, actor_role, created_at";
const dspBillingTimeCorrectionBookingSelect = "booking_reference, service_type";
const driverJcStatusEventSelect =
  "booking_reference, status_value, occurred_at";
const disabledDspActualTimeReadError =
  "Admin driver job DSP actual time read is not enabled on this server.";
const safeDspActualTimeConfigError =
  "Admin driver job DSP actual time read configuration is not ready.";
const safeDspActualTimeActorError =
  "Admin driver job DSP actual time read requires a verified internal boundary.";
const safeDspActualTimeServerSessionActorError =
  "Admin driver job DSP actual time read requires a verified admin or dispatcher server session.";
const safeDspActualTimeReadError = "Admin driver job DSP actual time read failed safely.";
const safeDspBillingTimeCorrectionWriteError =
  "Admin DSP billing time correction was not saved.";
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

function safeCorrectionReason(value: unknown) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ").trim() || "";

  return cleaned.length >= 3 && cleaned.length <= maxCorrectionReasonLength
    ? cleaned
    : null;
}

function timezoneBearingIsoDate(value: unknown) {
  const cleaned = textOrNull(value);

  if (
    !cleaned ||
    cleaned.length > 80 ||
    !/(?:Z|[+-]\d{2}:\d{2})$/i.test(cleaned)
  ) {
    return null;
  }

  const parsed = new Date(cleaned);

  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
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

export function parseAdminDriverJobDspBillingTimeCorrectionParams(
  input: UnknownRecord,
): AdminBookingResult<AdminDriverJobDspBillingTimeCorrectionParams> {
  const bookingReference = validBookingReference(input.booking_reference);
  const correctionReason = safeCorrectionReason(input.correction_reason);
  const dspStartedAt = timezoneBearingIsoDate(input.dsp_started_at);
  const dspEndedAt = timezoneBearingIsoDate(input.dsp_ended_at);

  if (!bookingReference) {
    return {
      error: "Missing or malformed DSP billing time booking_reference.",
      ok: false,
      status: 400,
    };
  }

  if (!correctionReason) {
    return {
      error: `Correction reason is required and must be 3-${maxCorrectionReasonLength} characters.`,
      ok: false,
      status: 400,
    };
  }

  if (!dspStartedAt || !dspEndedAt) {
    return {
      error: "DSP billing start and end must be valid timezone-bearing timestamps.",
      ok: false,
      status: 400,
    };
  }

  const totalMinutes = Math.floor(
    (new Date(dspEndedAt).getTime() - new Date(dspStartedAt).getTime()) / 60_000,
  );

  if (totalMinutes <= 0) {
    return {
      error: "DSP billing end must be after its start.",
      ok: false,
      status: 400,
    };
  }

  if (totalMinutes > maxDspMinutes) {
    return {
      error: "DSP billing interval exceeds the 30-day safety boundary.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booking_reference: bookingReference,
      correction_reason: correctionReason,
      dsp_ended_at: dspEndedAt,
      dsp_started_at: dspStartedAt,
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
    billing_time_correction_reason: null,
    billing_time_source: "automatic",
    booking_reference: bookingReference,
    dsp_billable_minutes:
      actualTimeStatus === "complete" ? calculateDspBillableMinutes(totalMinutes) : null,
    dsp_ended_at: safeDateTextFromDb(row.dsp_ended_at),
    dsp_started_at: safeDateTextFromDb(row.dsp_started_at),
    dsp_total_minutes: totalMinutes,
  };
}

function toAdminDspBillingTimeCorrectionSummary(
  row: UnknownRecord,
  bookingReference: string,
): AdminDriverJobDspActualTimeSummary | null {
  const exactReference = validBookingReference(row.booking_reference);
  const eventType = textOrNull(row.event_type);
  const sourceSurface = textOrNull(row.source_surface);
  const actorRole = textOrNull(row.actor_role);
  const context = asRecord(row.safe_event_context);
  const policy = textOrNull(context.actual_time_policy);
  const dspStartedAt = timezoneBearingIsoDate(context.billing_started_at);
  const dspEndedAt = timezoneBearingIsoDate(row.occurred_at);
  const correctionReason = safeCorrectionReason(row.safe_event_note);

  if (
    exactReference !== bookingReference ||
    eventType !== "dsp_end" ||
    sourceSurface !== "admin_api" ||
    !["admin", "dispatcher"].includes(actorRole || "") ||
    policy !== "admin_billing_time_correction" ||
    !dspStartedAt ||
    !dspEndedAt ||
    !correctionReason
  ) {
    return null;
  }

  const totalMinutes = Math.floor(
    (new Date(dspEndedAt).getTime() - new Date(dspStartedAt).getTime()) / 60_000,
  );

  if (totalMinutes <= 0 || totalMinutes > maxDspMinutes) {
    return null;
  }

  return {
    actual_time_status: "complete",
    billing_time_correction_reason: correctionReason,
    billing_time_source: "admin_correction",
    booking_reference: bookingReference,
    dsp_billable_minutes: calculateDspBillableMinutes(totalMinutes),
    dsp_ended_at: dspEndedAt,
    dsp_started_at: dspStartedAt,
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

async function loadPersistedDriverJcEnd(
  client: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await client
    .from("driver_job_status_events")
    .select(driverJcStatusEventSelect)
    .eq("booking_reference", bookingReference)
    .eq("status_value", "completed")
    .order("occurred_at", { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    return null;
  }

  const row = asRecord(asArray(data)[0]);
  const exactReference = validBookingReference(row.booking_reference);
  const status = textOrNull(row.status_value);

  if (exactReference !== bookingReference || status !== "completed") {
    return null;
  }

  return safeDateTextFromDb(row.occurred_at);
}

async function addPersistedDriverJcEndFallback(
  client: SupabaseClient,
  bookingReference: string,
  summaries: AdminDriverJobDspActualTimeSummary[],
) {
  if (summaries[0]?.dsp_ended_at) {
    return summaries;
  }

  const persistedDriverJcEnd = await loadPersistedDriverJcEnd(
    client,
    bookingReference,
  );

  if (!persistedDriverJcEnd) {
    return summaries;
  }

  if (summaries.length > 0) {
    return [
      {
        ...summaries[0],
        dsp_ended_at: persistedDriverJcEnd,
      },
      ...summaries.slice(1),
    ];
  }

  return [
    {
      actual_time_status: "not_started" as const,
      billing_time_correction_reason: null,
      billing_time_source: "automatic" as const,
      booking_reference: bookingReference,
      dsp_billable_minutes: null,
      dsp_ended_at: persistedDriverJcEnd,
      dsp_started_at: null,
      dsp_total_minutes: null,
    },
  ];
}

async function loadLatestDspBillingTimeCorrection(
  client: SupabaseClient,
  bookingReference: string,
) {
  const { data, error } = await client
    .from("driver_job_dsp_actual_time_events")
    .select(dspBillingTimeCorrectionSelect)
    .eq("booking_reference", bookingReference)
    .eq("event_type", "dsp_end")
    .eq("source_surface", "admin_api")
    .order("created_at", { ascending: false, nullsFirst: false })
    .limit(20);

  if (error) {
    return {
      error,
      summary: null,
    };
  }

  return {
    error: null,
    summary:
      asArray(data)
        .map(asRecord)
        .map((row) => toAdminDspBillingTimeCorrectionSummary(row, bookingReference))
        .find(
          (summary): summary is AdminDriverJobDspActualTimeSummary => Boolean(summary),
        ) || null,
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

  const correctionResult = await loadLatestDspBillingTimeCorrection(
    clientResult.data,
    parsed.data.booking_reference,
  );

  if (correctionResult.error) {
    return safeAdapterFailure(
      safeDspActualTimeReadError,
      500,
      correctionResult.error,
    );
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

  const storedSummaries = asArray(data)
    .map(asRecord)
    .map(toAdminDriverJobDspActualTimeSummary)
    .filter((summary): summary is AdminDriverJobDspActualTimeSummary => Boolean(summary));
  const originalSummaries = correctionResult.summary
    ? storedSummaries.filter(
        (summary) =>
          !(
            summary.actual_time_status === "not_started" &&
            !summary.dsp_started_at &&
            summary.dsp_ended_at === correctionResult.summary?.dsp_ended_at
          ),
      )
    : storedSummaries;
  const summaries = correctionResult.summary
    ? [correctionResult.summary, ...originalSummaries].slice(0, parsed.data.limit)
    : await addPersistedDriverJcEndFallback(
        clientResult.data,
        parsed.data.booking_reference,
        originalSummaries,
      );

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

function normalizedDspBookingType(value: unknown) {
  return (textOrNull(value) || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function isDspBillingTimeCorrectionEligibleBooking(value: unknown) {
  const normalized = normalizedDspBookingType(value);

  return (
    normalized === "dsp" ||
    normalized === "hourly" ||
    normalized === "disposal" ||
    normalized.includes("hourly") ||
    normalized.includes("disposal")
  );
}

export async function saveAdminDriverJobDspBillingTimeCorrection(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverJobDspBillingTimeCorrectionResult>> {
  const parsed = parseAdminDriverJobDspBillingTimeCorrectionParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyAdminDriverJobDspActualTimeSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data: bookingData, error: bookingError } = await clientResult.data
    .from("bookings")
    .select(dspBillingTimeCorrectionBookingSelect)
    .eq("booking_reference", parsed.data.booking_reference)
    .limit(2);

  if (bookingError) {
    return safeAdapterFailure(
      safeDspBillingTimeCorrectionWriteError,
      500,
      bookingError,
    );
  }

  const bookingRows = asArray(bookingData).map(asRecord);
  const exactBooking = bookingRows.find(
    (row) => validBookingReference(row.booking_reference) === parsed.data.booking_reference,
  );

  if (!exactBooking || bookingRows.length !== 1) {
    return {
      error: "Exact saved DSP booking was not found.",
      ok: false,
      status: 404,
    };
  }

  if (!isDspBillingTimeCorrectionEligibleBooking(exactBooking.service_type)) {
    return {
      error: "DSP billing time correction is available only for a saved DSP job.",
      ok: false,
      status: 409,
    };
  }

  const { data: insertedData, error: insertError } = await clientResult.data
    .from("driver_job_dsp_actual_time_events")
    .insert({
      actor_label: actor.actor_label,
      actor_role: actor.actor_role,
      booking_reference: parsed.data.booking_reference,
      driver_job_link_id: null,
      event_type: "dsp_end",
      occurred_at: parsed.data.dsp_ended_at,
      safe_event_context: {
        actual_time_policy: "admin_billing_time_correction",
        billing_started_at: parsed.data.dsp_started_at,
      },
      safe_event_note: parsed.data.correction_reason,
      source_surface: "admin_api",
    })
    .select(dspBillingTimeCorrectionInsertSelect)
    .single();

  if (insertError) {
    return safeAdapterFailure(
      safeDspBillingTimeCorrectionWriteError,
      500,
      insertError,
    );
  }

  const correctedSummary = toAdminDspBillingTimeCorrectionSummary(
    asRecord(insertedData),
    parsed.data.booking_reference,
  );

  if (!correctedSummary) {
    return {
      error: safeDspBillingTimeCorrectionWriteError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: {
      booking_reference: parsed.data.booking_reference,
      corrected_summary: correctedSummary,
      version: adminDriverJobDspActualTimeReadVersion,
    },
    ok: true,
  };
}
