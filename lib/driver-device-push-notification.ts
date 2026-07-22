import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import webPush, { type PushSubscription } from "web-push";

import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  isDriverJobLinkExpired,
} from "./driver-job-link.ts";

export const driverDevicePushNotificationVersion =
  "driver-device-push-notification-v1";
export const driverDevicePushEnabledEnvName =
  "PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED";

const driverDevicePushVapidPublicKeyEnvName =
  "PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PUBLIC_KEY";
const driverDevicePushVapidPrivateKeyEnvName =
  "PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PRIVATE_KEY";
const driverDevicePushContactEmailEnvName =
  "PRESTIGE_DRIVER_DEVICE_PUSH_CONTACT_EMAIL";
const driverDevicePushProviderTimeoutMs = 5000;
const driverDevicePushLinkSelect =
  "id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context, created_at";
const driverDevicePushSubscriptionSelect = "endpoint, p256dh, auth";

const requiredEnvNames = [
  driverDevicePushEnabledEnvName,
  driverDevicePushVapidPublicKeyEnvName,
  driverDevicePushVapidPrivateKeyEnvName,
  driverDevicePushContactEmailEnvName,
] as const;

type EnvInput = Record<string, string | undefined>;
type DriverDevicePushClient = Pick<SupabaseClient, "from">;
type UnknownRecord = Record<string, unknown>;

type DriverDevicePushProviderConfig = {
  contactEmail: string;
  privateKey: string;
  publicKey: string;
};

export type DriverDevicePushReadiness = {
  enabled: boolean;
  ok: true;
  public_key: string | null;
  ready: boolean;
  reason: "provider_not_configured" | "push_gate_closed" | "ready";
  required_env_names: readonly string[];
  version: typeof driverDevicePushNotificationVersion;
};

export type DriverDevicePushRegistrationResult = {
  database_write_enabled: boolean;
  enabled: boolean;
  error: string | null;
  link_key: string | null;
  ok: boolean;
  provider_send_enabled: false;
  reason:
    | "invalid_driver_link"
    | "invalid_subscription"
    | "not_requested"
    | "provider_not_configured"
    | "push_gate_closed"
    | "subscription_registered"
    | "subscription_write_failed"
    | "unverified_driver";
  subscription_registered: boolean;
  version: typeof driverDevicePushNotificationVersion;
};

export type DriverDevicePushAlertResult = {
  enabled: boolean;
  ok: boolean;
  provider_request_count: number;
  reason:
    | "invalid_driver_link"
    | "no_active_subscriptions"
    | "provider_failure"
    | "provider_not_configured"
    | "push_gate_closed"
    | "send_succeeded"
    | "subscription_load_failed";
  status: "blocked" | "failed" | "sent";
  version: typeof driverDevicePushNotificationVersion;
};

type DriverDevicePushSubscriptionInput = {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
};

type DriverDevicePushAlertInput = {
  booking_reference: string | null;
  delivery_surface: string | null;
  driver_job_link_id: string | null;
};

type DriverDevicePushPayload = {
  body: "New Driver Job app update. Tap to review.";
  job_key: string;
  tag: string;
  title: "Prestige Limo Ops";
  version: typeof driverDevicePushNotificationVersion;
};

export type DriverDevicePushSender = (
  subscription: PushSubscription,
  payload: DriverDevicePushPayload,
) => Promise<void>;

type DriverDevicePushAlertOptions = {
  env?: EnvInput;
  pushSender?: DriverDevicePushSender;
};

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : {};
}

function asRows(value: unknown): UnknownRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function cleanEnvValue(env: EnvInput, key: string): string | null {
  const value = env[key]?.trim();
  return value && value !== "..." && value !== "changeme" ? value : null;
}

function isTruthyGate(value: string | null): boolean {
  return value === "true" || value === "1" || value === "enabled";
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const clean = value.trim();
  return clean && clean.length <= maxLength ? clean : null;
}

function safePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

function safeUuid(value: unknown): string | null {
  const clean = safeText(value, 80);
  return clean && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(clean)
    ? clean
    : null;
}

function normalizeVapidSubject(value: string): string {
  return value.startsWith("mailto:") || value.startsWith("https://")
    ? value
    : `mailto:${value}`;
}

function resolveProviderConfig(env: EnvInput): DriverDevicePushProviderConfig | null {
  if (!isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName))) {
    return null;
  }

  const publicKey = cleanEnvValue(env, driverDevicePushVapidPublicKeyEnvName);
  const privateKey = cleanEnvValue(env, driverDevicePushVapidPrivateKeyEnvName);
  const contactEmail = cleanEnvValue(env, driverDevicePushContactEmailEnvName);

  if (
    !publicKey || publicKey.length < 12 ||
    !privateKey || privateKey.length < 12 ||
    !contactEmail || contactEmail.length < 6
  ) {
    return null;
  }

  return { contactEmail, privateKey, publicKey };
}

export function getDriverDevicePushReadiness(
  env: EnvInput = process.env,
): DriverDevicePushReadiness {
  const enabled = isTruthyGate(
    cleanEnvValue(env, driverDevicePushEnabledEnvName),
  );
  const config = resolveProviderConfig(env);

  return {
    enabled,
    ok: true,
    public_key: config?.publicKey ?? null,
    ready: Boolean(config),
    reason: !enabled
      ? "push_gate_closed"
      : config
        ? "ready"
        : "provider_not_configured",
    required_env_names: requiredEnvNames,
    version: driverDevicePushNotificationVersion,
  };
}

function parseSubscription(value: unknown): DriverDevicePushSubscriptionInput | null {
  const record = asRecord(value);
  const keys = asRecord(record.keys);
  const endpoint = safeText(record.endpoint, 2048);
  const p256dh = safeText(keys.p256dh, 512);
  const auth = safeText(keys.auth, 512);

  return endpoint && p256dh && auth
    ? { endpoint, keys: { auth, p256dh } }
    : null;
}

function linkIsActive(row: UnknownRecord): boolean {
  return row.link_status === "active" &&
    !row.revoked_at &&
    !isDriverJobLinkExpired(String(row.expires_at || "")) &&
    !isDriverJobLinkExpiryOutsideAllowedWindow(String(row.expires_at || ""));
}

function linkWasAcknowledged(row: UnknownRecord): boolean {
  return Boolean(safeText(asRecord(row.safe_link_context).driver_acknowledged_at, 80));
}

export function opaqueDriverJobLinkKey(linkId: string): string {
  return createHash("sha256")
    .update(`prestige-driver-device-alert:${linkId}`)
    .digest("hex");
}

function registrationResult(
  reason: DriverDevicePushRegistrationResult["reason"],
  options: {
    enabled?: boolean;
    error?: string | null;
    linkKey?: string | null;
    ok?: boolean;
    wrote?: boolean;
  } = {},
): DriverDevicePushRegistrationResult {
  return {
    database_write_enabled: options.wrote === true,
    enabled: options.enabled === true,
    error: options.error ?? null,
    link_key: options.linkKey ?? null,
    ok: options.ok === true,
    provider_send_enabled: false,
    reason,
    subscription_registered: options.wrote === true,
    version: driverDevicePushNotificationVersion,
  };
}

export async function registerDriverDevicePushSubscriptionForAcknowledgedLink(
  input: {
    client: DriverDevicePushClient;
    env?: EnvInput;
    subscription: unknown;
    token: string;
  },
): Promise<DriverDevicePushRegistrationResult> {
  if (input.subscription == null) {
    return registrationResult("not_requested");
  }

  const env = input.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  const config = resolveProviderConfig(env);
  if (!config) {
    return registrationResult(
      enabled ? "provider_not_configured" : "push_gate_closed",
      { enabled },
    );
  }

  const subscription = parseSubscription(input.subscription);
  if (!subscription) {
    return registrationResult("invalid_subscription", {
      enabled: true,
      error: "A valid device push subscription is required.",
    });
  }

  let tokenHash: string;
  try {
    tokenHash = hashDriverJobLinkToken(input.token);
  } catch {
    return registrationResult("invalid_driver_link", { enabled: true });
  }

  const { data: linkData, error: linkError } = await input.client
    .from("driver_job_links")
    .select(driverDevicePushLinkSelect)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const link = asRecord(linkData);
  const linkId = safeUuid(link.id);
  const driverId = safePositiveInteger(link.driver_id);

  if (linkError || !linkId || !linkIsActive(link) || !linkWasAcknowledged(link)) {
    return registrationResult("invalid_driver_link", { enabled: true });
  }

  if (!driverId) {
    return registrationResult("unverified_driver", { enabled: true });
  }

  const now = new Date().toISOString();
  const { error: writeError } = await input.client
    .from("driver_device_push_subscriptions")
    .upsert(
      {
        auth: subscription.keys.auth,
        driver_id: driverId,
        endpoint: subscription.endpoint,
        last_driver_job_link_id: linkId,
        p256dh: subscription.keys.p256dh,
        revoked_at: null,
        source_surface: "driver_job_acknowledgement",
        subscription_status: "active",
        updated_at: now,
      },
      { onConflict: "endpoint" },
    );

  if (writeError) {
    return registrationResult("subscription_write_failed", {
      enabled: true,
      error: "Driver device alert registration failed safely.",
    });
  }

  return registrationResult("subscription_registered", {
    enabled: true,
    linkKey: opaqueDriverJobLinkKey(linkId),
    ok: true,
    wrote: true,
  });
}

function alertResult(
  reason: DriverDevicePushAlertResult["reason"],
  options: {
    enabled?: boolean;
    ok?: boolean;
    providerRequestCount?: number;
    status?: DriverDevicePushAlertResult["status"];
  } = {},
): DriverDevicePushAlertResult {
  return {
    enabled: options.enabled === true,
    ok: options.ok === true,
    provider_request_count: options.providerRequestCount ?? 0,
    reason,
    status: options.status ?? "blocked",
    version: driverDevicePushNotificationVersion,
  };
}

async function resolveAlertDriverLink(
  client: DriverDevicePushClient,
  input: DriverDevicePushAlertInput,
): Promise<UnknownRecord | null> {
  const linkId = safeUuid(input.driver_job_link_id);
  if (linkId) {
    const { data, error } = await client
      .from("driver_job_links")
      .select(driverDevicePushLinkSelect)
      .eq("id", linkId)
      .maybeSingle();
    const row = asRecord(data);
    return !error && linkIsActive(row) ? row : null;
  }

  const bookingReference = safeText(input.booking_reference, 120);
  if (!bookingReference) {
    return null;
  }

  const { data, error } = await client
    .from("driver_job_links")
    .select(driverDevicePushLinkSelect)
    .eq("booking_reference", bookingReference)
    .eq("link_status", "active")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    return null;
  }

  return asRows(data).find((row) => linkIsActive(row) && linkWasAcknowledged(row)) ?? null;
}

function toPushSubscription(row: UnknownRecord): PushSubscription | null {
  const endpoint = safeText(row.endpoint, 2048);
  const p256dh = safeText(row.p256dh, 512);
  const auth = safeText(row.auth, 512);
  return endpoint && p256dh && auth
    ? { endpoint, keys: { auth, p256dh } }
    : null;
}

function safePayload(linkId: string): DriverDevicePushPayload {
  const jobKey = opaqueDriverJobLinkKey(linkId);
  return {
    body: "New Driver Job app update. Tap to review.",
    job_key: jobKey,
    tag: `prestige-driver-update-${jobKey.slice(0, 24)}`,
    title: "Prestige Limo Ops",
    version: driverDevicePushNotificationVersion,
  };
}

async function sendWebPush(
  config: DriverDevicePushProviderConfig,
  subscription: PushSubscription,
  payload: DriverDevicePushPayload,
): Promise<void> {
  webPush.setVapidDetails(
    normalizeVapidSubject(config.contactEmail),
    config.publicKey,
    config.privateKey,
  );
  await webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 3600,
    timeout: driverDevicePushProviderTimeoutMs,
    urgency: "high",
  });
}

function providerStatusCode(error: unknown): number | null {
  const statusCode = asRecord(error).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

async function recordDeliveryHealth(
  client: DriverDevicePushClient,
  subscription: PushSubscription,
  error: unknown | null,
) {
  const now = new Date().toISOString();
  const statusCode = providerStatusCode(error);
  const stale = statusCode === 404 || statusCode === 410;
  const update: UnknownRecord = error
    ? {
        last_failure_at: now,
        subscription_status: stale ? "revoked" : "active",
        updated_at: now,
        ...(stale ? { revoked_at: now } : {}),
      }
    : {
        last_success_at: now,
        updated_at: now,
      };

  try {
    await client
      .from("driver_device_push_subscriptions")
      .update(update)
      .eq("endpoint", subscription.endpoint);
  } catch {
    // Delivery health is best-effort and never changes the saved App Update.
  }
}

export async function sendDriverDevicePushAlertForAppUpdate(
  client: DriverDevicePushClient,
  input: DriverDevicePushAlertInput,
  options: DriverDevicePushAlertOptions = {},
): Promise<DriverDevicePushAlertResult> {
  if (input.delivery_surface !== "driver_app") {
    return alertResult("invalid_driver_link");
  }

  const env = options.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  const config = resolveProviderConfig(env);
  if (!config) {
    return alertResult(enabled ? "provider_not_configured" : "push_gate_closed", {
      enabled,
    });
  }

  const link = await resolveAlertDriverLink(client, input);
  const linkId = safeUuid(link?.id);
  const driverId = safePositiveInteger(link?.driver_id);
  if (!link || !linkId || !driverId || !linkWasAcknowledged(link)) {
    return alertResult("invalid_driver_link", { enabled: true });
  }

  let subscriptions: PushSubscription[];
  try {
    const { data, error } = await client
      .from("driver_device_push_subscriptions")
      .select(driverDevicePushSubscriptionSelect)
      .eq("driver_id", driverId)
      .eq("subscription_status", "active")
      .limit(10);
    if (error) {
      return alertResult("subscription_load_failed", { enabled: true });
    }
    subscriptions = asRows(data)
      .map(toPushSubscription)
      .filter((value): value is PushSubscription => Boolean(value));
  } catch {
    return alertResult("subscription_load_failed", { enabled: true });
  }

  if (subscriptions.length === 0) {
    return alertResult("no_active_subscriptions", { enabled: true });
  }

  const payload = safePayload(linkId);
  const sender = options.pushSender ??
    ((subscription: PushSubscription, pushPayload: DriverDevicePushPayload) =>
      sendWebPush(config, subscription, pushPayload));
  const shouldRecordHealth = !options.pushSender;
  const results = await Promise.allSettled(
    subscriptions.map((subscription) => sender(subscription, payload)),
  );

  if (shouldRecordHealth) {
    await Promise.all(
      subscriptions.map((subscription, index) =>
        recordDeliveryHealth(
          client,
          subscription,
          results[index].status === "rejected" ? results[index].reason : null,
        ),
      ),
    );
  }

  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  return succeeded > 0
    ? alertResult("send_succeeded", {
        enabled: true,
        ok: true,
        providerRequestCount: subscriptions.length,
        status: "sent",
      })
    : alertResult("provider_failure", {
        enabled: true,
        providerRequestCount: subscriptions.length,
        status: "failed",
      });
}
