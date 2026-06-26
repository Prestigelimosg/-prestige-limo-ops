export type DriverJobStatusUpdate = "driver_otw" | "ots" | "pob" | "completed";

export type DriverJobStatusTransitionGuardResult =
  | {
      ok: true;
      status: DriverJobStatusUpdate;
    }
  | {
      ok: false;
      message: string;
      reason: "acknowledgement_required" | "already_completed" | "invalid_status" | "out_of_order";
    };

export const driverJobStatusDisplayLabels: Record<DriverJobStatusUpdate, string> = {
  completed: "Completed",
  driver_otw: "I'm on the way",
  ots: "I've arrived",
  pob: "Passenger on board",
};

export const driverJobStatusActionLabels: Record<DriverJobStatusUpdate, string> = {
  completed: "Job Completed",
  driver_otw: "OTW",
  ots: "OTS",
  pob: "POB",
};

const driverJobStatusWorkflow = [
  { label: "OTW", value: "driver_otw" },
  { label: "OTS", value: "ots" },
  { label: "POB", value: "pob" },
  { label: "Job Completed", value: "completed" },
] as const satisfies ReadonlyArray<{
  label: string;
  value: DriverJobStatusUpdate;
}>;

export function validateDriverJobStatusUpdate(value: string): DriverJobStatusUpdate | null {
  const normalized = clean(value).toLowerCase().replace(/[\s-]+/g, "_");

  if (normalized === "otw" || normalized === "driver_otw" || normalized === "on_the_way") {
    return "driver_otw";
  }

  if (normalized === "ots" || normalized === "on_the_spot" || normalized === "arrived") {
    return "ots";
  }

  if (normalized === "pob" || normalized === "passenger_on_board" || normalized === "on_boarded") {
    return "pob";
  }

  if (normalized === "job_completed" || normalized === "completed" || normalized === "job_done") {
    return "completed";
  }

  return null;
}

export function guardDriverJobStatusTransition({
  acknowledged,
  currentStatus,
  nextStatus,
}: {
  acknowledged: boolean;
  currentStatus: string;
  nextStatus: string;
}): DriverJobStatusTransitionGuardResult {
  const normalizedNextStatus = validateDriverJobStatusUpdate(nextStatus);

  if (!normalizedNextStatus) {
    return {
      ok: false,
      message: "This status update was not accepted. Please try again or contact dispatch.",
      reason: "invalid_status",
    };
  }

  if (!acknowledged) {
    return {
      ok: false,
      message: "Acknowledge this job before updating status.",
      reason: "acknowledgement_required",
    };
  }

  const currentStatusIndex = workflowIndex(validateDriverJobStatusUpdate(currentStatus));
  const nextStatusIndex = workflowIndex(normalizedNextStatus);
  const expectedNextStatus = driverJobStatusWorkflow[currentStatusIndex + 1];

  if (!expectedNextStatus) {
    return {
      ok: false,
      message: "This mock job is already completed. Contact dispatch if this is incorrect.",
      reason: "already_completed",
    };
  }

  if (nextStatusIndex <= currentStatusIndex) {
    return {
      ok: false,
      message: `${driverJobStatusActionLabels[normalizedNextStatus]} is already recorded. Continue with ${expectedNextStatus.label}.`,
      reason: "out_of_order",
    };
  }

  if (nextStatusIndex !== currentStatusIndex + 1) {
    return {
      ok: false,
      message: `Update ${expectedNextStatus.label} before ${driverJobStatusActionLabels[normalizedNextStatus]}.`,
      reason: "out_of_order",
    };
  }

  return {
    ok: true,
    status: normalizedNextStatus,
  };
}

function workflowIndex(status: DriverJobStatusUpdate | null) {
  return driverJobStatusWorkflow.findIndex((workflowStatus) => workflowStatus.value === status);
}

function clean(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}
