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

export const adminMonthlyInvoiceDraftItemReviewPersistenceVersion =
  "stage-monthly-invoice-draft-item-review-api-v1";

export const adminMonthlyInvoiceDraftItemReviewStatuses = [
  "pending_review",
  "reviewed",
  "needs_correction",
  "blocked",
  "archived",
] as const;

export const adminMonthlyInvoiceDraftTripDetailReviewStatuses = [
  "pending_review",
  "reviewed",
  "needs_correction",
  "blocked",
] as const;

export const adminMonthlyInvoiceDraftExtraChargeReviewStatuses = [
  "pending_review",
  "reviewed",
  "none",
  "needs_correction",
  "blocked",
] as const;

export const adminMonthlyInvoiceDraftBillingItemDecisions = [
  "hold_for_review",
  "include_in_draft",
  "exclude_from_draft",
  "needs_manager_review",
  "blocked",
] as const;

export type AdminMonthlyInvoiceDraftItemReviewStatus =
  (typeof adminMonthlyInvoiceDraftItemReviewStatuses)[number];
export type AdminMonthlyInvoiceDraftTripDetailReviewStatus =
  (typeof adminMonthlyInvoiceDraftTripDetailReviewStatuses)[number];
export type AdminMonthlyInvoiceDraftExtraChargeReviewStatus =
  (typeof adminMonthlyInvoiceDraftExtraChargeReviewStatuses)[number];
export type AdminMonthlyInvoiceDraftBillingItemDecision =
  (typeof adminMonthlyInvoiceDraftBillingItemDecisions)[number];

export type AdminMonthlyInvoiceDraftItemReviewSafeContext = {
  item_review_summary?: string;
  next_action?: string;
  review_status?: string;
};

export type AdminMonthlyInvoiceDraftItemReviewInput = {
  billing_item_decision: AdminMonthlyInvoiceDraftBillingItemDecision;
  booking_reference: string;
  draft_id: string;
  draft_trip_link_id: string | null;
  extra_charge_review_status: AdminMonthlyInvoiceDraftExtraChargeReviewStatus;
  item_review_id: string | null;
  item_review_status: AdminMonthlyInvoiceDraftItemReviewStatus;
  safe_item_review_context: AdminMonthlyInvoiceDraftItemReviewSafeContext;
  safe_item_review_note: string | null;
  source_trip_summary: Record<string, unknown>;
  trip_detail_review_status: AdminMonthlyInvoiceDraftTripDetailReviewStatus;
};

export type AdminMonthlyInvoiceDraftItemReviewLoadParams = {
  billing_item_decision: AdminMonthlyInvoiceDraftBillingItemDecision | null;
  booking_reference: string | null;
  draft_id: string | null;
  draft_trip_link_id: string | null;
  item_review_id: string | null;
  item_review_status: AdminMonthlyInvoiceDraftItemReviewStatus | null;
  limit: number;
  page: number;
};

export type AdminMonthlyInvoiceDraftItemReviewRecord =
  Omit<AdminMonthlyInvoiceDraftItemReviewInput, "item_review_id"> & {
    actor_label: string | null;
    actor_role: "admin" | "dispatcher" | "system";
    created_at: string | null;
    id: string | null;
    source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
    updated_at: string | null;
  };

export type AdminMonthlyInvoiceDraftItemReviewPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_item_review_count: number;
};

export type AdminMonthlyInvoiceDraftItemReviewLoadResult = {
  item_reviews: AdminMonthlyInvoiceDraftItemReviewRecord[];
  pagination: AdminMonthlyInvoiceDraftItemReviewPagination;
  version: typeof adminMonthlyInvoiceDraftItemReviewPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxSafeItemReviewNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxSafeJsonLength = 3000;
const maxItemReviewLimit = 250;
const defaultItemReviewLimit = 25;
const maxItemReviewPage = 1000;
const maxReadRows = 500;
const invoiceDraftItemReviewSelect =
  "id, draft_id, draft_trip_link_id, booking_reference, item_review_status, trip_detail_review_status, extra_charge_review_status, billing_item_decision, source_trip_summary, safe_item_review_note, safe_item_review_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledItemReviewPersistenceError =
  "Admin monthly invoice draft item review persistence is not enabled on this server.";
const safeItemReviewConfigError =
  "Admin monthly invoice draft item review persistence configuration is not ready.";
const safeItemReviewActorError =
  "Admin monthly invoice draft item review persistence requires a verified internal boundary.";
const safeItemReviewServerSessionActorError =
  "Admin monthly invoice draft item review persistence requires a verified admin or dispatcher server session.";
const safeItemReviewSaveError =
  "Admin monthly invoice draft item review save failed safely.";
const safeItemReviewLoadError =
  "Admin monthly invoice draft item review load failed safely.";
const allowedItemReviewStatuses = new Set<string>(
  adminMonthlyInvoiceDraftItemReviewStatuses,
);
const allowedTripDetailStatuses = new Set<string>(
  adminMonthlyInvoiceDraftTripDetailReviewStatuses,
);
const allowedExtraChargeStatuses = new Set<string>(
  adminMonthlyInvoiceDraftExtraChargeReviewStatuses,
);
const allowedBillingItemDecisions = new Set<string>(
  adminMonthlyInvoiceDraftBillingItemDecisions,
);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedReadParams = new Set([
  "billing_item_decision",
  "booking_reference",
  "draft_id",
  "draft_trip_link_id",
  "item_review_id",
  "item_review_status",
  "limit",
  "page",
]);
const allowedSaveFields = new Set([
  "billing_item_decision",
  "booking_reference",
  "draft_id",
  "draft_trip_link_id",
  "extra_charge_review_status",
  "item_review_id",
  "item_review_status",
  "item_review_summary",
  "next_action",
  "review_status",
  "safe_item_review_context",
  "safe_item_review_note",
  "source_trip_summary",
  "trip_detail_review_status",
]);
const allowedSafeContextFields = new Set([
  "item_review_summary",
  "next_action",
  "review_status",
]);
const forbiddenItemReviewFragments = [
  "amount_due",
  "auth_link",
  "bank_account",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_email",
  "customer_phone",
  "customer_price",
  "dev_workbench",
  "driver_auth",
  "driver_job_link",
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

function includesForbiddenItemReviewFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenItemReviewFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenItemReviewResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin monthly invoice draft item review details include unsupported or unsafe fields.",
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
    const keyLeaks = includesForbiddenItemReviewFragment(key) ? [currentPath] : [];

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

  return includesForbiddenItemReviewFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function unknownSearchParams(params: URLSearchParams) {
  return Array.from(params.keys()).filter((key) => !allowedReadParams.has(key));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenItemReviewFragment(cleaned)) {
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

function validUuid(value: unknown) {
  const cleaned = safeText(value, 80);

  return cleaned && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function validItemReviewStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedItemReviewStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftItemReviewStatus)
    : null;
}

function validTripDetailStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedTripDetailStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftTripDetailReviewStatus)
    : null;
}

function validExtraChargeStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedExtraChargeStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftExtraChargeReviewStatus)
    : null;
}

function validBillingItemDecision(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedBillingItemDecisions.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftBillingItemDecision)
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
  const contextRecord = asRecord(record.safe_item_review_context);
  const unknownContextFields = unknownKeys(
    contextRecord,
    allowedSafeContextFields,
    "safe_item_review_context",
  );

  if (unknownContextFields.length > 0 || findForbiddenFieldNames(contextRecord).length > 0) {
    return null;
  }

  const itemReviewSummary = optionalSafeText(
    contextRecord.item_review_summary ?? record.item_review_summary,
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
    ((contextRecord.item_review_summary ?? record.item_review_summary) && !itemReviewSummary) ||
    ((contextRecord.next_action ?? record.next_action) && !nextAction) ||
    ((contextRecord.review_status ?? record.review_status) && !reviewStatus)
  ) {
    return null;
  }

  return {
    ...(itemReviewSummary ? { item_review_summary: itemReviewSummary } : {}),
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
      error: safeItemReviewActorError,
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
      error: safeItemReviewServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyItemReviewSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledItemReviewPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeItemReviewConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeItemReviewConfigError,
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
      error: safeItemReviewConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeItemReviewRecord(row: UnknownRecord): AdminMonthlyInvoiceDraftItemReviewRecord {
  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    billing_item_decision:
      validBillingItemDecision(row.billing_item_decision) || "hold_for_review",
    booking_reference: textOrNull(row.booking_reference) || "",
    created_at: textOrNull(row.created_at),
    draft_id: textOrNull(row.draft_id) || "",
    draft_trip_link_id: textOrNull(row.draft_trip_link_id),
    extra_charge_review_status:
      validExtraChargeStatus(row.extra_charge_review_status) || "pending_review",
    id: textOrNull(row.id),
    item_review_status: validItemReviewStatus(row.item_review_status) || "pending_review",
    safe_item_review_context: asRecord(
      row.safe_item_review_context,
    ) as AdminMonthlyInvoiceDraftItemReviewSafeContext,
    safe_item_review_note: textOrNull(row.safe_item_review_note),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    source_trip_summary: asRecord(row.source_trip_summary),
    trip_detail_review_status:
      validTripDetailStatus(row.trip_detail_review_status) || "pending_review",
    updated_at: textOrNull(row.updated_at),
  };
}

function filterItemReviews(
  reviews: AdminMonthlyInvoiceDraftItemReviewRecord[],
  params: AdminMonthlyInvoiceDraftItemReviewLoadParams,
) {
  return reviews.filter((review) => {
    if (params.item_review_id && review.id !== params.item_review_id) {
      return false;
    }

    if (params.draft_id && review.draft_id !== params.draft_id) {
      return false;
    }

    if (params.draft_trip_link_id && review.draft_trip_link_id !== params.draft_trip_link_id) {
      return false;
    }

    if (params.booking_reference && review.booking_reference !== params.booking_reference) {
      return false;
    }

    if (params.item_review_status && review.item_review_status !== params.item_review_status) {
      return false;
    }

    return !params.billing_item_decision || review.billing_item_decision === params.billing_item_decision;
  });
}

function paginateItemReviews(
  reviews: AdminMonthlyInvoiceDraftItemReviewRecord[],
  params: AdminMonthlyInvoiceDraftItemReviewLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return reviews.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  reviews: AdminMonthlyInvoiceDraftItemReviewRecord[],
  params: AdminMonthlyInvoiceDraftItemReviewLoadParams,
): AdminMonthlyInvoiceDraftItemReviewPagination {
  const pageCount = reviews.length > 0 ? Math.ceil(reviews.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_item_review_count: reviews.length,
  };
}

export function parseAdminMonthlyInvoiceDraftItemReviewLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyInvoiceDraftItemReviewLoadParams> {
  if (params instanceof URLSearchParams && unknownSearchParams(params).length > 0) {
    return forbiddenItemReviewResult();
  }

  if (
    !(params instanceof URLSearchParams) &&
    unknownKeys(params, allowedReadParams, "item_review_read").length > 0
  ) {
    return forbiddenItemReviewResult();
  }

  const itemReviewIdValue = readParamsValue(params, "item_review_id");
  const itemReviewId =
    itemReviewIdValue === undefined || itemReviewIdValue === null || itemReviewIdValue === ""
      ? null
      : validUuid(itemReviewIdValue);

  if (itemReviewIdValue && !itemReviewId) {
    return {
      error: "Malformed monthly invoice draft item review id rejected.",
      ok: false,
      status: 400,
    };
  }

  const draftIdValue = readParamsValue(params, "draft_id");
  const draftId =
    draftIdValue === undefined || draftIdValue === null || draftIdValue === ""
      ? null
      : validUuid(draftIdValue);

  if (draftIdValue && !draftId) {
    return {
      error: "Malformed monthly invoice draft item review draft_id rejected.",
      ok: false,
      status: 400,
    };
  }

  const draftTripLinkIdValue = readParamsValue(params, "draft_trip_link_id");
  const draftTripLinkId =
    draftTripLinkIdValue === undefined ||
    draftTripLinkIdValue === null ||
    draftTripLinkIdValue === ""
      ? null
      : validUuid(draftTripLinkIdValue);

  if (draftTripLinkIdValue && !draftTripLinkId) {
    return {
      error: "Malformed monthly invoice draft item review trip link id rejected.",
      ok: false,
      status: 400,
    };
  }

  const bookingReferenceValue = readParamsValue(params, "booking_reference");
  const bookingReference =
    bookingReferenceValue === undefined || bookingReferenceValue === null || bookingReferenceValue === ""
      ? null
      : safeText(bookingReferenceValue, maxBookingReferenceLength);

  if (bookingReferenceValue && !bookingReference) {
    return {
      error: "Malformed monthly invoice draft item review booking reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const itemReviewStatusValue = readParamsValue(params, "item_review_status");
  const itemReviewStatus =
    itemReviewStatusValue === undefined ||
    itemReviewStatusValue === null ||
    itemReviewStatusValue === ""
      ? null
      : validItemReviewStatus(itemReviewStatusValue);

  if (itemReviewStatusValue && !itemReviewStatus) {
    return {
      error: "Malformed monthly invoice draft item review status rejected.",
      ok: false,
      status: 400,
    };
  }

  const billingItemDecisionValue = readParamsValue(params, "billing_item_decision");
  const billingItemDecision =
    billingItemDecisionValue === undefined ||
    billingItemDecisionValue === null ||
    billingItemDecisionValue === ""
      ? null
      : validBillingItemDecision(billingItemDecisionValue);

  if (billingItemDecisionValue && !billingItemDecision) {
    return {
      error: "Malformed monthly invoice draft item review decision rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultItemReviewLimit,
    maxItemReviewLimit,
  );

  if (!limit) {
    return {
      error: "Malformed monthly invoice draft item review limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxItemReviewPage);

  if (!page) {
    return {
      error: "Malformed monthly invoice draft item review page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_item_decision: billingItemDecision,
      booking_reference: bookingReference,
      draft_id: draftId,
      draft_trip_link_id: draftTripLinkId,
      item_review_id: itemReviewId,
      item_review_status: itemReviewStatus,
      limit,
      page,
    },
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceDraftItemReviewSavePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceDraftItemReviewInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedSaveFields, "item_review").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenItemReviewResult();
  }

  const itemReviewId =
    record.item_review_id === undefined || record.item_review_id === null || record.item_review_id === ""
      ? null
      : validUuid(record.item_review_id);
  const draftId = validUuid(record.draft_id);
  const draftTripLinkId =
    record.draft_trip_link_id === undefined ||
    record.draft_trip_link_id === null ||
    record.draft_trip_link_id === ""
      ? null
      : validUuid(record.draft_trip_link_id);
  const bookingReference = safeText(record.booking_reference, maxBookingReferenceLength);
  const itemReviewStatus = validItemReviewStatus(record.item_review_status) || "pending_review";
  const tripDetailReviewStatus =
    validTripDetailStatus(record.trip_detail_review_status) || "pending_review";
  const extraChargeReviewStatus =
    validExtraChargeStatus(record.extra_charge_review_status) || "pending_review";
  const billingItemDecision =
    validBillingItemDecision(record.billing_item_decision) || "hold_for_review";
  const sourceTripSummary = safeObject(record.source_trip_summary, maxSafeJsonLength);
  const safeItemReviewContext = parseSafeContext(record);
  const safeItemReviewNote = optionalSafeText(
    record.safe_item_review_note,
    maxSafeItemReviewNoteLength,
  );

  if (
    (record.item_review_id && !itemReviewId) ||
    !draftId ||
    (record.draft_trip_link_id && !draftTripLinkId)
  ) {
    return {
      error: "Admin monthly invoice draft item review identifiers are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (!bookingReference) {
    return {
      error: "Admin monthly invoice draft item review booking reference is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    !itemReviewStatus ||
    !tripDetailReviewStatus ||
    !extraChargeReviewStatus ||
    !billingItemDecision
  ) {
    return {
      error: "Admin monthly invoice draft item review statuses are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (!sourceTripSummary) {
    return {
      error: "Admin monthly invoice draft item review source summary is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    !safeItemReviewContext ||
    (hasOwn(record, "safe_item_review_note") && record.safe_item_review_note && !safeItemReviewNote)
  ) {
    return {
      error: "Admin monthly invoice draft item review safe context is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    itemReviewStatus === "reviewed" &&
    (tripDetailReviewStatus !== "reviewed" ||
      !["reviewed", "none"].includes(extraChargeReviewStatus) ||
      billingItemDecision !== "include_in_draft")
  ) {
    return {
      error: "Reviewed monthly invoice draft item requires reviewed trip details and include-in-draft decision.",
      ok: false,
      status: 400,
    };
  }

  if (
    itemReviewStatus === "blocked" &&
    !["blocked", "exclude_from_draft", "needs_manager_review"].includes(billingItemDecision)
  ) {
    return {
      error: "Blocked monthly invoice draft item requires a blocked, excluded, or manager-review decision.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_item_decision: billingItemDecision,
      booking_reference: bookingReference,
      draft_id: draftId,
      draft_trip_link_id: draftTripLinkId,
      extra_charge_review_status: extraChargeReviewStatus,
      item_review_id: itemReviewId,
      item_review_status: itemReviewStatus,
      safe_item_review_context: safeItemReviewContext,
      safe_item_review_note: hasOwn(record, "safe_item_review_note") ? safeItemReviewNote : null,
      source_trip_summary: sourceTripSummary,
      trip_detail_review_status: tripDetailReviewStatus,
    },
    ok: true,
  };
}

export async function loadAdminMonthlyInvoiceDraftItemReviews(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceDraftItemReviewLoadResult>> {
  const parsed = parseAdminMonthlyInvoiceDraftItemReviewLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyItemReviewSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_invoice_draft_item_reviews")
    .select(invoiceDraftItemReviewSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeItemReviewLoadError, 500, error);
  }

  const reviews = asArray(data)
    .map(asRecord)
    .map(normalizeItemReviewRecord)
    .sort(
      (first, second) =>
        first.draft_id.localeCompare(second.draft_id) ||
        first.booking_reference.localeCompare(second.booking_reference),
    );
  const filteredReviews = filterItemReviews(reviews, parsed.data);

  return {
    data: {
      item_reviews: paginateItemReviews(filteredReviews, parsed.data),
      pagination: buildPagination(filteredReviews, parsed.data),
      version: adminMonthlyInvoiceDraftItemReviewPersistenceVersion,
    },
    ok: true,
  };
}

export async function saveAdminMonthlyInvoiceDraftItemReview(
  input: AdminMonthlyInvoiceDraftItemReviewInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceDraftItemReviewRecord>> {
  const clientResult = getServerOnlyItemReviewSupabaseClient(actor);

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
    billing_item_decision: input.billing_item_decision,
    booking_reference: input.booking_reference,
    draft_id: input.draft_id,
    draft_trip_link_id: input.draft_trip_link_id,
    extra_charge_review_status: input.extra_charge_review_status,
    item_review_status: input.item_review_status,
    safe_item_review_context: input.safe_item_review_context,
    safe_item_review_note: input.safe_item_review_note,
    source_surface: actor.source_surface,
    source_trip_summary: input.source_trip_summary,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    trip_detail_review_status: input.trip_detail_review_status,
    updated_at: new Date().toISOString(),
  };
  const writeQuery = input.item_review_id
    ? clientResult.data
        .from("monthly_invoice_draft_item_reviews")
        .update(payload)
        .eq("id", input.item_review_id)
    : clientResult.data
        .from("monthly_invoice_draft_item_reviews")
        .upsert(payload, {
          onConflict: "draft_id,booking_reference",
        });
  const { data, error } = await writeQuery.select(invoiceDraftItemReviewSelect).single();

  if (error) {
    return safeAdapterFailure(safeItemReviewSaveError, 500, error);
  }

  return {
    data: normalizeItemReviewRecord(asRecord(data)),
    ok: true,
  };
}
