import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webPush, { type PushSubscription } from "web-push";

import type { AdminBookingPersistenceRecord } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";
import {
  releaseNativePushBadgeCount,
  reserveNativePushBadgeCount,
  resetNativePushBadgeCount,
} from "./native-push-badge-count";

export const adminDevicePushNotificationVersion =
  "admin-device-push-notification-v1";

export const adminDevicePushNotificationEnvGateName =
  "PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED";

const adminDevicePushVapidPublicKeyName =
  "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY";
const adminDevicePushVapidPrivateKeyName =
  "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY";
const adminDevicePushContactEmailName =
  "PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL";
const supabaseUrlName = "SUPABASE_URL";
const supabaseServiceRoleKeyName = "SUPABASE_SERVICE_ROLE_KEY";
const adminDevicePushProviderTimeoutMs = 5000;
const adminNativePushSubscriptionSource = "admin_native_ios";
const adminNativePushSubscriptionSentinel = "native_expo_push_token";
const adminBrowserPushSubscriptionSource = "admin_dashboard";
const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";
const adminNativeDeviceLabelPrefix = "admin-native-ios:";

const requiredEnvNames = [
  adminDevicePushNotificationEnvGateName,
  adminDevicePushVapidPublicKeyName,
  adminDevicePushVapidPrivateKeyName,
  adminDevicePushContactEmailName,
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  supabaseUrlName,
  supabaseServiceRoleKeyName,
] as const;

const forbiddenPayloadFragments = [
  "payout",
  "paynow",
  "billing",
  "payment",
  "invoice",
  "pdf",
  "parser",
  "debug",
  "secret",
  "token",
  "internal note",
  "provider",
  "flightaware",
  "gps",
  "live location",
  "driver location",
  "price",
] as const;

type EnvInput = Record<string, string | undefined>;

type AdminDevicePushReadiness = {
  ok: boolean;
  enabled: boolean;
  ready: boolean;
  version: string;
  public_key: string | null;
  required_env_names: readonly string[];
  reason:
    | "push_gate_closed"
    | "provider_not_configured"
    | "ready";
};

type AdminDevicePushConfig = {
  publicKey: string;
  privateKey: string;
  contactEmail: string;
  supabaseUrl: string;
  supabaseServiceRoleKey: string;
};

type AdminDevicePushSubscriptionInput = {
  channel: "web";
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  device_label: string | null;
};

type AdminNativePushSubscriptionInput = {
  channel: "native_ios";
  endpoint: string;
  installationId: string;
};

type ParsedAdminDevicePushSubscriptionInput =
  | AdminDevicePushSubscriptionInput
  | AdminNativePushSubscriptionInput;

type AdminDevicePushSubscriptionSummary = {
  id: string | null;
  device_label: string | null;
  subscription_status: "active" | "revoked";
  version: string;
};

type AdminDevicePushSubscriptionResult = {
  ok: boolean;
  status: number;
  error: string | null;
  reason:
    | "push_gate_closed"
    | "provider_not_configured"
    | "invalid_admin_actor"
    | "invalid_subscription"
    | "subscription_registered"
    | "subscription_revoked"
    | "subscription_write_failed";
  subscription: AdminDevicePushSubscriptionSummary | null;
  database_write_enabled: boolean;
  provider_send_enabled: false;
  external_provider_send: false;
};

type AdminNewBookingDevicePushAlertResult = {
  ok: boolean;
  status: "blocked" | "failed" | "sent";
  reason:
    | "push_gate_closed"
    | "provider_not_configured"
    | "invalid_booking"
    | "invalid_event"
    | "no_active_subscriptions"
    | "subscription_load_failed"
    | "provider_failure"
    | "send_succeeded";
  version: string;
  provider_request_count: number;
  external_provider_send: boolean;
  device_push_enabled: boolean;
  email_provider_enabled: false;
  whatsapp_enabled: false;
  telegram_enabled: false;
  sms_enabled: false;
};

type AdminDevicePushPayload = {
  title: string;
  body: string;
  url: "/";
  tag: string;
  version: string;
};

export type AdminDevicePushEventType =
  | "new_booking_request"
  | "customer_booking_amendment"
  | "customer_booking_cancellation"
  | "customer_driver_details_acknowledged"
  | "customer_to_driver_reply"
  | "driver_acknowledged"
  | "driver_completed"
  | "driver_issue"
  | "driver_ots"
  | "driver_ots_photo"
  | "driver_otw"
  | "driver_pob"
  | "driver_to_customer_reply"
  | "email_booking_amendment"
  | "email_booking_cancellation"
  | "email_confirmed_booking";

type AdminNativeDriverEventType =
  | "driver_acknowledged"
  | "driver_completed"
  | "driver_ots"
  | "driver_otw"
  | "driver_pob";

const adminNativeDriverEventTypes = new Set<AdminDevicePushEventType>([
  "driver_acknowledged",
  "driver_completed",
  "driver_ots",
  "driver_otw",
  "driver_pob",
]);

export type AdminDevicePushSender = (
  subscription: PushSubscription,
  payload: AdminDevicePushPayload,
) => Promise<void>;

type AdminDevicePushAlertOptions = {
  badgeClient?: Pick<SupabaseClient, "from">;
  env?: EnvInput;
  loadedSubscriptionLoader?: () => Promise<LoadedAdminDevicePushSubscription[]>;
  nativePushSender?: (
    expoPushToken: string,
    payload: AdminNativeDevicePushPayload,
  ) => Promise<void>;
  subscriptionLoader?: () => Promise<PushSubscription[]>;
  pushSender?: AdminDevicePushSender;
  vehiclePlate?: unknown;
};

type AdminNativeDevicePushPayload = {
  badge?: number;
  body: string;
  data: {
    open_target: "/";
    type: AdminNativeDriverEventType;
  };
  priority: "high";
  sound: "default";
  title: "Prestige Limo Ops";
};

type LoadedAdminDevicePushSubscription = {
  channel: "native_ios" | "web";
  endpoint: string;
  webSubscription: PushSubscription | null;
};

function cleanEnvValue(env: EnvInput, key: string): string | null {
  const value = env[key]?.trim();
  if (!value || value === "..." || value === "changeme") {
    return null;
  }
  return value;
}

function isTruthyGate(value: string | null): boolean {
  return value === "true" || value === "1" || value === "enabled";
}

function looksConfigured(value: string | null): value is string {
  return Boolean(value && value.length >= 12);
}

function normalizeVapidSubject(value: string): string {
  if (value.startsWith("mailto:") || value.startsWith("https://")) {
    return value;
  }
  return `mailto:${value}`;
}

function resolveConfig(env: EnvInput): AdminDevicePushConfig | null {
  const gate = cleanEnvValue(env, adminDevicePushNotificationEnvGateName);
  if (!isTruthyGate(gate)) {
    return null;
  }

  const publicKey = cleanEnvValue(env, adminDevicePushVapidPublicKeyName);
  const privateKey = cleanEnvValue(env, adminDevicePushVapidPrivateKeyName);
  const contactEmail = cleanEnvValue(env, adminDevicePushContactEmailName);
  const supabaseUrl = cleanEnvValue(env, supabaseUrlName);
  const supabaseServiceRoleKey = cleanEnvValue(env, supabaseServiceRoleKeyName);

  if (
    !looksConfigured(publicKey) ||
    !looksConfigured(privateKey) ||
    !looksConfigured(contactEmail) ||
    !looksConfigured(supabaseUrl) ||
    !looksConfigured(supabaseServiceRoleKey)
  ) {
    return null;
  }

  return {
    publicKey,
    privateKey,
    contactEmail,
    supabaseUrl,
    supabaseServiceRoleKey,
  };
}

export function getAdminDevicePushReadiness(
  env: EnvInput = process.env,
): AdminDevicePushReadiness {
  const gate = cleanEnvValue(env, adminDevicePushNotificationEnvGateName);
  const enabled = isTruthyGate(gate);
  const config = resolveConfig(env);

  if (!enabled) {
    return {
      ok: true,
      enabled: false,
      ready: false,
      version: adminDevicePushNotificationVersion,
      public_key: null,
      required_env_names: requiredEnvNames,
      reason: "push_gate_closed",
    };
  }

  if (!config) {
    return {
      ok: true,
      enabled: true,
      ready: false,
      version: adminDevicePushNotificationVersion,
      public_key: null,
      required_env_names: requiredEnvNames,
      reason: "provider_not_configured",
    };
  }

  return {
    ok: true,
    enabled: true,
    ready: true,
    version: adminDevicePushNotificationVersion,
    public_key: config.publicKey,
    required_env_names: requiredEnvNames,
    reason: "ready",
  };
}

function createSupabaseClient(
  config: AdminDevicePushConfig,
): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isAdminActor(actor: AdminBookingPersistenceAdapterActor): boolean {
  return actor.actor_role === "admin";
}

function safeText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const clean = value.trim();
  if (!clean || clean.length > maxLength) {
    return null;
  }
  return clean;
}

function parseRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseSubscriptionInput(
  value: unknown,
): ParsedAdminDevicePushSubscriptionInput | null {
  const body = parseRecord(value);
  if (!body) {
    return null;
  }

  if (body.channel === adminNativePushSubscriptionSource) {
    const endpoint = parseExpoPushToken(body.native_token);
    const installationId = parseAdminInstallationId(body.installation_id);
    return endpoint && installationId
      ? {
          channel: "native_ios",
          endpoint,
          installationId,
        }
      : null;
  }

  const subscription = parseRecord(body.subscription) ?? body;
  const keys = parseRecord(subscription.keys);
  const endpoint = safeText(subscription.endpoint, 2048);
  const p256dh = safeText(keys?.p256dh, 512);
  const auth = safeText(keys?.auth, 512);
  const deviceLabel = safeText(body.device_label, 80);

  if (!endpoint || !p256dh || !auth) {
    return null;
  }

  return {
    channel: "web",
    endpoint,
    keys: {
      p256dh,
      auth,
    },
    device_label: deviceLabel,
  };
}

function parseExpoPushToken(value: unknown): string | null {
  const token = safeText(value, 512);
  return token && /^(?:Exponent|Expo)PushToken\[[A-Za-z0-9_-]{20,400}\]$/.test(token)
    ? token
    : null;
}

function parseAdminInstallationId(value: unknown): string | null {
  const installationId = safeText(value, 36)?.toLowerCase() || "";
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    installationId,
  )
    ? installationId
    : null;
}

function adminNativeDeviceLabel(installationId: string): string {
  return `${adminNativeDeviceLabelPrefix}${installationId}`;
}

function blockedSubscriptionResult(
  reason: AdminDevicePushSubscriptionResult["reason"],
  status: number,
  error: string,
): AdminDevicePushSubscriptionResult {
  return {
    ok: false,
    status,
    error,
    reason,
    subscription: null,
    database_write_enabled: false,
    provider_send_enabled: false,
    external_provider_send: false,
  };
}

export async function registerAdminDevicePushSubscription(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  env: EnvInput = process.env,
): Promise<AdminDevicePushSubscriptionResult> {
  const config = resolveConfig(env);
  if (!config) {
    return blockedSubscriptionResult(
      isTruthyGate(cleanEnvValue(env, adminDevicePushNotificationEnvGateName))
        ? "provider_not_configured"
        : "push_gate_closed",
      403,
      "Admin device push is not enabled.",
    );
  }

  if (!isAdminActor(actor)) {
    return blockedSubscriptionResult(
      "invalid_admin_actor",
      403,
      "Admin device push registration is admin-only.",
    );
  }

  const parsed = parseSubscriptionInput(input);
  if (!parsed) {
    return blockedSubscriptionResult(
      "invalid_subscription",
      400,
      "A valid browser push subscription is required.",
    );
  }

  const supabase = createSupabaseClient(config);
  const nativeDeviceLabel = parsed.channel === "native_ios"
    ? adminNativeDeviceLabel(parsed.installationId)
    : null;

  if (parsed.channel === "native_ios") {
    const { data: activeNativeRows, error: activeNativeError } = await supabase
      .from("admin_device_push_subscriptions")
      .select("endpoint, device_label, actor_label")
      .eq("source_surface", adminNativePushSubscriptionSource)
      .eq("subscription_status", "active")
      .limit(3);
    const rows = Array.isArray(activeNativeRows) ? activeNativeRows : [];
    const existing = rows[0];
    if (activeNativeError || rows.length > 1 || (existing && (
      existing.endpoint !== parsed.endpoint ||
      existing.device_label !== nativeDeviceLabel ||
      existing.actor_label !== actor.actor_label
    ))) {
      return blockedSubscriptionResult(
        "invalid_subscription", 409,
        "The approved native Admin notification installation does not match.",
      );
    }
  }

  const { data, error } = await supabase
    .from("admin_device_push_subscriptions")
    .upsert({
      endpoint: parsed.endpoint,
      p256dh: parsed.channel === "native_ios" ? adminNativePushSubscriptionSentinel : parsed.keys.p256dh,
      auth: parsed.channel === "native_ios" ? adminNativePushSubscriptionSentinel : parsed.keys.auth,
      device_label: parsed.channel === "native_ios" ? nativeDeviceLabel : parsed.device_label,
      subscription_status: "active",
      source_surface: parsed.channel === "native_ios" ? adminNativePushSubscriptionSource : adminBrowserPushSubscriptionSource,
      actor_label: actor.actor_label,
      revoked_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "endpoint" })
    .select("id, device_label, subscription_status")
    .single();

  if (error) {
    return blockedSubscriptionResult(
      "subscription_write_failed",
      500,
      "Admin device push subscription write failed safely.",
    );
  }

  if (parsed.channel === "native_ios") {
    const { data: confirmedNativeRows, error: confirmedNativeError } = await supabase
      .from("admin_device_push_subscriptions")
      .select("endpoint, device_label, actor_label")
      .eq("source_surface", adminNativePushSubscriptionSource)
      .eq("subscription_status", "active")
      .limit(3);
    const confirmedRows = Array.isArray(confirmedNativeRows) ? confirmedNativeRows : [];
    if (confirmedNativeError || confirmedRows.length !== 1 ||
      confirmedRows[0]?.endpoint !== parsed.endpoint ||
      confirmedRows[0]?.device_label !== nativeDeviceLabel ||
      confirmedRows[0]?.actor_label !== actor.actor_label) {
      const now = new Date().toISOString();
      await supabase.from("admin_device_push_subscriptions").update({
        subscription_status: "revoked", revoked_at: now, updated_at: now,
      }).eq("endpoint", parsed.endpoint)
        .eq("source_surface", adminNativePushSubscriptionSource)
        .eq("device_label", nativeDeviceLabel)
        .eq("actor_label", actor.actor_label);
      return blockedSubscriptionResult(
        "invalid_subscription", 409,
        "Multiple native Admin notification registrations failed safely.",
      );
    }
  }

  if (parsed.channel === "native_ios") {
    await resetNativePushBadgeCount(supabase, {
      table: "admin_device_push_subscriptions",
      token: parsed.endpoint,
      tokenColumn: "endpoint",
    }).catch(() => false);
  }

  return {
    ok: true,
    status: 200,
    error: null,
    reason: "subscription_registered",
    subscription: {
      id: typeof data?.id === "string" ? data.id : null,
      device_label:
        typeof data?.device_label === "string" ? data.device_label : null,
      subscription_status: "active",
      version: adminDevicePushNotificationVersion,
    },
    database_write_enabled: true,
    provider_send_enabled: false,
    external_provider_send: false,
  };
}

export async function revokeAdminDevicePushSubscription(
  input: unknown,
  actor: AdminBookingPersistenceAdapterActor,
  env: EnvInput = process.env,
): Promise<AdminDevicePushSubscriptionResult> {
  const config = resolveConfig(env);
  if (!config) {
    return blockedSubscriptionResult(
      isTruthyGate(cleanEnvValue(env, adminDevicePushNotificationEnvGateName))
        ? "provider_not_configured"
        : "push_gate_closed",
      403,
      "Admin device push is not enabled.",
    );
  }

  if (!isAdminActor(actor)) {
    return blockedSubscriptionResult(
      "invalid_admin_actor",
      403,
      "Admin device push revocation is admin-only.",
    );
  }

  const parsed = parseSubscriptionInput(input);
  if (!parsed) {
    return blockedSubscriptionResult(
      "invalid_subscription",
      400,
      "A valid browser push subscription is required.",
    );
  }

  const supabase = createSupabaseClient(config);
  const now = new Date().toISOString();
  let revokeQuery = supabase
    .from("admin_device_push_subscriptions")
    .update({
      subscription_status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("endpoint", parsed.endpoint);
  if (parsed.channel === "native_ios") {
    revokeQuery = revokeQuery
      .eq("source_surface", adminNativePushSubscriptionSource)
      .eq("device_label", adminNativeDeviceLabel(parsed.installationId))
      .eq("actor_label", actor.actor_label);
  }
  const { data, error } = await revokeQuery
    .select("id, device_label, subscription_status")
    .maybeSingle();

  if (error) {
    return blockedSubscriptionResult(
      "subscription_write_failed",
      500,
      "Admin device push subscription revoke failed safely.",
    );
  }

  if (parsed.channel === "native_ios" && !data?.id) {
    return blockedSubscriptionResult(
      "invalid_subscription",
      409,
      "The exact native Admin notification subscription was not found.",
    );
  }

  return {
    ok: true,
    status: 200,
    error: null,
    reason: "subscription_revoked",
    subscription: {
      id: typeof data?.id === "string" ? data.id : null,
      device_label:
        typeof data?.device_label === "string" ? data.device_label : null,
      subscription_status: "revoked",
      version: adminDevicePushNotificationVersion,
    },
    database_write_enabled: true,
    provider_send_enabled: false,
    external_provider_send: false,
  };
}

const adminDevicePushEventCopy: Record<
  AdminDevicePushEventType,
  Pick<AdminDevicePushPayload, "body" | "title">
> = {
  customer_booking_amendment: {
    body: "Customer amendment request received. Open Dashboard to review.",
    title: "Customer amendment request",
  },
  customer_booking_cancellation: {
    body: "Customer cancellation request received. Open Dashboard to review.",
    title: "Customer cancellation request",
  },
  customer_driver_details_acknowledged: {
    body: "Customer acknowledged the assigned driver details. Open Dashboard to review.",
    title: "Driver details acknowledged",
  },
  customer_to_driver_reply: {
    body: "Customer sent a driver app reply. Open Dashboard to review.",
    title: "Customer app reply",
  },
  driver_acknowledged: {
    body: "Driver saved details and acknowledged a job. Open Dashboard to review.",
    title: "Driver acknowledged job",
  },
  driver_completed: {
    body: "Driver reported Job Completed. Open Dashboard to review.",
    title: "Driver reported Job Completed",
  },
  driver_issue: {
    body: "Driver reported an issue. Open Dashboard to review.",
    title: "Driver issue alert",
  },
  driver_ots: {
    body: "Driver reported OTS. Open Dashboard to review.",
    title: "Driver reported OTS",
  },
  driver_ots_photo: {
    body: "Driver sent an OTS photo. Open Dashboard to review.",
    title: "OTS photo received",
  },
  driver_otw: {
    body: "Driver reported OTW. Open Dashboard to review.",
    title: "Driver reported OTW",
  },
  driver_pob: {
    body: "Driver reported POB. Open Dashboard to review.",
    title: "Driver reported POB",
  },
  driver_to_customer_reply: {
    body: "Driver sent a customer app reply. Open Dashboard to review.",
    title: "Driver app reply",
  },
  email_booking_amendment: {
    body: "Booking amendment received by email. Open Dashboard to review.",
    title: "Email booking amendment",
  },
  email_booking_cancellation: {
    body: "Booking cancellation received by email. Open Dashboard to review.",
    title: "Email booking cancellation",
  },
  email_confirmed_booking: {
    body: "Confirmed booking received by email. Open Dashboard to review.",
    title: "Confirmed booking email",
  },
  new_booking_request: {
    body: "New booking request received. Open Dashboard to review.",
    title: "New booking request",
  },
};

const adminDevicePushVehicleStatusLabels: Partial<
  Record<AdminDevicePushEventType, string>
> = {
  driver_completed: "Job Completed",
  driver_ots: "OTS",
  driver_otw: "OTW",
  driver_pob: "POB",
};

function validAdminDevicePushEventType(value: unknown): value is AdminDevicePushEventType {
  return typeof value === "string" && value in adminDevicePushEventCopy;
}

function isAdminNativeDriverEventType(
  value: AdminDevicePushEventType,
): value is AdminNativeDriverEventType {
  return adminNativeDriverEventTypes.has(value);
}

function safeVehiclePlate(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const plate = value.trim().replace(/\s+/g, " ").toUpperCase();

  if (!plate || plate.length > 20 || !/^[A-Z0-9 -]+$/.test(plate)) {
    return null;
  }

  return plate;
}

function safeAlertPayload(
  eventType: AdminDevicePushEventType,
  vehiclePlate?: unknown,
): AdminDevicePushPayload {
  const statusLabel = adminDevicePushVehicleStatusLabels[eventType];
  const plate =
    statusLabel || eventType === "driver_acknowledged"
      ? safeVehiclePlate(vehiclePlate)
      : null;
  const copy =
    plate && statusLabel
      ? {
          body: `${plate} reported ${statusLabel}. Open Dashboard to review.`,
          title: `${plate} reported ${statusLabel}`,
        }
      : plate && eventType === "driver_acknowledged"
        ? {
            body: `${plate} saved details and acknowledged a job. Open Dashboard to review.`,
            title: `${plate} acknowledged job`,
          }
      : adminDevicePushEventCopy[eventType];

  return {
    ...copy,
    url: "/",
    tag:
      eventType === "new_booking_request"
        ? "prestige-new-booking-request"
        : `prestige-admin-${eventType.replaceAll("_", "-")}`,
    version: adminDevicePushNotificationVersion,
  };
}

function payloadHasForbiddenFragments(payload: AdminDevicePushPayload): boolean {
  const haystack = JSON.stringify(payload).toLowerCase();
  return forbiddenPayloadFragments.some((fragment) =>
    haystack.includes(fragment),
  );
}

function isUsableBooking(booking: AdminBookingPersistenceRecord): boolean {
  const record = booking as Record<string, unknown>;

  return Boolean(
    booking &&
      typeof booking === "object" &&
      (booking.booking_reference || record.id || booking.passenger_name),
  );
}

function loadedAdminDevicePushSubscription(
  value: unknown,
): LoadedAdminDevicePushSubscription | null {
  const row = parseRecord(value);
  if (!row) return null;

  const endpoint = safeText(row.endpoint, 2048);
  if (!endpoint) return null;

  if (row.source_surface === adminNativePushSubscriptionSource) {
    const deviceLabel = safeText(row.device_label, 80);
    const installationId = deviceLabel?.startsWith(adminNativeDeviceLabelPrefix)
      ? parseAdminInstallationId(deviceLabel.slice(adminNativeDeviceLabelPrefix.length))
      : null;
    return parseExpoPushToken(endpoint) &&
      row.p256dh === adminNativePushSubscriptionSentinel &&
      row.auth === adminNativePushSubscriptionSentinel &&
      installationId &&
      safeText(row.actor_label, 160)
      ? { channel: "native_ios", endpoint, webSubscription: null }
      : null;
  }

  if (row.source_surface !== adminBrowserPushSubscriptionSource) return null;
  const p256dh = safeText(row.p256dh, 512);
  const auth = safeText(row.auth, 512);
  return p256dh && auth
    ? {
        channel: "web",
        endpoint,
        webSubscription: { endpoint, keys: { auth, p256dh } },
      }
    : null;
}

async function loadActiveSubscriptions(
  config: AdminDevicePushConfig,
): Promise<LoadedAdminDevicePushSubscription[]> {
  const supabase = createSupabaseClient(config);
  const { data, error } = await supabase
    .from("admin_device_push_subscriptions")
    .select("endpoint, p256dh, auth, source_surface, device_label, actor_label")
    .eq("subscription_status", "active")
    .limit(25);

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map(loadedAdminDevicePushSubscription)
    .filter((subscription): subscription is LoadedAdminDevicePushSubscription =>
      Boolean(subscription),
    );
}

async function sendWebPush(
  config: AdminDevicePushConfig,
  subscription: PushSubscription,
  payload: AdminDevicePushPayload,
): Promise<void> {
  webPush.setVapidDetails(
    normalizeVapidSubject(config.contactEmail),
    config.publicKey,
    config.privateKey,
  );
  await webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 120,
    timeout: adminDevicePushProviderTimeoutMs,
  });
}

function safeNativeDriverPayload(
  eventType: AdminNativeDriverEventType,
  vehiclePlate?: unknown,
): AdminNativeDevicePushPayload {
  const plate = safeVehiclePlate(vehiclePlate);
  const statusLabel = adminDevicePushVehicleStatusLabels[eventType];
  const body =
    plate && eventType === "driver_acknowledged"
      ? `Driver ${plate} acknowledged the job.`
      : plate && statusLabel
        ? `${plate} reported ${statusLabel}.`
        : eventType === "driver_acknowledged"
          ? "A driver job update is ready. Open Dashboard to review."
          : adminDevicePushEventCopy[eventType].body;

  return {
    body,
    data: {
      open_target: "/",
      type: eventType,
    },
    priority: "high",
    sound: "default",
    title: "Prestige Limo Ops",
  };
}

async function sendNativePush(
  expoPushToken: string,
  payload: AdminNativeDevicePushPayload,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), adminDevicePushProviderTimeoutMs);
  try {
    const response = await fetcher(expoPushEndpoint, {
      body: JSON.stringify({ ...payload, to: expoPushToken }),
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const body = parseRecord(await response.json().catch(() => null));
    const ticket = Array.isArray(body?.data)
      ? parseRecord(body.data[0])
      : parseRecord(body?.data);
    if (!response.ok || ticket?.status !== "ok") {
      const error = new Error("Native Admin push provider rejected the request.") as Error & {
        statusCode?: number;
      };
      error.statusCode = parseRecord(ticket?.details)?.error === "DeviceNotRegistered"
        ? 410
        : response.status || 502;
      throw error;
    }
  } finally {
    clearTimeout(timeout);
  }
}

function getPushProviderStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }

  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : null;
}

async function recordSubscriptionSendSuccess(
  config: AdminDevicePushConfig,
  endpointValue: string,
): Promise<void> {
  const endpoint = safeText(endpointValue, 2048);
  if (!endpoint) {
    return;
  }

  const now = new Date().toISOString();
  try {
    await createSupabaseClient(config)
      .from("admin_device_push_subscriptions")
      .update({
        last_success_at: now,
        updated_at: now,
      })
      .eq("endpoint", endpoint);
  } catch {
    // Delivery health writes are best-effort; alert delivery already succeeded.
  }
}

async function recordSubscriptionSendFailure(
  config: AdminDevicePushConfig,
  endpointValue: string,
  error: unknown,
): Promise<void> {
  const endpoint = safeText(endpointValue, 2048);
  if (!endpoint) {
    return;
  }

  const now = new Date().toISOString();
  const statusCode = getPushProviderStatusCode(error);
  const shouldRevoke = statusCode === 404 || statusCode === 410;
  const failureUpdate: Record<string, string> = {
    last_failure_at: now,
    updated_at: now,
  };

  if (shouldRevoke) {
    failureUpdate.subscription_status = "revoked";
    failureUpdate.revoked_at = now;
  }

  try {
    await createSupabaseClient(config)
      .from("admin_device_push_subscriptions")
      .update(failureUpdate)
      .eq("endpoint", endpoint);
  } catch {
    // A stale-device health update must not block alerts to other devices.
  }
}

function blockedAlertResult(
  reason: AdminNewBookingDevicePushAlertResult["reason"],
  devicePushEnabled = false,
): AdminNewBookingDevicePushAlertResult {
  return {
    ok: false,
    status: reason === "provider_failure" ? "failed" : "blocked",
    reason,
    version: adminDevicePushNotificationVersion,
    provider_request_count: 0,
    external_provider_send: false,
    device_push_enabled: devicePushEnabled,
    email_provider_enabled: false,
    whatsapp_enabled: false,
    telegram_enabled: false,
    sms_enabled: false,
  };
}

export async function sendAdminNewBookingDevicePushAlert(
  booking: AdminBookingPersistenceRecord,
  options: AdminDevicePushAlertOptions = {},
): Promise<AdminNewBookingDevicePushAlertResult> {
  if (!isUsableBooking(booking)) {
    return blockedAlertResult("invalid_booking");
  }

  return sendAdminDevicePushAlert("new_booking_request", options);
}

export async function sendAdminDevicePushAlert(
  eventType: unknown,
  options: AdminDevicePushAlertOptions = {},
): Promise<AdminNewBookingDevicePushAlertResult> {
  if (!validAdminDevicePushEventType(eventType)) {
    return blockedAlertResult("invalid_event");
  }

  const env = options.env ?? process.env;
  const config = resolveConfig(env);
  const gateOpen = isTruthyGate(
    cleanEnvValue(env, adminDevicePushNotificationEnvGateName),
  );
  if (!config) {
    return blockedAlertResult(
      gateOpen ? "provider_not_configured" : "push_gate_closed",
      gateOpen,
    );
  }

  const payload = safeAlertPayload(eventType, options.vehiclePlate);
  if (payloadHasForbiddenFragments(payload)) {
    return blockedAlertResult("provider_failure", true);
  }

  let subscriptions: LoadedAdminDevicePushSubscription[];
  try {
    subscriptions = options.loadedSubscriptionLoader
      ? await options.loadedSubscriptionLoader()
      : options.subscriptionLoader
        ? (await options.subscriptionLoader()).map((subscription) => ({
            channel: "web" as const,
            endpoint: subscription.endpoint,
            webSubscription: subscription,
          }))
        : await loadActiveSubscriptions(config);
  } catch {
    return blockedAlertResult("subscription_load_failed", true);
  }

  const nativeSubscriptionCount = subscriptions.filter(
    (subscription) => subscription.channel === "native_ios",
  ).length;
  const nativeEventType = isAdminNativeDriverEventType(eventType)
    ? eventType
    : null;
  const eligibleSubscriptions = subscriptions.filter(
    (subscription) =>
      subscription.channel === "web" ||
      (Boolean(nativeEventType) && nativeSubscriptionCount === 1),
  );
  if (eligibleSubscriptions.length === 0) {
    return blockedAlertResult("no_active_subscriptions", true);
  }

  const webSender =
    options.pushSender ??
    ((subscription: PushSubscription, pushPayload: AdminDevicePushPayload) =>
      sendWebPush(config, subscription, pushPayload));

  const nativePayload = nativeEventType
    ? safeNativeDriverPayload(nativeEventType, options.vehiclePlate)
    : null;
  const shouldRecordSubscriptionHealth =
    !options.loadedSubscriptionLoader &&
    !options.subscriptionLoader &&
    !options.pushSender &&
    !options.nativePushSender;
  const badgeClient = options.badgeClient ??
    (shouldRecordSubscriptionHealth ? createSupabaseClient(config) : null);

  let providerRequestCount = 0;
  let successfulRequestCount = 0;
  for (const subscription of eligibleSubscriptions) {
    const badgeReservation =
      subscription.channel === "native_ios" && nativePayload && badgeClient
        ? await reserveNativePushBadgeCount(badgeClient, {
            table: "admin_device_push_subscriptions",
            token: subscription.endpoint,
            tokenColumn: "endpoint",
          }).catch(() => null)
        : null;
    const sendProviderRequest =
      subscription.channel === "native_ios"
        ? nativePayload
          ? () =>
              (options.nativePushSender ?? sendNativePush)(
                subscription.endpoint,
                badgeReservation
                  ? { ...nativePayload, badge: badgeReservation.count }
                  : nativePayload,
              )
          : null
        : () => webSender(subscription.webSubscription!, payload);
    if (!sendProviderRequest) {
      continue;
    }
    providerRequestCount += 1;
    try {
      await sendProviderRequest();
      successfulRequestCount += 1;
      if (shouldRecordSubscriptionHealth) {
        await recordSubscriptionSendSuccess(config, subscription.endpoint);
      }
    } catch (error) {
      if (badgeReservation) {
        await releaseNativePushBadgeCount(
          badgeClient!,
          badgeReservation,
        ).catch(() => false);
      }
      if (shouldRecordSubscriptionHealth) {
        await recordSubscriptionSendFailure(config, subscription.endpoint, error);
      }
    }
  }

  if (successfulRequestCount === 0) {
    return {
      ...blockedAlertResult("provider_failure", true),
      status: "failed",
      provider_request_count: providerRequestCount,
    };
  }

  return {
    ok: true,
    status: "sent",
    reason: "send_succeeded",
    version: adminDevicePushNotificationVersion,
    provider_request_count: providerRequestCount,
    external_provider_send: true,
    device_push_enabled: true,
    email_provider_enabled: false,
    whatsapp_enabled: false,
    telegram_enabled: false,
    sms_enabled: false,
  };
}
