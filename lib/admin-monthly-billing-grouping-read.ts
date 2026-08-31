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

export const adminMonthlyBillingGroupingReadVersion =
  "stage-4a-444-admin-monthly-billing-dsp-time-validation-v4";

export type AdminMonthlyBillingGroupingReadinessStatus = "ready" | "blocked" | "mixed";
export type AdminMonthlyBillingJobStatus = "ready" | "covered" | "blocked";

export type AdminMonthlyBillingJobClassification = {
  billing_month: string;
  booking_reference: string;
  booker_id: number | null;
  company_id: number | null;
  customer_account: string;
  customer_id: string | null;
  display_booking_reference: string;
  safe_billing_status: AdminMonthlyBillingJobStatus;
  safe_reason: string;
};

export type AdminMonthlyBillingGroupingReadParams = {
  billing_month: string | null;
  customer_account_search: string | null;
  limit: number;
  page: number;
  readiness_status: AdminMonthlyBillingGroupingReadinessStatus | null;
};

export type AdminMonthlyBillingGroup = {
  classified_count: number;
  billing_month: string;
  blocked_count: number;
  booker_id: number | null;
  company_id: number | null;
  covered_count: number;
  customer_account: string;
  customer_id: string | null;
  jobs: AdminMonthlyBillingJobClassification[];
  ready_count: number;
  safe_readiness_status: AdminMonthlyBillingGroupingReadinessStatus;
  total_count: number;
};

export type AdminMonthlyBillingGroupingSummary = {
  blocked_count: number;
  classified_count: number;
  covered_count: number;
  group_count: number;
  ready_count: number;
  total_count: number;
};

export type AdminMonthlyBillingGroupingPagination = {
  has_next_page: boolean;
  has_previous_page: boolean;
  page: number;
  page_count: number;
  page_size: number;
  total_group_count: number;
};

export type AdminMonthlyBillingGroupingReadResult = {
  groups: AdminMonthlyBillingGroup[];
  pagination: AdminMonthlyBillingGroupingPagination;
  summary: AdminMonthlyBillingGroupingSummary;
  version: typeof adminMonthlyBillingGroupingReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type BillingCandidate = {
  billingMonth: string;
  bookingReference: string;
  bookerId: number | null;
  companyId: number | null;
  customerAccount: string;
  customerId: string | null;
  displayBookingReference: string;
  safeBillingStatus: AdminMonthlyBillingJobStatus;
  safeReason: string;
};
type DspBillingIntervalEvidence = {
  endedAtMs: number;
  source: "admin_correction" | "automatic";
  startedAtMs: number | null;
};

const defaultGroupingLimit = 25;
const maxGroupingLimit = 250;
const maxGroupingPage = 1000;
const maxReadRows = 500;
const maxCustomerAccountSearchLength = 80;
const maxSafeTextLength = 160;
const maxDspBillingMinutes = 60 * 24 * 30;
const disabledMonthlyBillingGroupingReadError =
  "Admin monthly billing grouping read is not enabled on this server.";
const safeMonthlyBillingGroupingConfigError =
  "Admin monthly billing grouping read configuration is not ready.";
const safeMonthlyBillingGroupingActorError =
  "Admin monthly billing grouping read requires a verified internal boundary.";
const safeMonthlyBillingGroupingServerSessionActorError =
  "Admin monthly billing grouping read requires a verified admin or dispatcher server session.";
const safeMonthlyBillingGroupingReadError =
  "Admin monthly billing grouping read failed safely.";
const monthlyBillingCloseoutSelect =
  "booking_reference, closeout_status, completed_job_status, dsp_actual_hours_readiness, extra_charges_readiness, billing_prep_readiness, updated_at";
const monthlyBillingCurrentBookingSelect =
  "booking_reference, public_booking_reference, customer_id, company_id, booker_id, customer_display_name, pickup_at, service_type, booking_type, admin_internal_status";
const monthlyBillingFoundationBookingSelect =
  "booking_reference, public_booking_reference, customer_id, company_id, booker_id, customer_display_name, pickup_datetime, service_type, booking_type, admin_internal_status";
const monthlyBillingIssuedRecordSelect =
  "customer_id, booker_id, reference, line_items, document_type, document_state";
const monthlyBillingDspCorrectionSelect =
  "booking_reference, event_type, occurred_at, safe_event_note, safe_event_context, source_surface, actor_role, created_at";
const monthlyBillingDspSummarySelect =
  "booking_reference, dsp_ended_at, actual_time_status";
const monthlyBillingDriverJcSelect =
  "booking_reference, status_value, occurred_at";
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const forbiddenSafeTextFragments = [
  "customer_price",
  "quoted_price",
  "rate_amount",
  "fare_amount",
  "driver_payout",
  "paynow",
  "pay_now",
  "payout",
  "invoice_number",
  "payment",
  "payment_link",
  "pdf",
  "notification",
  "parser_debug",
  "raw_ai",
  "parser_prompt",
  "parser_learning",
  "live_location",
  "proof",
  "photo",
  "service_role",
  "server_secret",
  "secret",
  "token",
  "internal_admin_note",
  "admin_note",
  "internal_finance_note",
  "mock_archive",
  "mock_qa",
  "dev_workbench",
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

function safeDisplayText(value: unknown, fallback: string) {
  const cleaned = textOrNull(value);

  if (
    !cleaned ||
    cleaned.length > maxSafeTextLength ||
    includesForbiddenSafeTextFragment(cleaned)
  ) {
    return fallback;
  }

  return cleaned;
}

function safeCustomerId(value: unknown) {
  const cleaned = textOrNull(value);

  if (
    !cleaned ||
    cleaned.length > maxSafeTextLength ||
    includesForbiddenSafeTextFragment(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function safeIdentityId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
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

  const month = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

  return validBillingMonth(month);
}

function timestampMs(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > 80) {
    return null;
  }

  const parsed = new Date(cleaned).getTime();

  return Number.isFinite(parsed) ? parsed : null;
}

function normalizedBookingServiceType(row: UnknownRecord) {
  return (textOrNull(row.service_type) || textOrNull(row.booking_type) || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function bookingIsDsp(row: UnknownRecord) {
  const normalized = normalizedBookingServiceType(row);

  return (
    normalized === "dsp" ||
    normalized === "hourly" ||
    normalized === "disposal" ||
    normalized.includes("hourly") ||
    normalized.includes("disposal")
  );
}

function validDspDuration(startedAtMs: number, endedAtMs: number) {
  const durationMinutes = Math.floor((endedAtMs - startedAtMs) / 60_000);

  return durationMinutes > 0 && durationMinutes <= maxDspBillingMinutes;
}

function adminCorrectionEvidence(row: UnknownRecord) {
  const context = asRecord(row.safe_event_context);
  const startedAtMs = timestampMs(context.billing_started_at);
  const endedAtMs = timestampMs(row.occurred_at);
  const createdAtMs = timestampMs(row.created_at);
  const reason = textOrNull(row.safe_event_note)?.replace(/\s+/g, " ").trim() || "";

  if (
    textOrNull(row.event_type) !== "dsp_end" ||
    textOrNull(row.source_surface) !== "admin_api" ||
    !["admin", "dispatcher"].includes(textOrNull(row.actor_role) || "") ||
    textOrNull(context.actual_time_policy) !== "admin_billing_time_correction" ||
    reason.length < 3 ||
    reason.length > 500 ||
    startedAtMs === null ||
    endedAtMs === null ||
    createdAtMs === null ||
    !validDspDuration(startedAtMs, endedAtMs)
  ) {
    return null;
  }

  return {
    createdAtMs,
    evidence: {
      endedAtMs,
      source: "admin_correction" as const,
      startedAtMs,
    },
  };
}

function latestAutomaticDspEndByReference(rows: UnknownRecord[]) {
  const latest = new Map<string, number>();

  for (const row of rows) {
    const bookingReference = textOrNull(row.booking_reference);
    const endedAtMs = timestampMs(row.dsp_ended_at || row.occurred_at);

    if (!bookingReference || endedAtMs === null) {
      continue;
    }

    const current = latest.get(bookingReference);

    if (current === undefined || endedAtMs > current) {
      latest.set(bookingReference, endedAtMs);
    }
  }

  return latest;
}

async function loadDspBillingIntervalEvidence(
  client: SupabaseClient,
  bookingRows: UnknownRecord[],
): Promise<AdminBookingResult<Map<string, DspBillingIntervalEvidence>>> {
  const dspBookingReferences = [
    ...new Set(
      bookingRows
        .filter(bookingIsDsp)
        .map((row) => textOrNull(row.booking_reference))
        .filter(Boolean),
    ),
  ].slice(0, maxReadRows) as string[];

  if (dspBookingReferences.length === 0) {
    return {
      data: new Map(),
      ok: true,
    };
  }

  const [correctionResult, summaryResult, driverJcResult] = await Promise.all([
    client
      .from("driver_job_dsp_actual_time_events")
      .select(monthlyBillingDspCorrectionSelect)
      .in("booking_reference", dspBookingReferences)
      .eq("event_type", "dsp_end")
      .eq("source_surface", "admin_api")
      .in("actor_role", ["admin", "dispatcher"])
      .limit(maxReadRows),
    client
      .from("driver_job_dsp_actual_time_summaries")
      .select(monthlyBillingDspSummarySelect)
      .in("booking_reference", dspBookingReferences)
      .eq("actual_time_status", "complete")
      .limit(maxReadRows),
    client
      .from("driver_job_status_events")
      .select(monthlyBillingDriverJcSelect)
      .in("booking_reference", dspBookingReferences)
      .eq("status_value", "completed")
      .limit(maxReadRows),
  ]);

  const firstError = correctionResult.error || summaryResult.error || driverJcResult.error;

  if (firstError) {
    return safeAdapterFailure(safeMonthlyBillingGroupingReadError, 500, firstError);
  }

  const correctionByReference = new Map<
    string,
    { createdAtMs: number; evidence: DspBillingIntervalEvidence }
  >();

  for (const row of asArray(correctionResult.data).map(asRecord)) {
    const bookingReference = textOrNull(row.booking_reference);
    const correction = adminCorrectionEvidence(row);

    if (!bookingReference || !correction) {
      continue;
    }

    const current = correctionByReference.get(bookingReference);

    if (!current || correction.createdAtMs > current.createdAtMs) {
      correctionByReference.set(bookingReference, correction);
    }
  }

  const summaryEnds = latestAutomaticDspEndByReference(
    asArray(summaryResult.data).map(asRecord),
  );
  const persistedDriverJcEnds = latestAutomaticDspEndByReference(
    asArray(driverJcResult.data).map(asRecord),
  );
  const evidenceByReference = new Map<string, DspBillingIntervalEvidence>();

  for (const bookingReference of dspBookingReferences) {
    const correction = correctionByReference.get(bookingReference);

    if (correction) {
      evidenceByReference.set(bookingReference, correction.evidence);
      continue;
    }

    const endedAtMs = summaryEnds.get(bookingReference) ?? persistedDriverJcEnds.get(bookingReference);

    if (endedAtMs !== undefined) {
      evidenceByReference.set(bookingReference, {
        endedAtMs,
        source: "automatic",
        startedAtMs: null,
      });
    }
  }

  return {
    data: evidenceByReference,
    ok: true,
  };
}

function dspBillingIntervalIsReady(
  bookingRow: UnknownRecord,
  evidence: DspBillingIntervalEvidence | undefined,
) {
  if (!bookingIsDsp(bookingRow)) {
    return true;
  }

  if (!evidence) {
    return false;
  }

  if (evidence.source === "admin_correction") {
    return (
      evidence.startedAtMs !== null &&
      validDspDuration(evidence.startedAtMs, evidence.endedAtMs)
    );
  }

  const pickupAtMs = timestampMs(bookingRow.pickup_at || bookingRow.pickup_datetime);

  return pickupAtMs !== null && validDspDuration(pickupAtMs, evidence.endedAtMs);
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

function safeCustomerAccountSearch(value: unknown) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned) {
    return null;
  }

  if (
    cleaned.length > maxCustomerAccountSearchLength ||
    includesForbiddenSafeTextFragment(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function validReadinessStatus(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned === "ready" || cleaned === "blocked" || cleaned === "mixed" ? cleaned : null;
}

export function parseAdminMonthlyBillingGroupingReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminMonthlyBillingGroupingReadParams> {
  const billingMonthValue = readParamsValue(params, "billing_month");
  const billingMonth =
    billingMonthValue === undefined || billingMonthValue === null || billingMonthValue === ""
      ? null
      : validBillingMonth(billingMonthValue);

  if (billingMonthValue && !billingMonth) {
    return {
      error: "Malformed monthly billing grouping billing_month rejected.",
      ok: false,
      status: 400,
    };
  }

  const customerAccountSearchValue =
    readParamsValue(params, "customer_account_search") ||
    readParamsValue(params, "customer_search") ||
    readParamsValue(params, "account_search");
  const customerAccountSearch =
    customerAccountSearchValue === undefined ||
    customerAccountSearchValue === null ||
    customerAccountSearchValue === ""
      ? null
      : safeCustomerAccountSearch(customerAccountSearchValue);

  if (customerAccountSearchValue && !customerAccountSearch) {
    return {
      error: "Malformed monthly billing grouping customer/account search rejected.",
      ok: false,
      status: 400,
    };
  }

  const readinessStatusValue = readParamsValue(params, "readiness_status");
  const readinessStatus =
    readinessStatusValue === undefined || readinessStatusValue === null || readinessStatusValue === ""
      ? null
      : validReadinessStatus(readinessStatusValue);

  if (readinessStatusValue && !readinessStatus) {
    return {
      error: "Malformed monthly billing grouping readiness status rejected.",
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultGroupingLimit,
    maxGroupingLimit,
  );

  if (!limit) {
    return {
      error: "Malformed monthly billing grouping limit rejected.",
      ok: false,
      status: 400,
    };
  }

  const page = positiveInteger(readParamsValue(params, "page"), 1, maxGroupingPage);

  if (!page) {
    return {
      error: "Malformed monthly billing grouping page rejected.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      customer_account_search: customerAccountSearch,
      limit,
      page,
      readiness_status: readinessStatus,
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
      error: safeMonthlyBillingGroupingActorError,
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
      error: safeMonthlyBillingGroupingServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyMonthlyBillingGroupingSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledMonthlyBillingGroupingReadError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeMonthlyBillingGroupingConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeMonthlyBillingGroupingConfigError,
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
      error: safeMonthlyBillingGroupingConfigError,
      ok: false,
      status: 503,
    };
  }
}

async function loadCompletedBookingRowsWithFallback(
  client: SupabaseClient,
): Promise<AdminBookingResult<UnknownRecord[]>> {
  const buildQuery = (selectedColumns: string) =>
    client
      .from("bookings")
      .select(selectedColumns)
      .eq("admin_internal_status", "completed")
      .limit(maxReadRows);

  const currentResult = await buildQuery(monthlyBillingCurrentBookingSelect);

  if (!currentResult.error || !isColumnMissingFailure(currentResult.error)) {
    return currentResult.error
      ? safeAdapterFailure(safeMonthlyBillingGroupingReadError, 500, currentResult.error)
      : {
          data: asArray(currentResult.data).map(asRecord),
          ok: true,
        };
  }

  const foundationResult = await buildQuery(monthlyBillingFoundationBookingSelect);

  if (foundationResult.error) {
    return safeAdapterFailure(safeMonthlyBillingGroupingReadError, 500, foundationResult.error);
  }

  return {
    data: asArray(foundationResult.data).map(asRecord),
    ok: true,
  };
}

function issuedRecordBookingReferences(row: UnknownRecord) {
  if (
    textOrNull(row.document_type) !== "invoice" ||
    textOrNull(row.document_state) !== "issued"
  ) {
    return [];
  }

  return [
    textOrNull(row.reference),
    ...asArray(row.line_items).map((item) => textOrNull(asRecord(item).bookingReference)),
  ].filter((reference): reference is string => Boolean(reference));
}

function exactIdentityKey(customerId: string, companyId: number, bookerId: number) {
  return `${customerId}::${companyId}::${bookerId}`;
}

function issuedCoverageKey(
  customerId: string,
  companyId: number,
  bookerId: number,
  bookingReference: string,
) {
  return `${exactIdentityKey(customerId, companyId, bookerId)}::${bookingReference}`;
}

async function loadIssuedCoverageKeys(
  client: SupabaseClient,
  customerIds: string[],
  companyIdsByCustomerBooker: Map<string, Set<number>>,
): Promise<AdminBookingResult<Set<string>>> {
  if (customerIds.length === 0) {
    return {
      data: new Set(),
      ok: true,
    };
  }

  const { data, error } = await client
    .from("customer_invoice_records")
    .select(monthlyBillingIssuedRecordSelect)
    .in("customer_id", customerIds)
    .limit(maxReadRows);

  if (error) {
    return safeAdapterFailure(safeMonthlyBillingGroupingReadError, 500, error);
  }

  const coverageKeys = new Set<string>();

  for (const row of asArray(data).map(asRecord)) {
    const customerId = safeCustomerId(row.customer_id);
    const bookerId = safeIdentityId(row.booker_id);

    if (!customerId || !bookerId) {
      continue;
    }

    const companyIds = companyIdsByCustomerBooker.get(`${customerId}::${bookerId}`);

    if (!companyIds || companyIds.size !== 1) {
      continue;
    }

    const [companyId] = companyIds;

    for (const reference of issuedRecordBookingReferences(row)) {
      coverageKeys.add(issuedCoverageKey(customerId, companyId, bookerId, reference));
    }
  }

  return {
    data: coverageKeys,
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

function bookingCanEnterGrouping(row: UnknownRecord) {
  return textOrNull(row.admin_internal_status) === "completed";
}

function blockedReason(closeoutRow: UnknownRecord | undefined) {
  if (!closeoutRow) {
    return "Completed job closeout is missing.";
  }

  if (
    !["completed", "completion_exception"].includes(
      textOrNull(closeoutRow.completed_job_status) || "",
    )
  ) {
    return "Completion evidence needs review.";
  }

  if (
    !["ready", "not_applicable"].includes(
      textOrNull(closeoutRow.dsp_actual_hours_readiness) || "",
    )
  ) {
    return "DSP billing time needs review.";
  }

  if (
    !["ready", "none"].includes(
      textOrNull(closeoutRow.extra_charges_readiness) || "",
    )
  ) {
    return "Extra charges need review.";
  }

  return "Completed job billing closeout needs review.";
}

function buildBillingCandidate(
  bookingRow: UnknownRecord,
  closeoutRow: UnknownRecord | undefined,
  issuedCoverageKeys: Set<string>,
  dspBillingIntervalEvidence: DspBillingIntervalEvidence | undefined,
  ambiguousCustomerBookerKeys: Set<string>,
): BillingCandidate | null {
  const bookingReference = textOrNull(bookingRow.booking_reference);
  const billingMonth = billingMonthFromDate(bookingRow.pickup_at || bookingRow.pickup_datetime);

  if (!bookingReference || !billingMonth || !bookingCanEnterGrouping(bookingRow)) {
    return null;
  }

  const customerAccount = safeDisplayText(
    bookingRow.customer_display_name,
    "Customer/account to confirm",
  );

  const customerId = safeCustomerId(bookingRow.customer_id);
  const companyId = safeIdentityId(bookingRow.company_id);
  const bookerId = safeIdentityId(bookingRow.booker_id);
  const customerBookerKey = customerId && bookerId ? `${customerId}::${bookerId}` : null;
  const identityIsAmbiguous = Boolean(
    customerBookerKey && ambiguousCustomerBookerKeys.has(customerBookerKey),
  );
  const publicBookingReference = safeDisplayText(
    bookingRow.public_booking_reference,
    bookingReference,
  );
  const isCovered = Boolean(
    customerId && companyId && bookerId &&
      [bookingReference, publicBookingReference].some((reference) =>
        issuedCoverageKeys.has(
          issuedCoverageKey(customerId, companyId, bookerId, reference),
        ),
      ),
  );
  const dspBillingTimeReady = dspBillingIntervalIsReady(
    bookingRow,
    dspBillingIntervalEvidence,
  );
  const isReady = Boolean(
    customerId &&
    companyId &&
    bookerId &&
    !identityIsAmbiguous &&
    closeoutRow &&
    closeoutIsReady(closeoutRow) &&
    dspBillingTimeReady
  );

  return {
    billingMonth,
    bookingReference,
    bookerId,
    companyId,
    customerAccount,
    customerId,
    displayBookingReference: publicBookingReference,
    safeBillingStatus: isCovered ? "covered" : isReady ? "ready" : "blocked",
    safeReason: isCovered
      ? "An issued customer bill already covers this booking."
      : !customerId || !companyId || !bookerId
        ? "Verified Company and Booker identity is missing or incomplete."
        : identityIsAmbiguous
          ? "Verified Company and Booker identity is inconsistent."
        : isReady
          ? "Ready and not covered by an issued customer bill."
          : bookingIsDsp(bookingRow) && !dspBillingTimeReady
            ? "DSP billing time needs review."
          : blockedReason(closeoutRow),
  };
}

function groupCandidates(
  candidates: BillingCandidate[],
  params: AdminMonthlyBillingGroupingReadParams,
): AdminMonthlyBillingGroup[] {
  const groups = new Map<string, AdminMonthlyBillingGroup>();

  for (const candidate of candidates) {
    if (params.billing_month && candidate.billingMonth !== params.billing_month) {
      continue;
    }

    const key = `${candidate.customerId || ""}::${candidate.companyId || ""}::${candidate.bookerId || ""}::${candidate.billingMonth}`;
    const group =
      groups.get(key) ||
      {
        classified_count: 0,
        billing_month: candidate.billingMonth,
        blocked_count: 0,
        booker_id: candidate.bookerId,
        company_id: candidate.companyId,
        covered_count: 0,
        customer_account: candidate.customerAccount,
        customer_id: candidate.customerId,
        jobs: [],
        ready_count: 0,
        safe_readiness_status: "blocked" as AdminMonthlyBillingGroupingReadinessStatus,
        total_count: 0,
      };

    if (candidate.safeBillingStatus === "ready") {
      group.ready_count += 1;
      group.total_count += 1;
    } else if (candidate.safeBillingStatus === "blocked") {
      group.blocked_count += 1;
      group.total_count += 1;
    } else {
      group.covered_count += 1;
    }

    group.classified_count += 1;
    group.jobs.push({
      billing_month: candidate.billingMonth,
      booking_reference: candidate.bookingReference,
      booker_id: candidate.bookerId,
      company_id: candidate.companyId,
      customer_account: candidate.customerAccount,
      customer_id: candidate.customerId,
      display_booking_reference: candidate.displayBookingReference,
      safe_billing_status: candidate.safeBillingStatus,
      safe_reason: candidate.safeReason,
    });
    group.safe_readiness_status =
      group.ready_count > 0 && group.blocked_count > 0
        ? "mixed"
        : group.ready_count > 0
          ? "ready"
          : "blocked";
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    group.jobs.sort((first, second) =>
      first.display_booking_reference.localeCompare(second.display_booking_reference),
    );
  }

  return [...groups.values()]
    .sort((first, second) =>
      first.customer_account.localeCompare(second.customer_account) ||
      (first.company_id || 0) - (second.company_id || 0) ||
      (first.booker_id || 0) - (second.booker_id || 0) ||
      first.billing_month.localeCompare(second.billing_month),
    );
}

function filterGroupedCandidates(
  groups: AdminMonthlyBillingGroup[],
  params: AdminMonthlyBillingGroupingReadParams,
) {
  const customerAccountSearch = params.customer_account_search?.toLowerCase() || "";

  return groups.filter((group) => {
    if (
      customerAccountSearch &&
      !group.customer_account.toLowerCase().includes(customerAccountSearch)
    ) {
      return false;
    }

    return !params.readiness_status || group.safe_readiness_status === params.readiness_status;
  });
}

function paginateGroups(
  groups: AdminMonthlyBillingGroup[],
  params: AdminMonthlyBillingGroupingReadParams,
) {
  const startIndex = (params.page - 1) * params.limit;

  return groups.slice(startIndex, startIndex + params.limit);
}

function buildPagination(
  groups: AdminMonthlyBillingGroup[],
  params: AdminMonthlyBillingGroupingReadParams,
): AdminMonthlyBillingGroupingPagination {
  const pageCount = groups.length > 0 ? Math.ceil(groups.length / params.limit) : 0;

  return {
    has_next_page: pageCount > 0 && params.page < pageCount,
    has_previous_page: pageCount > 0 && params.page > 1,
    page: params.page,
    page_count: pageCount,
    page_size: params.limit,
    total_group_count: groups.length,
  };
}

function summarizeGroups(groups: AdminMonthlyBillingGroup[]): AdminMonthlyBillingGroupingSummary {
  return groups.reduce(
    (summary, group) => ({
      blocked_count: summary.blocked_count + group.blocked_count,
      classified_count: summary.classified_count + group.classified_count,
      covered_count: summary.covered_count + group.covered_count,
      group_count: summary.group_count + 1,
      ready_count: summary.ready_count + group.ready_count,
      total_count: summary.total_count + group.total_count,
    }),
    {
      blocked_count: 0,
      classified_count: 0,
      covered_count: 0,
      group_count: 0,
      ready_count: 0,
      total_count: 0,
    },
  );
}

export async function loadAdminMonthlyBillingGroups(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyBillingGroupingReadResult>> {
  const parsed = parseAdminMonthlyBillingGroupingReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyMonthlyBillingGroupingSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const bookingRowsResult = await loadCompletedBookingRowsWithFallback(clientResult.data);

  if (!bookingRowsResult.ok) {
    return bookingRowsResult;
  }

  const completedBookingRows = bookingRowsResult.data.filter(bookingCanEnterGrouping);

  if (completedBookingRows.length === 0) {
    const filteredGroups: AdminMonthlyBillingGroup[] = [];

    return {
      data: {
        groups: [],
        pagination: buildPagination(filteredGroups, parsed.data),
        summary: summarizeGroups(filteredGroups),
        version: adminMonthlyBillingGroupingReadVersion,
      },
      ok: true,
    };
  }

  const bookingReferences = [
    ...new Set(
      completedBookingRows.map((row) => textOrNull(row.booking_reference)).filter(Boolean),
    ),
  ] as string[];
  const { data: closeoutRowsData, error: closeoutError } = await clientResult.data
    .from("completed_booking_closeouts")
    .select(monthlyBillingCloseoutSelect)
    .in("booking_reference", bookingReferences.slice(0, maxReadRows))
    .limit(maxReadRows);

  if (closeoutError) {
    return safeAdapterFailure(safeMonthlyBillingGroupingReadError, 500, closeoutError);
  }

  const closeoutRowsByReference = new Map(
    asArray(closeoutRowsData)
      .map(asRecord)
      .map((row) => [textOrNull(row.booking_reference), row] as const)
      .filter((entry): entry is [string, UnknownRecord] => Boolean(entry[0])),
  );
  const customerIds = [
    ...new Set(completedBookingRows.map((row) => safeCustomerId(row.customer_id)).filter(Boolean)),
  ] as string[];
  const companyIdsByCustomerBooker = new Map<string, Set<number>>();

  for (const row of completedBookingRows) {
    const customerId = safeCustomerId(row.customer_id);
    const companyId = safeIdentityId(row.company_id);
    const bookerId = safeIdentityId(row.booker_id);

    if (!customerId || !companyId || !bookerId) {
      continue;
    }

    const key = `${customerId}::${bookerId}`;
    const companyIds = companyIdsByCustomerBooker.get(key) || new Set<number>();
    companyIds.add(companyId);
    companyIdsByCustomerBooker.set(key, companyIds);
  }
  const issuedCoverageResult = await loadIssuedCoverageKeys(
    clientResult.data,
    customerIds.slice(0, maxReadRows),
    companyIdsByCustomerBooker,
  );

  if (!issuedCoverageResult.ok) {
    return issuedCoverageResult;
  }
  const ambiguousCustomerBookerKeys = new Set(
    [...companyIdsByCustomerBooker.entries()]
      .filter(([, companyIds]) => companyIds.size !== 1)
      .map(([key]) => key),
  );

  const dspBillingIntervalResult = await loadDspBillingIntervalEvidence(
    clientResult.data,
    completedBookingRows,
  );

  if (!dspBillingIntervalResult.ok) {
    return dspBillingIntervalResult;
  }

  const candidates = completedBookingRows
    .map((bookingRow) =>
      buildBillingCandidate(
        bookingRow,
        closeoutRowsByReference.get(textOrNull(bookingRow.booking_reference) || ""),
        issuedCoverageResult.data,
        dspBillingIntervalResult.data.get(textOrNull(bookingRow.booking_reference) || ""),
        ambiguousCustomerBookerKeys,
      ),
    )
    .filter((candidate): candidate is BillingCandidate => Boolean(candidate));
  const groupedCandidates = groupCandidates(candidates, parsed.data);
  const filteredGroups = filterGroupedCandidates(groupedCandidates, parsed.data);
  const groups = paginateGroups(filteredGroups, parsed.data);

  return {
    data: {
      groups,
      pagination: buildPagination(filteredGroups, parsed.data),
      summary: summarizeGroups(filteredGroups),
      version: adminMonthlyBillingGroupingReadVersion,
    },
    ok: true,
  };
}
