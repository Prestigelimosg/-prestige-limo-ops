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

export const adminMonthlyBillingDraftPlanPersistenceVersion =
  "stage-4a-monthly-billing-draft-plan-api-v1";

export const adminMonthlyBillingDraftStatuses = [
  "planning",
  "blocked",
  "ready_for_billing_draft_review",
  "archived",
] as const;

export const adminMonthlyBillingReadinessStatuses = ["ready", "blocked", "mixed"] as const;

export type AdminMonthlyBillingDraftStatus =
  (typeof adminMonthlyBillingDraftStatuses)[number];
export type AdminMonthlyBillingReadinessStatus =
  (typeof adminMonthlyBillingReadinessStatuses)[number];

export type AdminMonthlyBillingDraftPlanSafeContext = {
  draft_summary?: string;
  next_action?: string;
};

export type AdminMonthlyBillingDraftPlanInput = {
  billing_month: string;
  blocked_count: number;
  customer_account: string;
  customer_id: string | null;
  draft_status: AdminMonthlyBillingDraftStatus;
  ready_count: number;
  readiness_status: AdminMonthlyBillingReadinessStatus;
  safe_draft_context: AdminMonthlyBillingDraftPlanSafeContext;
  safe_draft_note: string | null;
  source_grouping_summary: Record<string, unknown>;
  total_count: number;
};

export type AdminMonthlyBillingDraftPlanLoadParams = {
  billing_month: string | null;
  customer_account_search: string | null;
  draft_status: AdminMonthlyBillingDraftStatus | null;
  limit: number;
  page: number;
  readiness_status: AdminMonthlyBillingReadinessStatus | null;
};

export type AdminMonthlyBillingDraftPlanRecord = AdminMonthlyBillingDraftPlanInput & {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  created_at: string | null;
  id: string | null;
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

export type AdminMonthlyBillingDraftPlanPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_plan_count: number;
};

export type AdminMonthlyBillingDraftPlanLoadResult = {
  draft_plans: AdminMonthlyBillingDraftPlanRecord[];
  pagination: AdminMonthlyBillingDraftPlanPagination;
  version: typeof adminMonthlyBillingDraftPlanPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxCustomerAccountLength = 160;
const maxCustomerIdLength = 160;
const maxSearchLength = 80;
const maxSafeDraftNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxSafeJsonLength = 2000;
const defaultDraftPlanLimit = 25;
const maxDraftPlanLimit = 250;
const maxDraftPlanPage = 1000;
const maxDraftPlanCount = 10000;
const maxReadRows = 500;
const draftPlanSelect =
  "id, customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledDraftPlanPersistenceError =
  "Admin monthly billing draft planning persistence is not enabled on this server.";
const safeDraftPlanConfigError =
  "Admin monthly billing draft planning persistence configuration is not ready.";
const safeDraftPlanActorError =
  "Admin monthly billing draft planning persistence requires a verified internal boundary.";
const safeDraftPlanServerSessionActorError =
  "Admin monthly billing draft planning persistence requires a verified admin or dispatcher server session.";
const safeDraftPlanSaveError =
  "Admin monthly billing draft planning save failed safely.";
const safeDraftPlanLoadError =
  "Admin monthly billing draft planning load failed safely.";
const allowedDraftStatuses = new Set<string>(adminMonthlyBillingDraftStatuses);
const allowedReadinessStatuses = new Set<string>(adminMonthlyBillingReadinessStatuses);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedTopLevelFields = new Set([
  "billing_month",
  "blocked_count",
  "customer_account",
  "customer_id",
  "draft_status",
  "draft_summary",
  "next_action",
  "ready_count",
  "readiness_status",
  "safe_draft_context",
  "safe_draft_note",
  "source_grouping_summary",
  "total_count",
]);
const allowedSafeContextFields = new Set(["draft_summary", "next_action"]);
const forbiddenDraftPlanFragments = [
  "customer_price",
  "customer_charge",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "amount_due",
  "billing_amount",
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
  "driver_payout",
  "payout",
  "payout_comparison",
  "finance",
  "finance_note",
  "internal_finance_note",
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
  "token",
  "secret",
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
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenDraftPlanFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenDraftPlanFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenDraftPlanResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin monthly billing draft planning details include unsupported or unsafe fields.",
    ok: false,
    status: 400,
  };
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
    const keyLeaks = includesForbiddenDraftPlanFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function findForbiddenTextValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.flatMap(findForbiddenTextValues);
  }

  if (value !== null && typeof value === "object") {
    return Object.values(value as UnknownRecord).flatMap(findForbiddenTextValues);
  }

  if (typeof value !== "string" && typeof value !== "number") {
    return [];
  }

  const text = String(value);

  return includesForbiddenDraftPlanFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenDraftPlanFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function optionalSafeText(value: unknown, maxLength: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return safeText(value, maxLength);
}

function parseCount(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxDraftPlanCount ? parsed : null;
}

function validBillingMonth(value: unknown) {
  const cleaned = textOrNull(value);
  const match = cleaned?.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? cleaned : null;
}

function validDraftStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedDraftStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyBillingDraftStatus)
    : null;
}

function validReadinessStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedReadinessStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyBillingReadinessStatus)
    : null;
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function safeObject(value: unknown, maxLength: number) {
  if (value === undefined || value === null) {
    return {};
  }

  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const text = JSON.stringify(value);

  if (
    text.length > maxLength ||
    findForbiddenFieldNames(value).length > 0 ||
    findForbiddenTextValues(value).length > 0
  ) {
    return null;
  }

  return value as Record<string, unknown>;
}

function parseSafeContext(record: UnknownRecord) {
  const contextRecord = asRecord(record.safe_draft_context);
  const unknownContextFields = unknownKeys(contextRecord, allowedSafeContextFields, "safe_draft_context");

  if (unknownContextFields.length > 0 || findForbiddenFieldNames(contextRecord).length > 0) {
    return null;
  }

  const draftSummary = optionalSafeText(
    contextRecord.draft_summary ?? record.draft_summary,
    maxSafeContextTextLength,
  );
  const nextAction = optionalSafeText(
    contextRecord.next_action ?? record.next_action,
    maxSafeContextTextLength,
  );

  if (
    ((contextRecord.draft_summary ?? record.draft_summary) && !draftSummary) ||
    ((contextRecord.next_action ?? record.next_action) && !nextAction)
  ) {
    return null;
  }

  return {
    ...(draftSummary ? { draft_summary: draftSummary } : {}),
    ...(nextAction ? { next_action: nextAction } : {}),
  };
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
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
      error: safeDraftPlanActorError,
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
      error: safeDraftPlanServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyDraftPlanSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledDraftPlanPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeDraftPlanConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeDraftPlanConfigError,
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
      error: safeDraftPlanConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeDraftPlanRecord(row: UnknownRecord): AdminMonthlyBillingDraftPlanRecord {
  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    billing_month: textOrNull(row.billing_month) || "",
    blocked_count: parseCount(row.blocked_count) || 0,
    created_at: textOrNull(row.created_at),
    customer_account: textOrNull(row.customer_account) || "",
    customer_id: textOrNull(row.customer_id),
    draft_status: validDraftStatus(row.draft_status) || "planning",
    id: textOrNull(row.id),
    ready_count: parseCount(row.ready_count) || 0,
    readiness_status: validReadinessStatus(row.readiness_status) || "mixed",
    safe_draft_context: asRecord(row.safe_draft_context) as AdminMonthlyBillingDraftPlanSafeContext,
    safe_draft_note: textOrNull(row.safe_draft_note),
    source_grouping_summary: asRecord(row.source_grouping_summary),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    total_count: parseCount(row.total_count) || 0,
    updated_at: textOrNull(row.updated_at),
  };
}

function filterDraftPlans(
  plans: AdminMonthlyBillingDraftPlanRecord[],
  params: AdminMonthlyBillingDraftPlanLoadParams,
) {
  const search = params.customer_account_search?.toLowerCase() || "";

  return plans.filter((plan) => {
    if (params.billing_month && plan.billing_month !== params.billing_month) {
      return false;
    }

    if (search && !plan.customer_account.toLowerCase().includes(search)) {
      return false;
    }

    if (params.draft_status && plan.draft_status !== params.draft_status) {
      return false;
    }

    return !params.readiness_status || plan.readiness_status === params.readiness_status;
  });
}

function paginateDraftPlans(
  plans: AdminMonthlyBillingDraftPlanRecord[],
  params: AdminMonthlyBillingDraftPlanLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return plans.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  plans: AdminMonthlyBillingDraftPlanRecord[],
  params: AdminMonthlyBillingDraftPlanLoadParams,
): AdminMonthlyBillingDraftPlanPagination {
  const pageCount = plans.length > 0 ? Math.ceil(plans.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_plan_count: plans.length,
  };
}

export function parseAdminMonthlyBillingDraftPlanLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyBillingDraftPlanLoadParams> {
  const billingMonthValue = readParamsValue(params, "billing_month");
  const billingMonth =
    billingMonthValue === undefined || billingMonthValue === null || billingMonthValue === ""
      ? null
      : validBillingMonth(billingMonthValue);

  if (billingMonthValue && !billingMonth) {
    return {
      error: "Malformed monthly billing draft planning billing_month rejected.",
      ok: false,
      status: 400,
    };
  }

  const searchValue =
    readParamsValue(params, "customer_account_search") ||
    readParamsValue(params, "customer_search") ||
    readParamsValue(params, "account_search");
  const customerAccountSearch =
    searchValue === undefined || searchValue === null || searchValue === ""
      ? null
      : safeText(searchValue, maxSearchLength);

  if (searchValue && !customerAccountSearch) {
    return {
      error: "Malformed monthly billing draft planning customer/account search rejected.",
      ok: false,
      status: 400,
    };
  }

  const draftStatusValue = readParamsValue(params, "draft_status");
  const draftStatus =
    draftStatusValue === undefined || draftStatusValue === null || draftStatusValue === ""
      ? null
      : validDraftStatus(draftStatusValue);

  if (draftStatusValue && !draftStatus) {
    return {
      error: "Malformed monthly billing draft planning draft_status rejected.",
      ok: false,
      status: 400,
    };
  }

  const readinessStatusValue = readParamsValue(params, "readiness_status");
  const readinessStatus =
    readinessStatusValue === undefined ||
    readinessStatusValue === null ||
    readinessStatusValue === ""
      ? null
      : validReadinessStatus(readinessStatusValue);

  if (readinessStatusValue && !readinessStatus) {
    return {
      error: "Malformed monthly billing draft planning readiness_status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(readParamsValue(params, "limit"), defaultDraftPlanLimit, maxDraftPlanLimit);

  if (!limit) {
    return {
      error: "Malformed monthly billing draft planning limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxDraftPlanPage);

  if (!page) {
    return {
      error: "Malformed monthly billing draft planning page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      customer_account_search: customerAccountSearch,
      draft_status: draftStatus,
      limit,
      page,
      readiness_status: readinessStatus,
    },
    ok: true,
  };
}

export function parseAdminMonthlyBillingDraftPlanSavePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyBillingDraftPlanInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedTopLevelFields, "draft_plan").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenDraftPlanResult();
  }

  const customerAccount = safeText(record.customer_account, maxCustomerAccountLength);
  const customerId = optionalSafeText(record.customer_id, maxCustomerIdLength);
  const billingMonth = validBillingMonth(record.billing_month);
  const draftStatus = validDraftStatus(record.draft_status);
  const readinessStatus = validReadinessStatus(record.readiness_status);
  const readyCount = parseCount(record.ready_count);
  const blockedCount = parseCount(record.blocked_count);
  const totalCount = parseCount(record.total_count);
  const sourceGroupingSummary = safeObject(
    record.source_grouping_summary,
    maxSafeJsonLength,
  );
  const safeDraftContext = parseSafeContext(record);
  const safeDraftNote = optionalSafeText(record.safe_draft_note, maxSafeDraftNoteLength);

  if (
    !customerAccount ||
    (hasOwn(record, "customer_id") && record.customer_id && !customerId) ||
    !billingMonth ||
    !draftStatus ||
    !readinessStatus ||
    readyCount === null ||
    blockedCount === null ||
    totalCount === null ||
    totalCount !== readyCount + blockedCount ||
    !hasOwn(record, "source_grouping_summary") ||
    !sourceGroupingSummary ||
    !safeDraftContext ||
    (hasOwn(record, "safe_draft_note") && record.safe_draft_note && !safeDraftNote)
  ) {
    return {
      error: "Admin monthly billing draft planning details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      blocked_count: blockedCount,
      customer_account: customerAccount,
      customer_id: customerId,
      draft_status: draftStatus,
      ready_count: readyCount,
      readiness_status: readinessStatus,
      safe_draft_context: safeDraftContext,
      safe_draft_note: safeDraftNote,
      source_grouping_summary: sourceGroupingSummary,
      total_count: totalCount,
    },
    ok: true,
  };
}

export async function loadAdminMonthlyBillingDraftPlans(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyBillingDraftPlanLoadResult>> {
  const parsed = parseAdminMonthlyBillingDraftPlanLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyDraftPlanSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_billing_draft_plans")
    .select(draftPlanSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeDraftPlanLoadError, 500, error);
  }

  const plans = asArray(data)
    .map(asRecord)
    .map(normalizeDraftPlanRecord)
    .sort(
      (first, second) =>
        first.customer_account.localeCompare(second.customer_account) ||
        first.billing_month.localeCompare(second.billing_month),
    );
  const filteredPlans = filterDraftPlans(plans, parsed.data);

  return {
    data: {
      draft_plans: paginateDraftPlans(filteredPlans, parsed.data),
      pagination: buildPagination(filteredPlans, parsed.data),
      version: adminMonthlyBillingDraftPlanPersistenceVersion,
    },
    ok: true,
  };
}

export async function saveAdminMonthlyBillingDraftPlan(
  input: AdminMonthlyBillingDraftPlanInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyBillingDraftPlanRecord>> {
  const clientResult = getServerOnlyDraftPlanSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    ...input,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("monthly_billing_draft_plans")
    .upsert(payload, {
      onConflict: "customer_account,billing_month",
    })
    .select(draftPlanSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeDraftPlanSaveError, 500, error);
  }

  return {
    data: normalizeDraftPlanRecord(asRecord(data)),
    ok: true,
  };
}
