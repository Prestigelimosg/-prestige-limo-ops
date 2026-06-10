import "server-only";

export const adminCompletedBookingBillingReadinessAuditVersion =
  "admin-completed-booking-billing-readiness-audit-v1";

export const adminCompletedBookingBillingReadinessRequirementKeys = [
  "customer_account",
  "billing_month",
  "billable_amount_source",
] as const;

export type AdminCompletedBookingBillingReadinessRequirement =
  (typeof adminCompletedBookingBillingReadinessRequirementKeys)[number];

export type AdminCompletedBookingBillingReadinessStatus = "ready" | "blocked";

export type AdminCompletedBookingBillingReadinessAuditItem = {
  billing_month: string | null;
  booking_reference: string;
  customer_account: string | null;
  customer_id: string | null;
  missing_requirements: AdminCompletedBookingBillingReadinessRequirement[];
  readiness_status: AdminCompletedBookingBillingReadinessStatus;
  safe_reason: string;
  source: "completed_saved_booking";
};

export type AdminCompletedBookingBillingReadinessAuditSummary = {
  blocked_count: number;
  missing_billable_amount_source_count: number;
  missing_billing_month_count: number;
  missing_customer_account_count: number;
  non_completed_skipped_count: number;
  ready_count: number;
  total_completed_count: number;
};

export type AdminCompletedBookingBillingReadinessAuditData = {
  audit_items: AdminCompletedBookingBillingReadinessAuditItem[];
  summary: AdminCompletedBookingBillingReadinessAuditSummary;
  version: typeof adminCompletedBookingBillingReadinessAuditVersion;
};

export type BuildAdminCompletedBookingBillingReadinessAuditResult =
  | {
      data: AdminCompletedBookingBillingReadinessAuditData;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    };

type BuildAdminCompletedBookingBillingReadinessAuditError = Extract<
  BuildAdminCompletedBookingBillingReadinessAuditResult,
  { ok: false }
>;
type UnknownRecord = Record<string, unknown>;

const maxAuditRows = 250;
const maxSafeTextLength = 160;
const genericPayloadError =
  "Completed booking billing readiness audit payload must contain only supported safe fields.";
const completedBookingsRequiredError =
  "Completed booking billing readiness audit requires completed_bookings.";
const allowedRootFields = new Set(["billing_month", "completed_bookings"]);
const allowedCompletedBookingFields = new Set([
  "admin_internal_status",
  "billing_month",
  "booker_id",
  "booking_reference",
  "company_id",
  "company_name",
  "companies",
  "completed_job_status",
  "customer_display_name",
  "customer_id",
  "customer_price_amount",
  "customer_rate",
  "customer_rate_override",
  "date",
  "id",
  "pickup_at",
  "pickup_date",
  "pickup_datetime",
  "pricing_source",
  "status",
  "traveler_id",
]);
const allowedNestedFields: Record<string, Set<string>> = {
  companies: new Set(["company_name", "id"]),
};
const forbiddenFieldFragments = [
  "admin_finance",
  "admin_note",
  "auth_link",
  "contact_email",
  "contact_phone",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_note",
  "driver_payout",
  "email_payload",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "notification",
  "parser",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "proof",
  "raw_ai",
  "raw_token",
  "secret",
  "send",
  "server_secret",
  "service_role",
  "stripe",
  "token",
  "whatsapp",
];

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
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

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenFieldFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value)?.replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function findForbiddenFieldNames(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findForbiddenFieldNames(item, `${path}[${index}]`));
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.entries(record).flatMap(([key, nestedValue]) => {
    const currentPath = path ? `${path}.${key}` : key;
    const keyLeaks = includesForbiddenFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function malformedAuditResult(
  error = genericPayloadError,
): BuildAdminCompletedBookingBillingReadinessAuditError {
  return {
    error,
    ok: false,
    status: 400,
  };
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

  const parsedDate = new Date(cleaned);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return validBillingMonth(
    `${parsedDate.getUTCFullYear()}-${String(parsedDate.getUTCMonth() + 1).padStart(2, "0")}`,
  );
}

function validNumber(value: unknown) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function completedStatus(value: unknown) {
  return safeText(value, 80)?.toLowerCase() === "completed";
}

function isCompletedBooking(row: UnknownRecord) {
  return (
    completedStatus(row.status) ||
    completedStatus(row.admin_internal_status) ||
    completedStatus(row.completed_job_status)
  );
}

function bookingReference(row: UnknownRecord) {
  const explicitReference = safeText(row.booking_reference, 120);
  const idReference = safeText(row.id, 120);

  return explicitReference || (idReference ? `booking-${idReference}` : null);
}

function nestedSafeText(row: UnknownRecord, parent: string, key: string) {
  const record = asRecord(row[parent]);

  return record ? safeText(record[key]) : null;
}

function customerAccount(row: UnknownRecord) {
  return (
    safeText(row.customer_display_name) ||
    safeText(row.company_name) ||
    nestedSafeText(row, "companies", "company_name")
  );
}

function customerId(row: UnknownRecord) {
  return safeText(row.customer_id, 120) || safeText(row.company_id, 120) || nestedSafeText(row, "companies", "id");
}

function billingMonth(row: UnknownRecord) {
  return (
    validBillingMonth(row.billing_month) ||
    billingMonthFromDate(row.pickup_at) ||
    billingMonthFromDate(row.pickup_datetime) ||
    billingMonthFromDate(row.pickup_date) ||
    billingMonthFromDate(row.date)
  );
}

function hasBillableAmountSource(row: UnknownRecord) {
  return (
    validNumber(row.customer_price_amount) !== null ||
    validNumber(row.customer_rate) !== null ||
    validNumber(row.customer_rate_override) !== null ||
    Boolean(safeText(row.pricing_source, 120))
  );
}

function parseCompletedBookingRows(
  value: unknown,
): { ok: true; rows: UnknownRecord[] } | BuildAdminCompletedBookingBillingReadinessAuditError {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxAuditRows) {
    return malformedAuditResult(completedBookingsRequiredError);
  }

  const rows: UnknownRecord[] = [];

  for (const [index, item] of value.entries()) {
    const row = asRecord(item);

    if (!row) {
      return malformedAuditResult();
    }

    if (
      unknownKeys(row, allowedCompletedBookingFields, `completed_bookings[${index}]`).length > 0 ||
      findForbiddenFieldNames(row, `completed_bookings[${index}]`).length > 0
    ) {
      return malformedAuditResult();
    }

    for (const [parent, allowedFields] of Object.entries(allowedNestedFields)) {
      if (row[parent] === undefined || row[parent] === null) {
        continue;
      }

      const nested = asRecord(row[parent]);

      if (
        !nested ||
        unknownKeys(nested, allowedFields, `completed_bookings[${index}].${parent}`).length > 0 ||
        findForbiddenFieldNames(nested, `completed_bookings[${index}].${parent}`).length > 0
      ) {
        return malformedAuditResult();
      }
    }

    rows.push(row);
  }

  return {
    ok: true,
    rows,
  };
}

function readinessReason(missingRequirements: AdminCompletedBookingBillingReadinessRequirement[]) {
  if (missingRequirements.length === 0) {
    return "Completed saved booking has customer/account, billing month, and billable amount source for billing review.";
  }

  return `Completed saved booking blocked from billing review: missing ${missingRequirements.join(", ")}.`;
}

function auditCompletedBooking(
  row: UnknownRecord,
): AdminCompletedBookingBillingReadinessAuditItem | null {
  if (!isCompletedBooking(row)) {
    return null;
  }

  const reference = bookingReference(row);

  if (!reference) {
    return null;
  }

  const account = customerAccount(row);
  const customerIdentifier = customerId(row);
  const month = billingMonth(row);
  const missingRequirements: AdminCompletedBookingBillingReadinessRequirement[] = [];

  if (!account && !customerIdentifier) {
    missingRequirements.push("customer_account");
  }

  if (!month) {
    missingRequirements.push("billing_month");
  }

  if (!hasBillableAmountSource(row)) {
    missingRequirements.push("billable_amount_source");
  }

  return {
    billing_month: month,
    booking_reference: reference,
    customer_account: account || (customerIdentifier ? "Customer/account linked" : null),
    customer_id: customerIdentifier,
    missing_requirements: missingRequirements,
    readiness_status: missingRequirements.length === 0 ? "ready" : "blocked",
    safe_reason: readinessReason(missingRequirements),
    source: "completed_saved_booking",
  };
}

function summarizeAudit(
  auditItems: AdminCompletedBookingBillingReadinessAuditItem[],
  nonCompletedSkippedCount: number,
): AdminCompletedBookingBillingReadinessAuditSummary {
  return auditItems.reduce(
    (summary, item) => ({
      blocked_count: summary.blocked_count + (item.readiness_status === "blocked" ? 1 : 0),
      missing_billable_amount_source_count:
        summary.missing_billable_amount_source_count +
        (item.missing_requirements.includes("billable_amount_source") ? 1 : 0),
      missing_billing_month_count:
        summary.missing_billing_month_count +
        (item.missing_requirements.includes("billing_month") ? 1 : 0),
      missing_customer_account_count:
        summary.missing_customer_account_count +
        (item.missing_requirements.includes("customer_account") ? 1 : 0),
      non_completed_skipped_count: summary.non_completed_skipped_count,
      ready_count: summary.ready_count + (item.readiness_status === "ready" ? 1 : 0),
      total_completed_count: summary.total_completed_count + 1,
    }),
    {
      blocked_count: 0,
      missing_billable_amount_source_count: 0,
      missing_billing_month_count: 0,
      missing_customer_account_count: 0,
      non_completed_skipped_count: nonCompletedSkippedCount,
      ready_count: 0,
      total_completed_count: 0,
    },
  );
}

export function buildAdminCompletedBookingBillingReadinessAudit(
  input: unknown,
): BuildAdminCompletedBookingBillingReadinessAuditResult {
  const payload = asRecord(input);

  if (!payload) {
    return malformedAuditResult();
  }

  if (
    unknownKeys(payload, allowedRootFields, "completed_booking_billing_readiness_audit").length > 0 ||
    findForbiddenFieldNames(payload, "completed_booking_billing_readiness_audit").length > 0
  ) {
    return malformedAuditResult();
  }

  const requestedBillingMonthValue = payload.billing_month;
  const requestedBillingMonth =
    requestedBillingMonthValue === undefined ||
    requestedBillingMonthValue === null ||
    requestedBillingMonthValue === ""
      ? null
      : validBillingMonth(requestedBillingMonthValue);

  if (requestedBillingMonthValue && !requestedBillingMonth) {
    return malformedAuditResult("Malformed completed booking billing readiness audit billing_month rejected.");
  }

  const parsedRows = parseCompletedBookingRows(payload.completed_bookings);

  if (!parsedRows.ok) {
    return parsedRows;
  }

  let nonCompletedSkippedCount = 0;
  const auditItems = parsedRows.rows
    .map((row) => {
      const item = auditCompletedBooking(row);

      if (!item) {
        nonCompletedSkippedCount += 1;
      }

      return item;
    })
    .filter((item): item is AdminCompletedBookingBillingReadinessAuditItem => Boolean(item))
    .filter((item) => !requestedBillingMonth || !item.billing_month || item.billing_month === requestedBillingMonth)
    .sort((first, second) => first.booking_reference.localeCompare(second.booking_reference));

  return {
    data: {
      audit_items: auditItems,
      summary: summarizeAudit(auditItems, nonCompletedSkippedCount),
      version: adminCompletedBookingBillingReadinessAuditVersion,
    },
    ok: true,
  };
}
