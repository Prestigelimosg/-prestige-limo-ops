import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import { sendDriverNativePendingAckReminder } from "./driver-device-push-notification";
import {
  isDriverJobLinkExpired,
  isDriverJobLinkExpiryOutsideAllowedWindow,
} from "./driver-job-link";

export const adminDriverAckReminderVersion = "admin-driver-ack-reminder-v1";

const reminderIntervalMs = 15 * 60 * 1000;
const maximumReminderCount = 3;
const reminderWorkflowArea = "pending_driver_ack_reminder";
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

type UnknownRecord = Record<string, unknown>;
type ReminderClient = Pick<SupabaseClient, "from">;

export type AdminDriverAckReminderInput = {
  booking_reference: string;
  driver_job_link_id: string;
};

export type AdminDriverAckReminderResult =
  | {
      data: {
        next_available_at: string | null;
        provider_accepted: boolean;
        reminder_count: number;
        version: typeof adminDriverAckReminderVersion;
      };
      ok: true;
      status: 200;
    }
  | {
      error: string;
      ok: false;
      reason:
        | "acknowledged"
        | "automatic_already_attempted"
        | "cooldown"
        | "driver_mismatch"
        | "invalid_link"
        | "limit_reached"
        | "native_app_unavailable"
        | "not_ready"
        | "persistence_failed"
        | "provider_failed"
        | "stale_link"
        | "terminal_booking";
      status: 409 | 500;
    };

type ReminderOptions = {
  now?: Date;
  sendNativeReminder?: typeof sendDriverNativePendingAckReminder;
  trigger?: "automatic_first_reminder" | "manual";
};

type AdminDriverAckReminderActor = Pick<
  AdminBookingPersistenceAdapterActor,
  "actor_label" | "actor_role" | "source_surface"
>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function rows(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(record) : [];
}

function text(value: unknown, maxLength: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized && normalized.length <= maxLength ? normalized : "";
}

function positiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? ""));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function dateMs(value: unknown): number | null {
  const timestamp = Date.parse(text(value, 80));
  return Number.isFinite(timestamp) ? timestamp : null;
}

function linkIsActive(link: UnknownRecord): boolean {
  const expiresAt = text(link.expires_at, 80);
  return link.link_status === "active" &&
    !link.revoked_at &&
    Boolean(expiresAt) &&
    !isDriverJobLinkExpired(expiresAt) &&
    !isDriverJobLinkExpiryOutsideAllowedWindow(expiresAt);
}

function linkWasAcknowledged(link: UnknownRecord): boolean {
  return Boolean(text(record(link.safe_link_context).driver_acknowledged_at, 80));
}

function bookingIsTerminal(booking: UnknownRecord): boolean {
  return [
    booking.status,
    booking.admin_internal_status,
    booking.customer_facing_status,
  ].some((value) => terminalBookingStatuses.has(text(value, 80).toLowerCase()));
}

function blocked(
  reason: Exclude<AdminDriverAckReminderResult, { ok: true }>['reason'],
  error: string,
  status: 409 | 500 = 409,
): AdminDriverAckReminderResult {
  return { error, ok: false, reason, status };
}

function nextAvailableAt(nowMs: number): string {
  return new Date(nowMs + reminderIntervalMs).toISOString();
}

export async function createAdminDriverAckReminder(
  client: ReminderClient,
  input: AdminDriverAckReminderInput,
  actor: AdminDriverAckReminderActor,
  options: ReminderOptions = {},
): Promise<AdminDriverAckReminderResult> {
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const trigger = options.trigger ?? "manual";
  const { data: linkData, error: linkError } = await client
    .from("driver_job_links")
    .select(
      "id, booking_reference, driver_id, link_status, issued_at, expires_at, revoked_at, safe_link_context, created_at",
    )
    .eq("id", input.driver_job_link_id)
    .maybeSingle();
  const link = record(linkData);
  const linkId = text(link.id, 80);
  const bookingReference = text(link.booking_reference, 120);
  const driverId = positiveInteger(link.driver_id);

  if (
    linkError ||
    linkId !== input.driver_job_link_id ||
    bookingReference !== input.booking_reference ||
    !linkIsActive(link) ||
    !driverId ||
    !text(record(link.safe_link_context).native_handoff_ciphertext, 1200)
  ) {
    return blocked("invalid_link", "This pending Driver Job Link is not eligible for a native reminder.");
  }
  if (linkWasAcknowledged(link)) {
    return blocked("acknowledged", "The newest Driver Job Link is already acknowledged.");
  }

  const { data: newestLinkData, error: newestLinkError } = await client
    .from("driver_job_links")
    .select("id, link_status, expires_at, revoked_at")
    .eq("booking_reference", bookingReference)
    .eq("link_status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const newestLink = record(newestLinkData);
  if (
    newestLinkError ||
    text(newestLink.id, 80) !== linkId ||
    !linkIsActive(newestLink)
  ) {
    return blocked("stale_link", "Only the newest active Driver Job Link can be reminded.");
  }

  const { data: bookingData, error: bookingError } = await client
    .from("bookings")
    .select("booking_reference, driver_id, status, admin_internal_status, customer_facing_status")
    .eq("booking_reference", bookingReference)
    .maybeSingle();
  const booking = record(bookingData);
  if (bookingError || text(booking.booking_reference, 120) !== bookingReference) {
    return blocked("invalid_link", "The exact saved booking could not be verified.");
  }
  if (bookingIsTerminal(booking)) {
    return blocked("terminal_booking", "Completed or cancelled bookings cannot be reminded.");
  }
  if (positiveInteger(booking.driver_id) !== driverId) {
    return blocked("driver_mismatch", "The saved booking and Driver Job Link driver do not match.");
  }

  const issuedAtMs = dateMs(link.issued_at) ?? dateMs(link.created_at);
  if (issuedAtMs === null || nowMs - issuedAtMs < reminderIntervalMs) {
    return blocked("not_ready", "The first reminder is available 15 minutes after link issue.");
  }

  const { data: accountData, error: accountError } = await client
    .from("driver_access_accounts")
    .select("id, active_device_id_hash")
    .eq("driver_reference", String(driverId))
    .eq("account_status", "active")
    .maybeSingle();
  const account = record(accountData);
  if (
    accountError ||
    !text(account.id, 80) ||
    !/^[0-9a-f]{64}$/.test(text(account.active_device_id_hash, 64))
  ) {
    return blocked("native_app_unavailable", "The assigned driver has no active verified Driver app on one phone.");
  }

  const { data: subscriptionData, error: subscriptionError } = await client
    .from("driver_device_push_subscriptions")
    .select("endpoint")
    .eq("driver_id", driverId)
    .eq("subscription_status", "active")
    .eq("source_surface", "driver_native_ios")
    .is("revoked_at", null)
    .limit(2);
  if (subscriptionError || rows(subscriptionData).length !== 1) {
    return blocked("native_app_unavailable", "The assigned driver must have exactly one active native alert subscription.");
  }

  const { data: auditData, error: auditError } = await client
    .from("customer_driver_app_notification_outbox")
    .select("id, created_at, event_key")
    .eq("driver_job_link_id", linkId)
    .eq("workflow_area", reminderWorkflowArea)
    .order("created_at", { ascending: false })
    .limit(maximumReminderCount + 1);
  if (auditError) {
    return blocked("persistence_failed", "Reminder audit history could not be verified.", 500);
  }
  const audits = rows(auditData);
  if (trigger === "automatic_first_reminder" && audits.length > 0) {
    return blocked(
      "automatic_already_attempted",
      "The automatic first reminder was already attempted for this exact Driver Job Link.",
    );
  }
  if (audits.length >= maximumReminderCount) {
    return blocked("limit_reached", "This pending link already reached the maximum of three reminders.");
  }
  const previousReminderAtMs = dateMs(audits[0]?.created_at);
  if (previousReminderAtMs !== null && nowMs - previousReminderAtMs < reminderIntervalMs) {
    return blocked("cooldown", "Wait 15 minutes before reminding this driver again.");
  }

  const reminderCount = audits.length + 1;
  const eventKey = `pending-driver-ack-reminder:${linkId}:${reminderCount}`;
  const { data: insertedData, error: insertError } = await client
    .from("customer_driver_app_notification_outbox")
    .insert({
      actor_label: actor.actor_label,
      actor_role: actor.actor_role,
      booking_reference: bookingReference,
      delivery_surface: "driver_app",
      driver_job_link_id: linkId,
      event_key: eventKey,
      notification_status: "archived",
      notification_type: "system_notice",
      priority: "high",
      safe_context: {
        reminder_attempt: reminderCount,
        reminder_kind: "native_pending_ack",
        reminder_trigger: trigger,
      },
      safe_message: "Job acknowledgement needed. Tap to review.",
      safe_title: "Prestige Driver",
      source_surface: actor.source_surface,
      updated_at: now.toISOString(),
      workflow_area: reminderWorkflowArea,
    })
    .select("id")
    .single();
  const auditId = text(record(insertedData).id, 80);
  if (insertError || !auditId) {
    return blocked(
      insertError && record(insertError).code === "23505" ? "cooldown" : "persistence_failed",
      insertError && record(insertError).code === "23505"
        ? "Wait 15 minutes before reminding this driver again."
        : "The reminder audit could not be reserved safely.",
      insertError && record(insertError).code === "23505" ? 409 : 500,
    );
  }

  const sendNativeReminder = options.sendNativeReminder ?? sendDriverNativePendingAckReminder;
  const sendResult = await sendNativeReminder(client, {
    driver_id: driverId,
    driver_job_link_id: linkId,
  }).catch(() => null);
  const providerAccepted = sendResult?.native_provider_accepted === true &&
    sendResult.native_provider_request_count === 1;
  await client
    .from("customer_driver_app_notification_outbox")
    .update({
      safe_context: {
        reminder_attempt: reminderCount,
        reminder_kind: "native_pending_ack",
        reminder_trigger: trigger,
        provider_accepted: providerAccepted,
        provider_reason: sendResult?.reason ?? "provider_failure",
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", auditId);

  if (!providerAccepted) {
    return blocked("provider_failed", "The reminder request was not accepted by the native alert provider.", 500);
  }

  return {
    data: {
      next_available_at: reminderCount < maximumReminderCount
        ? nextAvailableAt(nowMs)
        : null,
      provider_accepted: true,
      reminder_count: reminderCount,
      version: adminDriverAckReminderVersion,
    },
    ok: true,
    status: 200,
  };
}
