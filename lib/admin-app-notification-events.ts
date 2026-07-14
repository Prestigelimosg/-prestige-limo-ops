import "server-only";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  createAdminAppNotification,
  type AdminAppNotificationInput,
} from "./admin-app-notification-persistence";
import type { AdminMonthlyInvoiceDraftRecord } from "./admin-monthly-invoice-draft-persistence";

export type AdminAppOutboxEventResult = {
  delivery_surface: "admin_app";
  event_key: string | null;
  external_send: false;
  status: "created" | "failed_safely";
};

const maxEventKeySegmentLength = 60;

function compactEventKeySegment(value: string | null | undefined) {
  const compacted = String(value ?? "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return compacted.slice(0, maxEventKeySegmentLength) || "unknown";
}

function monthlyBillingDraftPrepPayload(
  draft: AdminMonthlyInvoiceDraftRecord,
): AdminAppNotificationInput & { event_key: string } {
  const eventKey = [
    "monthly-billing-draft-prep",
    compactEventKeySegment(draft.id),
    compactEventKeySegment(draft.billing_month),
    Date.now(),
  ].join("-");

  return {
    booking_reference: null,
    event_key: eventKey,
    notification_status: "queued",
    notification_type: "monthly_billing",
    priority: draft.readiness_status === "blocked" ? "high" : "normal",
    safe_context: {
      billing_month: draft.billing_month,
      blocked_count: draft.blocked_count,
      customer_account: draft.customer_account,
      draft_id: draft.id,
      ready_count: draft.ready_count,
      readiness_status: draft.readiness_status,
      total_count: draft.total_count,
    },
    safe_message:
      "Admin monthly billing draft prep was saved from grouped completed trip data.",
    safe_title: "Monthly billing draft prep saved",
    workflow_area: "monthly_billing_draft_prep",
  };
}

export async function createMonthlyBillingDraftPrepAppEvent(
  draft: AdminMonthlyInvoiceDraftRecord,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminAppOutboxEventResult> {
  const payload = monthlyBillingDraftPrepPayload(draft);

  try {
    const result = await createAdminAppNotification(payload, actor);

    if (!result.ok) {
      return {
        delivery_surface: "admin_app",
        event_key: payload.event_key,
        external_send: false,
        status: "failed_safely",
      };
    }

    return {
      delivery_surface: "admin_app",
      event_key: result.data.event_key || payload.event_key,
      external_send: false,
      status: "created",
    };
  } catch {
    return {
      delivery_surface: "admin_app",
      event_key: payload.event_key,
      external_send: false,
      status: "failed_safely",
    };
  }
}

export async function createMonthlyInvoiceDraftAutomationSummaryAppEvent(
  {
    billingMonth,
    failedCount,
    preparedCount,
    skippedExistingCount,
  }: {
    billingMonth: string;
    failedCount: number;
    preparedCount: number;
    skippedExistingCount: number;
  },
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminAppOutboxEventResult> {
  const eventKey = `monthly-billing-auto-prep-${compactEventKeySegment(billingMonth)}`;
  const payload: AdminAppNotificationInput = {
    booking_reference: null,
    event_key: eventKey,
    notification_status: "queued",
    notification_type: "monthly_billing",
    priority: failedCount > 0 ? "high" : "normal",
    safe_context: {
      billing_month: billingMonth,
      failed_count: failedCount,
      prepared_count: preparedCount,
      skipped_existing_count: skippedExistingCount,
    },
    safe_message:
      failedCount > 0
        ? "Monthly billing draft preparation completed with items needing admin review."
        : "Monthly billing drafts are ready for admin review.",
    safe_title: "Monthly billing drafts ready",
    workflow_area: "monthly_billing_draft_prep",
  };

  try {
    const result = await createAdminAppNotification(payload, actor);

    return {
      delivery_surface: "admin_app",
      event_key: result.ok ? result.data.event_key || eventKey : eventKey,
      external_send: false,
      status: result.ok ? "created" : "failed_safely",
    };
  } catch {
    return {
      delivery_surface: "admin_app",
      event_key: eventKey,
      external_send: false,
      status: "failed_safely",
    };
  }
}
