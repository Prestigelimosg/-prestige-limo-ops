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
import { calculateDspBillableMinutes, calculateHourlyBillableMinutes } from "./hourly-billing";
import { initialRateSettings, resolvePricing } from "./pricing";

export const adminMonthlyInvoiceBillableItemPriceReviewVersion =
  "stage-monthly-invoice-billable-item-price-review-api-v1";

export const adminMonthlyInvoiceBillableBookingTypes = [
  "MNG",
  "DEP",
  "TRF",
  "DSP",
  "arrival",
  "departure",
  "transfer",
  "hourly",
  "seaport_transfer",
] as const;

export const adminMonthlyInvoiceBillingItemTypes = [
  "base_trip",
  "extra_charge",
  "adjustment",
  "waiver",
] as const;

export const adminMonthlyInvoiceCalculationBases = [
  "fixed_trip",
  "dsp_actual_time",
  "manual_review",
  "extra_charge",
  "waived",
] as const;

export const adminMonthlyInvoicePriceReviewStatuses = [
  "pending_review",
  "reviewed",
  "needs_correction",
  "blocked",
  "approved_for_invoice_draft",
] as const;

export const adminMonthlyInvoicePriceDecisions = [
  "hold_for_review",
  "include_in_invoice",
  "exclude_from_invoice",
  "needs_manager_review",
  "waived",
  "blocked",
] as const;

export type AdminMonthlyInvoiceBillableBookingType =
  (typeof adminMonthlyInvoiceBillableBookingTypes)[number];
export type AdminMonthlyInvoiceBillingItemType =
  (typeof adminMonthlyInvoiceBillingItemTypes)[number];
export type AdminMonthlyInvoiceCalculationBasis =
  (typeof adminMonthlyInvoiceCalculationBases)[number];
export type AdminMonthlyInvoicePriceReviewStatus =
  (typeof adminMonthlyInvoicePriceReviewStatuses)[number];
export type AdminMonthlyInvoicePriceDecision =
  (typeof adminMonthlyInvoicePriceDecisions)[number];

export type AdminMonthlyInvoiceBillableItemPriceReviewContext = {
  billable_hours_amended?: string;
  billable_hours_amendment_reason?: string;
  suggested_billable_hours?: string;
  next_action?: string;
  price_review_summary?: string;
  review_status?: string;
};

export type AdminMonthlyInvoiceBillableItemPriceReviewInput = {
  billing_item_type: AdminMonthlyInvoiceBillingItemType;
  booking_reference: string;
  booking_type: AdminMonthlyInvoiceBillableBookingType;
  calculation_basis: AdminMonthlyInvoiceCalculationBasis;
  currency: string;
  draft_id: string;
  draft_trip_link_id: string | null;
  dsp_billable_minutes: number | null;
  dsp_total_minutes: number | null;
  item_review_id: string;
  price_decision: AdminMonthlyInvoicePriceDecision;
  price_review_id: string | null;
  price_review_status: AdminMonthlyInvoicePriceReviewStatus;
  reviewed_customer_amount_cents: number | null;
  safe_price_review_context: AdminMonthlyInvoiceBillableItemPriceReviewContext;
  safe_price_review_note: string | null;
  source_price_context: Record<string, unknown>;
};

export type AdminMonthlyInvoiceBillableItemPriceReviewLoadParams = {
  billing_item_type: AdminMonthlyInvoiceBillingItemType | null;
  booking_reference: string | null;
  booking_type: AdminMonthlyInvoiceBillableBookingType | null;
  draft_id: string | null;
  draft_trip_link_id: string | null;
  item_review_id: string | null;
  price_decision: AdminMonthlyInvoicePriceDecision | null;
  price_review_id: string | null;
  price_review_status: AdminMonthlyInvoicePriceReviewStatus | null;
  limit: number;
  page: number;
};

export type AdminMonthlyInvoiceBillableItemPriceReviewRecord =
  Omit<AdminMonthlyInvoiceBillableItemPriceReviewInput, "price_review_id"> & {
    actor_label: string | null;
    actor_role: "admin" | "dispatcher" | "system";
    created_at: string | null;
    id: string | null;
    source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
    updated_at: string | null;
  };

export type AdminMonthlyInvoiceBillableItemPriceReviewPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_price_review_count: number;
};

export type AdminMonthlyInvoiceBillableItemPriceReviewLoadResult = {
  pagination: AdminMonthlyInvoiceBillableItemPriceReviewPagination;
  price_reviews: AdminMonthlyInvoiceBillableItemPriceReviewRecord[];
  version: typeof adminMonthlyInvoiceBillableItemPriceReviewVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxBookingReferenceLength = 120;
const maxSafeNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxSafeJsonLength = 3000;
const maxPriceReviewLimit = 250;
const defaultPriceReviewLimit = 25;
const maxPriceReviewPage = 1000;
const maxReadRows = 500;
const maxReviewedAmountCents = 100_000_000;
const maxDspMinutes = 60 * 24 * 30;
const excludedDspBillingBookingReferences = new Set(["ADM-20260712063110"]);
const billableItemPriceReviewSelect =
  "id, draft_id, draft_trip_link_id, item_review_id, booking_reference, booking_type, billing_item_type, calculation_basis, price_review_status, price_decision, reviewed_customer_amount_cents, currency, dsp_total_minutes, dsp_billable_minutes, source_price_context, safe_price_review_note, safe_price_review_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledPriceReviewPersistenceError =
  "Admin monthly invoice billable item price review persistence is not enabled on this server.";
const safePriceReviewConfigError =
  "Admin monthly invoice billable item price review persistence configuration is not ready.";
const safePriceReviewActorError =
  "Admin monthly invoice billable item price review persistence requires a verified internal boundary.";
const safePriceReviewServerSessionActorError =
  "Admin monthly invoice billable item price review persistence requires a verified admin or dispatcher server session.";
const safePriceReviewSaveError =
  "Admin monthly invoice billable item price review save failed safely.";
const safeDspPricingIdentityError =
  "DSP amount calculation requires the exact saved booking with verified CRM company identity and vehicle category.";
const safePriceReviewLoadError =
  "Admin monthly invoice billable item price review load failed safely.";
const allowedBookingTypes = new Set<string>(adminMonthlyInvoiceBillableBookingTypes);
const allowedBillingItemTypes = new Set<string>(adminMonthlyInvoiceBillingItemTypes);
const allowedCalculationBases = new Set<string>(adminMonthlyInvoiceCalculationBases);
const allowedPriceReviewStatuses = new Set<string>(adminMonthlyInvoicePriceReviewStatuses);
const allowedPriceDecisions = new Set<string>(adminMonthlyInvoicePriceDecisions);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedReadParams = new Set([
  "billing_item_type",
  "booking_reference",
  "booking_type",
  "draft_id",
  "draft_trip_link_id",
  "item_review_id",
  "limit",
  "page",
  "price_decision",
  "price_review_id",
  "price_review_status",
]);
const allowedSaveFields = new Set([
  "billing_item_type",
  "booking_reference",
  "booking_type",
  "calculation_basis",
  "currency",
  "draft_id",
  "draft_trip_link_id",
  "dsp_billable_minutes",
  "dsp_total_minutes",
  "item_review_id",
  "next_action",
  "price_decision",
  "price_review_id",
  "price_review_status",
  "price_review_summary",
  "review_status",
  "reviewed_customer_amount_cents",
  "safe_price_review_context",
  "safe_price_review_note",
  "source_price_context",
]);
const allowedSafeContextFields = new Set([
  "billable_hours_amended",
  "billable_hours_amendment_reason",
  "next_action",
  "price_review_summary",
  "review_status",
  "suggested_billable_hours",
]);
const forbiddenPriceReviewFragments = [
  "auth_link",
  "bank_account",
  "card_number",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_email",
  "customer_phone",
  "dev_workbench",
  "driver_auth",
  "driver_job_link",
  "driver_payout",
  "email_send",
  "final_invoice_number",
  "finance_note",
  "full_invoice_number",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice_pdf",
  "invoice_send",
  "invoice_sent",
  "live_location",
  "mock_archive",
  "mock_qa",
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

function includesForbiddenPriceReviewFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenPriceReviewFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenPriceReviewResult<T>(): AdminBookingResult<T> {
  return {
    error:
      "Admin monthly invoice billable item price review details include unsupported or unsafe fields.",
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
    const keyLeaks = includesForbiddenPriceReviewFragment(key) ? [currentPath] : [];

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

  return includesForbiddenPriceReviewFragment(text) ? [text] : [];
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

  if (!cleaned || cleaned.length > maxLength || includesForbiddenPriceReviewFragment(cleaned)) {
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

  return cleaned &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function validBookingReference(value: unknown) {
  const cleaned = safeText(value, maxBookingReferenceLength);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned) ? cleaned : null;
}

function validBookingType(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedBookingTypes.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceBillableBookingType)
    : null;
}

function validBillingItemType(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedBillingItemTypes.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceBillingItemType)
    : null;
}

function validCalculationBasis(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedCalculationBases.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceCalculationBasis)
    : null;
}

function validPriceReviewStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedPriceReviewStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoicePriceReviewStatus)
    : null;
}

function validPriceDecision(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedPriceDecisions.has(cleaned)
    ? (cleaned as AdminMonthlyInvoicePriceDecision)
    : null;
}

function validCurrency(value: unknown) {
  const cleaned = safeText(value, 3)?.toUpperCase();

  return cleaned && /^[A-Z]{3}$/.test(cleaned) ? cleaned : null;
}

function integerOrNull(value: unknown, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 0 && parsed <= maxValue ? parsed : null;
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
  const contextRecord = asRecord(record.safe_price_review_context);
  const unknownContextFields = unknownKeys(
    contextRecord,
    allowedSafeContextFields,
    "safe_price_review_context",
  );

  if (unknownContextFields.length > 0 || findForbiddenFieldNames(contextRecord).length > 0) {
    return null;
  }

  const priceReviewSummary = optionalSafeText(
    contextRecord.price_review_summary ?? record.price_review_summary,
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
  const billableHoursAmended = optionalSafeText(
    contextRecord.billable_hours_amended,
    maxSafeContextTextLength,
  );
  const billableHoursAmendmentReason = optionalSafeText(
    contextRecord.billable_hours_amendment_reason,
    maxSafeContextTextLength,
  );
  const suggestedBillableHours = optionalSafeText(
    contextRecord.suggested_billable_hours,
    maxSafeContextTextLength,
  );

  if (
    ((contextRecord.price_review_summary ?? record.price_review_summary) &&
      !priceReviewSummary) ||
    ((contextRecord.next_action ?? record.next_action) && !nextAction) ||
    ((contextRecord.review_status ?? record.review_status) && !reviewStatus)
  ) {
    return null;
  }

  return {
    ...(billableHoursAmended ? { billable_hours_amended: billableHoursAmended } : {}),
    ...(billableHoursAmendmentReason
      ? { billable_hours_amendment_reason: billableHoursAmendmentReason }
      : {}),
    ...(priceReviewSummary ? { price_review_summary: priceReviewSummary } : {}),
    ...(nextAction ? { next_action: nextAction } : {}),
    ...(reviewStatus ? { review_status: reviewStatus } : {}),
    ...(suggestedBillableHours ? { suggested_billable_hours: suggestedBillableHours } : {}),
  };
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function defaultCalculationBasisForBookingType(
  bookingType: AdminMonthlyInvoiceBillableBookingType,
): AdminMonthlyInvoiceCalculationBasis {
  return bookingType === "DSP" || bookingType === "hourly" ? "dsp_actual_time" : "fixed_trip";
}

function isDspBookingType(bookingType: AdminMonthlyInvoiceBillableBookingType) {
  return bookingType === "DSP" || bookingType === "hourly";
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
      error: safePriceReviewActorError,
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
      error: safePriceReviewServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyPriceReviewSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledPriceReviewPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safePriceReviewConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safePriceReviewConfigError,
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
      error: safePriceReviewConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizePriceReviewRecord(
  row: UnknownRecord,
): AdminMonthlyInvoiceBillableItemPriceReviewRecord {
  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    billing_item_type: validBillingItemType(row.billing_item_type) || "base_trip",
    booking_reference: textOrNull(row.booking_reference) || "",
    booking_type: validBookingType(row.booking_type) || "TRF",
    calculation_basis: validCalculationBasis(row.calculation_basis) || "manual_review",
    created_at: textOrNull(row.created_at),
    currency: validCurrency(row.currency) || "SGD",
    draft_id: textOrNull(row.draft_id) || "",
    draft_trip_link_id: textOrNull(row.draft_trip_link_id),
    dsp_billable_minutes: integerOrNull(row.dsp_billable_minutes, maxDspMinutes),
    dsp_total_minutes: integerOrNull(row.dsp_total_minutes, maxDspMinutes),
    id: textOrNull(row.id),
    item_review_id: textOrNull(row.item_review_id) || "",
    price_decision: validPriceDecision(row.price_decision) || "hold_for_review",
    price_review_status:
      validPriceReviewStatus(row.price_review_status) || "pending_review",
    reviewed_customer_amount_cents: integerOrNull(
      row.reviewed_customer_amount_cents,
      maxReviewedAmountCents,
    ),
    safe_price_review_context: asRecord(
      row.safe_price_review_context,
    ) as AdminMonthlyInvoiceBillableItemPriceReviewContext,
    safe_price_review_note: textOrNull(row.safe_price_review_note),
    source_price_context: asRecord(row.source_price_context),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    updated_at: textOrNull(row.updated_at),
  };
}

function filterPriceReviews(
  reviews: AdminMonthlyInvoiceBillableItemPriceReviewRecord[],
  params: AdminMonthlyInvoiceBillableItemPriceReviewLoadParams,
) {
  return reviews.filter((review) => {
    if (params.price_review_id && review.id !== params.price_review_id) {
      return false;
    }

    if (params.draft_id && review.draft_id !== params.draft_id) {
      return false;
    }

    if (params.draft_trip_link_id && review.draft_trip_link_id !== params.draft_trip_link_id) {
      return false;
    }

    if (params.item_review_id && review.item_review_id !== params.item_review_id) {
      return false;
    }

    if (params.booking_reference && review.booking_reference !== params.booking_reference) {
      return false;
    }

    if (params.booking_type && review.booking_type !== params.booking_type) {
      return false;
    }

    if (params.billing_item_type && review.billing_item_type !== params.billing_item_type) {
      return false;
    }

    if (params.price_review_status && review.price_review_status !== params.price_review_status) {
      return false;
    }

    return !params.price_decision || review.price_decision === params.price_decision;
  });
}

function paginatePriceReviews(
  reviews: AdminMonthlyInvoiceBillableItemPriceReviewRecord[],
  params: AdminMonthlyInvoiceBillableItemPriceReviewLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return reviews.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  reviews: AdminMonthlyInvoiceBillableItemPriceReviewRecord[],
  params: AdminMonthlyInvoiceBillableItemPriceReviewLoadParams,
): AdminMonthlyInvoiceBillableItemPriceReviewPagination {
  const pageCount = reviews.length > 0 ? Math.ceil(reviews.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_price_review_count: reviews.length,
  };
}

export function parseAdminMonthlyInvoiceBillableItemPriceReviewLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyInvoiceBillableItemPriceReviewLoadParams> {
  if (params instanceof URLSearchParams && unknownSearchParams(params).length > 0) {
    return forbiddenPriceReviewResult();
  }

  if (
    !(params instanceof URLSearchParams) &&
    unknownKeys(params, allowedReadParams, "billable_price_review_read").length > 0
  ) {
    return forbiddenPriceReviewResult();
  }

  const uuidParam = (key: string, label: string): AdminBookingResult<string | null> => {
    const value = readParamsValue(params, key);
    const id = value === undefined || value === null || value === "" ? null : validUuid(value);

    if (value && !id) {
      return {
        error: `Malformed monthly invoice billable item price review ${label} rejected.`,
        ok: false,
        status: 400,
      };
    }

    return {
      data: id,
      ok: true,
    };
  };

  const priceReviewId = uuidParam("price_review_id", "id");
  const draftId = uuidParam("draft_id", "draft_id");
  const draftTripLinkId = uuidParam("draft_trip_link_id", "trip link id");
  const itemReviewId = uuidParam("item_review_id", "item review id");

  if (!priceReviewId.ok) {
    return priceReviewId;
  }

  if (!draftId.ok) {
    return draftId;
  }

  if (!draftTripLinkId.ok) {
    return draftTripLinkId;
  }

  if (!itemReviewId.ok) {
    return itemReviewId;
  }

  const bookingReferenceValue = readParamsValue(params, "booking_reference");
  const bookingReference =
    bookingReferenceValue === undefined || bookingReferenceValue === null || bookingReferenceValue === ""
      ? null
      : validBookingReference(bookingReferenceValue);

  if (bookingReferenceValue && !bookingReference) {
    return {
      error: "Malformed monthly invoice billable item price review booking reference rejected.",
      ok: false,
      status: 400,
    };
  }

  const bookingTypeValue = readParamsValue(params, "booking_type");
  const bookingType =
    bookingTypeValue === undefined || bookingTypeValue === null || bookingTypeValue === ""
      ? null
      : validBookingType(bookingTypeValue);

  if (bookingTypeValue && !bookingType) {
    return {
      error: "Malformed monthly invoice billable item price review booking type rejected.",
      ok: false,
      status: 400,
    };
  }

  const billingItemTypeValue = readParamsValue(params, "billing_item_type");
  const billingItemType =
    billingItemTypeValue === undefined ||
    billingItemTypeValue === null ||
    billingItemTypeValue === ""
      ? null
      : validBillingItemType(billingItemTypeValue);

  if (billingItemTypeValue && !billingItemType) {
    return {
      error: "Malformed monthly invoice billable item type rejected.",
      ok: false,
      status: 400,
    };
  }

  const priceReviewStatusValue = readParamsValue(params, "price_review_status");
  const priceReviewStatus =
    priceReviewStatusValue === undefined ||
    priceReviewStatusValue === null ||
    priceReviewStatusValue === ""
      ? null
      : validPriceReviewStatus(priceReviewStatusValue);

  if (priceReviewStatusValue && !priceReviewStatus) {
    return {
      error: "Malformed monthly invoice billable item price review status rejected.",
      ok: false,
      status: 400,
    };
  }

  const priceDecisionValue = readParamsValue(params, "price_decision");
  const priceDecision =
    priceDecisionValue === undefined || priceDecisionValue === null || priceDecisionValue === ""
      ? null
      : validPriceDecision(priceDecisionValue);

  if (priceDecisionValue && !priceDecision) {
    return {
      error: "Malformed monthly invoice billable item price decision rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultPriceReviewLimit,
    maxPriceReviewLimit,
  );

  if (!limit) {
    return {
      error: "Malformed monthly invoice billable item price review limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxPriceReviewPage);

  if (!page) {
    return {
      error: "Malformed monthly invoice billable item price review page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_item_type: billingItemType,
      booking_reference: bookingReference,
      booking_type: bookingType,
      draft_id: draftId.data,
      draft_trip_link_id: draftTripLinkId.data,
      item_review_id: itemReviewId.data,
      limit,
      page,
      price_decision: priceDecision,
      price_review_id: priceReviewId.data,
      price_review_status: priceReviewStatus,
    },
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceBillableItemPriceReviewSavePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceBillableItemPriceReviewInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedSaveFields, "billable_price_review").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenPriceReviewResult();
  }

  const priceReviewId =
    record.price_review_id === undefined || record.price_review_id === null || record.price_review_id === ""
      ? null
      : validUuid(record.price_review_id);
  const draftId = validUuid(record.draft_id);
  const draftTripLinkId =
    record.draft_trip_link_id === undefined ||
    record.draft_trip_link_id === null ||
    record.draft_trip_link_id === ""
      ? null
      : validUuid(record.draft_trip_link_id);
  const itemReviewId = validUuid(record.item_review_id);
  const bookingReference = validBookingReference(record.booking_reference);
  const bookingType = validBookingType(record.booking_type);
  const billingItemType = validBillingItemType(record.billing_item_type) || "base_trip";
  const calculationBasis =
    validCalculationBasis(record.calculation_basis) ||
    (bookingType ? defaultCalculationBasisForBookingType(bookingType) : null);
  const priceReviewStatus =
    validPriceReviewStatus(record.price_review_status) || "pending_review";
  const priceDecision = validPriceDecision(record.price_decision) || "hold_for_review";
  const reviewedAmount = integerOrNull(
    record.reviewed_customer_amount_cents,
    maxReviewedAmountCents,
  );
  const currency = validCurrency(record.currency) || "SGD";
  const dspTotalMinutes = integerOrNull(record.dsp_total_minutes, maxDspMinutes);
  const dspBillableMinutes = integerOrNull(record.dsp_billable_minutes, maxDspMinutes);
  const sourcePriceContext = safeObject(record.source_price_context, maxSafeJsonLength);
  let safePriceReviewContext = parseSafeContext(record);
  const safePriceReviewNote = optionalSafeText(
    record.safe_price_review_note,
    maxSafeNoteLength,
  );

  if (
    (record.price_review_id && !priceReviewId) ||
    !draftId ||
    (record.draft_trip_link_id && !draftTripLinkId) ||
    !itemReviewId
  ) {
    return {
      error: "Admin monthly invoice billable item price review identifiers are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (!bookingReference || !bookingType) {
    return {
      error: "Admin monthly invoice billable item price review booking details are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (bookingType === "DSP" && excludedDspBillingBookingReferences.has(bookingReference)) {
    return {
      error: "This DSP test booking is excluded from billing.",
      ok: false,
      status: 400,
    };
  }

  if (!billingItemType || !calculationBasis || !priceReviewStatus || !priceDecision) {
    return {
      error: "Admin monthly invoice billable item price review statuses are malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    hasOwn(record, "reviewed_customer_amount_cents") &&
    record.reviewed_customer_amount_cents !== null &&
    record.reviewed_customer_amount_cents !== "" &&
    reviewedAmount === null
  ) {
    return {
      error: "Admin monthly invoice billable item reviewed amount is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (!isDspBookingType(bookingType) && calculationBasis === "dsp_actual_time") {
    return {
      error: "DSP actual-time price review is allowed only for DSP/hourly bookings.",
      ok: false,
      status: 400,
    };
  }

  if (!isDspBookingType(bookingType) && (dspTotalMinutes !== null || dspBillableMinutes !== null)) {
    return {
      error: "Non-DSP billable item price review must not include DSP actual minutes.",
      ok: false,
      status: 400,
    };
  }

  if (dspBillableMinutes !== null && dspTotalMinutes === null) {
    return {
      error: "DSP billable minutes require saved actual minutes.",
      ok: false,
      status: 400,
    };
  }

  const expectedHourlyBillableMinutes =
    bookingType === "hourly" && dspTotalMinutes !== null
      ? calculateHourlyBillableMinutes(dspTotalMinutes)
      : null;
  const suggestedDspBillableMinutes =
    bookingType === "DSP" && dspTotalMinutes !== null
      ? calculateDspBillableMinutes(dspTotalMinutes)
      : null;

  if (
    bookingType === "DSP" &&
    dspBillableMinutes !== null &&
    (dspBillableMinutes < 60 || dspBillableMinutes % 60 !== 0)
  ) {
    return {
      error: "DSP final billable time must be a positive whole number of hours.",
      ok: false,
      status: 400,
    };
  }

  if (
    bookingType === "DSP" &&
    suggestedDspBillableMinutes !== null &&
    dspBillableMinutes !== null &&
    safePriceReviewContext
  ) {
    const amended = dspBillableMinutes !== suggestedDspBillableMinutes;
    safePriceReviewContext = {
      ...safePriceReviewContext,
      billable_hours_amended: amended ? "yes" : "no",
      ...(amended
        ? {
            billable_hours_amendment_reason:
              safePriceReviewContext.billable_hours_amendment_reason,
          }
        : { billable_hours_amendment_reason: undefined }),
      suggested_billable_hours: String(suggestedDspBillableMinutes / 60),
    };
  }

  if (
    bookingType === "DSP" &&
    suggestedDspBillableMinutes !== null &&
    dspBillableMinutes !== null &&
    dspBillableMinutes !== suggestedDspBillableMinutes &&
    !safePriceReviewContext?.billable_hours_amendment_reason
  ) {
    return {
      error: "DSP amended billable hours require a safe amendment reason.",
      ok: false,
      status: 400,
    };
  }

  if (
    bookingType === "hourly" &&
    dspTotalMinutes !== null &&
    dspBillableMinutes !== null &&
    expectedHourlyBillableMinutes !== null &&
    dspBillableMinutes !== expectedHourlyBillableMinutes
  ) {
    return {
      error: "Hourly billable minutes must follow the 15-minute grace rule.",
      ok: false,
      status: 400,
    };
  }

  if (
    (priceDecision === "include_in_invoice" ||
      priceReviewStatus === "approved_for_invoice_draft") &&
    reviewedAmount === null &&
    bookingType !== "DSP"
  ) {
    return {
      error: "Including a billable item requires a reviewed customer amount.",
      ok: false,
      status: 400,
    };
  }

  if (
    priceReviewStatus === "approved_for_invoice_draft" &&
    priceDecision !== "include_in_invoice"
  ) {
    return {
      error: "Approved billable item price review must be included in invoice draft.",
      ok: false,
      status: 400,
    };
  }

  if (
    calculationBasis === "dsp_actual_time" &&
    (priceDecision === "include_in_invoice" ||
      priceReviewStatus === "approved_for_invoice_draft") &&
    (dspTotalMinutes === null || dspBillableMinutes === null)
  ) {
    return {
      error: "DSP billable item price review requires saved total and billable minutes.",
      ok: false,
      status: 400,
    };
  }

  if (
    priceReviewStatus === "blocked" &&
    !["blocked", "exclude_from_invoice", "needs_manager_review"].includes(priceDecision)
  ) {
    return {
      error: "Blocked billable item price review requires a blocked, excluded, or manager-review decision.",
      ok: false,
      status: 400,
    };
  }

  if (!sourcePriceContext || !safePriceReviewContext) {
    return {
      error: "Admin monthly invoice billable item price review context is malformed.",
      ok: false,
      status: 400,
    };
  }

  if (
    hasOwn(record, "safe_price_review_note") &&
    record.safe_price_review_note &&
    !safePriceReviewNote
  ) {
    return {
      error: "Admin monthly invoice billable item price review note is malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_item_type: billingItemType,
      booking_reference: bookingReference,
      booking_type: bookingType,
      calculation_basis: calculationBasis,
      currency,
      draft_id: draftId,
      draft_trip_link_id: draftTripLinkId,
      dsp_billable_minutes: dspBillableMinutes,
      dsp_total_minutes: dspTotalMinutes,
      item_review_id: itemReviewId,
      price_decision: priceDecision,
      price_review_id: priceReviewId,
      price_review_status: priceReviewStatus,
      reviewed_customer_amount_cents: reviewedAmount,
      safe_price_review_context: safePriceReviewContext,
      safe_price_review_note: hasOwn(record, "safe_price_review_note")
        ? safePriceReviewNote
        : null,
      source_price_context: sourcePriceContext,
    },
    ok: true,
  };
}

export async function loadAdminMonthlyInvoiceBillableItemPriceReviews(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceBillableItemPriceReviewLoadResult>> {
  const parsed = parseAdminMonthlyInvoiceBillableItemPriceReviewLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyPriceReviewSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_invoice_billable_item_price_reviews")
    .select(billableItemPriceReviewSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safePriceReviewLoadError, 500, error);
  }

  const reviews = asArray(data)
    .map(asRecord)
    .map(normalizePriceReviewRecord)
    .sort(
      (first, second) =>
        first.draft_id.localeCompare(second.draft_id) ||
        first.booking_reference.localeCompare(second.booking_reference) ||
        first.billing_item_type.localeCompare(second.billing_item_type),
    );
  const filteredReviews = filterPriceReviews(reviews, parsed.data);

  return {
    data: {
      pagination: buildPagination(filteredReviews, parsed.data),
      price_reviews: paginatePriceReviews(filteredReviews, parsed.data),
      version: adminMonthlyInvoiceBillableItemPriceReviewVersion,
    },
    ok: true,
  };
}

export async function saveAdminMonthlyInvoiceBillableItemPriceReview(
  input: AdminMonthlyInvoiceBillableItemPriceReviewInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceBillableItemPriceReviewRecord>> {
  const clientResult = getServerOnlyPriceReviewSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const lockResult = await assertAdminMonthlyInvoiceDraftUnlocked(clientResult.data, {
    draft_id: input.draft_id,
  });

  if (!lockResult.ok) {
    return lockResult;
  }

  let reviewedCustomerAmountCents = input.reviewed_customer_amount_cents;
  let sourcePriceContext = input.source_price_context;

  if (input.booking_type === "DSP") {
    const finalBillableMinutes = input.dsp_billable_minutes;

    if (finalBillableMinutes === null || finalBillableMinutes < 60 || finalBillableMinutes % 60 !== 0) {
      return {
        error: "DSP amount calculation requires final positive whole billable hours.",
        ok: false,
        status: 400,
      };
    }

    const { data: bookingRows, error: bookingError } = await clientResult.data
      .from("bookings")
      .select("booking_reference, company_id, traveler_id, service_type, pickup_at, vehicle_type_or_category")
      .eq("booking_reference", input.booking_reference)
      .limit(2);
    const bookingRecords = asArray(bookingRows).map(asRecord);
    const bookingRecord = bookingRecords.length === 1 ? bookingRecords[0] : null;
    const companyId = positiveInteger(bookingRecord?.company_id, 0, Number.MAX_SAFE_INTEGER);
    const travelerId = positiveInteger(bookingRecord?.traveler_id, 0, Number.MAX_SAFE_INTEGER);
    const vehicle = textOrNull(bookingRecord?.vehicle_type_or_category);

    if (
      bookingError ||
      !bookingRecord ||
      !companyId ||
      !vehicle ||
      validBookingType(bookingRecord.service_type) !== "DSP"
    ) {
      return bookingError
        ? safeAdapterFailure(safePriceReviewSaveError, 500, bookingError)
        : { error: safeDspPricingIdentityError, ok: false, status: 409 };
    }

    const { data: companyRows, error: companyError } = await clientResult.data
      .from("companies")
      .select("id, customer_rates")
      .eq("id", companyId)
      .limit(2);
    const companyRecords = asArray(companyRows).map(asRecord);
    const companyRecord = companyRecords.length === 1 ? companyRecords[0] : null;

    if (companyError || !companyRecord) {
      return companyError
        ? safeAdapterFailure(safePriceReviewSaveError, 500, companyError)
        : { error: safeDspPricingIdentityError, ok: false, status: 409 };
    }

    let travelerRecord: UnknownRecord | null = null;

    if (travelerId) {
      const { data: travelerRows, error: travelerError } = await clientResult.data
        .from("travelers")
        .select("id, company_id, customer_rates")
        .eq("id", travelerId)
        .eq("company_id", companyId)
        .limit(2);
      const travelerRecords = asArray(travelerRows).map(asRecord);

      if (travelerError || travelerRecords.length !== 1) {
        return travelerError
          ? safeAdapterFailure(safePriceReviewSaveError, 500, travelerError)
          : { error: safeDspPricingIdentityError, ok: false, status: 409 };
      }

      travelerRecord = travelerRecords[0];
    }

    const pickupAt = textOrNull(bookingRecord.pickup_at) || "";
    const pickupTime = pickupAt.match(/T(\d{2}):(\d{2})/)?.slice(1).join("") || "";
    const pricing = resolvePricing(
      { bookingType: "DSP", time: pickupTime, vehicle },
      companyRecord,
      travelerRecord,
      initialRateSettings,
    );
    const finalBillableHours = finalBillableMinutes / 60;
    const calculatedAmountCents = Math.round(pricing.customerRate * finalBillableHours * 100);

    if (calculatedAmountCents <= 0 || calculatedAmountCents > maxReviewedAmountCents) {
      return { error: safeDspPricingIdentityError, ok: false, status: 409 };
    }

    if (
      reviewedCustomerAmountCents !== null &&
      reviewedCustomerAmountCents !== calculatedAmountCents
    ) {
      return {
        error: "DSP reviewed amount does not match the verified CRM vehicle rate and final billable hours.",
        ok: false,
        status: 409,
      };
    }

    reviewedCustomerAmountCents = calculatedAmountCents;
    sourcePriceContext = {
      ...sourcePriceContext,
      calculated_billable_hours: String(finalBillableHours),
      calculated_hourly_rate_cents: Math.round(pricing.customerRate * 100),
      pricing_source: pricing.pricingSource,
      vehicle_rate_category: vehicle,
    };
  }

  const payload = {
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    billing_item_type: input.billing_item_type,
    booking_reference: input.booking_reference,
    booking_type: input.booking_type,
    calculation_basis: input.calculation_basis,
    currency: input.currency,
    draft_id: input.draft_id,
    draft_trip_link_id: input.draft_trip_link_id,
    dsp_billable_minutes: input.dsp_billable_minutes,
    dsp_total_minutes: input.dsp_total_minutes,
    item_review_id: input.item_review_id,
    price_decision: input.price_decision,
    price_review_status: input.price_review_status,
    reviewed_customer_amount_cents: reviewedCustomerAmountCents,
    safe_price_review_context: input.safe_price_review_context,
    safe_price_review_note: input.safe_price_review_note,
    source_price_context: sourcePriceContext,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
  const writeQuery = input.price_review_id
    ? clientResult.data
        .from("monthly_invoice_billable_item_price_reviews")
        .update(payload)
        .eq("id", input.price_review_id)
    : clientResult.data
        .from("monthly_invoice_billable_item_price_reviews")
        .upsert(payload, {
          onConflict: "item_review_id,billing_item_type",
        });
  const { data, error } = await writeQuery.select(billableItemPriceReviewSelect).single();

  if (error) {
    return safeAdapterFailure(safePriceReviewSaveError, 500, error);
  }

  return {
    data: normalizePriceReviewRecord(asRecord(data)),
    ok: true,
  };
}
