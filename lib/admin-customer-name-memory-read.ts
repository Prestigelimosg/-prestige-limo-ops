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

export const adminCustomerNameMemoryReadVersion =
  "stage-admin-customer-name-memory-read-api-v1";

export type AdminCustomerNameMemoryReadParams = {
  traveler_name: string;
};

export type AdminCustomerNameMemoryRecord = {
  company: string | null;
  company_id: number | null;
  preferred_vehicle: string | null;
  saved_address: string | null;
  traveler_id: number | null;
};

export type AdminCustomerNameMemoryReadResult = {
  name_memory: AdminCustomerNameMemoryRecord | null;
  version: typeof adminCustomerNameMemoryReadVersion;
};

type UnknownRecord = Record<string, unknown>;
type NameMemoryClient = Pick<SupabaseClient, "from">;

const maxTravelerNameLength = 160;
const maxSafeTextLength = 500;
const travelerSelect =
  "id, company_id, traveler_name, preferred_vehicle, default_address";
const companySelect = "id, company_name";
const savedAddressSelect =
  "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at";
const disabledNameMemoryReadError =
  "Admin customer name memory read is not enabled on this server.";
const safeNameMemoryConfigError =
  "Admin customer name memory read configuration is not ready.";
const safeNameMemoryActorError =
  "Admin customer name memory read requires a verified internal boundary.";
const safeNameMemoryServerSessionActorError =
  "Admin customer name memory read requires a verified admin or dispatcher server session.";
const safeNameMemoryReadError = "Admin customer name memory read failed safely.";
const allowedAdapterActorRoles = new Set(["admin", "dispatcher", "system"]);
const allowedQueryParams = new Set(["traveler_name"]);
const forbiddenNameMemoryFragments = [
  "admin_finance",
  "admin_note",
  "amount_due",
  "auth_link",
  "billing",
  "contact_email",
  "contact_phone",
  "customer_auth",
  "customer_charge",
  "customer_price",
  "debug",
  "driver_auth",
  "driver_payout",
  "fare_amount",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "internal_note",
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
  "quoted_price",
  "rate_amount",
  "raw_ai_prompt",
  "raw_parser_prompt",
  "secret",
  "server_secret",
  "service_role",
  "stripe",
  "telegram",
  "token",
  "whatsapp",
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

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenNameMemoryFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenNameMemoryFragments.some((fragment) => normalized.includes(fragment));
}

function safeTextFromDb(value: unknown, maxLength = maxSafeTextLength) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenNameMemoryFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function positiveIntegerOrNull(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function readParamsValue(params: URLSearchParams | UnknownRecord, key: string) {
  return params instanceof URLSearchParams ? params.get(key) : params[key];
}

function paramEntries(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams
    ? [...params.entries()]
    : Object.entries(params).map(([key, value]) => [key, value] as const);
}

function validTravelerName(value: unknown) {
  const cleaned = textOrNull(value);

  return cleaned &&
    cleaned.length <= maxTravelerNameLength &&
    !includesForbiddenNameMemoryFragment(cleaned)
    ? cleaned
    : null;
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

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed ? trimmed : null;
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedAdapterActorRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      error: safeNameMemoryActorError,
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
      error: safeNameMemoryServerSessionActorError,
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function getNameMemoryClient(
  actor: AdminBookingPersistenceAdapterActor,
): AdminBookingResult<NameMemoryClient> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true") {
    return {
      error: disabledNameMemoryReadError,
      ok: false,
      status: 503,
    };
  }

  const stagingReadiness = checkAdminBookingPersistenceStagingConfigReadiness();

  if (!stagingReadiness.ok) {
    return {
      error: safeNameMemoryConfigError,
      ok: false,
      status: stagingReadiness.status,
    };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!supabaseUrl || !serviceRoleKey) {
    return {
      error: safeNameMemoryConfigError,
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
      error: safeNameMemoryConfigError,
      ok: false,
      status: 503,
    };
  }
}

export function parseAdminCustomerNameMemoryReadParams(
  params: URLSearchParams | UnknownRecord,
): AdminBookingResult<AdminCustomerNameMemoryReadParams> {
  const unsafeParams = paramEntries(params).filter(
    ([key, value]) =>
      !allowedQueryParams.has(key) ||
      includesForbiddenNameMemoryFragment(key) ||
      includesForbiddenNameMemoryFragment(String(value ?? "")),
  );

  if (unsafeParams.length > 0) {
    return {
      error: "Admin customer name memory read includes fields outside the approved read scope.",
      ok: false,
      status: 400,
    };
  }

  const travelerName = validTravelerName(readParamsValue(params, "traveler_name"));

  if (!travelerName) {
    return {
      error: "Missing or malformed customer name memory traveler_name.",
      ok: false,
      status: 400,
    };
  }

  return {
    data: {
      traveler_name: travelerName,
    },
    ok: true,
  };
}

function toNameMemoryRecord(
  traveler: UnknownRecord,
  company: UnknownRecord | null,
  savedAddress: UnknownRecord | null,
): AdminCustomerNameMemoryRecord | null {
  const travelerId = positiveIntegerOrNull(traveler.id);

  if (!travelerId) {
    return null;
  }

  return {
    company: safeTextFromDb(company?.company_name),
    company_id: positiveIntegerOrNull(traveler.company_id),
    preferred_vehicle: safeTextFromDb(traveler.preferred_vehicle, 80),
    saved_address:
      safeTextFromDb(savedAddress?.address) || safeTextFromDb(traveler.default_address),
    traveler_id: travelerId,
  };
}

export async function loadAdminCustomerNameMemory(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCustomerNameMemoryReadResult>> {
  const params = parseAdminCustomerNameMemoryReadParams(input);

  if (!params.ok) {
    return params;
  }

  const clientResult = getNameMemoryClient(actor);

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data: travelerData, error: travelerError } = await clientResult.data
    .from("travelers")
    .select(travelerSelect)
    .ilike("traveler_name", params.data.traveler_name)
    .limit(1)
    .maybeSingle();

  if (travelerError) {
    return safeAdapterFailure(safeNameMemoryReadError, 500, travelerError);
  }

  const traveler = asRecord(travelerData);
  const travelerId = positiveIntegerOrNull(traveler.id);

  if (!travelerId) {
    return {
      data: {
        name_memory: null,
        version: adminCustomerNameMemoryReadVersion,
      },
      ok: true,
    };
  }

  const companyId = positiveIntegerOrNull(traveler.company_id);
  const [companyResult, savedAddressResult] = await Promise.all([
    companyId
      ? clientResult.data
          .from("companies")
          .select(companySelect)
          .eq("id", companyId)
          .limit(1)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    clientResult.data
      .from("saved_addresses")
      .select(savedAddressSelect)
      .eq("traveler_id", travelerId)
      .order("is_default", { ascending: false })
      .order("use_count", { ascending: false })
      .order("last_used_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (companyResult.error || savedAddressResult.error) {
    return safeAdapterFailure(
      safeNameMemoryReadError,
      500,
      companyResult.error || savedAddressResult.error,
    );
  }

  return {
    data: {
      name_memory: toNameMemoryRecord(
        traveler,
        companyResult.data ? asRecord(companyResult.data) : null,
        savedAddressResult.data ? asRecord(savedAddressResult.data) : null,
      ),
      version: adminCustomerNameMemoryReadVersion,
    },
    ok: true,
  };
}
