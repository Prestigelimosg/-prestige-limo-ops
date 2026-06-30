import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminSavedBookingReadVersion = "admin-saved-booking-read-v1";

export type AdminSavedBookingReadParams = {
  id: string;
};

export type AdminSavedBookingListReadParams = {
  limit: number;
};

export type AdminSavedBookingRecord = {
  booking_reference: string | null;
  source_channel: string | null;
  source_surface: string | null;
  booker_id: number | null;
  bookers: {
    booker_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  booking_type: string | null;
  child_seat_count: number | null;
  child_seat_customer_surcharge: number | null;
  child_seat_driver_payout: number | null;
  child_seat_required: boolean | null;
  child_seat_type: string | null;
  companies: {
    company_name: string | null;
    domain: string | null;
  } | null;
  company_id: number | null;
  created_at: string | null;
  contact_display_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  customer_display_name: string | null;
  customer_price_amount: number | null;
  customer_price_override_reason: string | null;
  customer_rate: number | null;
  customer_rate_override: number | null;
  customer_rate_unit: string | null;
  driver_contact: string | null;
  driver_dispatch_include_payout: boolean | null;
  driver_id: number | null;
  driver_name: string | null;
  driver_notes: string | null;
  driver_payout_amount: number | null;
  driver_payout_max: number | null;
  driver_payout_min: number | null;
  driver_payout_override: number | null;
  driver_payout_reason: string | null;
  driver_payout_unit: string | null;
  driver_plate_number: string | null;
  dropoff_address: string | null;
  dropoff_location: string | null;
  extra_stop_count: number | null;
  extra_stop_payout: number | null;
  extra_stop_surcharge: number | null;
  flight_no: string | null;
  id: string | number;
  job_card: string | null;
  midnight_payout: number | null;
  midnight_surcharge: number | null;
  pax: number | null;
  passenger_name: string | null;
  passenger_phone: string | null;
  pax_count: number | null;
  pickup_address: string | null;
  pickup_at: string | null;
  pickup_datetime: string | null;
  pickup_location: string | null;
  pickup_time: string | null;
  pricing_source: string | null;
  route: string | null;
  route_summary: string | null;
  route_type: string | null;
  service_type: string | null;
  status: string | null;
  traveler_id: number | null;
  travelers: {
    traveler_name: string | null;
  } | null;
  updated_at: string | null;
  vehicle: string | null;
  vehicle_type: string | null;
  vehicle_type_or_category: string | null;
};

export type AdminSavedBookingReadData = {
  booking: AdminSavedBookingRecord | null;
  version: typeof adminSavedBookingReadVersion;
};

export type AdminSavedBookingListReadData = {
  bookings: AdminSavedBookingRecord[];
  version: typeof adminSavedBookingReadVersion;
};

type AdminSavedBookingReadFailureCategory =
  | "auth_or_key_rejected"
  | "client_init_failed"
  | "column_missing"
  | "permission_or_rls_denied"
  | "table_unreachable"
  | "unknown_adapter_failure";

type AdminSavedBookingReadResult<T> =
  | {
      data: T;
      ok: true;
    }
  | {
      category?: AdminSavedBookingReadFailureCategory;
      error: string;
      ok: false;
      status: number;
    };

type UnknownRecord = Record<string, unknown>;
type SavedBookingClient = Pick<SupabaseClient, "from">;
type SavedBookingSelectResult<T> = {
  data: T | null;
  error: unknown;
};

const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedSingleReadQueryParams = new Set(["booking_id", "id"]);
const allowedListReadQueryParams = new Set(["limit"]);
const adminSavedBookingLegacyReadSelect =
  "id, booking_reference, source_channel, source_surface, company_id, booker_id, traveler_id, booking_type, service_type, route_type, vehicle, vehicle_type, vehicle_type_or_category, pickup_time, pickup_at, pickup_datetime, pickup_address, pickup_location, dropoff_address, dropoff_location, flight_no, route, route_summary, pax, pax_count, passenger_name, passenger_phone, customer_display_name, contact_display_name, contact_phone, contact_email, job_card, status, driver_id, driver_name, driver_contact, driver_plate_number, customer_rate, customer_rate_unit, customer_price_amount, customer_rate_override, customer_price_override_reason, driver_payout_min, driver_payout_max, driver_payout_amount, driver_payout_override, driver_payout_reason, driver_payout_unit, driver_notes, driver_dispatch_include_payout, midnight_surcharge, midnight_payout, extra_stop_count, extra_stop_surcharge, extra_stop_payout, child_seat_required, child_seat_count, child_seat_type, child_seat_customer_surcharge, child_seat_driver_payout, pricing_source, created_at, updated_at, companies(company_name, domain), bookers(booker_name, email, phone), travelers(traveler_name)";
const adminSavedBookingCurrentReadSelect =
  "id, booking_reference, source_surface, customer_display_name, contact_display_name, contact_phone, contact_email, service_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, passenger_phone, flight_no, driver_name, driver_contact, driver_plate_number, vehicle_type_or_category, admin_internal_status, customer_facing_status, created_at, updated_at";
const adminSavedBookingCurrentMinimalReadSelect =
  "id, booking_reference, source_surface, customer_display_name, contact_display_name, contact_phone, contact_email, service_type, pickup_at, pickup_location, dropoff_location, route_summary, passenger_name, passenger_phone, admin_internal_status, customer_facing_status, created_at, updated_at";
const adminSavedBookingFoundationScalarReadSelect =
  "id, booking_reference, source_channel, booking_type, vehicle, pickup_time, pickup_address, dropoff_address, flight_no, route, pax, job_card, status, driver_id, driver_name, driver_contact, driver_plate_number, created_at, updated_at";
const adminSavedBookingReadSelects = [
  adminSavedBookingLegacyReadSelect,
  adminSavedBookingCurrentReadSelect,
  adminSavedBookingCurrentMinimalReadSelect,
  adminSavedBookingFoundationScalarReadSelect,
] as const;
const defaultListLimit = 25;
const maxListLimit = 100;
const malformedParamsError =
  "Admin saved booking read parameters are malformed.";
const safeActorError =
  "Admin saved booking read requires a verified internal boundary.";
const safeConfigError =
  "Admin saved booking read configuration is not ready.";
const safeReadError = "Admin saved booking read failed safely.";
const safeSessionActorError =
  "Admin saved booking read requires a verified admin or dispatcher server session.";
const maxSafeTextLength = 5000;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = maxSafeTextLength) {
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

function integerOrNull(value: unknown) {
  const parsed = numberOrNull(value);

  return parsed !== null && Number.isSafeInteger(parsed) ? parsed : null;
}

function booleanOrNull(value: unknown) {
  return typeof value === "boolean" ? value : null;
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

function classifyDatabaseFailure(
  error: unknown,
): AdminSavedBookingReadFailureCategory {
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
): AdminSavedBookingReadResult<T> {
  return {
    category: classifyDatabaseFailure(databaseError),
    error,
    ok: false,
    status,
  };
}

function isColumnMissingFailure(error: unknown) {
  return classifyDatabaseFailure(error) === "column_missing";
}

async function loadAdminSavedBookingsWithSchemaFallback<T>(
  buildQuery: (selectedColumns: string) => PromiseLike<SavedBookingSelectResult<T>>,
): Promise<SavedBookingSelectResult<T>> {
  let lastResult: SavedBookingSelectResult<T> | null = null;

  for (const selectedColumns of adminSavedBookingReadSelects) {
    const result = await buildQuery(selectedColumns);

    if (!result.error || !isColumnMissingFailure(result.error)) {
      return result;
    }

    lastResult = result;
  }

  return (
    lastResult ?? {
      data: null,
      error: { message: safeReadError },
    }
  );
}

function validateActor(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingReadResult<null> {
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

function getSavedBookingClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminSavedBookingReadResult<SavedBookingClient> {
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

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function paramEntries(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams
    ? [...params.entries()]
    : Object.entries(params).map(([key, value]) => [key, value] as const);
}

function validBookingId(value: unknown) {
  const cleaned = textOrNull(value, 120);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function positiveInteger(value: unknown, defaultValue: number, maxValue: number) {
  if (value === undefined || value === null || value === "") {
    return defaultValue;
  }

  const parsed = Number(value);

  return Number.isInteger(parsed) && parsed >= 1 && parsed <= maxValue ? parsed : null;
}

function nestedCompany(value: unknown): AdminSavedBookingRecord["companies"] {
  const record = asRecord(value);
  const companyName = textOrNull(record.company_name, 220);
  const domain = textOrNull(record.domain, 220);

  return companyName || domain
    ? {
        company_name: companyName,
        domain,
      }
    : null;
}

function nestedBooker(value: unknown): AdminSavedBookingRecord["bookers"] {
  const record = asRecord(value);
  const bookerName = textOrNull(record.booker_name, 220);
  const email = textOrNull(record.email, 220);
  const phone = textOrNull(record.phone, 80);

  return bookerName || email || phone
    ? {
        booker_name: bookerName,
        email,
        phone,
      }
    : null;
}

function nestedTraveler(value: unknown): AdminSavedBookingRecord["travelers"] {
  const record = asRecord(value);
  const travelerName = textOrNull(record.traveler_name, 220);

  return travelerName
    ? {
        traveler_name: travelerName,
      }
    : null;
}

function toSavedBookingRecord(value: unknown): AdminSavedBookingRecord | null {
  const row = asRecord(value);
  const id =
    typeof row.id === "number" && Number.isSafeInteger(row.id)
      ? row.id
      : textOrNull(row.id, 120);

  if (id === null) {
    return null;
  }

  return {
    booking_reference: textOrNull(row.booking_reference, 160),
    source_channel: textOrNull(row.source_channel, 120),
    source_surface: textOrNull(row.source_surface, 120),
    booker_id: integerOrNull(row.booker_id),
    bookers: nestedBooker(row.bookers),
    booking_type: textOrNull(row.booking_type, 80),
    child_seat_count: integerOrNull(row.child_seat_count),
    child_seat_customer_surcharge: numberOrNull(row.child_seat_customer_surcharge),
    child_seat_driver_payout: numberOrNull(row.child_seat_driver_payout),
    child_seat_required: booleanOrNull(row.child_seat_required),
    child_seat_type: textOrNull(row.child_seat_type, 160),
    companies: nestedCompany(row.companies),
    company_id: integerOrNull(row.company_id),
    contact_display_name: textOrNull(row.contact_display_name, 220),
    contact_email: textOrNull(row.contact_email, 220),
    contact_phone: textOrNull(row.contact_phone, 120),
    created_at: textOrNull(row.created_at, 80),
    customer_display_name: textOrNull(row.customer_display_name, 220),
    customer_price_amount: numberOrNull(row.customer_price_amount),
    customer_price_override_reason: textOrNull(row.customer_price_override_reason, 500),
    customer_rate: numberOrNull(row.customer_rate),
    customer_rate_override: numberOrNull(row.customer_rate_override),
    customer_rate_unit: textOrNull(row.customer_rate_unit, 80),
    driver_contact: textOrNull(row.driver_contact, 160),
    driver_dispatch_include_payout: booleanOrNull(row.driver_dispatch_include_payout),
    driver_id: integerOrNull(row.driver_id),
    driver_name: textOrNull(row.driver_name, 220),
    driver_notes: textOrNull(row.driver_notes, 1000),
    driver_payout_amount: numberOrNull(row.driver_payout_amount),
    driver_payout_max: numberOrNull(row.driver_payout_max),
    driver_payout_min: numberOrNull(row.driver_payout_min),
    driver_payout_override: numberOrNull(row.driver_payout_override),
    driver_payout_reason: textOrNull(row.driver_payout_reason, 500),
    driver_payout_unit: textOrNull(row.driver_payout_unit, 80),
    driver_plate_number: textOrNull(row.driver_plate_number, 120),
    dropoff_address: textOrNull(row.dropoff_address, 1000),
    dropoff_location: textOrNull(row.dropoff_location, 1000),
    extra_stop_count: integerOrNull(row.extra_stop_count),
    extra_stop_payout: numberOrNull(row.extra_stop_payout),
    extra_stop_surcharge: numberOrNull(row.extra_stop_surcharge),
    flight_no: textOrNull(row.flight_no, 120),
    id,
    job_card: textOrNull(row.job_card, 5000),
    midnight_payout: numberOrNull(row.midnight_payout),
    midnight_surcharge: numberOrNull(row.midnight_surcharge),
    pax: integerOrNull(row.pax),
    passenger_name: textOrNull(row.passenger_name, 220),
    passenger_phone: textOrNull(row.passenger_phone, 120),
    pax_count: integerOrNull(row.pax_count),
    pickup_at: textOrNull(row.pickup_at, 120),
    pickup_address: textOrNull(row.pickup_address, 1000),
    pickup_datetime: textOrNull(row.pickup_datetime, 120),
    pickup_location: textOrNull(row.pickup_location, 1000),
    pickup_time: textOrNull(row.pickup_time, 80),
    pricing_source: textOrNull(row.pricing_source, 220),
    route: textOrNull(row.route, 1000),
    route_summary: textOrNull(row.route_summary, 1000),
    route_type: textOrNull(row.route_type, 120),
    service_type: textOrNull(row.service_type, 120),
    status:
      textOrNull(row.status, 80) ||
      textOrNull(row.admin_internal_status, 80) ||
      textOrNull(row.customer_facing_status, 80),
    traveler_id: integerOrNull(row.traveler_id),
    travelers: nestedTraveler(row.travelers),
    updated_at: textOrNull(row.updated_at, 80),
    vehicle: textOrNull(row.vehicle, 120),
    vehicle_type: textOrNull(row.vehicle_type, 120),
    vehicle_type_or_category: textOrNull(row.vehicle_type_or_category, 120),
  };
}

export function parseAdminSavedBookingReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminSavedBookingReadResult<AdminSavedBookingReadParams> {
  const unsupportedParam = paramEntries(params).find(
    ([key]) => !allowedSingleReadQueryParams.has(key),
  );

  if (unsupportedParam) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  const id = validBookingId(
    readParamsValue(params, "id") || readParamsValue(params, "booking_id"),
  );

  if (!id) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      id,
    },
    ok: true,
  };
}

export function parseAdminSavedBookingListReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminSavedBookingReadResult<AdminSavedBookingListReadParams> {
  const unsupportedParam = paramEntries(params).find(
    ([key]) => !allowedListReadQueryParams.has(key),
  );

  if (unsupportedParam) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  const limit = positiveInteger(
    readParamsValue(params, "limit"),
    defaultListLimit,
    maxListLimit,
  );

  if (!limit) {
    return {
      error: malformedParamsError,
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      limit,
    },
    ok: true,
  };
}

export async function loadAdminSavedBookingById(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingReadResult<AdminSavedBookingReadData>> {
  const parsed = parseAdminSavedBookingReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await loadAdminSavedBookingsWithSchemaFallback((selectedColumns) =>
    clientResult.data
      .from("bookings")
      .select(selectedColumns)
      .eq("id", parsed.data.id)
      .limit(1)
      .maybeSingle(),
  );

  if (error) {
    return safeDatabaseFailure(safeReadError, 500, error);
  }

  return {
    data: {
      booking: toSavedBookingRecord(data),
      version: adminSavedBookingReadVersion,
    },
    ok: true,
  };
}

export async function loadAdminSavedBookingList(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminSavedBookingReadResult<AdminSavedBookingListReadData>> {
  const parsed = parseAdminSavedBookingListReadParams(input);

  if (!parsed.ok) {
    return parsed;
  }

  const clientResult = getSavedBookingClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await loadAdminSavedBookingsWithSchemaFallback((selectedColumns) =>
    clientResult.data
      .from("bookings")
      .select(selectedColumns)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit),
  );

  if (error) {
    return safeDatabaseFailure(safeReadError, 500, error);
  }

  return {
    data: {
      bookings: Array.isArray(data)
        ? data
            .map(toSavedBookingRecord)
            .filter((booking): booking is AdminSavedBookingRecord => Boolean(booking))
        : [],
      version: adminSavedBookingReadVersion,
    },
    ok: true,
  };
}
