import "server-only";

export const adminSavedBookingCustomerReadinessAuditVersion =
  "admin-saved-booking-customer-readiness-audit-v1";

export const adminSavedBookingCustomerReadinessRequirementKeys = [
  "booking_reference",
  "customer_account",
  "customer_id",
  "pickup_month",
  "saved_status",
] as const;

export type AdminSavedBookingCustomerReadinessRequirement =
  (typeof adminSavedBookingCustomerReadinessRequirementKeys)[number];

export type AdminSavedBookingCustomerReadinessStatus = "ready" | "blocked";

export type AdminSavedBookingCustomerReadinessAuditItem = {
  booking_month: string | null;
  booking_reference: string;
  customer_account: string | null;
  customer_id: string | null;
  missing_requirements: AdminSavedBookingCustomerReadinessRequirement[];
  readiness_status: AdminSavedBookingCustomerReadinessStatus;
  safe_reason: string;
  saved_status: string | null;
  source: "saved_booking_customer_account";
};

export type AdminSavedBookingCustomerReadinessAuditSummary = {
  blocked_count: number;
  missing_booking_reference_count: number;
  missing_customer_account_count: number;
  missing_customer_id_count: number;
  missing_pickup_month_count: number;
  missing_saved_status_count: number;
  ready_count: number;
  total_saved_count: number;
};

export type AdminSavedBookingCustomerReadinessAuditData = {
  audit_items: AdminSavedBookingCustomerReadinessAuditItem[];
  summary: AdminSavedBookingCustomerReadinessAuditSummary;
  version: typeof adminSavedBookingCustomerReadinessAuditVersion;
};

export type BuildAdminSavedBookingCustomerReadinessAuditResult =
  | {
      data: AdminSavedBookingCustomerReadinessAuditData;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: 400;
    };

type BuildAdminSavedBookingCustomerReadinessAuditError = Extract<
  BuildAdminSavedBookingCustomerReadinessAuditResult,
  { ok: false }
>;
type UnknownRecord = Record<string, unknown>;

const maxAuditRows = 250;
const maxSafeTextLength = 160;
const genericPayloadError =
  "Saved booking customer readiness audit payload must contain only supported safe fields.";
const savedBookingsRequiredError =
  "Saved booking customer readiness audit requires saved_bookings.";
const allowedRootFields = new Set(["booking_month", "saved_bookings"]);
const allowedSavedBookingFields = new Set([
  "admin_internal_status",
  "booking_month",
  "booking_reference",
  "booking_status",
  "companies",
  "company_id",
  "company_name",
  "customer_account",
  "customer_display_name",
  "customer_facing_status",
  "customer_id",
  "date",
  "id",
  "pickup_at",
  "pickup_date",
  "pickup_datetime",
  "saved_status",
  "status",
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
  "live_location",
  "local_only",
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
): BuildAdminSavedBookingCustomerReadinessAuditError {
  return {
    error,
    ok: false,
    status: 400,
  };
}

function validBookingMonth(value: unknown) {
  const cleaned = textOrNull(value);
  const match = cleaned?.match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    return null;
  }

  const month = Number(match[2]);

  return month >= 1 && month <= 12 ? cleaned : null;
}

function bookingMonthFromDate(value: unknown) {
  const cleaned = textOrNull(value);

  if (!cleaned) {
    return null;
  }

  const directMonth = validBookingMonth(cleaned.slice(0, 7));

  if (directMonth) {
    return directMonth;
  }

  const parsedDate = new Date(cleaned);

  if (Number.isNaN(parsedDate.getTime())) {
    return null;
  }

  return validBookingMonth(
    `${parsedDate.getUTCFullYear()}-${String(parsedDate.getUTCMonth() + 1).padStart(2, "0")}`,
  );
}

function nestedSafeText(row: UnknownRecord, parent: string, key: string) {
  const record = asRecord(row[parent]);

  return record ? safeText(record[key]) : null;
}

function explicitBookingReference(row: UnknownRecord) {
  return safeText(row.booking_reference, 120);
}

function fallbackAuditReference(row: UnknownRecord, index: number) {
  return explicitBookingReference(row) || safeText(row.id, 120) || `saved-booking-row-${index + 1}`;
}

function customerAccount(row: UnknownRecord) {
  return (
    safeText(row.customer_account) ||
    safeText(row.customer_display_name) ||
    safeText(row.company_name) ||
    nestedSafeText(row, "companies", "company_name")
  );
}

function customerId(row: UnknownRecord) {
  return safeText(row.customer_id, 120) || safeText(row.company_id, 120) || nestedSafeText(row, "companies", "id");
}

function bookingMonth(row: UnknownRecord) {
  return (
    validBookingMonth(row.booking_month) ||
    bookingMonthFromDate(row.pickup_at) ||
    bookingMonthFromDate(row.pickup_datetime) ||
    bookingMonthFromDate(row.pickup_date) ||
    bookingMonthFromDate(row.date)
  );
}

function savedStatus(row: UnknownRecord) {
  return (
    safeText(row.saved_status, 80) ||
    safeText(row.admin_internal_status, 80) ||
    safeText(row.booking_status, 80) ||
    safeText(row.status, 80) ||
    safeText(row.customer_facing_status, 80)
  );
}

function parseSavedBookingRows(
  value: unknown,
): { ok: true; rows: UnknownRecord[] } | BuildAdminSavedBookingCustomerReadinessAuditError {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxAuditRows) {
    return malformedAuditResult(savedBookingsRequiredError);
  }

  const rows: UnknownRecord[] = [];

  for (const [index, item] of value.entries()) {
    const row = asRecord(item);

    if (!row) {
      return malformedAuditResult();
    }

    if (
      unknownKeys(row, allowedSavedBookingFields, `saved_bookings[${index}]`).length > 0 ||
      findForbiddenFieldNames(row, `saved_bookings[${index}]`).length > 0
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
        unknownKeys(nested, allowedFields, `saved_bookings[${index}].${parent}`).length > 0 ||
        findForbiddenFieldNames(nested, `saved_bookings[${index}].${parent}`).length > 0
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

function readinessReason(missingRequirements: AdminSavedBookingCustomerReadinessRequirement[]) {
  if (missingRequirements.length === 0) {
    return "Saved booking has customer/account identity, pickup month, saved status, and booking reference.";
  }

  return `Saved booking blocked from customer/account readiness: missing ${missingRequirements.join(", ")}.`;
}

function auditSavedBooking(
  row: UnknownRecord,
  index: number,
): AdminSavedBookingCustomerReadinessAuditItem {
  const reference = fallbackAuditReference(row, index);
  const account = customerAccount(row);
  const identifier = customerId(row);
  const month = bookingMonth(row);
  const status = savedStatus(row);
  const missingRequirements: AdminSavedBookingCustomerReadinessRequirement[] = [];

  if (!explicitBookingReference(row)) {
    missingRequirements.push("booking_reference");
  }

  if (!account) {
    missingRequirements.push("customer_account");
  }

  if (!identifier) {
    missingRequirements.push("customer_id");
  }

  if (!month) {
    missingRequirements.push("pickup_month");
  }

  if (!status) {
    missingRequirements.push("saved_status");
  }

  return {
    booking_month: month,
    booking_reference: reference,
    customer_account: account,
    customer_id: identifier,
    missing_requirements: missingRequirements,
    readiness_status: missingRequirements.length === 0 ? "ready" : "blocked",
    safe_reason: readinessReason(missingRequirements),
    saved_status: status,
    source: "saved_booking_customer_account",
  };
}

function summarizeAudit(
  auditItems: AdminSavedBookingCustomerReadinessAuditItem[],
): AdminSavedBookingCustomerReadinessAuditSummary {
  return auditItems.reduce(
    (summary, item) => ({
      blocked_count: summary.blocked_count + (item.readiness_status === "blocked" ? 1 : 0),
      missing_booking_reference_count:
        summary.missing_booking_reference_count +
        (item.missing_requirements.includes("booking_reference") ? 1 : 0),
      missing_customer_account_count:
        summary.missing_customer_account_count +
        (item.missing_requirements.includes("customer_account") ? 1 : 0),
      missing_customer_id_count:
        summary.missing_customer_id_count +
        (item.missing_requirements.includes("customer_id") ? 1 : 0),
      missing_pickup_month_count:
        summary.missing_pickup_month_count +
        (item.missing_requirements.includes("pickup_month") ? 1 : 0),
      missing_saved_status_count:
        summary.missing_saved_status_count +
        (item.missing_requirements.includes("saved_status") ? 1 : 0),
      ready_count: summary.ready_count + (item.readiness_status === "ready" ? 1 : 0),
      total_saved_count: summary.total_saved_count + 1,
    }),
    {
      blocked_count: 0,
      missing_booking_reference_count: 0,
      missing_customer_account_count: 0,
      missing_customer_id_count: 0,
      missing_pickup_month_count: 0,
      missing_saved_status_count: 0,
      ready_count: 0,
      total_saved_count: 0,
    },
  );
}

export function buildAdminSavedBookingCustomerReadinessAudit(
  input: unknown,
): BuildAdminSavedBookingCustomerReadinessAuditResult {
  const payload = asRecord(input);

  if (!payload) {
    return malformedAuditResult();
  }

  if (
    unknownKeys(payload, allowedRootFields, "saved_booking_customer_readiness_audit").length > 0 ||
    findForbiddenFieldNames(payload, "saved_booking_customer_readiness_audit").length > 0
  ) {
    return malformedAuditResult();
  }

  const requestedBookingMonthValue = payload.booking_month;
  const requestedBookingMonth =
    requestedBookingMonthValue === undefined ||
    requestedBookingMonthValue === null ||
    requestedBookingMonthValue === ""
      ? null
      : validBookingMonth(requestedBookingMonthValue);

  if (requestedBookingMonthValue && !requestedBookingMonth) {
    return malformedAuditResult("Malformed saved booking customer readiness audit booking_month rejected.");
  }

  const parsedRows = parseSavedBookingRows(payload.saved_bookings);

  if (!parsedRows.ok) {
    return parsedRows;
  }

  const auditItems = parsedRows.rows
    .map((row, index) => auditSavedBooking(row, index))
    .filter((item) => !requestedBookingMonth || !item.booking_month || item.booking_month === requestedBookingMonth)
    .sort((first, second) => first.booking_reference.localeCompare(second.booking_reference));

  return {
    data: {
      audit_items: auditItems,
      summary: summarizeAudit(auditItems),
      version: adminSavedBookingCustomerReadinessAuditVersion,
    },
    ok: true,
  };
}
