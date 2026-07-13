import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const adminCustomerAccountDeleteVersion = "admin-customer-account-delete-v1";

type CustomerAccountDeleteClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

export type AdminCustomerAccountDeletionInspection = {
  blockers: Array<"bookings" | "invoice_records" | "monthly_billing_drafts" | "monthly_invoice_drafts">;
  counts: {
    bookings: number;
    contacts: number;
    invoice_records: number;
    monthly_billing_drafts: number;
    monthly_invoice_drafts: number;
    portal_access_accounts: number;
  };
  customer: {
    account_status: string | null;
    display_name: string;
    id: number;
    status: string | null;
  };
  eligible: boolean;
  version: typeof adminCustomerAccountDeleteVersion;
};

type AdminCustomerAccountDeleteResult<T> =
  | { data: T; ok: true }
  | { error: string; ok: false; status: number };

const allowedActorRoles = new Set(["admin", "dispatcher"]);
const safeActorError = "Customer account deletion requires a verified admin or dispatcher session.";
const safeConfigError = "Customer account deletion configuration is not ready.";
const safeDeleteError = "Customer account deletion failed safely.";
const safeDependencyError = "Customer account dependencies could not be checked safely.";
const safeNotFoundError = "The exact customer account was not found.";
const safeValidationError = "Customer account deletion details are invalid.";
const safeBlockedError = "Customer account cannot be deleted while protected records remain.";

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function textOrNull(value: unknown, maxLength = 160) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();

  return cleaned ? cleaned.slice(0, maxLength) : null;
}

function configValueOrNull(value: string | undefined) {
  const cleaned = value?.trim();

  return cleaned && !/placeholder|change[_-]?me|replace[_-]?me|example/i.test(cleaned)
    ? cleaned
    : null;
}

function validServerDatabaseUrl(value: string | null) {
  if (!value) return false;

  try {
    const url = new URL(value);

    return url.protocol === "https:" && url.hostname.endsWith(".supabase.co");
  } catch {
    return false;
  }
}

function validServerCredential(value: string | null) {
  const normalized = value?.toLowerCase() || "";

  return Boolean(
    value &&
      value.length >= 24 &&
      normalized !== "anon" &&
      normalized !== "public" &&
      !normalized.includes("anon_key") &&
      !normalized.includes("public_key") &&
      !normalized.includes("next_public"),
  );
}

function safeFailure<T>(error: string, status: number): AdminCustomerAccountDeleteResult<T> {
  return { error, ok: false, status };
}

function verifiedCustomerId(value: unknown) {
  const parsed = Number(value);

  return Number.isSafeInteger(parsed) && parsed > 0 && String(value).trim() === String(parsed)
    ? parsed
    : null;
}

function validateActor(actor: AdminBookingPersistenceAdapterActor) {
  return Boolean(
    actor &&
      allowedActorRoles.has(actor.actor_role) &&
      actor.boundary_mode === "server-session-role-surface" &&
      actor.source_surface === "admin_api" &&
      textOrNull(actor.actor_label),
  );
}

function customerAccountClient(
  actor: AdminBookingPersistenceAdapterActor,
  clientInput?: CustomerAccountDeleteClient,
): AdminCustomerAccountDeleteResult<CustomerAccountDeleteClient> {
  if (!validateActor(actor)) {
    return safeFailure(safeActorError, 403);
  }

  if (clientInput) {
    return { data: clientInput, ok: true };
  }

  const supabaseUrl = configValueOrNull(process.env.SUPABASE_URL);
  const serviceRoleKey = configValueOrNull(process.env.SUPABASE_SERVICE_ROLE_KEY);

  if (!validServerDatabaseUrl(supabaseUrl) || !validServerCredential(serviceRoleKey)) {
    return safeFailure(safeConfigError, 503);
  }

  try {
    return {
      data: createClient(supabaseUrl as string, serviceRoleKey as string, {
        auth: { persistSession: false },
      }),
      ok: true,
    };
  } catch {
    return safeFailure(safeConfigError, 503);
  }
}

async function dependencyCount(
  client: CustomerAccountDeleteClient,
  table: string,
  column: string,
  value: string | number,
) {
  const { count, error } = await client
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq(column, value);

  return error || typeof count !== "number" ? null : count;
}

export async function inspectAdminCustomerAccountDeletion(
  customerIdInput: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  clientInput?: CustomerAccountDeleteClient,
): Promise<AdminCustomerAccountDeleteResult<AdminCustomerAccountDeletionInspection>> {
  const customerId = verifiedCustomerId(customerIdInput);

  if (!customerId) {
    return safeFailure(safeValidationError, 400);
  }

  const clientResult = customerAccountClient(actor, clientInput);

  if (!clientResult.ok) {
    return clientResult;
  }

  const client = clientResult.data;
  const { data: customerRows, error: customerError } = await client
    .from("customers")
    .select("id, display_name, account_status, status")
    .eq("id", customerId)
    .limit(1);

  if (customerError) {
    return safeFailure(safeDependencyError, 500);
  }

  const customer = asRecord(Array.isArray(customerRows) ? customerRows[0] : null);
  const displayName = textOrNull(customer.display_name);

  if (verifiedCustomerId(customer.id) !== customerId || !displayName) {
    return safeFailure(safeNotFoundError, 404);
  }

  const customerReference = String(customerId);
  const [bookings, contacts, invoiceRecords, monthlyBillingDrafts, monthlyInvoiceDrafts, portalAccessAccounts] =
    await Promise.all([
      dependencyCount(client, "bookings", "customer_id", customerId),
      dependencyCount(client, "customer_contacts", "customer_id", customerId),
      dependencyCount(client, "customer_invoice_records", "customer_id", customerReference),
      dependencyCount(client, "monthly_billing_draft_plans", "customer_id", customerReference),
      dependencyCount(client, "monthly_invoice_drafts", "customer_id", customerReference),
      dependencyCount(client, "customer_access_accounts", "customer_account_reference", customerReference),
    ]);

  if (
    [bookings, contacts, invoiceRecords, monthlyBillingDrafts, monthlyInvoiceDrafts, portalAccessAccounts].some(
      (count) => count === null,
    )
  ) {
    return safeFailure(safeDependencyError, 500);
  }

  const counts = {
    bookings: bookings as number,
    contacts: contacts as number,
    invoice_records: invoiceRecords as number,
    monthly_billing_drafts: monthlyBillingDrafts as number,
    monthly_invoice_drafts: monthlyInvoiceDrafts as number,
    portal_access_accounts: portalAccessAccounts as number,
  };
  const blockers: AdminCustomerAccountDeletionInspection["blockers"] = [];

  if (counts.bookings > 0) blockers.push("bookings");
  if (counts.invoice_records > 0) blockers.push("invoice_records");
  if (counts.monthly_billing_drafts > 0) blockers.push("monthly_billing_drafts");
  if (counts.monthly_invoice_drafts > 0) blockers.push("monthly_invoice_drafts");

  return {
    data: {
      blockers,
      counts,
      customer: {
        account_status: textOrNull(customer.account_status, 40),
        display_name: displayName,
        id: customerId,
        status: textOrNull(customer.status, 40),
      },
      eligible: blockers.length === 0,
      version: adminCustomerAccountDeleteVersion,
    },
    ok: true,
  };
}

export async function deleteAdminCustomerAccount(
  input: { confirmation_name?: unknown; customer_id?: unknown },
  actor: AdminBookingPersistenceAdapterActor,
  clientInput?: CustomerAccountDeleteClient,
): Promise<AdminCustomerAccountDeleteResult<AdminCustomerAccountDeletionInspection>> {
  if (
    !input ||
    Object.keys(input).some((key) => !["confirmation_name", "customer_id"].includes(key))
  ) {
    return safeFailure(safeValidationError, 400);
  }

  const customerId = verifiedCustomerId(input.customer_id);
  const confirmationName = textOrNull(input.confirmation_name);

  if (!customerId || !confirmationName) {
    return safeFailure(safeValidationError, 400);
  }

  const clientResult = customerAccountClient(actor, clientInput);

  if (!clientResult.ok) {
    return clientResult;
  }

  const inspection = await inspectAdminCustomerAccountDeletion(customerId, actor, clientResult.data);

  if (!inspection.ok) {
    return inspection;
  }

  if (!inspection.data.eligible) {
    return safeFailure(safeBlockedError, 409);
  }

  if (confirmationName !== inspection.data.customer.display_name) {
    return safeFailure(safeValidationError, 400);
  }

  const customerReference = String(customerId);
  const { error: revokeError } = await clientResult.data
    .from("customer_access_accounts")
    .update({
      account_status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("customer_account_reference", customerReference);

  if (revokeError) {
    return safeFailure(safeDeleteError, 500);
  }

  const { data: deletedRows, error: deleteError } = await clientResult.data
    .from("customers")
    .delete()
    .eq("id", customerId)
    .select("id, display_name");
  const deleted = asRecord(Array.isArray(deletedRows) ? deletedRows[0] : null);

  if (deleteError || verifiedCustomerId(deleted.id) !== customerId) {
    return safeFailure(safeDeleteError, 500);
  }

  return {
    data: inspection.data,
    ok: true,
  };
}
