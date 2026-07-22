import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/driver-device-push-notification.ts";
const productionPath = "lib/driver-job-link-production.ts";
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
] = await Promise.all(
  [
    helperPath,
    productionPath,
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
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
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
    "New Driver Job issued. Tap to review.",
    "New Driver Job app update. Tap to review.",
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
    "reopen this page to check App Updates",
    'data-driver-job-device-alert-helper="true"',
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
    "Enable Job Alerts",
    "Notification.requestPermission()",
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
assertExcludes(
  portalPageSource + portalRouteSource,
  ["invoice", "billing", "payment", "payout", "paynow", "customer_price"],
  "Driver Portal alert isolation",
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
const tempDriverLinkPath = path.join(tempDir, "lib/driver-job-link.ts");
await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
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

function createMockClient({ acknowledged = true, subscriptions = [] } = {}) {
  const linkId = "11111111-1111-4111-8111-111111111111";
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
            link_status: "active",
            revoked_at: null,
            safe_link_context: acknowledged
              ? { driver_acknowledged_at: "2026-07-22T00:00:00.000Z" }
              : {},
            token_hash: "hash:NEW-PRIVATE-DRIVER-JOB-TOKEN",
          },
          error: null,
        };
      }
      if (query.table === "driver_device_push_subscriptions" && query.operation === "select") {
        return { data: subscriptions, error: null };
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
} finally {
  await rm(tempDir, { force: true, recursive: true });
}

console.log("Driver Job acknowledgement device push alert guard passed.");
