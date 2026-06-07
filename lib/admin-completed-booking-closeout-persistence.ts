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

export const adminCompletedBookingCloseoutPersistenceVersion =
  "stage-4a-436-admin-completed-booking-closeout-api-v1";

export const adminCompletedBookingCloseoutStatuses = [
  "not_started",
  "needs_review",
  "ready_for_billing_prep",
  "closed",
] as const;

export const adminCompletedBookingCompletedJobStatuses = [
  "not_confirmed",
  "completed",
  "completion_exception",
  "needs_review",
] as const;

export const adminCompletedBookingDspActualHoursReadinessValues = [
  "not_applicable",
  "needs_review",
  "ready",
  "blocked",
] as const;

export const adminCompletedBookingExtraChargesReadinessValues = [
  "none",
  "needs_review",
  "ready",
  "blocked",
] as const;

export const adminCompletedBookingBillingPrepReadinessValues = [
  "not_ready",
  "ready",
  "blocked",
] as const;

export type AdminCompletedBookingCloseoutStatus =
  (typeof adminCompletedBookingCloseoutStatuses)[number];
export type AdminCompletedBookingCompletedJobStatus =
  (typeof adminCompletedBookingCompletedJobStatuses)[number];
export type AdminCompletedBookingDspActualHoursReadiness =
  (typeof adminCompletedBookingDspActualHoursReadinessValues)[number];
export type AdminCompletedBookingExtraChargesReadiness =
  (typeof adminCompletedBookingExtraChargesReadinessValues)[number];
export type AdminCompletedBookingBillingPrepReadiness =
  (typeof adminCompletedBookingBillingPrepReadinessValues)[number];

export type AdminCompletedBookingCloseoutSafeContext = {
  closeout_summary?: string;
  next_action?: string;
};

export type AdminCompletedBookingCloseoutInput = {
  billing_prep_readiness: AdminCompletedBookingBillingPrepReadiness;
  booking_reference: string;
  closeout_status: AdminCompletedBookingCloseoutStatus;
  completed_job_status: AdminCompletedBookingCompletedJobStatus;
  dsp_actual_hours_readiness: AdminCompletedBookingDspActualHoursReadiness;
  extra_charges_readiness: AdminCompletedBookingExtraChargesReadiness;
  safe_closeout_context: AdminCompletedBookingCloseoutSafeContext;
  safe_closeout_note: string | null;
};

export type AdminCompletedBookingCloseoutLoadInput = {
  booking_reference: string;
};

export type AdminCompletedBookingCloseoutRecord = AdminCompletedBookingCloseoutInput & {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  created_at: string | null;
  id: string | null;
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxSafeCloseoutNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxDbTextLength = 120;
const completedBookingCloseoutSelect =
  "id, booking_reference, closeout_status, completed_job_status, dsp_actual_hours_readiness, extra_charges_readiness, billing_prep_readiness, safe_closeout_note, safe_closeout_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledCompletedBookingCloseoutPersistenceError =
  "Admin completed booking closeout persistence is not enabled on this server.";
const safeCompletedBookingCloseoutSaveError =
  "Admin completed booking closeout save failed safely.";
const safeCompletedBookingCloseoutLoadError =
  "Admin completed booking closeout load failed safely.";
const safeCompletedBookingCloseoutConfigError =
  "Admin completed booking closeout persistence configuration is not ready.";
const safeCompletedBookingCloseoutActorError =
  "Admin completed booking closeout persistence requires a verified internal boundary.";
const safeCompletedBookingCloseoutServerSessionActorError =
  "Admin completed booking closeout persistence requires a verified admin or dispatcher server session.";
const allowedCloseoutStatusSet = new Set<string>(adminCompletedBookingCloseoutStatuses);
const allowedCompletedJobStatusSet = new Set<string>(
  adminCompletedBookingCompletedJobStatuses,
);
const allowedDspActualHoursReadinessSet = new Set<string>(
  adminCompletedBookingDspActualHoursReadinessValues,
);
const allowedExtraChargesReadinessSet = new Set<string>(
  adminCompletedBookingExtraChargesReadinessValues,
);
const allowedBillingPrepReadinessSet = new Set<string>(
  adminCompletedBookingBillingPrepReadinessValues,
);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedCloseoutTopLevelFields = new Set([
  "billing_prep_readiness",
  "booking_reference",
  "closeout_status",
  "closeout_summary",
  "completed_job_status",
  "dsp_actual_hours_readiness",
  "extra_charges_readiness",
  "next_action",
  "safe_closeout_context",
  "safe_closeout_note",
]);
const allowedSafeContextFields = new Set(["closeout_summary", "next_action"]);
const forbiddenCloseoutFragments = [
  "customer_price",
  "customer_charge",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "amount_due",
  "billing_account",
  "billing_amount",
  "billing_detail",
  "billing_rate",
  "invoice",
  "invoice_number",
  "payment",
  "payment_link",
  "pdf",
  "pdf_link",
  "stripe",
  "paynow",
  "pay_now",
  "pay_now_payout",
  "driver_payout",
  "payout",
  "payout_comparison",
  "finance",
  "finance_note",
  "finance_notes",
  "internal_finance_note",
  "internal_finance_notes",
  "notification",
  "notification_delivery",
  "send_state",
  "send_log",
  "whatsapp_send",
  "sms_send",
  "email_send",
  "telegram",
  "proof",
  "photo",
  "live_location",
  "auth_link",
  "customer_auth",
  "driver_auth",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "ai_prompt",
  "parser_prompt",
  "parser_learning",
  "parser_debug",
  "debug",
  "mock_archive",
  "mock_qa",
  "qa_archive",
  "dev_workbench",
  "mock_workbench",
  "service_role",
  "server_only",
  "server_secret",
  "internal_admin_note",
  "admin_note",
  "internal_note",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function hasOwn(record: UnknownRecord, key: string) {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function textOrNull(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenCloseoutFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenCloseoutFragments.some((fragment) => normalized.includes(fragment));
}

function findForbiddenFieldNames(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenFieldNames(item, `${path}[${index}]`));
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value as UnknownRecord).flatMap(([key, nestedValue]) => {
    const currentPath = path ? `${path}.${key}` : key;
    const keyLeaks = includesForbiddenCloseoutFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function forbiddenCompletedBookingCloseoutResult<T>(): AdminBookingResult<T> {
  return {
    error: "Forbidden completed booking closeout fields rejected.",
    ok: false,
    status: 400,
  };
}

function malformedCompletedBookingCloseoutResult<T>(error: string): AdminBookingResult<T> {
  return {
    error,
    ok: false,
    status: 400,
  };
}

function validBookingReference(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxBookingReferenceLength &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function validCloseoutStatus(value: unknown): AdminCompletedBookingCloseoutStatus | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedCloseoutStatusSet.has(cleaned)
    ? (cleaned as AdminCompletedBookingCloseoutStatus)
    : null;
}

function validCompletedJobStatus(
  value: unknown,
): AdminCompletedBookingCompletedJobStatus | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedCompletedJobStatusSet.has(cleaned)
    ? (cleaned as AdminCompletedBookingCompletedJobStatus)
    : null;
}

function validDspActualHoursReadiness(
  value: unknown,
): AdminCompletedBookingDspActualHoursReadiness | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedDspActualHoursReadinessSet.has(cleaned)
    ? (cleaned as AdminCompletedBookingDspActualHoursReadiness)
    : null;
}

function validExtraChargesReadiness(
  value: unknown,
): AdminCompletedBookingExtraChargesReadiness | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedExtraChargesReadinessSet.has(cleaned)
    ? (cleaned as AdminCompletedBookingExtraChargesReadiness)
    : null;
}

function validBillingPrepReadiness(
  value: unknown,
): AdminCompletedBookingBillingPrepReadiness | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedBillingPrepReadinessSet.has(cleaned)
    ? (cleaned as AdminCompletedBookingBillingPrepReadiness)
    : null;
}

function safeOptionalText(
  value: unknown,
  fieldLabel: string,
  maxLength: number,
): AdminBookingResult<string | null> {
  if (value === undefined || value === null || value === "") {
    return {
      data: null,
      ok: true,
    };
  }

  const cleaned = textOrNull(value);

  if (!cleaned) {
    return malformedCompletedBookingCloseoutResult(
      `Malformed completed booking closeout ${fieldLabel} rejected.`,
    );
  }

  if (cleaned.length > maxLength) {
    return malformedCompletedBookingCloseoutResult(
      `Completed booking closeout ${fieldLabel} is too long. Maximum allowed: ${maxLength}.`,
    );
  }

  if (includesForbiddenCloseoutFragment(cleaned)) {
    return forbiddenCompletedBookingCloseoutResult();
  }

  return {
    data: cleaned,
    ok: true,
  };
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function parseCloseoutSafeContext(
  body: UnknownRecord,
): AdminBookingResult<AdminCompletedBookingCloseoutSafeContext> {
  if (
    hasOwn(body, "safe_closeout_context") &&
    (body.safe_closeout_context === null ||
      typeof body.safe_closeout_context !== "object" ||
      Array.isArray(body.safe_closeout_context))
  ) {
    return malformedCompletedBookingCloseoutResult(
      "Malformed completed booking closeout safe context rejected.",
    );
  }

  const context = asRecord(body.safe_closeout_context);
  const contextUnknownKeys = unknownKeys(context, allowedSafeContextFields, "safe_closeout_context");

  if (contextUnknownKeys.length > 0) {
    return malformedCompletedBookingCloseoutResult(
      `Unknown completed booking closeout safe context fields rejected: ${contextUnknownKeys.join(", ")}`,
    );
  }

  const closeoutSummaryResult = safeOptionalText(
    hasOwn(body, "closeout_summary") ? body.closeout_summary : context.closeout_summary,
    "summary",
    maxSafeContextTextLength,
  );

  if (!closeoutSummaryResult.ok) {
    return closeoutSummaryResult;
  }

  const nextActionResult = safeOptionalText(
    hasOwn(body, "next_action") ? body.next_action : context.next_action,
    "next action",
    maxSafeContextTextLength,
  );

  if (!nextActionResult.ok) {
    return nextActionResult;
  }

  return {
    data: {
      ...(closeoutSummaryResult.data ? { closeout_summary: closeoutSummaryResult.data } : {}),
      ...(nextActionResult.data ? { next_action: nextActionResult.data } : {}),
    },
    ok: true,
  };
}

export function parseAdminCompletedBookingCloseoutSavePayload(
  value: unknown,
): AdminBookingResult<AdminCompletedBookingCloseoutInput> {
  const body = asRecord(value);
  const forbiddenFields = findForbiddenFieldNames(body);

  if (forbiddenFields.length > 0) {
    return forbiddenCompletedBookingCloseoutResult();
  }

  const rejectedUnknownKeys = unknownKeys(
    body,
    allowedCloseoutTopLevelFields,
    "completed_booking_closeout",
  );

  if (rejectedUnknownKeys.length > 0) {
    return malformedCompletedBookingCloseoutResult(
      `Unknown completed booking closeout fields rejected: ${rejectedUnknownKeys.join(", ")}`,
    );
  }

  const bookingReference = validBookingReference(body.booking_reference);

  if (!bookingReference) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout booking_reference.",
    );
  }

  const closeoutStatus = validCloseoutStatus(body.closeout_status);

  if (!closeoutStatus) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout closeout_status.",
    );
  }

  const completedJobStatus = validCompletedJobStatus(body.completed_job_status);

  if (!completedJobStatus) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout completed_job_status.",
    );
  }

  const dspActualHoursReadiness = validDspActualHoursReadiness(
    body.dsp_actual_hours_readiness,
  );

  if (!dspActualHoursReadiness) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout dsp_actual_hours_readiness.",
    );
  }

  const extraChargesReadiness = validExtraChargesReadiness(body.extra_charges_readiness);

  if (!extraChargesReadiness) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout extra_charges_readiness.",
    );
  }

  const billingPrepReadiness = validBillingPrepReadiness(body.billing_prep_readiness);

  if (!billingPrepReadiness) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout billing_prep_readiness.",
    );
  }

  const safeCloseoutNoteResult = safeOptionalText(
    body.safe_closeout_note,
    "note",
    maxSafeCloseoutNoteLength,
  );

  if (!safeCloseoutNoteResult.ok) {
    return safeCloseoutNoteResult;
  }

  const contextResult = parseCloseoutSafeContext(body);

  if (!contextResult.ok) {
    return contextResult;
  }

  return {
    data: {
      billing_prep_readiness: billingPrepReadiness,
      booking_reference: bookingReference,
      closeout_status: closeoutStatus,
      completed_job_status: completedJobStatus,
      dsp_actual_hours_readiness: dspActualHoursReadiness,
      extra_charges_readiness: extraChargesReadiness,
      safe_closeout_context: contextResult.data,
      safe_closeout_note: safeCloseoutNoteResult.data,
    },
    ok: true,
  };
}

export function parseAdminCompletedBookingCloseoutLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminCompletedBookingCloseoutLoadInput> {
  const bookingReference = validBookingReference(readParamsValue(params, "booking_reference"));

  if (!bookingReference) {
    return malformedCompletedBookingCloseoutResult(
      "Missing or malformed completed booking closeout booking_reference.",
    );
  }

  return {
    data: {
      booking_reference: bookingReference,
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
      error: safeCompletedBookingCloseoutActorError,
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
      error: safeCompletedBookingCloseoutServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyCompletedBookingCloseoutSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledCompletedBookingCloseoutPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeCompletedBookingCloseoutConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeCompletedBookingCloseoutConfigError,
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
      error: safeCompletedBookingCloseoutConfigError,
      ok: false,
      status: 503,
    };
  }
}

function actorRoleForDb(actor: AdminBookingPersistenceAdapterActor) {
  return actor.actor_role === "dispatcher" ? "dispatcher" : "admin";
}

function safeContextToDb(context: AdminCompletedBookingCloseoutSafeContext) {
  return {
    ...(context.closeout_summary ? { closeout_summary: context.closeout_summary } : {}),
    ...(context.next_action ? { next_action: context.next_action } : {}),
  };
}

function safeTextFromDb(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenCloseoutFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeContextFromDb(value: unknown): AdminCompletedBookingCloseoutSafeContext {
  const record = asRecord(value);
  const closeoutSummary = safeTextFromDb(record.closeout_summary, maxSafeContextTextLength);
  const nextAction = safeTextFromDb(record.next_action, maxSafeContextTextLength);

  return {
    ...(closeoutSummary ? { closeout_summary: closeoutSummary } : {}),
    ...(nextAction ? { next_action: nextAction } : {}),
  };
}

function toCompletedBookingCloseoutRecord(
  row: UnknownRecord,
): AdminCompletedBookingCloseoutRecord | null {
  const bookingReference = validBookingReference(row.booking_reference);
  const closeoutStatus = validCloseoutStatus(row.closeout_status);
  const completedJobStatus = validCompletedJobStatus(row.completed_job_status);
  const dspActualHoursReadiness = validDspActualHoursReadiness(
    row.dsp_actual_hours_readiness,
  );
  const extraChargesReadiness = validExtraChargesReadiness(row.extra_charges_readiness);
  const billingPrepReadiness = validBillingPrepReadiness(row.billing_prep_readiness);
  const sourceSurface = textOrNull(row.source_surface);
  const actorRole = textOrNull(row.actor_role);

  if (
    !bookingReference ||
    !closeoutStatus ||
    !completedJobStatus ||
    !dspActualHoursReadiness ||
    !extraChargesReadiness ||
    !billingPrepReadiness ||
    !sourceSurface ||
    !allowedSourceSurfaces.has(sourceSurface) ||
    !actorRole ||
    !allowedActorRoles.has(actorRole)
  ) {
    return null;
  }

  return {
    actor_label: safeTextFromDb(row.actor_label, maxDbTextLength),
    actor_role: actorRole as AdminCompletedBookingCloseoutRecord["actor_role"],
    billing_prep_readiness: billingPrepReadiness,
    booking_reference: bookingReference,
    closeout_status: closeoutStatus,
    completed_job_status: completedJobStatus,
    created_at: safeTextFromDb(row.created_at, maxDbTextLength),
    dsp_actual_hours_readiness: dspActualHoursReadiness,
    extra_charges_readiness: extraChargesReadiness,
    id: safeTextFromDb(row.id, maxDbTextLength),
    safe_closeout_context: safeContextFromDb(row.safe_closeout_context),
    safe_closeout_note: safeTextFromDb(row.safe_closeout_note, maxSafeCloseoutNoteLength),
    source_surface: sourceSurface as AdminCompletedBookingCloseoutRecord["source_surface"],
    updated_at: safeTextFromDb(row.updated_at, maxDbTextLength),
  };
}

export async function saveAdminCompletedBookingCloseout(
  input: AdminCompletedBookingCloseoutInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCompletedBookingCloseoutRecord>> {
  const parsed = parseAdminCompletedBookingCloseoutSavePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyCompletedBookingCloseoutSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const row = {
    actor_label: textOrNull(actor.actor_label),
    actor_role: actorRoleForDb(actor),
    billing_prep_readiness: parsed.data.billing_prep_readiness,
    booking_reference: parsed.data.booking_reference,
    closeout_status: parsed.data.closeout_status,
    completed_job_status: parsed.data.completed_job_status,
    dsp_actual_hours_readiness: parsed.data.dsp_actual_hours_readiness,
    extra_charges_readiness: parsed.data.extra_charges_readiness,
    safe_closeout_context: safeContextToDb(parsed.data.safe_closeout_context),
    safe_closeout_note: parsed.data.safe_closeout_note,
    source_surface: "admin_api",
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("completed_booking_closeouts")
    .upsert(row, { onConflict: "booking_reference" })
    .select(completedBookingCloseoutSelect)
    .single();
  const record = toCompletedBookingCloseoutRecord(asRecord(data));

  if (error || !record) {
    return safeAdapterFailure(safeCompletedBookingCloseoutSaveError, 500, error);
  }

  return {
    data: record,
    ok: true,
  };
}

export async function loadAdminCompletedBookingCloseout(
  input: AdminCompletedBookingCloseoutLoadInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCompletedBookingCloseoutRecord | null>> {
  const parsed = parseAdminCompletedBookingCloseoutLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyCompletedBookingCloseoutSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("completed_booking_closeouts")
    .select(completedBookingCloseoutSelect)
    .eq("booking_reference", parsed.data.booking_reference);

  if (error) {
    return safeAdapterFailure(safeCompletedBookingCloseoutLoadError, 500, error);
  }

  const record = asArray(data)
    .map(asRecord)
    .map(toCompletedBookingCloseoutRecord)
    .find((candidate): candidate is AdminCompletedBookingCloseoutRecord =>
      Boolean(candidate),
    );

  return {
    data: record || null,
    ok: true,
  };
}
