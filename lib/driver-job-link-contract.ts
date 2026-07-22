import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpired,
  mapBookingToSafeDriverJobPayload,
  validateDriverJobStatusUpdate,
  type DriverJobBookingLike,
  type DriverJobStatusUpdate,
  type SafeDriverJobPayload,
} from "./driver-job-link.ts";

export type DriverJobLinkContractRecord = {
  tokenHash: string;
  bookingId: string | number;
  expiresAt: Date | string | number;
  revokedAt?: Date | string | number | null;
};

export type DriverJobLinkContractBookingStore = Record<string, DriverJobBookingLike | undefined>;

export type DriverJobLinkBlockedReason = "unauthorized" | "expired" | "revoked";
export type DriverJobLinkStatusBlockedReason = DriverJobLinkBlockedReason | "invalid_status";

export type DriverJobLinkPayloadResult =
  | {
      ok: true;
      reason: "ok";
      payload: SafeDriverJobPayload;
    }
  | {
      ok: false;
      reason: DriverJobLinkBlockedReason;
      payload: null;
    };

export type DriverJobLinkStatusUpdateResult =
  | {
      ok: true;
      reason: "updated";
      status: DriverJobStatusUpdate;
      payload: SafeDriverJobPayload;
    }
  | {
      ok: false;
      reason: DriverJobLinkStatusBlockedReason;
      payload: null;
    };

export type DriverJobLinkDetailsUpdateResult =
  | {
      ok: true;
      reason: "updated";
      payload: SafeDriverJobPayload;
    }
  | {
      ok: false;
      reason: DriverJobLinkBlockedReason | "invalid_details";
      payload: null;
    };

type ResolveDriverJobLinkInput = {
  token: string;
  links: DriverJobLinkContractRecord[];
  bookingsById: DriverJobLinkContractBookingStore;
  now?: Date | string | number;
};

type DriverJobLinkRecordResult =
  | {
      ok: true;
      link: DriverJobLinkContractRecord;
      booking: DriverJobBookingLike;
    }
  | {
      ok: false;
      reason: DriverJobLinkBlockedReason;
    };

type ApplyDriverJobStatusUpdateInput = ResolveDriverJobLinkInput & {
  status: string;
};

type ApplyDriverJobDetailsUpdateInput = ResolveDriverJobLinkInput & {
  driverContact?: unknown;
  driverName?: unknown;
  driverPlateNumber?: unknown;
  driverVehicleModel?: unknown;
};

export function getDriverJobPayloadForTokenContract(input: ResolveDriverJobLinkInput): DriverJobLinkPayloadResult {
  const resolvedLink = resolveDriverJobLinkRecord(input);

  if (!resolvedLink.ok) {
    return {
      ok: false,
      reason: resolvedLink.reason,
      payload: null,
    };
  }

  return {
    ok: true,
    reason: "ok",
    payload: mapBookingToSafeDriverJobPayload(resolvedLink.booking),
  };
}

export function applyDriverJobStatusUpdateContract(
  input: ApplyDriverJobStatusUpdateInput,
): DriverJobLinkStatusUpdateResult {
  const resolvedLink = resolveDriverJobLinkRecord(input);

  if (!resolvedLink.ok) {
    return {
      ok: false,
      reason: resolvedLink.reason,
      payload: null,
    };
  }

  const nextStatus = validateDriverJobStatusUpdate(input.status);

  if (!nextStatus) {
    return {
      ok: false,
      reason: "invalid_status",
      payload: null,
    };
  }

  const bookingKey = String(resolvedLink.link.bookingId);
  const occurredAt = statusEventTime(input.now);
  const statusHistory = Array.isArray(resolvedLink.booking.statusHistory)
    ? resolvedLink.booking.statusHistory
    : [];
  const updatedBooking = {
    ...resolvedLink.booking,
    status: nextStatus,
    statusHistory: [
      {
        occurredAt,
        safeNote: "",
        status: nextStatus,
      },
      ...statusHistory,
    ].slice(0, 10),
  };

  input.bookingsById[bookingKey] = updatedBooking;

  if (nextStatus === "completed") {
    for (const link of input.links) {
      if (
        String(link.bookingId) === bookingKey &&
        !isRevoked(link) &&
        !isDriverJobLinkExpired(link.expiresAt, occurredAt)
      ) {
        link.expiresAt = occurredAt;
      }
    }
  }

  return {
    ok: true,
    reason: "updated",
    status: nextStatus,
    payload: mapBookingToSafeDriverJobPayload(updatedBooking),
  };
}

export function applyDriverJobDetailsUpdateContract(
  input: ApplyDriverJobDetailsUpdateInput,
): DriverJobLinkDetailsUpdateResult {
  const resolvedLink = resolveDriverJobLinkRecord(input);

  if (!resolvedLink.ok) {
    return {
      ok: false,
      reason: resolvedLink.reason,
      payload: null,
    };
  }

  const nextDetails = safeDriverDetailsFromInput(input);

  if (!nextDetails.name) {
    return {
      ok: false,
      reason: "invalid_details",
      payload: null,
    };
  }

  const bookingKey = String(resolvedLink.link.bookingId);
  const updatedBooking = {
    ...resolvedLink.booking,
    driver_acknowledged_at: statusEventTime(input.now),
    driver_contact: nextDetails.contact,
    driver_name: nextDetails.name,
    driver_plate_number: nextDetails.plate,
    driver_vehicle_model: nextDetails.vehicleModel,
  };

  input.bookingsById[bookingKey] = updatedBooking;

  return {
    ok: true,
    reason: "updated",
    payload: mapBookingToSafeDriverJobPayload(updatedBooking),
  };
}

function resolveDriverJobLinkRecord(input: ResolveDriverJobLinkInput): DriverJobLinkRecordResult {
  const tokenHash = safeHashToken(input.token);

  if (!tokenHash) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  const matchingLinks = input.links.filter((link) => link.tokenHash === tokenHash);

  if (matchingLinks.length !== 1) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  const link = matchingLinks[0];

  if (isRevoked(link)) {
    return {
      ok: false,
      reason: "revoked",
    };
  }

  if (isDriverJobLinkExpired(link.expiresAt, input.now)) {
    return {
      ok: false,
      reason: "expired",
    };
  }

  const booking = input.bookingsById[String(link.bookingId)];

  if (!booking) {
    return {
      ok: false,
      reason: "unauthorized",
    };
  }

  return {
    ok: true,
    link,
    booking,
  };
}

function safeHashToken(token: string) {
  try {
    return hashDriverJobLinkToken(token);
  } catch {
    return "";
  }
}

function statusEventTime(value: Date | string | number | undefined) {
  const date = value === undefined ? new Date() : new Date(value);

  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function safeDriverDetailsFromInput(input: ApplyDriverJobDetailsUpdateInput) {
  return {
    contact: safeDriverDetailText(input.driverContact, 120),
    name: safeDriverDetailText(input.driverName, 120),
    plate: safeDriverDetailText(input.driverPlateNumber, 80),
    vehicleModel: safeDriverDetailText(input.driverVehicleModel, 120),
  };
}

function safeDriverDetailText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  const text = value.trim().replace(/\s+/g, " ").slice(0, maxLength);

  if (
    /\b(?:account|admin|bank|billing|debug|invoice|password|payment|payout|paynow|secret|service_role|token)\b/i.test(
      text,
    )
  ) {
    return "";
  }

  return text;
}

function isRevoked(link: DriverJobLinkContractRecord) {
  return link.revokedAt !== null && link.revokedAt !== undefined && String(link.revokedAt).trim() !== "";
}
