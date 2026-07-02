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
  "stage-4a-442-admin-monthly-billing-grouping-read-v2";

export type AdminMonthlyBillingGroupingReadinessStatus = "ready" | "blocked" | "mixed";

export type AdminMonthlyBillingGroupingReadParams = {
  billing_month: string | null;
  customer_account_search: string | null;
  limit: number;
  page: number;
  readiness_status: AdminMonthlyBillingGroupingReadinessStatus | null;
};

export type AdminMonthlyBillingGroup = {
  billing_month: string;
  blocked_count: number;
  customer_account: string;
  customer_id: string | null;
  ready_count: number;
  safe_readiness_status: AdminMonthlyBillingGroupingReadinessStatus;
  total_count: number;
};

export type AdminMonthlyBillingGroupingSummary = {
  blocked_count: number;
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
  customerAccount: string;
  customerId: string | null;
  ready: boolean;
};

const defaultGroupingLimit = 25;
const maxGroupingLimit = 250;
const maxGroupingPage = 1000;
const maxReadRows = 500;
const maxCustomerAccountSearchLength = 80;
const maxSafeTextLength = 160;
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
  "booking_reference, customer_id, customer_display_name, pickup_at, admin_internal_status";
const monthlyBillingFoundationBookingSelect =
  "booking_reference, customer_id, customer_display_name, pickup_datetime, admin_internal_status";
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
  "invoice",
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

function closeoutCanEnterGrouping(row: UnknownRecord) {
  return (
    textOrNull(row.booking_reference) &&
    (textOrNull(row.completed_job_status) === "completed" ||
      textOrNull(row.closeout_status) === "ready_for_billing_prep" ||
      textOrNull(row.closeout_status) === "closed")
  );
}

function bookingCanEnterGrouping(row: UnknownRecord) {
  return textOrNull(row.admin_internal_status) === "completed";
}

function buildBillingCandidate(
  closeoutRow: UnknownRecord,
  bookingRow: UnknownRecord | undefined,
): BillingCandidate | null {
  if (!bookingRow) {
    return null;
  }

  const bookingReference = textOrNull(closeoutRow.booking_reference);
  const billingMonth = billingMonthFromDate(bookingRow.pickup_at || bookingRow.pickup_datetime);

  if (!bookingReference || !billingMonth || !closeoutCanEnterGrouping(closeoutRow)) {
    return null;
  }

  const customerAccount = safeDisplayText(
    bookingRow.customer_display_name,
    "Customer/account to confirm",
  );

  return {
    billingMonth,
    bookingReference,
    customerAccount,
    customerId: safeCustomerId(bookingRow.customer_id),
    ready: closeoutIsReady(closeoutRow) && bookingCanEnterGrouping(bookingRow),
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

    const key = `${candidate.customerId || ""}::${candidate.customerAccount}::${candidate.billingMonth}`;
    const group =
      groups.get(key) ||
      {
        billing_month: candidate.billingMonth,
        blocked_count: 0,
        customer_account: candidate.customerAccount,
        customer_id: candidate.customerId,
        ready_count: 0,
        safe_readiness_status: "blocked" as AdminMonthlyBillingGroupingReadinessStatus,
        total_count: 0,
      };

    if (candidate.ready) {
      group.ready_count += 1;
    } else {
      group.blocked_count += 1;
    }

    group.total_count += 1;
    group.safe_readiness_status =
      group.ready_count > 0 && group.blocked_count > 0
        ? "mixed"
        : group.ready_count > 0
          ? "ready"
          : "blocked";
    groups.set(key, group);
  }

  return [...groups.values()]
    .sort((first, second) =>
      first.customer_account.localeCompare(second.customer_account) ||
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
      group_count: summary.group_count + 1,
      ready_count: summary.ready_count + group.ready_count,
      total_count: summary.total_count + group.total_count,
    }),
    {
      blocked_count: 0,
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

  const { data: closeoutRowsData, error: closeoutError } = await clientResult.data
    .from("completed_booking_closeouts")
    .select(monthlyBillingCloseoutSelect)
    .limit(maxReadRows);

  if (closeoutError) {
    return safeAdapterFailure(safeMonthlyBillingGroupingReadError, 500, closeoutError);
  }

  const closeoutRows = asArray(closeoutRowsData).map(asRecord);
  const bookingReferences = [
    ...new Set(closeoutRows.map((row) => textOrNull(row.booking_reference)).filter(Boolean)),
  ] as string[];

  if (bookingReferences.length === 0) {
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
  const candidates = closeoutRows
    .map((closeoutRow) =>
      buildBillingCandidate(
        closeoutRow,
        bookingRowsByReference.get(textOrNull(closeoutRow.booking_reference) || ""),
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
