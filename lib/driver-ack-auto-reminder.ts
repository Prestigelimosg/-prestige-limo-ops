import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createAdminDriverAckReminder,
  type AdminDriverAckReminderResult,
} from "./admin-driver-ack-reminder";

export const driverAckAutoReminderVersion = "driver-ack-auto-reminder-v1";

const automaticReminderAgeMs = 15 * 60 * 1000;
const automaticReminderTrigger = "automatic_first_reminder" as const;
const maximumCandidatesPerRun = 100;
const reminderWorkflowArea = "pending_driver_ack_reminder";

type UnknownRecord = Record<string, unknown>;
type ReminderClient = Pick<SupabaseClient, "from">;
type ReminderSender = typeof createAdminDriverAckReminder;

type DriverAckAutoReminderOptions = {
  now?: Date | string | number;
  sendReminder?: ReminderSender;
};

export type DriverAckAutoReminderResult = {
  candidate_count: number;
  eligible_count: number;
  failure_count: number;
  ok: boolean;
  reason: "configuration_error" | "ok" | "read_failed" | "send_failed";
  reminder_sent_count: number;
  skipped_count: number;
  version: typeof driverAckAutoReminderVersion;
};

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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
  const parsed = Date.parse(text(value, 80));
  return Number.isFinite(parsed) ? parsed : null;
}

function result(
  reason: DriverAckAutoReminderResult["reason"],
  counts: Partial<Omit<DriverAckAutoReminderResult, "ok" | "reason" | "version">> = {},
): DriverAckAutoReminderResult {
  return {
    candidate_count: counts.candidate_count ?? 0,
    eligible_count: counts.eligible_count ?? 0,
    failure_count: counts.failure_count ?? 0,
    ok: reason === "ok",
    reason,
    reminder_sent_count: counts.reminder_sent_count ?? 0,
    skipped_count: counts.skipped_count ?? 0,
    version: driverAckAutoReminderVersion,
  };
}

function createReminderClient(): ReminderClient | null {
  const supabaseUrl = text(process.env.SUPABASE_URL, 500);
  const serviceRoleKey = text(process.env.SUPABASE_SERVICE_ROLE_KEY, 4000);
  if (!supabaseUrl.startsWith("https://") || !serviceRoleKey) {
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

function eligibleCandidate(link: UnknownRecord, nowMs: number): boolean {
  const issuedAtMs = dateMs(link.issued_at) ?? dateMs(link.created_at);
  const expiresAtMs = dateMs(link.expires_at);
  const context = record(link.safe_link_context);

  return Boolean(
    uuidPattern.test(text(link.id, 80)) &&
      text(link.booking_reference, 120) &&
      positiveInteger(link.driver_id) &&
      link.link_status === "active" &&
      !link.revoked_at &&
      issuedAtMs !== null &&
      issuedAtMs <= nowMs - automaticReminderAgeMs &&
      expiresAtMs !== null &&
      expiresAtMs > nowMs &&
      !text(context.driver_acknowledged_at, 80) &&
      text(context.native_handoff_ciphertext, 1200),
  );
}

const schedulerActor = {
  actor_label: "Driver ACK scheduler",
  actor_role: "system" as const,
  source_surface: "system" as const,
};

function isSafeConcurrentSkip(reminderResult: AdminDriverAckReminderResult): boolean {
  return !reminderResult.ok && reminderResult.status === 409;
}

export async function runDriverAckAutoRemindersWithClient(
  client: ReminderClient,
  options: DriverAckAutoReminderOptions = {},
): Promise<DriverAckAutoReminderResult> {
  const now = new Date(options.now ?? new Date());
  const nowMs = now.getTime();
  if (!Number.isFinite(nowMs)) {
    return result("read_failed");
  }

  const dueBefore = new Date(nowMs - automaticReminderAgeMs).toISOString();
  const linkRead = await client
    .from("driver_job_links")
    .select(
      "id, booking_reference, driver_id, link_status, issued_at, expires_at, revoked_at, safe_link_context, created_at",
    )
    .eq("link_status", "active")
    .is("revoked_at", null)
    .lte("issued_at", dueBefore)
    .order("issued_at", { ascending: true })
    .limit(maximumCandidatesPerRun);
  if (linkRead.error) {
    return result("read_failed");
  }

  const candidates = rows(linkRead.data).filter((link) => eligibleCandidate(link, nowMs));
  if (candidates.length === 0) {
    return result("ok");
  }

  const candidateLinkIds = candidates.map((link) => text(link.id, 80));
  const reminderRead = await client
    .from("customer_driver_app_notification_outbox")
    .select("driver_job_link_id")
    .in("driver_job_link_id", candidateLinkIds)
    .eq("workflow_area", reminderWorkflowArea)
    .limit(maximumCandidatesPerRun * 3);
  if (reminderRead.error) {
    return result("read_failed", { candidate_count: candidates.length });
  }

  const existingReminderLinkIds = new Set(
    rows(reminderRead.data)
      .map((reminder) => text(reminder.driver_job_link_id, 80))
      .filter((linkId) => uuidPattern.test(linkId)),
  );
  const eligible = candidates.filter(
    (link) => !existingReminderLinkIds.has(text(link.id, 80)),
  );

  let failureCount = 0;
  let reminderSentCount = 0;
  let skippedCount = candidates.length - eligible.length;
  for (const link of eligible) {
    const reminderResult = await (options.sendReminder ?? createAdminDriverAckReminder)(
      client,
      {
        booking_reference: text(link.booking_reference, 120),
        driver_job_link_id: text(link.id, 80),
      },
      schedulerActor,
      {
        now,
        trigger: automaticReminderTrigger,
      },
    ).catch(() => null);

    if (reminderResult?.ok) {
      reminderSentCount += 1;
    } else if (reminderResult && isSafeConcurrentSkip(reminderResult)) {
      skippedCount += 1;
    } else {
      failureCount += 1;
    }
  }

  return result(failureCount > 0 ? "send_failed" : "ok", {
    candidate_count: candidates.length,
    eligible_count: eligible.length,
    failure_count: failureCount,
    reminder_sent_count: reminderSentCount,
    skipped_count: skippedCount,
  });
}

export async function runDriverAckAutoReminders(
  options: DriverAckAutoReminderOptions = {},
): Promise<DriverAckAutoReminderResult> {
  const client = createReminderClient();
  return client
    ? runDriverAckAutoRemindersWithClient(client, options)
    : result("configuration_error");
}
