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

export const adminMonthlyInvoiceDraftPersistenceVersion =
  "stage-4a-monthly-invoice-draft-api-v1";

export const adminMonthlyInvoiceDraftStatuses = [
  "draft_planning",
  "pending_admin_review",
  "admin_reviewed",
  "manager_approval_needed",
  "manager_approved",
  "blocked",
  "archived",
] as const;

export const adminMonthlyInvoiceDraftReadinessStatuses = [
  "ready",
  "blocked",
  "mixed",
] as const;

export const adminMonthlyInvoiceDraftTripReadinessStatuses = [
  "ready",
  "blocked",
] as const;

export type AdminMonthlyInvoiceDraftStatus =
  (typeof adminMonthlyInvoiceDraftStatuses)[number];
export type AdminMonthlyInvoiceDraftReadinessStatus =
  (typeof adminMonthlyInvoiceDraftReadinessStatuses)[number];
export type AdminMonthlyInvoiceDraftTripReadinessStatus =
  (typeof adminMonthlyInvoiceDraftTripReadinessStatuses)[number];

export type AdminMonthlyInvoiceDraftSafeContext = {
  draft_summary?: string;
  next_action?: string;
  review_status?: string;
};

export type AdminMonthlyInvoiceDraftTripLinkInput = {
  billing_prep_readiness: string | null;
  booking_reference: string;
  closeout_id: string | null;
  closeout_status: string | null;
  safe_trip_context: Record<string, unknown>;
  trip_readiness_status: AdminMonthlyInvoiceDraftTripReadinessStatus;
};

export type AdminMonthlyInvoiceDraftInput = {
  billing_month: string;
  blocked_count: number;
  customer_account: string;
  customer_id: string | null;
  draft_status: AdminMonthlyInvoiceDraftStatus;
  linked_trips: AdminMonthlyInvoiceDraftTripLinkInput[];
  ready_count: number;
  readiness_status: AdminMonthlyInvoiceDraftReadinessStatus;
  safe_draft_note: string | null;
  safe_draft_context: AdminMonthlyInvoiceDraftSafeContext;
  source_grouping_summary: Record<string, unknown>;
  total_count: number;
};

export type AdminMonthlyInvoiceDraftUpdateInput = {
  billing_month: string | null;
  blocked_count: number | null;
  customer_account: string | null;
  draft_id: string | null;
  draft_status: AdminMonthlyInvoiceDraftStatus;
  ready_count: number | null;
  readiness_status: AdminMonthlyInvoiceDraftReadinessStatus | null;
  safe_draft_note: string | null;
  safe_draft_context: AdminMonthlyInvoiceDraftSafeContext | null;
  source_grouping_summary: Record<string, unknown> | null;
  total_count: number | null;
};

export type AdminMonthlyInvoiceDraftLoadParams = {
  billing_month: string | null;
  customer_account_search: string | null;
  draft_id: string | null;
  draft_status: AdminMonthlyInvoiceDraftStatus | null;
  limit: number;
  page: number;
  readiness_status: AdminMonthlyInvoiceDraftReadinessStatus | null;
};

export type AdminMonthlyInvoiceDraftTripLinkRecord =
  AdminMonthlyInvoiceDraftTripLinkInput & {
    created_at: string | null;
    draft_id: string;
    id: string | null;
    updated_at: string | null;
  };

export type AdminMonthlyInvoiceDraftRecord = Omit<
  AdminMonthlyInvoiceDraftInput,
  "linked_trips"
> & {
  actor_label: string | null;
  actor_role: "admin" | "dispatcher" | "system";
  created_at: string | null;
  id: string | null;
  linked_trips: AdminMonthlyInvoiceDraftTripLinkRecord[];
  source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
  updated_at: string | null;
};

export type AdminMonthlyInvoiceDraftPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_draft_count: number;
};

export type AdminMonthlyInvoiceDraftLoadResult = {
  invoice_drafts: AdminMonthlyInvoiceDraftRecord[];
  pagination: AdminMonthlyInvoiceDraftPagination;
  version: typeof adminMonthlyInvoiceDraftPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxCustomerAccountLength = 160;
const maxCustomerIdLength = 160;
const maxSearchLength = 80;
const maxSafeDraftNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxSafeJsonLength = 3000;
const maxDraftLimit = 250;
const defaultDraftLimit = 25;
const maxDraftPage = 1000;
const maxDraftCount = 10000;
const maxReadRows = 500;
const maxLinkedTrips = 250;
const invoiceDraftSelect =
  "id, customer_account, customer_id, billing_month, draft_status, readiness_status, ready_count, blocked_count, total_count, source_grouping_summary, safe_draft_note, safe_draft_context, source_surface, actor_role, actor_label, created_at, updated_at";
const invoiceDraftTripLinkSelect =
  "id, draft_id, booking_reference, closeout_id, trip_readiness_status, closeout_status, billing_prep_readiness, safe_trip_context, created_at, updated_at";
const disabledInvoiceDraftPersistenceError =
  "Admin monthly invoice draft persistence is not enabled on this server.";
const safeInvoiceDraftConfigError =
  "Admin monthly invoice draft persistence configuration is not ready.";
const safeInvoiceDraftActorError =
  "Admin monthly invoice draft persistence requires a verified internal boundary.";
const safeInvoiceDraftServerSessionActorError =
  "Admin monthly invoice draft persistence requires a verified admin or dispatcher server session.";
const safeInvoiceDraftSaveError = "Admin monthly invoice draft save failed safely.";
const safeInvoiceDraftLoadError = "Admin monthly invoice draft load failed safely.";
const safeInvoiceDraftUpdateError = "Admin monthly invoice draft update failed safely.";
const allowedDraftStatuses = new Set<string>(adminMonthlyInvoiceDraftStatuses);
const allowedReadinessStatuses = new Set<string>(
  adminMonthlyInvoiceDraftReadinessStatuses,
);
const allowedTripReadinessStatuses = new Set<string>(
  adminMonthlyInvoiceDraftTripReadinessStatuses,
);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedCreateFields = new Set([
  "billing_month",
  "blocked_count",
  "customer_account",
  "customer_id",
  "draft_status",
  "draft_summary",
  "linked_trips",
  "next_action",
  "ready_count",
  "readiness_status",
  "review_status",
  "safe_draft_note",
  "safe_draft_context",
  "source_grouping_summary",
  "total_count",
]);
const allowedUpdateFields = new Set([
  "billing_month",
  "blocked_count",
  "customer_account",
  "draft_id",
  "draft_status",
  "draft_summary",
  "next_action",
  "ready_count",
  "readiness_status",
  "review_status",
  "safe_draft_note",
  "safe_draft_context",
  "source_grouping_summary",
  "total_count",
]);
const allowedTripFields = new Set([
  "billing_prep_readiness",
  "booking_reference",
  "closeout_id",
  "closeout_status",
  "safe_trip_context",
  "trip_readiness_status",
]);
const allowedSafeContextFields = new Set([
  "draft_summary",
  "next_action",
  "review_status",
]);
const forbiddenInvoiceDraftFragments = [
  "amount_due",
  "auth_link",
  "bank_account",
  "card_number",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "dev_workbench",
  "driver_auth",
  "driver_payout",
  "email_send",
  "fare_amount",
  "final_invoice",
  "finance",
  "finance_note",
  "full_invoice_number",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "issued_invoice",
  "invoice_number",
  "invoice_pdf",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "notification_delivery",
  "paid_amount",
  "passenger_email",
  "passenger_phone",
  "payment",
  "payment_link",
  "payment_status",
  "paynow",
  "pay_now",
  "pdf",
  "pdf_link",
  "payout",
  "payout_comparison",
  "proof",
  "photo",
  "qa_archive",
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "service_role",
  "send_log",
  "send_state",
  "server_only",
  "server_secret",
  "sms_send",
  "stripe",
  "telegram",
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

function includesForbiddenInvoiceDraftFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenInvoiceDraftFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenInvoiceDraftResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin monthly invoice draft details include unsupported or unsafe fields.",
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
    const keyLeaks = includesForbiddenInvoiceDraftFragment(key) ? [currentPath] : [];

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

  return includesForbiddenInvoiceDraftFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenInvoiceDraftFragment(cleaned)) {
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

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxDraftCount ? parsed : null;
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

function validDraftId(value: unknown) {
  const cleaned = safeText(value, 80);

  return cleaned && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function validDraftStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedDraftStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftStatus)
    : null;
}

function validReadinessStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedReadinessStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftReadinessStatus)
    : null;
}

function validTripReadinessStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedTripReadinessStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftTripReadinessStatus)
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
  const reviewStatus = optionalSafeText(
    contextRecord.review_status ?? record.review_status,
    maxSafeContextTextLength,
  );

  if (
    ((contextRecord.draft_summary ?? record.draft_summary) && !draftSummary) ||
    ((contextRecord.next_action ?? record.next_action) && !nextAction) ||
    ((contextRecord.review_status ?? record.review_status) && !reviewStatus)
  ) {
    return null;
  }

  return {
    ...(draftSummary ? { draft_summary: draftSummary } : {}),
    ...(nextAction ? { next_action: nextAction } : {}),
    ...(reviewStatus ? { review_status: reviewStatus } : {}),
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
      error: safeInvoiceDraftActorError,
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
      error: safeInvoiceDraftServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyInvoiceDraftSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledInvoiceDraftPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeInvoiceDraftConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeInvoiceDraftConfigError,
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
      error: safeInvoiceDraftConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeTripLinkRecord(row: UnknownRecord): AdminMonthlyInvoiceDraftTripLinkRecord {
  return {
    billing_prep_readiness: textOrNull(row.billing_prep_readiness),
    booking_reference: textOrNull(row.booking_reference) || "",
    closeout_id: textOrNull(row.closeout_id),
    closeout_status: textOrNull(row.closeout_status),
    created_at: textOrNull(row.created_at),
    draft_id: textOrNull(row.draft_id) || "",
    id: textOrNull(row.id),
    safe_trip_context: asRecord(row.safe_trip_context),
    trip_readiness_status:
      validTripReadinessStatus(row.trip_readiness_status) || "blocked",
    updated_at: textOrNull(row.updated_at),
  };
}

function normalizeInvoiceDraftRecord(
  row: UnknownRecord,
  linkedTrips: AdminMonthlyInvoiceDraftTripLinkRecord[] = [],
): AdminMonthlyInvoiceDraftRecord {
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
    draft_status: validDraftStatus(row.draft_status) || "draft_planning",
    id: textOrNull(row.id),
    linked_trips: linkedTrips,
    ready_count: parseCount(row.ready_count) || 0,
    readiness_status: validReadinessStatus(row.readiness_status) || "mixed",
    safe_draft_note: textOrNull(row.safe_draft_note),
    safe_draft_context: asRecord(row.safe_draft_context) as AdminMonthlyInvoiceDraftSafeContext,
    source_grouping_summary: asRecord(row.source_grouping_summary),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    total_count: parseCount(row.total_count) || 0,
    updated_at: textOrNull(row.updated_at),
  };
}

function filterInvoiceDrafts(
  drafts: AdminMonthlyInvoiceDraftRecord[],
  params: AdminMonthlyInvoiceDraftLoadParams,
) {
  const search = params.customer_account_search?.toLowerCase() || "";

  return drafts.filter((draft) => {
    if (params.draft_id && draft.id !== params.draft_id) {
      return false;
    }

    if (params.billing_month && draft.billing_month !== params.billing_month) {
      return false;
    }

    if (search && !draft.customer_account.toLowerCase().includes(search)) {
      return false;
    }

    if (params.draft_status && draft.draft_status !== params.draft_status) {
      return false;
    }

    return !params.readiness_status || draft.readiness_status === params.readiness_status;
  });
}

function paginateInvoiceDrafts(
  drafts: AdminMonthlyInvoiceDraftRecord[],
  params: AdminMonthlyInvoiceDraftLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return drafts.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  drafts: AdminMonthlyInvoiceDraftRecord[],
  params: AdminMonthlyInvoiceDraftLoadParams,
): AdminMonthlyInvoiceDraftPagination {
  const pageCount = drafts.length > 0 ? Math.ceil(drafts.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_draft_count: drafts.length,
  };
}

function parseTripLink(value: unknown): AdminMonthlyInvoiceDraftTripLinkInput | null {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedTripFields, "linked_trips").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return null;
  }

  const bookingReference = safeText(record.booking_reference, 120);
  const closeoutId =
    record.closeout_id === undefined || record.closeout_id === null || record.closeout_id === ""
      ? null
      : validDraftId(record.closeout_id);
  const tripReadinessStatus =
    validTripReadinessStatus(record.trip_readiness_status) || "ready";
  const closeoutStatus = optionalSafeText(record.closeout_status, 80);
  const billingPrepReadiness = optionalSafeText(record.billing_prep_readiness, 80);
  const safeTripContext = safeObject(record.safe_trip_context, maxSafeJsonLength);

  if (
    !bookingReference ||
    (record.closeout_id && !closeoutId) ||
    (record.closeout_status && !closeoutStatus) ||
    (record.billing_prep_readiness && !billingPrepReadiness) ||
    !safeTripContext
  ) {
    return null;
  }

  return {
    billing_prep_readiness: billingPrepReadiness,
    booking_reference: bookingReference,
    closeout_id: closeoutId,
    closeout_status: closeoutStatus,
    safe_trip_context: safeTripContext,
    trip_readiness_status: tripReadinessStatus,
  };
}

export function parseAdminMonthlyInvoiceDraftLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyInvoiceDraftLoadParams> {
  const draftIdValue = readParamsValue(params, "draft_id");
  const draftId =
    draftIdValue === undefined || draftIdValue === null || draftIdValue === ""
      ? null
      : validDraftId(draftIdValue);

  if (draftIdValue && !draftId) {
    return {
      error: "Malformed monthly invoice draft id rejected.",
      ok: false,
      status: 400,
    };
  }

  const billingMonthValue = readParamsValue(params, "billing_month");
  const billingMonth =
    billingMonthValue === undefined || billingMonthValue === null || billingMonthValue === ""
      ? null
      : validBillingMonth(billingMonthValue);

  if (billingMonthValue && !billingMonth) {
    return {
      error: "Malformed monthly invoice draft billing_month rejected.",
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
      error: "Malformed monthly invoice draft customer/account search rejected.",
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
      error: "Malformed monthly invoice draft status rejected.",
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
      error: "Malformed monthly invoice draft readiness_status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(readParamsValue(params, "limit"), defaultDraftLimit, maxDraftLimit);

  if (!limit) {
    return {
      error: "Malformed monthly invoice draft limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxDraftPage);

  if (!page) {
    return {
      error: "Malformed monthly invoice draft page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      customer_account_search: customerAccountSearch,
      draft_id: draftId,
      draft_status: draftStatus,
      limit,
      page,
      readiness_status: readinessStatus,
    },
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceDraftCreatePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceDraftInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedCreateFields, "invoice_draft").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenInvoiceDraftResult();
  }

  const customerAccount = safeText(record.customer_account, maxCustomerAccountLength);
  const customerId = optionalSafeText(record.customer_id, maxCustomerIdLength);
  const billingMonth = validBillingMonth(record.billing_month);
  const draftStatus = validDraftStatus(record.draft_status) || "draft_planning";
  const readinessStatus = validReadinessStatus(record.readiness_status);
  const readyCount = parseCount(record.ready_count);
  const blockedCount = parseCount(record.blocked_count);
  const totalCount = parseCount(record.total_count);
  const sourceGroupingSummary = safeObject(record.source_grouping_summary, maxSafeJsonLength);
  const safeDraftContext = parseSafeContext(record);
  const safeDraftNote = optionalSafeText(record.safe_draft_note, maxSafeDraftNoteLength);
  const rawLinkedTrips = asArray(record.linked_trips);
  const linkedTrips = rawLinkedTrips.map(parseTripLink);

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
    !sourceGroupingSummary ||
    !safeDraftContext ||
    (hasOwn(record, "safe_draft_note") && record.safe_draft_note && !safeDraftNote) ||
    rawLinkedTrips.length > maxLinkedTrips ||
    linkedTrips.some((trip) => !trip)
  ) {
    return {
      error: "Admin monthly invoice draft details are malformed.",
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
      linked_trips: linkedTrips as AdminMonthlyInvoiceDraftTripLinkInput[],
      ready_count: readyCount,
      readiness_status: readinessStatus,
      safe_draft_note: safeDraftNote,
      safe_draft_context: safeDraftContext,
      source_grouping_summary: sourceGroupingSummary,
      total_count: totalCount,
    },
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceDraftUpdatePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceDraftUpdateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedUpdateFields, "invoice_draft_update").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenInvoiceDraftResult();
  }

  const draftId =
    record.draft_id === undefined || record.draft_id === null || record.draft_id === ""
      ? null
      : validDraftId(record.draft_id);
  const customerAccount =
    record.customer_account === undefined || record.customer_account === null || record.customer_account === ""
      ? null
      : safeText(record.customer_account, maxCustomerAccountLength);
  const billingMonth =
    record.billing_month === undefined || record.billing_month === null || record.billing_month === ""
      ? null
      : validBillingMonth(record.billing_month);
  const draftStatus = validDraftStatus(record.draft_status);
  const readinessStatus =
    record.readiness_status === undefined || record.readiness_status === null || record.readiness_status === ""
      ? null
      : validReadinessStatus(record.readiness_status);
  const readyCount =
    record.ready_count === undefined || record.ready_count === null || record.ready_count === ""
      ? null
      : parseCount(record.ready_count);
  const blockedCount =
    record.blocked_count === undefined || record.blocked_count === null || record.blocked_count === ""
      ? null
      : parseCount(record.blocked_count);
  const totalCount =
    record.total_count === undefined || record.total_count === null || record.total_count === ""
      ? null
      : parseCount(record.total_count);
  const sourceGroupingSummary =
    hasOwn(record, "source_grouping_summary")
      ? safeObject(record.source_grouping_summary, maxSafeJsonLength)
      : null;
  const safeDraftContext =
    hasOwn(record, "safe_draft_context") ||
    hasOwn(record, "draft_summary") ||
    hasOwn(record, "next_action") ||
    hasOwn(record, "review_status")
      ? parseSafeContext(record)
      : null;
  const safeDraftNote = optionalSafeText(record.safe_draft_note, maxSafeDraftNoteLength);

  if (
    (record.draft_id && !draftId) ||
    (!draftId && (!customerAccount || !billingMonth)) ||
    (record.customer_account && !customerAccount) ||
    (record.billing_month && !billingMonth) ||
    !draftStatus ||
    (record.readiness_status && !readinessStatus) ||
    (record.ready_count !== undefined && readyCount === null) ||
    (record.blocked_count !== undefined && blockedCount === null) ||
    (record.total_count !== undefined && totalCount === null) ||
    ((readyCount !== null || blockedCount !== null || totalCount !== null) &&
      (readyCount === null ||
        blockedCount === null ||
        totalCount === null ||
        totalCount !== readyCount + blockedCount)) ||
    (hasOwn(record, "source_grouping_summary") && !sourceGroupingSummary) ||
    ((hasOwn(record, "safe_draft_context") ||
      hasOwn(record, "draft_summary") ||
      hasOwn(record, "next_action") ||
      hasOwn(record, "review_status")) &&
      !safeDraftContext) ||
    (hasOwn(record, "safe_draft_note") && record.safe_draft_note && !safeDraftNote)
  ) {
    return {
      error: "Admin monthly invoice draft status update is malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      blocked_count: blockedCount,
      customer_account: customerAccount,
      draft_id: draftId,
      draft_status: draftStatus,
      ready_count: readyCount,
      readiness_status: readinessStatus,
      safe_draft_note: hasOwn(record, "safe_draft_note") ? safeDraftNote : null,
      safe_draft_context: safeDraftContext,
      source_grouping_summary: sourceGroupingSummary,
      total_count: totalCount,
    },
    ok: true,
  };
}

async function loadTripLinksForDrafts(
  client: SupabaseClient,
  draftIds: string[],
): Promise<AdminBookingResult<Map<string, AdminMonthlyInvoiceDraftTripLinkRecord[]>>> {
  if (draftIds.length === 0) {
    return {
      data: new Map(),
      ok: true,
    };
  }

  const { data, error } = await client
    .from("monthly_invoice_draft_trip_links")
    .select(invoiceDraftTripLinkSelect)
    .in("draft_id", draftIds);

  if (error) {
    return safeAdapterFailure(safeInvoiceDraftLoadError, 500, error);
  }

  const linksByDraft = new Map<string, AdminMonthlyInvoiceDraftTripLinkRecord[]>();

  for (const link of asArray(data).map(asRecord).map(normalizeTripLinkRecord)) {
    const existing = linksByDraft.get(link.draft_id) || [];

    existing.push(link);
    linksByDraft.set(link.draft_id, existing);
  }

  for (const links of linksByDraft.values()) {
    links.sort((first, second) => first.booking_reference.localeCompare(second.booking_reference));
  }

  return {
    data: linksByDraft,
    ok: true,
  };
}

export async function loadAdminMonthlyInvoiceDrafts(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceDraftLoadResult>> {
  const parsed = parseAdminMonthlyInvoiceDraftLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyInvoiceDraftSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_invoice_drafts")
    .select(invoiceDraftSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeInvoiceDraftLoadError, 500, error);
  }

  const baseDrafts = asArray(data)
    .map(asRecord)
    .map((row) => normalizeInvoiceDraftRecord(row))
    .sort(
      (first, second) =>
        first.customer_account.localeCompare(second.customer_account) ||
        first.billing_month.localeCompare(second.billing_month),
    );
  const filteredBaseDrafts = filterInvoiceDrafts(baseDrafts, parsed.data);
  const draftIds = filteredBaseDrafts
    .map((draft) => draft.id)
    .filter((id): id is string => !!id);
  const linksResult = await loadTripLinksForDrafts(clientResult.data, draftIds);

  if (!linksResult.ok) {
    return linksResult;
  }

  const draftsWithLinks = filteredBaseDrafts.map((draft) =>
    normalizeInvoiceDraftRecord(draft, draft.id ? linksResult.data.get(draft.id) || [] : []),
  );

  return {
    data: {
      invoice_drafts: paginateInvoiceDrafts(draftsWithLinks, parsed.data),
      pagination: buildPagination(draftsWithLinks, parsed.data),
      version: adminMonthlyInvoiceDraftPersistenceVersion,
    },
    ok: true,
  };
}

export async function createAdminMonthlyInvoiceDraftFromGroup(
  input: AdminMonthlyInvoiceDraftInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceDraftRecord>> {
  const clientResult = getServerOnlyInvoiceDraftSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    billing_month: input.billing_month,
    blocked_count: input.blocked_count,
    customer_account: input.customer_account,
    customer_id: input.customer_id,
    draft_status: input.draft_status,
    ready_count: input.ready_count,
    readiness_status: input.readiness_status,
    safe_draft_note: input.safe_draft_note,
    safe_draft_context: input.safe_draft_context,
    source_grouping_summary: input.source_grouping_summary,
    total_count: input.total_count,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("monthly_invoice_drafts")
    .upsert(payload, {
      onConflict: "customer_account,billing_month",
    })
    .select(invoiceDraftSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeInvoiceDraftSaveError, 500, error);
  }

  const draft = normalizeInvoiceDraftRecord(asRecord(data));

  if (!draft.id) {
    return {
      error: safeInvoiceDraftSaveError,
      ok: false,
      status: 500,
    };
  }

  const deleteResult = await clientResult.data
    .from("monthly_invoice_draft_trip_links")
    .delete()
    .eq("draft_id", draft.id);

  if (deleteResult.error) {
    return safeAdapterFailure(safeInvoiceDraftSaveError, 500, deleteResult.error);
  }

  if (input.linked_trips.length === 0) {
    return {
      data: {
        ...draft,
        linked_trips: [],
      },
      ok: true,
    };
  }

  const tripPayload = input.linked_trips.map((trip) => ({
    ...trip,
    draft_id: draft.id,
    updated_at: new Date().toISOString(),
  }));
  const insertResult = await clientResult.data
    .from("monthly_invoice_draft_trip_links")
    .insert(tripPayload)
    .select(invoiceDraftTripLinkSelect);

  if (insertResult.error) {
    return safeAdapterFailure(safeInvoiceDraftSaveError, 500, insertResult.error);
  }

  return {
    data: {
      ...draft,
      linked_trips: asArray(insertResult.data).map(asRecord).map(normalizeTripLinkRecord),
    },
    ok: true,
  };
}

export async function updateAdminMonthlyInvoiceDraftStatus(
  input: AdminMonthlyInvoiceDraftUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceDraftRecord>> {
  const clientResult = getServerOnlyInvoiceDraftSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const payload = {
    draft_status: input.draft_status,
    ...(input.readiness_status ? { readiness_status: input.readiness_status } : {}),
    ...(input.ready_count !== null ? { ready_count: input.ready_count } : {}),
    ...(input.blocked_count !== null ? { blocked_count: input.blocked_count } : {}),
    ...(input.total_count !== null ? { total_count: input.total_count } : {}),
    ...(input.source_grouping_summary
      ? { source_grouping_summary: input.source_grouping_summary }
      : {}),
    ...(input.safe_draft_context ? { safe_draft_context: input.safe_draft_context } : {}),
    ...(input.safe_draft_note !== null ? { safe_draft_note: input.safe_draft_note } : {}),
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  let updateQuery = clientResult.data.from("monthly_invoice_drafts").update(payload);

  updateQuery = input.draft_id
    ? updateQuery.eq("id", input.draft_id)
    : updateQuery
        .eq("customer_account", input.customer_account || "")
        .eq("billing_month", input.billing_month || "");

  const { data, error } = await updateQuery.select(invoiceDraftSelect).single();

  if (error) {
    return safeAdapterFailure(safeInvoiceDraftUpdateError, 500, error);
  }

  const draft = normalizeInvoiceDraftRecord(asRecord(data));
  const linksResult = await loadTripLinksForDrafts(
    clientResult.data,
    draft.id ? [draft.id] : [],
  );

  if (!linksResult.ok) {
    return linksResult;
  }

  return {
    data: normalizeInvoiceDraftRecord(
      draft,
      draft.id ? linksResult.data.get(draft.id) || [] : [],
    ),
    ok: true,
  };
}
