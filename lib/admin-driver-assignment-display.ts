import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminDriverAssignmentDisplayVersion =
  "admin-driver-assignment-display-api-v1";

export type AdminDriverAssignmentDisplayRecord = {
  availability_status: string | null;
  contact_number: string | null;
  driver_name: string | null;
  id: number;
  plate_number: string | null;
  vehicle_type: string | null;
};

export type AdminDriverAssignmentDisplayReadiness = {
  external_send: false;
  fullProfileWritePathParked: true;
  readOnly: true;
  setupSafe: true;
  source: "typed_driver_assignment_display";
  writeEnabled: false;
};

type UnknownRecord = Record<string, unknown>;
type DriverAssignmentDisplayClient = Pick<SupabaseClient, "from">;

const driverAssignmentDisplaySelect =
  "id, driver_name, contact_number, vehicle_type, plate_number, availability_status";
const safeBlockedError =
  "Admin driver assignment display read requires a verified internal boundary.";
const safeConfigError =
  "Admin driver assignment display read is not configured on this server.";
const safeReadError = "Admin driver assignment display read failed safely.";
const allowedRoles = new Set(["admin", "dispatcher", "system"]);
const allowedParams = new Set([
  "availability_status",
  "contact_number",
  "driver_name",
  "id",
  "limit",
  "offset",
  "plate_number",
]);
const maxNameLength = 220;
const maxContactLength = 120;
const maxVehicleLength = 120;
const maxStatusLength = 80;
const defaultLimit = 100;
const maxLimit = 200;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenDisplayFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "commission",
  "customer_price",
  "customer_rate",
  "customer_rates",
  "debug",
  "driver_payout",
  "driver_payout_rules",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "invoice",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "parser_learning",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "pricing",
  "raw_ai",
  "secret",
  "server_secret",
  "service_role",
  "token",
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

function includesForbiddenDisplayFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenDisplayFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenDisplayFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeLimit(value: unknown) {
  const parsed = Number(value);

  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return defaultLimit;
  }

  return Math.min(parsed, maxLimit);
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

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
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

function classifyAdapterDatabaseFailure(error: unknown): AdminBookingPersistenceSafeErrorCategory {
  const record = asRecord(error);
  const haystack = Object.values(record)
    .filter((value) => typeof value === "string" || typeof value === "number")
    .map((value) => String(value).toLowerCase())
    .join(" ");
  const code = textOrNull(record.code)?.toLowerCase() || "";
  const statusValue = Number(record.status);
  const status = Number.isFinite(statusValue) ? statusValue : null;

  if (status === 401 || code === "401" || haystack.includes("invalid jwt")) {
    return "auth_or_key_rejected";
  }

  if (
    status === 403 ||
    code === "42501" ||
    haystack.includes("permission denied") ||
    haystack.includes("row level security") ||
    haystack.includes("rls")
  ) {
    return "permission_or_rls_denied";
  }

  if (code === "42p01" || (haystack.includes("relation") && haystack.includes("does not exist"))) {
    return "table_unreachable";
  }

  if (code === "42703" || code === "pgrst204" || (haystack.includes("column") && haystack.includes("not found"))) {
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

function getAdminDriverAssignmentDisplayClient(): AdminBookingResult<DriverAssignmentDisplayClient> {
  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!validServerDatabaseUrl(supabaseUrl) || !validServerCredential(serviceRoleKey)) {
    return {
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }

  return {
    data: createClient(supabaseUrl as string, serviceRoleKey as string, {
      auth: {
        persistSession: false,
      },
    }),
    ok: true,
  };
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !safeText(actor.actor_label, maxContactLength)
  ) {
    return {
      error: safeBlockedError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function toAdminDriverAssignmentDisplayRecord(
  value: unknown,
): AdminDriverAssignmentDisplayRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    availability_status: safeText(record.availability_status, maxStatusLength),
    contact_number: safeText(record.contact_number, maxContactLength),
    driver_name: safeText(record.driver_name, maxNameLength),
    id,
    plate_number: safeText(record.plate_number, maxContactLength),
    vehicle_type: safeText(record.vehicle_type, maxVehicleLength),
  };
}

function readParamKeys(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
}

function readParamsObject(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
}

export function adminDriverAssignmentDisplayReadiness(): AdminDriverAssignmentDisplayReadiness {
  return {
    external_send: false,
    fullProfileWritePathParked: true,
    readOnly: true,
    setupSafe: true,
    source: "typed_driver_assignment_display",
    writeEnabled: false,
  };
}

export async function listAdminDriverAssignmentDisplay(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminDriverAssignmentDisplayRecord[]>> {
  const unsupportedParam = readParamKeys(input).find((key) => !allowedParams.has(key));

  if (unsupportedParam) {
    return {
      error: "Admin driver assignment display parameters include unsupported or unsafe fields.",
      ok: false,
      status: 400,
    };
  }

  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminDriverAssignmentDisplayClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const params = readParamsObject(input);
  const id = positiveInteger(params.id);
  const driverName = safeText(params.driver_name, maxNameLength);
  const contactNumber = safeText(params.contact_number, maxContactLength);
  const plateNumber = safeText(params.plate_number, maxContactLength);
  const availabilityStatus = safeText(params.availability_status, maxStatusLength);
  const limit = id ? 1 : safeLimit(params.limit);
  const offset = params.offset === undefined ? 0 : Number(params.offset);
  if (!Number.isSafeInteger(offset) || offset < 0 ||
      !Number.isSafeInteger(offset + limit - 1) || (id && offset !== 0)) {
    return { error: "Admin driver assignment display offset is invalid.", ok: false, status: 400 };
  }

  let query = clientResult.data
    .from("drivers")
    .select(driverAssignmentDisplaySelect)
    .order("driver_name", { ascending: true })
    .order("id", { ascending: true });

  if (id) {
    query = query.eq("id", id);
  }

  if (driverName) {
    query = query.ilike("driver_name", driverName);
  }

  if (contactNumber) {
    query = query.eq("contact_number", contactNumber);
  }

  if (plateNumber) {
    query = query.eq("plate_number", plateNumber);
  }

  if (availabilityStatus) {
    query = query.eq("availability_status", availabilityStatus);
  }

  const { data, error } = await (id ? query.limit(1) : query.range(offset, offset + limit - 1));

  if (error) {
    return safeAdapterFailure(safeReadError, 500, error);
  }

  return {
    data: (Array.isArray(data) ? data : [])
      .map((row) => toAdminDriverAssignmentDisplayRecord(row))
      .filter((row): row is AdminDriverAssignmentDisplayRecord => row !== null),
    ok: true,
  };
}

// Optional dropdown ordering only. Never participates in assignment or Pool eligibility.
export async function readFrequentAssignmentDrivers(
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<{ driver_id: number; job_count: number }[]>> {
  const actorResult = validateActor(actor);
  if (!actorResult.ok) return actorResult;
  const clientResult = getAdminDriverAssignmentDisplayClient();
  if (!clientResult.ok) return clientResult;
  const client = clientResult.data;
  const now = Date.now();
  const cutoff = now - 90 * 86400000;
  const since = new Date(cutoff).toISOString();
  const signal = AbortSignal.timeout(8000);
  const failure = { ok: false as const, status: 503, error: "Frequent drivers are unavailable. Driver search is still available." };
  try {
    const evidence: { reference: string; driverId: number }[] = [];
    for (const table of ["driver_job_links", "driver_job_bids"] as const) {
      const seen = new Set<string>();
      for (let offset = 0; ; offset += 500) {
        // A bounded read must fail visibly rather than rank a truncated history.
        if (offset >= 10000) return failure;
        let query = client.from(table).select(table === "driver_job_links"
          ? "id,booking_reference,driver_id,acknowledged_at:safe_link_context->>driver_acknowledged_at"
          : "id,booking_reference,driver_reference,decided_at").gte(table === "driver_job_links" ? "updated_at" : "decided_at", since);
        if (table === "driver_job_bids") query = query.eq("bid_status", "accepted");
        const { data, error } = await query.order("id", { ascending: true }).range(offset, offset + 499).abortSignal(signal);
        if (error || !Array.isArray(data) || data.length > 500) return failure;
        for (const value of data) {
          const row = asRecord(value);
          const id = textOrNull(row.id);
          if (!id || seen.has(id)) return failure;
          seen.add(id);
          const driverId = positiveInteger(table === "driver_job_links" ? row.driver_id : row.driver_reference);
          const reference = textOrNull(row.booking_reference);
          const time = Date.parse(String(table === "driver_job_links" ? row.acknowledged_at ?? "" : row.decided_at ?? ""));
          if (driverId && reference && Number.isFinite(time) && time >= cutoff && time <= now) {
            evidence.push({ reference, driverId });
          }
        }
        if (data.length < 500) break;
      }
    }
    const references = [...new Set(evidence.map((row) => row.reference))];
    const bookings = new Map<string, UnknownRecord>();
    const combos = new Map<string, string>();
    for (let offset = 0; offset < references.length; offset += 100) {
      const batch = references.slice(offset, offset + 100);
      const saved = await client.from("bookings").select("booking_reference,driver_id,status,admin_internal_status,customer_facing_status")
        .in("booking_reference", batch).range(0, batch.length).abortSignal(signal);
      const members = await client.from("driver_job_combo_members").select("booking_reference,combo_id")
        .in("booking_reference", batch).range(0, batch.length).abortSignal(signal);
      if (saved.error || members.error || !Array.isArray(saved.data) || !Array.isArray(members.data) ||
          saved.data.length > batch.length || members.data.length > batch.length) return failure;
      for (const value of saved.data) {
        const row = asRecord(value);
        const reference = textOrNull(row.booking_reference);
        if (!reference || !batch.includes(reference) || bookings.has(reference)) return failure;
        bookings.set(reference, row);
      }
      for (const value of members.data) {
        const row = asRecord(value);
        const reference = textOrNull(row.booking_reference);
        const comboId = textOrNull(row.combo_id);
        if (!reference || !comboId || !batch.includes(reference) || combos.has(reference)) return failure;
        combos.set(reference, comboId);
      }
    }
    const jobs = new Map<number, Set<string>>();
    for (const row of evidence) {
      const booking = bookings.get(row.reference);
      if (!booking || positiveInteger(booking.driver_id) !== row.driverId) continue;
      // Match the established booking reader's current-status / legacy fallback.
      const current = textOrNull(booking.admin_internal_status)?.toLowerCase();
      const status = current && current !== "draft" ? current : textOrNull(booking.status)?.toLowerCase() || current || textOrNull(booking.customer_facing_status)?.toLowerCase();
      if (["cancelled", "canceled", "declined_internal", "archived"].includes(status || "")) continue;
      const key = combos.has(row.reference) ? `combo:${combos.get(row.reference)}` : `booking:${row.reference}`;
      const taken = jobs.get(row.driverId) || new Set<string>();
      taken.add(key);
      jobs.set(row.driverId, taken);
    }
    return { ok: true, data: [...jobs].map(([driver_id, taken]) => ({ driver_id, job_count: taken.size }))
      .sort((a, b) => b.job_count - a.job_count || a.driver_id - b.driver_id) };
  } catch {
    return failure;
  }
}
