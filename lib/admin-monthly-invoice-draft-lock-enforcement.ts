import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingResult } from "./admin-booking-persistence";

export const lockedMonthlyInvoiceDraftError =
  "Admin monthly invoice draft is locked for invoice issue and cannot be changed safely.";

const lockReadFailureError = "Admin monthly invoice draft lock check failed safely.";
const issueRecordLockSelect =
  "id, draft_id, issue_record_status, draft_lock_status, invoice_number_status";
const invoiceDraftIdentitySelect = "id, customer_account, billing_month";
const nonLockingIssueRecordStatuses = new Set(["archived", "voided"]);

type DraftLockScope = {
  billing_month?: string | null;
  customer_account?: string | null;
  draft_id?: string | null;
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function textOrNull(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }

  const trimmed = String(value).trim();

  return trimmed || null;
}

function lockReadFailure<T>(): AdminBookingResult<T> {
  return {
    error: lockReadFailureError,
    ok: false,
    status: 500,
  };
}

function okUnlocked(): AdminBookingResult<null> {
  return {
    data: null,
    ok: true,
  };
}

function blockedByLock(): AdminBookingResult<null> {
  return {
    error: lockedMonthlyInvoiceDraftError,
    ok: false,
    status: 409,
  };
}

function issueRecordLocksDraft(row: UnknownRecord) {
  const issueRecordStatus = textOrNull(row.issue_record_status);

  if (issueRecordStatus && nonLockingIssueRecordStatuses.has(issueRecordStatus)) {
    return false;
  }

  return textOrNull(row.draft_lock_status) === "locked_for_issue";
}

async function loadDraftIdsForAccountMonth(
  client: SupabaseClient,
  scope: Required<Pick<DraftLockScope, "billing_month" | "customer_account">>,
): Promise<AdminBookingResult<string[]>> {
  const { data, error } = await client
    .from("monthly_invoice_drafts")
    .select(invoiceDraftIdentitySelect)
    .eq("customer_account", scope.customer_account)
    .eq("billing_month", scope.billing_month)
    .limit(25);

  if (error) {
    return lockReadFailure();
  }

  return {
    data: asArray(data)
      .map(asRecord)
      .map((row) => textOrNull(row.id))
      .filter((draftId): draftId is string => Boolean(draftId)),
    ok: true,
  };
}

async function lockedRecordExistsForDraft(
  client: SupabaseClient,
  draftId: string,
): Promise<AdminBookingResult<boolean>> {
  const { data, error } = await client
    .from("monthly_invoice_issue_records")
    .select(issueRecordLockSelect)
    .eq("draft_id", draftId)
    .limit(25);

  if (error) {
    return lockReadFailure();
  }

  return {
    data: asArray(data).map(asRecord).some(issueRecordLocksDraft),
    ok: true,
  };
}

export async function assertAdminMonthlyInvoiceDraftUnlocked(
  client: SupabaseClient,
  scope: DraftLockScope,
): Promise<AdminBookingResult<null>> {
  const directDraftId = textOrNull(scope.draft_id);
  const draftIds = directDraftId ? [directDraftId] : [];

  if (draftIds.length === 0 && scope.customer_account && scope.billing_month) {
    const draftIdResult = await loadDraftIdsForAccountMonth(client, {
      billing_month: scope.billing_month,
      customer_account: scope.customer_account,
    });

    if (!draftIdResult.ok) {
      return draftIdResult;
    }

    draftIds.push(...draftIdResult.data);
  }

  if (draftIds.length === 0) {
    return okUnlocked();
  }

  for (const draftId of draftIds) {
    const lockResult = await lockedRecordExistsForDraft(client, draftId);

    if (!lockResult.ok) {
      return lockResult;
    }

    if (lockResult.data) {
      return blockedByLock();
    }
  }

  return okUnlocked();
}
