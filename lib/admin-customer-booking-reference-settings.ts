import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingResult } from "./admin-booking-persistence";
import {
  checkAdminBookingPersistenceStagingConfigReadiness,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";

export const adminCustomerBookingReferenceSettingsVersion =
  "admin-customer-booking-reference-settings-v1";

export type AdminCustomerBookingReferenceSettingRecord = {
  booking_prefix: string;
  customer_account: string;
  next_sequence_number: number;
  number_format: "PREFIX-00001";
  prefix_locked: true;
  sequence_status: "active" | "on_hold" | "archived";
};

export type AdminCustomerBookingReferenceSettingsData = {
  customer_account: string;
  reference_setting: AdminCustomerBookingReferenceSettingRecord | null;
  version: typeof adminCustomerBookingReferenceSettingsVersion;
};

export type AdminCustomerBookingReferenceSettingsSaveInput = {
  booking_prefix: string;
  customer_account: string;
};

type UnknownRecord = Record<string, unknown>;

const tableName = "customer_booking_reference_sequences";
const selectColumns =
  "customer_account, booking_prefix, next_sequence_number, sequence_status";
const allowedReadFields = new Set(["customer_account"]);
const allowedSaveFields = new Set(["booking_prefix", "customer_account"]);
const allowedStatuses = new Set(["active", "on_hold", "archived"]);
const malformedError = "Customer booking reference settings are malformed.";
const forbiddenError =
  "Customer booking reference settings include unsupported fields.";
const actorError =
  "Customer booking reference settings require a verified internal admin boundary.";
const configError =
  "Customer booking reference settings configuration is not ready.";
const readError = "Customer booking reference settings read failed safely.";
const saveError = "Customer booking reference settings save failed safely.";
const lockedError =
  "Customer booking reference prefix is locked after it is saved for this customer.";
const usedError =
  "Customer booking reference prefix is already used by another customer.";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function clean(value: unknown) {
  return typeof value === "string" || typeof value === "number"
    ? String(value).replace(/\s+/g, " ").trim()
    : "";
}

function safeCustomerAccount(value: unknown) {
  const cleaned = clean(value);

  return cleaned && cleaned.length <= 160 && !/[\r\n]/.test(cleaned)
    ? cleaned
    : null;
}

function safeBookingPrefix(value: unknown) {
  const cleaned = clean(value).toUpperCase();

  return /^[A-Z0-9]{2,12}$/.test(cleaned) ? cleaned : null;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 100000
    ? parsed
    : null;
}

function validateActor(actor: AdminBookingPersistenceAdapterActor) {
  if (
    !actor ||
    actor.actor_role !== "admin" ||
    actor.source_surface !== "admin_api" ||
    !clean(actor.actor_label)
  ) {
    return false;
  }

  return (
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true" ||
    actor.boundary_mode === "server-session-role-surface"
  );
}

function configValue(value: string | undefined) {
  return value?.trim() || null;
}

function settingsClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<SupabaseClient> {
  if (!validateActor(actor)) {
    return { error: actorError, ok: false, status: 403 };
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return { error: configError, ok: false, status: 503 };
  }

  const readiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!readiness.ok) {
    return { error: configError, ok: false, status: readiness.status };
  }

  const supabaseUrl = configValue(process.env.SUPABASE_URL);
  const serviceRoleKey = configValue(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return { error: configError, ok: false, status: 503 };
  }

  try {
    return {
      data: createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false },
      }),
      ok: true,
    };
  } catch {
    return { error: configError, ok: false, status: 503 };
  }
}

function normalizeSetting(
  value: unknown,
): AdminCustomerBookingReferenceSettingRecord | null {
  const row = asRecord(value);
  const customerAccount = safeCustomerAccount(row.customer_account);
  const bookingPrefix = safeBookingPrefix(row.booking_prefix);
  const nextSequenceNumber = positiveInteger(row.next_sequence_number);
  const sequenceStatus = clean(row.sequence_status);

  if (
    !customerAccount ||
    !bookingPrefix ||
    !nextSequenceNumber ||
    !allowedStatuses.has(sequenceStatus)
  ) {
    return null;
  }

  return {
    booking_prefix: bookingPrefix,
    customer_account: customerAccount,
    next_sequence_number: nextSequenceNumber,
    number_format: "PREFIX-00001",
    prefix_locked: true,
    sequence_status:
      sequenceStatus as AdminCustomerBookingReferenceSettingRecord["sequence_status"],
  };
}

function inputKeys(input: URLSearchParams | UnknownRecord) {
  return input instanceof URLSearchParams ? [...input.keys()] : Object.keys(input);
}

function inputValue(input: URLSearchParams | UnknownRecord, key: string) {
  return input instanceof URLSearchParams ? input.get(key) : input[key];
}

function parseCustomerAccount(
  input: URLSearchParams | UnknownRecord,
): AdminBookingResult<{ customer_account: string }> {
  if (inputKeys(input).some((key) => !allowedReadFields.has(key))) {
    return { error: forbiddenError, ok: false, status: 400 };
  }

  const customerAccount = safeCustomerAccount(inputValue(input, "customer_account"));

  return customerAccount
    ? { data: { customer_account: customerAccount }, ok: true }
    : { error: malformedError, ok: false, status: 400 };
}

export function parseAdminCustomerBookingReferenceSettingsSavePayload(
  value: unknown,
): AdminBookingResult<AdminCustomerBookingReferenceSettingsSaveInput> {
  const record = asRecord(value);

  if (Object.keys(record).some((key) => !allowedSaveFields.has(key))) {
    return { error: forbiddenError, ok: false, status: 400 };
  }

  const customerAccount = safeCustomerAccount(record.customer_account);
  const bookingPrefix = safeBookingPrefix(record.booking_prefix);

  return customerAccount && bookingPrefix
    ? {
        data: {
          booking_prefix: bookingPrefix,
          customer_account: customerAccount,
        },
        ok: true,
      }
    : { error: malformedError, ok: false, status: 400 };
}

async function loadRawSetting(client: SupabaseClient, customerAccount: string) {
  const { data, error } = await client
    .from(tableName)
    .select(selectColumns)
    .eq("customer_account", customerAccount)
    .maybeSingle();

  return error
    ? ({ error: readError, ok: false, status: 500 } as const)
    : ({ data, ok: true } as const);
}

export async function loadAdminCustomerBookingReferenceSetting(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerBookingReferenceSettingsData>> {
  const parsed = parseCustomerAccount(input);

  if (!parsed.ok) return parsed;

  const clientResult = settingsClient(actor);

  if (!clientResult.ok) return clientResult;

  const rawResult = await loadRawSetting(
    clientResult.data,
    parsed.data.customer_account,
  );

  if (!rawResult.ok) return rawResult;

  const referenceSetting = rawResult.data
    ? normalizeSetting(rawResult.data)
    : null;

  if (rawResult.data && !referenceSetting) {
    return { error: readError, ok: false, status: 500 };
  }

  return {
    data: {
      customer_account: parsed.data.customer_account,
      reference_setting: referenceSetting,
      version: adminCustomerBookingReferenceSettingsVersion,
    },
    ok: true,
  };
}

export async function saveAdminCustomerBookingReferenceSetting(
  input: AdminCustomerBookingReferenceSettingsSaveInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerBookingReferenceSettingsData>> {
  const clientResult = settingsClient(actor);

  if (!clientResult.ok) return clientResult;

  const rawResult = await loadRawSetting(
    clientResult.data,
    input.customer_account,
  );

  if (!rawResult.ok) return rawResult;

  const current = rawResult.data ? normalizeSetting(rawResult.data) : null;

  if (rawResult.data && !current) {
    return { error: saveError, ok: false, status: 500 };
  }

  if (current) {
    if (current.booking_prefix !== input.booking_prefix) {
      return { error: lockedError, ok: false, status: 409 };
    }

    return {
      data: {
        customer_account: current.customer_account,
        reference_setting: current,
        version: adminCustomerBookingReferenceSettingsVersion,
      },
      ok: true,
    };
  }

  const { data, error } = await clientResult.data
    .from(tableName)
    .insert({
      actor_label: actor.actor_label,
      actor_role: actor.actor_role,
      booking_prefix: input.booking_prefix,
      customer_account: input.customer_account,
      next_sequence_number: 1,
      sequence_status: "active",
      source_surface: "admin_api",
    })
    .select(selectColumns)
    .single();

  if (error) {
    const status = clean(asRecord(error).code) === "23505" ? 409 : 500;

    return {
      error: status === 409 ? usedError : saveError,
      ok: false,
      status,
    };
  }

  const referenceSetting = normalizeSetting(data);

  if (!referenceSetting) {
    return { error: saveError, ok: false, status: 500 };
  }

  return {
    data: {
      customer_account: referenceSetting.customer_account,
      reference_setting: referenceSetting,
      version: adminCustomerBookingReferenceSettingsVersion,
    },
    ok: true,
  };
}
