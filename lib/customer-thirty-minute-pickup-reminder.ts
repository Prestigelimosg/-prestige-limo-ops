import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sendCustomerDevicePushAlertForAppUpdate } from "./customer-device-push-notification";

export const customerThirtyMinutePickupReminderVersion =
  "customer-thirty-minute-pickup-reminder-v1";

type UnknownRecord = Record<string, unknown>;
type ReminderClient = Pick<SupabaseClient, "from">;
type ReminderPushSender = typeof sendCustomerDevicePushAlertForAppUpdate;

type ReminderRunOptions = {
  now?: Date | string | number;
  sendPush?: ReminderPushSender;
};

export type CustomerThirtyMinutePickupReminderResult = {
  candidate_count: number;
  duplicate_count: number;
  notification_count: number;
  ok: boolean;
  push_sent_count: number;
  reason: "configuration_error" | "ok" | "read_failed" | "write_failed";
  version: typeof customerThirtyMinutePickupReminderVersion;
};

const pickupWindowStartMinutes = 30;
const pickupWindowEndMinutes = 31;
const maxCandidatesPerRun = 100;
const maxStatusesPerRun = 500;
const terminalBookingStatuses = new Set([
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
const reminderBlockedDriverStatuses = new Set(["pob", "completed", "job_completed"]);
const customerReadyStatuses = new Set(["confirmed", "driver_assigned"]);
const serviceFamilies = new Map([
  ["arr", "MNG"],
  ["arrival", "MNG"],
  ["dep", "DEP"],
  ["departure", "DEP"],
  ["dsp", "DSP"],
  ["hourly", "DSP"],
  ["mng", "MNG"],
  ["trf", "TRF"],
  ["transfer", "TRF"],
]);

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

function safeReference(value: unknown): string | null {
  const cleaned = cleanText(value, 120);
  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function validDate(value: unknown): Date | null {
  const text = cleanText(value, 80);
  const parsed = text ? new Date(text) : null;
  return parsed && Number.isFinite(parsed.getTime()) ? parsed : null;
}

function normalizedStatus(value: unknown): string {
  return (cleanText(value, 80) || "").toLowerCase().replace(/[\s-]+/g, "_");
}

function terminalBooking(booking: UnknownRecord): boolean {
  return [
    booking.status,
    booking.admin_internal_status,
    booking.customer_facing_status,
    booking.cancellation_review_status,
  ]
    .map(normalizedStatus)
    .filter(Boolean)
    .some((status) => terminalBookingStatuses.has(status));
}

function customerBookingReady(booking: UnknownRecord): boolean {
  return customerReadyStatuses.has(normalizedStatus(booking.customer_facing_status));
}

function serviceFamily(booking: UnknownRecord): string | null {
  const raw = cleanText(booking.service_type, 80) || cleanText(booking.route_type, 80) || "";
  const family = raw.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/)[0] || "";
  return serviceFamilies.get(family) || null;
}

function safeResult(
  reason: CustomerThirtyMinutePickupReminderResult["reason"],
  counts: Partial<Pick<CustomerThirtyMinutePickupReminderResult,
    "candidate_count" | "duplicate_count" | "notification_count" | "push_sent_count">> = {},
): CustomerThirtyMinutePickupReminderResult {
  return {
    candidate_count: counts.candidate_count ?? 0,
    duplicate_count: counts.duplicate_count ?? 0,
    notification_count: counts.notification_count ?? 0,
    ok: reason === "ok",
    push_sent_count: counts.push_sent_count ?? 0,
    reason,
    version: customerThirtyMinutePickupReminderVersion,
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
      auth: { autoRefreshToken: false, persistSession: false },
    });
  } catch {
    return null;
  }
}

function customerPickupReminderEventKey(bookingReference: string, pickupAt: string): string {
  return `customer_pickup_30m:${bookingReference}:${pickupAt}`;
}

export async function runCustomerThirtyMinutePickupRemindersWithClient(
  client: ReminderClient,
  options: ReminderRunOptions = {},
): Promise<CustomerThirtyMinutePickupReminderResult> {
  const now = new Date(options.now ?? new Date());

  if (!Number.isFinite(now.getTime())) {
    return safeResult("read_failed");
  }

  const pickupWindowStart = new Date(now.getTime() + pickupWindowStartMinutes * 60_000);
  const pickupWindowEnd = new Date(now.getTime() + pickupWindowEndMinutes * 60_000);
  const bookingRead = await client
    .from("bookings")
    .select(
      "booking_reference, pickup_at, route_type, service_type, status, admin_internal_status, customer_facing_status, cancellation_review_status",
    )
    .gte("pickup_at", pickupWindowStart.toISOString())
    .lt("pickup_at", pickupWindowEnd.toISOString())
    .limit(maxCandidatesPerRun);

  if (bookingRead.error) {
    return safeResult("read_failed");
  }

  const candidates = asRows(bookingRead.data).filter((booking) =>
    Boolean(
      safeReference(booking.booking_reference) &&
      validDate(booking.pickup_at) &&
      serviceFamily(booking) &&
      customerBookingReady(booking) &&
      !terminalBooking(booking),
    ));

  if (candidates.length === 0) {
    return safeResult("ok");
  }

  const references = candidates
    .map((booking) => safeReference(booking.booking_reference))
    .filter((reference): reference is string => Boolean(reference));
  const statusRead = await client
    .from("driver_job_status_events")
    .select("booking_reference, status_value, occurred_at")
    .in("booking_reference", references)
    .order("occurred_at", { ascending: false })
    .limit(maxStatusesPerRun);

  if (statusRead.error) {
    return safeResult("read_failed", { candidate_count: candidates.length });
  }

  const latestStatusByReference = new Map<string, string>();
  for (const status of asRows(statusRead.data)) {
    const reference = safeReference(status.booking_reference);
    const value = normalizedStatus(status.status_value);
    if (reference && value && !latestStatusByReference.has(reference)) {
      latestStatusByReference.set(reference, value);
    }
  }

  let duplicateCount = 0;
  let notificationCount = 0;
  let pushSentCount = 0;

  for (const booking of candidates) {
    const bookingReference = safeReference(booking.booking_reference);
    const pickupAt = validDate(booking.pickup_at);
    const family = serviceFamily(booking);
    const latestStatus = bookingReference ? latestStatusByReference.get(bookingReference) : null;

    if (
      !bookingReference ||
      !pickupAt ||
      !family ||
      (latestStatus && reminderBlockedDriverStatuses.has(latestStatus))
    ) {
      continue;
    }

    const payload = {
      actor_role: "system",
      booking_reference: bookingReference,
      delivery_surface: "customer_app",
      driver_job_link_id: null,
      event_key: customerPickupReminderEventKey(bookingReference, pickupAt.toISOString()),
      notification_status: "queued",
      notification_type: "system_notice",
      priority: "high",
      safe_context: {
        minutes_before_pickup: 30,
        service_family: family,
        source: "scheduled_pickup_reminder",
      },
      safe_message: "Your pickup is in 30 minutes. Open My Bookings to track your driver and view trip updates.",
      safe_title: "Pickup in 30 minutes",
      source_surface: "system",
      updated_at: now.toISOString(),
      workflow_area: "customer_pickup_reminder_30m",
    } as const;
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
      options.sendPush ?? sendCustomerDevicePushAlertForAppUpdate
    )(client, {
      actor_role: "system",
      booking_reference: bookingReference,
      delivery_surface: "customer_app",
      workflow_area: "customer_pickup_reminder_30m",
      ...asRecord(data),
    }).catch(() => null);

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

export async function runCustomerThirtyMinutePickupReminders(
  options: ReminderRunOptions = {},
): Promise<CustomerThirtyMinutePickupReminderResult> {
  const client = createReminderClient();
  return client
    ? runCustomerThirtyMinutePickupRemindersWithClient(client, options)
    : safeResult("configuration_error");
}
