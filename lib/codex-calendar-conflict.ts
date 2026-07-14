import { adminBookingCalendarDefaultDurationMinutes } from "./admin-booking-calendar-policy";

export const codexCalendarConflictVersion = "codex-calendar-conflict-v1";

export type CodexCalendarConflictBooking = {
  active: boolean;
  driverId?: string | number | null;
  driverName?: string | null;
  identity: string;
  pickupTimeMs: number | null;
  vehiclePlate?: string | null;
};

export type CodexCalendarConflictResult = {
  conflictCount: number;
  detail: string;
  label: string;
  matchedResource: "driver" | "driver-and-vehicle" | "vehicle" | null;
  status: "assignment-incomplete" | "conflict" | "no-conflict" | "timing-incomplete";
};

const unassignedResourceLabels = new Set([
  "driver tbc",
  "driver to be confirmed",
  "pending driver",
  "pending vehicle",
  "tbc",
  "to be confirmed",
  "unassigned",
  "vehicle tbc",
]);

function normalizedText(value: string | number | null | undefined) {
  return (value ?? "").toString().trim().replace(/\s+/g, " ").toLowerCase();
}

function normalizedDriverName(value: string | null | undefined) {
  const normalized = normalizedText(value);

  return normalized && !unassignedResourceLabels.has(normalized) ? normalized : "";
}

function normalizedVehiclePlate(value: string | null | undefined) {
  const normalized = normalizedText(value);

  if (!normalized || unassignedResourceLabels.has(normalized)) {
    return "";
  }

  return normalized.replace(/[^a-z0-9]/g, "");
}

function normalizedDriverId(value: string | number | null | undefined) {
  return normalizedText(value);
}

function bookingsUseSameDriver(
  candidate: CodexCalendarConflictBooking,
  existing: CodexCalendarConflictBooking,
) {
  const candidateDriverId = normalizedDriverId(candidate.driverId);
  const existingDriverId = normalizedDriverId(existing.driverId);

  if (candidateDriverId && existingDriverId) {
    return candidateDriverId === existingDriverId;
  }

  const candidateDriverName = normalizedDriverName(candidate.driverName);
  const existingDriverName = normalizedDriverName(existing.driverName);

  return Boolean(candidateDriverName && candidateDriverName === existingDriverName);
}

function bookingsUseSameVehicle(
  candidate: CodexCalendarConflictBooking,
  existing: CodexCalendarConflictBooking,
) {
  const candidatePlate = normalizedVehiclePlate(candidate.vehiclePlate);
  const existingPlate = normalizedVehiclePlate(existing.vehiclePlate);

  return Boolean(candidatePlate && candidatePlate === existingPlate);
}

function bookingsOverlap(
  candidate: CodexCalendarConflictBooking,
  existing: CodexCalendarConflictBooking,
) {
  if (!Number.isFinite(candidate.pickupTimeMs) || !Number.isFinite(existing.pickupTimeMs)) {
    return false;
  }

  const durationMs = adminBookingCalendarDefaultDurationMinutes * 60 * 1000;
  const candidateStart = candidate.pickupTimeMs as number;
  const existingStart = existing.pickupTimeMs as number;

  return candidateStart < existingStart + durationMs && existingStart < candidateStart + durationMs;
}

export function evaluateCodexCalendarConflict(
  candidate: CodexCalendarConflictBooking,
  loadedBookings: CodexCalendarConflictBooking[],
): CodexCalendarConflictResult {
  if (!Number.isFinite(candidate.pickupTimeMs)) {
    return {
      conflictCount: 0,
      detail: "Add an exact pickup date and time before checking.",
      label: "Pickup time needed",
      matchedResource: null,
      status: "timing-incomplete",
    };
  }

  const hasDriver = Boolean(
    normalizedDriverId(candidate.driverId) || normalizedDriverName(candidate.driverName),
  );
  const hasVehicle = Boolean(normalizedVehiclePlate(candidate.vehiclePlate));

  if (!hasDriver && !hasVehicle) {
    return {
      conflictCount: 0,
      detail: "Assign a driver or vehicle before checking.",
      label: "Assignment incomplete",
      matchedResource: null,
      status: "assignment-incomplete",
    };
  }

  let driverConflict = false;
  let vehicleConflict = false;
  let conflictCount = 0;
  const candidateIdentity = normalizedText(candidate.identity);

  for (const existing of loadedBookings) {
    if (
      !existing.active ||
      (candidateIdentity && normalizedText(existing.identity) === candidateIdentity) ||
      !bookingsOverlap(candidate, existing)
    ) {
      continue;
    }

    const sameDriver = bookingsUseSameDriver(candidate, existing);
    const sameVehicle = bookingsUseSameVehicle(candidate, existing);

    if (!sameDriver && !sameVehicle) {
      continue;
    }

    conflictCount += 1;
    driverConflict ||= sameDriver;
    vehicleConflict ||= sameVehicle;
  }

  if (conflictCount === 0) {
    return {
      conflictCount,
      detail: "No same-driver or same-vehicle overlap in loaded Prestige saved jobs.",
      label: "No saved-job conflict",
      matchedResource: null,
      status: "no-conflict",
    };
  }

  const matchedResource =
    driverConflict && vehicleConflict
      ? "driver-and-vehicle"
      : driverConflict
        ? "driver"
        : "vehicle";
  const resourceLabel =
    matchedResource === "driver-and-vehicle"
      ? "the same driver or vehicle"
      : matchedResource === "driver"
        ? "the same driver"
        : "the same vehicle";

  return {
    conflictCount,
    detail: `${conflictCount} overlapping loaded Prestige saved job${
      conflictCount === 1 ? "" : "s"
    } use${conflictCount === 1 ? "s" : ""} ${resourceLabel}.`,
    label: `Calendar conflict (${conflictCount})`,
    matchedResource,
    status: "conflict",
  };
}
