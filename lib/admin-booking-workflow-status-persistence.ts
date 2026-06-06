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

export const adminBookingWorkflowStatusPersistenceVersion =
  "stage-4a-429-admin-workflow-status-api-v1";

export const adminBookingWorkflowAreas = [
  "admin_booking_review",
  "dispatch_release",
  "driver_acknowledgement",
  "driver_job_progress",
  "day_of_trip_exception",
  "dispatch_recovery",
  "trip_completion",
  "closeout_review",
] as const;

export const adminBookingWorkflowStatusValues = [
  "not_started",
  "needs_review",
  "ready",
  "released",
  "pending_acknowledgement",
  "acknowledged",
  "no_response_needs_call",
  "otw",
  "ots",
  "pob",
  "completed",
  "exception_open",
  "recovery_review",
  "closed",
] as const;

export type AdminBookingWorkflowArea = (typeof adminBookingWorkflowAreas)[number];
export type AdminBookingWorkflowStatusValue =
  (typeof adminBookingWorkflowStatusValues)[number];

export type AdminBookingWorkflowStatusSafeContext = {
  next_action?: string;
  safe_note?: string;
};

export type AdminBookingWorkflowStatusInput = {
  booking_reference: string;
  safe_status_context: AdminBookingWorkflowStatusSafeContext;
  status_label: string | null;
  status_value: AdminBookingWorkflowStatusValue;
  workflow_area: AdminBookingWorkflowArea;
};

export type AdminBookingWorkflowStatusLoadInput = {
  booking_reference: string;
  workflow_area?: AdminBookingWorkflowArea;
};

export type AdminBookingWorkflowStatusRecord = AdminBookingWorkflowStatusInput & {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  created_at: string | null;
  id: string | null;
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxSafeNoteLength = 500;
const maxStatusLabelLength = 120;
const workflowStatusSelect =
  "id, booking_reference, workflow_area, status_value, status_label, source_surface, actor_role, actor_label, safe_status_context, created_at, updated_at";
const disabledWorkflowStatusPersistenceError =
  "Admin booking workflow status persistence is not enabled on this server.";
const safeWorkflowStatusSaveError =
  "Admin booking workflow status save failed safely.";
const safeWorkflowStatusLoadError =
  "Admin booking workflow status load failed safely.";
const safeWorkflowStatusConfigError =
  "Admin booking workflow status persistence configuration is not ready.";
const safeWorkflowStatusActorError =
  "Admin booking workflow status persistence requires a verified internal boundary.";
const safeWorkflowStatusServerSessionActorError =
  "Admin booking workflow status persistence requires a verified admin or dispatcher server session.";
const allowedWorkflowAreaSet = new Set<string>(adminBookingWorkflowAreas);
const allowedWorkflowStatusValueSet = new Set<string>(adminBookingWorkflowStatusValues);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedWorkflowStatusTopLevelFields = new Set([
  "booking_reference",
  "next_action",
  "safe_note",
  "safe_status_context",
  "status_label",
  "status_value",
  "workflow_area",
]);
const allowedSafeContextFields = new Set(["next_action", "safe_note"]);
const forbiddenWorkflowStatusFragments = [
  "customer_price",
  "customer_charge",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "amount_due",
  "billing",
  "billing_automation",
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
  "manual_extra_charge",
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

function includesForbiddenWorkflowStatusFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenWorkflowStatusFragments.some((fragment) => normalized.includes(fragment));
}

function isForbiddenFieldName(value: string) {
  return includesForbiddenWorkflowStatusFragment(value);
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
    const keyLeaks = isForbiddenFieldName(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function forbiddenWorkflowStatusResult<T>(): AdminBookingResult<T> {
  return {
    error: "Forbidden workflow status fields rejected.",
    ok: false,
    status: 400,
  };
}

function malformedWorkflowStatusResult<T>(error: string): AdminBookingResult<T> {
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

function validWorkflowArea(value: unknown): AdminBookingWorkflowArea | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedWorkflowAreaSet.has(cleaned)
    ? (cleaned as AdminBookingWorkflowArea)
    : null;
}

function validWorkflowStatusValue(value: unknown): AdminBookingWorkflowStatusValue | null {
  const cleaned = textOrNull(value);

  return cleaned && allowedWorkflowStatusValueSet.has(cleaned)
    ? (cleaned as AdminBookingWorkflowStatusValue)
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
    return malformedWorkflowStatusResult(`Malformed workflow status ${fieldLabel} rejected.`);
  }

  if (cleaned.length > maxLength) {
    return malformedWorkflowStatusResult(
      `Workflow status ${fieldLabel} is too long. Maximum allowed: ${maxLength}.`,
    );
  }

  if (includesForbiddenWorkflowStatusFragment(cleaned)) {
    return forbiddenWorkflowStatusResult();
  }

  return {
    data: cleaned,
    ok: true,
  };
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function parseWorkflowStatusSafeContext(
  body: UnknownRecord,
): AdminBookingResult<AdminBookingWorkflowStatusSafeContext> {
  if (
    hasOwn(body, "safe_status_context") &&
    (body.safe_status_context === null ||
      typeof body.safe_status_context !== "object" ||
      Array.isArray(body.safe_status_context))
  ) {
    return malformedWorkflowStatusResult("Malformed workflow status safe context rejected.");
  }

  const context = asRecord(body.safe_status_context);
  const contextUnknownKeys = unknownKeys(context, allowedSafeContextFields, "safe_status_context");

  if (contextUnknownKeys.length > 0) {
    return malformedWorkflowStatusResult(
      `Unknown workflow status safe context fields rejected: ${contextUnknownKeys.join(", ")}`,
    );
  }

  const safeNoteResult = safeOptionalText(
    hasOwn(body, "safe_note") ? body.safe_note : context.safe_note,
    "safe note",
    maxSafeNoteLength,
  );

  if (!safeNoteResult.ok) {
    return safeNoteResult;
  }

  const nextActionResult = safeOptionalText(
    hasOwn(body, "next_action") ? body.next_action : context.next_action,
    "next action",
    maxSafeNoteLength,
  );

  if (!nextActionResult.ok) {
    return nextActionResult;
  }

  return {
    data: {
      ...(nextActionResult.data ? { next_action: nextActionResult.data } : {}),
      ...(safeNoteResult.data ? { safe_note: safeNoteResult.data } : {}),
    },
    ok: true,
  };
}

export function parseAdminBookingWorkflowStatusSavePayload(
  value: unknown,
): AdminBookingResult<AdminBookingWorkflowStatusInput> {
  const body = asRecord(value);
  const forbiddenFields = findForbiddenFieldNames(body);

  if (forbiddenFields.length > 0) {
    return forbiddenWorkflowStatusResult();
  }

  const rejectedUnknownKeys = unknownKeys(
    body,
    allowedWorkflowStatusTopLevelFields,
    "workflow_status",
  );

  if (rejectedUnknownKeys.length > 0) {
    return malformedWorkflowStatusResult(
      `Unknown workflow status fields rejected: ${rejectedUnknownKeys.join(", ")}`,
    );
  }

  const bookingReference = validBookingReference(body.booking_reference);

  if (!bookingReference) {
    return malformedWorkflowStatusResult("Missing or malformed workflow status booking_reference.");
  }

  const workflowArea = validWorkflowArea(body.workflow_area);

  if (!workflowArea) {
    return malformedWorkflowStatusResult("Missing or malformed workflow status workflow_area.");
  }

  const statusValue = validWorkflowStatusValue(body.status_value);

  if (!statusValue) {
    return malformedWorkflowStatusResult("Missing or malformed workflow status status_value.");
  }

  const statusLabelResult = safeOptionalText(
    body.status_label,
    "label",
    maxStatusLabelLength,
  );

  if (!statusLabelResult.ok) {
    return statusLabelResult;
  }

  const contextResult = parseWorkflowStatusSafeContext(body);

  if (!contextResult.ok) {
    return contextResult;
  }

  return {
    data: {
      booking_reference: bookingReference,
      safe_status_context: contextResult.data,
      status_label: statusLabelResult.data,
      status_value: statusValue,
      workflow_area: workflowArea,
    },
    ok: true,
  };
}

export function parseAdminBookingWorkflowStatusLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminBookingWorkflowStatusLoadInput> {
  const bookingReference = validBookingReference(readParamsValue(params, "booking_reference"));

  if (!bookingReference) {
    return malformedWorkflowStatusResult("Missing or malformed workflow status booking_reference.");
  }

  const workflowAreaValue = readParamsValue(params, "workflow_area");
  const workflowArea = workflowAreaValue ? validWorkflowArea(workflowAreaValue) : null;

  if (workflowAreaValue && !workflowArea) {
    return malformedWorkflowStatusResult("Malformed workflow status workflow_area.");
  }

  return {
    data: {
      booking_reference: bookingReference,
      ...(workflowArea ? { workflow_area: workflowArea } : {}),
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
      error: safeWorkflowStatusActorError,
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
      error: safeWorkflowStatusServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyWorkflowStatusSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledWorkflowStatusPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeWorkflowStatusConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeWorkflowStatusConfigError,
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
      error: safeWorkflowStatusConfigError,
      ok: false,
      status: 503,
    };
  }
}

function actorRoleForDb(actor: AdminBookingPersistenceAdapterActor) {
  return actor.actor_role === "dispatcher" ? "dispatcher" : "admin";
}

function safeContextToDb(context: AdminBookingWorkflowStatusSafeContext) {
  return {
    ...(context.next_action ? { next_action: context.next_action } : {}),
    ...(context.safe_note ? { safe_note: context.safe_note } : {}),
  };
}

function safeTextFromDb(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenWorkflowStatusFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeContextFromDb(value: unknown): AdminBookingWorkflowStatusSafeContext {
  const record = asRecord(value);
  const safeNote = safeTextFromDb(record.safe_note, maxSafeNoteLength);
  const nextAction = safeTextFromDb(record.next_action, maxSafeNoteLength);

  return {
    ...(nextAction ? { next_action: nextAction } : {}),
    ...(safeNote ? { safe_note: safeNote } : {}),
  };
}

function toWorkflowStatusRecord(row: UnknownRecord): AdminBookingWorkflowStatusRecord | null {
  const bookingReference = validBookingReference(row.booking_reference);
  const workflowArea = validWorkflowArea(row.workflow_area);
  const statusValue = validWorkflowStatusValue(row.status_value);
  const sourceSurface = textOrNull(row.source_surface);
  const actorRole = textOrNull(row.actor_role);

  if (
    !bookingReference ||
    !workflowArea ||
    !statusValue ||
    !sourceSurface ||
    !allowedSourceSurfaces.has(sourceSurface) ||
    !actorRole ||
    !allowedActorRoles.has(actorRole)
  ) {
    return null;
  }

  return {
    actor_label: safeTextFromDb(row.actor_label, maxStatusLabelLength),
    actor_role: actorRole as AdminBookingWorkflowStatusRecord["actor_role"],
    booking_reference: bookingReference,
    created_at: safeTextFromDb(row.created_at, maxStatusLabelLength),
    id: safeTextFromDb(row.id, maxStatusLabelLength),
    safe_status_context: safeContextFromDb(row.safe_status_context),
    source_surface: sourceSurface as AdminBookingWorkflowStatusRecord["source_surface"],
    status_label: safeTextFromDb(row.status_label, maxStatusLabelLength),
    status_value: statusValue,
    updated_at: safeTextFromDb(row.updated_at, maxStatusLabelLength),
    workflow_area: workflowArea,
  };
}

export async function saveAdminBookingWorkflowStatus(
  input: AdminBookingWorkflowStatusInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingWorkflowStatusRecord>> {
  const parsed = parseAdminBookingWorkflowStatusSavePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyWorkflowStatusSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const row = {
    actor_label: textOrNull(actor.actor_label),
    actor_role: actorRoleForDb(actor),
    booking_reference: parsed.data.booking_reference,
    safe_status_context: safeContextToDb(parsed.data.safe_status_context),
    source_surface: "admin_api",
    status_label: parsed.data.status_label,
    status_value: parsed.data.status_value,
    updated_at: new Date().toISOString(),
    workflow_area: parsed.data.workflow_area,
  };
  const { data, error } = await clientResult.data
    .from("booking_workflow_statuses")
    .upsert(row, { onConflict: "booking_reference,workflow_area" })
    .select(workflowStatusSelect)
    .single();
  const record = toWorkflowStatusRecord(asRecord(data));

  if (error || !record) {
    return safeAdapterFailure(safeWorkflowStatusSaveError, 500, error);
  }

  return {
    data: record,
    ok: true,
  };
}

export async function loadAdminBookingWorkflowStatuses(
  input: AdminBookingWorkflowStatusLoadInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingWorkflowStatusRecord[]>> {
  const parsed = parseAdminBookingWorkflowStatusLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyWorkflowStatusSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  let query = clientResult.data
    .from("booking_workflow_statuses")
    .select(workflowStatusSelect)
    .eq("booking_reference", parsed.data.booking_reference)
    .order("workflow_area", { ascending: true });

  if (parsed.data.workflow_area) {
    query = query.eq("workflow_area", parsed.data.workflow_area);
  }

  const { data, error } = await query;

  if (error) {
    return safeAdapterFailure(safeWorkflowStatusLoadError, 500, error);
  }

  return {
    data: asArray(data)
      .map(asRecord)
      .map(toWorkflowStatusRecord)
      .filter((record): record is AdminBookingWorkflowStatusRecord => Boolean(record)),
    ok: true,
  };
}
