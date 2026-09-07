import type { SupabaseClient } from "@supabase/supabase-js";

import { opaqueDriverJobLinkKey } from "./driver-device-push-notification.ts";
import {
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  mapBookingToSafeDriverJobPayload,
  type SafeDriverJobPayload,
} from "./driver-job-link.ts";
import { validateDriverJobStatusUpdate } from "./driver-job-link.ts";

export const driverPortalJobsVersion = "driver-portal-jobs-v2";

type DriverPortalJobsClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

export type DriverPortalJob = {
  jobKey: string;
  payload: SafeDriverJobPayload;
  state: "assigned" | "driver_otw" | "ots" | "pob";
  stateLabel: "Assigned · Awaiting OTW" | "On the way" | "On site" | "Passenger on board";
};

export type DriverPortalAlert = {
  notificationIds: string[];
  createdAt: string;
  jobKey: string;
  jobReference: string;
  latestMessage: string;
  latestTitle: string;
  priority: "low" | "normal" | "high" | "urgent";
  updateCount: number;
};

export type DriverPortalJobsResult =
  | {
      jobs: DriverPortalJob[];
      alertCount: number;
      alerts: DriverPortalAlert[];
      alertsAvailable: boolean;
      ok: true;
      reason: "ok";
      version: typeof driverPortalJobsVersion;
    }
  | {
      jobs: [];
      alertCount: 0;
      alerts: [];
      alertsAvailable: false;
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
  "declined",
  "declined_internal",
  "history",
  "job completed",
  "job_completed",
]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const driverPortalAlertPriorities = new Set(["low", "normal", "high", "urgent"]);
const driverPortalAlertSelect =
  "id, actor_role, booking_reference, created_at, delivery_surface, driver_job_link_id, notification_status, priority, safe_message, safe_title, workflow_area";
const driverPortalAlertPageSize = 100;

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
    alertCount: 0,
    alerts: [],
    alertsAvailable: false,
    jobs: [],
    ok: false,
    reason: "not_configured",
    version: driverPortalJobsVersion,
  };
}

function safeAlertPriority(value: unknown): DriverPortalAlert["priority"] {
  const priority = cleanText(value, 20).toLowerCase();
  return driverPortalAlertPriorities.has(priority)
    ? priority as DriverPortalAlert["priority"]
    : "normal";
}

async function loadCurrentDriverPortalAlerts(
  client: DriverPortalJobsClient,
  scopes: Array<{
    bookingReference: string;
    jobKey: string;
    jobReference: string;
    linkId: string;
  }>,
) {
  if (scopes.length === 0) {
    return { alertCount: 0, alerts: [] as DriverPortalAlert[], alertsAvailable: true };
  }

  const scopeByLinkId = new Map(scopes.map((scope) => [scope.linkId, scope]));
  const scopeByReference = new Map(scopes.map((scope) => [scope.bookingReference, scope]));
  const currentLinkFilter = [...scopeByLinkId.keys()].join(",");
  const exactScopeFilter =
    `driver_job_link_id.in.(${currentLinkFilter}),and(driver_job_link_id.is.null,workflow_area.eq.customer_driver_quick_replies,actor_role.eq.customer)`;
  async function readStableCandidate() {
    const candidateRecords: UnknownRecord[] = [];
    let candidateCount: number | null = null;

    for (let offset = 0; candidateCount === null || offset < candidateCount; offset += driverPortalAlertPageSize) {
      const { count, data, error } = await client
        .from("customer_driver_app_notification_outbox")
        .select(driverPortalAlertSelect, { count: "exact" })
        .eq("delivery_surface", "driver_app")
        .eq("notification_status", "queued")
        .in("booking_reference", [...scopeByReference.keys()])
        .or(exactScopeFilter)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + driverPortalAlertPageSize - 1);

      if (
        error ||
        typeof count !== "number" ||
        count < 0 ||
        (candidateCount !== null && count !== candidateCount)
      ) {
        return null;
      }
      candidateCount = count;
      const page = asRows(data);
      candidateRecords.push(...page);

      if (
        candidateRecords.length > candidateCount ||
        (page.length < driverPortalAlertPageSize && candidateRecords.length !== candidateCount)
      ) {
        return null;
      }
    }

    const orderedIds = candidateRecords.map((record) => cleanText(record.id, 80));
    if (
      orderedIds.length !== candidateCount ||
      orderedIds.some((id) => !uuidPattern.test(id)) ||
      new Set(orderedIds).size !== orderedIds.length
    ) {
      return null;
    }
    return { count: candidateCount, orderedIds, records: candidateRecords };
  }

  const firstCandidate = await readStableCandidate();
  const secondCandidate = await readStableCandidate();
  if (
    !firstCandidate ||
    !secondCandidate ||
    firstCandidate.count !== secondCandidate.count ||
    firstCandidate.orderedIds.some((id, index) => secondCandidate.orderedIds[index] !== id)
  ) {
    return { alertCount: 0, alerts: [] as DriverPortalAlert[], alertsAvailable: false };
  }
  const exactCount = secondCandidate.count;
  const records = secondCandidate.records;

  const grouped = new Map<string, DriverPortalAlert>();
  for (const record of records) {
    const id = cleanText(record.id, 80);
    const bookingReference = cleanText(record.booking_reference, 120);
    const createdAt = cleanText(record.created_at, 80);
    const linkedScope = scopeByLinkId.get(cleanText(record.driver_job_link_id, 80));
    const unlinkedScope = record.driver_job_link_id === null &&
      record.workflow_area === "customer_driver_quick_replies" &&
      record.actor_role === "customer"
      ? scopeByReference.get(bookingReference)
      : null;
    const scope = linkedScope || unlinkedScope;
    const latestTitle = cleanText(record.safe_title, 160);
    const latestMessage = cleanText(record.safe_message, 1000);
    if (
      !scope ||
      !uuidPattern.test(id) ||
      bookingReference !== scope.bookingReference ||
      record.delivery_surface !== "driver_app" ||
      record.notification_status !== "queued" ||
      !latestTitle ||
      !latestMessage ||
      !createdAt ||
      !Number.isFinite(Date.parse(createdAt))
    ) {
      return { alertCount: 0, alerts: [] as DriverPortalAlert[], alertsAvailable: false };
    }

    const existing = grouped.get(scope.jobKey);
    if (!existing) {
      grouped.set(scope.jobKey, {
        notificationIds: [id],
        createdAt,
        jobKey: scope.jobKey,
        jobReference: scope.jobReference,
        latestMessage,
        latestTitle,
        priority: safeAlertPriority(record.priority),
        updateCount: 1,
      });
    } else {
      existing.updateCount += 1;
      existing.notificationIds.push(id);
    }
  }

  const alerts = [...grouped.values()]
    .sort((left, right) =>
      Date.parse(right.createdAt) - Date.parse(left.createdAt) ||
      right.jobKey.localeCompare(left.jobKey)
    );

  return {
    alertCount: exactCount || 0,
    alerts,
    alertsAvailable: true,
  };
}

export async function loadDriverPortalJobs({
  client,
  driverId,
  includeAlerts = false,
  now = new Date(),
}: {
  client: DriverPortalJobsClient;
  driverId: number;
  includeAlerts?: boolean;
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
    return {
      alertCount: 0,
      alerts: [],
      alertsAvailable: includeAlerts,
      jobs: [],
      ok: true,
      reason: "ok",
      version: driverPortalJobsVersion,
    };
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
  const alertScopes: Array<{
    bookingReference: string;
    jobKey: string;
    jobReference: string;
    linkId: string;
  }> = [];
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
    const pickupLocation =
      cleanText(booking.pickup_location) ||
      cleanText(contextPayload.pickupLocation) ||
      cleanText(contextPayload.pickup_location);
    const dropoffLocation =
      cleanText(booking.dropoff_location) ||
      cleanText(contextPayload.dropoffLocation) ||
      cleanText(contextPayload.dropoff_location);
    const payload = mapBookingToSafeDriverJobPayload({
      ...contextPayload,
      ...booking,
      dropoffLocation,
      pickupLocation,
      public_reference: cleanText(booking.public_booking_reference, 120) || reference,
      status: state,
    });
    const linkId = cleanText(link.id, 80);
    const jobKey = opaqueDriverJobLinkKey(linkId);
    jobs.push({
      jobKey,
      payload,
      state,
      stateLabel: stateLabel(state),
    });
    alertScopes.push({
      bookingReference: reference,
      jobKey,
      jobReference: payload.reference,
      linkId,
    });
  }

  jobs.sort((left, right) => {
    const leftTime = Date.parse(left.payload.pickupDateTime || "");
    const rightTime = Date.parse(right.payload.pickupDateTime || "");
    return (Number.isFinite(leftTime) ? leftTime : Number.MAX_SAFE_INTEGER) -
      (Number.isFinite(rightTime) ? rightTime : Number.MAX_SAFE_INTEGER);
  });

  const alertState = includeAlerts
    ? await loadCurrentDriverPortalAlerts(client, alertScopes)
    : { alertCount: 0, alerts: [] as DriverPortalAlert[], alertsAvailable: false };

  return {
    ...alertState,
    jobs,
    ok: true,
    reason: "ok",
    version: driverPortalJobsVersion,
  };
}

// Clear only the exact visible snapshot, after re-reading this driver's current scope.
export async function clearDriverPortalAlerts({ client, driverId, notificationIds }: {
  client: DriverPortalJobsClient;
  driverId: number;
  notificationIds: unknown;
}): Promise<{ ok: true; clearedCount: number } | { ok: false; status: number }> {
  if (!Array.isArray(notificationIds) || !notificationIds.length || notificationIds.length > 100 ||
      notificationIds.some((id) => typeof id !== "string" || !uuidPattern.test(id)) ||
      new Set(notificationIds).size !== notificationIds.length) {
    return { ok: false, status: 400 };
  }
  const current = await loadDriverPortalJobs({ client, driverId, includeAlerts: true });
  if (!current.ok || !current.alertsAvailable) return { ok: false, status: 503 };
  const authorized = new Set(current.alerts.flatMap((alert) => alert.notificationIds));
  if (notificationIds.some((id) => !authorized.has(id))) return { ok: false, status: 409 };
  const { data, error } = await client.from("customer_driver_app_notification_outbox")
    .update({ notification_status: "dismissed", updated_at: new Date().toISOString() })
    .eq("delivery_surface", "driver_app")
    .eq("notification_status", "queued")
    .in("id", notificationIds)
    .select("id");
  if (error || !Array.isArray(data)) return { ok: false, status: 503 };
  return { ok: true, clearedCount: data.length };
}
