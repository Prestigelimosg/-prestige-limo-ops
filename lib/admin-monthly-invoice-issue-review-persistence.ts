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
import { assertAdminMonthlyInvoiceDraftUnlocked } from "./admin-monthly-invoice-draft-lock-enforcement";

export const adminMonthlyInvoiceIssueReviewPersistenceVersion =
  "stage-monthly-invoice-issue-review-api-v1";

export const adminMonthlyInvoiceIssueReviewStatuses = [
  "issue_review_pending",
  "manager_review_required",
  "manager_reviewed",
  "ready_for_future_issue",
  "blocked",
  "archived",
] as const;

export const adminMonthlyInvoiceIssueReviewReadinessStatuses = [
  "ready",
  "blocked",
  "mixed",
] as const;

export type AdminMonthlyInvoiceIssueReviewStatus =
  (typeof adminMonthlyInvoiceIssueReviewStatuses)[number];
export type AdminMonthlyInvoiceIssueReviewReadinessStatus =
  (typeof adminMonthlyInvoiceIssueReviewReadinessStatuses)[number];

export type AdminMonthlyInvoiceIssueReviewSafeContext = {
  issue_summary?: string;
  next_action?: string;
  review_status?: string;
};

export type AdminMonthlyInvoiceIssueReviewInput = {
  billing_month: string;
  blocked_count: number;
  customer_account: string;
  draft_id: string;
  draft_status_snapshot: string;
  issue_review_status: AdminMonthlyInvoiceIssueReviewStatus;
  ready_count: number;
  readiness_status: AdminMonthlyInvoiceIssueReviewReadinessStatus;
  safe_issue_context: AdminMonthlyInvoiceIssueReviewSafeContext;
  safe_issue_note: string | null;
  source_draft_summary: Record<string, unknown>;
  total_count: number;
};

export type AdminMonthlyInvoiceIssueReviewUpdateInput = {
  billing_month: string | null;
  blocked_count: number | null;
  customer_account: string | null;
  draft_id: string | null;
  draft_status_snapshot: string | null;
  issue_review_status: AdminMonthlyInvoiceIssueReviewStatus;
  ready_count: number | null;
  readiness_status: AdminMonthlyInvoiceIssueReviewReadinessStatus | null;
  safe_issue_context: AdminMonthlyInvoiceIssueReviewSafeContext | null;
  safe_issue_note: string | null;
  source_draft_summary: Record<string, unknown> | null;
  total_count: number | null;
};

export type AdminMonthlyInvoiceIssueReviewLoadParams = {
  billing_month: string | null;
  customer_account_search: string | null;
  draft_id: string | null;
  issue_review_status: AdminMonthlyInvoiceIssueReviewStatus | null;
  limit: number;
  page: number;
  readiness_status: AdminMonthlyInvoiceIssueReviewReadinessStatus | null;
};

export type AdminMonthlyInvoiceIssueReviewRecord =
  AdminMonthlyInvoiceIssueReviewInput & {
    actor_label: string | null;
    actor_role: "admin" | "dispatcher" | "system";
    created_at: string | null;
    id: string | null;
    source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
    updated_at: string | null;
  };

export type AdminMonthlyInvoiceIssueReviewPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_review_count: number;
};

export type AdminMonthlyInvoiceIssueReviewLoadResult = {
  issue_reviews: AdminMonthlyInvoiceIssueReviewRecord[];
  pagination: AdminMonthlyInvoiceIssueReviewPagination;
  version: typeof adminMonthlyInvoiceIssueReviewPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxCustomerAccountLength = 160;
const maxSearchLength = 80;
const maxSafeIssueNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxSafeJsonLength = 3000;
const maxIssueReviewLimit = 250;
const defaultIssueReviewLimit = 25;
const maxIssueReviewPage = 1000;
const maxIssueReviewCount = 10000;
const maxReadRows = 500;
const invoiceIssueReviewSelect =
  "id, draft_id, customer_account, billing_month, draft_status_snapshot, issue_review_status, readiness_status, ready_count, blocked_count, total_count, source_draft_summary, safe_issue_note, safe_issue_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledIssueReviewPersistenceError =
  "Admin monthly invoice issue review persistence is not enabled on this server.";
const safeIssueReviewConfigError =
  "Admin monthly invoice issue review persistence configuration is not ready.";
const safeIssueReviewActorError =
  "Admin monthly invoice issue review persistence requires a verified internal boundary.";
const safeIssueReviewServerSessionActorError =
  "Admin monthly invoice issue review persistence requires a verified admin or dispatcher server session.";
const safeIssueReviewSaveError =
  "Admin monthly invoice issue review save failed safely.";
const safeIssueReviewLoadError =
  "Admin monthly invoice issue review load failed safely.";
const safeIssueReviewUpdateError =
  "Admin monthly invoice issue review update failed safely.";
const allowedIssueReviewStatuses = new Set<string>(
  adminMonthlyInvoiceIssueReviewStatuses,
);
const allowedReadinessStatuses = new Set<string>(
  adminMonthlyInvoiceIssueReviewReadinessStatuses,
);
const allowedDraftStatusSnapshots = new Set([
  "draft_planning",
  "pending_admin_review",
  "admin_reviewed",
  "manager_approval_needed",
  "manager_approved",
  "blocked",
  "archived",
]);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedReadParams = new Set([
  "billing_month",
  "customer_account_search",
  "customer_search",
  "account_search",
  "draft_id",
  "issue_review_status",
  "limit",
  "page",
  "readiness_status",
]);
const allowedCreateFields = new Set([
  "billing_month",
  "blocked_count",
  "customer_account",
  "draft_id",
  "draft_status_snapshot",
  "issue_review_status",
  "issue_summary",
  "next_action",
  "ready_count",
  "readiness_status",
  "review_status",
  "safe_issue_context",
  "safe_issue_note",
  "source_draft_summary",
  "total_count",
]);
const allowedUpdateFields = new Set([
  "billing_month",
  "blocked_count",
  "customer_account",
  "draft_id",
  "draft_status_snapshot",
  "issue_review_status",
  "issue_summary",
  "next_action",
  "ready_count",
  "readiness_status",
  "review_status",
  "safe_issue_context",
  "safe_issue_note",
  "source_draft_summary",
  "total_count",
]);
const allowedSafeContextFields = new Set([
  "issue_summary",
  "next_action",
  "review_status",
]);
const forbiddenIssueReviewFragments = [
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

function includesForbiddenIssueReviewFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenIssueReviewFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenIssueReviewResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin monthly invoice issue review details include unsupported or unsafe fields.",
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
    const keyLeaks = includesForbiddenIssueReviewFragment(key) ? [currentPath] : [];

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

  return includesForbiddenIssueReviewFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenIssueReviewFragment(cleaned)) {
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

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxIssueReviewCount
    ? parsed
    : null;
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

function validDraftStatusSnapshot(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedDraftStatusSnapshots.has(cleaned) ? cleaned : null;
}

function validIssueReviewStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedIssueReviewStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceIssueReviewStatus)
    : null;
}

function validReadinessStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedReadinessStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceIssueReviewReadinessStatus)
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
  const contextRecord = asRecord(record.safe_issue_context);
  const unknownContextFields = unknownKeys(contextRecord, allowedSafeContextFields, "safe_issue_context");

  if (unknownContextFields.length > 0 || findForbiddenFieldNames(contextRecord).length > 0) {
    return null;
  }

  const issueSummary = optionalSafeText(
    contextRecord.issue_summary ?? record.issue_summary,
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
    ((contextRecord.issue_summary ?? record.issue_summary) && !issueSummary) ||
    ((contextRecord.next_action ?? record.next_action) && !nextAction) ||
    ((contextRecord.review_status ?? record.review_status) && !reviewStatus)
  ) {
    return null;
  }

  return {
    ...(issueSummary ? { issue_summary: issueSummary } : {}),
    ...(nextAction ? { next_action: nextAction } : {}),
    ...(reviewStatus ? { review_status: reviewStatus } : {}),
  };
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function paramEntries(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams
    ? [...params.entries()]
    : Object.entries(params).map(([key, value]) => [key, value] as const);
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
      error: safeIssueReviewActorError,
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
      error: safeIssueReviewServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyIssueReviewSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledIssueReviewPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeIssueReviewConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeIssueReviewConfigError,
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
      error: safeIssueReviewConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeIssueReviewRecord(row: UnknownRecord): AdminMonthlyInvoiceIssueReviewRecord {
  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    billing_month: textOrNull(row.billing_month) || "",
    blocked_count: parseCount(row.blocked_count) || 0,
    created_at: textOrNull(row.created_at),
    customer_account: textOrNull(row.customer_account) || "",
    draft_id: textOrNull(row.draft_id) || "",
    draft_status_snapshot:
      validDraftStatusSnapshot(row.draft_status_snapshot) || "pending_admin_review",
    id: textOrNull(row.id),
    issue_review_status:
      validIssueReviewStatus(row.issue_review_status) || "issue_review_pending",
    ready_count: parseCount(row.ready_count) || 0,
    readiness_status: validReadinessStatus(row.readiness_status) || "mixed",
    safe_issue_context: asRecord(row.safe_issue_context) as AdminMonthlyInvoiceIssueReviewSafeContext,
    safe_issue_note: textOrNull(row.safe_issue_note),
    source_draft_summary: asRecord(row.source_draft_summary),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    total_count: parseCount(row.total_count) || 0,
    updated_at: textOrNull(row.updated_at),
  };
}

function filterIssueReviews(
  reviews: AdminMonthlyInvoiceIssueReviewRecord[],
  params: AdminMonthlyInvoiceIssueReviewLoadParams,
) {
  const search = params.customer_account_search?.toLowerCase() || "";

  return reviews.filter((review) => {
    if (params.draft_id && review.draft_id !== params.draft_id) {
      return false;
    }

    if (params.billing_month && review.billing_month !== params.billing_month) {
      return false;
    }

    if (search && !review.customer_account.toLowerCase().includes(search)) {
      return false;
    }

    if (params.issue_review_status && review.issue_review_status !== params.issue_review_status) {
      return false;
    }

    return !params.readiness_status || review.readiness_status === params.readiness_status;
  });
}

function paginateIssueReviews(
  reviews: AdminMonthlyInvoiceIssueReviewRecord[],
  params: AdminMonthlyInvoiceIssueReviewLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return reviews.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  reviews: AdminMonthlyInvoiceIssueReviewRecord[],
  params: AdminMonthlyInvoiceIssueReviewLoadParams,
): AdminMonthlyInvoiceIssueReviewPagination {
  const pageCount = reviews.length > 0 ? Math.ceil(reviews.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_review_count: reviews.length,
  };
}

export function parseAdminMonthlyInvoiceIssueReviewLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyInvoiceIssueReviewLoadParams> {
  const unsafeParams = paramEntries(params).filter(
    ([key, value]) =>
      !allowedReadParams.has(key) ||
      includesForbiddenIssueReviewFragment(key) ||
      includesForbiddenIssueReviewFragment(String(value ?? "")),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Admin monthly invoice issue review read includes unsupported or unsafe fields.",
      ok: false,
      status: 400,
    };
  }

  const draftIdValue = readParamsValue(params, "draft_id");
  const draftId =
    draftIdValue === undefined || draftIdValue === null || draftIdValue === ""
      ? null
      : validDraftId(draftIdValue);

  if (draftIdValue && !draftId) {
    return {
      error: "Malformed monthly invoice issue review draft_id rejected.",
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
      error: "Malformed monthly invoice issue review billing_month rejected.",
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
      error: "Malformed monthly invoice issue review customer/account search rejected.",
      ok: false,
      status: 400,
    };
  }

  const issueStatusValue = readParamsValue(params, "issue_review_status");
  const issueReviewStatus =
    issueStatusValue === undefined || issueStatusValue === null || issueStatusValue === ""
      ? null
      : validIssueReviewStatus(issueStatusValue);

  if (issueStatusValue && !issueReviewStatus) {
    return {
      error: "Malformed monthly invoice issue review status rejected.",
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
      error: "Malformed monthly invoice issue review readiness_status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultIssueReviewLimit,
    maxIssueReviewLimit,
  );

  if (!limit) {
    return {
      error: "Malformed monthly invoice issue review limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxIssueReviewPage);

  if (!page) {
    return {
      error: "Malformed monthly invoice issue review page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      customer_account_search: customerAccountSearch,
      draft_id: draftId,
      issue_review_status: issueReviewStatus,
      limit,
      page,
      readiness_status: readinessStatus,
    },
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceIssueReviewCreatePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceIssueReviewInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedCreateFields, "invoice_issue_review").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenIssueReviewResult();
  }

  const draftId = validDraftId(record.draft_id);
  const customerAccount = safeText(record.customer_account, maxCustomerAccountLength);
  const billingMonth = validBillingMonth(record.billing_month);
  const draftStatusSnapshot =
    validDraftStatusSnapshot(record.draft_status_snapshot) || "pending_admin_review";
  const issueReviewStatus =
    validIssueReviewStatus(record.issue_review_status) || "issue_review_pending";
  const readinessStatus = validReadinessStatus(record.readiness_status);
  const readyCount = parseCount(record.ready_count);
  const blockedCount = parseCount(record.blocked_count);
  const totalCount = parseCount(record.total_count);
  const sourceDraftSummary = safeObject(record.source_draft_summary, maxSafeJsonLength);
  const safeIssueContext = parseSafeContext(record);
  const safeIssueNote = optionalSafeText(record.safe_issue_note, maxSafeIssueNoteLength);

  if (
    !draftId ||
    !customerAccount ||
    !billingMonth ||
    !draftStatusSnapshot ||
    !issueReviewStatus ||
    !readinessStatus ||
    readyCount === null ||
    blockedCount === null ||
    totalCount === null ||
    totalCount !== readyCount + blockedCount ||
    !sourceDraftSummary ||
    !safeIssueContext ||
    (hasOwn(record, "safe_issue_note") && record.safe_issue_note && !safeIssueNote)
  ) {
    return {
      error: "Admin monthly invoice issue review details are malformed.",
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
      draft_status_snapshot: draftStatusSnapshot,
      issue_review_status: issueReviewStatus,
      ready_count: readyCount,
      readiness_status: readinessStatus,
      safe_issue_context: safeIssueContext,
      safe_issue_note: safeIssueNote,
      source_draft_summary: sourceDraftSummary,
      total_count: totalCount,
    },
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceIssueReviewUpdatePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceIssueReviewUpdateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedUpdateFields, "invoice_issue_review_update").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenIssueReviewResult();
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
  const draftStatusSnapshot =
    record.draft_status_snapshot === undefined ||
    record.draft_status_snapshot === null ||
    record.draft_status_snapshot === ""
      ? null
      : validDraftStatusSnapshot(record.draft_status_snapshot);
  const issueReviewStatus = validIssueReviewStatus(record.issue_review_status);
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
  const sourceDraftSummary =
    hasOwn(record, "source_draft_summary")
      ? safeObject(record.source_draft_summary, maxSafeJsonLength)
      : null;
  const safeIssueContext =
    hasOwn(record, "safe_issue_context") ||
    hasOwn(record, "issue_summary") ||
    hasOwn(record, "next_action") ||
    hasOwn(record, "review_status")
      ? parseSafeContext(record)
      : null;
  const safeIssueNote = optionalSafeText(record.safe_issue_note, maxSafeIssueNoteLength);

  if (
    (record.draft_id && !draftId) ||
    (!draftId && (!customerAccount || !billingMonth)) ||
    (record.customer_account && !customerAccount) ||
    (record.billing_month && !billingMonth) ||
    (record.draft_status_snapshot && !draftStatusSnapshot) ||
    !issueReviewStatus ||
    (record.readiness_status && !readinessStatus) ||
    (record.ready_count !== undefined && readyCount === null) ||
    (record.blocked_count !== undefined && blockedCount === null) ||
    (record.total_count !== undefined && totalCount === null) ||
    ((readyCount !== null || blockedCount !== null || totalCount !== null) &&
      (readyCount === null ||
        blockedCount === null ||
        totalCount === null ||
        totalCount !== readyCount + blockedCount)) ||
    (hasOwn(record, "source_draft_summary") && !sourceDraftSummary) ||
    ((hasOwn(record, "safe_issue_context") ||
      hasOwn(record, "issue_summary") ||
      hasOwn(record, "next_action") ||
      hasOwn(record, "review_status")) &&
      !safeIssueContext) ||
    (hasOwn(record, "safe_issue_note") && record.safe_issue_note && !safeIssueNote)
  ) {
    return {
      error: "Admin monthly invoice issue review status update is malformed.",
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
      draft_status_snapshot: draftStatusSnapshot,
      issue_review_status: issueReviewStatus,
      ready_count: readyCount,
      readiness_status: readinessStatus,
      safe_issue_context: safeIssueContext,
      safe_issue_note: hasOwn(record, "safe_issue_note") ? safeIssueNote : null,
      source_draft_summary: sourceDraftSummary,
      total_count: totalCount,
    },
    ok: true,
  };
}

export async function loadAdminMonthlyInvoiceIssueReviews(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueReviewLoadResult>> {
  const parsed = parseAdminMonthlyInvoiceIssueReviewLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyIssueReviewSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_invoice_issue_reviews")
    .select(invoiceIssueReviewSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeIssueReviewLoadError, 500, error);
  }

  const reviews = asArray(data)
    .map(asRecord)
    .map(normalizeIssueReviewRecord)
    .sort(
      (first, second) =>
        first.customer_account.localeCompare(second.customer_account) ||
        first.billing_month.localeCompare(second.billing_month),
    );
  const filteredReviews = filterIssueReviews(reviews, parsed.data);

  return {
    data: {
      issue_reviews: paginateIssueReviews(filteredReviews, parsed.data),
      pagination: buildPagination(filteredReviews, parsed.data),
      version: adminMonthlyInvoiceIssueReviewPersistenceVersion,
    },
    ok: true,
  };
}

export async function createAdminMonthlyInvoiceIssueReview(
  input: AdminMonthlyInvoiceIssueReviewInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueReviewRecord>> {
  const clientResult = getServerOnlyIssueReviewSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const lockResult = await assertAdminMonthlyInvoiceDraftUnlocked(clientResult.data, {
    draft_id: input.draft_id,
  });

  if (!lockResult.ok) {
    return lockResult;
  }

  const payload = {
    billing_month: input.billing_month,
    blocked_count: input.blocked_count,
    customer_account: input.customer_account,
    draft_id: input.draft_id,
    draft_status_snapshot: input.draft_status_snapshot,
    issue_review_status: input.issue_review_status,
    ready_count: input.ready_count,
    readiness_status: input.readiness_status,
    safe_issue_context: input.safe_issue_context,
    safe_issue_note: input.safe_issue_note,
    source_draft_summary: input.source_draft_summary,
    total_count: input.total_count,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await clientResult.data
    .from("monthly_invoice_issue_reviews")
    .upsert(payload, {
      onConflict: "draft_id",
    })
    .select(invoiceIssueReviewSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeIssueReviewSaveError, 500, error);
  }

  return {
    data: normalizeIssueReviewRecord(asRecord(data)),
    ok: true,
  };
}

export async function updateAdminMonthlyInvoiceIssueReviewStatus(
  input: AdminMonthlyInvoiceIssueReviewUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueReviewRecord>> {
  const clientResult = getServerOnlyIssueReviewSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const lockResult = await assertAdminMonthlyInvoiceDraftUnlocked(clientResult.data, {
    billing_month: input.billing_month,
    customer_account: input.customer_account,
    draft_id: input.draft_id,
  });

  if (!lockResult.ok) {
    return lockResult;
  }

  const payload = {
    issue_review_status: input.issue_review_status,
    ...(input.draft_status_snapshot ? { draft_status_snapshot: input.draft_status_snapshot } : {}),
    ...(input.readiness_status ? { readiness_status: input.readiness_status } : {}),
    ...(input.ready_count !== null ? { ready_count: input.ready_count } : {}),
    ...(input.blocked_count !== null ? { blocked_count: input.blocked_count } : {}),
    ...(input.total_count !== null ? { total_count: input.total_count } : {}),
    ...(input.source_draft_summary
      ? { source_draft_summary: input.source_draft_summary }
      : {}),
    ...(input.safe_issue_context ? { safe_issue_context: input.safe_issue_context } : {}),
    ...(input.safe_issue_note !== null ? { safe_issue_note: input.safe_issue_note } : {}),
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  let updateQuery = clientResult.data.from("monthly_invoice_issue_reviews").update(payload);

  updateQuery = input.draft_id
    ? updateQuery.eq("draft_id", input.draft_id)
    : updateQuery
        .eq("customer_account", input.customer_account || "")
        .eq("billing_month", input.billing_month || "");

  const { data, error } = await updateQuery.select(invoiceIssueReviewSelect).single();

  if (error) {
    return safeAdapterFailure(safeIssueReviewUpdateError, 500, error);
  }

  return {
    data: normalizeIssueReviewRecord(asRecord(data)),
    ok: true,
  };
}
