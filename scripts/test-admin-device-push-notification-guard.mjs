import assert from "node:assert/strict";
import { mkdir, rm, writeFile, readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-device-push-notification.ts";
const routePath = "app/api/admin-device-push-subscriptions/route.ts";
const customerBookingRoutePath = "app/api/customer-booking-requests/route.ts";
const adminAppNotificationPersistencePath = "lib/admin-app-notification-persistence.ts";
const driverJobProductionPath = "lib/driver-job-link-production.ts";
const driverOtsPhotoRoutePath = "app/api/driver-job/[token]/ots-photo/route.ts";
const customerDriverNotificationPersistencePath =
  "lib/customer-driver-app-notification-persistence.ts";
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
  adminAppNotificationPersistenceSource,
  driverJobProductionSource,
  driverOtsPhotoRouteSource,
  customerDriverNotificationPersistenceSource,
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
    adminAppNotificationPersistencePath,
    driverJobProductionPath,
    driverOtsPhotoRoutePath,
    customerDriverNotificationPersistencePath,
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
    "sendAdminDevicePushAlert",
    "customer_booking_amendment",
    "customer_booking_cancellation",
    "driver_acknowledged",
    "driver_otw",
    "driver_ots",
    "driver_pob",
    "driver_completed",
    "driver_ots_photo",
    "driver_issue",
    "customer_to_driver_reply",
    "driver_to_customer_reply",
    "customer_driver_details_acknowledged",
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
  adminAppNotificationPersistenceSource,
  [
    'sendAdminDevicePushAlert("driver_issue")',
    'sendAdminDevicePushAlert(`customer_booking_${requestKind}`)',
  ],
  "existing admin app notification persistence push fan-out",
);

assertIncludes(
  driverJobProductionSource,
  [
    'sendAdminDevicePushAlert("driver_acknowledged")',
    "sendAdminDevicePushAlert(`driver_${result.status}`)",
  ],
  "existing driver acknowledgement and status success paths",
);

assertIncludes(
  driverOtsPhotoRouteSource,
  ['sendAdminDevicePushAlert("driver_ots_photo")'],
  "existing OTS photo success path",
);

assertIncludes(
  customerDriverNotificationPersistenceSource,
  [
    'sendAdminDevicePushAlert("customer_driver_details_acknowledged")',
    'sendAdminDevicePushAlert("customer_to_driver_reply")',
    'sendAdminDevicePushAlert("driver_to_customer_reply")',
  ],
  "existing customer and driver quick-reply success paths",
);

assertIncludes(
  dashboardSource,
  [
    "adminDevicePushSubscriptionsApiPath",
    "navigator.serviceWorker.register",
    "PushManager",
    "Notification.requestPermission",
    "data-admin-device-push-panel",
    "data-admin-device-push-compact-control",
    "data-admin-device-push-toggle",
    'role="switch"',
    "Push ON",
    "Push OFF",
    "handleAdminDevicePushEnable",
    "handleAdminDevicePushDisable",
  ],
  "dashboard device push UI",
);
assertExcludes(
  dashboardSource,
  [
    ">Device Push Alerts<",
    "Optional phone/Mac browser alert for new booking requests.",
    "Push alerts ON",
    "Push alerts OFF",
  ],
  "removed expanded dashboard device push UI",
);
assert.equal(
  dashboardSource.match(/data-admin-device-push-toggle="true"/g)?.length,
  1,
  "dashboard must render exactly one admin device push toggle",
);

const codexHeaderStart = dashboardSource.indexOf(
  'aria-label="Codex Review and Admin App Notifications"',
);
const codexHeaderEnd = dashboardSource.indexOf(
  "{dashboardSystemNotices.length > 0 ? (",
  codexHeaderStart,
);
assert.notEqual(codexHeaderStart, -1, "Codex notification header must exist");
assert.notEqual(codexHeaderEnd, -1, "Codex notification header boundary must exist");
const codexHeaderSource = dashboardSource.slice(codexHeaderStart, codexHeaderEnd);
assertIncludes(
  codexHeaderSource,
  [
    'data-admin-app-notification-feed-state="true"',
    'data-admin-device-push-panel="true"',
    'data-admin-device-push-compact-control="true"',
    'data-admin-device-push-toggle="true"',
  ],
  "Codex notification header compact device push control",
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
    "Admin App Operational Lock-Screen Alert Fan-Out",
    "PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED",
    "New booking request received. Open Dashboard to review.",
    "customer amendment and cancellation requests",
    "driver acknowledgement, OTW, OTS, POB, Job Completed, OTS-photo, and issue reports",
    "Monthly billing and the entire owner-locked invoice system remain untouched.",
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

  const approvedOperationalEvents = {
    customer_booking_amendment: [
      "Customer amendment request",
      "Customer amendment request received. Open Dashboard to review.",
    ],
    customer_booking_cancellation: [
      "Customer cancellation request",
      "Customer cancellation request received. Open Dashboard to review.",
    ],
    customer_driver_details_acknowledged: [
      "Driver details acknowledged",
      "Customer acknowledged the assigned driver details. Open Dashboard to review.",
    ],
    customer_to_driver_reply: [
      "Customer app reply",
      "Customer sent a driver app reply. Open Dashboard to review.",
    ],
    driver_acknowledged: [
      "Driver acknowledged job",
      "Driver saved details and acknowledged a job. Open Dashboard to review.",
    ],
    driver_completed: [
      "Driver reported Job Completed",
      "Driver reported Job Completed. Open Dashboard to review.",
    ],
    driver_issue: [
      "Driver issue alert",
      "Driver reported an issue. Open Dashboard to review.",
    ],
    driver_ots: [
      "Driver reported OTS",
      "Driver reported OTS. Open Dashboard to review.",
    ],
    driver_ots_photo: [
      "OTS photo received",
      "Driver sent an OTS photo. Open Dashboard to review.",
    ],
    driver_otw: [
      "Driver reported OTW",
      "Driver reported OTW. Open Dashboard to review.",
    ],
    driver_pob: [
      "Driver reported POB",
      "Driver reported POB. Open Dashboard to review.",
    ],
    driver_to_customer_reply: [
      "Driver app reply",
      "Driver sent a customer app reply. Open Dashboard to review.",
    ],
  };

  for (const [eventType, [title, body]] of Object.entries(approvedOperationalEvents)) {
    let operationalPayload = null;
    const operationalAlert = await helper.sendAdminDevicePushAlert(eventType, {
      env: configuredEnv,
      subscriptionLoader: async () => [
        {
          endpoint: "https://push.example.test/operational-subscription",
          keys: {
            auth: "fake-auth-operational",
            p256dh: "fake-p256dh-operational",
          },
        },
      ],
      pushSender: async (_subscription, payload) => {
        operationalPayload = payload;
      },
    });

    assert.equal(operationalAlert.ok, true, `${eventType} push must send.`);
    assert.equal(operationalPayload.title, title);
    assert.equal(operationalPayload.body, body);
    assert.equal(operationalPayload.url, "/");
    assert.equal(operationalPayload.tag, `prestige-admin-${eventType.replaceAll("_", "-")}`);
    assertExcludes(
      JSON.stringify(operationalPayload),
      ["payout", "paynow", "billing", "payment", "invoice", "price", "internal note"],
      `${eventType} admin push payload`,
    );
  }

  const invalidOperationalAlert = await helper.sendAdminDevicePushAlert("monthly_billing", {
    env: configuredEnv,
    subscriptionLoader: async () => {
      throw new Error("invalid events must be rejected before subscription reads");
    },
  });
  assert.equal(invalidOperationalAlert.ok, false);
  assert.equal(invalidOperationalAlert.reason, "invalid_event");

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
