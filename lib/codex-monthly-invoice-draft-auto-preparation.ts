import "server-only";

import { createMonthlyInvoiceDraftAutomationSummaryAppEvent } from "./admin-app-notification-events";
import { readAdminAutomationRuntimeControl } from "./admin-automation-runtime-control";
import { codexMonthlyInvoiceAutomationPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import { loadAdminMonthlyBillingGroups } from "./admin-monthly-billing-grouping-read";
import {
  createAdminMonthlyInvoiceDraftFromGroup,
  loadAdminMonthlyInvoiceDrafts,
  type AdminMonthlyInvoiceDraftInput,
} from "./admin-monthly-invoice-draft-persistence";
import { loadAdminMonthlyInvoiceDraftTripCandidates } from "./admin-monthly-invoice-draft-trip-candidates";

export const codexMonthlyInvoiceDraftAutoPreparationVersion =
  "codex-monthly-invoice-draft-auto-preparation:v1";

export type CodexMonthlyInvoiceDraftAutoPreparationResult = {
  automation_enabled: boolean;
  billing_month: string | null;
  calendar_auto_write_enabled: false;
  customerVisible: false;
  customer_driver_email_auto_send_enabled: false;
  external_send: false;
  failed_count: number;
  invoice_auto_issue_enabled: false;
  notification_status: "created" | "failed_safely" | "not_created";
  prepared_count: number;
  reason:
    | "group_limit_exceeded"
    | "group_read_failed"
    | "invalid_run_date"
    | "no_work"
    | "not_first_day"
    | "partial_failure"
    | "prepared"
    | "runtime_closed"
    | "runtime_unavailable";
  skipped_existing_count: number;
  status: "closed" | "error" | "no_op" | "ready";
  version: typeof codexMonthlyInvoiceDraftAutoPreparationVersion;
};

const singaporeTimeZone = "Asia/Singapore";
const batchLimit = 250;

function result(
  overrides: Partial<CodexMonthlyInvoiceDraftAutoPreparationResult>,
): CodexMonthlyInvoiceDraftAutoPreparationResult {
  return {
    automation_enabled: false,
    billing_month: null,
    calendar_auto_write_enabled: false,
    customerVisible: false,
    customer_driver_email_auto_send_enabled: false,
    external_send: false,
    failed_count: 0,
    invoice_auto_issue_enabled: false,
    notification_status: "not_created",
    prepared_count: 0,
    reason: "runtime_closed",
    skipped_existing_count: 0,
    status: "closed",
    version: codexMonthlyInvoiceDraftAutoPreparationVersion,
    ...overrides,
  };
}

function singaporeDateParts(now: Date) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: singaporeTimeZone,
    year: "numeric",
  }).formatToParts(now);
  const partValue = (type: "day" | "month" | "year") =>
    Number(parts.find((part) => part.type === type)?.value || "");
  const day = partValue("day");
  const month = partValue("month");
  const year = partValue("year");

  return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000
    ? { day, month, year }
    : null;
}

export function previousSingaporeBillingMonth(now: Date) {
  const parts = singaporeDateParts(now);

  if (!parts) {
    return null;
  }

  const previousMonth = parts.month === 1 ? 12 : parts.month - 1;
  const previousMonthYear = parts.month === 1 ? parts.year - 1 : parts.year;

  return `${previousMonthYear}-${String(previousMonth).padStart(2, "0")}`;
}

export function isFirstSingaporeCalendarDay(now: Date) {
  return singaporeDateParts(now)?.day === 1;
}

function draftKey(customerAccount: string, billingMonth: string) {
  return `${customerAccount.trim()}::${billingMonth}`;
}

export async function runCodexMonthlyInvoiceDraftAutoPreparation({
  now = new Date(),
}: {
  now?: Date;
} = {}): Promise<CodexMonthlyInvoiceDraftAutoPreparationResult> {
  const billingMonth = previousSingaporeBillingMonth(now);

  if (!billingMonth) {
    return result({
      reason: "invalid_run_date",
      status: "error",
    });
  }

  if (!isFirstSingaporeCalendarDay(now)) {
    return result({
      billing_month: billingMonth,
      reason: "not_first_day",
      status: "no_op",
    });
  }

  let runtime;

  try {
    runtime = await readAdminAutomationRuntimeControl();
  } catch {
    return result({
      billing_month: billingMonth,
      reason: "runtime_unavailable",
      status: "error",
    });
  }

  if (
    !runtime.ok ||
    runtime.runtime_status !== "active" ||
    runtime.automation_enabled !== true
  ) {
    return result({
      billing_month: billingMonth,
      reason:
        runtime.ok && runtime.runtime_status === "closed"
          ? "runtime_closed"
          : "runtime_unavailable",
      status:
        runtime.ok && runtime.runtime_status === "closed" ? "closed" : "error",
    });
  }

  const actor = codexMonthlyInvoiceAutomationPersistenceAdapterActor;
  const groupResult = await loadAdminMonthlyBillingGroups(
    {
      billing_month: billingMonth,
      customer_account_search: null,
      limit: batchLimit,
      page: 1,
      readiness_status: null,
    },
    actor,
  );

  if (!groupResult.ok) {
    return result({
      automation_enabled: true,
      billing_month: billingMonth,
      reason: "group_read_failed",
      status: "error",
    });
  }

  if (groupResult.data.pagination.has_next_page) {
    return result({
      automation_enabled: true,
      billing_month: billingMonth,
      failed_count: groupResult.data.pagination.total_group_count,
      reason: "group_limit_exceeded",
      status: "error",
    });
  }

  const existingDraftResult = await loadAdminMonthlyInvoiceDrafts(
    {
      billing_month: billingMonth,
      customer_account_search: null,
      draft_id: null,
      draft_status: null,
      limit: batchLimit,
      page: 1,
      readiness_status: null,
    },
    actor,
  );

  if (!existingDraftResult.ok || existingDraftResult.data.pagination.has_next_page) {
    return result({
      automation_enabled: true,
      billing_month: billingMonth,
      failed_count: groupResult.data.groups.length,
      reason: "group_read_failed",
      status: "error",
    });
  }

  const existingDraftKeys = new Set(
    existingDraftResult.data.invoice_drafts.map((draft) =>
      draftKey(draft.customer_account, draft.billing_month),
    ),
  );
  let failedCount = 0;
  let preparedCount = 0;
  let skippedExistingCount = 0;

  for (const group of groupResult.data.groups) {
    if (existingDraftKeys.has(draftKey(group.customer_account, group.billing_month))) {
      skippedExistingCount += 1;
      continue;
    }

    const candidateResult = await loadAdminMonthlyInvoiceDraftTripCandidates(
      {
        billing_month: group.billing_month,
        customer_account: group.customer_account,
        customer_id: group.customer_id,
        limit: batchLimit,
        page: 1,
      },
      actor,
    );

    if (
      !candidateResult.ok ||
      candidateResult.data.pagination.has_next_page ||
      candidateResult.data.summary.total_count !== group.total_count ||
      candidateResult.data.trip_candidates.length !== group.total_count
    ) {
      failedCount += 1;
      continue;
    }

    const draftInput: AdminMonthlyInvoiceDraftInput = {
      billing_month: group.billing_month,
      blocked_count: group.blocked_count,
      customer_account: group.customer_account,
      customer_id: group.customer_id,
      draft_status: "pending_admin_review",
      linked_trips: candidateResult.data.trip_candidates.map((candidate) => ({
        billing_prep_readiness: candidate.billing_prep_readiness,
        booking_reference: candidate.booking_reference,
        closeout_id: candidate.closeout_id,
        closeout_status: candidate.closeout_status,
        safe_trip_context: candidate.safe_trip_context,
        trip_readiness_status: candidate.trip_readiness_status,
      })),
      ready_count: group.ready_count,
      readiness_status: group.safe_readiness_status,
      safe_draft_note: "Prepared automatically from the saved monthly group for admin review.",
      safe_draft_context: {
        draft_summary: `${group.total_count} saved completed trip${group.total_count === 1 ? "" : "s"} grouped for monthly draft prep.`,
        next_action:
          group.blocked_count > 0
            ? "Review blocked saved trips before manager approval."
            : "Review saved group counts before manager approval.",
        review_status: "Prepared automatically and waiting for admin review.",
      },
      source_grouping_summary: {
        billing_month: group.billing_month,
        blocked_count: group.blocked_count,
        customer_account: group.customer_account,
        readiness_status: group.safe_readiness_status,
        ready_count: group.ready_count,
        source: "admin_monthly_billing_grouping_read",
        total_count: group.total_count,
      },
      total_count: group.total_count,
    };
    const savedDraft = await createAdminMonthlyInvoiceDraftFromGroup(draftInput, actor);

    if (!savedDraft.ok) {
      failedCount += 1;
      continue;
    }

    preparedCount += 1;
  }

  let notificationStatus: CodexMonthlyInvoiceDraftAutoPreparationResult["notification_status"] =
    "not_created";

  if (preparedCount > 0) {
    const notification = await createMonthlyInvoiceDraftAutomationSummaryAppEvent(
      {
        billingMonth,
        failedCount,
        preparedCount,
        skippedExistingCount,
      },
      actor,
    );
    notificationStatus = notification.status;
  }

  return result({
    automation_enabled: true,
    billing_month: billingMonth,
    failed_count: failedCount,
    notification_status: notificationStatus,
    prepared_count: preparedCount,
    reason:
      failedCount > 0
        ? "partial_failure"
        : preparedCount > 0
          ? "prepared"
          : "no_work",
    skipped_existing_count: skippedExistingCount,
    status: failedCount > 0 ? "error" : preparedCount > 0 ? "ready" : "no_op",
  });
}
