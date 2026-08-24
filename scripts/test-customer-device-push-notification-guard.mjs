import assert from "node:assert/strict";
import { createHash } from "node:crypto";
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
    "safePublicBookingReference",
    "recordNativeDeliveryHealth",
    'ticket.status !== "ok"',
    "Customer native Expo ticket was rejected.",
    'select("company_id, booker_id, traveler_id, public_booking_reference, driver_plate_number")',
    "safeDriverPlateNumber",
    "nativeAudience.driverPlateNumber",
    "Car plate ${driverPlateNumber}. Open Prestige SG to review.",
  ],
  "customer device push helper",
);
assert.match(
  helperSource,
  /sendNativeExpoAlert\([\s\S]*?token,[\s\S]*?nativeAudience\.publicBookingReference,[\s\S]*?notification,[\s\S]*?nativeAudience\.driverPlateNumber,[\s\S]*?\)/,
  "Native push data must carry the exact public booking reference and safe confirmed plate, never the internal ADM reference",
);
assert.doesNotMatch(
  helperSource,
  /sendNativeExpoAlert\(token, exactBookingReference, notification\)/,
  "The internal booking reference must not enter the native notification tap payload",
);
assert.match(
  helperSource,
  /await response\.json\(\)[\s\S]*?ticket\.status !== "ok"[\s\S]*?ticket\.id/,
  "A HTTP 2xx response alone must not count as an accepted Expo push ticket",
);
assert.match(
  helperSource,
  /async function recordNativeDeliveryHealth[\s\S]*?last_failure_at[\s\S]*?last_success_at[\s\S]*?recordNativeDeliveryHealth\(client, token/,
  "The existing subscription row must record accepted-ticket or rejected-ticket evidence without adding another sender",
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
    "Driver / Admin alerts",
    'data-customer-alerts-control="true"',
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
    "Customer Thirty-Minute Pickup App Reminder",
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
const tempPrincipalPath = path.join(tempDir, "lib/customer-principal-access.js");

await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
await writeFile(
  tempHelperPath,
  transpileTypescript(
    `${helperSource}\nexport { sendNativeExpoAlert as __testSendNativeExpoAlert, recordNativeDeliveryHealth as __testRecordNativeDeliveryHealth };\n`,
    path.join(process.cwd(), helperPath),
  ),
);
await writeFile(
  tempAccountPath,
  'exports.assertActiveCustomerPortalAccessAccount = async () => ({ data: { customer_account_reference: "150" }, ok: true });\n',
);
await writeFile(
  tempPrincipalPath,
  'exports.assertActiveCustomerPrincipalSession = async () => ({ data: { device_id: "device-native-1", memberships: [{ customer_account_reference: "150" }], principal_id: "principal-native-1" }, ok: true });\n',
);

let originalCreateClient;
try {
  const localRequire = createRequire(import.meta.url);
  const supabaseModule = localRequire("@supabase/supabase-js");
  originalCreateClient = supabaseModule.createClient;
  const nativeFilters = [];
  let nativeUpdate = null;
  const nativeInstallationHash = createHash("sha256")
    .update("customer-ios-12345678-1234-4123-8123-123456789abc")
    .digest("hex");
  const nativeClient = {
    from(table) {
      const chain = {
        eq(field, value) {
          nativeFilters.push([field, value]);
          return this;
        },
        limit() {
          return Promise.resolve({
            data: table === "customer_access_devices"
              ? [{
                  device_status: "active",
                  id: "device-native-1",
                  installation_id_hash: nativeInstallationHash,
                  principal_id: "principal-native-1",
                }]
              : [],
            error: null,
          });
        },
        select() {
          return this;
        },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
        update(payload) {
          nativeUpdate = payload;
          return this;
        },
      };
      return chain;
    },
  };
  supabaseModule.createClient = () => nativeClient;
  const helper = localRequire(tempHelperPath);
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

  const originalFetch = global.fetch;
  let exactExpoBody = null;
  try {
    global.fetch = async (_url, init) => {
      exactExpoBody = JSON.parse(String(init?.body || "null"));
      return {
        ok: true,
        async json() {
          return { data: { id: "expo-ticket-10899", status: "ok" } };
        },
      };
    };
    await helper.__testSendNativeExpoAlert(
      "ExpoPushToken[customer_native_guard_1]",
      "10899",
      {
        actor_role: "driver",
        booking_reference: "ADM-20260823123045",
        delivery_surface: "customer_app",
        safe_title: "Driver details ready",
      },
      "9696",
    );
    assert.equal(exactExpoBody.data.booking_reference, "10899");
    assert.equal(exactExpoBody.title, "Driver details ready");
    assert.equal(exactExpoBody.body, "Car plate 9696. Open Prestige SG to review.");
    assert.equal(JSON.stringify(exactExpoBody).includes("ADM-20260823123045"), false);
    assertExcludes(
      JSON.stringify(exactExpoBody),
      ["87576969", "SOH", "AVF", "payout", "invoice", "payment", "internal note"],
      "native Driver details ready lock-screen payload",
    );

    await helper.__testSendNativeExpoAlert(
      "ExpoPushToken[customer_native_guard_1]",
      "10899",
      {
        actor_role: "driver",
        booking_reference: "ADM-20260823123045",
        delivery_surface: "customer_app",
        safe_title: "Driver details ready",
      },
      "not-a-valid-plate",
    );
    assert.equal(
      exactExpoBody.body,
      "Driver details are ready. Open Prestige SG to review.",
      "an invalid plate must fail closed to the existing generic Customer alert",
    );

    for (const expectedTitle of [
      "Driver on the way",
      "Driver arrived",
      "Passenger onboard",
    ]) {
      await helper.__testSendNativeExpoAlert(
        "ExpoPushToken[customer_native_guard_1]",
        "10899",
        {
          actor_role: "driver",
          booking_reference: "ADM-20260823123045",
          delivery_surface: "customer_app",
          safe_title: expectedTitle,
          workflow_area: "driver_status_customer_in_app",
        },
        "9696",
      );
      assert.equal(exactExpoBody.data.booking_reference, "10899");
      assert.equal(exactExpoBody.title, expectedTitle);
      assert.equal(exactExpoBody.body, "Car plate 9696. Open Prestige SG to review.");
      assert.equal(JSON.stringify(exactExpoBody).includes("ADM-20260823123045"), false);
      assertExcludes(
        JSON.stringify(exactExpoBody),
        ["87576969", "SOH", "AVF", "payout", "invoice", "payment", "internal note"],
        `native ${expectedTitle} lock-screen payload`,
      );
    }

    await helper.__testSendNativeExpoAlert(
      "ExpoPushToken[customer_native_guard_1]",
      "10899",
      {
        actor_role: "driver",
        booking_reference: "ADM-20260823123045",
        delivery_surface: "customer_app",
        safe_title: "Driver on the way",
        workflow_area: "customer_app_updates",
      },
      "9696",
    );
    assert.equal(exactExpoBody.title, "Prestige Limo booking update");
    assert.equal(exactExpoBody.body, "A booking update is ready. Open Prestige SG to review.");

    await helper.__testSendNativeExpoAlert(
      "ExpoPushToken[customer_native_guard_1]",
      "10899",
      {
        actor_role: "driver",
        booking_reference: "ADM-20260823123045",
        delivery_surface: "customer_app",
        safe_title: "Completed",
        workflow_area: "driver_status_customer_in_app",
      },
      "9696",
    );
    assert.equal(exactExpoBody.title, "Prestige Limo booking update");
    assert.equal(exactExpoBody.body, "A booking update is ready. Open Prestige SG to review.");

    global.fetch = async () => ({
      ok: true,
      async json() {
        return {
          data: {
            details: { error: "DeviceNotRegistered" },
            message: "The device is not registered.",
            status: "error",
          },
        };
      },
    });
    await assert.rejects(
      () => helper.__testSendNativeExpoAlert(
        "ExpoPushToken[customer_native_guard_1]",
        "10899",
        {
          actor_role: "driver",
          booking_reference: "ADM-20260823123045",
          delivery_surface: "customer_app",
        },
      ),
      (error) => error.message === "Customer native Expo ticket was rejected." &&
        error.expoError === "DeviceNotRegistered",
    );
  } finally {
    global.fetch = originalFetch;
  }

  const nativeHealthUpdates = [];
  const nativeHealthClient = {
    from(table) {
      assert.equal(table, "customer_device_push_subscriptions");
      return {
        eq(field, value) {
          this.filters.push([field, value]);
          return this;
        },
        filters: [],
        then(resolve, reject) {
          nativeHealthUpdates.push({ filters: this.filters, update: this.updatePayload });
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        },
        update(payload) {
          this.updatePayload = payload;
          return this;
        },
      };
    },
  };
  await helper.__testRecordNativeDeliveryHealth(
    nativeHealthClient,
    "ExpoPushToken[customer_native_guard_1]",
  );
  await helper.__testRecordNativeDeliveryHealth(
    nativeHealthClient,
    "ExpoPushToken[customer_native_guard_1]",
    { expoError: "DeviceNotRegistered" },
  );
  assert.equal(typeof nativeHealthUpdates[0].update.last_success_at, "string");
  assert.equal(typeof nativeHealthUpdates[1].update.last_failure_at, "string");
  assert.equal(nativeHealthUpdates[1].update.subscription_status, "revoked");
  assert.equal(nativeHealthUpdates[1].filters.some(([field, value]) =>
    field === "native_expo_token" && value === "ExpoPushToken[customer_native_guard_1]"), true);

  const nativeRevoke = await helper.revokeCustomerDevicePushSubscription(
    {
      delivery_channel: "native_expo",
      installation_id: "customer-ios-12345678-1234-4123-8123-123456789abc",
      native_expo_token: "ExpoPushToken[customer_native_guard_1]",
    },
    {
      mode: "principal-device-session",
      principal_session_token: "principal-session-native-1",
    },
    configuredEnv,
  );
  assert.deepEqual(nativeRevoke, {
    error: null,
    ok: true,
    reason: "subscription_revoked",
    status: 200,
    subscription_status: "revoked",
  });
  assert.equal(nativeUpdate.subscription_status, "revoked");
  assert.equal(typeof nativeUpdate.revoked_at, "string");
  assert.equal(
    nativeFilters.some(([field, value]) => field === "principal_id" && value === "principal-native-1"),
    true,
  );
  assert.equal(
    nativeFilters.some(([field, value]) => field === "device_id" && value === "device-native-1"),
    true,
  );
  assert.equal(
    nativeFilters.some(([field, value]) => field === "delivery_channel" && value === "native_expo"),
    true,
  );
  assert.equal(
    nativeFilters.some(([field]) => field === "native_expo_token"),
    false,
    "OFF must revoke all rotated native tokens for only the exact verified principal device",
  );

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
  if (originalCreateClient) {
    createRequire(import.meta.url)("@supabase/supabase-js").createClient = originalCreateClient;
  }
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Customer device push notification guard passed.");
