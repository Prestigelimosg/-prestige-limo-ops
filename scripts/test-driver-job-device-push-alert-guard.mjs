import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/driver-device-push-notification.ts";
const productionPath = "lib/driver-job-link-production.ts";
const statusPersistencePath = "lib/driver-job-status-persistence.ts";
const notificationPath = "lib/customer-driver-app-notification-persistence.ts";
const routePath = "app/api/driver-job/[token]/route.ts";
const pagePath = "app/driver-job/[token]/page.tsx";
const portalRoutePath = "app/api/driver-portal/jobs/route.ts";
const portalPagePath = "app/driver-portal/page.tsx";
const adminLinkRoutePath = "app/api/admin-driver-job-links/route.ts";
const adminLinkPersistencePath = "lib/admin-driver-job-link-persistence.ts";
const serviceWorkerPath = "public/prestige-driver-push-sw.js";
const migrationPath = "supabase/migrations/202607220001_driver_device_push_subscriptions.sql";
const ledgerPath = "docs/current-implementation-ledger.md";
const suitePath = "scripts/test-preactivation-verification-suite.mjs";
const nativeAppPath = "driver-companion/App.tsx";
const nativeBridgePath = "driver-companion/src/driver-webview-bridge.ts";
const nativeContractPath = "driver-companion/src/driver-job-contract.ts";
const nativeNotificationStoragePath = "driver-companion/src/native-notifications.ts";
const nativeConfigPath = "driver-companion/app.json";
const nativePackagePath = "driver-companion/package.json";

function assertIncludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(source.includes(fragment), true, `${label} must include ${fragment}`);
  }
}

function assertExcludes(source, fragments, label) {
  for (const fragment of fragments) {
    assert.equal(
      source.toLowerCase().includes(fragment.toLowerCase()),
      false,
      `${label} must exclude ${fragment}`,
    );
  }
}

function blockBetween(source, startFragment, endFragment) {
  const start = source.indexOf(startFragment);
  assert.notEqual(start, -1, `Missing block start: ${startFragment}`);
  const end = source.indexOf(endFragment, start + startFragment.length);
  assert.notEqual(end, -1, `Missing block end: ${endFragment}`);
  return source.slice(start, end);
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
  productionSource,
  statusPersistenceSource,
  notificationSource,
  routeSource,
  pageSource,
  portalRouteSource,
  portalPageSource,
  adminLinkRouteSource,
  adminLinkPersistenceSource,
  serviceWorkerSource,
  migrationSource,
  ledgerSource,
  suiteSource,
  nativeAppSource,
  nativeBridgeSource,
  nativeContractSource,
  nativeNotificationStorageSource,
  nativeConfigSource,
  nativePackageSource,
] = await Promise.all(
  [
    helperPath,
    productionPath,
    statusPersistencePath,
    notificationPath,
    routePath,
    pagePath,
    portalRoutePath,
    portalPagePath,
    adminLinkRoutePath,
    adminLinkPersistencePath,
    serviceWorkerPath,
    migrationPath,
    ledgerPath,
    suitePath,
    nativeAppPath,
    nativeBridgePath,
    nativeContractPath,
    nativeNotificationStoragePath,
    nativeConfigPath,
    nativePackagePath,
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assertIncludes(
  nativePackageSource,
  ['"expo-constants"', '"expo-notifications"'],
  "native notification dependencies",
);
assertIncludes(
  nativeConfigSource,
  ['"expo-notifications"'],
  "native notification config plugin",
);
assertIncludes(
  nativeBridgeSource,
  [
    '"native_notifications_register"',
    '"native_job_open"',
    '"native_job_remember"',
    "job_key",
    '"__PRESTIGE_DRIVER_NOTIFICATIONS_ENABLED__"',
    '"__PRESTIGE_DRIVER_OPEN_TARGET__"',
    '"messages"',
  ],
  "bounded native notification target and stored-job bridge",
);
assertIncludes(
  pageSource,
  [
    'type: "native_notifications_register"',
    "loadedDriverJobTokenRef.current !== token",
    "nativeNotificationRegistrationTokenRef.current === token",
    "requestEmbeddedNativeNotificationsOnce",
    'pageState.kind !== "ready" || !acknowledged',
    '"prestige-driver-native-notification-result"',
    "Job alerts are enabled in Prestige Driver.",
    "Job alerts are not enabled; check Messages & Updates in this job.",
    'data-driver-job-app-updates="true"',
    'scrollIntoView({ behavior: "smooth", block: "start" })',
    '__PRESTIGE_DRIVER_OPEN_TARGET__ === "messages"',
  ],
  "embedded acknowledgement, acknowledged-reload, and message-target handoff",
);
assertIncludes(
  nativeAppSource,
  [
    'from "expo-constants"',
    'from "expo-notifications"',
    "requestPermissionsAsync",
    "getExpoPushTokenAsync",
    "addNotificationResponseReceivedListener",
    "registerNativeDriverNotifications",
    "rememberNativeDriverJob",
    "loadNativeDriverJob",
    "nativeNotificationOpenRequest",
    'request.type === "native_notifications_register"',
    "setNotificationEnabled",
    "request.jobKey",
    "await loadNativeDriverJob(request.jobKey)",
    'request.type === "native_job_open"',
    'request.type === "native_job_remember"',
    'currentWebViewUrl !== `${productionOrigin}/driver-portal`',
    "await rememberNativeDriverJob(request.jobKey, currentJob)",
    "await receiveDriverJobUrl(storedJob.jobUrl)",
    "await receiveDriverJobUrl(job.jobUrl, request.openTarget)",
  ],
  "native iOS notification registration, safe target handoff, direct-link memory, and portal reopening",
);
assert.equal(
  nativeAppSource.indexOf('if (request.type === "native_job_remember")') <
    nativeAppSource.indexOf("if (bridgeBusyRef.current)"),
  true,
  "private-link enrollment must not be dropped behind an unrelated busy bridge action",
);
assertIncludes(
  portalPageSource,
  [
    'type: "native_job_open"',
    "job_key: job.job_key",
    "ReactNativeWebView?.postMessage",
  ],
  "installed Driver Portal stored-job bridge",
);
assertIncludes(
  pageSource,
  [
    'type: "native_job_remember"',
    "job_key: result.driver_portal.link_key",
  ],
  "private Driver Job exact server-key memory bridge",
);
assertIncludes(
  routeSource,
  [
    "driver_portal: publicDriverPortalEnrollment({",
    "jobKey: result.jobKey",
  ],
  "private Driver Job server-issued opaque portal key",
);
assertIncludes(
  statusPersistenceSource,
  [
    'import { opaqueDriverJobLinkKey } from "./driver-device-push-notification.ts"',
    'jobKey: opaqueDriverJobLinkKey(String(resolvedLink.link.id || ""))',
  ],
  "same exact link-record key as the established portal job list",
);
const nativeLocalRegistrationFinalization = nativeAppSource.slice(
  nativeAppSource.indexOf("const registration = await registerNativeDriverNotifications"),
  nativeAppSource.indexOf("sendNativeNotificationResult({ ok: true, state: \"enabled\" })"),
);
assertIncludes(
  nativeLocalRegistrationFinalization,
  [
    "await rememberNativeDriverJob(registration.jobKey, job)",
    "await rememberNativeNotificationToken(nextToken)",
    "await unregisterNativeDriverNotifications(job, nextToken).catch(",
    "throw error",
  ],
  "native local registration failure cleanup",
);
assertExcludes(
  nativeAppSource,
  ["console.log", "passenger_name", "customer_price", "driver_payout", "paynow"],
  "native notification privacy",
);
assertIncludes(
  nativeContractSource,
  [
    "registerNativeDriverNotifications",
    'native_device_alert_action: "register"',
    "native_push_token",
  ],
  "native token-scoped registration adapter",
);
assertIncludes(
  nativeNotificationStorageSource,
  [
    'from "expo-secure-store"',
    "nativeNotificationOpenRequest",
    'open_target === "messages"',
    "rememberNativeDriverJob",
    "loadNativeDriverJob",
    "parseDriverJobUrl",
    "/^[0-9a-f]{64}$/",
  ],
  "device-local opaque job mapping and fixed safe notification target",
);
assertExcludes(
  nativeNotificationStorageSource,
  ["console.log", "passenger", "route", "price", "payment", "payout", "paynow"],
  "device-local notification mapping privacy",
);
assertIncludes(
  helperSource,
  [
    "registerDriverNativeDevicePushSubscriptionForAcknowledgedLink",
    "unregisterDriverNativeDevicePushSubscriptionForAcknowledgedLink",
    'source_surface: "driver_native_ios"',
    "https://exp.host/--/api/v2/push/send",
    'title: "Prestige Driver"',
    'nativeVisibleBody: DriverNativePushVisibleBody = "Job update available"',
    'body: visibleBody',
    '"Pickup is in 1 hour. Open Driver Portal to review."',
  ],
  "single native extension of the existing driver push sender with bounded visible copy",
);
assertIncludes(
  routeSource,
  [
    "function readDriverNativeDeviceAlertBody",
    "applyProductionDriverNativeDeviceAlertUpdate",
  ],
  "existing exact Driver Job route native notification registration",
);
assert.equal(
  routeSource.includes("export function readDriverNativeDeviceAlertBody"),
  false,
  "The internal native-alert parser must not be exported as a Next.js route field",
);

assertIncludes(
  helperSource,
  [
    'from "node:crypto"',
    'from "web-push"',
    "PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED",
    "PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PUBLIC_KEY",
    "PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PRIVATE_KEY",
    "PRESTIGE_DRIVER_DEVICE_PUSH_CONTACT_EMAIL",
    "driver_device_push_subscriptions",
    "verified_driver",
    "driver_job_acknowledgement",
    "driver_portal",
    "registerDriverDevicePushSubscriptionForPortalSession",
    "sendDriverDevicePushAlertForNewJobLink",
    "sendDriverDevicePushAlertForPickupReminder",
    "New Driver Job issued. Tap to review.",
    "New Driver Job app update. Tap to review.",
    "Pickup is in 1 hour. Open Driver Portal to review.",
  ],
  "driver device push helper",
);
assertExcludes(
  helperSource,
  [
    "admin_device_push_subscriptions",
    "PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED",
    "passenger_name",
    "customer_price",
    "driver_payout",
    "paynow",
    "internal_admin_note",
  ],
  "driver device push helper isolation",
);

assertIncludes(
  productionSource,
  [
    "registerDriverDevicePushSubscriptionForAcknowledgedLink",
    "if (!detailsResult.ok)",
    "devicePushSubscription",
    "device_alerts: deviceAlerts",
  ],
  "acknowledgement persistence integration",
);
assertIncludes(
  routeSource,
  [
    "getDriverDevicePushReadiness",
    "device_push_subscription",
    "publicDriverDeviceAlertReadiness",
    "publicDriverDeviceAlertRegistration(result.device_alerts)",
  ],
  "existing Driver Job route integration",
);
assertExcludes(
  routeSource,
  ["required_env_names: readiness.required_env_names", "version: result.device_alerts.version"],
  "public Driver Job device-alert response",
);
assertExcludes(routeSource, ["push-subscription", "push_subscription_route"], "route duplication guard");

assertIncludes(
  pageSource,
  [
    "Save & Acknowledge Job",
    "prepareDriverDeviceAlert",
    "Notification.requestPermission()",
    'navigator.serviceWorker.register("/prestige-driver-push-sw.js"',
    'scope: "/driver-job/"',
    "device_push_subscription: deviceAlertPreparation.subscription",
    "PRESTIGE_REMEMBER_DRIVER_JOB_LINK",
    "Device alerts are enabled on this device.",
    "reopen this page to check Messages & Updates",
    'data-driver-job-device-alert-helper="true"',
    "Install Driver Portal from your browser for best results.",
    "Tap Enable Job Alerts. Allow notifications.",
    "Tap OTW to save status and start sharing. Allow location.",
    "Allow camera/photos only for OTS photo.",
  ],
  "single acknowledgement action",
);
assert.equal(
  pageSource.match(/data-driver-job-save-acknowledge="true"/g)?.length,
  1,
  "Driver Job page must retain one Save & Acknowledge control",
);

assertIncludes(
  portalPageSource,
  [
    '"prestige-driver-native-notification-result"',
    "currentNativeNotificationsEnabled",
    "nativeBridgeReady",
    'type: "native_notifications_register"',
    "job_key: notificationJob.job_key",
    "Enable Job Alerts",
    "Job Alerts Enabled",
    "Enable once on this device",
    "Notification.requestPermission()",
    'navigator.serviceWorker.getRegistration("/driver-job/")',
    "navigator.serviceWorker.register(",
    '"/prestige-driver-push-sw.js"',
    'scope: "/driver-job/"',
    'fetch("/api/driver-portal/jobs"',
    '"x-prestige-driver-purpose": "driver-portal-device-alert-registration"',
    "device_push_subscription",
    'data-driver-portal-enable-alerts="true"',
  ],
  "installed Driver Portal alert setup",
);
assertExcludes(
  portalPageSource,
  ["on this iPhone", "Open iPhone Settings", "On iPhone"],
  "installed Driver Portal platform-neutral alert guidance",
);
assertIncludes(
  portalRouteSource,
  [
    "getDriverDevicePushReadiness",
    "registerDriverDevicePushSubscriptionForPortalSession",
    "driver-portal-device-alert-registration",
    "session.claims.driverId",
    "device_push_subscription",
  ],
  "existing Driver Portal jobs route alert registration",
);
const portalAlertSetupSource = blockBetween(
  portalPageSource,
  '<div className="rounded-xl border border-sky-200 bg-sky-50 p-4 shadow-sm" data-driver-portal-alert-setup={alertState}>',
  "{availableJobsEnabled ? (",
);
assertExcludes(
  portalAlertSetupSource + portalRouteSource,
  ["invoice", "billing", "payment", "payout", "paynow", "customer_price"],
  "Driver Portal alert isolation",
);
const driverPoolAvailableJobsSource = blockBetween(
  portalPageSource,
  "{availableJobsEnabled ? (",
  '<div className="flex items-center justify-between gap-3 px-1">',
);
assertIncludes(
  driverPoolAvailableJobsSource,
  ["offer_payout_sgd", "Fixed driver payout"],
  "authenticated Driver Pool exact fixed offer",
);
assertExcludes(
  driverPoolAvailableJobsSource,
  ["invoice", "billing", "payment", "paynow", "customer_price", "payout_comparison"],
  "authenticated Driver Pool privacy isolation",
);
assertIncludes(
  adminLinkRouteSource + adminLinkPersistenceSource,
  ["sendDriverDevicePushAlertForNewJobLink", ".catch(() => null)"],
  "successful existing Driver Job Link issuance alert integration",
);

assertIncludes(
  notificationSource,
  [
    "sendDriverDevicePushAlertForAppUpdate",
    'notification.delivery_surface === "driver_app"',
    ".catch(() => null)",
  ],
  "existing driver_app outbox delivery",
);

assertIncludes(
  serviceWorkerSource,
  [
    "prestige-driver-device-alerts",
    "indexedDB.open",
    "PRESTIGE_REMEMBER_DRIVER_JOB_LINK",
    'url.startsWith("/driver-job/")',
    'self.addEventListener("push"',
    'self.registration.showNotification("Prestige Limo Ops"',
    'self.addEventListener("notificationclick"',
    "target_path",
    '"/driver-portal"',
  ],
  "driver-scoped service worker",
);
assertExcludes(
  serviceWorkerSource,
  ["customer price", "billing", "invoice", "payment", "payout", "paynow", "passenger"],
  "service worker privacy",
);

assertIncludes(
  migrationSource,
  [
    "driver_device_push_subscriptions",
    "driver_id bigint not null references public.drivers(id)",
    "last_driver_job_link_id uuid references public.driver_job_links(id)",
    "enable row level security",
    "revoke all on public.driver_device_push_subscriptions from anon",
    "revoke all on public.driver_device_push_subscriptions from authenticated",
    "grant select, insert, update, delete on public.driver_device_push_subscriptions to service_role",
  ],
  "server-only subscription migration",
);
assertIncludes(
  ledgerSource,
  ["Driver Job Acknowledgement Device Alerts", "PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED"],
  "implementation ledger",
);
assertIncludes(
  suiteSource,
  ["scripts/test-driver-job-device-push-alert-guard.mjs"],
  "preactivation suite",
);

const tempDir = path.join(process.cwd(), ".tmp-driver-device-push-guard");
const tempHelperPath = path.join(tempDir, "lib/driver-device-push-notification.js");
const tempBadgeHelperPath = path.join(tempDir, "lib/native-push-badge-count.ts");
const tempDriverLinkPath = path.join(tempDir, "lib/driver-job-link.ts");
const tempNativeStoragePath = path.join(
  tempDir,
  "driver-companion/src/native-notifications.js",
);
const tempNativeBridgePath = path.join(
  tempDir,
  "driver-companion/src/driver-webview-bridge.js",
);
const tempNativeContractPath = path.join(
  tempDir,
  "driver-companion/src/driver-job-contract.js",
);
const tempSecureStorePath = path.join(
  tempDir,
  "node_modules/expo-secure-store/index.js",
);
await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
await writeFile(
  tempBadgeHelperPath,
  "exports.reserveNativePushBadgeCount = async () => null; exports.releaseNativePushBadgeCount = async () => false; exports.resetNativePushBadgeCount = async () => false;",
);
await writeFile(
  tempHelperPath,
  transpileTypescript(helperSource, path.join(process.cwd(), helperPath)),
);
await writeFile(
  tempDriverLinkPath,
  `exports.hashDriverJobLinkToken = (token) => "hash:" + token;
exports.isDriverJobLinkExpired = () => false;
exports.isDriverJobLinkExpiryOutsideAllowedWindow = () => false;
`,
);
await mkdir(path.dirname(tempNativeStoragePath), { recursive: true });
await mkdir(path.dirname(tempSecureStorePath), { recursive: true });
await writeFile(
  tempNativeStoragePath,
  transpileTypescript(
    nativeNotificationStorageSource,
    path.join(process.cwd(), nativeNotificationStoragePath),
  ).replaceAll(
    'require("./driver-job-contract.ts")',
    'require("./driver-job-contract.js")',
  ),
);
await writeFile(
  tempNativeBridgePath,
  transpileTypescript(
    nativeBridgeSource,
    path.join(process.cwd(), nativeBridgePath),
  ).replaceAll(
    'require("./driver-job-contract.ts")',
    'require("./driver-job-contract.js")',
  ),
);
await writeFile(
  tempNativeContractPath,
  `exports.productionOrigin = "https://app.prestigelimo.sg";
exports.parseDriverJobUrl = (value) => {
  const parsed = new URL(value);
  const match = parsed.pathname.match(/^\\/driver-job\\/([A-Za-z0-9_-]{20,})$/);
  if (parsed.origin !== "https://app.prestigelimo.sg" || !match) throw new Error("invalid job");
  return { jobUrl: value, origin: parsed.origin, token: match[1] };
};
`,
);
await writeFile(
  tempSecureStorePath,
  `const values = new Map();
const keys = [];
function validKey(key) {
  if (typeof key !== "string" || !/^[\\w.-]+$/.test(key)) {
    throw new Error("Invalid SecureStore key");
  }
  keys.push(key);
}
exports.__keys = keys;
exports.deleteItemAsync = async (key) => { validKey(key); values.delete(key); };
exports.getItemAsync = async (key) => { validKey(key); return values.get(key) ?? null; };
exports.setItemAsync = async (key, value) => { validKey(key); values.set(key, value); };
`,
);

const nativeBridge = createRequire(import.meta.url)(tempNativeBridgePath);
const nativeNotificationJobKey = "a".repeat(64);
assert.deepEqual(
  nativeBridge.parseDriverBridgeMessage(JSON.stringify({
    job_key: nativeNotificationJobKey,
    type: "native_notifications_register",
  })),
  {
    jobKey: nativeNotificationJobKey,
    type: "native_notifications_register",
  },
  "installed Driver Portal must hand one opaque stored-job key to the existing native notification lane",
);
assert.equal(
  nativeBridge.parseDriverBridgeMessage(JSON.stringify({
    job_key: "not-a-safe-job-key",
    type: "native_notifications_register",
  })),
  null,
  "native notification bridge must reject an invalid stored-job key",
);
const notificationBootstrap = nativeBridge.embeddedDriverBridgeBootstrap(
  "11111111-1111-4111-8111-111111111111",
  false,
  true,
  "messages",
);
assert.equal(
  notificationBootstrap.includes(
    'Object.defineProperty(window, "__PRESTIGE_DRIVER_NOTIFICATIONS_ENABLED__"',
  ),
  true,
  "native notification enabled state must be injected immutably from SecureStore",
);
assert.equal(
  notificationBootstrap.includes("value: true"),
  true,
  "native notification bootstrap must carry the persisted enabled state",
);
assert.equal(
  /localStorage|sessionStorage|document\.cookie/i.test(notificationBootstrap),
  false,
  "native notification enabled state must not be duplicated into browser storage",
);
assert.equal(
  notificationBootstrap.includes(
    'Object.defineProperty(window, "__PRESTIGE_DRIVER_OPEN_TARGET__"',
  ),
  true,
  "native message target must be injected immutably for the exact WebView load",
);
assert.equal(
  notificationBootstrap.includes('value: "messages"'),
  true,
  "native message notification must carry only the fixed messages target",
);

class QueryBuilder {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.operation = "select";
    this.value = null;
  }
  select() { return this; }
  eq(field, value) { this.filters.push([field, value]); return this; }
  order() { return this; }
  limit() { return this; }
  maybeSingle() { return Promise.resolve(this.client.resolve(this)); }
  upsert(value) { this.operation = "upsert"; this.value = value; return this; }
  update(value) { this.operation = "update"; this.value = value; return this; }
  then(resolve, reject) { return Promise.resolve(this.client.resolve(this)).then(resolve, reject); }
}

function createMockClient({
  acknowledged = true,
  activeOnePhoneAccount = true,
  linkStatus = "active",
  notificationOverrides = {},
  nativeHandoff = false,
  subscriptions = [],
} = {}) {
  const linkId = "11111111-1111-4111-8111-111111111111";
  const notificationId = "22222222-2222-4222-8222-222222222222";
  const calls = [];
  const client = {
    calls,
    from(table) { return new QueryBuilder(client, table); },
    resolve(query) {
      calls.push({
        filters: query.filters,
        operation: query.operation,
        table: query.table,
        value: query.value,
      });
      if (query.table === "driver_job_links") {
        return {
          data: {
            booking_reference: "PRIVATE-BOOKING-REFERENCE",
            created_at: "2026-07-22T00:00:00.000Z",
            driver_id: 8,
            expires_at: "2026-07-23T00:00:00.000Z",
            id: linkId,
            link_status: linkStatus,
            revoked_at: null,
            safe_link_context: {
              ...(acknowledged
                ? { driver_acknowledged_at: "2026-07-22T00:00:00.000Z" }
                : {}),
              ...(nativeHandoff
                ? { native_handoff_ciphertext: "v1.opaque.server.only.handoff" }
                : {}),
            },
            token_hash: "hash:NEW-PRIVATE-DRIVER-JOB-TOKEN",
          },
          error: null,
        };
      }
      if (query.table === "customer_driver_app_notification_outbox") {
        return {
          data: {
            booking_reference: "PRIVATE-BOOKING-REFERENCE",
            delivery_surface: "driver_app",
            driver_job_link_id: linkId,
            id: notificationId,
            notification_status: "queued",
            notification_type: "booking_status",
            priority: "urgent",
            safe_context: {
              audience: "replaced_driver",
              source: "save_driver_assignment",
            },
            safe_message: "Job reassigned, do not proceed.",
            safe_title: "Prestige Driver",
            workflow_area: "driver_reassignment",
            ...notificationOverrides,
          },
          error: null,
        };
      }
      if (query.table === "drivers") {
        return { data: { id: 8 }, error: null };
      }
      if (query.table === "driver_device_push_subscriptions" && query.operation === "select") {
        return { data: subscriptions, error: null };
      }
      if (query.table === "driver_access_accounts") {
        return activeOnePhoneAccount
          ? {
              data: {
                active_device_id_hash: "a".repeat(64),
                id: "33333333-3333-4333-8333-333333333333",
              },
              error: null,
            }
          : { data: null, error: null };
      }
      return { data: null, error: null };
    },
  };
  return client;
}

const configuredEnv = {
  PRESTIGE_DRIVER_DEVICE_PUSH_CONTACT_EMAIL: "ops@example.test",
  PRESTIGE_DRIVER_DEVICE_PUSH_ENABLED: "true",
  PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PRIVATE_KEY: "fake-private-key-for-driver-guard",
  PRESTIGE_DRIVER_DEVICE_PUSH_VAPID_PUBLIC_KEY: "fake-public-key-for-driver-guard",
};

try {
  const helper = createRequire(import.meta.url)(tempHelperPath);
  const nativeStorage = createRequire(import.meta.url)(tempNativeStoragePath);
  const secureStore = createRequire(import.meta.url)(tempSecureStorePath);
  const nativeJobKey = "a".repeat(64);
  const nativeJob = {
    jobUrl: `https://app.prestigelimo.sg/driver-job/${"b".repeat(32)}`,
    origin: "https://app.prestigelimo.sg",
    token: "b".repeat(32),
  };
  await nativeStorage.rememberNativeDriverJob(nativeJobKey, nativeJob);
  assert.deepEqual(
    nativeStorage.nativeNotificationOpenRequest({
      job_key: nativeJobKey,
      open_target: "messages",
    }),
    { jobKey: nativeJobKey, openTarget: "messages" },
    "native message notification must resolve one opaque job key and fixed messages target",
  );
  assert.deepEqual(
    nativeStorage.nativeNotificationOpenRequest({ job_key: nativeJobKey }),
    { jobKey: nativeJobKey, openTarget: null },
    "ordinary native job alerts must continue opening the job without a scroll target",
  );
  assert.deepEqual(
    nativeStorage.nativeNotificationOpenRequest({
      job_key: nativeJobKey,
      open_target: "unknown",
    }),
    { jobKey: nativeJobKey, openTarget: null },
    "unknown native targets must be ignored while preserving the safe job open",
  );
  assert.deepEqual(
    await nativeStorage.loadNativeDriverJob(nativeJobKey),
    nativeJob,
    "the exact opaque job key must resolve the locally stored private Driver Job",
  );
  assert.equal(await nativeStorage.loadNativeDriverJob("invalid"), null);
  await nativeStorage.rememberNativeNotificationToken(
    "ExpoPushToken[abcdefghijklmnopqrstuvwxyz1234567890]",
  );
  assert.equal(
    await nativeStorage.readNativeNotificationToken(),
    "ExpoPushToken[abcdefghijklmnopqrstuvwxyz1234567890]",
  );
  await nativeStorage.forgetNativeNotificationToken();
  assert.equal(await nativeStorage.readNativeNotificationToken(), null);
  assert.equal(secureStore.__keys.length > 0, true);
  for (const key of secureStore.__keys) {
    assert.match(
      key,
      /^[\w.-]+$/,
      "every actual derived native notification SecureStore key must satisfy Expo's key contract",
    );
  }
  const closed = helper.getDriverDevicePushReadiness({});
  assert.equal(closed.ready, false);
  assert.equal(closed.reason, "push_gate_closed");

  const registrationClient = createMockClient();
  const registration = await helper.registerDriverDevicePushSubscriptionForAcknowledgedLink({
    client: registrationClient,
    env: configuredEnv,
    subscription: {
      endpoint: "https://push.example.test/driver-device",
      keys: { auth: "guard-auth", p256dh: "guard-p256dh" },
    },
    token: "PRIVATE-RAW-DRIVER-LINK-TOKEN",
  });
  assert.equal(registration.ok, true);
  assert.equal(registration.reason, "subscription_registered");
  assert.match(registration.link_key, /^[0-9a-f]{64}$/);
  const subscriptionWrite = registrationClient.calls.find(
    (call) => call.table === "driver_device_push_subscriptions" && call.operation === "upsert",
  );
  assert.equal(subscriptionWrite.value.driver_id, 8);
  assert.equal(
    JSON.stringify(subscriptionWrite).includes("PRIVATE-RAW-DRIVER-LINK-TOKEN"),
    false,
    "raw private Driver Job token must never be persisted",
  );

  const unacknowledgedClient = createMockClient({ acknowledged: false });
  const blockedRegistration = await helper.registerDriverDevicePushSubscriptionForAcknowledgedLink({
    client: unacknowledgedClient,
    env: configuredEnv,
    subscription: {
      endpoint: "https://push.example.test/unacknowledged",
      keys: { auth: "guard-auth", p256dh: "guard-p256dh" },
    },
    token: "UNACKNOWLEDGED-TOKEN",
  });
  assert.equal(blockedRegistration.ok, false);
  assert.equal(blockedRegistration.reason, "invalid_driver_link");
  assert.equal(
    unacknowledgedClient.calls.some((call) => call.table === "driver_device_push_subscriptions"),
    false,
  );

  const nativeExpoPushToken =
    "ExpoPushToken[abcdefghijklmnopqrstuvwxyz1234567890]";
  const nativeRegistrationClient = createMockClient();
  const nativeRegistration =
    await helper.registerDriverNativeDevicePushSubscriptionForAcknowledgedLink({
      client: nativeRegistrationClient,
      env: configuredEnv,
      expoPushToken: nativeExpoPushToken,
      token: "PRIVATE-RAW-DRIVER-LINK-TOKEN",
    });
  assert.equal(nativeRegistration.ok, true);
  assert.equal(nativeRegistration.registered, true);
  assert.match(nativeRegistration.job_key, /^[0-9a-f]{64}$/);
  const nativeSubscriptionWrite = nativeRegistrationClient.calls.find(
    (call) =>
      call.table === "driver_device_push_subscriptions" &&
      call.operation === "upsert",
  );
  assert.equal(nativeSubscriptionWrite.value.driver_id, 8);
  assert.equal(nativeSubscriptionWrite.value.endpoint, nativeExpoPushToken);
  assert.equal(nativeSubscriptionWrite.value.source_surface, "driver_native_ios");
  assert.equal(
    JSON.stringify(nativeSubscriptionWrite).includes("PRIVATE-RAW-DRIVER-LINK-TOKEN"),
    false,
    "raw private Driver Job token must not be persisted with native registration",
  );

  const closedNativeClient = createMockClient();
  const closedNativeRegistration =
    await helper.registerDriverNativeDevicePushSubscriptionForAcknowledgedLink({
      client: closedNativeClient,
      env: {},
      expoPushToken: nativeExpoPushToken,
      token: "PRIVATE-RAW-DRIVER-LINK-TOKEN",
    });
  assert.equal(closedNativeRegistration.ok, false);
  assert.equal(closedNativeRegistration.reason, "push_gate_closed");
  assert.equal(
    closedNativeClient.calls.some(
      (call) => call.table === "driver_device_push_subscriptions",
    ),
    false,
  );

  const invalidNativeRegistration =
    await helper.registerDriverNativeDevicePushSubscriptionForAcknowledgedLink({
      client: createMockClient(),
      env: configuredEnv,
      expoPushToken: "not-an-expo-token",
      token: "PRIVATE-RAW-DRIVER-LINK-TOKEN",
    });
  assert.equal(invalidNativeRegistration.ok, false);
  assert.equal(invalidNativeRegistration.reason, "invalid_subscription");

  const nativeUnregisterClient = createMockClient();
  const nativeUnregister =
    await helper.unregisterDriverNativeDevicePushSubscriptionForAcknowledgedLink({
      client: nativeUnregisterClient,
      expoPushToken: nativeExpoPushToken,
      token: "PRIVATE-RAW-DRIVER-LINK-TOKEN",
    });
  assert.equal(nativeUnregister.ok, true);
  assert.equal(nativeUnregister.unregistered, true);
  const nativeUnregisterWrite = nativeUnregisterClient.calls.find(
    (call) =>
      call.table === "driver_device_push_subscriptions" &&
      call.operation === "update",
  );
  assert.deepEqual(nativeUnregisterWrite.value, {
    revoked_at: nativeUnregisterWrite.value.revoked_at,
    subscription_status: "revoked",
    updated_at: nativeUnregisterWrite.value.updated_at,
  });

  const portalRegistrationClient = createMockClient();
  const portalRegistration = await helper.registerDriverDevicePushSubscriptionForPortalSession({
    client: portalRegistrationClient,
    driverId: 8,
    env: configuredEnv,
    subscription: {
      endpoint: "https://web.push.apple.com/installed-driver-portal",
      keys: { auth: "portal-auth", p256dh: "portal-p256dh" },
    },
  });
  assert.equal(portalRegistration.ok, true);
  assert.equal(portalRegistration.reason, "subscription_registered");
  const portalSubscriptionWrite = portalRegistrationClient.calls.find(
    (call) =>
      call.table === "driver_device_push_subscriptions" &&
      call.operation === "upsert" &&
      call.value.endpoint.includes("web.push.apple.com"),
  );
  assert.equal(portalSubscriptionWrite.value.driver_id, 8);
  assert.equal(portalSubscriptionWrite.value.last_driver_job_link_id, null);
  assert.equal(portalSubscriptionWrite.value.source_surface, "driver_portal");

  let sentPayload = null;
  const alertClient = createMockClient({
    subscriptions: [
      {
        auth: "guard-auth",
        endpoint: "https://push.example.test/driver-device",
        p256dh: "guard-p256dh",
      },
    ],
  });
  const alert = await helper.sendDriverDevicePushAlertForAppUpdate(
    alertClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      workflow_area: null,
    },
    {
      env: configuredEnv,
      pushSender: async (_subscription, payload) => { sentPayload = payload; },
    },
  );
  assert.equal(alert.ok, true);
  assert.equal(alert.reason, "send_succeeded");
  assert.equal(alert.provider_request_count, 1);
  assert.equal(sentPayload.title, "Prestige Limo Ops");
  assert.equal(sentPayload.body, "New Driver Job app update. Tap to review.");
  assert.match(sentPayload.job_key, /^[0-9a-f]{64}$/);
  assertExcludes(
    JSON.stringify(sentPayload),
    [
      "PRIVATE-BOOKING-REFERENCE",
      "11111111-1111-4111-8111-111111111111",
      "passenger",
      "customer",
      "price",
      "payout",
      "token",
    ],
    "safe driver push payload",
  );

  let reassignmentPayload = null;
  const reassignmentClient = createMockClient({
    linkStatus: "expired",
    subscriptions: [
      {
        auth: "guard-auth",
        endpoint: "https://push.example.test/replaced-driver-device",
        p256dh: "guard-p256dh",
      },
    ],
  });
  const reassignmentAlert = await helper.sendDriverDevicePushAlertForAppUpdate(
    reassignmentClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      notification_id: "22222222-2222-4222-8222-222222222222",
      recipient_driver_id: 8,
      safe_message: "Job reassigned, do not proceed.",
      workflow_area: "driver_reassignment",
    },
    {
      env: configuredEnv,
      pushSender: async (_subscription, payload) => {
        reassignmentPayload = payload;
      },
    },
  );
  assert.equal(reassignmentAlert.ok, true);
  assert.equal(reassignmentAlert.reason, "send_succeeded");
  assert.equal(reassignmentPayload.body, "Job reassigned, do not proceed.");
  assert.equal(reassignmentPayload.title, "Prestige Limo Ops");
  assert.equal(
    reassignmentClient.calls.some(
      (call) =>
        call.table === "driver_device_push_subscriptions" &&
        call.filters.some(([field, value]) => field === "driver_id" && value === 8),
    ),
    true,
    "reassignment must load subscriptions only for the replaced driver",
  );

  let invalidReassignmentProviderRequests = 0;
  const activeLinkReassignment = await helper.sendDriverDevicePushAlertForAppUpdate(
    createMockClient({ linkStatus: "active", subscriptions: [{}] }),
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      notification_id: "22222222-2222-4222-8222-222222222222",
      recipient_driver_id: 8,
      safe_message: "Job reassigned, do not proceed.",
      workflow_area: "driver_reassignment",
    },
    {
      env: configuredEnv,
      pushSender: async () => { invalidReassignmentProviderRequests += 1; },
    },
  );
  assert.equal(activeLinkReassignment.ok, false);
  assert.equal(activeLinkReassignment.reason, "invalid_driver_link");
  assert.equal(invalidReassignmentProviderRequests, 0);

  const wrongDriverReassignment = await helper.sendDriverDevicePushAlertForAppUpdate(
    createMockClient({ linkStatus: "expired", subscriptions: [{}] }),
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      notification_id: "22222222-2222-4222-8222-222222222222",
      recipient_driver_id: 9,
      safe_message: "Job reassigned, do not proceed.",
      workflow_area: "driver_reassignment",
    },
    {
      env: configuredEnv,
      pushSender: async () => { invalidReassignmentProviderRequests += 1; },
    },
  );
  assert.equal(wrongDriverReassignment.ok, false);
  assert.equal(wrongDriverReassignment.reason, "invalid_driver_link");
  assert.equal(invalidReassignmentProviderRequests, 0);

  let nativeProviderRequest = null;
  const nativeAlertClient = createMockClient({
    subscriptions: [
      {
        auth: "native_expo_push_token",
        endpoint: nativeExpoPushToken,
        p256dh: "native_expo_push_token",
        source_surface: "driver_native_ios",
      },
    ],
  });
  const nativeAlertResult = await helper.sendDriverDevicePushAlertForAppUpdate(
    nativeAlertClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      workflow_area: "admin_driver_job_messages",
    },
    {
      env: configuredEnv,
      nativeFetch: async (url, init) => {
        nativeProviderRequest = {
          body: JSON.parse(init.body),
          url,
        };
        return new Response(JSON.stringify({ data: { status: "ok" } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
  );
  assert.equal(nativeAlertResult.ok, true);
  assert.equal(nativeAlertResult.provider_request_count, 1);
  assert.equal(nativeProviderRequest.url, "https://exp.host/--/api/v2/push/send");
  assert.deepEqual(Object.keys(nativeProviderRequest.body).sort(), [
    "body",
    "data",
    "priority",
    "sound",
    "title",
    "to",
  ]);
  assert.equal(nativeProviderRequest.body.title, "Prestige Driver");
  assert.equal(nativeProviderRequest.body.body, "Job update available");
  assert.equal(nativeProviderRequest.body.to, nativeExpoPushToken);
  assert.match(nativeProviderRequest.body.data.job_key, /^[0-9a-f]{64}$/);
  assert.equal(nativeProviderRequest.body.data.open_target, "messages");
  assertExcludes(
    JSON.stringify({ ...nativeProviderRequest.body, to: "" }),
    [
      "PRIVATE-BOOKING-REFERENCE",
      "PRIVATE-RAW-DRIVER-LINK-TOKEN",
      "passenger",
      "route",
      "flight",
      "contact",
      "price",
      "payment",
      "payout",
      "paynow",
      "admin",
      "parser",
      "debug",
    ],
    "native push provider-visible payload privacy",
  );

  let genericNativeProviderRequest = null;
  const genericNativeAlertResult = await helper.sendDriverDevicePushAlertForAppUpdate(
    nativeAlertClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      workflow_area: "driver_job_update",
    },
    {
      env: configuredEnv,
      nativeFetch: async (_url, init) => {
        genericNativeProviderRequest = JSON.parse(init.body);
        return new Response(JSON.stringify({ data: { status: "ok" } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
  );
  assert.equal(genericNativeAlertResult.ok, true);
  assert.equal(genericNativeProviderRequest.body, "Job update available");
  assert.equal(
    Object.hasOwn(genericNativeProviderRequest.data, "open_target"),
    false,
    "generic native app updates must keep opening the normal job",
  );

  let issuedJobPayload = null;
  const issuedJobClient = createMockClient({
    acknowledged: false,
    subscriptions: [
      {
        auth: "guard-auth",
        endpoint: "https://web.push.apple.com/installed-driver-portal",
        p256dh: "guard-p256dh",
      },
    ],
  });
  const issuedJobAlert = await helper.sendDriverDevicePushAlertForNewJobLink(
    issuedJobClient,
    {
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      driver_job_token: "NEW-PRIVATE-DRIVER-JOB-TOKEN",
    },
    {
      env: configuredEnv,
      pushSender: async (_subscription, payload) => { issuedJobPayload = payload; },
    },
  );
  assert.equal(issuedJobAlert.ok, true);
  assert.equal(issuedJobAlert.reason, "send_succeeded");
  assert.equal(issuedJobPayload.title, "Prestige Limo Ops");
  assert.equal(issuedJobPayload.body, "New Driver Job issued. Tap to review.");
  assert.equal(
    issuedJobPayload.target_path,
    "/driver-job/NEW-PRIVATE-DRIVER-JOB-TOKEN",
    "the encrypted Web Push payload must open the exact newly issued private link",
  );
  assertExcludes(
    JSON.stringify({ ...issuedJobPayload, target_path: "" }),
    [
      "PRIVATE-BOOKING-REFERENCE",
      "11111111-1111-4111-8111-111111111111",
      "passenger",
      "customer",
      "price",
      "payout",
      "invoice",
      "billing",
      "payment",
      "paynow",
    ],
    "newly issued driver push visible-data privacy",
  );
  let preAcknowledgementNativeSendCount = 0;
  const nativeOnlyIssuedJobClient = createMockClient({
    acknowledged: false,
    subscriptions: [
      {
        auth: "native_expo_push_token",
        endpoint: nativeExpoPushToken,
        p256dh: "native_expo_push_token",
        source_surface: "driver_native_ios",
      },
    ],
  });
  const nativeOnlyIssuedJobAlert = await helper.sendDriverDevicePushAlertForNewJobLink(
    nativeOnlyIssuedJobClient,
    {
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      driver_job_token: "NEW-PRIVATE-DRIVER-JOB-TOKEN",
    },
    {
      env: configuredEnv,
      nativePushSender: async () => { preAcknowledgementNativeSendCount += 1; },
    },
  );
  assert.equal(nativeOnlyIssuedJobAlert.ok, false);
  assert.equal(nativeOnlyIssuedJobAlert.reason, "no_active_subscriptions");
  assert.equal(preAcknowledgementNativeSendCount, 0);
  let nativePreAcknowledgementRequest = null;
  const nativeHandoffIssuedJobClient = createMockClient({
    acknowledged: false,
    nativeHandoff: true,
    subscriptions: [
      {
        auth: "native_expo_push_token",
        endpoint: nativeExpoPushToken,
        p256dh: "native_expo_push_token",
        source_surface: "driver_native_ios",
      },
    ],
  });
  const nativeHandoffIssuedJobAlert = await helper.sendDriverDevicePushAlertForNewJobLink(
    nativeHandoffIssuedJobClient,
    {
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      driver_job_token: "NEW-PRIVATE-DRIVER-JOB-TOKEN",
    },
    {
      env: configuredEnv,
      nativePushSender: async (expoToken, jobKey, openTarget, visibleBody) => {
        nativePreAcknowledgementRequest = { expoToken, jobKey, openTarget, visibleBody };
      },
    },
  );
  assert.equal(nativeHandoffIssuedJobAlert.ok, true);
  assert.equal(nativeHandoffIssuedJobAlert.native_provider_accepted, true);
  assert.equal(nativeHandoffIssuedJobAlert.native_provider_request_count, 1);
  assert.deepEqual(nativePreAcknowledgementRequest, {
    expoToken: nativeExpoPushToken,
    jobKey: nativeHandoffIssuedJobAlert.ok
      ? helper.opaqueDriverJobLinkKey("11111111-1111-4111-8111-111111111111")
      : "",
    openTarget: null,
    visibleBody: "New job available. Tap to review.",
  });
  assertExcludes(
    JSON.stringify(nativePreAcknowledgementRequest),
    ["NEW-PRIVATE-DRIVER-JOB-TOKEN", "/driver-job/", "PRIVATE-BOOKING-REFERENCE"],
    "native pre-ACK provider payload",
  );
  let pendingAckNativeRequest = null;
  let pendingAckWebSendCount = 0;
  const pendingAckReminderAlert = await helper.sendDriverNativePendingAckReminder(
    createMockClient({
      acknowledged: false,
      nativeHandoff: true,
      subscriptions: [
        {
          auth: "native_expo_push_token",
          endpoint: nativeExpoPushToken,
          p256dh: "native_expo_push_token",
          source_surface: "driver_native_ios",
        },
        {
          auth: "web-auth",
          endpoint: "https://push.example.test/subscription",
          p256dh: "web-p256dh",
          source_surface: "driver_job_acknowledgement",
        },
      ],
    }),
    {
      driver_id: 8,
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
    },
    {
      env: configuredEnv,
      nativePushSender: async (expoToken, jobKey, openTarget, visibleBody) => {
        pendingAckNativeRequest = { expoToken, jobKey, openTarget, visibleBody };
      },
      pushSender: async () => { pendingAckWebSendCount += 1; },
    },
  );
  assert.equal(pendingAckReminderAlert.ok, true);
  assert.equal(pendingAckReminderAlert.native_provider_accepted, true);
  assert.equal(pendingAckReminderAlert.native_provider_request_count, 1);
  assert.equal(pendingAckReminderAlert.provider_request_count, 1);
  assert.equal(pendingAckWebSendCount, 0, "pending ACK reminder must never use browser Web Push");
  assert.deepEqual(pendingAckNativeRequest, {
    expoToken: nativeExpoPushToken,
    jobKey: helper.opaqueDriverJobLinkKey("11111111-1111-4111-8111-111111111111"),
    openTarget: null,
    visibleBody: "Job acknowledgement needed. Tap to review.",
  });
  assertExcludes(
    JSON.stringify(pendingAckNativeRequest),
    ["NEW-PRIVATE-DRIVER-JOB-TOKEN", "/driver-job/", "PRIVATE-BOOKING-REFERENCE"],
    "native pending-ACK reminder payload",
  );
  let nativeWithoutAccountSendCount = 0;
  const nativeWithoutAccountAlert = await helper.sendDriverDevicePushAlertForNewJobLink(
    createMockClient({
      acknowledged: false,
      activeOnePhoneAccount: false,
      nativeHandoff: true,
      subscriptions: [
        {
          auth: "native_expo_push_token",
          endpoint: nativeExpoPushToken,
          p256dh: "native_expo_push_token",
          source_surface: "driver_native_ios",
        },
      ],
    }),
    {
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      driver_job_token: "NEW-PRIVATE-DRIVER-JOB-TOKEN",
    },
    {
      env: configuredEnv,
      nativePushSender: async () => { nativeWithoutAccountSendCount += 1; },
    },
  );
  assert.equal(nativeWithoutAccountAlert.ok, false);
  assert.equal(nativeWithoutAccountAlert.reason, "no_active_subscriptions");
  assert.equal(nativeWithoutAccountSendCount, 0);
  let multipleNativeSendCount = 0;
  const multipleNativeAlert = await helper.sendDriverDevicePushAlertForNewJobLink(
    createMockClient({
      acknowledged: false,
      nativeHandoff: true,
      subscriptions: [
        {
          auth: "native_expo_push_token",
          endpoint: nativeExpoPushToken,
          p256dh: "native_expo_push_token",
          source_surface: "driver_native_ios",
        },
        {
          auth: "native_expo_push_token",
          endpoint: "ExpoPushToken[zyxwvutsrqponmlkjihgfedcba0987654321]",
          p256dh: "native_expo_push_token",
          source_surface: "driver_native_ios",
        },
      ],
    }),
    {
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      driver_job_token: "NEW-PRIVATE-DRIVER-JOB-TOKEN",
    },
    {
      env: configuredEnv,
      nativePushSender: async () => { multipleNativeSendCount += 1; },
    },
  );
  assert.equal(multipleNativeAlert.ok, false);
  assert.equal(multipleNativeAlert.reason, "no_active_subscriptions");
  assert.equal(multipleNativeSendCount, 0);
  const mismatchedIssuedJobAlert = await helper.sendDriverDevicePushAlertForNewJobLink(
    issuedJobClient,
    {
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      driver_job_token: "DIFFERENT-PRIVATE-DRIVER-JOB-TOKEN",
    },
    { env: configuredEnv, pushSender: async () => undefined },
  );
  assert.equal(mismatchedIssuedJobAlert.ok, false);
  assert.equal(mismatchedIssuedJobAlert.reason, "invalid_driver_link");

  let pickupReminderPayload = null;
  const pickupReminderAlert = await helper.sendDriverDevicePushAlertForPickupReminder(
    issuedJobClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_id: 8,
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      notification_id: "22222222-2222-4222-8222-222222222222",
    },
    {
      env: configuredEnv,
      pushSender: async (_subscription, payload) => {
        pickupReminderPayload = payload;
      },
    },
  );
  assert.equal(pickupReminderAlert.ok, true);
  assert.equal(pickupReminderAlert.reason, "send_succeeded");
  assert.equal(
    pickupReminderPayload.body,
    "Pickup is in 1 hour. Open Driver Portal to review.",
  );
  assert.equal(pickupReminderPayload.title, "Prestige Limo Ops");
  assert.match(pickupReminderPayload.job_key, /^[0-9a-f]{64}$/);
  assertExcludes(
    JSON.stringify(pickupReminderPayload),
    [
      "PRIVATE-BOOKING-REFERENCE",
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "passenger",
      "customer",
      "contact",
      "price",
      "payout",
      "invoice",
      "billing",
      "payment",
      "paynow",
    ],
    "one-hour pickup push visible-data privacy",
  );

  let nativePickupProviderRequest = null;
  const nativePickupReminderAlert = await helper.sendDriverDevicePushAlertForPickupReminder(
    nativeAlertClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_id: 8,
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
      notification_id: "22222222-2222-4222-8222-222222222222",
    },
    {
      env: configuredEnv,
      nativeFetch: async (url, init) => {
        nativePickupProviderRequest = {
          body: JSON.parse(init.body),
          url,
        };
        return new Response(JSON.stringify({ data: { status: "ok" } }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        });
      },
    },
  );
  assert.equal(nativePickupReminderAlert.ok, true);
  assert.equal(nativePickupReminderAlert.provider_request_count, 1);
  assert.equal(nativePickupProviderRequest.url, "https://exp.host/--/api/v2/push/send");
  assert.equal(nativePickupProviderRequest.body.title, "Prestige Driver");
  assert.equal(
    nativePickupProviderRequest.body.body,
    "Pickup is in 1 hour. Open Driver Portal to review.",
    "native iOS must visibly identify the one-hour pickup reminder",
  );
  assert.match(nativePickupProviderRequest.body.data.job_key, /^[0-9a-f]{64}$/);
  assert.equal(
    Object.hasOwn(nativePickupProviderRequest.body.data, "open_target"),
    false,
    "the one-hour pickup reminder must keep opening the normal job and never target Messages",
  );
  const mismatchedPickupDriver = await helper.sendDriverDevicePushAlertForPickupReminder(
    issuedJobClient,
    {
      booking_reference: "PRIVATE-BOOKING-REFERENCE",
      delivery_surface: "driver_app",
      driver_id: 9,
      driver_job_link_id: "11111111-1111-4111-8111-111111111111",
    },
    { env: configuredEnv, pushSender: async () => undefined },
  );
  assert.equal(mismatchedPickupDriver.ok, false);
  assert.equal(mismatchedPickupDriver.reason, "invalid_driver_link");
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Driver Job acknowledgement device push alert guard passed.");
