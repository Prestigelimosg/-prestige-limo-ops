import "server-only";

import { createHash } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingResult } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import { safeCustomerPortalAccessAccountReference } from "./customer-portal-access-link";

export const customerPortalAccessAccountVersion = "customer-portal-access-account-v1";

type CustomerPortalAccessAccountClient = Pick<SupabaseClient, "from">;

type CustomerPortalAccessAccountStatus = "active" | "pending_setup" | "revoked" | "suspended";

export type CustomerPortalAccessAccountRecord = {
  account_status: CustomerPortalAccessAccountStatus;
  company_id: number | null;
  booker_id: number | null;
  customer_account_reference: string;
  link_revision: string;
  safe_display_label: string | null;
  version: typeof customerPortalAccessAccountVersion;
};

const customerPortalAccessAccountTable = "customer_access_accounts";
const customerPortalAccessAccountSelect =
  "customer_account_reference, account_status, safe_display_label, company_id, booker_id, updated_at";
const safeConfigError = "Customer portal access account configuration is not ready.";
const safeForbiddenError = "Customer portal access requires an active invited customer account.";
const safeMutationError = "Customer portal access account update failed safely.";
const safeValidationError = "Customer portal access account request is invalid.";
const allowedActorRoles = new Set(["admin", "dispatcher", "local-dev-admin"]);
const allowedActorSurfaces = new Set(["admin_api"]);
const placeholderConfigPattern =
  /^(?:todo|tbd|n\/a|none|null|undefined|placeholder|change[-_\s]?me|changeme|replace[-_\s]?me|your[-_\s]?.*|example)$/i;
const forbiddenSafeTextFragments = [
  "admin_finance",
  "admin_note",
  "auth_link",
  "billing",
  "customer_price",
  "debug",
  "driver_payout",
  "finance",
  "internal_admin_note",
  "internal_finance_note",
  "invoice",
  "jwt",
  "live_location",
  "mock_archive",
  "mock_qa",
  "parser_debug",
  "payment",
  "pay_now",
  "paynow",
  "payout",
  "pdf",
  "raw_token",
  "secret",
  "server_secret",
  "service_role",
  "session_token",
  "token_hash",
];

function textOrNull(value: unknown, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function normalizeToken(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1_$2").replace(/[^a-z0-9]+/gi, "_").toLowerCase();
}

function includesForbiddenFragment(value: string) {
  const normalized = normalizeToken(value);

  return forbiddenSafeTextFragments.some((fragment) => normalized.includes(fragment));
}

function configValueOrNull(value: string | undefined) {
  const trimmed = value?.trim();
  const normalized = trimmed?.toLowerCase() || "";

  return trimmed && !placeholderConfigPattern.test(normalized) ? trimmed : null;
}

function validServerCredential(value: string | null) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();

  return (
    value.trim().length >= 32 &&
    normalized !== "anon" &&
    normalized !== "public" &&
    !normalized.includes("anon_key") &&
    !normalized.includes("public_key") &&
    !normalized.includes("next_public")
  );
}

function validServerDatabaseUrl(value: string) {
  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function safeDisplayLabel(value: unknown, fallback: string) {
  const cleaned = textOrNull(value, 160) || fallback;

  return includesForbiddenFragment(cleaned) ? fallback : cleaned;
}

function verifiedIdentityId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeLinkRevision(value: unknown) {
  const cleaned = textOrNull(value, 80);
  const timestamp = cleaned ? Date.parse(cleaned) : Number.NaN;

  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

function safeActor(actor: AdminBookingPersistenceAdapterActor): AdminBookingResult<null> {
  if (
    !actor ||
    !allowedActorRoles.has(actor.actor_role) ||
    !allowedActorSurfaces.has(actor.source_surface) ||
    !textOrNull(actor.actor_label)
  ) {
    return {
      error: "Customer portal access accounts are available only from the internal admin dashboard.",
      ok: false,
      status: 403,
    };
  }

  return {
    data: null,
    ok: true,
  };
}

function serverClient(): AdminBookingResult<CustomerPortalAccessAccountClient> {
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
      error: safeConfigError,
      ok: false,
      status: 503,
    };
  }
}

function deterministicPortalAuthUserId(customerAccountReference: string) {
  const hex = createHash("sha256")
    .update(`prestige-customer-portal-access:${customerAccountReference}`)
    .digest("hex");
  const variant = (8 + (Number.parseInt(hex[16] || "0", 16) % 4)).toString(16);

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    `${variant}${hex.slice(17, 20)}`,
    hex.slice(20, 32),
  ].join("-");
}

function toRecord(row: Record<string, unknown>): CustomerPortalAccessAccountRecord | null {
  const customerAccountReference = safeCustomerPortalAccessAccountReference(
    row.customer_account_reference,
  );
  const accountStatus = textOrNull(row.account_status, 40);
  const linkRevision = safeLinkRevision(row.updated_at) || new Date(0).toISOString();

  if (
    !customerAccountReference ||
    !["active", "pending_setup", "revoked", "suspended"].includes(accountStatus || "")
  ) {
    return null;
  }

  return {
    account_status: accountStatus as CustomerPortalAccessAccountStatus,
    company_id: verifiedIdentityId(row.company_id),
    booker_id: verifiedIdentityId(row.booker_id),
    customer_account_reference: customerAccountReference,
    link_revision: linkRevision,
    safe_display_label: textOrNull(row.safe_display_label, 160),
    version: customerPortalAccessAccountVersion,
  };
}

function safeFailure<T>(error: string, status: number): AdminBookingResult<T> {
  return {
    error,
    ok: false,
    status,
  };
}

export async function assertActiveCustomerPortalAccessAccount(
  customerAccountReferenceInput: unknown,
  clientInput?: CustomerPortalAccessAccountClient,
  expectedLink?: {
    issuedAt?: number | null;
    linkRevision?: string | null;
  },
): Promise<AdminBookingResult<CustomerPortalAccessAccountRecord>> {
  const customerAccountReference = safeCustomerPortalAccessAccountReference(
    customerAccountReferenceInput,
  );

  if (!customerAccountReference) {
    return safeFailure(safeForbiddenError, 403);
  }

  const clientResult = clientInput
    ? ({ data: clientInput, ok: true } as const)
    : serverClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from(customerPortalAccessAccountTable)
    .select(customerPortalAccessAccountSelect)
    .eq("customer_account_reference", customerAccountReference)
    .eq("account_status", "active")
    .limit(1);

  if (error) {
    return safeFailure(safeForbiddenError, 403);
  }

  const row = Array.isArray(data) ? data[0] : null;
  const record =
    row && typeof row === "object" && !Array.isArray(row)
      ? toRecord(row as Record<string, unknown>)
      : null;

  const expectedRevision = safeLinkRevision(expectedLink?.linkRevision);
  const expectedIssuedAt = Number(expectedLink?.issuedAt);
  const legacyRevisionStillCurrent =
    !expectedRevision &&
    Number.isInteger(expectedIssuedAt) &&
    Math.floor(Date.parse(record?.link_revision || "") / 1000) <= expectedIssuedAt;
  const linkStillCurrent =
    !expectedLink ||
    (expectedRevision
      ? record?.link_revision === expectedRevision
      : legacyRevisionStillCurrent);

  return record?.account_status === "active" && linkStillCurrent
    ? {
        data: record,
        ok: true,
      }
    : safeFailure(safeForbiddenError, 403);
}

export async function ensureAdminCustomerPortalAccessAccount(
  input: {
    bookerId: unknown;
    companyId: unknown;
    customerAccountReference: unknown;
    safeDisplayLabel?: unknown;
  },
  actor: AdminBookingPersistenceAdapterActor,
  clientInput?: CustomerPortalAccessAccountClient,
): Promise<AdminBookingResult<CustomerPortalAccessAccountRecord>> {
  const actorResult = safeActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const customerAccountReference = safeCustomerPortalAccessAccountReference(
    input.customerAccountReference,
  );
  const companyId = verifiedIdentityId(input.companyId);
  const bookerId = verifiedIdentityId(input.bookerId);

  if (!customerAccountReference || !companyId || !bookerId) {
    return safeFailure(safeValidationError, 400);
  }

  const clientResult = clientInput
    ? ({ data: clientInput, ok: true } as const)
    : serverClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data: referenceRows, error: referenceError } = await clientResult.data
    .from(customerPortalAccessAccountTable)
    .select(customerPortalAccessAccountSelect)
    .eq("customer_account_reference", customerAccountReference)
    .limit(1);

  if (referenceError) {
    return safeFailure(safeMutationError, 500);
  }

  const referenceRecord = toRecord(
    Array.isArray(referenceRows) && referenceRows[0] && typeof referenceRows[0] === "object"
      ? (referenceRows[0] as Record<string, unknown>)
      : {},
  );

  if (
    referenceRecord &&
    ((referenceRecord.company_id && referenceRecord.company_id !== companyId) ||
      (referenceRecord.booker_id && referenceRecord.booker_id !== bookerId))
  ) {
    return safeFailure(safeValidationError, 409);
  }

  let resolvedAccountReference = referenceRecord?.customer_account_reference || null;

  if (!resolvedAccountReference) {
    const { data: bookerRows, error: bookerError } = await clientResult.data
      .from(customerPortalAccessAccountTable)
      .select(customerPortalAccessAccountSelect)
      .eq("booker_id", bookerId)
      .limit(1);

    if (bookerError) {
      return safeFailure(safeMutationError, 500);
    }

    const bookerRecord = toRecord(
      Array.isArray(bookerRows) && bookerRows[0] && typeof bookerRows[0] === "object"
        ? (bookerRows[0] as Record<string, unknown>)
        : {},
    );

    if (bookerRecord?.company_id && bookerRecord.company_id !== companyId) {
      return safeFailure(safeValidationError, 409);
    }

    resolvedAccountReference = bookerRecord?.customer_account_reference || customerAccountReference;
  }

  const now = new Date(Math.ceil((Date.now() + 1) / 1000) * 1000).toISOString();
  const payload = {
    account_status: "active",
    auth_provider: "supabase_auth",
    auth_user_id: deterministicPortalAuthUserId(resolvedAccountReference),
    booker_id: bookerId,
    company_id: companyId,
    customer_account_reference: resolvedAccountReference,
    safe_display_label: safeDisplayLabel(input.safeDisplayLabel, resolvedAccountReference),
    source_surface: "admin_api",
    updated_at: now,
  };

  const { data, error } = await clientResult.data
    .from(customerPortalAccessAccountTable)
    .upsert(payload, {
      onConflict: "customer_account_reference",
    })
    .select(customerPortalAccessAccountSelect)
    .maybeSingle();

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return safeFailure(safeMutationError, 500);
  }

  const record = toRecord(data as Record<string, unknown>);

  return record?.account_status === "active"
    ? {
        data: record,
        ok: true,
      }
    : safeFailure(safeMutationError, 500);
}

export async function revokeAdminCustomerPortalAccessAccount(
  input: {
    customerAccountReference: unknown;
  },
  actor: AdminBookingPersistenceAdapterActor,
  clientInput?: CustomerPortalAccessAccountClient,
): Promise<AdminBookingResult<CustomerPortalAccessAccountRecord>> {
  const actorResult = safeActor(actor);

  if (!actorResult.ok) {
    return actorResult;
  }

  const customerAccountReference = safeCustomerPortalAccessAccountReference(
    input.customerAccountReference,
  );

  if (!customerAccountReference) {
    return safeFailure(safeValidationError, 400);
  }

  const clientResult = clientInput
    ? ({ data: clientInput, ok: true } as const)
    : serverClient();

  if (!clientResult.ok) {
    return clientResult;
  }

  const { data, error } = await clientResult.data
    .from(customerPortalAccessAccountTable)
    .update({
      account_status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("customer_account_reference", customerAccountReference)
    .select(customerPortalAccessAccountSelect)
    .maybeSingle();

  if (error || !data || typeof data !== "object" || Array.isArray(data)) {
    return safeFailure(safeMutationError, 500);
  }

  const record = toRecord(data as Record<string, unknown>);

  return record?.account_status === "revoked"
    ? {
        data: record,
        ok: true,
      }
    : safeFailure(safeMutationError, 500);
}
