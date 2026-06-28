import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webPush, { type PushSubscription } from "web-push";

import type { AdminBookingPersistenceRecord } from "./admin-booking-persistence";
import type { AdminBookingPersistenceAdapterActor } from "./admin-booking-supabase-adapter";

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
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  device_label: string | null;
};

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
  title: "New booking request";
  body: "New booking request received. Open Dashboard to review.";
  url: "/";
  tag: "prestige-new-booking-request";
  version: string;
};

export type AdminDevicePushSender = (
  subscription: PushSubscription,
  payload: AdminDevicePushPayload,
) => Promise<void>;

type AdminNewBookingDevicePushAlertOptions = {
  env?: EnvInput;
  subscriptionLoader?: () => Promise<PushSubscription[]>;
  pushSender?: AdminDevicePushSender;
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
): AdminDevicePushSubscriptionInput | null {
  const body = parseRecord(value);
  if (!body) {
    return null;
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
    endpoint,
    keys: {
      p256dh,
      auth,
    },
    device_label: deviceLabel,
  };
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
  const { data, error } = await supabase
    .from("admin_device_push_subscriptions")
    .upsert(
      {
        endpoint: parsed.endpoint,
        p256dh: parsed.keys.p256dh,
        auth: parsed.keys.auth,
        device_label: parsed.device_label,
        subscription_status: "active",
        source_surface: "admin_dashboard",
        actor_label: actor.actor_label,
        revoked_at: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    )
    .select("id, device_label, subscription_status")
    .single();

  if (error) {
    return blockedSubscriptionResult(
      "subscription_write_failed",
      500,
      "Admin device push subscription write failed safely.",
    );
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
  const { data, error } = await supabase
    .from("admin_device_push_subscriptions")
    .update({
      subscription_status: "revoked",
      revoked_at: now,
      updated_at: now,
    })
    .eq("endpoint", parsed.endpoint)
    .select("id, device_label, subscription_status")
    .maybeSingle();

  if (error) {
    return blockedSubscriptionResult(
      "subscription_write_failed",
      500,
      "Admin device push subscription revoke failed safely.",
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

function safeAlertPayload(): AdminDevicePushPayload {
  return {
    title: "New booking request",
    body: "New booking request received. Open Dashboard to review.",
    url: "/",
    tag: "prestige-new-booking-request",
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

async function loadActiveSubscriptions(
  config: AdminDevicePushConfig,
): Promise<PushSubscription[]> {
  const supabase = createSupabaseClient(config);
  const { data, error } = await supabase
    .from("admin_device_push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("subscription_status", "active")
    .limit(25);

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const endpoint = safeText(row.endpoint, 2048);
      const p256dh = safeText(row.p256dh, 512);
      const auth = safeText(row.auth, 512);
      if (!endpoint || !p256dh || !auth) {
        return null;
      }
      return {
        endpoint,
        keys: {
          p256dh,
          auth,
        },
      } satisfies PushSubscription;
    })
    .filter((subscription): subscription is PushSubscription =>
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
  });
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
  options: AdminNewBookingDevicePushAlertOptions = {},
): Promise<AdminNewBookingDevicePushAlertResult> {
  if (!isUsableBooking(booking)) {
    return blockedAlertResult("invalid_booking");
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

  const payload = safeAlertPayload();
  if (payloadHasForbiddenFragments(payload)) {
    return blockedAlertResult("provider_failure", true);
  }

  let subscriptions: PushSubscription[];
  try {
    subscriptions = options.subscriptionLoader
      ? await options.subscriptionLoader()
      : await loadActiveSubscriptions(config);
  } catch {
    return blockedAlertResult("subscription_load_failed", true);
  }

  if (subscriptions.length === 0) {
    return blockedAlertResult("no_active_subscriptions", true);
  }

  const sender =
    options.pushSender ??
    ((subscription: PushSubscription, pushPayload: AdminDevicePushPayload) =>
      sendWebPush(config, subscription, pushPayload));

  let providerRequestCount = 0;
  for (const subscription of subscriptions) {
    providerRequestCount += 1;
    try {
      await sender(subscription, payload);
    } catch {
      return {
        ...blockedAlertResult("provider_failure", true),
        status: "failed",
        provider_request_count: providerRequestCount,
      };
    }
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
