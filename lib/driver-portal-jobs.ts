import type { SupabaseClient } from "@supabase/supabase-js";

import { opaqueDriverJobLinkKey } from "./driver-device-push-notification.ts";
import {
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  mapBookingToSafeDriverJobPayload,
  type SafeDriverJobPayload,
} from "./driver-job-link.ts";
import { validateDriverJobStatusUpdate } from "./driver-job-link.ts";

export const driverPortalJobsVersion = "driver-portal-jobs-v1";

type DriverPortalJobsClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

export type DriverPortalJob = {
  jobKey: string;
  payload: SafeDriverJobPayload;
  state: "assigned" | "driver_otw" | "ots" | "pob";
  stateLabel: "Assigned · Awaiting OTW" | "On the way" | "On site" | "Passenger on board";
};

export type DriverPortalJobsResult =
  | {
      jobs: DriverPortalJob[];
      ok: true;
      reason: "ok";
      version: typeof driverPortalJobsVersion;
    }
  | {
      jobs: [];
      ok: false;
      reason: "not_configured";
      version: typeof driverPortalJobsVersion;
    };

const terminalStatuses = new Set([
  "archived",
  "cancelled",
  "canceled",
  "complete",
  "completed",
  "declined_internal",
  "job completed",
  "job_completed",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asRows(value: unknown) {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function cleanText(value: unknown, maxLength = 500) {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }

  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : "";
}

function positiveInteger(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function bookingIsTerminal(booking: UnknownRecord) {
  return [
    booking.status,
    booking.admin_internal_status,
    booking.customer_facing_status,
    booking.cancellation_review_status,
  ]
    .map((value) => cleanText(value, 80).toLowerCase())
    .filter(Boolean)
    .some((value) => terminalStatuses.has(value));
}

function stateFromStatus(value: unknown): DriverPortalJob["state"] | "completed" {
  const status = validateDriverJobStatusUpdate(cleanText(value, 40));
  return status === "completed"
    ? "completed"
    : status === "driver_otw" || status === "ots" || status === "pob"
      ? status
      : "assigned";
}

function stateLabel(state: DriverPortalJob["state"]): DriverPortalJob["stateLabel"] {
  if (state === "driver_otw") return "On the way";
  if (state === "ots") return "On site";
  if (state === "pob") return "Passenger on board";
  return "Assigned · Awaiting OTW";
}

function failedJobsResult(): DriverPortalJobsResult {
  return {
    jobs: [],
    ok: false,
    reason: "not_configured",
    version: driverPortalJobsVersion,
  };
}

export async function loadDriverPortalJobs({
  client,
  driverId,
  now = new Date(),
}: {
  client: DriverPortalJobsClient;
  driverId: number;
  now?: Date | string | number;
}): Promise<DriverPortalJobsResult> {
  const verifiedDriverId = positiveInteger(driverId);
  const nowDate = new Date(now);
  if (!verifiedDriverId || Number.isNaN(nowDate.getTime())) {
    return failedJobsResult();
  }

  const { data: linkData, error: linkError } = await client
    .from("driver_job_links")
    .select("id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context, created_at")
    .eq("driver_id", verifiedDriverId)
    .eq("link_status", "active")
    .order("created_at", { ascending: false })
    .limit(100);
  if (linkError) {
    return failedJobsResult();
  }

  const newestAcknowledgedLinks = new Map<string, UnknownRecord>();
  const seenNewestActiveReferences = new Set<string>();
  for (const link of asRows(linkData)) {
    const bookingReference = cleanText(link.booking_reference, 120);
    const linkId = cleanText(link.id, 80);
    const expiresAt = cleanText(link.expires_at, 80);
    if (
      !bookingReference ||
      seenNewestActiveReferences.has(bookingReference) ||
      positiveInteger(link.driver_id) !== verifiedDriverId ||
      link.link_status !== "active"
    ) {
      continue;
    }
    seenNewestActiveReferences.add(bookingReference);

    const acknowledgedAt = cleanText(asRecord(link.safe_link_context).driver_acknowledged_at, 80);
    if (
      !uuidPattern.test(linkId) ||
      link.revoked_at ||
      !acknowledgedAt ||
      isDriverJobLinkExpired(expiresAt, nowDate) ||
      isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt, nowDate)
    ) {
      continue;
    }
    newestAcknowledgedLinks.set(bookingReference, link);
  }

  const references = [...newestAcknowledgedLinks.keys()];
  if (references.length === 0) {
    return { jobs: [], ok: true, reason: "ok", version: driverPortalJobsVersion };
  }

  const [bookingRead, statusRead] = await Promise.all([
    client
      .from("bookings")
      .select("booking_reference, public_booking_reference, driver_id, booking_type, service_type, pickup_at, pickup_time, pickup_location, pickup_address, dropoff_location, dropoff_address, route_summary, route, passenger_name, flight_no, status, admin_internal_status, customer_facing_status, cancellation_review_status")
      .eq("driver_id", verifiedDriverId)
      .in("booking_reference", references),
    client
      .from("driver_job_status_events")
      .select("booking_reference, status_value, occurred_at")
      .in("booking_reference", references)
      .order("occurred_at", { ascending: false })
      .limit(500),
  ]);
  if (bookingRead.error || statusRead.error) {
    return failedJobsResult();
  }

  const latestStatusByReference = new Map<string, UnknownRecord>();
  const completedReferences = new Set<string>();
  for (const status of asRows(statusRead.data)) {
    const reference = cleanText(status.booking_reference, 120);
    if (reference && stateFromStatus(status.status_value) === "completed") {
      completedReferences.add(reference);
    }
    if (reference && !latestStatusByReference.has(reference)) {
      latestStatusByReference.set(reference, status);
    }
  }

  const jobs: DriverPortalJob[] = [];
  for (const booking of asRows(bookingRead.data)) {
    const reference = cleanText(booking.booking_reference, 120);
    const link = newestAcknowledgedLinks.get(reference);
    if (
      !link ||
      completedReferences.has(reference) ||
      positiveInteger(booking.driver_id) !== verifiedDriverId ||
      bookingIsTerminal(booking)
    ) {
      continue;
    }

    const latestStatus = latestStatusByReference.get(reference);
    const state = stateFromStatus(latestStatus?.status_value);
    if (state === "completed") {
      continue;
    }

    const contextPayload = asRecord(asRecord(link.safe_link_context).driver_job_payload);
    const payload = mapBookingToSafeDriverJobPayload({
      ...contextPayload,
      ...booking,
      public_reference: cleanText(booking.public_booking_reference, 120) || reference,
      status: state,
    });
    jobs.push({
      jobKey: opaqueDriverJobLinkKey(cleanText(link.id, 80)),
      payload,
      state,
      stateLabel: stateLabel(state),
    });
  }

  jobs.sort((left, right) => {
    const leftTime = Date.parse(left.payload.pickupDateTime || "");
    const rightTime = Date.parse(right.payload.pickupDateTime || "");
    return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER) -
      (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
  });

  return { jobs, ok: true, reason: "ok", version: driverPortalJobsVersion };
}
