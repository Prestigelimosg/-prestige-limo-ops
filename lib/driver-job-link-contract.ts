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
  const updatedBooking = {
    ...resolvedLink.booking,
    status: nextStatus,
  };

  input.bookingsById[bookingKey] = updatedBooking;

  return {
    ok: true,
    reason: "updated",
    status: nextStatus,
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

function isRevoked(link: DriverJobLinkContractRecord) {
  return link.revokedAt !== null && link.revokedAt !== undefined && String(link.revokedAt).trim() !== "";
}
