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

export type DriverPoolAdminResponse = {
  driver_id: number;
  driver_name: string;
  plate_number: string;
  vehicle_type: string;
  status: "pending" | "available" | "declined" | "accepted" | "closed";
};

export type DriverPoolAssignmentState = {
  driver_name: string;
  plate_number: string;
  can_cancel: boolean;
  blocked_reason: string | null;
  has_job_link: boolean;
};

export type DriverPoolOfferState = {
  assignment?: DriverPoolAssignmentState;
  selection_mode: "admin" | "first_accept";
  audience: "selected" | "wider";
  responses?: DriverPoolAdminResponse[];
  closes_at: string;
  offer_key: string;
  offer_payout_sgd: number;
  offer_status: "open" | "assigned" | "cancelled" | "closed" | "expired";
  provider_accepted_driver_count: number;
  provider_attempted_driver_count: number;
  push_target_count: number;
  recipient_count: number;
  safe_vehicle_label: string | null;
  updated_at: string;
};

export type AdminDriverPoolAttentionItem = DriverPoolOfferState & {
  attention_status: "accepted_link_pending" | "open";
  booking_reference: string;
  pickup_at: string;
  public_booking_reference: string;
};

export type DriverPoolCancelResult = {
  assignment_cancelled: boolean;
  cancelled_driver_id: number | null;
  offer: DriverPoolOfferState;
  public_booking_reference: string | null;
};

export type DriverPoolAvailableJob = {
  selection_mode: "admin" | "first_accept";
  response_status: "pending" | "awaiting_admin";
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

function safeDriverPlate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const plate = value.trim().replace(/\s+/g, " ").toUpperCase();
  return plate && plate.length <= 20 && /\d/.test(plate) && /^[A-Z0-9][A-Z0-9 -]{0,19}$/.test(plate)
    ? plate
    : null;
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
  vehicle_requirement: string;
  selected_driver_ids: number[];
}> {
  const record = asRecord(value);
  const reference = bookingReference(record.booking_reference);
  const expected = exactConcurrencyTimestamp(record.expected_updated_at);
  const payout = positiveMoney(record.offer_payout_sgd);
  const key = idempotencyKey(record.idempotency_key);
  const vehicle = record.vehicle_requirement;
  const ids = record.selected_driver_ids;
  const allDrivers = record.audience === "wider";
  const validAudience = record.audience === undefined || record.audience === "selected" || allDrivers;
  const validIds = Array.isArray(ids) && ids.length >= 1 && ids.length <= 10 &&
    ids.every((id) => typeof id === "number" && Number.isSafeInteger(id) && id > 0) && new Set(ids).size === ids.length;
  if (!exactKeys(record, ["booking_reference", "expected_updated_at", "offer_payout_sgd", "idempotency_key", "vehicle_requirement", "selected_driver_ids", "audience"]) ||
      !reference || !expected || !payout || !key || !validAudience ||
      !(allDrivers ? Array.isArray(ids) && ids.length === 0 : validIds) ||
      typeof vehicle !== "string" || !["E / AVF", "AVF", "S", "VVV", "COMBI"].includes(vehicle)) {
    return { error: "Malformed Driver Pool offer rejected.", ok: false, status: 400 };
  }
  return { data: { booking_reference: reference, expected_updated_at: expected, idempotency_key: key, offer_payout_sgd: payout, vehicle_requirement: vehicle, selected_driver_ids: (ids as number[]).slice().sort((a, b) => a - b) }, ok: true };
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

export function parseDriverPoolAdminActionPayload(value: unknown): AdminBookingResult<{
  action: "award" | "widen";
  offer_key: string;
  expected_updated_at: string;
  idempotency_key: string;
  driver_id?: number;
  booking_reference?: string;
  offer_payout_sgd?: number;
  vehicle_requirement?: string;
}> {
  const record = asRecord(value);
  const decision = parseDriverPoolDecisionPayload({ offer_key: record.offer_key, expected_updated_at: record.expected_updated_at, idempotency_key: record.idempotency_key });
  if (!decision.ok) return decision;
  if (record.action === "award" && exactKeys(record, ["action", "offer_key", "expected_updated_at", "idempotency_key", "driver_id"]) &&
      typeof record.driver_id === "number" && Number.isSafeInteger(record.driver_id) && record.driver_id > 0) {
    return { ok: true, data: { ...decision.data, action: "award", driver_id: record.driver_id } };
  }
  const reference = bookingReference(record.booking_reference);
  const payout = positiveMoney(record.offer_payout_sgd);
  if (record.action === "widen" && exactKeys(record, ["action", "offer_key", "expected_updated_at", "idempotency_key", "booking_reference", "offer_payout_sgd", "vehicle_requirement"]) &&
      reference && payout && typeof record.vehicle_requirement === "string" && ["E / AVF", "AVF", "S", "VVV", "COMBI"].includes(record.vehicle_requirement)) {
    return { ok: true, data: { ...decision.data, action: "widen", booking_reference: reference, offer_payout_sgd: payout, vehicle_requirement: record.vehicle_requirement } };
  }
  return { ok: false, error: "Malformed Driver Pool Admin action rejected.", status: 400 };
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

export function parseDriverPoolAttentionQuery(params: URLSearchParams): AdminBookingResult<{
  limit: number;
  page: number;
}> {
  const allowed = new Set(["limit", "page", "scope"]);
  const keys = [...params.keys()];
  const pageText = params.get("page") || "1";
  const limitText = params.get("limit") || "20";
  const page = Number(pageText);
  const limit = Number(limitText);
  const valid = params.get("scope") === "attention" &&
    keys.every((key) => allowed.has(key)) &&
    [...allowed].every((key) => params.getAll(key).length <= 1) &&
    /^[1-9][0-9]*$/.test(pageText) &&
    /^[1-9][0-9]*$/.test(limitText) &&
    Number.isSafeInteger(page) && page <= 1000 &&
    Number.isSafeInteger(limit) && limit <= 20;

  return valid
    ? { data: { limit, page }, ok: true }
    : { error: "Malformed Driver Pool pending-list request.", ok: false, status: 400 };
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
    selection_mode: "first_accept",
    audience: asRecord(row.safe_offer_context).audience === "selected" ? "selected" : "wider",
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
    safe_vehicle_label: text(row.safe_vehicle_label, 40),
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
  input: { booking_reference: string; expected_updated_at: string; idempotency_key: string; offer_payout_sgd: number;
    vehicle_requirement: string; selected_driver_ids?: number[]; offer_key?: string },
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
      p_vehicle_requirement: input.vehicle_requirement,
      p_selected_driver_ids: input.selected_driver_ids ?? null,
      p_offer_key: input.offer_key ?? null,
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

// Read-only explanation of the existing cancellation RPC preconditions.
// The RPC still rechecks every condition under lock when Admin confirms.
function assignmentState(offer: DriverPoolOfferState, booking: UnknownRecord, hasLink: boolean, hasReport: boolean, winningDriver: unknown): DriverPoolAssignmentState {
  let blockedReason: string | null = null;
  if (!booking.driver_id || String(booking.driver_id) !== String(winningDriver)) {
    blockedReason = "The saved driver no longer matches this offer. Review the booking's Assigned Driver details.";
  } else if (["cancelled", "completed", "archived", "deleted"].includes(String(booking.admin_internal_status || "").trim().toLowerCase()) ||
    ["cancelled", "completed"].includes(String(booking.customer_facing_status || "").trim().toLowerCase())) {
    blockedReason = "This booking is already closed. Review it in Bookings; this Pool assignment cannot be cancelled here.";
  } else if (hasLink || hasReport) {
    blockedReason = hasReport
      ? "The driver has reported on this job. Review Driver Reports and coordinate with the driver before changing the assignment."
      : "A Job Link has already been created. Review the existing Driver Job Link and coordinate with the driver before changing the assignment. Revoking a link alone does not cancel the assignment.";
  } else if (booking.updated_at !== offer.updated_at || Number(booking.driver_payout_override) !== offer.offer_payout_sgd ||
    String(booking.driver_payout_reason || "").trim() !== "Driver Pool accepted fixed offer.") {
    blockedReason = "This booking changed after acceptance. Review the saved Assigned Driver details; automatic Pool cancellation is blocked.";
  }
  return { driver_name: text(booking.driver_name) || "Driver details unavailable", plate_number: safeDriverPlate(booking.driver_plate_number) || "Plate unavailable",
    can_cancel: blockedReason === null, blocked_reason: blockedReason, has_job_link: hasLink };
}

export async function loadAdminDriverPoolOffer(client: DriverPoolClient, reference: string) {
  if (!driverPoolIsEnabled()) return { data: { eligible: false, enabled: false, offer: null }, ok: true } as const;
  const exact = bookingReference(reference);
  if (!exact) return { error: "Malformed booking reference.", ok: false, status: 400 } as const;
  const [{ data, error }, { data: bookingData, error: bookingError }] = await Promise.all([
    client.from("driver_job_bid_offers")
      .select("id,offer_key,offer_status,offer_payout_sgd,recipient_count,push_target_count,closes_at,updated_at,safe_vehicle_label,safe_offer_context")
      .eq("booking_reference", exact).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    client.from("bookings")
      .select("driver_id,public_booking_reference,pickup_at,admin_internal_status,customer_facing_status,driver_name,driver_plate_number,driver_payout_override,driver_payout_reason,updated_at")
      .eq("booking_reference", exact).maybeSingle(),
  ]);
  if (error || bookingError) { const failure = classify(error || bookingError); return { ...failure, ok: false } as const; }
  const offer = data ? mapOffer(asRecord(data)) : null;
  if (offer?.selection_mode === "admin") {
    const responses: DriverPoolAdminResponse[] = [];
    // Read every exact-offer response in bounded pages, using the established six safe Driver fields.
    for (let offset = 0; ; offset += 100) {
      const { data: bids, error: bidError } = await client.from("driver_job_bids")
        .select("driver_reference,bid_status,safe_bid_context").eq("driver_job_bid_offer_id", asRecord(data).id)
        .order("driver_reference", { ascending: true }).range(offset, offset + 99);
      if (bidError) return { ...classify(bidError), ok: false } as const;
      const rows = asRows(bids);
      const ids = positiveDriverIds(rows.map((bid) => bid.driver_reference));
      if (ids.length !== rows.length) return { error: "Driver Pool responses require review.", ok: false, status: 503 } as const;
      if (ids.length) {
        const { data: drivers, error: driverError } = await client.from("drivers")
          .select("id,driver_name,plate_number,vehicle_type").in("id", ids).limit(100);
        if (driverError) return { ...classify(driverError), ok: false } as const;
        const byId = new Map(asRows(drivers).map((driver) => [Number(driver.id), driver]));
        for (const bid of rows) {
          const driverId = Number(bid.driver_reference);
          const driver = byId.get(driverId) || {};
          const status = bid.bid_status === "pending"
            ? asRecord(bid.safe_bid_context).response === "available" ? "available" : "pending"
            : bid.bid_status === "declined" ? "declined" : bid.bid_status === "accepted" ? "accepted" : "closed";
          responses.push({ driver_id: driverId, driver_name: text(driver.driver_name) || "Driver unavailable",
            plate_number: text(driver.plate_number, 40) || "Plate unavailable", vehicle_type: text(driver.vehicle_type, 80) || "Vehicle unavailable", status });
        }
      }
      if (rows.length < 100) break;
    }
    offer.responses = responses;
  }
  const booking = asRecord(bookingData);
  if (offer?.offer_status === "assigned") {
    const [links, reports, bids] = await Promise.all([
      client.from("driver_job_links").select("booking_reference").eq("booking_reference", exact).limit(1),
      client.from("driver_job_status_events").select("booking_reference").eq("booking_reference", exact).limit(1),
      client.from("driver_job_bids").select("driver_reference").eq("driver_job_bid_offer_id", asRecord(data).id).eq("bid_status", "accepted").limit(2),
    ]);
    if (links.error || reports.error || bids.error) return { ...classify(links.error || reports.error || bids.error), ok: false } as const;
    const winners = asRows(bids.data);
    offer.assignment = assignmentState(offer, booking, asRows(links.data).length > 0, asRows(reports.data).length > 0, winners.length === 1 ? winners[0].driver_reference : null);
  }
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

export async function loadAdminDriverPoolAttentionOffers(
  client: DriverPoolClient,
  page: number,
  limit: number,
) {
  if (!driverPoolIsEnabled()) {
    return {
      data: { enabled: false, has_more: false, items: [] as AdminDriverPoolAttentionItem[], page: 1 },
      ok: true,
    } as const;
  }

  const boundedPage = Number.isSafeInteger(page) && page > 0 && page <= 1000 ? page : 1;
  const boundedLimit = Number.isSafeInteger(limit) && limit > 0 && limit <= 20 ? limit : 20;
  const targetCount = boundedPage * boundedLimit + 1;
  const scanChunkSize = 100;
  const attentionItems: AdminDriverPoolAttentionItem[] = [];
  let rawOffset = 0;
  let rawRowsRemain = true;

  while (attentionItems.length < targetCount && rawRowsRemain) {
    const { data, error } = await client.from("driver_job_bid_offers")
      .select("id,booking_reference,public_booking_reference,offer_key,offer_status,offer_payout_sgd,recipient_count,push_target_count,pickup_at,closes_at,updated_at,safe_offer_context,safe_vehicle_label")
      .in("offer_status", ["open", "assigned"])
      .order("pickup_at", { ascending: true })
      .order("offer_key", { ascending: true })
      .range(rawOffset, rawOffset + scanChunkSize - 1);
    if (error) {
      const failure = classify(error);
      return { ...failure, ok: false } as const;
    }

    const rows = asRows(data);
    rawRowsRemain = rows.length === scanChunkSize;
    rawOffset += rows.length;

    const assignedReferences = [...new Set(rows
      .filter((row) => text(row.offer_status, 20) === "assigned")
      .map((row) => bookingReference(row.booking_reference))
      .filter((reference): reference is string => Boolean(reference)))];
    const linkedReferences = new Set<string>();
    const reportReferences = new Set<string>();
    const assignedBookings = new Map<string, UnknownRecord>();
    const winningDrivers = new Map<string, unknown>();

    if (assignedReferences.length > 0) {
      const [links, reports, bookings, bids] = await Promise.all([
        client.from("driver_job_links").select("booking_reference").in("booking_reference", assignedReferences).limit(scanChunkSize * 10),
        client.from("driver_job_status_events").select("booking_reference").in("booking_reference", assignedReferences).limit(scanChunkSize * 10),
        client.from("bookings").select("booking_reference,driver_id,driver_name,driver_plate_number,driver_payout_override,driver_payout_reason,updated_at,admin_internal_status,customer_facing_status").in("booking_reference", assignedReferences).limit(scanChunkSize),
        client.from("driver_job_bids").select("driver_job_bid_offer_id,driver_reference").in("driver_job_bid_offer_id", rows.filter((row) => row.offer_status === "assigned").map((row) => row.id)).eq("bid_status", "accepted").limit(scanChunkSize * 2),
      ]);
      const readError = links.error || reports.error || bookings.error || bids.error;
      if (readError) return { ...classify(readError), ok: false } as const;
      // Bounded reads must not accidentally label incomplete evidence cancellable.
      if (asRows(links.data).length >= scanChunkSize * 10 || asRows(reports.data).length >= scanChunkSize * 10 || asRows(bids.data).length >= scanChunkSize * 2) {
        return { error: "Driver Pool assignment evidence needs review. Open the exact booking.", ok: false, status: 503 } as const;
      }
      for (const link of asRows(links.data)) linkedReferences.add(String(link.booking_reference));
      for (const report of asRows(reports.data)) reportReferences.add(String(report.booking_reference));
      for (const booking of asRows(bookings.data)) assignedBookings.set(String(booking.booking_reference), booking);
      for (const bid of asRows(bids.data)) {
        const id = String(bid.driver_job_bid_offer_id);
        winningDrivers.set(id, winningDrivers.has(id) ? null : bid.driver_reference);
      }
    }

    for (const row of rows) {
      const offer = mapOffer(row);
      const exactBookingReference = bookingReference(row.booking_reference);
      const publicReference = publicBookingReference(row.public_booking_reference);
      const pickupAt = timestamp(row.pickup_at);
      if (!offer || !exactBookingReference || !publicReference || !pickupAt) continue;

      if (offer.offer_status === "open") {
        attentionItems.push({
          ...offer,
          attention_status: "open",
          booking_reference: exactBookingReference,
          pickup_at: pickupAt,
          public_booking_reference: publicReference,
        });
      } else if (
        offer.offer_status === "assigned" &&
        !linkedReferences.has(exactBookingReference)
      ) {
        attentionItems.push({
          ...offer,
          assignment: assignmentState(offer, assignedBookings.get(exactBookingReference) || {}, false, reportReferences.has(exactBookingReference), winningDrivers.get(String(row.id))),
          attention_status: "accepted_link_pending",
          booking_reference: exactBookingReference,
          pickup_at: pickupAt,
          public_booking_reference: publicReference,
        });
      }
    }
  }

  const start = (boundedPage - 1) * boundedLimit;
  return {
    data: {
      enabled: true,
      has_more: attentionItems.length > start + boundedLimit,
      items: attentionItems.slice(start, start + boundedLimit),
      page: boundedPage,
    },
    ok: true,
  } as const;
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
    return { selection_mode: row.selection_mode === "admin" ? "admin" : "first_accept",
      response_status: row.response_status === "awaiting_admin" ? "awaiting_admin" : "pending",
      offer_key: key, public_booking_reference: publicRef, offer_payout_sgd: payout,
      pickup_at: pickup, closes_at: closes, safe_pickup_area: text(row.safe_pickup_area) || "Available after assignment",
      safe_dropoff_area: text(row.safe_dropoff_area) || "Available after assignment",
      safe_vehicle_label: text(row.safe_vehicle_label, 120), safe_trip_summary: text(row.safe_trip_summary, 120), updated_at: updated };
  }).filter((job): job is DriverPoolAvailableJob => Boolean(job));
  return { data: { enabled: true, has_more: result.has_more === true, jobs: mapped }, ok: true } as const;
}

export async function loadDriverPoolWinnerPlate(
  client: DriverPoolClient,
  driverId: number,
): Promise<string | null> {
  const exactDriverId = positiveDriverIds([driverId])[0];
  if (!exactDriverId) return null;
  const { data, error } = await client
    .from("drivers")
    .select("plate_number")
    .eq("id", exactDriverId)
    .maybeSingle();
  return error ? null : safeDriverPlate(asRecord(data).plate_number);
}

export async function decideDriverPoolOffer(client: DriverPoolClient, driverId: number, input: { offer_key: string; expected_updated_at: string; idempotency_key: string }, action: "accept" | "decline", actor?: AdminBookingPersistenceAdapterActor) {
  if (!driverPoolIsEnabled()) return { error: "Driver Pool is not enabled.", ok: false, status: 503 } as const;
  if (actor && !actorIsValid(actor)) return { error: "Verified Admin or Dispatcher required.", ok: false, status: 403 } as const;
  const { data, error } = await client.rpc(action === "accept" ? "accept_driver_pool_offer" : "decline_driver_pool_offer", {
    p_driver_id: driverId, p_expected_updated_at: input.expected_updated_at,
    p_idempotency_key: input.idempotency_key, p_offer_key: input.offer_key,
    ...(actor ? { p_actor_role: actor.actor_role, p_actor_label: actor.actor_label } : {}),
  });
  if (error) { const failure = classify(error); return { ...failure, ok: false } as const; }
  const result = asRecord(data);
  const reason = text(result.reason, 80) || "no_longer_available";
  if (result.ok === false) {
    const messages: Record<string, string> = {
      schedule_conflict: "Driver has an overlapping job.", vehicle_mismatch: "This job requires a different vehicle type.",
      not_eligible: "Driver is no longer eligible for this offer.", response_required: "Choose a driver with an Available response.",
    };
    return { error: messages[reason] || "This offer is no longer available. Reload to review.", ok: false, status: 409 } as const;
  }
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
