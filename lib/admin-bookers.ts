import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminBookersVersion = "admin-bookers-api-v1";

export type AdminBookerRecord = {
  booker_name: string | null;
  company_id: number;
  email: string | null;
  id: number;
  phone: string | null;
};

type UnknownRecord = Record<string, unknown>;
type AdminBookersClient = Pick<SupabaseClient, "from">;

const adminBookerSelect = "id, company_id, booker_name, email, phone";
const safeBlockedError = "Admin booker records require a verified internal boundary.";
const safeConfigError = "Admin booker records are not configured on this server.";
const safeReadError = "Admin booker lookup failed safely.";
const safeWriteError = "Admin booker save failed safely.";
const allowedRoles = new Set(["admin", "dispatcher", "system"]);
const maxNameLength = 220;
const maxContactLength = 160;
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenBookerFragments = [
  "admin_finance",
  "admin_note",
  "billing",
  "customer_price",
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

  const trimmed = String(value).replace(/\s+/g, " ").trim();

  return trimmed || null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenBookerFragments.some((fragment) => normalized.includes(fragment));
}

function safeText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength || includesForbiddenFragment(cleaned)) {
    return null;
  }

  return cleaned;
}

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeName(value: unknown) {
  return safeText(value, maxNameLength);
}

function safeContact(value: unknown) {
  return safeText(value, maxContactLength);
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

  if (code === "42p01" || haystack.includes("relation") && haystack.includes("does not exist")) {
    return "table_unreachable";
  }

  if (code === "42703" || code === "pgrst204" || haystack.includes("column") && haystack.includes("not found")) {
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

function getAdminBookersClient(): AdminBookingResult<AdminBookersClient> {
  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (
    !supabaseUrl ||
    !serviceRoleKey ||
    !validServerDatabaseUrl(supabaseUrl) ||
    !validServerCredential(serviceRoleKey)
  ) {
    return {
      error: safeConfigError,
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
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }
}

function validateActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedRoles.has(actor.actor_role) ||
    actor.source_surface !== "admin_api" ||
    !textOrNull(actor.actor_label)
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

function toAdminBookerRecord(value: unknown): AdminBookerRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);
  const companyId = positiveInteger(record.company_id);

  if (!id || !companyId) {
    return null;
  }

  return {
    booker_name: safeName(record.booker_name),
    company_id: companyId,
    email: safeContact(record.email),
    id,
    phone: safeContact(record.phone),
  };
}

export async function findAdminBooker(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookerRecord | null>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminBookersClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const params = input instanceof URLSearchParams ? Object.fromEntries(input.entries()) : input;
  const id = positiveInteger(params.id);
  const companyId = positiveInteger(params.company_id);
  const phone = safeContact(params.phone);
  const email = safeContact(params.email);
  const bookerName = safeName(params.booker_name);

  if (!id && !companyId && !phone && !email && !bookerName) {
    return {
      error: "Admin booker lookup requires a safe id, company_id, phone, email, or booker_name.",
      ok: false,
      status: 400,
    };
  }

  let query = clientResult.data.from("bookers").select(adminBookerSelect);

  if (id) {
    query = query.eq("id", id);
  }

  if (companyId) {
    query = query.eq("company_id", companyId);
  }

  if (phone) {
    query = query.eq("phone", phone);
  }

  if (email) {
    query = query.eq("email", email);
  }

  if (bookerName) {
    query = query.ilike("booker_name", bookerName);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return safeAdapterFailure(safeReadError, 500, error);
  }

  return {
    data: toAdminBookerRecord(data),
    ok: true,
  };
}

export async function createAdminBooker(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookerRecord>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminBookersClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const companyId = positiveInteger(input.company_id);
  const bookerName = safeName(input.booker_name);
  const email = safeContact(input.email);
  const phone = safeContact(input.phone);

  if (!companyId || !bookerName) {
    return {
      error: "Admin booker create requires safe company_id and booker_name.",
      ok: false,
      status: 400,
    };
  }

  const { data, error } = await clientResult.data
    .from("bookers")
    .insert({
      booker_name: bookerName,
      company_id: companyId,
      email,
      phone,
    })
    .select(adminBookerSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeWriteError, 500, error);
  }

  const record = toAdminBookerRecord(data);

  if (!record) {
    return {
      error: safeWriteError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: record,
    ok: true,
  };
}

export async function updateAdminBooker(
  input: UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookerRecord>> {
  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminBookersClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const id = positiveInteger(input.id);
  const payload = {
    booker_name: safeName(input.booker_name),
    email: safeContact(input.email),
    phone: safeContact(input.phone),
  };

  if (!id || (!payload.booker_name && !payload.email && !payload.phone)) {
    return {
      error: "Admin booker update requires a safe id and at least one safe field.",
      ok: false,
      status: 400,
    };
  }

  const { data, error } = await clientResult.data
    .from("bookers")
    .update(payload)
    .eq("id", id)
    .select(adminBookerSelect)
    .single();

  if (error) {
    return safeAdapterFailure(safeWriteError, 500, error);
  }

  const record = toAdminBookerRecord(data);

  if (!record) {
    return {
      error: safeWriteError,
      ok: false,
      status: 500,
    };
  }

  return {
    data: record,
    ok: true,
  };
}
