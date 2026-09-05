import "server-only";

import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import type { AdminBookingResult } from "./admin-booking-persistence";
import { sendDriverDevicePushAlertForDriverPoolOffer } from "./driver-device-push-notification";

export const driverPoolFeatureEnvName = "PRESTIGE_DRIVER_POOL_ENABLED";
export const driverPoolFastAcceptVersion = "driver-pool-fast-accept-v1";
export const driverPoolPublishRpcTimeoutMs = 10_000;

type UnknownRecord = Record<string, unknown>;
export type DriverPoolClient = Pick<SupabaseClient, "from" | "rpc">;

export function getDriverPoolClientForProduction():
  | { client: DriverPoolClient; ok: true }
  | { ok: false; reason: "not_configured" } {
  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED !== "true" || !url || !key) {
    return { ok: false, reason: "not_configured" };
  }
  try {
    return { client: createClient(url, key, { auth: { persistSession: false } }), ok: true };
  } catch {
    return { ok: false, reason: "not_configured" };
  }
}

export type DriverPoolOfferState = {
  closes_at: string;
  offer_key: string;
  offer_payout_sgd: number;
  offer_status: "open" | "assigned" | "cancelled" | "closed" | "expired";
  provider_accepted_driver_count: number;
  provider_attempted_driver_count: number;
  push_target_count: number;
  recipient_count: number;
  updated_at: string;
};

export type DriverPoolCancelResult = {
  assignment_cancelled: boolean;
  cancelled_driver_id: number | null;
  offer: DriverPoolOfferState;
  public_booking_reference: string | null;
};

export type DriverPoolAvailableJob = {
  closes_at: string;
  offer_key: string;
  offer_payout_sgd: number;
  pickup_at: string;
  public_booking_reference: string;
  safe_dropoff_area: string;
  safe_pickup_area: string;
  safe_trip_summary: string | null;
  safe_vehicle_label: string | null;
  updated_at: string;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asRows(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function text(value: unknown, maximum = 160): string | null {
  const clean = typeof value === "string" ? value.trim() : "";
  return clean && clean.length <= maximum ? clean : null;
}

function timestamp(value: unknown): string | null {
  const clean = text(value, 80);
  const parsed = clean ? new Date(clean) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function exactConcurrencyTimestamp(value: unknown): string | null {
  const clean = text(value, 80);
  const parsed = clean ? new Date(clean) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? clean : null;
}

function positiveMoney(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 99999.99
    ? Math.round(parsed * 100) / 100
    : null;
}

function idempotencyKey(value: unknown): string | null {
  const clean = text(value, 80)?.toLowerCase() || "";
  return /^[0-9a-f-]{32,80}$/.test(clean) ? clean : null;
}

function offerKey(value: unknown): string | null {
  const clean = text(value, 64)?.toLowerCase() || "";
  return /^[0-9a-f]{64}$/.test(clean) ? clean : null;
}

function bookingReference(value: unknown): string | null {
  const clean = text(value, 120) || "";
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(clean) ? clean : null;
}

function publicBookingReference(value: unknown): string | null {
  const clean = text(value, 18)?.toUpperCase() || "";
  return /^(?:[0-9]{5}|[A-Z0-9]{2,12}-[0-9]{5})$/.test(clean) ? clean : null;
}

function exactKeys(record: UnknownRecord, allowed: readonly string[]) {
  const safe = new Set(allowed);
  return Object.keys(record).every((key) => safe.has(key));
}

function positiveDriverIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export function driverPoolIsEnabled(env: Record<string, string | undefined> = process.env) {
  return ["1", "true", "enabled"].includes(
    (env[driverPoolFeatureEnvName] || "").trim().toLowerCase(),
  );
}

export function parseDriverPoolPublishPayload(value: unknown): AdminBookingResult<{
  booking_reference: string;
  expected_updated_at: string;
  idempotency_key: string;
  offer_payout_sgd: number;
}> {
  const record = asRecord(value);
  const reference = bookingReference(record.booking_reference);
  const expected = exactConcurrencyTimestamp(record.expected_updated_at);
  const payout = positiveMoney(record.offer_payout_sgd);
  const key = idempotencyKey(record.idempotency_key);
  if (!exactKeys(record, ["booking_reference", "expected_updated_at", "offer_payout_sgd", "idempotency_key"]) ||
      !reference || !expected || !payout || !key) {
    return { error: "Malformed Driver Pool offer rejected.", ok: false, status: 400 };
  }
  return { data: { booking_reference: reference, expected_updated_at: expected, idempotency_key: key, offer_payout_sgd: payout }, ok: true };
}

export function parseDriverPoolCancelPayload(value: unknown): AdminBookingResult<{
  expected_updated_at: string;
  offer_key: string;
}> {
  const record = asRecord(value);
  const key = offerKey(record.offer_key);
  const expected = exactConcurrencyTimestamp(record.expected_updated_at);
  return exactKeys(record, ["offer_key", "expected_updated_at"]) && key && expected
    ? { data: { expected_updated_at: expected, offer_key: key }, ok: true }
    : { error: "Malformed Driver Pool cancellation rejected.", ok: false, status: 400 };
}

export function parseDriverPoolDecisionPayload(value: unknown): AdminBookingResult<{
  expected_updated_at: string;
  idempotency_key: string;
  offer_key: string;
}> {
  const record = asRecord(value);
  const key = offerKey(record.offer_key);
  const expected = exactConcurrencyTimestamp(record.expected_updated_at);
  const idempotency = idempotencyKey(record.idempotency_key);
  return exactKeys(record, ["offer_key", "expected_updated_at", "idempotency_key"]) && key && expected && idempotency
    ? { data: { expected_updated_at: expected, idempotency_key: idempotency, offer_key: key }, ok: true }
    : { error: "Malformed Driver Pool decision rejected.", ok: false, status: 400 };
}

function mapOffer(row: UnknownRecord): DriverPoolOfferState | null {
  const key = offerKey(row.offer_key);
  const payout = positiveMoney(row.offer_payout_sgd);
  const closesAt = timestamp(row.closes_at);
  const updatedAt = exactConcurrencyTimestamp(row.updated_at);
  const status = text(row.offer_status, 20);
  const recipients = Number(row.recipient_count);
  const targets = Number(row.push_target_count);
  if (!key || !payout || !closesAt || !updatedAt ||
      !["open", "assigned", "cancelled", "closed", "expired"].includes(status || "") ||
      !Number.isSafeInteger(recipients) || recipients < 0 ||
      !Number.isSafeInteger(targets) || targets < 0 || targets > recipients) return null;
  return {
    closes_at: closesAt,
    offer_key: key,
    offer_payout_sgd: payout,
    offer_status: status === "open" && new Date(closesAt).getTime() <= Date.now()
      ? "expired"
      : status as DriverPoolOfferState["offer_status"],
    provider_accepted_driver_count: 0,
    provider_attempted_driver_count: 0,
    push_target_count: targets,
    recipient_count: recipients,
    updated_at: updatedAt,
  };
}

function classify(error: unknown) {
  const record = asRecord(error);
  const message = String(record.message || "").toLowerCase();
  const code = String(record.code || "");
  if (code === "40001" || message.includes("changed")) return { status: 409, error: "Driver Pool state changed. Reload and try again." };
  if (code === "23505" || message.includes("already has")) return { status: 409, error: "This booking already has an open Driver Pool offer." };
  if (code === "P0002") return { status: 404, error: "Driver Pool record was not found." };
  if (code === "22023") return { status: 409, error: text(record.message, 300) || "Driver Pool action is not allowed." };
  if (code === "42501") return { status: 403, error: "Driver Pool action is not authorized." };
  return { status: 503, error: "Driver Pool is temporarily unavailable." };
}

function safeDiagnosticCode(error: unknown): string {
  const code = text(asRecord(error).code, 40) || "";
  return /^[A-Za-z0-9_-]+$/.test(code) ? code : "UNAVAILABLE";
}

function safeDiagnosticStatus(value: unknown): number {
  const status = Number(value);
  return Number.isSafeInteger(status) && status >= 0 && status <= 599 ? status : 0;
}

function logPublishRpcFailure(input: {
  correlationId: string;
  elapsedMs: number;
  error: unknown;
  status: unknown;
  timedOut: boolean;
}) {
  console.error("driver_pool_publish_rpc_failure", {
    code: input.timedOut ? "LOCAL_TIMEOUT" : safeDiagnosticCode(input.error),
    correlation_id: input.correlationId,
    elapsed_ms: Math.max(0, Math.round(input.elapsedMs)),
    outcome: input.timedOut ? "timeout" : "upstream_error",
    rpc: "publish_driver_pool_offer",
    status: safeDiagnosticStatus(input.status),
  });
}

function actorIsValid(actor: AdminBookingPersistenceAdapterActor) {
  return ["admin", "dispatcher"].includes(actor.actor_role) &&
    actor.boundary_mode === "server-session-role-surface" &&
    actor.source_surface === "admin_api" && Boolean(text(actor.actor_label));
}

export async function publishDriverPoolOffer(
  client: DriverPoolClient,
  input: ReturnType<typeof parseDriverPoolPublishPayload> extends AdminBookingResult<infer T> ? T : never,
  actor: AdminBookingPersistenceAdapterActor,
): Promise<AdminBookingResult<DriverPoolOfferState>> {
  if (!driverPoolIsEnabled()) return { error: "Driver Pool is not enabled.", ok: false, status: 503 };
  if (!actorIsValid(actor)) return { error: "Verified Admin or Dispatcher required.", ok: false, status: 403 };
  const correlationId = randomUUID();
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), driverPoolPublishRpcTimeoutMs);
  let data: unknown = null;
  let error: unknown = null;
  let status: unknown = 0;
  try {
    ({ data, error, status } = await client.rpc("publish_driver_pool_offer", {
      p_actor_label: actor.actor_label,
      p_actor_role: actor.actor_role,
      p_booking_reference: input.booking_reference,
      p_expected_updated_at: input.expected_updated_at,
      p_idempotency_key: input.idempotency_key,
      p_offer_payout_sgd: input.offer_payout_sgd,
    }).abortSignal(controller.signal));
  } catch (caught) {
    error = caught;
  } finally {
    clearTimeout(timeout);
  }
  if (error) {
    const timedOut = controller.signal.aborted;
    logPublishRpcFailure({ correlationId, elapsedMs: Date.now() - startedAt, error, status, timedOut });
    if (timedOut) {
      return {
        error: "Driver Pool publish timed out before confirmation. Reload this booking to check for an open offer before trying again.",
        ok: false,
        status: 504,
      };
    }
    const failure = classify(error);
    return { ...failure, ok: false };
  }
  const result = asRecord(data);
  const offer = mapOffer(asRecord(result.offer));
  if (!offer) return { error: "Driver Pool returned an invalid safe result.", ok: false, status: 503 };
  if (result.idempotent !== true) {
    const ids = Array.isArray(result.recipient_driver_ids)
      ? result.recipient_driver_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
      : [];
    const sends = await Promise.all(ids.map((driverId) =>
      sendDriverDevicePushAlertForDriverPoolOffer(client, { driver_id: driverId, offer_key: offer.offer_key })
    ));
    offer.provider_attempted_driver_count = sends.filter((send) => send.provider_request_count > 0).length;
    offer.provider_accepted_driver_count = sends.filter((send) => send.ok).length;
  }
  return { data: offer, ok: true };
}

export async function loadAdminDriverPoolOffer(client: DriverPoolClient, reference: string) {
  if (!driverPoolIsEnabled()) return { data: { eligible: false, enabled: false, offer: null }, ok: true } as const;
  const exact = bookingReference(reference);
  if (!exact) return { error: "Malformed booking reference.", ok: false, status: 400 } as const;
  const [{ data, error }, { data: bookingData, error: bookingError }] = await Promise.all([
    client.from("driver_job_bid_offers")
      .select("offer_key,offer_status,offer_payout_sgd,recipient_count,push_target_count,closes_at,updated_at")
      .eq("booking_reference", exact).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("bookings")
      .select("driver_id,public_booking_reference,pickup_at,admin_internal_status,customer_facing_status")
      .eq("booking_reference", exact).maybeSingle(),
  ]);
  if (error || bookingError) { const failure = classify(error || bookingError); return { ...failure, ok: false } as const; }
  const offer = data ? mapOffer(asRecord(data)) : null;
  const booking = asRecord(bookingData);
  const adminStatus = String(booking.admin_internal_status || "").trim().toLowerCase();
  const customerStatus = String(booking.customer_facing_status || "").trim().toLowerCase();
  const pickupAt = timestamp(booking.pickup_at);
  const publicReference = text(booking.public_booking_reference, 120);
  const eligible = Boolean(
    bookingData &&
    publicReference &&
    booking.driver_id === null &&
    pickupAt && new Date(pickupAt).getTime() > Date.now() &&
    !["cancelled", "completed", "archived", "deleted"].includes(adminStatus) &&
    !["cancelled", "completed"].includes(customerStatus),
  );
  return { data: { eligible, enabled: true, offer }, ok: true } as const;
}

export async function cancelDriverPoolOffer(client: DriverPoolClient, input: { offer_key: string; expected_updated_at: string }, actor: AdminBookingPersistenceAdapterActor) {
  if (!driverPoolIsEnabled()) return { error: "Driver Pool is not enabled.", ok: false, status: 503 } as const;
  if (!actorIsValid(actor)) return { error: "Verified Admin or Dispatcher required.", ok: false, status: 403 } as const;
  const { data, error } = await client.rpc("cancel_driver_pool_offer", {
    p_actor_label: actor.actor_label, p_actor_role: actor.actor_role,
    p_expected_updated_at: input.expected_updated_at, p_offer_key: input.offer_key,
  });
  if (error) { const failure = classify(error); return { ...failure, ok: false } as const; }
  const result = asRecord(data);
  // Keep the existing open-offer cancellation response compatible during the
  // narrow migration/deployment handoff. The prior RPC returns the offer row
  // directly; the new atomic assignment cancellation wraps it in `offer`.
  const offer = mapOffer(asRecord(result.offer)) ?? mapOffer(result);
  if (!offer) return { error: "Driver Pool returned an invalid safe result.", ok: false, status: 503 } as const;
  const cancelledDriverId = result.assignment_cancelled === true
    ? positiveDriverIds([result.cancelled_driver_id])[0] ?? null
    : null;
  return {
    data: {
      assignment_cancelled: result.assignment_cancelled === true,
      cancelled_driver_id: cancelledDriverId,
      offer,
      public_booking_reference: publicBookingReference(result.public_booking_reference),
    } satisfies DriverPoolCancelResult,
    ok: true,
  } as const;
}

export async function loadAvailableDriverPoolJobs(client: DriverPoolClient, driverId: number, page: number, limit: number) {
  if (!driverPoolIsEnabled()) return { data: { enabled: false, has_more: false, jobs: [] as DriverPoolAvailableJob[] }, ok: true } as const;
  const boundedPage = Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1;
  const boundedLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 20 ? limit : 20;
  const { data, error } = await client.rpc("list_driver_pool_available_jobs", {
    p_driver_id: driverId,
    p_limit: boundedLimit,
    p_page: boundedPage,
  });
  if (error) return { error: "Available Jobs could not be loaded.", ok: false, status: 503 } as const;
  const result = asRecord(data);
  const mapped = asRows(result.jobs).map((row): DriverPoolAvailableJob | null => {
    const key = offerKey(row.offer_key); const payout = positiveMoney(row.offer_payout_sgd);
    const pickup = timestamp(row.pickup_at); const closes = timestamp(row.closes_at); const updated = exactConcurrencyTimestamp(row.updated_at);
    const publicRef = text(row.public_booking_reference, 120);
    if (!key || !payout || !pickup || !closes || !updated || !publicRef) return null;
    return { offer_key: key, public_booking_reference: publicRef, offer_payout_sgd: payout,
      pickup_at: pickup, closes_at: closes, safe_pickup_area: text(row.safe_pickup_area) || "Available after assignment",
      safe_dropoff_area: text(row.safe_dropoff_area) || "Available after assignment",
      safe_vehicle_label: text(row.safe_vehicle_label, 120), safe_trip_summary: text(row.safe_trip_summary, 120), updated_at: updated };
  }).filter((job): job is DriverPoolAvailableJob => Boolean(job));
  return { data: { enabled: true, has_more: result.has_more === true, jobs: mapped }, ok: true } as const;
}

export async function decideDriverPoolOffer(client: DriverPoolClient, driverId: number, input: { offer_key: string; expected_updated_at: string; idempotency_key: string }, action: "accept" | "decline") {
  if (!driverPoolIsEnabled()) return { error: "Driver Pool is not enabled.", ok: false, status: 503 } as const;
  const { data, error } = await client.rpc(action === "accept" ? "accept_driver_pool_offer" : "decline_driver_pool_offer", {
    p_driver_id: driverId, p_expected_updated_at: input.expected_updated_at,
    p_idempotency_key: input.idempotency_key, p_offer_key: input.offer_key,
  });
  if (error) { const failure = classify(error); return { ...failure, ok: false } as const; }
  const result = asRecord(data);
  const reason = text(result.reason, 80) || "no_longer_available";
  const otherRecipientDriverIds = reason === "accepted"
    ? positiveDriverIds(result.other_recipient_driver_ids).filter((id) => id !== driverId)
    : [];
  return {
    data: {
      accepted: reason === "accepted" || reason === "already_accepted",
      other_recipient_driver_ids: otherRecipientDriverIds,
      public_booking_reference: publicBookingReference(result.public_booking_reference),
      reason,
    },
    ok: true,
  } as const;
}
