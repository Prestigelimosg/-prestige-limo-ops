import "server-only";

import { readAdminAutomationRuntimeControl } from "./admin-automation-runtime-control";
import { saveAdminBookingWorkflowStatus } from "./admin-booking-workflow-status-persistence";
import { codexJobCardAutomationPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

export const codexJobCardAutoPreparationVersion =
  "codex-job-card-auto-preparation:v1";

export type CodexJobCardPreparationEvent =
  | "amendment"
  | "cancellation"
  | "new_booking";

export type CodexJobCardAutoPreparationResult = {
  automation_enabled: boolean;
  calendar_auto_write_enabled: false;
  customerVisible: false;
  external_send: false;
  prepared: boolean;
  reason:
    | "invalid_booking_reference"
    | "runtime_closed"
    | "runtime_unavailable"
    | "workflow_status_write_failed"
    | "prepared";
  status: "closed" | "error" | "needs_review" | "ready";
  version: typeof codexJobCardAutoPreparationVersion;
};

const bookingReferencePattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;

function result(
  overrides: Partial<CodexJobCardAutoPreparationResult>,
): CodexJobCardAutoPreparationResult {
  return {
    automation_enabled: false,
    calendar_auto_write_enabled: false,
    customerVisible: false,
    external_send: false,
    prepared: false,
    reason: "runtime_closed",
    status: "closed",
    version: codexJobCardAutoPreparationVersion,
    ...overrides,
  };
}

function workflowStatusForEvent(event: CodexJobCardPreparationEvent) {
  if (event === "amendment") {
    return {
      nextAction: "Admin review required for the saved amendment request.",
      statusLabel: "Amendment Review Required",
      statusValue: "needs_review" as const,
    };
  }

  if (event === "cancellation") {
    return {
      nextAction: "Admin review required before any calendar action.",
      statusLabel: "Cancellation Review Required",
      statusValue: "needs_review" as const,
    };
  }

  return {
    nextAction: "Admin review required before any calendar action.",
    statusLabel: "Ready for Admin Review",
    statusValue: "ready" as const,
  };
}

export async function prepareCodexJobCardForAdminReview({
  bookingReference,
  event,
}: {
  bookingReference: string;
  event: CodexJobCardPreparationEvent;
}): Promise<CodexJobCardAutoPreparationResult> {
  const cleanedBookingReference = bookingReference.trim();

  if (!bookingReferencePattern.test(cleanedBookingReference)) {
    return result({
      reason: "invalid_booking_reference",
      status: "error",
    });
  }

  let runtime;

  try {
    runtime = await readAdminAutomationRuntimeControl();
  } catch {
    return result({
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
      reason: runtime.ok && runtime.runtime_status === "closed"
        ? "runtime_closed"
        : "runtime_unavailable",
      status: runtime.ok && runtime.runtime_status === "closed" ? "closed" : "error",
    });
  }

  const workflowStatus = workflowStatusForEvent(event);

  try {
    const savedStatus = await saveAdminBookingWorkflowStatus(
      {
        booking_reference: cleanedBookingReference,
        safe_status_context: {
          next_action: workflowStatus.nextAction,
        },
        status_label: workflowStatus.statusLabel,
        status_value: workflowStatus.statusValue,
        workflow_area: "admin_booking_review",
      },
      codexJobCardAutomationPersistenceAdapterActor,
    );

    if (!savedStatus.ok) {
      return result({
        automation_enabled: true,
        reason: "workflow_status_write_failed",
        status: "error",
      });
    }

    return result({
      automation_enabled: true,
      prepared: true,
      reason: "prepared",
      status: workflowStatus.statusValue,
    });
  } catch {
    return result({
      automation_enabled: true,
      reason: "workflow_status_write_failed",
      status: "error",
    });
  }
}
