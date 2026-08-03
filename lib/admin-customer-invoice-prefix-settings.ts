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

export const adminCustomerInvoicePrefixSettingsVersion =
  "admin-customer-invoice-prefix-settings-v1";
export const customerInvoiceSequencesTableName = "customer_invoice_sequences";

export type AdminCustomerInvoicePrefixSettingsInput = {
  booker_id: number | null;
  customer_account: string;
  traveler_id: number | null;
};

export type AdminCustomerInvoicePrefixSettingsSaveInput =
  AdminCustomerInvoicePrefixSettingsInput & {
    invoice_prefix: string;
    safe_sequence_note: string | null;
  };

export type AdminCustomerInvoicePrefixSettingRecord = {
  booker_id: number | null;
  customer_account: string;
  invoice_prefix: string;
  last_reserved_at: string | null;
  last_reserved_invoice_number: string | null;
  last_reserved_sequence_number: number | null;
  next_sequence_number: number;
  number_format: "PREFIX-0001";
  prefix_locked: boolean;
  sequence_scope: "lifetime";
  sequence_status: "active" | "on_hold" | "archived";
  traveler_id: number | null;
};

export type AdminCustomerInvoicePrefixSettingsData = {
  customer_account: string;
  prefix_setting: AdminCustomerInvoicePrefixSettingRecord | null;
  version: typeof adminCustomerInvoicePrefixSettingsVersion;
};

type UnknownRecord = Record<string, unknown>;

const maxCustomerAccountLength = 160;
const maxSafeSequenceNoteLength = 1000;
const sequenceSelect = [
  "booker_id",
  "customer_account",
  "invoice_prefix",
  "last_reserved_at",
  "last_reserved_invoice_number",
  "last_reserved_sequence_number",
  "next_sequence_number",
  "sequence_status",
  "traveler_id",
].join(", ");
const disabledPrefixSettingsError =
  "Admin customer invoice prefix settings are not enabled on this server.";
const safePrefixSettingsConfigError =
  "Admin customer invoice prefix settings configuration is not ready.";
const safePrefixSettingsActorError =
  "Admin customer invoice prefix settings require a verified internal admin boundary.";
const malformedPrefixSettingsError =
  "Admin customer invoice prefix settings details are malformed.";
const forbiddenPrefixSettingsError =
  "Admin customer invoice prefix settings include unsupported or unsafe fields.";
const prefixLockedError =
  "Customer invoice prefix is locked after it is saved or auto-created for this customer/account.";
const safePrefixSettingsReadError =
  "Admin customer invoice prefix settings read failed safely.";
const safePrefixSettingsSaveError =
  "Admin customer invoice prefix settings save failed safely.";
const mismatchedTravelerPrefixSettingsError =
  "Admin customer invoice prefix settings require a verified traveller and PA/booker match.";
const allowedReadFields = new Set(["booker_id", "customer_account", "traveler_id"]);
const allowedSaveFields = new Set([
  "booker_id",
  "customer_account",
  "invoice_prefix",
  "safe_sequence_note",
  "traveler_id",
]);
const allowedActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedSequenceStatuses = new Set(["active", "on_hold", "archived"]);
const forbiddenPrefixSettingFragments = [
  "admin_finance",
  "admin_note",
  "auth_link",
  "bank_account",
  "card_number",
  "customer_auth",
  "customer_charge",
  "customer_price",
  "debug",
  "dev_archive",
  "dev_workbench",
  "driver_auth",
  "driver_note",
  "driver_payout",
  "email_payload",
  "finance_note",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
  "live_location",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "payment_link",
  "pay_now",
  "paynow",
  "payout",
  "payout_comparison",
  "pdf_url",
  "raw_ai",
  "raw_parser_prompt",
  "raw_token",
  "secret",
  "send_log",
  "server_secret",
  "service_role",
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

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenPrefixSettingFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenPrefixSettingFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenPrefixSettingFragment(cleaned)) {
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

function validInvoicePrefix(value: unknown) {
  const cleaned = textOrNull(value)?.toUpperCase();

  if (!cleaned || includesForbiddenPrefixSettingFragment(cleaned)) {
    return null;
  }

  return /^[A-Z0-9]{2,12}$/.test(cleaned) && !["INV", "QUO", "CN"].includes(cleaned)
    ? cleaned
    : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalPositiveInteger(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return positiveInteger(value);
}

function safeSequenceStatus(value: unknown) {
  const status = textOrNull(value);

  return status && allowedSequenceStatuses.has(status)
    ? (status as AdminCustomerInvoicePrefixSettingRecord["sequence_status"])
    : null;
}

function safeDateText(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned && /^\d{4}-\d{2}-\d{2}T/.test(cleaned) ? cleaned : null;
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function unknownKeys(record: UnknownRecord, allowedFields: Set<string>) {
  return Object.keys(record).filter((key) => !allowedFields.has(key));
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
    const keyLeaks = includesForbiddenPrefixSettingFragment(key) ? [currentPath] : [];

    return [...keyLeaks, ...findForbiddenFieldNames(nestedValue, currentPath)];
  });
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function readParamKeys(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
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

function databaseErrorStatus(error: unknown) {
  const record = asRecord(error);
  const code = textOrNull(record.code)?.toLowerCase() || "";

  return code === "23505" ? 409 : 500;
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
    actor.source_surface !== "admin_api"
  ) {
    return {
      error: safePrefixSettingsActorError,
      ok: false,
      status: 403,
    };
  }

  if (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED === "true" &&
    (actor.boundary_mode !== "server-session-role-surface" ||
      !["admin", "dispatcher"].includes(actor.actor_role))
  ) {
    return {
      error: safePrefixSettingsActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getServerOnlyPrefixSettingsSupabaseClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledPrefixSettingsError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safePrefixSettingsConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safePrefixSettingsConfigError,
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
      error: safePrefixSettingsConfigError,
      ok: false,
      status: 503,
    };
  }
}

function normalizePrefixSettingRow(
  row: UnknownRecord,
): AdminCustomerInvoicePrefixSettingRecord | null {
  const customerAccount = safeText(row.customer_account, maxCustomerAccountLength);
  const bookerId = optionalPositiveInteger(row.booker_id);
  const invoicePrefix = validInvoicePrefix(row.invoice_prefix);
  const nextSequenceNumber = positiveInteger(row.next_sequence_number);
  const lastReservedSequenceNumber = optionalPositiveInteger(row.last_reserved_sequence_number);
  const lastReservedInvoiceNumber = textOrNull(row.last_reserved_invoice_number);
  const lastReservedAt = safeDateText(row.last_reserved_at);
  const sequenceStatus = safeSequenceStatus(row.sequence_status);
  const travelerId = optionalPositiveInteger(row.traveler_id);

  if (
    !customerAccount ||
    !invoicePrefix ||
    !nextSequenceNumber ||
    !sequenceStatus ||
    Boolean(bookerId) !== Boolean(travelerId) ||
    (lastReservedInvoiceNumber &&
      !new RegExp(`^${invoicePrefix}-[0-9]{4,}$`).test(lastReservedInvoiceNumber))
  ) {
    return null;
  }

  const prefixLocked = true;

  return {
    booker_id: bookerId,
    customer_account: customerAccount,
    invoice_prefix: invoicePrefix,
    last_reserved_at: lastReservedAt,
    last_reserved_invoice_number: lastReservedInvoiceNumber,
    last_reserved_sequence_number: lastReservedSequenceNumber,
    next_sequence_number: nextSequenceNumber,
    number_format: "PREFIX-0001",
    prefix_locked: prefixLocked,
    sequence_scope: "lifetime",
    sequence_status: sequenceStatus,
    traveler_id: travelerId,
  };
}

function parseCustomerAccountInput(
  input: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminCustomerInvoicePrefixSettingsInput> {
  const keys = readParamKeys(input);

  if (keys.some((key) => !allowedReadFields.has(key) || includesForbiddenPrefixSettingFragment(key))) {
    return {
      error: forbiddenPrefixSettingsError,
      ok: false,
      status: 400,
    };
  }

  const customerAccount = safeText(
    readParamsValue(input, "customer_account"),
    maxCustomerAccountLength,
  );
  const bookerId = optionalPositiveInteger(readParamsValue(input, "booker_id"));
  const travelerId = optionalPositiveInteger(readParamsValue(input, "traveler_id"));

  if (!customerAccount || Boolean(bookerId) !== Boolean(travelerId)) {
    return {
      error: malformedPrefixSettingsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booker_id: bookerId,
      customer_account: customerAccount,
      traveler_id: travelerId,
    },
    ok: true,
  };
}

export function parseAdminCustomerInvoicePrefixSettingsSavePayload(
  value: unknown,
): AdminBookingResult<AdminCustomerInvoicePrefixSettingsSaveInput> {
  const record = asRecord(value);

  if (
    unknownKeys(record, allowedSaveFields).length > 0 ||
    findForbiddenFieldNames(record).length > 0
  ) {
    return {
      error: forbiddenPrefixSettingsError,
      ok: false,
      status: 400,
    };
  }

  const customerAccount = safeText(record.customer_account, maxCustomerAccountLength);
  const bookerId = optionalPositiveInteger(record.booker_id);
  const invoicePrefix = validInvoicePrefix(record.invoice_prefix);
  const safeSequenceNote = optionalSafeText(
    record.safe_sequence_note,
    maxSafeSequenceNoteLength,
  );
  const travelerId = optionalPositiveInteger(record.traveler_id);

  if (
    !customerAccount ||
    !invoicePrefix ||
    Boolean(bookerId) !== Boolean(travelerId) ||
    (record.safe_sequence_note && !safeSequenceNote)
  ) {
    return {
      error: malformedPrefixSettingsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      booker_id: bookerId,
      customer_account: customerAccount,
      invoice_prefix: invoicePrefix,
      safe_sequence_note: safeSequenceNote,
      traveler_id: travelerId,
    },
    ok: true,
  };
}

async function loadRawPrefixSetting(
  client: SupabaseClient,
  input: AdminCustomerInvoicePrefixSettingsInput,
): Promise<AdminBookingResult<UnknownRecord | null>> {
  const baseQuery = client
    .from(customerInvoiceSequencesTableName)
    .select(sequenceSelect)
    .eq("customer_account", input.customer_account);
  const scopedQuery = input.traveler_id && input.booker_id
    ? baseQuery.eq("traveler_id", input.traveler_id).eq("booker_id", input.booker_id)
    : baseQuery.is("traveler_id", null).is("booker_id", null);
  const { data, error } = await scopedQuery.maybeSingle();

  if (error) {
    return safeAdapterFailure(safePrefixSettingsReadError, 500, error);
  }

  return {
    data: data ? asRecord(data) : null,
    ok: true,
  };
}

async function verifyTravelerBookerIdentity(
  client: SupabaseClient,
  input: AdminCustomerInvoicePrefixSettingsInput,
): Promise<AdminBookingResult<null>> {
  if (!input.traveler_id || !input.booker_id) {
    return {
      data: null,
      ok: true,
    };
  }

  const { data, error } = await client
    .from("travelers")
    .select("id")
    .eq("id", input.traveler_id)
    .eq("booker_id", input.booker_id)
    .maybeSingle();

  if (error) {
    return safeAdapterFailure(safePrefixSettingsSaveError, 500, error);
  }

  if (!data) {
    return {
      error: mismatchedTravelerPrefixSettingsError,
      ok: false,
      status: 409,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

export async function loadAdminCustomerInvoicePrefixSetting(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerInvoicePrefixSettingsData>> {
  const parsed = parseCustomerAccountInput(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getServerOnlyPrefixSettingsSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const rawResult = await loadRawPrefixSetting(
    clientResult.data,
    parsed.data,
  );

  if (!rawResult.ok) {
    return rawResult;
  }

  const prefixSetting = rawResult.data
    ? normalizePrefixSettingRow(rawResult.data)
    : null;

  if (rawResult.data && !prefixSetting) {
    return {
      error: safePrefixSettingsReadError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: {
      customer_account: parsed.data.customer_account,
      prefix_setting: prefixSetting,
      version: adminCustomerInvoicePrefixSettingsVersion,
    },
    ok: true,
  };
}

export async function saveAdminCustomerInvoicePrefixSetting(
  input: AdminCustomerInvoicePrefixSettingsSaveInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerInvoicePrefixSettingsData>> {
  const clientResult = getServerOnlyPrefixSettingsSupabaseClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const client = clientResult.data;
  const verifiedIdentity = await verifyTravelerBookerIdentity(client, input);

  if (!verifiedIdentity.ok) {
    return verifiedIdentity;
  }

  const rawResult = await loadRawPrefixSetting(client, input);

  if (!rawResult.ok) {
    return rawResult;
  }

  const current = rawResult.data ? normalizePrefixSettingRow(rawResult.data) : null;

  if (rawResult.data && !current) {
    return {
      error: safePrefixSettingsSaveError,
      ok: false,
      status: 500,
    };
  }

  if (current?.prefix_locked) {
    if (current.invoice_prefix !== input.invoice_prefix) {
      return {
        error: prefixLockedError,
        ok: false,
        status: 409,
      };
    }

    return {
      data: {
        customer_account: current.customer_account,
        prefix_setting: current,
        version: adminCustomerInvoicePrefixSettingsVersion,
      },
      ok: true,
    };
  }

  const sequencePayload = {
    actor_label: actor.actor_label,
    actor_role: actor.actor_role,
    booker_id: input.booker_id,
    customer_account: input.customer_account,
    invoice_prefix: input.invoice_prefix,
    next_sequence_number: 1,
    safe_sequence_note: input.safe_sequence_note,
    sequence_status: "active",
    source_surface: "admin_api",
    traveler_id: input.traveler_id,
    updated_at: new Date().toISOString(),
  };
  const saveRequest = current
    ? client
        .from(customerInvoiceSequencesTableName)
        .update(sequencePayload)
        .eq("customer_account", input.customer_account)
        .select(sequenceSelect)
        .single()
    : client
        .from(customerInvoiceSequencesTableName)
        .insert(sequencePayload)
        .select(sequenceSelect)
        .single();
  const { data, error } = await saveRequest;

  if (error) {
    return safeAdapterFailure(
      safePrefixSettingsSaveError,
      databaseErrorStatus(error),
      error,
    );
  }

  const prefixSetting = normalizePrefixSettingRow(asRecord(data));

  if (!prefixSetting) {
    return {
      error: safePrefixSettingsSaveError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: {
      customer_account: prefixSetting.customer_account,
      prefix_setting: prefixSetting,
      version: adminCustomerInvoicePrefixSettingsVersion,
    },
    ok: true,
  };
}
