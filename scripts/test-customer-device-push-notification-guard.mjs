import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-device-push-notification.ts";
const routePath = "app/api/customer-device-push-subscriptions/route.ts";
const customerNotificationPersistencePath =
  "lib/customer-driver-app-notification-persistence.ts";
const customerPortalPath = "app/my-bookings/page.tsx";
const customerPortalLayoutPath = "app/my-bookings/layout.tsx";
const customerAdapterPath = "lib/customer-device-push-adapter.ts";
const serviceWorkerPath = "public/prestige-customer-push-sw.js";
const manifestPath = "public/customer-app.webmanifest";
const migrationPath =
  "supabase/migrations/20260722133718_customer_device_push_subscriptions.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

function assertIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
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

const [
  helperSource,
  routeSource,
  customerNotificationPersistenceSource,
  customerPortalSource,
  customerPortalLayoutSource,
  customerAdapterSource,
  serviceWorkerSource,
  manifestSource,
  migrationSource,
  ledgerSource,
  preactivationSuiteSource,
] = await Promise.all(
  [
    helperPath,
    routePath,
    customerNotificationPersistencePath,
    customerPortalPath,
    customerPortalLayoutPath,
    customerAdapterPath,
    serviceWorkerPath,
    manifestPath,
    migrationPath,
    ledgerPath,
    preactivationSuitePath,
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assertIncludes(
  helperSource,
  [
    'import "server-only";',
    "PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED",
    "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY",
    "PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY",
    "PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL",
    "customer_device_push_subscriptions",
    "customer_account_reference",
    "assertActiveCustomerPortalAccessAccount",
    'delivery_surface !== "customer_app"',
    'actor_role === "customer"',
    "A Prestige Limo booking update is ready. Open My Bookings to review.",
    'url: "/my-bookings"',
    "timeout: customerDevicePushProviderTimeoutMs",
    "statusCode === 404 || statusCode === 410",
  ],
  "customer device push helper",
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
  "customer device push privacy denylist",
);

assertIncludes(
  routeSource,
  [
    "resolveCustomerSavedBookingsBoundaryForPurpose",
    '"customer-device-push-subscription"',
    '"/my-bookings"',
    "getCustomerDevicePushReadiness",
    "registerCustomerDevicePushSubscription",
    "revokeCustomerDevicePushSubscription",
    "export async function GET",
    "export async function POST",
    "export async function PATCH",
    'export const runtime = "nodejs"',
  ],
  "customer device push route",
);

assertIncludes(
  customerNotificationPersistenceSource,
  [
    "sendCustomerDevicePushAlertForAppUpdate",
    'notification.delivery_surface === "customer_app"',
    "A saved customer app notification must not fail because Customer device push is unavailable.",
  ],
  "existing customer notification persistence fan-out",
);

assertIncludes(
  customerPortalSource,
  [
    "updateCustomerDevicePushSubscription",
    "navigator.serviceWorker.getRegistrations()",
    'scopePath === "/my-bookings"',
    'worker?.scriptURL.endsWith("/prestige-customer-push-sw.js")',
    'navigator.serviceWorker.register("/prestige-customer-push-sw.js", {',
    'scope: "/my-bookings"',
    "Notification.requestPermission",
    'data-customer-device-push-toggle="true"',
    'role="switch"',
    "Alerts ON",
    "Alerts OFF",
    "handleCustomerDevicePushEnable",
    "handleCustomerDevicePushDisable",
  ],
  "customer portal compact alerts control",
);

assertIncludes(
  customerAdapterSource,
  [
    '"/api/customer-device-push-subscriptions"',
    'cache: "no-store"',
    'credentials: "same-origin"',
    '"x-prestige-customer-purpose": customerDevicePushPurpose',
    "body: JSON.stringify({ subscription: subscription.toJSON() })",
  ],
  "customer device push client adapter",
);
assertExcludes(
  customerAdapterSource,
  ["Authorization", "Cookie", "session_token", "x-prestige-admin-purpose"],
  "customer device push client adapter",
);
assert.equal(
  customerPortalSource.match(/data-customer-device-push-toggle="true"/g)?.length,
  1,
  "My Bookings must render exactly one customer alerts toggle.",
);
assertExcludes(
  customerPortalSource,
  [
    ">Device Push Alerts<",
    ">Customer Push Notifications<",
    "Send Customer Push",
    "customer price",
    "driver payout",
    "PayNow",
  ],
  "customer portal alerts UI",
);

assertIncludes(
  customerPortalLayoutSource,
  [
    'manifest: "/customer-app.webmanifest"',
    'title: "Prestige My Bookings"',
    "appleWebApp",
  ],
  "customer portal metadata",
);

assertIncludes(
  manifestSource,
  [
    '"id": "/my-bookings"',
    '"start_url": "/my-bookings"',
    '"scope": "/my-bookings"',
    '"display": "standalone"',
    '"name": "Prestige Limo My Bookings"',
  ],
  "customer app manifest",
);

assertIncludes(
  serviceWorkerSource,
  [
    'self.addEventListener("push"',
    "showNotification",
    'self.addEventListener("notificationclick"',
    '"/my-bookings"',
    "clients.openWindow",
  ],
  "customer push service worker",
);
assertExcludes(
  serviceWorkerSource,
  [
    "booking_reference",
    "passenger",
    "pickup",
    "drop-off",
    "payout",
    "billing",
    "invoice",
    "payment",
    "secret",
    "token",
  ],
  "customer push service worker",
);

assertIncludes(
  migrationSource,
  [
    "customer_device_push_subscriptions",
    "customer_account_reference",
    "enable row level security",
    "revoke all on public.customer_device_push_subscriptions from anon",
    "revoke all on public.customer_device_push_subscriptions from authenticated",
    "grant select, insert, update, delete on public.customer_device_push_subscriptions to service_role",
  ],
  "customer device push migration",
);

assertIncludes(
  ledgerSource,
  [
    "Customer App Lock-Screen Alerts",
    "PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED",
    "one compact `Alerts ON` / `Alerts OFF` switch",
    "existing `customer_app` notification persistence lane",
    "invoice system remains untouched",
  ],
  "implementation ledger",
);

assertIncludes(
  preactivationSuiteSource,
  ["scripts/test-customer-device-push-notification-guard.mjs"],
  "preactivation suite",
);

const tempDir = path.join(process.cwd(), ".tmp-customer-device-push-guard");
const tempHelperPath = path.join(tempDir, "lib/customer-device-push-notification.js");
const tempAccountPath = path.join(tempDir, "lib/customer-portal-access-account.js");

await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
await writeFile(
  tempHelperPath,
  transpileTypescript(helperSource, path.join(process.cwd(), helperPath)),
);
await writeFile(
  tempAccountPath,
  'exports.assertActiveCustomerPortalAccessAccount = async () => ({ data: { customer_account_reference: "150" }, ok: true });\n',
);

try {
  const helper = createRequire(import.meta.url)(tempHelperPath);
  const configuredEnv = {
    PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL: "ops@example.test",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY: "fake-private-key-for-customer-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY: "fake-public-key-for-customer-guard",
    PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED: "true",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-customer-guard",
    SUPABASE_URL: "https://example.supabase.co",
  };
  const closedReadiness = helper.getCustomerDevicePushReadiness({});

  assert.equal(closedReadiness.enabled, false);
  assert.equal(closedReadiness.ready, false);
  assert.equal(closedReadiness.public_key, null);
  assert.equal(closedReadiness.reason, "push_gate_closed");

  let bookingReadCount = 0;
  const fakeClient = {
    from(table) {
      assert.equal(table, "bookings");
      bookingReadCount += 1;
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async limit() {
          return { data: [{ customer_id: 150 }], error: null };
        },
      };
    },
  };

  const selfAlert = await helper.sendCustomerDevicePushAlertForAppUpdate(
    fakeClient,
    {
      actor_role: "customer",
      booking_reference: "PRIVATE-BOOKING-1",
      delivery_surface: "customer_app",
    },
    { env: configuredEnv },
  );
  assert.equal(selfAlert.reason, "invalid_notification");
  assert.equal(bookingReadCount, 0);

  const driverSurfaceAlert = await helper.sendCustomerDevicePushAlertForAppUpdate(
    fakeClient,
    {
      actor_role: "admin",
      booking_reference: "PRIVATE-BOOKING-2",
      delivery_surface: "driver_app",
    },
    { env: configuredEnv },
  );
  assert.equal(driverSurfaceAlert.reason, "invalid_notification");
  assert.equal(bookingReadCount, 0);

  let sentPayload = null;
  const sentAlert = await helper.sendCustomerDevicePushAlertForAppUpdate(
    fakeClient,
    {
      actor_role: "driver",
      booking_reference: "PRIVATE-BOOKING-3",
      delivery_surface: "customer_app",
    },
    {
      env: configuredEnv,
      pushSender: async (_subscription, payload) => {
        sentPayload = payload;
      },
      subscriptionLoader: async (accountReference) => {
        assert.equal(accountReference, "150");
        return [
          {
            endpoint: "https://push.example.test/customer-device",
            keys: { auth: "fake-auth", p256dh: "fake-p256dh" },
          },
        ];
      },
    },
  );

  assert.equal(sentAlert.ok, true);
  assert.equal(sentAlert.reason, "send_succeeded");
  assert.equal(sentAlert.provider_request_count, 1);
  assert.deepEqual(sentPayload, {
    body: "A Prestige Limo booking update is ready. Open My Bookings to review.",
    tag: "prestige-customer-booking-update",
    title: "Prestige Limo booking update",
    url: "/my-bookings",
    version: "customer-device-push-notification-v1",
  });
  assertExcludes(
    JSON.stringify(sentPayload),
    ["PRIVATE-BOOKING-3", "150", "passenger", "pickup", "invoice", "payout"],
    "customer lock-screen payload",
  );

  const noSubscriptionAlert = await helper.sendCustomerDevicePushAlertForAppUpdate(
    fakeClient,
    {
      actor_role: "admin",
      booking_reference: "PRIVATE-BOOKING-4",
      delivery_surface: "customer_app",
    },
    {
      env: configuredEnv,
      subscriptionLoader: async () => [],
    },
  );
  assert.equal(noSubscriptionAlert.ok, false);
  assert.equal(noSubscriptionAlert.reason, "no_active_subscriptions");
  assert.equal(noSubscriptionAlert.provider_request_count, 0);
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer device push notification guard passed.");
