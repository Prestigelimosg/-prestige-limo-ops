import assert from "node:assert/strict";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-device-push-notification.ts";
const routePath = "app/api/admin-device-push-subscriptions/route.ts";
const customerBookingRoutePath = "app/api/customer-booking-requests/route.ts";
const dashboardPath = "app/page.tsx";
const serviceWorkerPath = "public/prestige-admin-push-sw.js";
const manifestPath = "app/manifest.ts";
const migrationPath = "supabase/migrations/202606280001_admin_device_push_subscriptions.sql";
const packagePath = "package.json";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

function transpileTypescript(source, filename) {
  return ts.transpileModule(source.replace('import "server-only";', ""), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

function assertIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(
      source.includes(fragment),
      true,
      `${label} must include ${fragment}.`,
    );
  }
}

function assertExcludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(
      source.toLowerCase().includes(fragment.toLowerCase()),
      false,
      `${label} must not include ${fragment}.`,
    );
  }
}

const [
  helperSource,
  routeSource,
  customerBookingRouteSource,
  dashboardSource,
  serviceWorkerSource,
  manifestSource,
  migrationSource,
  packageSource,
  ledgerSource,
  preactivationSuiteSource,
] = await Promise.all(
  [
    helperPath,
    routePath,
    customerBookingRoutePath,
    dashboardPath,
    serviceWorkerPath,
    manifestPath,
    migrationPath,
    packagePath,
    ledgerPath,
    preactivationSuitePath,
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assertIncludes(
  packageSource,
  ['"web-push"', '"@types/web-push"'],
  "package dependencies",
);

assertIncludes(
  helperSource,
  [
    'import "server-only";',
    "web-push",
    "PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED",
    "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY",
    "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY",
    "PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL",
    "admin_device_push_subscriptions",
    "adminDevicePushProviderTimeoutMs",
    "timeout: adminDevicePushProviderTimeoutMs",
    "New booking request received. Open Dashboard to review.",
    "New booking request",
    "whatsapp_enabled: false",
    "telegram_enabled: false",
    "sms_enabled: false",
    "email_provider_enabled: false",
  ],
  "admin device push helper",
);
assertIncludes(
  helperSource,
  [
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
    "live location",
    "price",
  ],
  "admin device push helper forbidden fragments",
);

assertIncludes(
  routeSource,
  [
    "resolveAdminDispatcherBoundary",
    "adminBookingPersistencePurpose",
    'allowServerSessionRoleMethodsWithoutRequestToken: ["POST", "PATCH"]',
    "getAdminDevicePushReadiness",
    "registerAdminDevicePushSubscription",
    "revokeAdminDevicePushSubscription",
    "export async function GET",
    "export async function POST",
    "export async function PATCH",
  ],
  "admin device push route",
);

assertIncludes(
  customerBookingRouteSource,
  [
    "sendAdminNewBookingDevicePushAlert",
    "await sendAdminNewBookingEmailAlert(booking);",
    "await sendAdminNewBookingDevicePushAlert(booking);",
    "Customer booking intake must not fail because admin device push is unavailable.",
  ],
  "customer booking intake route",
);

assertIncludes(
  dashboardSource,
  [
    "adminDevicePushSubscriptionsApiPath",
    "navigator.serviceWorker.register",
    "PushManager",
    "Notification.requestPermission",
    "data-admin-device-push-panel",
    "data-admin-device-push-toggle",
    "data-admin-app-notification-feed-header-actions",
    'role="switch"',
    'aria-label={adminDevicePushState.status === "enabled" ? "Push alerts ON" : "Push alerts OFF"}',
    'title={adminDevicePushState.message?.text || "Optional browser alert for new booking requests."}',
    '"Push ON"',
    '"Push OFF"',
    "handleAdminDevicePushEnable",
    "handleAdminDevicePushDisable",
  ],
  "dashboard device push UI",
);
assert.equal(
  dashboardSource.match(/data-admin-device-push-toggle="true"/g)?.length,
  1,
  "Dashboard must keep exactly one established device-push switch.",
);
assert.equal(
  dashboardSource.includes(">Device Push Alerts<"),
  false,
  "Dashboard must remove the standalone Device Push Alerts panel heading.",
);

assertIncludes(
  serviceWorkerSource,
  [
    'self.addEventListener("push"',
    "showNotification",
    'self.addEventListener("notificationclick"',
    "clients.openWindow",
  ],
  "admin push service worker",
);
assertExcludes(
  serviceWorkerSource,
  ["payout", "billing", "invoice", "payment", "secret", "token"],
  "admin push service worker",
);

assertIncludes(
  manifestSource,
  ["display: \"standalone\"", "Prestige Limo Ops", "start_url: \"/\""],
  "web app manifest",
);

assertIncludes(
  migrationSource,
  [
    "admin_device_push_subscriptions",
    "enable row level security",
    "revoke all on public.admin_device_push_subscriptions from anon",
    "revoke all on public.admin_device_push_subscriptions from authenticated",
    "grant select, insert, update, delete on public.admin_device_push_subscriptions to service_role",
  ],
  "admin device push migration scaffold",
);

assertIncludes(
  ledgerSource,
  [
    "Admin Device Push Notification Runtime Gate",
    "Compact Device Push Header Control",
    "PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED",
    "New booking request received. Open Dashboard to review.",
    "No WhatsApp, Telegram, SMS, provider fallback, billing, payment, payout, PDF, GPS, live location, or customer data is exposed",
  ],
  "implementation ledger",
);

assertIncludes(
  preactivationSuiteSource,
  ["scripts/test-admin-device-push-notification-guard.mjs"],
  "preactivation suite",
);

const tempDir = path.join(process.cwd(), ".tmp-admin-device-push-guard");
const tempHelperPath = path.join(tempDir, "lib/admin-device-push-notification.js");

await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
await writeFile(
  tempHelperPath,
  transpileTypescript(helperSource, path.join(process.cwd(), helperPath)),
);

try {
  const helper = createRequire(import.meta.url)(tempHelperPath);
  const closedReadiness = helper.getAdminDevicePushReadiness({});

  assert.equal(closedReadiness.ready, false);
  assert.equal(closedReadiness.enabled, false);
  assert.equal(closedReadiness.public_key, null);
  assert.equal(closedReadiness.reason, "push_gate_closed");

  const closedAlert = await helper.sendAdminNewBookingDevicePushAlert({
    booking_reference: "CUST-HIDDEN-001",
    id: "hidden",
  });

  assert.equal(closedAlert.ok, false);
  assert.equal(closedAlert.reason, "push_gate_closed");
  assert.equal(closedAlert.provider_request_count, 0);
  assert.equal(closedAlert.external_provider_send, false);

  const configuredEnv = {
    PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED: "true",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY: "fake-public-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY: "fake-private-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL: "ops@example.test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-guard",
  };

  const noSubscriptionAlert = await helper.sendAdminNewBookingDevicePushAlert(
    { booking_reference: "CUST-HIDDEN-002", id: "hidden" },
    {
      env: configuredEnv,
      subscriptionLoader: async () => [],
      pushSender: async () => {},
    },
  );

  assert.equal(noSubscriptionAlert.ok, false);
  assert.equal(noSubscriptionAlert.reason, "no_active_subscriptions");
  assert.equal(noSubscriptionAlert.provider_request_count, 0);

  let sentPayload = null;
  const sentAlert = await helper.sendAdminNewBookingDevicePushAlert(
    {
      booking_reference: "CUST-PRIVATE-003",
      id: "private-id",
      passenger_name: "Private Passenger",
      pickup_location: "Private pickup",
    },
    {
      env: configuredEnv,
      subscriptionLoader: async () => [
        {
          endpoint: "https://push.example.test/subscription",
          keys: {
            auth: "fake-auth",
            p256dh: "fake-p256dh",
          },
        },
      ],
      pushSender: async (_subscription, payload) => {
        sentPayload = payload;
      },
    },
  );

  assert.equal(sentAlert.ok, true);
  assert.equal(sentAlert.reason, "send_succeeded");
  assert.equal(sentAlert.provider_request_count, 1);
  assert.deepEqual(sentPayload, {
    body: "New booking request received. Open Dashboard to review.",
    tag: "prestige-new-booking-request",
    title: "New booking request",
    url: "/",
    version: "admin-device-push-notification-v1",
  });
  assertExcludes(
    JSON.stringify(sentPayload),
    ["Private Passenger", "Private pickup", "CUST-PRIVATE-003", "private-id"],
    "admin push payload",
  );

  let resilientSendCount = 0;
  const resilientAlert = await helper.sendAdminNewBookingDevicePushAlert(
    {
      booking_reference: "CUST-PRIVATE-004",
      id: "private-id-2",
      passenger_name: "Second Private Passenger",
      pickup_location: "Second Private pickup",
    },
    {
      env: configuredEnv,
      subscriptionLoader: async () => [
        {
          endpoint: "https://push.example.test/stale-subscription",
          keys: {
            auth: "fake-auth-stale",
            p256dh: "fake-p256dh-stale",
          },
        },
        {
          endpoint: "https://push.example.test/active-subscription",
          keys: {
            auth: "fake-auth-active",
            p256dh: "fake-p256dh-active",
          },
        },
      ],
      pushSender: async () => {
        resilientSendCount += 1;
        if (resilientSendCount === 1) {
          const staleError = new Error("stale subscription");
          staleError.statusCode = 410;
          throw staleError;
        }
      },
    },
  );

  assert.equal(resilientAlert.ok, true);
  assert.equal(resilientAlert.reason, "send_succeeded");
  assert.equal(resilientAlert.provider_request_count, 2);

  const failedAlert = await helper.sendAdminNewBookingDevicePushAlert(
    { booking_reference: "CUST-HIDDEN-005", id: "hidden" },
    {
      env: configuredEnv,
      subscriptionLoader: async () => [
        {
          endpoint: "https://push.example.test/failed-a",
          keys: {
            auth: "fake-auth-failed-a",
            p256dh: "fake-p256dh-failed-a",
          },
        },
        {
          endpoint: "https://push.example.test/failed-b",
          keys: {
            auth: "fake-auth-failed-b",
            p256dh: "fake-p256dh-failed-b",
          },
        },
      ],
      pushSender: async () => {
        throw new Error("provider unavailable");
      },
    },
  );

  assert.equal(failedAlert.ok, false);
  assert.equal(failedAlert.reason, "provider_failure");
  assert.equal(failedAlert.provider_request_count, 2);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin device push notification guard passed.");
