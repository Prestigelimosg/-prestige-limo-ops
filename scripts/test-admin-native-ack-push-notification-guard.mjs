import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const paths = {
  app: "admin-companion/App.tsx",
  appConfig: "admin-companion/app.json",
  bridge: "admin-companion/src/admin-webview-bridge.ts",
  installation: "admin-companion/src/admin-installation.ts",
  nativeNotifications: "admin-companion/src/admin-native-notifications.ts",
  package: "admin-companion/package.json",
  dashboard: "app/page.tsx",
  helper: "lib/admin-device-push-notification.ts",
  ledger: "docs/current-implementation-ledger.md",
};

const source = Object.fromEntries(
  await Promise.all(
    Object.entries(paths).map(async ([key, relativePath]) => [
      key,
      await readFile(relativePath, "utf8"),
    ]),
  ),
);

function includes(file, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(
      source[file].includes(fragment),
      true,
      `${label} must include ${fragment}`,
    );
  }
}

includes("package", ['"expo-constants"', '"expo-notifications"'], "Admin native dependencies");
includes("appConfig", ['"expo-notifications"'], "Admin native notification plugin");

includes(
  "installation",
  [
    "readOrCreateAdminInstallationId",
    "prestige.admin.installation-id.v1",
    "randomUUID",
    "AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY",
  ],
  "Admin installation identity",
);

includes(
  "nativeNotifications",
  [
    "readAdminNativeNotificationToken",
    "rememberAdminNativeNotificationToken",
    "forgetAdminNativeNotificationToken",
    "prestige.admin.native-notification-token.v1",
    "nativeAdminNotificationOpenRequest",
    '"driver_acknowledged"',
    '"driver_otw"',
    '"driver_ots"',
    '"driver_pob"',
    '"driver_completed"',
    'open_target === "/"',
  ],
  "Admin native notification storage and safe open contract",
);

includes(
  "bridge",
  [
    "embeddedAdminBridgeBootstrap",
    "parseAdminBridgeMessage",
    "admin_notifications_register",
    "admin_notifications_unregister",
    "__PRESTIGE_ADMIN_NATIVE_APP__",
    "__PRESTIGE_ADMIN_INSTALLATION_ID__",
    "__PRESTIGE_ADMIN_NOTIFICATIONS_ENABLED__",
    "__PRESTIGE_ADMIN_NOTIFICATION_PERMISSION__",
    "prestige-admin-native-notification-result",
  ],
  "Admin native WebView bridge",
);

includes(
  "app",
  [
    'import Constants from "expo-constants"',
    'import * as Notifications from "expo-notifications"',
    "Notifications.setNotificationHandler",
    "Notifications.addNotificationResponseReceivedListener",
    "Notifications.getLastNotificationResponse",
    "Notifications.getExpoPushTokenAsync",
    "Notifications.getPermissionsAsync",
    "readOrCreateAdminInstallationId",
    "requestNativeSubscription",
    "embeddedAdminBridgeBootstrap",
    "injectedJavaScriptBeforeContentLoaded",
    'response?.notification.request.content.data',
    'setCurrentUrl(`${productionOrigin}/`)',
    "admin_notifications_unregister",
    "signOutAfterNativePushRevocation",
    "pendingNativeActionRef",
    "pendingNativeContextRef",
  ],
  "Admin native app registration, tap, and sign-out revoke",
);

includes(
  "dashboard",
  [
    "adminNativePushIsSupported",
    "__PRESTIGE_ADMIN_NATIVE_APP__",
    "admin_notifications_register",
    "admin_notifications_unregister",
    "prestige-admin-native-notification-result",
    "Prestige Limo Ops in iPhone Settings",
    "handleAdminDevicePushEnable",
    "handleAdminDevicePushDisable",
    "const browserPublicKey = adminDevicePushState.publicKey",
    "(!nativePush && !browserPublicKey)",
    "adminDevicePushBase64ToUint8Array(\n            browserPublicKey",
    "!adminNativePushIsSupported() &&\n                      !adminDevicePushState.publicKey",
  ],
  "Existing Admin Push switch native bridge reuse",
);
assert.equal(
  source.dashboard.match(/data-admin-device-push-toggle="true"/g)?.length,
  1,
  "Admin Dashboard must retain exactly one Push ON/OFF switch",
);

includes(
  "helper",
  [
    'const adminNativePushSubscriptionSource = "admin_native_ios"',
    'const adminNativePushSubscriptionSentinel = "native_expo_push_token"',
    'const expoPushEndpoint = "https://exp.host/--/api/v2/push/send"',
    "parseExpoPushToken",
    "(?:Exponent|Expo)PushToken",
    "parseAdminInstallationId",
    "registerAdminDevicePushSubscription",
    "revokeAdminDevicePushSubscription",
    '? adminNativePushSubscriptionSource',
    '.eq("source_surface", adminNativePushSubscriptionSource)',
    "nativeSubscriptionCount === 1",
    "isAdminNativeDriverEventType(eventType)",
    'title: "Prestige Limo Ops"',
    '`Driver ${plate} acknowledged the job.`',
    '`${plate} reported ${statusLabel}.`',
    'open_target: "/"',
    "DeviceNotRegistered",
  ],
  "Existing Admin push sender native Driver-event extension",
);
includes(
  "ledger",
  [
    "Native Admin Driver Plate Lock-Screen Alerts",
    "admin_native_ios",
    "Driver 9696 acknowledged the job.",
    "9696 reported Job Completed.",
  ],
  "Implementation ledger",
);

const tempDir = path.join(process.cwd(), ".tmp-admin-native-ack-push-guard");
const tempHelper = path.join(tempDir, "lib/admin-device-push-notification.js");
const tempBadgeHelper = path.join(tempDir, "lib/native-push-badge-count.js");
const tempNativeNotifications = path.join(
  tempDir,
  "admin-companion/src/admin-native-notifications.js",
);
const tempSupabaseStub = path.join(
  tempDir,
  "node_modules/@supabase/supabase-js/index.js",
);
const tempSecureStoreStub = path.join(
  tempDir,
  "node_modules/expo-secure-store/index.js",
);
await rm(tempDir, { force: true, recursive: true });
await Promise.all([
  mkdir(path.dirname(tempHelper), { recursive: true }),
  mkdir(path.dirname(tempBadgeHelper), { recursive: true }),
  mkdir(path.dirname(tempNativeNotifications), { recursive: true }),
  mkdir(path.dirname(tempSupabaseStub), { recursive: true }),
  mkdir(path.dirname(tempSecureStoreStub), { recursive: true }),
]);
await writeFile(
  tempSupabaseStub,
  "exports.createClient = function () { return globalThis.__ADMIN_NATIVE_PUSH_TEST_CLIENT__; };",
);
await writeFile(
  tempSecureStoreStub,
  [
    'exports.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY = "after-first-unlock-this-device-only";',
    "exports.deleteItemAsync = async function () {};",
    "exports.getItemAsync = async function () { return null; };",
    "exports.setItemAsync = async function () {};",
  ].join("\n"),
);
await writeFile(
  tempBadgeHelper,
  "exports.reserveNativePushBadgeCount = async () => null; exports.releaseNativePushBadgeCount = async () => false; exports.resetNativePushBadgeCount = async () => false;",
);
await writeFile(
  tempHelper,
  ts.transpileModule(source.helper.replace('import "server-only";', ""), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: paths.helper,
  }).outputText,
);
await writeFile(
  tempNativeNotifications,
  ts.transpileModule(source.nativeNotifications, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: paths.nativeNotifications,
  }).outputText,
);

try {
  const helper = createRequire(import.meta.url)(tempHelper);
  const nativeNotifications = createRequire(import.meta.url)(
    tempNativeNotifications,
  );
  const configuredEnv = {
    PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED: "true",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY: "fake-public-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY: "fake-private-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL: "ops@example.test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-guard",
  };
  const adminActor = {
    actor_label: "Verified Owner",
    actor_role: "admin",
  };
  const installationId = "12345678-1234-4123-8123-1234567890ab";
  const nativeEndpoint = "ExpoPushToken[AdminNativeGuardToken1234567890]";

  function plannedClient(plans, captures = {}) {
    return {
      from(table) {
        assert.equal(table, "admin_device_push_subscriptions");
        const chain = {
          eq() { return chain; },
          limit() { return Promise.resolve(plans.shift()); },
          maybeSingle() { return Promise.resolve(plans.shift()); },
          select() { return chain; },
          single() { return Promise.resolve(plans.shift()); },
          update(payload) {
            captures.updates = [...(captures.updates || []), payload];
            return chain;
          },
          upsert(payload) {
            captures.upserts = [...(captures.upserts || []), payload];
            return chain;
          },
        };
        return chain;
      },
    };
  }

  const registrationCaptures = {};
  globalThis.__ADMIN_NATIVE_PUSH_TEST_CLIENT__ = plannedClient([
    { data: [], error: null },
    {
      data: {
        device_label: `admin-native-ios:${installationId}`,
        id: "native-registration-id",
        subscription_status: "active",
      },
      error: null,
    },
    {
      data: [{
        actor_label: adminActor.actor_label,
        device_label: `admin-native-ios:${installationId}`,
        endpoint: nativeEndpoint,
      }],
      error: null,
    },
  ], registrationCaptures);
  const registered = await helper.registerAdminDevicePushSubscription({
    channel: "admin_native_ios",
    installation_id: installationId,
    native_token: nativeEndpoint,
  }, adminActor, configuredEnv);
  assert.equal(registered.ok, true);
  assert.equal(registrationCaptures.upserts.length, 1);
  assert.deepEqual(
    {
      auth: registrationCaptures.upserts[0].auth,
      device_label: registrationCaptures.upserts[0].device_label,
      endpoint: registrationCaptures.upserts[0].endpoint,
      p256dh: registrationCaptures.upserts[0].p256dh,
      source_surface: registrationCaptures.upserts[0].source_surface,
    },
    {
      auth: "native_expo_push_token",
      device_label: `admin-native-ios:${installationId}`,
      endpoint: nativeEndpoint,
      p256dh: "native_expo_push_token",
      source_surface: "admin_native_ios",
    },
  );

  const mismatchCaptures = {};
  globalThis.__ADMIN_NATIVE_PUSH_TEST_CLIENT__ = plannedClient([{
    data: [{
      actor_label: "Another Admin",
      device_label: "admin-native-ios:aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      endpoint: "ExpoPushToken[AnotherAdminNativeToken1234567890]",
    }],
    error: null,
  }], mismatchCaptures);
  const mismatched = await helper.registerAdminDevicePushSubscription({
    channel: "admin_native_ios",
    installation_id: installationId,
    native_token: nativeEndpoint,
  }, adminActor, configuredEnv);
  assert.equal(mismatched.ok, false);
  assert.equal(mismatched.status, 409);
  assert.equal(mismatchCaptures.upserts, undefined);

  const revokeNoMatchCaptures = {};
  globalThis.__ADMIN_NATIVE_PUSH_TEST_CLIENT__ = plannedClient([
    { data: null, error: null },
  ], revokeNoMatchCaptures);
  const nativeRevokeNoMatch = await helper.revokeAdminDevicePushSubscription({
    channel: "admin_native_ios",
    installation_id: installationId,
    native_token: nativeEndpoint,
  }, adminActor, configuredEnv);
  assert.equal(nativeRevokeNoMatch.ok, false);
  assert.equal(nativeRevokeNoMatch.status, 409);

  const nativeDriverEvents = {
    driver_acknowledged: "Driver SNP 9124S acknowledged the job.",
    driver_completed: "SNP 9124S reported Job Completed.",
    driver_ots: "SNP 9124S reported OTS.",
    driver_otw: "SNP 9124S reported OTW.",
    driver_pob: "SNP 9124S reported POB.",
  };
  for (const eventType of Object.keys(nativeDriverEvents)) {
    assert.deepEqual(
      nativeNotifications.nativeAdminNotificationOpenRequest({
        open_target: "/",
        type: eventType,
      }),
      { openTarget: "/", type: eventType },
      `${eventType} native tap must open the existing Admin Dashboard lane.`,
    );
  }
  assert.equal(
    nativeNotifications.nativeAdminNotificationOpenRequest({
      open_target: "/",
      type: "driver_issue",
    }),
    null,
  );
  assert.equal(
    nativeNotifications.nativeAdminNotificationOpenRequest({
      booking_reference: "must-not-pass",
      open_target: "/",
      type: "driver_otw",
    }),
    null,
  );
  assert.equal(
    nativeNotifications.nativeAdminNotificationOpenRequest({
      open_target: "/dashboard",
      type: "driver_otw",
    }),
    null,
  );
  for (const [eventType, body] of Object.entries(nativeDriverEvents)) {
    let nativePayload = null;
    let nativeToken = null;
    const nativeAlert = await helper.sendAdminDevicePushAlert(eventType, {
      env: configuredEnv,
      loadedSubscriptionLoader: async () => [{
        channel: "native_ios",
        endpoint: nativeEndpoint,
        webSubscription: null,
      }],
      nativePushSender: async (token, payload) => {
        nativeToken = token;
        nativePayload = payload;
      },
      vehiclePlate: " snp 9124s ",
    });
    assert.equal(nativeAlert.ok, true, `${eventType} native push must send.`);
    assert.equal(nativeAlert.provider_request_count, 1);
    assert.equal(nativeToken, nativeEndpoint);
    assert.deepEqual(nativePayload, {
      body,
      data: { open_target: "/", type: eventType },
      priority: "high",
      sound: "default",
      title: "Prestige Limo Ops",
    });
    for (const forbidden of [
      "passenger",
      "route",
      "contact",
      "booking",
      "price",
      "billing",
      "invoice",
      "payout",
      "paynow",
      "internal",
    ]) {
      assert.equal(
        JSON.stringify(nativePayload).toLowerCase().includes(forbidden.toLowerCase()),
        false,
        `Native Admin ${eventType} payload must exclude ${forbidden}`,
      );
    }
  }

  let unsafePlatePayload = null;
  const unsafePlateAlert = await helper.sendAdminDevicePushAlert("driver_otw", {
    env: configuredEnv,
    loadedSubscriptionLoader: async () => [{
      channel: "native_ios",
      endpoint: nativeEndpoint,
      webSubscription: null,
    }],
    nativePushSender: async (_token, payload) => { unsafePlatePayload = payload; },
    vehiclePlate: "9696\nPassenger: Private",
  });
  assert.equal(unsafePlateAlert.ok, true);
  assert.equal(unsafePlatePayload.body, "Driver reported OTW. Open Dashboard to review.");

  let nonDriverNativeSendCount = 0;
  const nonDriverEvent = await helper.sendAdminDevicePushAlert("driver_issue", {
    env: configuredEnv,
    loadedSubscriptionLoader: async () => [{
      channel: "native_ios",
      endpoint: nativeEndpoint,
      webSubscription: null,
    }],
    nativePushSender: async () => { nonDriverNativeSendCount += 1; },
  });
  assert.equal(nonDriverEvent.ok, false);
  assert.equal(nonDriverEvent.reason, "no_active_subscriptions");
  assert.equal(nonDriverNativeSendCount, 0);

  let duplicateNativeSendCount = 0;
  let preservedWebSendCount = 0;
  const duplicateNative = await helper.sendAdminDevicePushAlert(
    "driver_acknowledged",
    {
      env: configuredEnv,
      loadedSubscriptionLoader: async () => [
        {
          channel: "native_ios",
          endpoint: nativeEndpoint,
          webSubscription: null,
        },
        {
          channel: "native_ios",
          endpoint: "ExponentPushToken[AdminNativeGuardToken0987654321]",
          webSubscription: null,
        },
        {
          channel: "web",
          endpoint: "https://push.example.test/admin-web",
          webSubscription: {
            endpoint: "https://push.example.test/admin-web",
            keys: { auth: "auth", p256dh: "p256dh" },
          },
        },
      ],
      nativePushSender: async () => { duplicateNativeSendCount += 1; },
      pushSender: async () => { preservedWebSendCount += 1; },
    },
  );
  assert.equal(duplicateNative.ok, true);
  assert.equal(duplicateNative.provider_request_count, 1);
  assert.equal(duplicateNativeSendCount, 0);
  assert.equal(preservedWebSendCount, 1);
} finally {
  delete globalThis.__ADMIN_NATIVE_PUSH_TEST_CLIENT__;
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Admin native Driver plate push notification guard passed.");
