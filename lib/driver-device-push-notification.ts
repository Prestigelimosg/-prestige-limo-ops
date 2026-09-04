import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import webPush, { type PushSubscription } from "web-push";

import {
  hashDriverJobLinkToken,
  isDriverJobLinkExpiryOutsideAllowedWindow,
  isDriverJobLinkExpired,
} from "./driver-job-link.ts";
import {
  releaseNativePushBadgeCount,
  reserveNativePushBadgeCount,
  resetNativePushBadgeCount,
} from "./native-push-badge-count.ts";

export const driverDevicePushNotificationVersion =
  "driver-device-push-notification-v2";
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
  "id, booking_reference, driver_id, link_status, expires_at, revoked_at, safe_link_context, created_at, token_hash";
const driverDevicePushSubscriptionSelect = "endpoint, p256dh, auth, source_surface";
const driverNativePushSubscriptionSource = "driver_native_ios";
const driverNativePushSubscriptionSentinel = "native_expo_push_token";
const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";

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
  native_provider_accepted: boolean;
  native_provider_request_count: number;
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

export type DriverNativeDeviceAlertUpdateResult = {
  job_key: string | null;
  ok: boolean;
  reason:
    | "invalid_driver_link"
    | "invalid_subscription"
    | "provider_not_configured"
    | "push_gate_closed"
    | "subscription_registered"
    | "subscription_unregistered"
    | "subscription_write_failed"
    | "unverified_driver";
  registered: boolean;
  unregistered: boolean;
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
  notification_id?: string | null;
  recipient_driver_id?: unknown;
  safe_message?: string | null;
  workflow_area?: string | null;
};

type DriverNativePushOpenTarget = "available_jobs" | "messages";
type DriverNativePushVisibleBody =
  | "A driver-pool job is available. Open the app to review."
  | "Job reassigned, do not proceed."
  | "Job update available"
  | "Job acknowledgement needed. Tap to review."
  | "New job offer available. Open Driver Portal."
  | "New job available. Tap to review."
  | "Pickup is in 1 hour. Open Driver Portal to review.";

type DriverDevicePushPayload = {
  body:
    | "A driver-pool job is available. Open the app to review."
    | "Job reassigned, do not proceed."
    | "New Driver Job app update. Tap to review."
    | "New Driver Job issued. Tap to review."
    | "Pickup is in 1 hour. Open Driver Portal to review.";
  job_key: string;
  tag: string;
  target_path?: string;
  title: "Prestige Limo Ops";
  version: typeof driverDevicePushNotificationVersion;
};

export type DriverDevicePushSender = (
  subscription: PushSubscription,
  payload: DriverDevicePushPayload,
) => Promise<void>;

export type DriverNativePushSender = (
  expoPushToken: string,
  jobKey: string,
  openTarget: DriverNativePushOpenTarget | null,
  visibleBody: DriverNativePushVisibleBody,
  badgeCount?: number,
) => Promise<void>;

type DriverDevicePushAlertOptions = {
  badgeClient?: DriverDevicePushClient;
  env?: EnvInput;
  nativeFetch?: typeof fetch;
  nativePushSender?: DriverNativePushSender;
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

function parseExpoPushToken(value: unknown): string | null {
  const token = safeText(value, 512);
  return token && /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{20,400}\]$/.test(token)
    ? token
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

function nativeDeviceAlertUpdateResult(
  reason: DriverNativeDeviceAlertUpdateResult["reason"],
  options: {
    jobKey?: string | null;
    ok?: boolean;
    registered?: boolean;
    unregistered?: boolean;
  } = {},
): DriverNativeDeviceAlertUpdateResult {
  return {
    job_key: options.jobKey ?? null,
    ok: options.ok === true,
    reason,
    registered: options.registered === true,
    unregistered: options.unregistered === true,
  };
}

async function resolveAcknowledgedDriverLinkForToken(
  client: DriverDevicePushClient,
  token: string,
) {
  let tokenHash: string;
  try {
    tokenHash = hashDriverJobLinkToken(token);
  } catch {
    return null;
  }

  const { data, error } = await client
    .from("driver_job_links")
    .select(driverDevicePushLinkSelect)
    .eq("token_hash", tokenHash)
    .maybeSingle();
  const link = asRecord(data);
  const linkId = safeUuid(link.id);
  const driverId = safePositiveInteger(link.driver_id);

  return !error && linkId && driverId && linkIsActive(link) && linkWasAcknowledged(link)
    ? { driverId, linkId }
    : null;
}

export async function registerDriverNativeDevicePushSubscriptionForAcknowledgedLink(
  input: {
    client: DriverDevicePushClient;
    env?: EnvInput;
    expoPushToken: unknown;
    token: string;
  },
): Promise<DriverNativeDeviceAlertUpdateResult> {
  const env = input.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  if (!resolveProviderConfig(env)) {
    return nativeDeviceAlertUpdateResult(
      enabled ? "provider_not_configured" : "push_gate_closed",
    );
  }

  const expoPushToken = parseExpoPushToken(input.expoPushToken);
  if (!expoPushToken) {
    return nativeDeviceAlertUpdateResult("invalid_subscription");
  }

  const link = await resolveAcknowledgedDriverLinkForToken(input.client, input.token);
  if (!link) {
    return nativeDeviceAlertUpdateResult("invalid_driver_link");
  }

  const now = new Date().toISOString();
  const { error } = await input.client
    .from("driver_device_push_subscriptions")
    .upsert(
      {
        auth: driverNativePushSubscriptionSentinel,
        driver_id: link.driverId,
        endpoint: expoPushToken,
        last_driver_job_link_id: link.linkId,
        p256dh: driverNativePushSubscriptionSentinel,
        revoked_at: null,
        source_surface: "driver_native_ios",
        subscription_status: "active",
        updated_at: now,
      },
      { onConflict: "endpoint" },
    );

  if (!error) {
    await resetNativePushBadgeCount(input.client, {
      table: "driver_device_push_subscriptions",
      token: expoPushToken,
      tokenColumn: "endpoint",
    }).catch(() => false);
  }

  return error
    ? nativeDeviceAlertUpdateResult("subscription_write_failed")
    : nativeDeviceAlertUpdateResult("subscription_registered", {
        jobKey: opaqueDriverJobLinkKey(link.linkId),
        ok: true,
        registered: true,
      });
}

export async function unregisterDriverNativeDevicePushSubscriptionForAcknowledgedLink(
  input: {
    client: DriverDevicePushClient;
    expoPushToken: unknown;
    token: string;
  },
): Promise<DriverNativeDeviceAlertUpdateResult> {
  const expoPushToken = parseExpoPushToken(input.expoPushToken);
  if (!expoPushToken) {
    return nativeDeviceAlertUpdateResult("invalid_subscription");
  }

  const link = await resolveAcknowledgedDriverLinkForToken(input.client, input.token);
  if (!link) {
    return nativeDeviceAlertUpdateResult("invalid_driver_link");
  }

  const now = new Date().toISOString();
  const { error } = await input.client
    .from("driver_device_push_subscriptions")
    .update({
      revoked_at: now,
      subscription_status: "revoked",
      updated_at: now,
    })
    .eq("driver_id", link.driverId)
    .eq("endpoint", expoPushToken)
    .eq("source_surface", driverNativePushSubscriptionSource);

  return error
    ? nativeDeviceAlertUpdateResult("subscription_write_failed")
    : nativeDeviceAlertUpdateResult("subscription_unregistered", {
        ok: true,
        unregistered: true,
      });
}

export async function registerDriverDevicePushSubscriptionForPortalSession(
  input: {
    client: DriverDevicePushClient;
    driverId: unknown;
    env?: EnvInput;
    subscription: unknown;
  },
): Promise<DriverDevicePushRegistrationResult> {
  const env = input.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  const config = resolveProviderConfig(env);
  if (!config) {
    return registrationResult(
      enabled ? "provider_not_configured" : "push_gate_closed",
      { enabled },
    );
  }

  const driverId = safePositiveInteger(input.driverId);
  if (!driverId) {
    return registrationResult("unverified_driver", { enabled: true });
  }

  const subscription = parseSubscription(input.subscription);
  if (!subscription) {
    return registrationResult("invalid_subscription", {
      enabled: true,
      error: "A valid device push subscription is required.",
    });
  }

  const now = new Date().toISOString();
  const { error: writeError } = await input.client
    .from("driver_device_push_subscriptions")
    .upsert(
      {
        auth: subscription.keys.auth,
        driver_id: driverId,
        endpoint: subscription.endpoint,
        last_driver_job_link_id: null,
        p256dh: subscription.keys.p256dh,
        revoked_at: null,
        source_surface: "driver_portal",
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
    ok: true,
    wrote: true,
  });
}

function alertResult(
  reason: DriverDevicePushAlertResult["reason"],
  options: {
    enabled?: boolean;
    nativeProviderAccepted?: boolean;
    nativeProviderRequestCount?: number;
    ok?: boolean;
    providerRequestCount?: number;
    status?: DriverDevicePushAlertResult["status"];
  } = {},
): DriverDevicePushAlertResult {
  return {
    enabled: options.enabled === true,
    native_provider_accepted: options.nativeProviderAccepted === true,
    native_provider_request_count: options.nativeProviderRequestCount ?? 0,
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

type ReassignedDriverNotificationTarget = {
  driverId: number;
  targetId: string;
};

async function resolveReassignedDriverNotificationTarget(
  client: DriverDevicePushClient,
  input: DriverDevicePushAlertInput,
): Promise<ReassignedDriverNotificationTarget | null> {
  const notificationId = safeUuid(input.notification_id);
  const bookingReference = safeText(input.booking_reference, 120);
  const recipientDriverId = safePositiveInteger(input.recipient_driver_id);
  const requestedLinkId = input.driver_job_link_id === null
    ? null
    : safeUuid(input.driver_job_link_id);

  if (
    !notificationId ||
    !bookingReference ||
    !recipientDriverId ||
    input.delivery_surface !== "driver_app" ||
    input.workflow_area !== "driver_reassignment" ||
    input.safe_message !== "Job reassigned, do not proceed." ||
    (input.driver_job_link_id !== null && !requestedLinkId)
  ) {
    return null;
  }

  const { data: notificationData, error: notificationError } = await client
    .from("customer_driver_app_notification_outbox")
    .select(
      "id, notification_type, notification_status, priority, delivery_surface, booking_reference, driver_job_link_id, workflow_area, safe_title, safe_message, safe_context",
    )
    .eq("id", notificationId)
    .maybeSingle();
  const notification = asRecord(notificationData);
  const storedLinkId = notification.driver_job_link_id === null
    ? null
    : safeUuid(notification.driver_job_link_id);
  const safeContext = asRecord(notification.safe_context);
  if (
    notificationError ||
    safeUuid(notification.id) !== notificationId ||
    notification.notification_type !== "booking_status" ||
    notification.notification_status !== "queued" ||
    notification.priority !== "urgent" ||
    notification.delivery_surface !== "driver_app" ||
    notification.booking_reference !== bookingReference ||
    notification.workflow_area !== "driver_reassignment" ||
    notification.safe_title !== "Prestige Driver" ||
    notification.safe_message !== "Job reassigned, do not proceed." ||
    safeContext.audience !== "replaced_driver" ||
    safeContext.source !== "save_driver_assignment" ||
    storedLinkId !== requestedLinkId
  ) {
    return null;
  }

  if (!storedLinkId) {
    const { data: driverData, error: driverError } = await client
      .from("drivers")
      .select("id")
      .eq("id", recipientDriverId)
      .maybeSingle();

    return !driverError && safePositiveInteger(asRecord(driverData).id) === recipientDriverId
      ? { driverId: recipientDriverId, targetId: notificationId }
      : null;
  }

  const { data: linkData, error: linkError } = await client
    .from("driver_job_links")
    .select(driverDevicePushLinkSelect)
    .eq("id", storedLinkId)
    .maybeSingle();
  const link = asRecord(linkData);
  return !linkError &&
    safeUuid(link.id) === storedLinkId &&
    link.booking_reference === bookingReference &&
    safePositiveInteger(link.driver_id) === recipientDriverId &&
    link.link_status === "expired" &&
    link.revoked_at === null
    ? { driverId: recipientDriverId, targetId: storedLinkId }
    : null;
}

function toPushSubscription(row: UnknownRecord): PushSubscription | null {
  const endpoint = safeText(row.endpoint, 2048);
  const p256dh = safeText(row.p256dh, 512);
  const auth = safeText(row.auth, 512);
  return endpoint && p256dh && auth
    ? { endpoint, keys: { auth, p256dh } }
    : null;
}

type LoadedDriverSubscription = {
  channel: "native_ios" | "web";
  endpoint: string;
  webSubscription: PushSubscription | null;
};

function toLoadedDriverSubscription(row: UnknownRecord): LoadedDriverSubscription | null {
  const endpoint = safeText(row.endpoint, 2048);
  if (!endpoint) {
    return null;
  }

  if (row.source_surface === driverNativePushSubscriptionSource) {
    return parseExpoPushToken(endpoint)
      ? { channel: "native_ios", endpoint, webSubscription: null }
      : null;
  }

  const webSubscription = toPushSubscription(row);
  return webSubscription
    ? { channel: "web", endpoint, webSubscription }
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

function reassignmentPayload(targetId: string): DriverDevicePushPayload {
  const jobKey = opaqueDriverJobLinkKey(targetId);
  return {
    body: "Job reassigned, do not proceed.",
    job_key: jobKey,
    tag: `prestige-driver-update-${jobKey.slice(0, 24)}`,
    title: "Prestige Limo Ops",
    version: driverDevicePushNotificationVersion,
  };
}

function newJobPayload(linkId: string, token: string): DriverDevicePushPayload | null {
  const cleanToken = safeText(token, 512);
  if (!cleanToken || !/^[A-Za-z0-9_-]{20,512}$/.test(cleanToken)) {
    return null;
  }

  const jobKey = opaqueDriverJobLinkKey(linkId);
  return {
    body: "New Driver Job issued. Tap to review.",
    job_key: jobKey,
    tag: `prestige-driver-update-${jobKey.slice(0, 24)}`,
    target_path: `/driver-job/${encodeURIComponent(cleanToken)}`,
    title: "Prestige Limo Ops",
    version: driverDevicePushNotificationVersion,
  };
}

function pickupReminderPayload(linkId: string): DriverDevicePushPayload {
  const jobKey = opaqueDriverJobLinkKey(linkId);
  return {
    body: "Pickup is in 1 hour. Open Driver Portal to review.",
    job_key: jobKey,
    tag: `prestige-driver-update-${jobKey.slice(0, 24)}`,
    title: "Prestige Limo Ops",
    version: driverDevicePushNotificationVersion,
  };
}

function driverPoolOfferPayload(offerKey: string): DriverDevicePushPayload {
  const jobKey = createHash("sha256")
    .update(`prestige-driver-pool-offer:${offerKey}`)
    .digest("hex");
  return {
    body: "A driver-pool job is available. Open the app to review.",
    job_key: jobKey,
    tag: `prestige-driver-pool-${jobKey.slice(0, 24)}`,
    target_path: "/driver-portal?view=available-jobs",
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

async function sendNativePush(
  expoPushToken: string,
  jobKey: string,
  openTarget: DriverNativePushOpenTarget | null,
  visibleBody: DriverNativePushVisibleBody,
  badgeCount?: number,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), driverDevicePushProviderTimeoutMs);

  try {
    const response = await fetcher(expoPushEndpoint, {
      body: JSON.stringify({
        ...(badgeCount ? { badge: badgeCount } : {}),
        body: visibleBody,
        data: {
          job_key: jobKey,
          ...(openTarget ? { open_target: openTarget } : {}),
        },
        priority: "high",
        sound: "default",
        title: "Prestige Driver",
        to: expoPushToken,
      }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const body = asRecord(await response.json().catch(() => null));
    const ticket = Array.isArray(body.data)
      ? asRecord(body.data[0])
      : asRecord(body.data);

    if (!response.ok || ticket.status !== "ok") {
      const error = new Error("Native push provider rejected the request.") as Error & {
        statusCode?: number;
      };
      error.statusCode = asRecord(ticket.details).error === "DeviceNotRegistered"
        ? 410
        : response.status || 502;
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function providerStatusCode(error: unknown): number | null {
  const statusCode = asRecord(error).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

async function recordDeliveryHealth(
  client: DriverDevicePushClient,
  endpoint: string,
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
      .eq("endpoint", endpoint);
  } catch {
    // Delivery health is best-effort and never changes the saved App Update.
  }
}

async function loadActiveDriverSubscriptions(
  client: DriverDevicePushClient,
  driverId: number,
): Promise<{ ok: boolean; subscriptions: LoadedDriverSubscription[] }> {
  try {
    const { data, error } = await client
      .from("driver_device_push_subscriptions")
      .select(driverDevicePushSubscriptionSelect)
      .eq("driver_id", driverId)
      .eq("subscription_status", "active")
      .limit(10);
    if (error) {
      return { ok: false, subscriptions: [] };
    }
    return {
      ok: true,
      subscriptions: asRows(data)
        .map(toLoadedDriverSubscription)
        .filter((value): value is LoadedDriverSubscription => Boolean(value)),
    };
  } catch {
    return { ok: false, subscriptions: [] };
  }
}

async function driverHasActiveOnePhoneAccount(
  client: DriverDevicePushClient,
  driverId: number,
) {
  try {
    const { data, error } = await client
      .from("driver_access_accounts")
      .select("id, active_device_id_hash")
      .eq("driver_reference", String(driverId))
      .eq("account_status", "active")
      .maybeSingle();
    const account = asRecord(data);
    return !error &&
      Boolean(safeUuid(account.id)) &&
      /^[0-9a-f]{64}$/.test(safeText(account.active_device_id_hash, 64) || "");
  } catch {
    return false;
  }
}

async function sendPayloadToDriverSubscriptions(
  client: DriverDevicePushClient,
  driverId: number,
  payload: DriverDevicePushPayload,
  config: DriverDevicePushProviderConfig,
  options: DriverDevicePushAlertOptions,
  nativeOpenTarget: DriverNativePushOpenTarget | null = null,
  nativeVisibleBody: DriverNativePushVisibleBody = "Job update available",
  nativeJobKey: string | null = payload.target_path ? null : payload.job_key,
  requireSingleNativeSubscription = false,
  nativeOnly = false,
): Promise<DriverDevicePushAlertResult> {
  const loaded = await loadActiveDriverSubscriptions(client, driverId);
  if (!loaded.ok) {
    return alertResult("subscription_load_failed", { enabled: true });
  }
  if (loaded.subscriptions.length === 0) {
    return alertResult("no_active_subscriptions", { enabled: true });
  }

  const sender = options.pushSender ??
    ((subscription: PushSubscription, pushPayload: DriverDevicePushPayload) =>
      sendWebPush(config, subscription, pushPayload));
  const shouldRecordHealth = !options.pushSender;
  const badgeClient = options.badgeClient ??
    (!options.nativePushSender && !options.pushSender ? client : null);
  const nativeSubscriptionCount = loaded.subscriptions.filter(
    (subscription) => subscription.channel === "native_ios",
  ).length;
  const nativeIsEligible = Boolean(nativeJobKey) &&
    (!requireSingleNativeSubscription || nativeSubscriptionCount === 1);
  const eligibleSubscriptions = loaded.subscriptions.filter((subscription) =>
    nativeOnly
      ? subscription.channel === "native_ios" && nativeIsEligible
      : subscription.channel === "web" || nativeIsEligible
  );
  if (eligibleSubscriptions.length === 0) {
    return alertResult("no_active_subscriptions", { enabled: true });
  }
  const results = await Promise.allSettled(
    eligibleSubscriptions.map(async (subscription) => {
      if (subscription.channel !== "native_ios") {
        return sender(subscription.webSubscription!, payload);
      }

      const badgeReservation = badgeClient
        ? await reserveNativePushBadgeCount(badgeClient, {
            table: "driver_device_push_subscriptions",
            token: subscription.endpoint,
            tokenColumn: "endpoint",
          }).catch(() => null)
        : null;
      try {
        return options.nativePushSender
          ? await options.nativePushSender(
              subscription.endpoint,
              nativeJobKey!,
              nativeOpenTarget,
              nativeVisibleBody,
              badgeReservation?.count,
            )
          : await sendNativePush(
              subscription.endpoint,
              nativeJobKey!,
              nativeOpenTarget,
              nativeVisibleBody,
              badgeReservation?.count,
              options.nativeFetch,
            );
      } catch (error) {
        if (badgeReservation) {
          await releaseNativePushBadgeCount(badgeClient!, badgeReservation).catch(() => false);
        }
        throw error;
      }
    }),
  );

  if (shouldRecordHealth && !options.nativePushSender) {
    await Promise.all(
      eligibleSubscriptions.map((subscription, index) =>
        recordDeliveryHealth(
          client,
          subscription.endpoint,
          results[index].status === "rejected" ? results[index].reason : null,
        ),
      ),
    );
  }

  const succeeded = results.filter((result) => result.status === "fulfilled").length;
  const nativeProviderRequestCount = eligibleSubscriptions.filter(
    (subscription) => subscription.channel === "native_ios",
  ).length;
  const nativeProviderAccepted = eligibleSubscriptions.some(
    (subscription, index) =>
      subscription.channel === "native_ios" && results[index]?.status === "fulfilled",
  );
  return succeeded > 0
    ? alertResult("send_succeeded", {
        enabled: true,
        nativeProviderAccepted,
        nativeProviderRequestCount,
        ok: true,
        providerRequestCount: eligibleSubscriptions.length,
        status: "sent",
      })
    : alertResult("provider_failure", {
        enabled: true,
        nativeProviderAccepted,
        nativeProviderRequestCount,
        providerRequestCount: eligibleSubscriptions.length,
        status: "failed",
      });
}

export async function sendDriverNativePendingAckReminder(
  client: DriverDevicePushClient,
  input: {
    driver_id: unknown;
    driver_job_link_id: string;
  },
  options: DriverDevicePushAlertOptions = {},
): Promise<DriverDevicePushAlertResult> {
  const env = options.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  const config = resolveProviderConfig(env);
  if (!config) {
    return alertResult(enabled ? "provider_not_configured" : "push_gate_closed", {
      enabled,
    });
  }

  const link = await resolveAlertDriverLink(client, {
    booking_reference: null,
    delivery_surface: "driver_app",
    driver_job_link_id: input.driver_job_link_id,
  });
  const linkId = safeUuid(link?.id);
  const driverId = safePositiveInteger(input.driver_id);
  const linkDriverId = safePositiveInteger(link?.driver_id);
  const nativeHandoffAvailable = Boolean(
    safeText(asRecord(link?.safe_link_context).native_handoff_ciphertext, 1200),
  );
  if (
    !link ||
    !linkId ||
    !driverId ||
    linkDriverId !== driverId ||
    linkWasAcknowledged(link) ||
    !nativeHandoffAvailable ||
    !(await driverHasActiveOnePhoneAccount(client, driverId))
  ) {
    return alertResult("invalid_driver_link", { enabled: true });
  }

  const payload = safePayload(linkId);
  return sendPayloadToDriverSubscriptions(
    client,
    driverId,
    payload,
    config,
    options,
    null,
    "Job acknowledgement needed. Tap to review.",
    payload.job_key,
    true,
    true,
  );
}

export async function sendDriverDevicePushAlertForNewJobLink(
  client: DriverDevicePushClient,
  input: {
    driver_job_link_id: string;
    driver_job_token: string;
  },
  options: DriverDevicePushAlertOptions = {},
): Promise<DriverDevicePushAlertResult> {
  const env = options.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  const config = resolveProviderConfig(env);
  if (!config) {
    return alertResult(enabled ? "provider_not_configured" : "push_gate_closed", {
      enabled,
    });
  }

  let tokenHash: string;
  try {
    tokenHash = hashDriverJobLinkToken(input.driver_job_token);
  } catch {
    return alertResult("invalid_driver_link", { enabled: true });
  }

  const link = await resolveAlertDriverLink(client, {
    booking_reference: null,
    delivery_surface: "driver_app",
    driver_job_link_id: input.driver_job_link_id,
  });
  const linkId = safeUuid(link?.id);
  const driverId = safePositiveInteger(link?.driver_id);
  const exactToken = safeText(link?.token_hash, 128) === tokenHash;
  const nativeHandoffAvailable = Boolean(
    safeText(asRecord(link?.safe_link_context).native_handoff_ciphertext, 1200),
  );
  const payload = linkId ? newJobPayload(linkId, input.driver_job_token) : null;
  if (!link || !linkId || !driverId || !exactToken || !payload) {
    return alertResult("invalid_driver_link", { enabled: true });
  }
  const nativeAccountEligible = nativeHandoffAvailable &&
    await driverHasActiveOnePhoneAccount(client, driverId);

  return sendPayloadToDriverSubscriptions(
    client,
    driverId,
    payload,
    config,
    options,
    null,
    "New job available. Tap to review.",
    nativeAccountEligible ? payload.job_key : null,
    true,
  );
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

  if (input.workflow_area === "driver_reassignment") {
    const target = await resolveReassignedDriverNotificationTarget(client, input);
    if (!target) {
      return alertResult("invalid_driver_link", { enabled: true });
    }

    const payload = reassignmentPayload(target.targetId);
    return sendPayloadToDriverSubscriptions(
      client,
      target.driverId,
      payload,
      config,
      options,
      null,
      "Job reassigned, do not proceed.",
      payload.job_key,
    );
  }

  const link = await resolveAlertDriverLink(client, input);
  const linkId = safeUuid(link?.id);
  const driverId = safePositiveInteger(link?.driver_id);
  if (!link || !linkId || !driverId || !linkWasAcknowledged(link)) {
    return alertResult("invalid_driver_link", { enabled: true });
  }

  const payload = safePayload(linkId);
  const nativeOpenTarget = input.workflow_area === "admin_driver_job_messages"
    ? "messages"
    : null;
  return sendPayloadToDriverSubscriptions(
    client,
    driverId,
    payload,
    config,
    options,
    nativeOpenTarget,
  );
}

export async function sendDriverDevicePushAlertForDriverPoolOffer(
  client: DriverDevicePushClient,
  input: { driver_id: unknown; offer_key: unknown },
  options: DriverDevicePushAlertOptions = {},
): Promise<DriverDevicePushAlertResult> {
  const driverId = safePositiveInteger(input.driver_id);
  const offerKey = safeText(input.offer_key, 64)?.toLowerCase() || "";
  if (!driverId || !/^[0-9a-f]{64}$/.test(offerKey)) {
    return alertResult("invalid_driver_link");
  }
  const env = options.env ?? process.env;
  const enabled = isTruthyGate(cleanEnvValue(env, driverDevicePushEnabledEnvName));
  const config = resolveProviderConfig(env);
  if (!config) {
    return alertResult(enabled ? "provider_not_configured" : "push_gate_closed", { enabled });
  }
  if (!(await driverHasActiveOnePhoneAccount(client, driverId))) {
    return alertResult("invalid_driver_link", { enabled: true });
  }
  const payload = driverPoolOfferPayload(offerKey);
  return sendPayloadToDriverSubscriptions(
    client,
    driverId,
    payload,
    config,
    options,
    "available_jobs",
    "A driver-pool job is available. Open the app to review.",
    payload.job_key,
    false,
  );
}

export async function sendDriverDevicePushAlertForPickupReminder(
  client: DriverDevicePushClient,
  input: DriverDevicePushAlertInput & {
    driver_id: unknown;
    notification_id?: string | null;
  },
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
  const driverId = safePositiveInteger(input.driver_id);
  const linkDriverId = safePositiveInteger(link?.driver_id);
  const bookingReference = safeText(input.booking_reference, 120);
  const linkBookingReference = safeText(link?.booking_reference, 120);
  if (
    !link ||
    !linkId ||
    !driverId ||
    linkDriverId !== driverId ||
    !bookingReference ||
    linkBookingReference !== bookingReference
  ) {
    return alertResult("invalid_driver_link", { enabled: true });
  }

  return sendPayloadToDriverSubscriptions(
    client,
    driverId,
    pickupReminderPayload(linkId),
    config,
    options,
    null,
    "Pickup is in 1 hour. Open Driver Portal to review.",
  );
}
