import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingResult } from "./admin-booking-persistence";
import {
  getServerOnlySupabaseClient,
  type AdminBookingPersistenceAdapterActor,
} from "./admin-booking-supabase-adapter";

const reservationTable = "admin_booking_idempotency_reservations";
const reservationSelect =
  "idempotency_key_hash, payload_hash, booking_reference, state, owner_token_hash, updated_at, completed_at";
const safeReservationError = "Confirmed booking idempotency reservation failed safely.";

export type AdminBookingIdempotencyReservation = {
  booking_reference: string;
  completed_at: string | null;
  idempotency_key_hash: string;
  owner_token_hash: string;
  payload_hash: string;
  state: "pending" | "completed" | "failed";
  updated_at: string;
};

export type AdminBookingIdempotencyClaimDecision =
  | "claimed"
  | "completed"
  | "conflict"
  | "pending";

export type AdminBookingIdempotencyClaimInput = {
  booking_reference: string;
  idempotency_key_hash: string;
  owner_token_hash: string;
  payload_hash: string;
};

export type AdminBookingIdempotencyClaimResult = AdminBookingResult<{
  decision: AdminBookingIdempotencyClaimDecision;
  reservation: AdminBookingIdempotencyReservation;
}>;

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function text(value: unknown, maxLength = 200) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validHash(value: unknown) {
  const clean = text(value, 64).toLowerCase();

  return /^[a-f0-9]{64}$/.test(clean) ? clean : null;
}

function validBookingReference(value: unknown) {
  const clean = text(value, 80);

  return /^[A-Z0-9][A-Z0-9-]{5,79}$/.test(clean) ? clean : null;
}

function uniqueViolation(error: unknown) {
  return text(asRecord(error).code, 20).toLowerCase() === "23505";
}

function safeFailure<T>(): AdminBookingResult<T> {
  return {
    error: safeReservationError,
    ok: false,
    status: 503,
  };
}

function reservationFromRow(value: unknown): AdminBookingIdempotencyReservation | null {
  const row = asRecord(value);
  const keyHash = validHash(row.idempotency_key_hash);
  const payloadHash = validHash(row.payload_hash);
  const ownerTokenHash = validHash(row.owner_token_hash);
  const bookingReference = validBookingReference(row.booking_reference);
  const state = text(row.state, 20);
  const updatedAt = text(row.updated_at, 80);

  if (
    !keyHash ||
    !payloadHash ||
    !ownerTokenHash ||
    !bookingReference ||
    !["pending", "completed", "failed"].includes(state) ||
    !updatedAt ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    return null;
  }

  return {
    booking_reference: bookingReference,
    completed_at: text(row.completed_at, 80) || null,
    idempotency_key_hash: keyHash,
    owner_token_hash: ownerTokenHash,
    payload_hash: payloadHash,
    state: state as AdminBookingIdempotencyReservation["state"],
    updated_at: updatedAt,
  };
}

function claimDecision(
  reservation: AdminBookingIdempotencyReservation,
  payloadHash: string,
): AdminBookingIdempotencyClaimDecision {
  if (reservation.payload_hash !== payloadHash) {
    return "conflict";
  }

  return reservation.state === "completed" ? "completed" : "pending";
}

async function loadReservationWithClient(
  client: SupabaseClient,
  keyHash: string,
) {
  const { data, error } = await client
    .from(reservationTable)
    .select(reservationSelect)
    .eq("idempotency_key_hash", keyHash)
    .limit(1)
    .maybeSingle();
  const reservation = reservationFromRow(data);

  return error || !reservation ? null : reservation;
}

export async function loadAdminBookingIdempotencyReservation(
  idempotencyKeyHash: string,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<AdminBookingIdempotencyReservation>> {
  const keyHash = validHash(idempotencyKeyHash);
  const clientResult = getServerOnlySupabaseClient(actor);

  if (!keyHash || !clientResult.ok) {
    return clientResult.ok ? safeFailure() : clientResult;
  }

  const reservation = await loadReservationWithClient(clientResult.data, keyHash);

  return reservation ? { data: reservation, ok: true } : safeFailure();
}

export async function claimAdminBookingIdempotencyReservation(
  input: AdminBookingIdempotencyClaimInput,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingIdempotencyClaimResult> {
  const keyHash = validHash(input.idempotency_key_hash);
  const payloadHash = validHash(input.payload_hash);
  const ownerTokenHash = validHash(input.owner_token_hash);
  const bookingReference = validBookingReference(input.booking_reference);
  const clientResult = getServerOnlySupabaseClient(actor);

  if (!keyHash || !payloadHash || !ownerTokenHash || !bookingReference || !clientResult.ok) {
    return clientResult.ok ? safeFailure() : clientResult;
  }

  const client = clientResult.data;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from(reservationTable)
    .insert({
      booking_reference: bookingReference,
      idempotency_key_hash: keyHash,
      owner_token_hash: ownerTokenHash,
      payload_hash: payloadHash,
      state: "pending",
      updated_at: now,
    })
    .select(reservationSelect)
    .maybeSingle();
  const inserted = reservationFromRow(data);

  if (!error && inserted) {
    return {
      data: {
        decision: "claimed",
        reservation: inserted,
      },
      ok: true,
    };
  }

  if (!uniqueViolation(error)) {
    return safeFailure();
  }

  let existing = await loadReservationWithClient(client, keyHash);

  if (!existing) {
    return safeFailure();
  }

  if (existing.payload_hash !== payloadHash) {
    return {
      data: {
        decision: "conflict",
        reservation: existing,
      },
      ok: true,
    };
  }

  if (existing.state === "failed") {
    const { data: reclaimedData, error: reclaimError } = await client
      .from(reservationTable)
      .update({
        completed_at: null,
        owner_token_hash: ownerTokenHash,
        state: "pending",
        updated_at: now,
      })
      .eq("idempotency_key_hash", keyHash)
      .eq("payload_hash", payloadHash)
      .eq("owner_token_hash", existing.owner_token_hash)
      .eq("state", "failed")
      .select(reservationSelect)
      .maybeSingle();
    const reclaimed = reservationFromRow(reclaimedData);

    if (!reclaimError && reclaimed) {
      return {
        data: {
          decision: "claimed",
          reservation: reclaimed,
        },
        ok: true,
      };
    }

    existing = await loadReservationWithClient(client, keyHash);

    if (!existing) {
      return safeFailure();
    }
  }

  return {
    data: {
      decision: claimDecision(existing, payloadHash),
      reservation: existing,
    },
    ok: true,
  };
}

async function updateOwnedReservationState(
  input: AdminBookingIdempotencyClaimInput,
  actor: AdminBookingPersistenceAdapterActor,
  state: "completed" | "failed",
): Promise<AdminBookingResult<AdminBookingIdempotencyReservation>> {
  const keyHash = validHash(input.idempotency_key_hash);
  const payloadHash = validHash(input.payload_hash);
  const ownerTokenHash = validHash(input.owner_token_hash);
  const clientResult = getServerOnlySupabaseClient(actor);

  if (!keyHash || !payloadHash || !ownerTokenHash || !clientResult.ok) {
    return clientResult.ok ? safeFailure() : clientResult;
  }

  const now = new Date().toISOString();
  const { data, error } = await clientResult.data
    .from(reservationTable)
    .update({
      completed_at: state === "completed" ? now : null,
      state,
      updated_at: now,
    })
    .eq("idempotency_key_hash", keyHash)
    .eq("payload_hash", payloadHash)
    .eq("owner_token_hash", ownerTokenHash)
    .eq("state", "pending")
    .select(reservationSelect)
    .maybeSingle();
  const reservation = reservationFromRow(data);

  if (!error && reservation) {
    return { data: reservation, ok: true };
  }

  const existing = await loadReservationWithClient(clientResult.data, keyHash);

  return existing && existing.payload_hash === payloadHash && existing.state === state
    ? { data: existing, ok: true }
    : safeFailure();
}

export async function completeAdminBookingIdempotencyReservation(
  input: AdminBookingIdempotencyClaimInput,
  actor: AdminBookingPersistenceAdapterActor,
) {
  return updateOwnedReservationState(input, actor, "completed");
}

export async function failAdminBookingIdempotencyReservation(
  input: AdminBookingIdempotencyClaimInput,
  actor: AdminBookingPersistenceAdapterActor,
) {
  return updateOwnedReservationState(input, actor, "failed");
}
