import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminTravelersCrmIdentityVersion =
  "admin-travelers-crm-identity-api-v1";

export type AdminTravelerCrmIdentitySavedAddress = {
  address: string | null;
  address_role: string | null;
  id: number;
  is_default: boolean;
  label: string | null;
};

export type AdminTravelerCrmIdentityRecord = {
  booker_contact: string | null;
  booker_email: string | null;
  booker_name: string | null;
  company_id: number | null;
  default_address: string | null;
  default_dropoff_address: string | null;
  default_pickup_address: string | null;
  id: number;
  preferred_vehicle: string | null;
  saved_address: AdminTravelerCrmIdentitySavedAddress | null;
  traveler_name: string | null;
};

export type AdminTravelerCrmIdentityReadiness = {
  external_send: false;
  readOnly: true;
  setupSafe: true;
  source: "typed_travelers_crm_identity";
  writeEnabled: false;
};

type UnknownRecord = Record<string, unknown>;
type TravelersCrmIdentityClient = Pick<SupabaseClient, "from">;

const travelerIdentitySelect =
  "id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email";
const savedAddressDisplaySelect =
  "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at";
const safeBlockedError =
  "Admin travelers CRM identity read requires a verified internal boundary.";
const safeConfigError =
  "Admin travelers CRM identity read is not configured on this server.";
const safeReadError = "Admin travelers CRM identity read failed safely.";
const allowedRoles = new Set(["admin", "dispatcher", "system"]);
const allowedParams = new Set(["id", "company_id", "traveler_name", "booker_contact", "booker_email"]);
const maxNameLength = 220;
const maxContactLength = 160;
const maxAddressLength = 500;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenIdentityFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "customer_price",
  "debug",
  "driver_payout",
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

function includesForbiddenIdentityFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenIdentityFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenIdentityFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeEmail(value: unknown) {
  const cleaned = safeText(value, maxContactLength)?.toLowerCase() || null;

  if (!cleaned || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned)) {
    return null;
  }

  return cleaned;
}

function safeContact(value: unknown) {
  return safeText(value, maxContactLength);
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function booleanValue(value: unknown) {
  return value === true;
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

function getAdminTravelersCrmIdentityClient(): AdminBookingResult<TravelersCrmIdentityClient> {
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

function toSavedAddress(value: unknown): AdminTravelerCrmIdentitySavedAddress | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    address: safeText(record.address, maxAddressLength),
    address_role: safeText(record.address_role, 80),
    id,
    is_default: booleanValue(record.is_default),
    label: safeText(record.label, 120),
  };
}

function toAdminTravelerCrmIdentityRecord(
  value: unknown,
  savedAddress: unknown,
): AdminTravelerCrmIdentityRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    booker_contact: safeContact(record.booker_contact),
    booker_email: safeEmail(record.booker_email),
    booker_name: safeText(record.booker_name, maxNameLength),
    company_id: positiveInteger(record.company_id),
    default_address: safeText(record.default_address, maxAddressLength),
    default_dropoff_address: safeText(record.default_dropoff_address, maxAddressLength),
    default_pickup_address: safeText(record.default_pickup_address, maxAddressLength),
    id,
    preferred_vehicle: safeText(record.preferred_vehicle, 80),
    saved_address: toSavedAddress(savedAddress),
    traveler_name: safeText(record.traveler_name, maxNameLength),
  };
}

function readParamKeys(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
}

function readParamsObject(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
}

export function adminTravelersCrmIdentityReadiness(): AdminTravelerCrmIdentityReadiness {
  return {
    external_send: false,
    readOnly: true,
    setupSafe: true,
    source: "typed_travelers_crm_identity",
    writeEnabled: false,
  };
}

export async function findAdminTravelerCrmIdentity(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminTravelerCrmIdentityRecord | null>> {
  const unsupportedParam = readParamKeys(input).find((key) => !allowedParams.has(key));

  if (unsupportedParam) {
    return {
      error: "Admin travelers CRM identity parameters include unsupported or unsafe fields.",
      ok: false,
      status: 400,
    };
  }

  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminTravelersCrmIdentityClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const params = readParamsObject(input);
  const id = positiveInteger(params.id);
  const companyId = positiveInteger(params.company_id);
  const travelerName = safeText(params.traveler_name, maxNameLength);
  const bookerContact = safeContact(params.booker_contact);
  const bookerEmail = safeEmail(params.booker_email);

  if (!id && !companyId && !travelerName && !bookerContact && !bookerEmail) {
    return {
      error: "Admin travelers CRM identity lookup requires a safe id, company_id, traveler_name, booker_contact, or booker_email.",
      ok: false,
      status: 400,
    };
  }

  let query = clientResult.data.from("travelers").select(travelerIdentitySelect);

  if (id) {
    query = query.eq("id", id);
  }

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (travelerName) {
    query = query.ilike("traveler_name", travelerName);
  }

  if (bookerContact) {
    query = query.eq("booker_contact", bookerContact);
  }

  if (bookerEmail) {
    query = query.eq("booker_email", bookerEmail);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return safeAdapterFailure(safeReadError, 500, error);
  }

  const traveler = asRecord(data);
  const travelerId = positiveInteger(traveler.id);

  if (!travelerId) {
    return {
      data: null,
      ok: true,
    };
  }

  const savedAddressResult = await clientResult.data
    .from("saved_addresses")
    .select(savedAddressDisplaySelect)
    .eq("traveler_id", travelerId)
    .order("is_default", { ascending: false })
    .order("use_count", { ascending: false })
    .order("last_used_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (savedAddressResult.error) {
    return safeAdapterFailure(safeReadError, 500, savedAddressResult.error);
  }

  return {
    data: toAdminTravelerCrmIdentityRecord(traveler, savedAddressResult.data),
    ok: true,
  };
}
