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

export const adminMonthlyInvoiceNumberReservationVersion =
  "stage-monthly-invoice-number-reservation-api-v1";

export type AdminMonthlyInvoiceNumberReservationInput = {
  billing_month: string;
  customer_account: string;
  invoice_prefix: string;
  issue_record_id: string;
  safe_sequence_note: string | null;
};

export type AdminMonthlyInvoiceNumberReservationRecord = {
  invoice_number: string;
  invoice_number_status: "reserved";
  invoice_prefix: string;
  invoice_sequence_number: number;
  issue_record_id: string;
};

type UnknownRecord = Record<string, unknown>;

const maxCustomerAccountLength = 160;
const maxSafeSequenceNoteLength = 1000;
const disabledInvoiceNumberReservationError =
  "Admin monthly invoice number reservation is not enabled on this server.";
const safeInvoiceNumberReservationConfigError =
  "Admin monthly invoice number reservation configuration is not ready.";
const safeInvoiceNumberReservationActorError =
  "Admin monthly invoice number reservation requires a verified internal boundary.";
const safeInvoiceNumberReservationServerSessionActorError =
  "Admin monthly invoice number reservation requires a verified admin or dispatcher server session.";
const safeInvoiceNumberReservationError =
  "Admin monthly invoice number reservation failed safely.";
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedSaveFields = new Set([
  "billing_month",
  "customer_account",
  "invoice_prefix",
  "issue_record_id",
  "safe_sequence_note",
]);
const forbiddenReservationFragments = [
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
  "pdf",
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
  "token",
  "whatsapp_send",
];

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
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

function includesForbiddenReservationFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenReservationFragments.some((fragment) => normalized.includes(fragment));
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
    const keyLeaks = includesForbiddenReservationFragment(key) ? [currentPath] : [];

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

  return includesForbiddenReservationFragment(text) ? [text] : [];
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>, path: string) {
  return Object.keys(record)
    .filter((key) => !allowedFields.has(key))
    .map((key) => `${path}.${key}`);
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenReservationFragment(cleaned)) {
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

function validInvoicePrefix(value: unknown) {
  const cleaned = textOrNull(value)?.toUpperCase();

  if (!cleaned || includesForbiddenReservationFragment(cleaned)) {
    return null;
  }

  return /^[A-Z0-9]{2,12}$/.test(cleaned) ? cleaned : null;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function forbiddenReservationResult<T>(): AdminBookingResult<T> {
  return {
    error: "Admin monthly invoice number reservation details include unsupported or unsafe fields.",
    ok: false,
    status: 400,
  };
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
    code === "42883" ||
    code === "42p01" ||
    haystack.includes("could not find") ||
    haystack.includes("does not exist") ||
    haystack.includes("schema cache")
  ) {
    return "table_unreachable";
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
      error: safeInvoiceNumberReservationActorError,
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
      error: safeInvoiceNumberReservationServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyInvoiceNumberReservationSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledInvoiceNumberReservationError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeInvoiceNumberReservationConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeInvoiceNumberReservationConfigError,
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
      error: safeInvoiceNumberReservationConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizeReservationRecord(
  row: UnknownRecord,
): AdminMonthlyInvoiceNumberReservationRecord | null {
  const issueRecordId = validUuid(row.issue_record_id);
  const invoicePrefix = validInvoicePrefix(row.invoice_prefix);
  const invoiceNumber = textOrNull(row.invoice_number);
  const invoiceSequenceNumber = positiveIntegerOrNull(row.invoice_sequence_number);

  if (
    !issueRecordId ||
    !invoicePrefix ||
    !invoiceNumber ||
    !invoiceSequenceNumber ||
    row.invoice_number_status !== "reserved" ||
    !new RegExp(`^${invoicePrefix}-[0-9]{4,}$`).test(invoiceNumber)
  ) {
    return null;
  }

  return {
    invoice_number: invoiceNumber,
    invoice_number_status: "reserved",
    invoice_prefix: invoicePrefix,
    invoice_sequence_number: invoiceSequenceNumber,
    issue_record_id: issueRecordId,
  };
}

export function parseAdminMonthlyInvoiceNumberReservationPayload(
  value: unknown,
): AdminBookingResult<AdminMonthlyInvoiceNumberReservationInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedSaveFields, "invoice_number_reservation").length > 0 ||
    findForbiddenFieldNames(record).length > 0 ||
    findForbiddenTextValues(record).length > 0
  ) {
    return forbiddenReservationResult();
  }

  const issueRecordId = validUuid(record.issue_record_id);
  const customerAccount = safeText(record.customer_account, maxCustomerAccountLength);
  const billingMonth = validBillingMonth(record.billing_month);
  const invoicePrefix = validInvoicePrefix(record.invoice_prefix);
  const safeSequenceNote = optionalSafeText(
    record.safe_sequence_note,
    maxSafeSequenceNoteLength,
  );

  if (
    !issueRecordId ||
    !customerAccount ||
    !billingMonth ||
    !invoicePrefix ||
    (hasOwn(record, "safe_sequence_note") && record.safe_sequence_note && !safeSequenceNote)
  ) {
    return {
      error: "Admin monthly invoice number reservation details are malformed.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      billing_month: billingMonth,
      customer_account: customerAccount,
      invoice_prefix: invoicePrefix,
      issue_record_id: issueRecordId,
      safe_sequence_note: safeSequenceNote,
    },
    ok: true,
  };
}

export async function reserveAdminMonthlyInvoiceNumber(
  input: AdminMonthlyInvoiceNumberReservationInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminMonthlyInvoiceNumberReservationRecord>> {
  const clientResult = getServerOnlyInvoiceNumberReservationSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data.rpc(
    "reserve_monthly_invoice_number_for_issue_record",
    {
      p_actor_label: actor.actor_label,
      p_actor_role: actor.actor_role,
      p_billing_month: input.billing_month,
      p_customer_account: input.customer_account,
      p_invoice_prefix: input.invoice_prefix,
      p_issue_record_id: input.issue_record_id,
      p_safe_sequence_note: input.safe_sequence_note,
    },
  );

  if (error) {
    return safeAdapterFailure(safeInvoiceNumberReservationError, 500, error);
  }

  const row = Array.isArray(data) ? asRecord(data[0]) : asRecord(data);
  const normalized = normalizeReservationRecord(row);

  if (!normalized) {
    return {
      error: safeInvoiceNumberReservationError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: normalized,
    ok: true,
  };
}
