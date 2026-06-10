import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedBookingCreateVersion = "admin-saved-booking-create-v1";

export type AdminSavedBookingCreateStatus = "assigned" | "confirmed";

export type AdminSavedBookingCreateInput = {
  booker_id: number | null;
  booking_type: string;
  child_seat_count: number;
  child_seat_customer_surcharge: number | null;
  child_seat_driver_payout: number | null;
  child_seat_required: boolean;
  child_seat_type: string | null;
  company_id: number | null;
  customer_price_amount: number | null;
  customer_price_override_reason: string | null;
  customer_rate: number | null;
  customer_rate_override: number | null;
  customer_rate_unit: string | null;
  driver_contact: string | null;
  driver_dispatch_include_payout: boolean;
  driver_id: number | null;
  driver_name: string | null;
  driver_notes: string | null;
  driver_payout_amount: number | null;
  driver_payout_max: number | null;
  driver_payout_min: number | null;
  driver_payout_override: number | null;
  driver_payout_reason: string | null;
  driver_payout_unit: "hour" | "job" | null;
  driver_plate_number: string | null;
  dropoff_address: string;
  extra_stop_count: number;
  extra_stop_payout: number | null;
  extra_stop_surcharge: number | null;
  flight_no: string | null;
  job_card: string;
  midnight_payout: number | null;
  midnight_surcharge: number | null;
  pax: number;
  pickup_address: string;
  pickup_time: string;
  pricing_source: string | null;
  route: string;
  status: AdminSavedBookingCreateStatus;
  traveler_id: number | null;
  vehicle: string;
};

export type AdminSavedBookingCreateRecord = {
  id: string | number;
  status: AdminSavedBookingCreateStatus;
};

export type AdminSavedBookingCreateData = {
  booking: AdminSavedBookingCreateRecord;
  version: typeof adminSavedBookingCreateVersion;
};

type AdminSavedBookingCreateFailureCategory =
  | "auth_or_key_rejected"
  | "client_init_failed"
  | "column_missing"
  | "permission_or_rls_denied"
  | "table_unreachable"
  | "unknown_adapter_failure";

type AdminSavedBookingCreateResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      category?: AdminSavedBookingCreateFailureCategory;
      error: string;
      ok: false;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;
type SavedBookingCreateClient = Pick<SupabaseClient, "from">;

const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedPayloadKeys = new Set([
  "booker_id",
  "booking_type",
  "child_seat_count",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "child_seat_required",
  "child_seat_type",
  "company_id",
  "customer_price_amount",
  "customer_price_override_reason",
  "customer_rate",
  "customer_rate_override",
  "customer_rate_unit",
  "driver_contact",
  "driver_dispatch_include_payout",
  "driver_id",
  "driver_name",
  "driver_notes",
  "driver_payout_amount",
  "driver_payout_max",
  "driver_payout_min",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_plate_number",
  "dropoff_address",
  "extra_stop_count",
  "extra_stop_payout",
  "extra_stop_surcharge",
  "flight_no",
  "job_card",
  "midnight_payout",
  "midnight_surcharge",
  "pax",
  "pickup_address",
  "pickup_time",
  "pricing_source",
  "route",
  "status",
  "traveler_id",
  "vehicle",
]);
const allowedStatuses = new Set(["assigned", "confirmed"]);
const allowedPayoutUnits = new Set(["hour", "job"]);
const malformedPayloadError = "Admin saved booking create payload is malformed.";
const safeActorError =
  "Admin saved booking create requires a verified internal boundary.";
const safeConfigError =
  "Admin saved booking create configuration is not ready.";
const safeCreateError = "Admin saved booking create failed safely.";
const safeCreateReturnError =
  "Admin saved booking create result was not returned.";
const safeSessionActorError =
  "Admin saved booking create requires a verified admin or dispatcher server session.";
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = 5000) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function numberOrNull(value: unknown) {
  if (
    value === null ||
    value === undefined ||
    typeof value === "boolean" ||
    (typeof value === "string" && !value.trim())
  ) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function nonNegativeIntegerOrNull(value: unknown) {
  const parsed = numberOrNull(value);

  return parsed !== null && Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = numberOrNull(value);

  return parsed !== null && Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function optionalId(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  const parsed = positiveIntegerOrNull(value);

  return parsed === null
    ? {
        ok: false as const,
        value: null,
      }
    : {
        ok: true as const,
        value: parsed,
      };
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  const parsed = numberOrNull(value);

  return parsed === null
    ? {
        ok: false as const,
        value: null,
      }
    : {
        ok: true as const,
        value: parsed,
      };
}

function optionalNonNegativeInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: 0,
    };
  }

  const parsed = nonNegativeIntegerOrNull(value);

  return parsed === null
    ? {
        ok: false as const,
        value: 0,
      }
    : {
        ok: true as const,
        value: parsed,
      };
}

function requiredPositiveInteger(value: unknown) {
  const parsed = positiveIntegerOrNull(value);

  return parsed ?? null;
}

function requiredBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function optionalPayoutUnit(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return {
      ok: true as const,
      value: null,
    };
  }

  const normalized = textOrNull(value, 20)?.toLowerCase() || "";

  return allowedPayoutUnits.has(normalized)
    ? {
        ok: true as const,
        value: normalized as "hour" | "job",
      }
    : {
        ok: false as const,
        value: null,
      };
}

function validStatus(value: unknown) {
  const normalized = textOrNull(value, 40)?.toLowerCase() || "";

  return allowedStatuses.has(normalized)
    ? (normalized as AdminSavedBookingCreateStatus)
    : null;
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function isPlaceholderConfigValue(value: string) {
  const normalized = value.trim().toLowerCase();

  return (
    placeholderConfigPattern.test(normalized) ||
    normalized.includes("placeholder") ||
    normalized.includes("change_me") ||
    normalized.includes("changeme") ||
    normalized.includes("replace_me") ||
    normalized.includes("your-") ||
    normalized.includes("your_") ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

function validServerDatabaseUrl(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "https:" &&
      hostname.length > 0 &&
      !hostname.includes("localhost") &&
      !hostname.includes("example") &&
      !hostname.includes("placeholder")
    );
  } catch {
    return false;
  }
}

function validServerCredential(value: string | null) {
  if (!value || isPlaceholderConfigValue(value)) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 24 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function classifyDatabaseFailure(error: unknown): AdminSavedBookingCreateFailureCategory {
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

function safeDatabaseFailure<T>(
  error: string,
  status: number,
  databaseError: unknown,
): AdminSavedBookingCreateResult<T> {
  return {
    category: classifyDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminSavedBookingCreateResult<null> {
  if (
    !actor ||
    !allowedAdapterActorRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      error: safeActorError,
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
      error: safeSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getSavedBookingCreateClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingCreateResult<SavedBookingCreateClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!validServerDatabaseUrl(supabaseUrl) || !validServerCredential(serviceRoleKey)) {
    return {
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }

  try {
    return {
      data: createClient(supabaseUrl as string, serviceRoleKey as string, {
        auth: {
          persistSession: false,
        },
      }),
      ok: true,
    };
  } catch {
    return {
      category: "client_init_failed",
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }
}

function toCreateRecord(value: unknown): AdminSavedBookingCreateRecord | null {
  const row = asRecord(value);
  const id =
    typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);
  const status = validStatus(row.status);

  if (id === null || !status) {
    return null;
  }

  return {
    id,
    status,
  };
}

export function parseAdminSavedBookingCreatePayload(
  input: unknown,
): AdminSavedBookingCreateResult<AdminSavedBookingCreateInput> {
  const record = asRecord(input);
  const unsupportedKey = Object.keys(record).find((key) => !allowedPayloadKeys.has(key));
  const companyId = optionalId(record.company_id);
  const bookerId = optionalId(record.booker_id);
  const travelerId = optionalId(record.traveler_id);
  const driverId = optionalId(record.driver_id);
  const customerRate = optionalNumber(record.customer_rate);
  const customerPriceAmount = optionalNumber(record.customer_price_amount);
  const customerRateOverride = optionalNumber(record.customer_rate_override);
  const driverPayoutMin = optionalNumber(record.driver_payout_min);
  const driverPayoutMax = optionalNumber(record.driver_payout_max);
  const driverPayoutAmount = optionalNumber(record.driver_payout_amount);
  const driverPayoutOverride = optionalNumber(record.driver_payout_override);
  const driverPayoutUnit = optionalPayoutUnit(record.driver_payout_unit);
  const midnightSurcharge = optionalNumber(record.midnight_surcharge);
  const midnightPayout = optionalNumber(record.midnight_payout);
  const extraStopCount = optionalNonNegativeInteger(record.extra_stop_count);
  const extraStopSurcharge = optionalNumber(record.extra_stop_surcharge);
  const extraStopPayout = optionalNumber(record.extra_stop_payout);
  const childSeatRequired = requiredBoolean(record.child_seat_required);
  const childSeatCount = optionalNonNegativeInteger(record.child_seat_count);
  const childSeatCustomerSurcharge = optionalNumber(record.child_seat_customer_surcharge);
  const childSeatDriverPayout = optionalNumber(record.child_seat_driver_payout);
  const driverDispatchIncludePayout = requiredBoolean(record.driver_dispatch_include_payout);
  const pax = requiredPositiveInteger(record.pax);
  const status = validStatus(record.status);

  if (
    unsupportedKey ||
    !companyId.ok ||
    !bookerId.ok ||
    !travelerId.ok ||
    !driverId.ok ||
    !customerRate.ok ||
    !customerPriceAmount.ok ||
    !customerRateOverride.ok ||
    !driverPayoutMin.ok ||
    !driverPayoutMax.ok ||
    !driverPayoutAmount.ok ||
    !driverPayoutOverride.ok ||
    !driverPayoutUnit.ok ||
    !midnightSurcharge.ok ||
    !midnightPayout.ok ||
    !extraStopCount.ok ||
    !extraStopSurcharge.ok ||
    !extraStopPayout.ok ||
    childSeatRequired === null ||
    !childSeatCount.ok ||
    !childSeatCustomerSurcharge.ok ||
    !childSeatDriverPayout.ok ||
    driverDispatchIncludePayout === null ||
    !pax ||
    !status
  ) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  const parsed = {
    booker_id: bookerId.value,
    booking_type: textOrNull(record.booking_type, 80),
    child_seat_count: childSeatCount.value,
    child_seat_customer_surcharge: childSeatCustomerSurcharge.value,
    child_seat_driver_payout: childSeatDriverPayout.value,
    child_seat_required: childSeatRequired,
    child_seat_type: textOrNull(record.child_seat_type, 160),
    company_id: companyId.value,
    customer_price_amount: customerPriceAmount.value,
    customer_price_override_reason: textOrNull(record.customer_price_override_reason, 500),
    customer_rate: customerRate.value,
    customer_rate_override: customerRateOverride.value,
    customer_rate_unit: textOrNull(record.customer_rate_unit, 80),
    driver_contact: textOrNull(record.driver_contact, 80),
    driver_dispatch_include_payout: driverDispatchIncludePayout,
    driver_id: driverId.value,
    driver_name: textOrNull(record.driver_name, 160),
    driver_notes: textOrNull(record.driver_notes, 2000),
    driver_payout_amount: driverPayoutAmount.value,
    driver_payout_max: driverPayoutMax.value,
    driver_payout_min: driverPayoutMin.value,
    driver_payout_override: driverPayoutOverride.value,
    driver_payout_reason: textOrNull(record.driver_payout_reason, 500),
    driver_payout_unit: driverPayoutUnit.value,
    driver_plate_number: textOrNull(record.driver_plate_number, 40),
    dropoff_address: textOrNull(record.dropoff_address, 1000),
    extra_stop_count: extraStopCount.value,
    extra_stop_payout: extraStopPayout.value,
    extra_stop_surcharge: extraStopSurcharge.value,
    flight_no: textOrNull(record.flight_no, 80),
    job_card: textOrNull(record.job_card, 5000),
    midnight_payout: midnightPayout.value,
    midnight_surcharge: midnightSurcharge.value,
    pax,
    pickup_address: textOrNull(record.pickup_address, 1000),
    pickup_time: textOrNull(record.pickup_time, 120),
    pricing_source: textOrNull(record.pricing_source, 120),
    route: textOrNull(record.route, 2000),
    status,
    traveler_id: travelerId.value,
    vehicle: textOrNull(record.vehicle, 80),
  };

  if (
    !parsed.booking_type ||
    !parsed.vehicle ||
    !parsed.pickup_time ||
    !parsed.pickup_address ||
    !parsed.dropoff_address ||
    !parsed.route ||
    !parsed.job_card
  ) {
    return {
      error: malformedPayloadError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: parsed as AdminSavedBookingCreateInput,
    ok: true,
  };
}

export async function createAdminSavedBooking(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingCreateResult<AdminSavedBookingCreateData>> {
  const parsed = parseAdminSavedBookingCreatePayload(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingCreateClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from("bookings")
    .insert(parsed.data)
    .select("id, status")
    .single();

  if (error) {
    return safeDatabaseFailure(safeCreateError, 500, error);
  }

  const booking = toCreateRecord(data);

  if (!booking) {
    return {
      error: safeCreateReturnError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: {
      booking,
      version: adminSavedBookingCreateVersion,
    },
    ok: true,
  };
}
