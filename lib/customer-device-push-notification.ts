import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import webPush, { type PushSubscription } from "web-push";

import { assertActiveCustomerPortalAccessAccount } from "./customer-portal-access-account";
import type { CustomerSavedBookingsBoundaryContext } from "./customer-saved-bookings-read";

export const customerDevicePushNotificationVersion =
  "customer-device-push-notification-v1";
export const customerDevicePushNotificationEnvGateName =
  "PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED";

const vapidPublicKeyName = "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY";
const vapidPrivateKeyName = "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY";
const vapidContactEmailName = "PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL";
const customerDevicePushProviderTimeoutMs = 5000;
const subscriptionTable = "customer_device_push_subscriptions";
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
  "gps",
  "live location",
  "driver location",
  "price",
] as const;

type EnvInput = Record<string, string | undefined>;
type CustomerDevicePushClient = Pick<SupabaseClient, "from">;

type CustomerDevicePushConfig = {
  contactEmail: string;
  privateKey: string;
  publicKey: string;
  serviceRoleKey: string;
  supabaseUrl: string;
};

type CustomerDevicePushSubscriptionInput = {
  endpoint: string;
  keys: {
    auth: string;
    p256dh: string;
  };
};

type CustomerDevicePushNotificationRecord = {
  actor_role: "admin" | "customer" | "dispatcher" | "driver" | "system";
  booking_reference: string | null;
  delivery_surface: "customer_app" | "driver_app";
};

type CustomerDevicePushPayload = {
  body: string;
  tag: string;
  title: string;
  url: "/my-bookings";
  version: typeof customerDevicePushNotificationVersion;
};

type CustomerDevicePushReadiness = {
  enabled: boolean;
  ok: true;
  public_key: string | null;
  ready: boolean;
  reason: "provider_not_configured" | "push_gate_closed" | "ready";
  version: typeof customerDevicePushNotificationVersion;
};

type CustomerDevicePushSubscriptionResult = {
  error: string | null;
  ok: boolean;
  reason:
    | "invalid_subscription"
    | "provider_not_configured"
    | "push_gate_closed"
    | "subscription_registered"
    | "subscription_revoked"
    | "subscription_write_failed"
    | "unauthorized";
  status: number;
  subscription_status: "active" | "revoked" | null;
};

type CustomerDevicePushAlertResult = {
  external_provider_send: boolean;
  ok: boolean;
  provider_request_count: number;
  reason:
    | "invalid_notification"
    | "no_active_subscriptions"
    | "provider_failure"
    | "provider_not_configured"
    | "push_gate_closed"
    | "send_succeeded"
    | "subscription_load_failed"
    | "unauthorized";
  status: "blocked" | "failed" | "sent";
  version: typeof customerDevicePushNotificationVersion;
};

export type CustomerDevicePushSender = (
  subscription: PushSubscription,
  payload: CustomerDevicePushPayload,
) => Promise<void>;

type CustomerDevicePushAlertOptions = {
  env?: EnvInput;
  pushSender?: CustomerDevicePushSender;
  subscriptionLoader?: (
    customerAccountReference: string,
  ) => Promise<PushSubscription[]>;
};

function cleanEnvValue(env: EnvInput, key: string) {
  const value = env[key]?.trim();

  return value && value !== "..." && value !== "changeme" ? value : null;
}

function gateEnabled(value: string | null) {
  return value === "true" || value === "1" || value === "enabled";
}

function configured(value: string | null): value is string {
  return Boolean(value && value.length >= 12);
}

function resolveConfig(env: EnvInput): CustomerDevicePushConfig | null {
  if (!gateEnabled(cleanEnvValue(env, customerDevicePushNotificationEnvGateName))) {
    return null;
  }

  const publicKey = cleanEnvValue(env, vapidPublicKeyName);
  const privateKey = cleanEnvValue(env, vapidPrivateKeyName);
  const contactEmail = cleanEnvValue(env, vapidContactEmailName);
  const supabaseUrl = cleanEnvValue(env, "SUPABASE_URL");
  const serviceRoleKey = cleanEnvValue(env, "SUPABASE_SERVICE_ROLE_KEY");

  if (
    !configured(publicKey) ||
    !configured(privateKey) ||
    !configured(contactEmail) ||
    !configured(supabaseUrl) ||
    !configured(serviceRoleKey)
  ) {
    return null;
  }

  return { contactEmail, privateKey, publicKey, serviceRoleKey, supabaseUrl };
}

function createServerClient(config: CustomerDevicePushConfig) {
  return createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function safeText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return null;
  }

  const cleaned = value.trim();

  return cleaned && cleaned.length <= maxLength ? cleaned : null;
}

function safeAccountReference(value: unknown) {
  const cleaned = safeText(value, 120);

  return cleaned && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(cleaned)
    ? cleaned
    : null;
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function parseSubscription(value: unknown): CustomerDevicePushSubscriptionInput | null {
  const body = record(value);
  const subscription = record(body?.subscription) || body;
  const keys = record(subscription?.keys);
  const endpoint = safeText(subscription?.endpoint, 2048);
  const p256dh = safeText(keys?.p256dh, 512);
  const auth = safeText(keys?.auth, 512);

  return endpoint && p256dh && auth
    ? {
        endpoint,
        keys: { auth, p256dh },
      }
    : null;
}

function normalizeVapidSubject(value: string) {
  return value.startsWith("mailto:") || value.startsWith("https://")
    ? value
    : `mailto:${value}`;
}

function blockedSubscriptionResult(
  reason: CustomerDevicePushSubscriptionResult["reason"],
  status: number,
  error: string,
): CustomerDevicePushSubscriptionResult {
  return {
    error,
    ok: false,
    reason,
    status,
    subscription_status: null,
  };
}

function boundaryAccountReference(context: CustomerSavedBookingsBoundaryContext) {
  return safeAccountReference(context.customer_account_reference);
}

export function getCustomerDevicePushReadiness(
  env: EnvInput = process.env,
): CustomerDevicePushReadiness {
  const enabled = gateEnabled(
    cleanEnvValue(env, customerDevicePushNotificationEnvGateName),
  );
  const config = resolveConfig(env);

  if (!enabled) {
    return {
      enabled: false,
      ok: true,
      public_key: null,
      ready: false,
      reason: "push_gate_closed",
      version: customerDevicePushNotificationVersion,
    };
  }

  if (!config) {
    return {
      enabled: true,
      ok: true,
      public_key: null,
      ready: false,
      reason: "provider_not_configured",
      version: customerDevicePushNotificationVersion,
    };
  }

  return {
    enabled: true,
    ok: true,
    public_key: config.publicKey,
    ready: true,
    reason: "ready",
    version: customerDevicePushNotificationVersion,
  };
}

export async function registerCustomerDevicePushSubscription(
  input: unknown,
  context: CustomerSavedBookingsBoundaryContext,
  env: EnvInput = process.env,
): Promise<CustomerDevicePushSubscriptionResult> {
  const config = resolveConfig(env);

  if (!config) {
    const enabled = gateEnabled(
      cleanEnvValue(env, customerDevicePushNotificationEnvGateName),
    );
    return blockedSubscriptionResult(
      enabled ? "provider_not_configured" : "push_gate_closed",
      403,
      "Customer alerts are not enabled.",
    );
  }

  const customerAccountReference = boundaryAccountReference(context);
  const subscription = parseSubscription(input);

  if (!customerAccountReference) {
    return blockedSubscriptionResult(
      "unauthorized",
      403,
      "Customer alerts require an active My Bookings account.",
    );
  }

  if (!subscription) {
    return blockedSubscriptionResult(
      "invalid_subscription",
      400,
      "A valid browser alert subscription is required.",
    );
  }

  const client = createServerClient(config);
  const activeAccount = await assertActiveCustomerPortalAccessAccount(
    customerAccountReference,
    client,
    context.portal_link_revision || context.portal_link_issued_at
      ? {
          issuedAt: context.portal_link_issued_at,
          linkRevision: context.portal_link_revision,
        }
      : undefined,
  );

  if (!activeAccount.ok) {
    return blockedSubscriptionResult(
      "unauthorized",
      403,
      "Customer alerts require an active My Bookings account.",
    );
  }

  const now = new Date().toISOString();
  const { error } = await client.from(subscriptionTable).upsert(
    {
      auth: subscription.keys.auth,
      customer_account_reference: customerAccountReference,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      revoked_at: null,
      source_surface: "customer_portal",
      subscription_status: "active",
      updated_at: now,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    return blockedSubscriptionResult(
      "subscription_write_failed",
      500,
      "Customer alert subscription could not be saved safely.",
    );
  }

  return {
    error: null,
    ok: true,
    reason: "subscription_registered",
    status: 200,
    subscription_status: "active",
  };
}

export async function revokeCustomerDevicePushSubscription(
  input: unknown,
  context: CustomerSavedBookingsBoundaryContext,
  env: EnvInput = process.env,
): Promise<CustomerDevicePushSubscriptionResult> {
  const config = resolveConfig(env);
  const customerAccountReference = boundaryAccountReference(context);
  const subscription = parseSubscription(input);

  if (!config) {
    const enabled = gateEnabled(
      cleanEnvValue(env, customerDevicePushNotificationEnvGateName),
    );
    return blockedSubscriptionResult(
      enabled ? "provider_not_configured" : "push_gate_closed",
      403,
      "Customer alerts are not enabled.",
    );
  }

  if (!customerAccountReference) {
    return blockedSubscriptionResult(
      "unauthorized",
      403,
      "Customer alerts require My Bookings access.",
    );
  }

  if (!subscription) {
    return blockedSubscriptionResult(
      "invalid_subscription",
      400,
      "A valid browser alert subscription is required.",
    );
  }

  const now = new Date().toISOString();
  const { error } = await createServerClient(config)
    .from(subscriptionTable)
    .update({
      revoked_at: now,
      subscription_status: "revoked",
      updated_at: now,
    })
    .eq("endpoint", subscription.endpoint)
    .eq("customer_account_reference", customerAccountReference);

  if (error) {
    return blockedSubscriptionResult(
      "subscription_write_failed",
      500,
      "Customer alerts could not be disabled safely.",
    );
  }

  return {
    error: null,
    ok: true,
    reason: "subscription_revoked",
    status: 200,
    subscription_status: "revoked",
  };
}

function safePayload(): CustomerDevicePushPayload {
  return {
    body: "A Prestige Limo booking update is ready. Open My Bookings to review.",
    tag: "prestige-customer-booking-update",
    title: "Prestige Limo booking update",
    url: "/my-bookings",
    version: customerDevicePushNotificationVersion,
  };
}

function payloadIsSafe(payload: CustomerDevicePushPayload) {
  const serialized = JSON.stringify(payload).toLowerCase();

  return !forbiddenPayloadFragments.some((fragment) => serialized.includes(fragment));
}

async function loadCustomerAccountReferenceForBooking(
  client: CustomerDevicePushClient,
  bookingReference: string,
): Promise<string | null> {
  const { data, error } = await client
    .from("bookings")
    .select("customer_id")
    .eq("booking_reference", bookingReference)
    .limit(1);

  if (error) {
    return null;
  }

  const row = Array.isArray(data) ? record(data[0]) : null;

  return safeAccountReference(row?.customer_id);
}

async function loadActiveSubscriptions(
  client: CustomerDevicePushClient,
  customerAccountReference: string,
): Promise<PushSubscription[]> {
  const { data, error } = await client
    .from(subscriptionTable)
    .select("endpoint, p256dh, auth")
    .eq("customer_account_reference", customerAccountReference)
    .eq("subscription_status", "active")
    .limit(10);

  if (error) {
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => {
      const endpoint = safeText(row.endpoint, 2048);
      const p256dh = safeText(row.p256dh, 512);
      const auth = safeText(row.auth, 512);

      return endpoint && p256dh && auth
        ? ({ endpoint, keys: { auth, p256dh } } satisfies PushSubscription)
        : null;
    })
    .filter((value): value is PushSubscription => Boolean(value));
}

async function sendWebPush(
  config: CustomerDevicePushConfig,
  subscription: PushSubscription,
  payload: CustomerDevicePushPayload,
) {
  webPush.setVapidDetails(
    normalizeVapidSubject(config.contactEmail),
    config.publicKey,
    config.privateKey,
  );
  await webPush.sendNotification(subscription, JSON.stringify(payload), {
    TTL: 180,
    timeout: customerDevicePushProviderTimeoutMs,
  });
}

function providerStatusCode(error: unknown) {
  return error && typeof error === "object" &&
    typeof (error as { statusCode?: unknown }).statusCode === "number"
    ? (error as { statusCode: number }).statusCode
    : null;
}

async function recordDeliveryHealth(
  client: CustomerDevicePushClient,
  subscription: PushSubscription,
  error?: unknown,
) {
  const endpoint = safeText(subscription.endpoint, 2048);

  if (!endpoint) {
    return;
  }

  const now = new Date().toISOString();
  const statusCode = providerStatusCode(error);
  const shouldRevoke = statusCode === 404 || statusCode === 410;
  const update = error
    ? {
        last_failure_at: now,
        ...(shouldRevoke
          ? { revoked_at: now, subscription_status: "revoked" }
          : {}),
        updated_at: now,
      }
    : {
        last_success_at: now,
        updated_at: now,
      };

  try {
    await client.from(subscriptionTable).update(update).eq("endpoint", endpoint);
  } catch {
    // Delivery health is best-effort and must not affect the saved customer update.
  }
}

function blockedAlert(
  reason: CustomerDevicePushAlertResult["reason"],
): CustomerDevicePushAlertResult {
  return {
    external_provider_send: false,
    ok: false,
    provider_request_count: 0,
    reason,
    status: reason === "provider_failure" ? "failed" : "blocked",
    version: customerDevicePushNotificationVersion,
  };
}

export async function sendCustomerDevicePushAlertForAppUpdate(
  client: CustomerDevicePushClient,
  notification: CustomerDevicePushNotificationRecord,
  options: CustomerDevicePushAlertOptions = {},
): Promise<CustomerDevicePushAlertResult> {
  if (
    notification.delivery_surface !== "customer_app" ||
    notification.actor_role === "customer" ||
    !notification.booking_reference
  ) {
    return blockedAlert("invalid_notification");
  }

  const env = options.env || process.env;
  const config = resolveConfig(env);
  const enabled = gateEnabled(
    cleanEnvValue(env, customerDevicePushNotificationEnvGateName),
  );

  if (!config) {
    return blockedAlert(enabled ? "provider_not_configured" : "push_gate_closed");
  }

  const bookingReference = safeText(notification.booking_reference, 120);
  const customerAccountReference = bookingReference
    ? await loadCustomerAccountReferenceForBooking(client, bookingReference)
    : null;

  if (!customerAccountReference) {
    return blockedAlert("unauthorized");
  }

  const activeAccount = await assertActiveCustomerPortalAccessAccount(
    customerAccountReference,
    client,
  );

  if (!activeAccount.ok) {
    return blockedAlert("unauthorized");
  }

  const payload = safePayload();

  if (!payloadIsSafe(payload)) {
    return blockedAlert("provider_failure");
  }

  let subscriptions: PushSubscription[];

  try {
    subscriptions = options.subscriptionLoader
      ? await options.subscriptionLoader(customerAccountReference)
      : await loadActiveSubscriptions(client, customerAccountReference);
  } catch {
    return blockedAlert("subscription_load_failed");
  }

  if (subscriptions.length === 0) {
    return blockedAlert("no_active_subscriptions");
  }

  const sender =
    options.pushSender ||
    ((subscription: PushSubscription, pushPayload: CustomerDevicePushPayload) =>
      sendWebPush(config, subscription, pushPayload));
  const recordHealth = !options.subscriptionLoader && !options.pushSender;
  let providerRequestCount = 0;
  let successfulRequestCount = 0;

  for (const subscription of subscriptions) {
    providerRequestCount += 1;

    try {
      await sender(subscription, payload);
      successfulRequestCount += 1;
      if (recordHealth) {
        await recordDeliveryHealth(client, subscription);
      }
    } catch (error) {
      if (recordHealth) {
        await recordDeliveryHealth(client, subscription, error);
      }
    }
  }

  if (successfulRequestCount === 0) {
    return {
      ...blockedAlert("provider_failure"),
      provider_request_count: providerRequestCount,
    };
  }

  return {
    external_provider_send: true,
    ok: true,
    provider_request_count: providerRequestCount,
    reason: "send_succeeded",
    status: "sent",
    version: customerDevicePushNotificationVersion,
  };
}
