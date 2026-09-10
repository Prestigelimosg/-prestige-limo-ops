import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sendDriverDevicePushAlertForPickupReminder } from "./driver-device-push-notification";
import { sendAdminDevicePushAlert } from "./admin-device-push-notification";
import { driverLiveLocationRuntimeGateOpen, readAdminControlledRuntimePolicy } from "./driver-live-location-runtime";
import {
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link";

export const driverOneHourPickupReminderVersion =
  "driver-one-hour-pickup-reminder-v1";

type UnknownRecord = Record<string, unknown>;
type ReminderClient = Pick<SupabaseClient, "from">;
type ReminderPushSender = typeof sendDriverDevicePushAlertForPickupReminder;

type ReminderRunOptions = {
  now?: Date | string | number;
  sendPush?: ReminderPushSender;
  sendAdminPush?: typeof sendAdminDevicePushAlert;
};

export type DriverOneHourPickupReminderResult = {
  candidate_count: number;
  duplicate_count: number;
  notification_count: number;
  admin_warning_count?: number;
  ok: boolean;
  push_sent_count: number;
  reason: "configuration_error" | "ok" | "read_failed" | "write_failed";
  version: typeof driverOneHourPickupReminderVersion;
};

const pickupWindowStartMinutes = 60;
const pickupWindowEndMinutes = 61;
const maxCandidatesPerRun = 100;
const maxLinksPerRun = 300;
const maxStatusesPerRun = 500;
const terminalBookingStatuses = new Set([
  "archived",
  "cancelled",
  "canceled",
  "complete",
  "completed",
  "declined_internal",
  "history",
  "job completed",
  "job_completed",
]);
const reminderBlockedDriverStatuses = new Set(["pob", "completed", "job_completed"]);
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function asRecord(value: unknown): UnknownRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asRows(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string" && typeof value !== "number") {
    return null;
  }
  const cleaned = String(value).replace(/\s+/g, " ").trim();
  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function validDate(value: unknown): Date | null {
  const text = cleanText(value, 80);
  const parsed = text ? new Date(text) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function terminalBooking(booking: UnknownRecord): boolean {
  return [
    booking.status,
    booking.admin_internal_status,
    booking.customer_facing_status,
    booking.cancellation_review_status,
  ]
    .map((value) => cleanText(value, 80)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .some((value) => terminalBookingStatuses.has(value));
}

function activeLink(link: UnknownRecord, now: Date): boolean {
  const expiresAt = cleanText(link.expires_at, 80);
  return (
    link.link_status === "active" &&
    !link.revoked_at &&
    Boolean(expiresAt) &&
    !isDriverJobLinkExpired(expiresAt as string, now) &&
    !isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt as string, now)
  );
}

function safeResult(
  reason: DriverOneHourPickupReminderResult["reason"],
  counts: Partial<
    Pick<
      DriverOneHourPickupReminderResult,
      "candidate_count" | "duplicate_count" | "notification_count" | "push_sent_count"
    >
  > = {},
): DriverOneHourPickupReminderResult {
  return {
    candidate_count: counts.candidate_count ?? 0,
    duplicate_count: counts.duplicate_count ?? 0,
    notification_count: counts.notification_count ?? 0,
    ok: reason === "ok",
    push_sent_count: counts.push_sent_count ?? 0,
    reason,
    version: driverOneHourPickupReminderVersion,
  };
}

function createReminderClient(): ReminderClient | null {
  const supabaseUrl = cleanText(process.env.SUPABASE_URL, 500);
  const serviceRoleKey = cleanText(process.env.SUPABASE_SERVICE_ROLE_KEY, 4000);
  if (!supabaseUrl || !serviceRoleKey || !supabaseUrl.startsWith("https://")) {
    return null;
  }

  try {
    return createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  } catch {
    return null;
  }
}

function pickupReminderEventKey(bookingReference: string, pickupAt: string): string {
  return `driver_pickup_60m:${bookingReference}:${pickupAt}`;
}

async function runInitialPickupReminders(
  client: ReminderClient,
  options: ReminderRunOptions = {},
): Promise<DriverOneHourPickupReminderResult> {
  const now = new Date(options.now ?? new Date());
  if (!Number.isFinite(now.getTime())) {
    return safeResult("read_failed");
  }

  const pickupWindowStart = new Date(
    now.getTime() + pickupWindowStartMinutes * 60 * 1000,
  );
  const pickupWindowEnd = new Date(
    now.getTime() + pickupWindowEndMinutes * 60 * 1000,
  );
  const bookingRead = await client
    .from("bookings")
    .select(
      "booking_reference, public_booking_reference, driver_id, pickup_at, status, admin_internal_status, customer_facing_status, cancellation_review_status",
    )
    .gte("pickup_at", pickupWindowStart.toISOString())
    .lt("pickup_at", pickupWindowEnd.toISOString())
    .limit(maxCandidatesPerRun);
  if (bookingRead.error) {
    return safeResult("read_failed");
  }

  const candidates = asRows(bookingRead.data).filter((booking) => {
    const reference = cleanText(booking.booking_reference, 120);
    const pickupAt = validDate(booking.pickup_at);
    return Boolean(reference && pickupAt && positiveInteger(booking.driver_id)) &&
      !terminalBooking(booking);
  });
  if (candidates.length === 0) {
    return safeResult("ok");
  }

  const references = [
    ...new Set(
      candidates
        .map((booking) => cleanText(booking.booking_reference, 120))
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const [linkRead, statusRead] = await Promise.all([
    client
      .from("driver_job_links")
      .select(
        "id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context, created_at",
      )
      .in("booking_reference", references)
      .eq("link_status", "active")
      .order("created_at", { ascending: false })
      .limit(maxLinksPerRun),
    client
      .from("driver_job_status_events")
      .select("booking_reference, status_value, occurred_at")
      .in("booking_reference", references)
      .order("occurred_at", { ascending: false })
      .limit(maxStatusesPerRun),
  ]);
  if (linkRead.error || statusRead.error) {
    return safeResult("read_failed", { candidate_count: candidates.length });
  }

  const newestActiveLinkByReference = new Map<string, UnknownRecord>();
  for (const link of asRows(linkRead.data)) {
    const reference = cleanText(link.booking_reference, 120);
    if (
      reference &&
      !newestActiveLinkByReference.has(reference) &&
      activeLink(link, now)
    ) {
      newestActiveLinkByReference.set(reference, link);
    }
  }

  const latestDriverStatusByReference = new Map<string, string>();
  for (const status of asRows(statusRead.data)) {
    const reference = cleanText(status.booking_reference, 120);
    const statusValue = cleanText(status.status_value, 80)?.toLowerCase();
    if (reference && statusValue && !latestDriverStatusByReference.has(reference)) {
      latestDriverStatusByReference.set(reference, statusValue);
    }
  }

  let duplicateCount = 0;
  let notificationCount = 0;
  let pushSentCount = 0;
  for (const booking of candidates) {
    const bookingReference = cleanText(booking.booking_reference, 120);
    const driverId = positiveInteger(booking.driver_id);
    const pickupAt = validDate(booking.pickup_at);
    const link = bookingReference
      ? newestActiveLinkByReference.get(bookingReference)
      : null;
    const linkId = cleanText(link?.id, 80);
    const linkDriverId = positiveInteger(link?.driver_id);
    const latestDriverStatus = bookingReference
      ? latestDriverStatusByReference.get(bookingReference)
      : null;
    if (
      !bookingReference ||
      !driverId ||
      !pickupAt ||
      !link ||
      !linkId ||
      !uuidPattern.test(linkId) ||
      linkDriverId !== driverId ||
      (latestDriverStatus && reminderBlockedDriverStatuses.has(latestDriverStatus))
    ) {
      continue;
    }

    const payload = {
      actor_role: "system",
      booking_reference: bookingReference,
      delivery_surface: "driver_app",
      driver_job_link_id: linkId,
      event_key: pickupReminderEventKey(bookingReference, pickupAt.toISOString()),
      notification_status: "queued",
      notification_type: "trip_update",
      priority: "high",
      safe_context: {
        minutes_before_pickup: 60,
        source: "scheduled_pickup_reminder",
      },
      safe_message: "Your pickup is in 1 hour. Open Driver Portal to review the job.",
      safe_title: "Pickup in 1 hour",
      source_surface: "system",
      updated_at: now.toISOString(),
      workflow_area: "driver_pickup_reminder",
    };
    const { data, error } = await client
      .from("customer_driver_app_notification_outbox")
      .insert(payload)
      .select(
        "id, notification_type, notification_status, priority, delivery_surface, event_key, booking_reference, driver_job_link_id, workflow_area, safe_title, safe_message, safe_context, source_surface, actor_role, actor_label, created_at, updated_at",
      )
      .single();
    if (error) {
      if (cleanText(asRecord(error).code, 20) === "23505") {
        duplicateCount += 1;
        continue;
      }
      return safeResult("write_failed", {
        candidate_count: candidates.length,
        duplicate_count: duplicateCount,
        notification_count: notificationCount,
        push_sent_count: pushSentCount,
      });
    }

    notificationCount += 1;
    const pushResult = await (
      options.sendPush ?? sendDriverDevicePushAlertForPickupReminder
    )(
      client,
      {
        booking_reference: bookingReference,
        delivery_surface: "driver_app",
        driver_id: driverId,
        driver_job_link_id: linkId,
        notification_id: cleanText(asRecord(data).id, 80),
      },
    ).catch(() => null);
    if (pushResult?.ok) {
      pushSentCount += 1;
    }
  }

  return safeResult("ok", {
    candidate_count: candidates.length,
    duplicate_count: duplicateCount,
    notification_count: notificationCount,
    push_sent_count: pushSentCount,
  });
}

export async function runDriverOneHourPickupReminders(
  options: ReminderRunOptions = {},
): Promise<DriverOneHourPickupReminderResult> {
  const client = createReminderClient();
  return client
    ? runDriverOneHourPickupRemindersWithClient(client, options)
    : safeResult("configuration_error");
}

const locationFollowupWorkflow = "driver_pickup_location_followup";
const locationFollowupCopy = "Please share location";
const locationReadLimit = 100;
const minuteMs = 60_000;

function freshLocation(row: UnknownRecord, now: Date, staleAfterSeconds: number): boolean {
  const captured = validDate(row.captured_at)?.getTime();
  const stale = validDate(row.stale_after)?.getTime();
  return row.sharing_state === "active" && captured !== undefined && stale !== undefined &&
    captured <= now.getTime() && captured >= now.getTime() - staleAfterSeconds * 1000 &&
    stale > now.getTime() && stale > captured;
}

// Uses existing exact-job sources, never a name, plate, nearby pin or phone label.
async function readLocationFollowupEvidence(
  client: ReminderClient, reference: string, sourceLinkId: string, now: Date,
  staleAfterSeconds = 300,
) {
  const bookingRead = await client.from("bookings")
    .select("booking_reference, driver_id, pickup_at, status, admin_internal_status, customer_facing_status, cancellation_review_status")
    .eq("booking_reference", reference).limit(2);
  if (bookingRead.error) throw new Error("Location follow-up booking read failed");
  const bookings = asRows(bookingRead.data);
  if (bookings.length > 1) throw new Error("Location follow-up booking is ambiguous");
  const booking = bookings[0];
  const driverId = positiveInteger(booking?.driver_id);
  if (!booking || !driverId || terminalBooking(booking)) return null;
  const [linksRead, driverBookingsRead] = await Promise.all([
    client.from("driver_job_links")
      .select("id, booking_reference, driver_id, link_status, revoked_at, expires_at, created_at")
      .eq("driver_id", driverId).eq("link_status", "active")
      .order("created_at", { ascending: false }).limit(locationReadLimit + 1),
    client.from("bookings")
      .select("booking_reference, driver_id, status, admin_internal_status, customer_facing_status, cancellation_review_status")
      .eq("driver_id", driverId).limit(locationReadLimit + 1),
  ]);
  const links = asRows(linksRead.data);
  const driverBookings = asRows(driverBookingsRead.data);
  if (linksRead.error || driverBookingsRead.error || links.length > locationReadLimit ||
    driverBookings.length > locationReadLimit) throw new Error("Location follow-up assignment read unavailable");
  const currentLinks = new Map<string, UnknownRecord>();
  for (const candidate of links) {
    const key = cleanText(candidate.booking_reference, 120);
    if (key && activeLink(candidate, now) && !currentLinks.has(key)) currentLinks.set(key, candidate);
  }
  const currentLink = currentLinks.get(reference);
  if (!currentLink || currentLink.id !== sourceLinkId ||
    !driverBookings.some(row => row.booking_reference === reference && !terminalBooking(row))) return null;
  const refs = driverBookings.filter(row => !terminalBooking(row))
    .map(row => cleanText(row.booking_reference, 120)).filter((v): v is string => Boolean(v));
  const [positionsRead, statusesRead] = await Promise.all([
    client.from("driver_live_location_latest_positions")
      .select("booking_reference, driver_job_link_id, sharing_state, captured_at, stale_after")
      .in("booking_reference", refs).limit(locationReadLimit + 1),
    client.from("driver_job_status_events").select("booking_reference, status_value, occurred_at")
      .in("booking_reference", refs).order("occurred_at", { ascending: false }).limit(maxStatusesPerRun + 1),
  ]);
  const positions = asRows(positionsRead.data);
  const statuses = asRows(statusesRead.data);
  if (positionsRead.error || statusesRead.error || positions.length > locationReadLimit ||
    statuses.length > maxStatusesPerRun) throw new Error("Location follow-up freshness read unavailable");
  const latest = new Map<string, string>();
  for (const row of statuses) {
    const key = cleanText(row.booking_reference, 120);
    if (key && !latest.has(key)) latest.set(key, String(row.status_value).toLowerCase());
  }
  const closedStatuses = new Set(["ots", "pob", "completed", "job_completed"]);
  if (closedStatuses.has(latest.get(reference) || "")) return null;
  const verifiedFresh = positions.filter(position => {
    const key = cleanText(position.booking_reference, 120);
    return key && currentLinks.get(key)?.id === position.driver_job_link_id &&
      !["completed", "job_completed"].includes(latest.get(key) || "") && freshLocation(position, now, staleAfterSeconds);
  });
  // Recheck the current schedule and assignment after the other evidence reads.
  const latestBookingRead = await client.from("bookings")
    .select("booking_reference, driver_id, pickup_at, status, admin_internal_status, customer_facing_status, cancellation_review_status")
    .eq("booking_reference", reference).limit(2);
  if (latestBookingRead.error) throw new Error("Location follow-up final booking read failed");
  const latestBookings = asRows(latestBookingRead.data);
  if (latestBookings.length > 1) throw new Error("Location follow-up final booking is ambiguous");
  const currentBooking = latestBookings[0];
  if (!currentBooking || terminalBooking(currentBooking) ||
    positiveInteger(currentBooking.driver_id) !== driverId || currentBooking.pickup_at !== booking.pickup_at) return null;
  return {
    booking, driverId,
    fresh: verifiedFresh.some(position => position.booking_reference === reference),
    overlap: verifiedFresh.some(position => position.booking_reference !== reference),
  };
}

async function runLocationFollowups(
  client: ReminderClient, options: ReminderRunOptions, result: DriverOneHourPickupReminderResult,
) {
  const now = new Date(options.now ?? new Date());
  const initialRead = await client.from("customer_driver_app_notification_outbox")
    .select("id, booking_reference, driver_job_link_id, event_key, created_at, safe_context")
    .eq("workflow_area", "driver_pickup_reminder").eq("delivery_surface", "driver_app")
    .gte("created_at", new Date(now.getTime() - 65 * minuteMs).toISOString())
    .is("safe_context->>location_followup_checked_at", null)
    .order("created_at", { ascending: false }).limit(locationReadLimit + 1);
  const warningsRead = await client.from("admin_app_notification_outbox")
    .select("id, booking_reference, event_key, notification_status, safe_context")
    .eq("workflow_area", locationFollowupWorkflow).in("notification_status", ["queued", "read"])
    .limit(locationReadLimit + 1);
  const initials = asRows(initialRead.data);
  const warnings = asRows(warningsRead.data);
  if (initialRead.error || warningsRead.error || initials.length > locationReadLimit ||
    warnings.length > locationReadLimit) throw new Error("Location follow-up queue read unavailable");
  if (initials.length === 0 && warnings.length === 0) return;
  if (!driverLiveLocationRuntimeGateOpen()) return;
  const policy = await readAdminControlledRuntimePolicy({ client, env: process.env, purpose: "capture" });
  if (!policy.ok) {
    if (policy.reason === "driver_live_location_admin_runtime_gate_closed") return;
    throw new Error("Location follow-up runtime policy unavailable");
  }
  const allowedReferences = policy.policy.allowedJobReferences;

  for (const warning of warnings) {
    const context = asRecord(warning.safe_context);
    const reference = cleanText(warning.booking_reference, 120);
    const linkId = cleanText(context.driver_job_link_id, 80);
    if (!reference || !linkId || !uuidPattern.test(linkId)) continue;
    const evidence = allowedReferences.includes(reference)
      ? await readLocationFollowupEvidence(client, reference, linkId, now, policy.policy.staleAfterSeconds) : null;
    if (!evidence || evidence.fresh || evidence.booking.pickup_at !== context.pickup_at) {
      const result = await client.from("admin_app_notification_outbox")
        .update({ notification_status: "archived", updated_at: now.toISOString() })
        .eq("id", warning.id).eq("event_key", warning.event_key)
        .eq("workflow_area", locationFollowupWorkflow)
        .in("notification_status", ["queued", "read"]);
      if (result.error) throw new Error("Location follow-up warning cleanup failed");
    } else if (context.overlap !== evidence.overlap) {
      const changed = await client.from("admin_app_notification_outbox").update({
        safe_title: evidence.overlap ? "Check overlapping jobs" : "Location unavailable",
        safe_message: evidence.overlap
          ? "Driver is sharing another job. Check overlapping assignments."
          : "Location unavailable after the pickup reminder. Check with the driver.",
        safe_context: { ...context, overlap: evidence.overlap }, updated_at: now.toISOString(),
      }).eq("id", warning.id).eq("event_key", warning.event_key)
        .eq("workflow_area", locationFollowupWorkflow).in("notification_status", ["queued", "read"]);
      if (changed.error) throw new Error("Location follow-up warning write failed");
    }
  }

  for (const initial of initials) {
    const reference = cleanText(initial.booking_reference, 120);
    const linkId = cleanText(initial.driver_job_link_id, 80);
    const created = validDate(initial.created_at);
    if (!reference || !linkId || !uuidPattern.test(linkId) || !created ||
      now.getTime() - created.getTime() < 5 * minuteMs ||
      asRecord(initial.safe_context).source !== "scheduled_pickup_reminder") continue;
    if (!allowedReferences.includes(reference)) continue;
    const evidence = await readLocationFollowupEvidence(client, reference, linkId, now, policy.policy.staleAfterSeconds);
    const pickupAt = validDate(evidence?.booking.pickup_at);
    if (!evidence || !pickupAt || pickupAt <= now ||
      initial.event_key !== pickupReminderEventKey(reference, pickupAt.toISOString())) continue;
    const markChecked = () => client.from("customer_driver_app_notification_outbox")
        .update({ safe_context: { ...asRecord(initial.safe_context), location_followup_checked_at: now.toISOString() } })
        .eq("id", initial.id).eq("event_key", initial.event_key)
        .eq("workflow_area", "driver_pickup_reminder")
        .is("safe_context->>location_followup_checked_at", null);
    // Fresh GPS completes the check. Later staleness is not another reminder.
    if (evidence.fresh) {
      const checked = await markChecked();
      if (checked.error) throw new Error("Location follow-up check write failed");
      continue;
    }
    const eventKey = `driver_gps_followup:${initial.id}`;
    // The existing unique outbox event key reserves one attempt across cron retries.
    // Claim before either provider call; never retry a send after an uncertain result.
    const adminInsert = await client.from("admin_app_notification_outbox").insert({
      booking_reference: reference, event_key: eventKey,
      notification_status: "queued", notification_type: "driver_status", priority: "high",
      delivery_surface: "admin_app", source_surface: "system", actor_role: "system",
      workflow_area: locationFollowupWorkflow, safe_title: evidence.overlap ? "Check overlapping jobs" : "Location unavailable",
      safe_message: evidence.overlap
        ? "Driver is sharing another job. Check overlapping assignments."
        : "Location unavailable after the pickup reminder. Check with the driver.",
      safe_context: { driver_job_link_id: linkId, pickup_at: evidence.booking.pickup_at, overlap: evidence.overlap },
      updated_at: now.toISOString(),
    }).select("id").single();
    if (adminInsert.error) {
      if (asRecord(adminInsert.error).code === "23505") {
        const checked = await markChecked();
        if (checked.error) throw new Error("Location follow-up check write failed");
        continue;
      }
      throw new Error("Location follow-up claim failed");
    }
    result.admin_warning_count = (result.admin_warning_count ?? 0) + 1;
    const checked = await markChecked();
    let driverWriteFailed = false;
    if (!evidence.overlap) {
      const driverInsert = await client.from("customer_driver_app_notification_outbox").insert({
        booking_reference: reference, driver_job_link_id: linkId, event_key: eventKey,
        notification_status: "queued", notification_type: "trip_update", priority: "high",
        delivery_surface: "driver_app", source_surface: "system", actor_role: "system",
        workflow_area: locationFollowupWorkflow, safe_title: "Share location before pickup",
        safe_message: locationFollowupCopy, safe_context: {}, updated_at: now.toISOString(),
      }).select("id").single();
      if (!driverInsert.error) {
        result.notification_count += 1;
        const push = await (options.sendPush ?? sendDriverDevicePushAlertForPickupReminder)(client, {
          booking_reference: reference, delivery_surface: "driver_app", driver_id: evidence.driverId,
          driver_job_link_id: linkId, notification_id: cleanText(asRecord(driverInsert.data).id, 80),
          reminder_kind: "location_followup",
        }).catch(() => null);
        if (push?.ok) result.push_sent_count += 1;
      } else {
        driverWriteFailed = true;
      }
    }
    await (options.sendAdminPush ?? sendAdminDevicePushAlert)(
      "driver_issue", { pickupLocationState: evidence.overlap ? "overlap" : "missing" },
    ).catch(() => null);
    if (driverWriteFailed) throw new Error("Location follow-up driver notice write failed");
    if (checked.error) throw new Error("Location follow-up check write failed");
  }
}

export async function runDriverOneHourPickupRemindersWithClient(
  client: ReminderClient, options: ReminderRunOptions = {},
): Promise<DriverOneHourPickupReminderResult> {
  const result = await runInitialPickupReminders(client, options);
  if (!result.ok) return result;
  try {
    await runLocationFollowups(client, options, result);
    return result;
  } catch (error) {
    const writeFailed = error instanceof Error && /write|claim|cleanup/.test(error.message);
    return { ...result, ok: false, reason: writeFailed ? "write_failed" : "read_failed" };
  }
}
