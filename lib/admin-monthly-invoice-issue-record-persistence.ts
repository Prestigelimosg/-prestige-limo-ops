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

export const adminMonthlyInvoiceIssueRecordPersistenceVersion =
  "stage-monthly-invoice-issue-record-api-v1";

export const adminMonthlyInvoiceIssueRecordStatuses = [
  "draft_locked",
  "invoice_number_reserved",
  "pdf_generation_ready",
  "pdf_generated_not_sent",
  "sent_manually",
  "unpaid",
  "paid",
  "blocked",
  "voided",
  "archived",
] as const;

export const adminMonthlyInvoiceDraftLockStatuses = [
  "locked_for_issue",
  "lock_blocked",
  "released_for_review",
  "archived",
] as const;

export const adminMonthlyInvoiceNumberStatuses = [
  "not_reserved",
  "ready_to_reserve",
  "reserved",
  "reservation_blocked",
  "voided",
] as const;

export const adminMonthlyInvoicePdfGenerationStatuses = [
  "not_requested",
  "ready_to_generate",
  "generated_not_sent",
  "generation_blocked",
] as const;

export const adminMonthlyInvoiceDeliveryStatuses = [
  "not_sent",
  "sent_manually",
  "send_blocked",
] as const;

export const adminMonthlyInvoicePaymentRecordStatuses = [
  "not_recorded",
  "unpaid",
  "paid",
  "manual_review",
  "voided",
] as const;

export type AdminMonthlyInvoiceIssueRecordStatus =
  (typeof adminMonthlyInvoiceIssueRecordStatuses)[number];
export type AdminMonthlyInvoiceDraftLockStatus =
  (typeof adminMonthlyInvoiceDraftLockStatuses)[number];
export type AdminMonthlyInvoiceNumberStatus =
  (typeof adminMonthlyInvoiceNumberStatuses)[number];
export type AdminMonthlyInvoicePdfGenerationStatus =
  (typeof adminMonthlyInvoicePdfGenerationStatuses)[number];
export type AdminMonthlyInvoiceDeliveryStatus =
  (typeof adminMonthlyInvoiceDeliveryStatuses)[number];
export type AdminMonthlyInvoicePaymentRecordStatus =
  (typeof adminMonthlyInvoicePaymentRecordStatuses)[number];

export type AdminMonthlyInvoiceIssueRecordSafeContext = {
  delivery_status?: string;
  invoice_number_status?: string;
  issue_summary?: string;
  lock_status?: string;
  next_action?: string;
  payment_record_status?: string;
  pdf_generation_status?: string;
};

export type AdminMonthlyInvoiceIssueRecordInput = {
  billing_month: string;
  customer_account: string;
  draft_id: string;
  draft_lock_status: AdminMonthlyInvoiceDraftLockStatus;
  invoice_delivery_status: AdminMonthlyInvoiceDeliveryStatus;
  invoice_number: string | null;
  invoice_number_status: AdminMonthlyInvoiceNumberStatus;
  issue_record_status: AdminMonthlyInvoiceIssueRecordStatus;
  issue_review_id: string;
  payment_record_status: AdminMonthlyInvoicePaymentRecordStatus;
  pdf_generation_status: AdminMonthlyInvoicePdfGenerationStatus;
  safe_issue_record_context: AdminMonthlyInvoiceIssueRecordSafeContext;
  safe_issue_record_note: string | null;
  source_issue_review_summary: Record<string, unknown>;
};

export type AdminMonthlyInvoiceIssueRecordUpdateInput =
  AdminMonthlyInvoiceIssueRecordInput & {
    issue_record_id: string | null;
  };

export type AdminMonthlyInvoiceIssueRecordPdfReadyInput = {
  issue_record_id: string;
  safe_issue_record_note: string | null;
};

export type AdminMonthlyInvoiceIssueRecordLoadParams = {
  billing_month: string | null;
  customer_account_search: string | null;
  draft_id: string | null;
  invoice_delivery_status: AdminMonthlyInvoiceDeliveryStatus | null;
  invoice_number_status: AdminMonthlyInvoiceNumberStatus | null;
  issue_record_id: string | null;
  issue_record_status: AdminMonthlyInvoiceIssueRecordStatus | null;
  issue_review_id: string | null;
  limit: number;
  page: number;
  payment_record_status: AdminMonthlyInvoicePaymentRecordStatus | null;
  pdf_generation_status: AdminMonthlyInvoicePdfGenerationStatus | null;
};

export type AdminMonthlyInvoiceIssueRecordRecord =
  AdminMonthlyInvoiceIssueRecordInput & {
    actor_label: string | null;
    actor_role: "admin" | "dispatcher" | "system";
    created_at: string | null;
    id: string | null;
    source_surface: "admin_api" | "admin_dashboard" | "migration" | "system";
    updated_at: string | null;
  };

export type AdminMonthlyInvoiceIssueRecordPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_record_count: number;
};

export type AdminMonthlyInvoiceIssueRecordLoadResult = {
  issue_records: AdminMonthlyInvoiceIssueRecordRecord[];
  pagination: AdminMonthlyInvoiceIssueRecordPagination;
  version: typeof adminMonthlyInvoiceIssueRecordPersistenceVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxCustomerAccountLength = 160;
const maxSearchLength = 80;
const maxSafeIssueRecordNoteLength = 1000;
const maxSafeContextTextLength = 500;
const maxSafeJsonLength = 3000;
const maxIssueRecordLimit = 250;
const defaultIssueRecordLimit = 25;
const maxIssueRecordPage = 1000;
const maxReadRows = 500;
const invoiceIssueRecordSelect =
  "id, issue_review_id, draft_id, customer_account, billing_month, issue_record_status, draft_lock_status, invoice_number, invoice_number_status, pdf_generation_status, invoice_delivery_status, payment_record_status, source_issue_review_summary, safe_issue_record_note, safe_issue_record_context, source_surface, actor_role, actor_label, created_at, updated_at";
const disabledIssueRecordPersistenceError =
  "Admin monthly invoice issue record persistence is not enabled on this server.";
const safeIssueRecordConfigError =
  "Admin monthly invoice issue record persistence configuration is not ready.";
const safeIssueRecordActorError =
  "Admin monthly invoice issue record persistence requires a verified internal boundary.";
const safeIssueRecordServerSessionActorError =
  "Admin monthly invoice issue record persistence requires a verified admin or dispatcher server session.";
const safeIssueRecordSaveError =
  "Admin monthly invoice issue record save failed safely.";
const safeIssueRecordLoadError =
  "Admin monthly invoice issue record load failed safely.";
const safeIssueRecordUpdateError =
  "Admin monthly invoice issue record update failed safely.";
const safeIssueRecordPdfReadyError =
  "Admin monthly invoice issue record PDF review transition failed safely.";
const allowedIssueRecordStatuses = new Set<string>(
  adminMonthlyInvoiceIssueRecordStatuses,
);
const allowedDraftLockStatuses = new Set<string>(adminMonthlyInvoiceDraftLockStatuses);
const allowedInvoiceNumberStatuses = new Set<string>(adminMonthlyInvoiceNumberStatuses);
const allowedPdfGenerationStatuses = new Set<string>(
  adminMonthlyInvoicePdfGenerationStatuses,
);
const allowedInvoiceDeliveryStatuses = new Set<string>(
  adminMonthlyInvoiceDeliveryStatuses,
);
const allowedPaymentRecordStatuses = new Set<string>(
  adminMonthlyInvoicePaymentRecordStatuses,
);
const allowedSourceSurfaces = new Set(["admin_api", "admin_dashboard", "migration", "system"]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const statusesRequiringReservedInvoiceNumber = new Set([
  "invoice_number_reserved",
  "pdf_generation_ready",
  "pdf_generated_not_sent",
  "sent_manually",
  "unpaid",
  "paid",
]);
const allowedReadParams = new Set([
  "billing_month",
  "customer_account_search",
  "customer_search",
  "account_search",
  "draft_id",
  "invoice_delivery_status",
  "invoice_number_status",
  "issue_record_id",
  "issue_record_status",
  "issue_review_id",
  "limit",
  "page",
  "payment_record_status",
  "pdf_generation_status",
]);
const allowedSaveFields = new Set([
  "billing_month",
  "customer_account",
  "delivery_status",
  "draft_id",
  "draft_lock_status",
  "invoice_delivery_status",
  "invoice_number",
  "invoice_number_status",
  "issue_record_id",
  "issue_record_status",
  "issue_review_id",
  "issue_summary",
  "lock_status",
  "next_action",
  "payment_record_status",
  "pdf_generation_status",
  "safe_issue_record_context",
  "safe_issue_record_note",
  "source_issue_review_summary",
]);
const allowedPdfReadyFields = new Set([
  "issue_record_id",
  "safe_issue_record_note",
]);
const allowedSafeContextFields = new Set([
  "delivery_status",
  "invoice_number_status",
  "issue_summary",
  "lock_status",
  "next_action",
  "payment_record_status",
  "pdf_generation_status",
]);
const forbiddenIssueRecordFragments = [
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
  "finance",
  "finance_note",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice_pdf_url",
  "live_location",
  "mock_archive",
  "mock_qa",
  "notification",
  "notification_delivery",
  "paid_amount",
  "passenger_email",
  "passenger_phone",
  "payment_amount",
  "payment_link",
  "paynow",
  "pay_now",
  "pdf_link",
  "pdf_url",
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

function includesForbiddenIssueRecordFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenIssueRecordFragments.some((fragment) => normalized.includes(fragment));
}

function forbiddenIssueRecordResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin monthly invoice issue record details include unsupported or unsafe fields.",
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
    const keyLeaks = includesForbiddenIssueRecordFragment(key) ? [currentPath] : [];

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

  return includesForbiddenIssueRecordFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenIssueRecordFragment(cleaned)) {
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

function validBillingMonth(value: unknown) {
  const cleaned = textOrNull(value);
  const match = cleaned?.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? cleaned : null;
}

function validUuid(value: unknown) {
  const cleaned = safeText(value, 80);

  return cleaned && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(cleaned)
    ? cleaned
    : null;
}

function validInvoiceNumber(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 64 || includesForbiddenIssueRecordFragment(cleaned)) {
    return null;
  }

  return /^[A-Z0-9][A-Z0-9-]{2,63}$/.test(cleaned) ? cleaned : null;
}

function validIssueRecordStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedIssueRecordStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceIssueRecordStatus)
    : null;
}

function validDraftLockStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedDraftLockStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDraftLockStatus)
    : null;
}

function validInvoiceNumberStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedInvoiceNumberStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceNumberStatus)
    : null;
}

function validPdfGenerationStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedPdfGenerationStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoicePdfGenerationStatus)
    : null;
}

function validInvoiceDeliveryStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedInvoiceDeliveryStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoiceDeliveryStatus)
    : null;
}

function validPaymentRecordStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && allowedPaymentRecordStatuses.has(cleaned)
    ? (cleaned as AdminMonthlyInvoicePaymentRecordStatus)
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
  const contextRecord = asRecord(record.safe_issue_record_context);
  const unknownContextFields = unknownKeys(
    contextRecord,
    allowedSafeContextFields,
    "safe_issue_record_context",
  );

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
  const lockStatus = optionalSafeText(
    contextRecord.lock_status ?? record.lock_status,
    maxSafeContextTextLength,
  );
  const invoiceNumberStatus = optionalSafeText(
    contextRecord.invoice_number_status ?? record.invoice_number_status,
    maxSafeContextTextLength,
  );
  const pdfGenerationStatus = optionalSafeText(
    contextRecord.pdf_generation_status ?? record.pdf_generation_status,
    maxSafeContextTextLength,
  );
  const deliveryStatus = optionalSafeText(
    contextRecord.delivery_status ?? record.delivery_status,
    maxSafeContextTextLength,
  );
  const paymentRecordStatus = optionalSafeText(
    contextRecord.payment_record_status ?? record.payment_record_status,
    maxSafeContextTextLength,
  );

  if (
    ((contextRecord.issue_summary ?? record.issue_summary) && !issueSummary) ||
    ((contextRecord.next_action ?? record.next_action) && !nextAction) ||
    ((contextRecord.lock_status ?? record.lock_status) && !lockStatus) ||
    ((contextRecord.invoice_number_status ?? record.invoice_number_status) && !invoiceNumberStatus) ||
    ((contextRecord.pdf_generation_status ?? record.pdf_generation_status) && !pdfGenerationStatus) ||
    ((contextRecord.delivery_status ?? record.delivery_status) && !deliveryStatus) ||
    ((contextRecord.payment_record_status ?? record.payment_record_status) && !paymentRecordStatus)
  ) {
    return null;
  }

  return {
    ...(deliveryStatus ? { delivery_status: deliveryStatus } : {}),
    ...(invoiceNumberStatus ? { invoice_number_status: invoiceNumberStatus } : {}),
    ...(issueSummary ? { issue_summary: issueSummary } : {}),
    ...(lockStatus ? { lock_status: lockStatus } : {}),
    ...(nextAction ? { next_action: nextAction } : {}),
    ...(paymentRecordStatus ? { payment_record_status: paymentRecordStatus } : {}),
    ...(pdfGenerationStatus ? { pdf_generation_status: pdfGenerationStatus } : {}),
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
      error: safeIssueRecordActorError,
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
      error: safeIssueRecordServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyIssueRecordSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledIssueRecordPersistenceError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeIssueRecordConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeIssueRecordConfigError,
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
      error: safeIssueRecordConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeIssueRecordRecord(row: UnknownRecord): AdminMonthlyInvoiceIssueRecordRecord {
  return {
    actor_label: textOrNull(row.actor_label),
    actor_role: allowedActorRoles.has(String(row.actor_role))
      ? (String(row.actor_role) as "admin" | "dispatcher" | "system")
      : "system",
    billing_month: textOrNull(row.billing_month) || "",
    created_at: textOrNull(row.created_at),
    customer_account: textOrNull(row.customer_account) || "",
    draft_id: textOrNull(row.draft_id) || "",
    draft_lock_status:
      validDraftLockStatus(row.draft_lock_status) || "locked_for_issue",
    id: textOrNull(row.id),
    invoice_delivery_status:
      validInvoiceDeliveryStatus(row.invoice_delivery_status) || "not_sent",
    invoice_number: textOrNull(row.invoice_number),
    invoice_number_status:
      validInvoiceNumberStatus(row.invoice_number_status) || "not_reserved",
    issue_record_status:
      validIssueRecordStatus(row.issue_record_status) || "draft_locked",
    issue_review_id: textOrNull(row.issue_review_id) || "",
    payment_record_status:
      validPaymentRecordStatus(row.payment_record_status) || "not_recorded",
    pdf_generation_status:
      validPdfGenerationStatus(row.pdf_generation_status) || "not_requested",
    safe_issue_record_context: asRecord(
      row.safe_issue_record_context,
    ) as AdminMonthlyInvoiceIssueRecordSafeContext,
    safe_issue_record_note: textOrNull(row.safe_issue_record_note),
    source_issue_review_summary: asRecord(row.source_issue_review_summary),
    source_surface: allowedSourceSurfaces.has(String(row.source_surface))
      ? (String(row.source_surface) as "admin_api" | "admin_dashboard" | "migration" | "system")
      : "system",
    updated_at: textOrNull(row.updated_at),
  };
}

function filterIssueRecords(
  records: AdminMonthlyInvoiceIssueRecordRecord[],
  params: AdminMonthlyInvoiceIssueRecordLoadParams,
) {
  const search = params.customer_account_search?.toLowerCase() || "";

  return records.filter((record) => {
    if (params.issue_record_id && record.id !== params.issue_record_id) {
      return false;
    }

    if (params.issue_review_id && record.issue_review_id !== params.issue_review_id) {
      return false;
    }

    if (params.draft_id && record.draft_id !== params.draft_id) {
      return false;
    }

    if (params.billing_month && record.billing_month !== params.billing_month) {
      return false;
    }

    if (search && !record.customer_account.toLowerCase().includes(search)) {
      return false;
    }

    if (params.issue_record_status && record.issue_record_status !== params.issue_record_status) {
      return false;
    }

    if (
      params.invoice_number_status &&
      record.invoice_number_status !== params.invoice_number_status
    ) {
      return false;
    }

    if (
      params.pdf_generation_status &&
      record.pdf_generation_status !== params.pdf_generation_status
    ) {
      return false;
    }

    if (
      params.invoice_delivery_status &&
      record.invoice_delivery_status !== params.invoice_delivery_status
    ) {
      return false;
    }

    return !params.payment_record_status ||
      record.payment_record_status === params.payment_record_status;
  });
}

function paginateIssueRecords(
  records: AdminMonthlyInvoiceIssueRecordRecord[],
  params: AdminMonthlyInvoiceIssueRecordLoadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return records.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  records: AdminMonthlyInvoiceIssueRecordRecord[],
  params: AdminMonthlyInvoiceIssueRecordLoadParams,
): AdminMonthlyInvoiceIssueRecordPagination {
  const pageCount = records.length > 0 ? Math.ceil(records.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_record_count: records.length,
  };
}

function validateIssueRecordState(
  input: Pick<
    AdminMonthlyInvoiceIssueRecordInput,
    | "invoice_delivery_status"
    | "invoice_number"
    | "invoice_number_status"
    | "issue_record_status"
    | "payment_record_status"
  >,
) {
  if (input.invoice_number && input.invoice_number_status !== "reserved") {
    return false;
  }

  if (input.invoice_number_status === "reserved" && !input.invoice_number) {
    return false;
  }

  if (
    statusesRequiringReservedInvoiceNumber.has(input.issue_record_status) &&
    input.invoice_number_status !== "reserved"
  ) {
    return false;
  }

  if (
    ["unpaid", "paid"].includes(input.payment_record_status) &&
    input.invoice_delivery_status !== "sent_manually"
  ) {
    return false;
  }

  return true;
}

export function parseAdminMonthlyInvoiceIssueRecordLoadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyInvoiceIssueRecordLoadParams> {
  const unsafeParams = paramEntries(params).filter(
    ([key, value]) =>
      !allowedReadParams.has(key) ||
      includesForbiddenIssueRecordFragment(key) ||
      includesForbiddenIssueRecordFragment(String(value ?? "")),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Admin monthly invoice issue record read includes unsupported or unsafe fields.",
      ok: false,
      status: 400,
    };
  }

  const issueRecordIdValue = readParamsValue(params, "issue_record_id");
  const issueRecordId =
    issueRecordIdValue === undefined || issueRecordIdValue === null || issueRecordIdValue === ""
      ? null
      : validUuid(issueRecordIdValue);

  if (issueRecordIdValue && !issueRecordId) {
    return {
      error: "Malformed monthly invoice issue record id rejected.",
      ok: false,
      status: 400,
    };
  }

  const issueReviewIdValue = readParamsValue(params, "issue_review_id");
  const issueReviewId =
    issueReviewIdValue === undefined || issueReviewIdValue === null || issueReviewIdValue === ""
      ? null
      : validUuid(issueReviewIdValue);

  if (issueReviewIdValue && !issueReviewId) {
    return {
      error: "Malformed monthly invoice issue review id rejected.",
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
      error: "Malformed monthly invoice issue record draft_id rejected.",
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
      error: "Malformed monthly invoice issue record billing_month rejected.",
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
      error: "Malformed monthly invoice issue record customer/account search rejected.",
      ok: false,
      status: 400,
    };
  }

  const issueRecordStatusValue = readParamsValue(params, "issue_record_status");
  const issueRecordStatus =
    issueRecordStatusValue === undefined || issueRecordStatusValue === null || issueRecordStatusValue === ""
      ? null
      : validIssueRecordStatus(issueRecordStatusValue);

  if (issueRecordStatusValue && !issueRecordStatus) {
    return {
      error: "Malformed monthly invoice issue record status rejected.",
      ok: false,
      status: 400,
    };
  }

  const invoiceNumberStatusValue = readParamsValue(params, "invoice_number_status");
  const invoiceNumberStatus =
    invoiceNumberStatusValue === undefined ||
    invoiceNumberStatusValue === null ||
    invoiceNumberStatusValue === ""
      ? null
      : validInvoiceNumberStatus(invoiceNumberStatusValue);

  if (invoiceNumberStatusValue && !invoiceNumberStatus) {
    return {
      error: "Malformed monthly invoice number status rejected.",
      ok: false,
      status: 400,
    };
  }

  const pdfGenerationStatusValue = readParamsValue(params, "pdf_generation_status");
  const pdfGenerationStatus =
    pdfGenerationStatusValue === undefined ||
    pdfGenerationStatusValue === null ||
    pdfGenerationStatusValue === ""
      ? null
      : validPdfGenerationStatus(pdfGenerationStatusValue);

  if (pdfGenerationStatusValue && !pdfGenerationStatus) {
    return {
      error: "Malformed monthly invoice PDF generation status rejected.",
      ok: false,
      status: 400,
    };
  }

  const invoiceDeliveryStatusValue = readParamsValue(params, "invoice_delivery_status");
  const invoiceDeliveryStatus =
    invoiceDeliveryStatusValue === undefined ||
    invoiceDeliveryStatusValue === null ||
    invoiceDeliveryStatusValue === ""
      ? null
      : validInvoiceDeliveryStatus(invoiceDeliveryStatusValue);

  if (invoiceDeliveryStatusValue && !invoiceDeliveryStatus) {
    return {
      error: "Malformed monthly invoice delivery status rejected.",
      ok: false,
      status: 400,
    };
  }

  const paymentRecordStatusValue = readParamsValue(params, "payment_record_status");
  const paymentRecordStatus =
    paymentRecordStatusValue === undefined ||
    paymentRecordStatusValue === null ||
    paymentRecordStatusValue === ""
      ? null
      : validPaymentRecordStatus(paymentRecordStatusValue);

  if (paymentRecordStatusValue && !paymentRecordStatus) {
    return {
      error: "Malformed monthly invoice payment record status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultIssueRecordLimit,
    maxIssueRecordLimit,
  );

  if (!limit) {
    return {
      error: "Malformed monthly invoice issue record limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxIssueRecordPage);

  if (!page) {
    return {
      error: "Malformed monthly invoice issue record page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      customer_account_search: customerAccountSearch,
      draft_id: draftId,
      invoice_delivery_status: invoiceDeliveryStatus,
      invoice_number_status: invoiceNumberStatus,
      issue_record_id: issueRecordId,
      issue_record_status: issueRecordStatus,
      issue_review_id: issueReviewId,
      limit,
      page,
      payment_record_status: paymentRecordStatus,
      pdf_generation_status: pdfGenerationStatus,
    },
    ok: true,
  };
}

function parseIssueRecordPayload(
  value: unknown,
  mode: "create" | "update",
): AdminBookingResult<AdminMonthlyInvoiceIssueRecordUpdateInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedSaveFields, "invoice_issue_record").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenIssueRecordResult();
  }

  const issueRecordId =
    record.issue_record_id === undefined || record.issue_record_id === null || record.issue_record_id === ""
      ? null
      : validUuid(record.issue_record_id);
  const issueReviewId = validUuid(record.issue_review_id);
  const draftId = validUuid(record.draft_id);
  const customerAccount = safeText(record.customer_account, maxCustomerAccountLength);
  const billingMonth = validBillingMonth(record.billing_month);
  const issueRecordStatus =
    validIssueRecordStatus(record.issue_record_status) || "draft_locked";
  const draftLockStatus =
    validDraftLockStatus(record.draft_lock_status) || "locked_for_issue";
  const invoiceNumberStatus =
    validInvoiceNumberStatus(record.invoice_number_status) || "not_reserved";
  const invoiceNumber =
    record.invoice_number === undefined || record.invoice_number === null || record.invoice_number === ""
      ? null
      : validInvoiceNumber(record.invoice_number);
  const pdfGenerationStatus =
    validPdfGenerationStatus(record.pdf_generation_status) || "not_requested";
  const invoiceDeliveryStatus =
    validInvoiceDeliveryStatus(record.invoice_delivery_status) || "not_sent";
  const paymentRecordStatus =
    validPaymentRecordStatus(record.payment_record_status) || "not_recorded";
  const sourceIssueReviewSummary = safeObject(
    record.source_issue_review_summary,
    maxSafeJsonLength,
  );
  const safeIssueRecordContext = parseSafeContext(record);
  const safeIssueRecordNote = optionalSafeText(
    record.safe_issue_record_note,
    maxSafeIssueRecordNoteLength,
  );

  if (
    (record.issue_record_id && !issueRecordId) ||
    (mode === "update" && !issueRecordId && !record.issue_review_id && !record.draft_id) ||
    !issueReviewId ||
    !draftId ||
    !customerAccount ||
    !billingMonth ||
    !issueRecordStatus ||
    !draftLockStatus ||
    !invoiceNumberStatus ||
    (record.invoice_number && !invoiceNumber) ||
    !pdfGenerationStatus ||
    !invoiceDeliveryStatus ||
    !paymentRecordStatus ||
    !sourceIssueReviewSummary ||
    !safeIssueRecordContext ||
    (hasOwn(record, "safe_issue_record_note") &&
      record.safe_issue_record_note &&
      !safeIssueRecordNote)
  ) {
    return {
      error: "Admin monthly invoice issue record details are malformed.",
      ok: false,
      status: 400,
    };
  }

  const parsed = {
    billing_month: billingMonth,
    customer_account: customerAccount,
    draft_id: draftId,
    draft_lock_status: draftLockStatus,
    invoice_delivery_status: invoiceDeliveryStatus,
    invoice_number: invoiceNumber,
    invoice_number_status: invoiceNumberStatus,
    issue_record_id: issueRecordId,
    issue_record_status: issueRecordStatus,
    issue_review_id: issueReviewId,
    payment_record_status: paymentRecordStatus,
    pdf_generation_status: pdfGenerationStatus,
    safe_issue_record_context: safeIssueRecordContext,
    safe_issue_record_note: safeIssueRecordNote,
    source_issue_review_summary: sourceIssueReviewSummary,
  };

  if (invoiceNumber) {
    return {
      error: "Admin monthly invoice numbers must be reserved through the approved sequence API.",
      ok: false,
      status: 400,
    };
  }

  if (!validateIssueRecordState(parsed)) {
    return {
      error: "Admin monthly invoice issue record status combination is not allowed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: parsed,
    ok: true,
  };
}

export function parseAdminMonthlyInvoiceIssueRecordCreatePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceIssueRecordInput> {
  const parsed = parseIssueRecordPayload(value, "create");

  return parsed.ok
    ? {
        data: parsed.data,
        ok: true,
      }
    : parsed;
}

export function parseAdminMonthlyInvoiceIssueRecordUpdatePayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceIssueRecordUpdateInput> {
  return parseIssueRecordPayload(value, "update");
}

export function parseAdminMonthlyInvoiceIssueRecordPdfReadyPayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceIssueRecordPdfReadyInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedPdfReadyFields, "invoice_issue_record_pdf_ready").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenIssueRecordResult();
  }

  const issueRecordId = validUuid(record.issue_record_id);
  const safeIssueRecordNote = optionalSafeText(
    record.safe_issue_record_note,
    maxSafeIssueRecordNoteLength,
  );

  if (
    !issueRecordId ||
    (hasOwn(record, "safe_issue_record_note") &&
      record.safe_issue_record_note &&
      !safeIssueRecordNote)
  ) {
    return {
      error: "Admin monthly invoice issue record PDF review details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      issue_record_id: issueRecordId,
      safe_issue_record_note: safeIssueRecordNote,
    },
    ok: true,
  };
}

export async function loadAdminMonthlyInvoiceIssueRecords(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueRecordLoadResult>> {
  const parsed = parseAdminMonthlyInvoiceIssueRecordLoadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyIssueRecordSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_invoice_issue_records")
    .select(invoiceIssueRecordSelect)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeIssueRecordLoadError, 500, error);
  }

  const records = asArray(data)
    .map(asRecord)
    .map(normalizeIssueRecordRecord)
    .sort(
      (first, second) =>
        first.customer_account.localeCompare(second.customer_account) ||
        first.billing_month.localeCompare(second.billing_month),
    );
  const filteredRecords = filterIssueRecords(records, parsed.data);

  return {
    data: {
      issue_records: paginateIssueRecords(filteredRecords, parsed.data),
      pagination: buildPagination(filteredRecords, parsed.data),
      version: adminMonthlyInvoiceIssueRecordPersistenceVersion,
    },
    ok: true,
  };
}

function issueRecordPayload(
  input: AdminMonthlyInvoiceIssueRecordInput,
  actor: AdminBookingPersistenceAdapterActor,
) {
  return {
    billing_month: input.billing_month,
    customer_account: input.customer_account,
    draft_id: input.draft_id,
    draft_lock_status: input.draft_lock_status,
    invoice_delivery_status: input.invoice_delivery_status,
    invoice_number: input.invoice_number,
    invoice_number_status: input.invoice_number_status,
    issue_record_status: input.issue_record_status,
    issue_review_id: input.issue_review_id,
    payment_record_status: input.payment_record_status,
    pdf_generation_status: input.pdf_generation_status,
    safe_issue_record_context: input.safe_issue_record_context,
    safe_issue_record_note: input.safe_issue_record_note,
    source_issue_review_summary: input.source_issue_review_summary,
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    source_surface: actor.source_surface,
    updated_at: new Date().toISOString(),
  };
}

export async function createAdminMonthlyInvoiceIssueRecord(
  input: AdminMonthlyInvoiceIssueRecordInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueRecordRecord>> {
  const clientResult = getServerOnlyIssueRecordSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("monthly_invoice_issue_records")
    .upsert(issueRecordPayload(input, actor), {
      onConflict: "issue_review_id",
    })
    .select(invoiceIssueRecordSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeIssueRecordSaveError, 500, error);
  }

  return {
    data: normalizeIssueRecordRecord(asRecord(data)),
    ok: true,
  };
}

export async function updateAdminMonthlyInvoiceIssueRecord(
  input: AdminMonthlyInvoiceIssueRecordUpdateInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueRecordRecord>> {
  const clientResult = getServerOnlyIssueRecordSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  let updateQuery = clientResult.data
    .from("monthly_invoice_issue_records")
    .update(issueRecordPayload(input, actor));

  if (input.issue_record_id) {
    updateQuery = updateQuery.eq("id", input.issue_record_id);
  } else if (input.issue_review_id) {
    updateQuery = updateQuery.eq("issue_review_id", input.issue_review_id);
  } else {
    updateQuery = updateQuery.eq("draft_id", input.draft_id);
  }

  const { data, error } = await updateQuery.select(invoiceIssueRecordSelect).single();

  if (error) {
    return safeAdapterFailure(safeIssueRecordUpdateError, 500, error);
  }

  return {
    data: normalizeIssueRecordRecord(asRecord(data)),
    ok: true,
  };
}

export async function markAdminMonthlyInvoiceIssueRecordPdfReviewReady(
  input: AdminMonthlyInvoiceIssueRecordPdfReadyInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceIssueRecordRecord>> {
  const clientResult = getServerOnlyIssueRecordSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data: existingRows, error: loadError } = await clientResult.data
    .from("monthly_invoice_issue_records")
    .select(invoiceIssueRecordSelect)
    .eq("id", input.issue_record_id)
    .limit(1);

  if (loadError) {
    return safeAdapterFailure(safeIssueRecordPdfReadyError, 500, loadError);
  }

  const existingRecord = asArray(existingRows).map(asRecord).map(normalizeIssueRecordRecord)[0];

  if (!existingRecord) {
    return {
      error: "Admin monthly invoice issue record was not found.",
      ok: false,
      status: 404,
    };
  }

  if (
    existingRecord.issue_record_status !== "invoice_number_reserved" ||
    existingRecord.draft_lock_status !== "locked_for_issue" ||
    existingRecord.invoice_number_status !== "reserved" ||
    !textOrNull(existingRecord.invoice_number) ||
    existingRecord.pdf_generation_status !== "not_requested" ||
    existingRecord.invoice_delivery_status !== "not_sent" ||
    existingRecord.payment_record_status !== "not_recorded"
  ) {
    return {
      error: "Admin monthly invoice issue record is not ready for PDF review.",
      ok: false,
      status: 400,
    };
  }

  const safeIssueRecordContext: AdminMonthlyInvoiceIssueRecordSafeContext = {
    ...asRecord(existingRecord.safe_issue_record_context),
    invoice_number_status: "Invoice number reserved through approved sequence API.",
    issue_summary:
      textOrNull(existingRecord.safe_issue_record_context?.issue_summary) ||
      "Saved monthly invoice issue record marked ready for PDF review.",
    next_action:
      "Review PDF generation separately before any file creation, sending, or settlement step.",
    pdf_generation_status: "Ready for separately approved PDF generation review.",
  };
  const safeIssueRecordNote =
    input.safe_issue_record_note ||
    textOrNull(existingRecord.safe_issue_record_note) ||
    "Marked ready for separate PDF review from admin monthly invoice issue record control.";
  const { data, error } = await clientResult.data
    .from("monthly_invoice_issue_records")
    .update({
      actor_label: actor.actor_label,
      actor_role: actor.actor_role,
      issue_record_status: "pdf_generation_ready",
      pdf_generation_status: "ready_to_generate",
      safe_issue_record_context: safeIssueRecordContext,
      safe_issue_record_note: safeIssueRecordNote,
      source_surface: actor.source_surface,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.issue_record_id)
    .select(invoiceIssueRecordSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeIssueRecordPdfReadyError, 500, error);
  }

  return {
    data: normalizeIssueRecordRecord(asRecord(data)),
    ok: true,
  };
}
