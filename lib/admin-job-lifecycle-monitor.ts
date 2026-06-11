export const adminJobLifecycleMonitorVersion = "admin-job-lifecycle-monitor:v1";

export type AdminJobLifecycleCheckpointKey =
  | "job_card_created"
  | "driver_assigned"
  | "driver_acknowledged"
  | "driver_otw"
  | "driver_ots"
  | "passenger_on_board"
  | "job_completed"
  | "billing_ready"
  | "monthly_billing_linked";

export type AdminJobLifecycleCheckpointStatus = "complete" | "missing";

export type AdminJobLifecycleMonitorInput = {
  booking_ref?: string | null;
  job_card_created_at?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  driver_acknowledged_at?: string | null;
  driver_otw_at?: string | null;
  driver_ots_at?: string | null;
  passenger_on_board_at?: string | null;
  job_completed_at?: string | null;
  billing_readiness_status?: "ready" | "blocked" | string | null;
  monthly_invoice_draft_id?: string | null;
  monthly_invoice_draft_status?: string | null;
};

export type AdminJobLifecycleCheckpoint = {
  key: AdminJobLifecycleCheckpointKey;
  label: string;
  status: AdminJobLifecycleCheckpointStatus;
};

export type AdminJobLifecycleMonitorResult = {
  version: typeof adminJobLifecycleMonitorVersion;
  booking_ref: string;
  status: "complete" | "attention_required";
  checkpoints: AdminJobLifecycleCheckpoint[];
  missing_checkpoints: AdminJobLifecycleCheckpointKey[];
};

function hasValue(value: unknown) {
  return typeof value === "string" ? value.trim().length > 0 : Boolean(value);
}

export function buildAdminJobLifecycleMonitor(
  input: AdminJobLifecycleMonitorInput,
): AdminJobLifecycleMonitorResult {
  const checkpoints: AdminJobLifecycleCheckpoint[] = [
    {
      key: "job_card_created",
      label: "Job Card Created",
      status: hasValue(input.job_card_created_at) || hasValue(input.booking_ref) ? "complete" : "missing",
    },
    {
      key: "driver_assigned",
      label: "Driver Assigned",
      status: hasValue(input.driver_id) || hasValue(input.driver_name) ? "complete" : "missing",
    },
    {
      key: "driver_acknowledged",
      label: "Driver Acknowledged",
      status: hasValue(input.driver_acknowledged_at) ? "complete" : "missing",
    },
    {
      key: "driver_otw",
      label: "OTW",
      status: hasValue(input.driver_otw_at) ? "complete" : "missing",
    },
    {
      key: "driver_ots",
      label: "OTS",
      status: hasValue(input.driver_ots_at) ? "complete" : "missing",
    },
    {
      key: "passenger_on_board",
      label: "POB",
      status: hasValue(input.passenger_on_board_at) ? "complete" : "missing",
    },
    {
      key: "job_completed",
      label: "Job Completed",
      status: hasValue(input.job_completed_at) ? "complete" : "missing",
    },
    {
      key: "billing_ready",
      label: "Billing Ready",
      status: input.billing_readiness_status === "ready" ? "complete" : "missing",
    },
    {
      key: "monthly_billing_linked",
      label: "Monthly Billing / Invoice Draft Linked",
      status:
        hasValue(input.monthly_invoice_draft_id) || hasValue(input.monthly_invoice_draft_status)
          ? "complete"
          : "missing",
    },
  ];

  const missing_checkpoints = checkpoints
    .filter((checkpoint) => checkpoint.status === "missing")
    .map((checkpoint) => checkpoint.key);

  return {
    version: adminJobLifecycleMonitorVersion,
    booking_ref: hasValue(input.booking_ref) ? String(input.booking_ref).trim() : "unknown",
    status: missing_checkpoints.length === 0 ? "complete" : "attention_required",
    checkpoints,
    missing_checkpoints,
  };
}
