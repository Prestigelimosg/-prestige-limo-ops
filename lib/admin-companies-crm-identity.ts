import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type {
  AdminBookingPersistenceSafeErrorCategory,
  AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminCompaniesCrmIdentityVersion =
  "admin-companies-crm-identity-api-v1";

export type AdminCompanyCrmIdentityRecord = {
  accounts_email: string | null;
  billing_address: string | null;
  billing_email: string | null;
  company_name: string | null;
  domain: string | null;
  id: number;
  main_phone: string | null;
  mobile_phone: string | null;
  operations_email: string | null;
  primary_contact_name: string | null;
  website: string | null;
};

export type AdminCompanyCrmIdentityReadiness = {
  external_send: false;
  readOnly: true;
  setupSafe: true;
  source: "typed_companies_crm_identity";
  writeEnabled: false;
};

type UnknownRecord = Record<string, unknown>;
type CompaniesCrmIdentityClient = Pick<SupabaseClient, "from">;

const companyIdentitySelect =
  "id, company_name, domain, billing_address, main_phone, mobile_phone, website, primary_contact_name, billing_email, accounts_email, operations_email";
const safeBlockedError =
  "Admin companies CRM identity read requires a verified internal boundary.";
const safeConfigError =
  "Admin companies CRM identity read is not configured on this server.";
const safeReadError = "Admin companies CRM identity read failed safely.";
const allowedRoles = new Set(["admin", "dispatcher", "system"]);
const allowedParams = new Set(["domain", "company_name", "id"]);
const maxCompanyNameLength = 220;
const maxDomainLength = 160;
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

function positiveInteger(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeCompanyName(value: unknown) {
  return safeText(value, maxCompanyNameLength);
}

function safeDomain(value: unknown) {
  const cleaned = safeText(value, maxDomainLength)?.toLowerCase() || null;

  if (
    !cleaned ||
    cleaned.includes("..") ||
    cleaned.startsWith(".") ||
    cleaned.endsWith(".") ||
    !/^[a-z0-9][a-z0-9.-]*[a-z0-9]$/.test(cleaned)
  ) {
    return null;
  }

  return cleaned;
}

function safeCustomerProfileText(value: unknown, maxLength: number) {
  const cleaned = textOrNull(value);

  if (!cleaned || cleaned.length > maxLength) {
    return null;
  }

  const normalized = normalizeToken(cleaned);
  const sensitiveFragments = forbiddenIdentityFragments.filter((fragment) => fragment !== "billing");

  return sensitiveFragments.some((fragment) => normalized.includes(fragment)) ? null : cleaned;
}

function safeCustomerProfileEmail(value: unknown) {
  const cleaned = safeCustomerProfileText(value, 240)?.toLowerCase() || null;

  return cleaned && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
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

function getAdminCompaniesCrmIdentityClient(): AdminBookingResult<CompaniesCrmIdentityClient> {
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
    !safeText(actor.actor_label, 160)
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

function toAdminCompanyCrmIdentityRecord(value: unknown): AdminCompanyCrmIdentityRecord | null {
  const record = asRecord(value);
  const id = positiveInteger(record.id);

  if (!id) {
    return null;
  }

  return {
    accounts_email: safeCustomerProfileEmail(record.accounts_email),
    billing_address: safeCustomerProfileText(record.billing_address, 500),
    billing_email: safeCustomerProfileEmail(record.billing_email),
    company_name: safeCompanyName(record.company_name),
    domain: safeDomain(record.domain),
    id,
    main_phone: safeText(record.main_phone, 80),
    mobile_phone: safeText(record.mobile_phone, 80),
    operations_email: safeCustomerProfileEmail(record.operations_email),
    primary_contact_name: safeText(record.primary_contact_name, 160),
    website: safeDomain(record.website),
  };
}

function readParamKeys(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? [...params.keys()] : Object.keys(params);
}

function readParamsObject(params: URLSearchParams | UnknownRecord) {
  return params instanceof URLSearchParams ? Object.fromEntries(params.entries()) : params;
}

export function adminCompaniesCrmIdentityReadiness(): AdminCompanyCrmIdentityReadiness {
  return {
    external_send: false,
    readOnly: true,
    setupSafe: true,
    source: "typed_companies_crm_identity",
    writeEnabled: false,
  };
}

export async function findAdminCompanyCrmIdentity(
  input: URLSearchParams | UnknownRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminCompanyCrmIdentityRecord | null>> {
  const unsupportedParam = readParamKeys(input).find((key) => !allowedParams.has(key));

  if (unsupportedParam) {
    return {
      error: "Admin companies CRM identity parameters include unsupported or unsafe fields.",
      ok: false,
      status: 400,
    };
  }

  const actorResult = validateActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const clientResult = getAdminCompaniesCrmIdentityClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const params = readParamsObject(input);
  const id = positiveInteger(params.id);
  const companyName = safeCompanyName(params.company_name);
  const domain = safeDomain(params.domain);

  if (!id && !companyName && !domain) {
    return {
      error: "Admin companies CRM identity lookup requires a safe id, company_name, or domain.",
      ok: false,
      status: 400,
    };
  }

  let query = clientResult.data.from("companies").select(companyIdentitySelect);

  if (id) {
    query = query.eq("id", id);
  }

  if (companyName) {
    query = query.ilike("company_name", companyName);
  }

  if (domain) {
    query = query.eq("domain", domain);
  }

  const { data, error } = await query.limit(1).maybeSingle();

  if (error) {
    return safeAdapterFailure(safeReadError, 500, error);
  }

  return {
    data: toAdminCompanyCrmIdentityRecord(data),
    ok: true,
  };
}
