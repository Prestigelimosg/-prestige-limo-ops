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
import { loadAdminMonthlyBillingGroups } from "./admin-monthly-billing-grouping-read";
import type { AdminMonthlyInvoiceDraftTripReadinessStatus } from "./admin-monthly-invoice-draft-persistence";

export const adminMonthlyInvoiceDraftTripCandidatesVersion =
  "stage-monthly-invoice-draft-ready-unbilled-candidates-v3";

export type AdminMonthlyInvoiceDraftTripCandidateParams = {
  billing_month: string;
  booker_id: number;
  company_id: number;
  customer_account: string;
  customer_id: string;
  limit: number;
  page: number;
};

export type AdminMonthlyInvoiceDraftTripCandidate = {
  billing_month: string;
  billing_prep_readiness: string | null;
  booking_reference: string;
  booker_id: number;
  closeout_id: string | null;
  closeout_status: string | null;
  company_id: number;
  customer_account: string;
  customer_id: string;
  safe_trip_context: {
    readiness_reason: string;
    source: "completed_booking_closeout";
  };
  trip_readiness_status: AdminMonthlyInvoiceDraftTripReadinessStatus;
};

export type AdminMonthlyInvoiceDraftTripCandidateSummary = {
  blocked_count: number;
  ready_count: number;
  total_count: number;
};

export type AdminMonthlyInvoiceDraftTripCandidatePagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_candidate_count: number;
};

export type AdminMonthlyInvoiceDraftTripCandidateReadResult = {
  pagination: AdminMonthlyInvoiceDraftTripCandidatePagination;
  summary: AdminMonthlyInvoiceDraftTripCandidateSummary;
  trip_candidates: AdminMonthlyInvoiceDraftTripCandidate[];
  version: typeof adminMonthlyInvoiceDraftTripCandidatesVersion;
};

type UnknownRecord = Record<string, unknown>;

const defaultCandidateLimit = 250;
const maxCandidateLimit = 250;
const maxCandidatePage = 1000;
const maxReadRows = 500;
const maxSafeTextLength = 160;
const disabledTripCandidatesReadError =
  "Admin monthly invoice draft trip candidate read is not enabled on this server.";
const safeTripCandidatesConfigError =
  "Admin monthly invoice draft trip candidate read configuration is not ready.";
const safeTripCandidatesActorError =
  "Admin monthly invoice draft trip candidate read requires a verified internal boundary.";
const safeTripCandidatesServerSessionActorError =
  "Admin monthly invoice draft trip candidate read requires a verified admin or dispatcher server session.";
const safeTripCandidatesReadError =
  "Admin monthly invoice draft trip candidate read failed safely.";
const tripCandidateCloseoutSelect =
  "id, booking_reference, closeout_status, completed_job_status, dsp_actual_hours_readiness, extra_charges_readiness, billing_prep_readiness, updated_at";
const tripCandidateCurrentBookingSelect =
  "booking_reference, customer_id, company_id, booker_id, customer_display_name, pickup_at, admin_internal_status";
const tripCandidateFoundationBookingSelect =
  "booking_reference, customer_id, company_id, booker_id, customer_display_name, pickup_datetime, admin_internal_status";
const tripCandidateDraftLinkSelect = "booking_reference, draft_id";
const tripCandidateDraftSelect =
  "id, customer_account, customer_id, company_id, booker_id, billing_month";
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const forbiddenSafeTextFragments = [
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
  "driver_payout",
  "email_send",
  "fare_amount",
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
  "quoted_price",
  "rate_amount",
  "raw_ai",
  "raw_parser_prompt",
  "service_role",
  "server_secret",
  "secret",
  "send_log",
  "send_state",
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

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed ? trimmed : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenSafeTextFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenSafeTextFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > maxLength || includesForbiddenSafeTextFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeDisplayText(value: unknown, fallback: string) {
  return safeText(value) || fallback;
}

function safeIdentityId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeCustomerId(value: unknown) {
  return safeText(value);
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

function billingMonthFromDate(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned) {
    return null;
  }

  const directMonth = validBillingMonth(cleaned.slice(0, 7));

  if (directMonth) {
    return directMonth;
  }

  const date = new Date(cleaned);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return validBillingMonth(
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`,
  );
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

export function parseAdminMonthlyInvoiceDraftTripCandidateParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyInvoiceDraftTripCandidateParams> {
  const billingMonth = validBillingMonth(readParamsValue(params, "billing_month"));

  if (!billingMonth) {
    return {
      error: "Malformed monthly invoice draft trip candidate billing_month rejected.",
      ok: false,
      status: 400,
    };
  }

  const customerAccount =
    safeText(readParamsValue(params, "customer_account")) ||
    safeText(readParamsValue(params, "customer_account_search")) ||
    safeText(readParamsValue(params, "customer_search"));

  if (!customerAccount) {
    return {
      error: "Malformed monthly invoice draft trip candidate customer/account rejected.",
      ok: false,
      status: 400,
    };
  }

  const customerId = safeCustomerId(readParamsValue(params, "customer_id"));
  const companyId = safeIdentityId(readParamsValue(params, "company_id"));
  const bookerId = safeIdentityId(readParamsValue(params, "booker_id"));

  if (!customerId || !companyId || !bookerId) {
    return {
      error: "Verified Company and Booker identity is required for monthly invoice draft trip candidates.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultCandidateLimit,
    maxCandidateLimit,
  );

  if (!limit) {
    return {
      error: "Malformed monthly invoice draft trip candidate limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxCandidatePage);

  if (!page) {
    return {
      error: "Malformed monthly invoice draft trip candidate page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      booker_id: bookerId,
      company_id: companyId,
      customer_account: customerAccount,
      customer_id: customerId,
      limit,
      page,
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

function isColumnMissingFailure(error: unknown) {
  return classifyAdapterDatabaseFailure(error) === "column_missing";
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  const isVerifiedCodexMonthlyInvoiceAutomationActor =
    actor?.actor_label === "Codex monthly invoice automation" &&
    actor.actor_role === "system" &&
    actor.boundary_mode === "codex-monthly-invoice-automation-surface" &&
    actor.source_surface === "system";

  if (
    !actor ||
    !allowedActorRoles.has(actor.actor_role) ||
    !textOrNull(actor.actor_label) ||
    !["admin_api", "system"].includes(actor.source_surface)
  ) {
    return {
      error: safeTripCandidatesActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    !isVerifiedCodexMonthlyInvoiceAutomationActor &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role) ||
      actor.source_surface !== "admin_api")
  ) {
    return {
      error: safeTripCandidatesServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyTripCandidatesSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledTripCandidatesReadError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeTripCandidatesConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeTripCandidatesConfigError,
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
      error: safeTripCandidatesConfigError,
      ok: false,
      status: 503,
    };
  }
}

async function loadBookingRowsWithFallback(
  client: SupabaseClient,
  bookingReferences: string[],
): Promise<AdminBookingResult<UnknownRecord[]>> {
  const buildQuery = (selectedColumns: string) =>
    client
      .from("bookings")
      .select(selectedColumns)
      .in("booking_reference", bookingReferences)
      .limit(maxReadRows);

  const currentResult = await buildQuery(tripCandidateCurrentBookingSelect);

  if (!currentResult.error || !isColumnMissingFailure(currentResult.error)) {
    return currentResult.error
      ? safeAdapterFailure(safeTripCandidatesReadError, 500, currentResult.error)
      : {
          data: asArray(currentResult.data).map(asRecord),
          ok: true,
        };
  }

  const foundationResult = await buildQuery(tripCandidateFoundationBookingSelect);

  if (foundationResult.error) {
    return safeAdapterFailure(safeTripCandidatesReadError, 500, foundationResult.error);
  }

  return {
    data: asArray(foundationResult.data).map(asRecord),
    ok: true,
  };
}

async function loadLinkedDraftBookingReferences(
  client: SupabaseClient,
  bookingReferences: string[],
  params: AdminMonthlyInvoiceDraftTripCandidateParams,
): Promise<AdminBookingResult<Set<string>>> {
  if (bookingReferences.length === 0) {
    return {
      data: new Set(),
      ok: true,
    };
  }

  const { data: matchingDraftRows, error: matchingDraftError } = await client
    .from("monthly_invoice_drafts")
    .select(tripCandidateDraftSelect)
    .eq("customer_id", params.customer_id)
    .eq("company_id", params.company_id)
    .eq("booker_id", params.booker_id)
    .eq("billing_month", params.billing_month)
    .limit(25);

  if (matchingDraftError) {
    return safeAdapterFailure(safeTripCandidatesReadError, 500, matchingDraftError);
  }

  const allowedDraftIds = new Set(
    asArray(matchingDraftRows)
      .map(asRecord)
      .map((row) => safeText(row.id, 120))
      .filter((draftId): draftId is string => Boolean(draftId)),
  );
  const { data, error } = await client
    .from("monthly_invoice_draft_trip_links")
    .select(tripCandidateDraftLinkSelect)
    .in("booking_reference", bookingReferences)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeTripCandidatesReadError, 500, error);
  }

  return {
    data: new Set(
      asArray(data)
        .map(asRecord)
        .filter((row) => !allowedDraftIds.has(safeText(row.draft_id, 120) || ""))
        .map((row) => safeText(row.booking_reference, 120))
        .filter((bookingReference): bookingReference is string => Boolean(bookingReference)),
    ),
    ok: true,
  };
}

function closeoutIsReady(row: UnknownRecord) {
  const closeoutStatus = textOrNull(row.closeout_status);
  const completedJobStatus = textOrNull(row.completed_job_status);
  const dspReadiness = textOrNull(row.dsp_actual_hours_readiness);
  const extraChargesReadiness = textOrNull(row.extra_charges_readiness);
  const billingPrepReadiness = textOrNull(row.billing_prep_readiness);

  return (
    (closeoutStatus === "ready_for_billing_prep" || closeoutStatus === "closed") &&
    (completedJobStatus === "completed" || completedJobStatus === "completion_exception") &&
    (dspReadiness === "ready" || dspReadiness === "not_applicable") &&
    (extraChargesReadiness === "ready" || extraChargesReadiness === "none") &&
    billingPrepReadiness === "ready"
  );
}

function closeoutCanEnterDraftCandidateRead(row: UnknownRecord) {
  return (
    textOrNull(row.booking_reference) &&
    (textOrNull(row.completed_job_status) === "completed" ||
      textOrNull(row.closeout_status) === "ready_for_billing_prep" ||
      textOrNull(row.closeout_status) === "closed")
  );
}

function bookingCanEnterDraftCandidateRead(row: UnknownRecord) {
  return textOrNull(row.admin_internal_status) === "completed";
}

function buildCandidate(
  closeoutRow: UnknownRecord,
  bookingRow: UnknownRecord | undefined,
  params: AdminMonthlyInvoiceDraftTripCandidateParams,
): AdminMonthlyInvoiceDraftTripCandidate | null {
  if (!bookingRow) {
    return null;
  }

  const bookingReference = safeText(closeoutRow.booking_reference, 120);
  const billingMonth = billingMonthFromDate(bookingRow.pickup_at || bookingRow.pickup_datetime);

  if (
    !bookingReference ||
    !billingMonth ||
    billingMonth !== params.billing_month ||
    !closeoutCanEnterDraftCandidateRead(closeoutRow)
  ) {
    return null;
  }

  const customerAccount = safeDisplayText(
    bookingRow.customer_display_name,
    "Customer/account to confirm",
  );
  const customerId = safeCustomerId(bookingRow.customer_id);
  const companyId = safeIdentityId(bookingRow.company_id);
  const bookerId = safeIdentityId(bookingRow.booker_id);

  if (customerAccount !== params.customer_account) {
    return null;
  }

  if (
    customerId !== params.customer_id ||
    companyId !== params.company_id ||
    bookerId !== params.booker_id
  ) {
    return null;
  }

  const tripReadinessStatus: AdminMonthlyInvoiceDraftTripReadinessStatus =
    closeoutIsReady(closeoutRow) && bookingCanEnterDraftCandidateRead(bookingRow)
      ? "ready"
      : "blocked";

  return {
    billing_month: billingMonth,
    billing_prep_readiness: safeText(closeoutRow.billing_prep_readiness, 80),
    booking_reference: bookingReference,
    booker_id: bookerId,
    closeout_id: validUuid(closeoutRow.id),
    closeout_status: safeText(closeoutRow.closeout_status, 80),
    company_id: companyId,
    customer_account: customerAccount,
    customer_id: customerId,
    safe_trip_context: {
      readiness_reason:
        tripReadinessStatus === "ready"
          ? "Ready closeout has no draft trip link yet."
          : "Needs completed closeout or billing prep review.",
      source: "completed_booking_closeout",
    },
    trip_readiness_status: tripReadinessStatus,
  };
}

function paginateCandidates(
  candidates: AdminMonthlyInvoiceDraftTripCandidate[],
  params: AdminMonthlyInvoiceDraftTripCandidateParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return candidates.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  candidates: AdminMonthlyInvoiceDraftTripCandidate[],
  params: AdminMonthlyInvoiceDraftTripCandidateParams,
): AdminMonthlyInvoiceDraftTripCandidatePagination {
  const pageCount = candidates.length > 0 ? Math.ceil(candidates.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_candidate_count: candidates.length,
  };
}

function summarizeCandidates(
  candidates: AdminMonthlyInvoiceDraftTripCandidate[],
): AdminMonthlyInvoiceDraftTripCandidateSummary {
  return candidates.reduce(
    (summary, candidate) => ({
      blocked_count:
        summary.blocked_count + (candidate.trip_readiness_status === "blocked" ? 1 : 0),
      ready_count: summary.ready_count + (candidate.trip_readiness_status === "ready" ? 1 : 0),
      total_count: summary.total_count + 1,
    }),
    {
      blocked_count: 0,
      ready_count: 0,
      total_count: 0,
    },
  );
}

export async function loadAdminMonthlyInvoiceDraftTripCandidates(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceDraftTripCandidateReadResult>> {
  const parsed = parseAdminMonthlyInvoiceDraftTripCandidateParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyTripCandidatesSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const groupingResult = await loadAdminMonthlyBillingGroups(
    {
      billing_month: parsed.data.billing_month,
      customer_account_search: parsed.data.customer_account,
      limit: maxCandidateLimit,
      page: 1,
      readiness_status: null,
    },
    actor,
  );

  if (!groupingResult.ok || groupingResult.data.pagination.has_next_page) {
    return {
      error: safeTripCandidatesReadError,
      ok: false,
      status: groupingResult.ok ? 409 : groupingResult.status,
    };
  }

  const matchingGroup = groupingResult.data.groups.find(
    (group) =>
      group.billing_month === parsed.data.billing_month &&
      group.customer_account === parsed.data.customer_account &&
      group.customer_id === parsed.data.customer_id &&
      group.company_id === parsed.data.company_id &&
      group.booker_id === parsed.data.booker_id,
  );
  const readyBookingReferences = new Set(
    (matchingGroup?.jobs || [])
      .filter((job) => job.safe_billing_status === "ready")
      .map((job) => job.booking_reference),
  );

  if (readyBookingReferences.size === 0) {
    const emptyCandidates: AdminMonthlyInvoiceDraftTripCandidate[] = [];

    return {
      data: {
        pagination: buildPagination(emptyCandidates, parsed.data),
        summary: summarizeCandidates(emptyCandidates),
        trip_candidates: emptyCandidates,
        version: adminMonthlyInvoiceDraftTripCandidatesVersion,
      },
      ok: true,
    };
  }

  const { data: closeoutRowsData, error: closeoutError } = await clientResult.data
    .from("completed_booking_closeouts")
    .select(tripCandidateCloseoutSelect)
    .in("booking_reference", [...readyBookingReferences])
    .limit(maxReadRows);

  if (closeoutError) {
    return safeAdapterFailure(safeTripCandidatesReadError, 500, closeoutError);
  }

  const closeoutRows = asArray(closeoutRowsData).map(asRecord);
  const bookingReferences = [
    ...new Set(closeoutRows.map((row) => textOrNull(row.booking_reference)).filter(Boolean)),
  ] as string[];

  if (bookingReferences.length === 0) {
    const emptyCandidates: AdminMonthlyInvoiceDraftTripCandidate[] = [];

    return {
      data: {
        pagination: buildPagination(emptyCandidates, parsed.data),
        summary: summarizeCandidates(emptyCandidates),
        trip_candidates: emptyCandidates,
        version: adminMonthlyInvoiceDraftTripCandidatesVersion,
      },
      ok: true,
    };
  }

  const linkedDraftBookingReferencesResult = await loadLinkedDraftBookingReferences(
    clientResult.data,
    bookingReferences.slice(0, maxReadRows),
    parsed.data,
  );

  if (!linkedDraftBookingReferencesResult.ok) {
    return linkedDraftBookingReferencesResult;
  }

  const bookingRowsResult = await loadBookingRowsWithFallback(
    clientResult.data,
    bookingReferences.slice(0, maxReadRows),
  );

  if (!bookingRowsResult.ok) {
    return bookingRowsResult;
  }

  const bookingRowsByReference = new Map(
    bookingRowsResult.data
      .map((row) => [textOrNull(row.booking_reference), row] as const)
      .filter((entry): entry is [string, UnknownRecord] => Boolean(entry[0])),
  );
  const filteredCandidates = closeoutRows
    .filter(
      (closeoutRow) =>
        readyBookingReferences.has(safeText(closeoutRow.booking_reference, 120) || "") &&
        !linkedDraftBookingReferencesResult.data.has(
          safeText(closeoutRow.booking_reference, 120) || "",
        ),
    )
    .map((closeoutRow) =>
      buildCandidate(
        closeoutRow,
        bookingRowsByReference.get(textOrNull(closeoutRow.booking_reference) || ""),
        parsed.data,
      ),
    )
    .filter((candidate): candidate is AdminMonthlyInvoiceDraftTripCandidate => Boolean(candidate))
    .filter((candidate) => candidate.trip_readiness_status === "ready")
    .sort((first, second) => first.booking_reference.localeCompare(second.booking_reference));
  const tripCandidates = paginateCandidates(filteredCandidates, parsed.data);

  return {
    data: {
      pagination: buildPagination(filteredCandidates, parsed.data),
      summary: summarizeCandidates(filteredCandidates),
      trip_candidates: tripCandidates,
      version: adminMonthlyInvoiceDraftTripCandidatesVersion,
    },
    ok: true,
  };
}
