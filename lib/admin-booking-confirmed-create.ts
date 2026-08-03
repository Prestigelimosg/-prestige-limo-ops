import "server-only";

import { createHash, randomBytes } from "node:crypto";

import {
  createAdminBooking,
  loadAdminBookingByReference,
  parseAdminBookingPersistencePayload,
  type AdminBookingPersistenceInput,
  type AdminBookingPersistenceRecord,
  type AdminBookingResult,
} from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  adminBookingConfirmedPayloadHash,
  verifyAdminBookingConfirmationToken,
} from "./admin-booking-confirmation";
import {
  claimAdminBookingIdempotencyReservation,
  completeAdminBookingIdempotencyReservation,
  failAdminBookingIdempotencyReservation,
  loadAdminBookingIdempotencyReservation,
  type AdminBookingIdempotencyClaimInput,
  type AdminBookingIdempotencyClaimResult,
  type AdminBookingIdempotencyReservation,
} from "./admin-booking-idempotency";
import {
  normalizeChatGptBookingPreview,
  type ChatGptBookingPreviewValidationIssue,
} from "./chatgpt-booking-preview";

export const confirmedChatGptBookingRequestSource = "chatgpt-confirmed-preview";
export const confirmedChatGptBookingRequestHeader = "x-prestige-booking-request-source";

const allowedEnvelopeFields = new Set([
  "request_source",
  "idempotency_key",
  "confirmation_token",
  "booking_preview",
]);
const maximumConcurrentWaitAttempts = 100;
const concurrentWaitMilliseconds = 50;

type UnknownRecord = Record<string, unknown>;

export type ConfirmedAdminBookingSafeSummary = {
  bag_count: number | null;
  dropoff_location: string;
  flight_number: string | null;
  passenger_count: number | null;
  passenger_name: string;
  pickup_datetime_sgt: string;
  pickup_location: string;
  service_type: string;
  vehicle_type: string | null;
};

export type ConfirmedAdminBookingCreateResponse = {
  booking_reference: string | null;
  saved_booking: ConfirmedAdminBookingSafeSummary | null;
  success: boolean;
  validation_issues: ChatGptBookingPreviewValidationIssue[];
};

export type ConfirmedAdminBookingCreateResult = {
  body: ConfirmedAdminBookingCreateResponse;
  status: number;
};

type ConfirmedAdminBookingCreateDependencies = {
  claimReservation: typeof claimAdminBookingIdempotencyReservation;
  completeReservation: typeof completeAdminBookingIdempotencyReservation;
  createBooking: typeof createAdminBooking;
  failReservation: typeof failAdminBookingIdempotencyReservation;
  loadBooking: typeof loadAdminBookingByReference;
  loadReservation: typeof loadAdminBookingIdempotencyReservation;
  now: () => number;
  randomBytes: (size: number) => Buffer;
  wait: (milliseconds: number) => Promise<void>;
};

const defaultDependencies: ConfirmedAdminBookingCreateDependencies = {
  claimReservation: claimAdminBookingIdempotencyReservation,
  completeReservation: completeAdminBookingIdempotencyReservation,
  createBooking: createAdminBooking,
  failReservation: failAdminBookingIdempotencyReservation,
  loadBooking: loadAdminBookingByReference,
  loadReservation: loadAdminBookingIdempotencyReservation,
  now: Date.now,
  randomBytes,
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
};

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function cleanText(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function issue(
  field: string,
  code: string,
  message: string,
): ChatGptBookingPreviewValidationIssue {
  return {
    code,
    field,
    message,
    severity: "error",
  };
}

function failure(
  status: number,
  validationIssues: ChatGptBookingPreviewValidationIssue[],
): ConfirmedAdminBookingCreateResult {
  return {
    body: {
      booking_reference: null,
      saved_booking: null,
      success: false,
      validation_issues: validationIssues,
    },
    status,
  };
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function validIdempotencyKey(value: unknown) {
  const clean = cleanText(value, 200);

  return clean.length >= 16 && /^[A-Za-z0-9._:-]+$/.test(clean) ? clean : null;
}

function bookingReference(nowMs: number, entropy: Buffer) {
  const date = new Date(nowMs).toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = entropy.toString("hex").toUpperCase().slice(0, 20);

  return `ADM-GPT-${date}-${suffix}`;
}

function safeSummary(record: AdminBookingPersistenceRecord): ConfirmedAdminBookingSafeSummary {
  return {
    bag_count: record.luggage_count ?? null,
    dropoff_location: cleanText(record.dropoff_location, 1000),
    flight_number: cleanText(record.flight_no, 120) || null,
    passenger_count: record.pax_count ?? null,
    passenger_name: cleanText(record.passenger_name, 1000),
    pickup_datetime_sgt: cleanText(record.pickup_datetime || record.pickup_at, 120),
    pickup_location: cleanText(record.pickup_location, 1000),
    service_type: cleanText(record.service_type || record.route_type, 120),
    vehicle_type: cleanText(record.vehicle_type_or_category, 120) || null,
  };
}

function success(record: AdminBookingPersistenceRecord): ConfirmedAdminBookingCreateResult {
  const reference = cleanText(record.booking_reference, 80);

  return {
    body: {
      booking_reference: reference,
      saved_booking: safeSummary(record),
      success: true,
      validation_issues: [],
    },
    status: 200,
  };
}

function finalCanonicalPayload(
  canonicalPayload: AdminBookingPersistenceInput,
  reference: string,
) {
  return parseAdminBookingPersistencePayload({
    booking: {
      ...canonicalPayload.booking,
      booking_reference: reference,
      parser_source_reference:
        "Confirmed ChatGPT booking preview; raw source message not retained.",
      source_channel: "chatgpt-confirmed-preview",
      source_surface: "chatgpt-confirmed-preview",
    },
    route_points: canonicalPayload.route_points,
    service_items: canonicalPayload.service_items,
  });
}

async function loadCompletedBooking(
  actor: AdminBookingPersistenceAdapterActor,
  reference: string,
  dependencies: ConfirmedAdminBookingCreateDependencies,
) {
  const loaded = await dependencies.loadBooking(actor, reference);

  return loaded.ok ? success(loaded.data) : null;
}

async function waitForConcurrentBooking(
  actor: AdminBookingPersistenceAdapterActor,
  keyHash: string,
  payloadHash: string,
  initialReservation: AdminBookingIdempotencyReservation,
  dependencies: ConfirmedAdminBookingCreateDependencies,
): Promise<ConfirmedAdminBookingCreateResult> {
  let reservation = initialReservation;

  for (let attempt = 0; attempt < maximumConcurrentWaitAttempts; attempt += 1) {
    if (reservation.payload_hash !== payloadHash) {
      return failure(409, [
        issue(
          "idempotency_key",
          "idempotency_payload_conflict",
          "This idempotency value was already used for different booking details.",
        ),
      ]);
    }

    if (reservation.state === "completed") {
      const loaded = await loadCompletedBooking(
        actor,
        reservation.booking_reference,
        dependencies,
      );

      return loaded || failure(503, [
        issue(
          "idempotency_key",
          "idempotency_result_unavailable",
          "The existing booking could not be safely returned.",
        ),
      ]);
    }

    if (reservation.state === "failed") {
      return failure(503, [
        issue(
          "idempotency_key",
          "idempotency_previous_attempt_failed",
          "The previous booking attempt failed safely. Retry the same confirmed request.",
        ),
      ]);
    }

    await dependencies.wait(concurrentWaitMilliseconds);
    const loadedReservation = await dependencies.loadReservation(keyHash, actor);

    if (!loadedReservation.ok) {
      return failure(503, [
        issue(
          "idempotency_key",
          "idempotency_unavailable",
          "Booking idempotency could not be verified safely.",
        ),
      ]);
    }

    reservation = loadedReservation.data;
  }

  return failure(409, [
    issue(
      "idempotency_key",
      "idempotency_in_progress",
      "An identical confirmed booking request is still being processed.",
    ),
  ]);
}

export async function createConfirmedAdminBooking(
  value: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  dependencyOverrides: Partial<ConfirmedAdminBookingCreateDependencies> = {},
): Promise<ConfirmedAdminBookingCreateResult> {
  const dependencies = {
    ...defaultDependencies,
    ...dependencyOverrides,
  };
  const envelope = asRecord(value);
  const unknownFields = Object.keys(envelope).filter((field) => !allowedEnvelopeFields.has(field));

  if (unknownFields.length > 0) {
    return failure(400, unknownFields.map((field) =>
      issue(field, "unknown_request_field", `Unknown confirmed booking field rejected: ${field}.`),
    ));
  }

  if (envelope.request_source !== confirmedChatGptBookingRequestSource) {
    return failure(400, [
      issue("request_source", "invalid_request_source", "Confirmed booking request source is invalid."),
    ]);
  }

  const idempotencyKey = validIdempotencyKey(envelope.idempotency_key);

  if (!idempotencyKey) {
    return failure(400, [
      issue(
        "idempotency_key",
        "invalid_idempotency_key",
        "A unique idempotency value of at least 16 safe characters is required.",
      ),
    ]);
  }

  const previewInput = envelope.booking_preview;
  const normalized = normalizeChatGptBookingPreview(previewInput);

  if (!normalized.ok || !normalized.canonical_payload || !normalized.preview) {
    return failure(400, [
      ...normalized.validation_issues,
      ...normalized.missing_required_fields.map((field) =>
        issue(field, "missing_required_field", `Missing required booking field: ${field}.`),
      ),
    ]);
  }

  const confirmation = verifyAdminBookingConfirmationToken(
    envelope.confirmation_token,
    normalized.canonical_payload,
    normalized.preview,
    previewInput,
    dependencies.now(),
  );

  if (!confirmation.ok) {
    return failure(400, [
      issue("confirmation_token", confirmation.code, confirmation.message),
    ]);
  }

  const recalculatedPayloadHash = adminBookingConfirmedPayloadHash(
    normalized.canonical_payload,
    normalized.preview,
    previewInput,
  );

  if (confirmation.payload_hash !== recalculatedPayloadHash) {
    return failure(400, [
      issue(
        "confirmation_token",
        "confirmation_payload_mismatch",
        "Booking details changed after confirmation. Review and confirm the preview again.",
      ),
    ]);
  }

  const keyHash = sha256(idempotencyKey);
  const ownerTokenHash = sha256(dependencies.randomBytes(32).toString("base64url"));
  const claimInput: AdminBookingIdempotencyClaimInput = {
    booking_reference: bookingReference(dependencies.now(), dependencies.randomBytes(16)),
    idempotency_key_hash: keyHash,
    owner_token_hash: ownerTokenHash,
    payload_hash: confirmation.payload_hash,
  };
  const claimed = await dependencies.claimReservation(claimInput, actor);

  if (!claimed.ok) {
    return failure(503, [
      issue(
        "idempotency_key",
        "idempotency_unavailable",
        "Booking idempotency could not be verified safely.",
      ),
    ]);
  }

  if (claimed.data.decision === "conflict") {
    return failure(409, [
      issue(
        "idempotency_key",
        "idempotency_payload_conflict",
        "This idempotency value was already used for different booking details.",
      ),
    ]);
  }

  if (claimed.data.decision === "completed") {
    const loaded = await loadCompletedBooking(
      actor,
      claimed.data.reservation.booking_reference,
      dependencies,
    );

    return loaded || failure(503, [
      issue(
        "idempotency_key",
        "idempotency_result_unavailable",
        "The existing booking could not be safely returned.",
      ),
    ]);
  }

  if (claimed.data.decision === "pending") {
    return waitForConcurrentBooking(
      actor,
      keyHash,
      confirmation.payload_hash,
      claimed.data.reservation,
      dependencies,
    );
  }

  const finalPayload = finalCanonicalPayload(
    normalized.canonical_payload,
    claimed.data.reservation.booking_reference,
  );

  if (!finalPayload.ok) {
    await dependencies.failReservation(claimInput, actor);
    return failure(400, [
      issue("booking_preview", "canonical_booking_validation_failed", finalPayload.error),
    ]);
  }

  const created = await dependencies.createBooking(finalPayload.data, actor, {
    action: "admin_booking_create",
    actor_label: actor.actor_label,
    change_summary:
      "Confirmed ChatGPT booking preview saved through the existing admin booking workflow.",
    source_route: "/api/admin-bookings",
  });

  if (!created.ok) {
    await dependencies.failReservation(claimInput, actor);
    return failure(503, [
      issue("booking_preview", "booking_create_failed", "Booking creation failed safely."),
    ]);
  }

  await dependencies.completeReservation(claimInput, actor);

  return success(created.data);
}

export function isConfirmedChatGptBookingRequest(request: Request) {
  return request.headers.get(confirmedChatGptBookingRequestHeader) === confirmedChatGptBookingRequestSource;
}

export function confirmedChatGptBookingAccessDeniedResponse(): ConfirmedAdminBookingCreateResult {
  return failure(403, [
    issue(
      "request",
      "booking_access_denied",
      "Confirmed booking creation is available only to the authorised admin surface.",
    ),
  ]);
}
