import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sendDriverDevicePushAlertForPickupReminder } from "./driver-device-push-notification";
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
};

export type DriverOneHourPickupReminderResult = {
  candidate_count: number;
  duplicate_count: number;
  notification_count: number;
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

export async function runDriverOneHourPickupRemindersWithClient(
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
