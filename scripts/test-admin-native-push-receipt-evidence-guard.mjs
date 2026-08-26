import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-device-push-notification.ts";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationPath = "scripts/test-preactivation-verification-suite.mjs";
const [helperSource, ledgerSource, preactivationSource] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationPath, "utf8"),
]);

for (const fragment of [
  'import { after } from "next/server"',
  'const expoPushReceiptEndpoint = "https://exp.host/--/api/v2/push/getReceipts"',
  "ticketReceiptId",
  "nativePushFetcher",
  "nativeReceiptScheduler",
  "nativeReceiptFetcher",
  "admin_native_push_ticket_accepted",
  "admin_native_push_receipt_ok",
  "admin_native_push_receipt_error",
  "admin_native_push_receipt_pending",
]) {
  assert.ok(helperSource.includes(fragment), `Admin native receipt source must include ${fragment}`);
}
assert.match(
  helperSource,
  /ticket\?\.status !== "ok"[\s\S]*?!ticketReceiptId[\s\S]*?throw error/,
  "An Expo ticket without a bounded receipt ID must fail before being classified as accepted.",
);
assert.match(
  helperSource,
  /admin_native_push_receipt_ok[\s\S]*?recordSubscriptionSendSuccess/,
  "Native last_success_at must be recorded only after an Expo receipt confirms APNs acceptance.",
);
assert.match(
  helperSource,
  /admin_native_push_receipt_error[\s\S]*?releaseNativePushBadgeCount[\s\S]*?recordSubscriptionSendFailure/,
  "A rejected Expo receipt must roll back only its badge and record subscription failure.",
);
const ticketBranchStart = helperSource.indexOf("if (nativeTicket) {");
const ticketBranchEnd = helperSource.indexOf(
  "} else if (shouldRecordSubscriptionHealth)",
  ticketBranchStart,
);
assert.ok(ticketBranchStart >= 0 && ticketBranchEnd > ticketBranchStart);
const ticketBranch = helperSource.slice(ticketBranchStart, ticketBranchEnd);
assert.doesNotMatch(
  ticketBranch,
  /recordSubscriptionSendSuccess/,
  "Ticket queue acceptance must never write native last_success_at.",
);
for (const forbidden of [
  "console.log(expoPushToken",
  "console.info(expoPushToken",
  "console.warn(expoPushToken",
  "console.error(expoPushToken",
]) {
  assert.equal(helperSource.includes(forbidden), false, `Receipt evidence must not log ${forbidden}`);
}

const tempDir = path.join(process.cwd(), ".tmp-admin-native-receipt-evidence-guard");
const tempHelperPath = path.join(tempDir, "lib/admin-device-push-notification.js");
const tempBadgeHelperPath = path.join(tempDir, "lib/native-push-badge-count.js");
await rm(tempDir, { force: true, recursive: true });
await mkdir(path.dirname(tempHelperPath), { recursive: true });
await writeFile(
  tempBadgeHelperPath,
  [
    "exports.reserveNativePushBadgeCount = async function () { return { count: 1, previousCount: 0, table: 'admin_device_push_subscriptions', token: 'hidden', tokenColumn: 'endpoint' }; };",
    "exports.releaseNativePushBadgeCount = async function () { globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__ = (globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__ || 0) + 1; return true; };",
    "exports.resetNativePushBadgeCount = async function () { return false; };",
  ].join("\n"),
);
await writeFile(
  tempHelperPath,
  ts.transpileModule(helperSource.replace('import "server-only";', ""), {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: helperPath,
  }).outputText,
);

try {
  const helper = createRequire(import.meta.url)(tempHelperPath);
  const configuredEnv = {
    PRESTIGE_ADMIN_DEVICE_PUSH_ENABLED: "true",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PUBLIC_KEY: "fake-public-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_VAPID_PRIVATE_KEY: "fake-private-key-for-guard",
    PRESTIGE_ADMIN_DEVICE_PUSH_CONTACT_EMAIL: "ops@example.test",
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "fake-service-role-key-for-guard",
  };
  const nativeToken = "ExpoPushToken[AdminReceiptEvidenceToken1234567890]";
  const ticketReceiptId = "11111111-2222-4333-8444-555555555555";
  const loadedSubscriptionLoader = async () => [{
    channel: "native_ios",
    endpoint: nativeToken,
    webSubscription: null,
  }];

  const scheduledOkTasks = [];
  const pushRequests = [];
  const receiptRequests = [];
  const evidenceLogs = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  console.info = (...args) => evidenceLogs.push(args);
  console.warn = (...args) => evidenceLogs.push(args);
  try {
    const accepted = await helper.sendAdminDevicePushAlert("admin_booking_created", {
      badgeClient: { from() { throw new Error("badge client is handled by the guard stub"); } },
      env: configuredEnv,
      loadedSubscriptionLoader,
      nativePushFetcher: async (url, init) => {
        pushRequests.push({ body: JSON.parse(init.body), url });
        return {
          json: async () => ({ data: { id: ticketReceiptId, status: "ok" } }),
          ok: true,
          status: 200,
        };
      },
      nativeReceiptFetcher: async (url, init) => {
        receiptRequests.push({ body: JSON.parse(init.body), url });
        return {
          json: async () => ({ data: { [ticketReceiptId]: { status: "ok" } } }),
          ok: true,
          status: 200,
        };
      },
      nativeReceiptScheduler: (task) => scheduledOkTasks.push(task),
    });
    assert.equal(accepted.ok, true);
    assert.equal("ticketReceiptId" in accepted, false, "Receipt IDs must remain server-only");
    assert.equal(scheduledOkTasks.length, 1, "Ticket acceptance must schedule one receipt check");
    await scheduledOkTasks[0]();
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
  }
  assert.deepEqual(pushRequests, [{
    body: {
      badge: 1,
      body: "New job saved. Open Dashboard to review.",
      data: { open_target: "/", type: "admin_booking_created" },
      priority: "high",
      sound: "default",
      title: "Prestige Limo Ops",
      to: nativeToken,
    },
    url: "https://exp.host/--/api/v2/push/send",
  }], "Receipt evidence must preserve the established native payload exactly");
  assert.deepEqual(receiptRequests, [{
    body: { ids: [ticketReceiptId] },
    url: "https://exp.host/--/api/v2/push/getReceipts",
  }]);
  const serializedEvidence = JSON.stringify(evidenceLogs);
  assert.match(serializedEvidence, /admin_native_push_ticket_accepted/);
  assert.match(serializedEvidence, /admin_native_push_receipt_ok/);
  assert.equal(serializedEvidence.includes(nativeToken), false, "Evidence must not expose the Expo token");

  const missingTicketTasks = [];
  const missingTicket = await helper.sendAdminDevicePushAlert("admin_booking_created", {
    badgeClient: { from() { throw new Error("badge client is handled by the guard stub"); } },
    env: configuredEnv,
    loadedSubscriptionLoader,
    nativePushFetcher: async () => ({
      json: async () => ({ data: { status: "ok" } }),
      ok: true,
      status: 200,
    }),
    nativeReceiptScheduler: (task) => missingTicketTasks.push(task),
  });
  assert.equal(missingTicket.ok, false, "Ticket acceptance without a receipt ID must fail closed");
  assert.equal(missingTicket.reason, "provider_failure");
  assert.equal(missingTicketTasks.length, 0, "A malformed ticket must not schedule a receipt lookup");

  globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__ = 0;
  const scheduledPendingTasks = [];
  const pendingEvidenceLogs = [];
  console.info = (...args) => pendingEvidenceLogs.push(args);
  try {
    const pending = await helper.sendAdminDevicePushAlert("admin_booking_created", {
      badgeClient: { from() { throw new Error("badge client is handled by the guard stub"); } },
      env: configuredEnv,
      loadedSubscriptionLoader,
      nativePushSender: async () => ({ ticketReceiptId }),
      nativeReceiptFetcher: async () => ({
        json: async () => ({ data: {} }),
        ok: true,
        status: 200,
      }),
      nativeReceiptScheduler: (task) => scheduledPendingTasks.push(task),
    });
    assert.equal(pending.ok, true);
    assert.equal(scheduledPendingTasks.length, 1);
    await scheduledPendingTasks[0]();
  } finally {
    console.info = originalInfo;
  }
  assert.match(JSON.stringify(pendingEvidenceLogs), /admin_native_push_receipt_pending/);
  assert.equal(
    globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__,
    0,
    "A receipt that is not available yet must not roll back a possibly delivered badge",
  );

  globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__ = 0;
  const scheduledErrorTasks = [];
  const rejected = await helper.sendAdminDevicePushAlert("admin_booking_created", {
    badgeClient: { from() { throw new Error("badge client is handled by the guard stub"); } },
    env: configuredEnv,
    loadedSubscriptionLoader,
    nativePushSender: async () => ({ ticketReceiptId }),
    nativeReceiptFetcher: async () => ({
      json: async () => ({
        data: {
          [ticketReceiptId]: {
            details: { error: "DeviceNotRegistered" },
            message: "The device is no longer registered.",
            status: "error",
          },
        },
      }),
      ok: true,
      status: 200,
    }),
    nativeReceiptScheduler: (task) => scheduledErrorTasks.push(task),
  });
  assert.equal(rejected.ok, true, "Ticket acceptance remains best-effort for booking persistence");
  assert.equal(scheduledErrorTasks.length, 1);
  await scheduledErrorTasks[0]();
  assert.equal(globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__, 1);
} finally {
  delete globalThis.__ADMIN_NATIVE_RECEIPT_RELEASE_COUNT__;
  await rm(tempDir, { force: true, recursive: true });
}

assert.match(ledgerSource, /Admin Expo Ticket And APNs Receipt Evidence Repair/);
assert.ok(
  preactivationSource.includes("scripts/test-admin-native-push-receipt-evidence-guard.mjs"),
  "The Admin receipt evidence guard must run in preactivation.",
);

console.log("Admin native Expo ticket and APNs receipt evidence guard passed.");
