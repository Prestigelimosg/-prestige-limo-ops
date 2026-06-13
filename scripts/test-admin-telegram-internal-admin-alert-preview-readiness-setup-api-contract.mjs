import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-telegram-internal-admin-alert-preview-readiness-setup/route.ts";
const helperPath = "lib/admin-telegram-internal-admin-alert-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-telegram-alert-disabled-adapter.ts",
  helperPath,
];
const eventTypes = [
  "driver_ack_customer_message_ready",
  "customer_driver_details_email_ready",
  "urgent_review_required",
];
const unsafeOutputPattern =
  /driver_payout|customer_price|payment|invoice|paynow|payout|finance|token|secret|api\.telegram|sendMessage|bot[_-]?token/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-telegram-internal-admin-alert-preview-readiness-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertNoLiveFlags(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  assert.equal(value.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
}

function transpileTypescript(tsSource, filename) {
  return ts.transpileModule(tsSource, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-telegram-alert-preview-api-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "buildAdminTelegramInternalAdminAlertSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "telegram_internal_admin",
  "driver_ack_customer_message_ready",
  "customer_driver_details_email_ready",
  "urgent_review_required",
  "sendingEnabled",
  "external_send",
  "providerConfigured",
  "liveSendingEnabled",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing Telegram alert API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "api.telegram.org",
  "telegram.org",
  "sendMessage",
  "getUpdates",
  "webhook",
  "polling",
  "BOT_TOKEN",
  "TELEGRAM_BOT_TOKEN",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Telegram internal admin alert preview API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assertNoLiveFlags(anonymous, "Anonymous blocked response");
  assert.equal(anonymous.channel, "telegram_internal_admin");
  assert.deepEqual(anonymous.eventTypes, eventTypes);
  assert.deepEqual(anonymous.readiness.missing_requirements, ["event_type", "safe_message"]);
  assert.equal(anonymous.readiness.alertReadyForFutureSetup, false);

  const defaultResponse = await harness.route.GET(new Request(apiUrl(), { headers: adminHeaders() }));
  const defaultResult = await defaultResponse.json();

  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultResult.ok, true);
  assertNoLiveFlags(defaultResult, "Default response");
  assertNoLiveFlags(defaultResult.readiness, "Default readiness");
  assert.equal(defaultResult.channel, "telegram_internal_admin");
  assert.deepEqual(defaultResult.eventTypes, eventTypes);
  assert.equal(defaultResult.preview.channel, "telegram_internal_admin");
  assert.equal(defaultResult.preview.event_type, null);
  assert.equal(defaultResult.preview.safe_message, null);
  assert.deepEqual(defaultResult.readiness.missing_requirements, ["event_type", "safe_message"]);
  assert.equal(defaultResult.readiness.alertReadyForFutureSetup, false);

  const driverAckResponse = await harness.route.GET(
    new Request(
      apiUrl({
        action_source: "driver_ack_handoff_setup",
        booking_reference: "PLO-TG-API-001",
        event_type: "driver-ack-customer-message-ready",
      }),
      { headers: adminHeaders() },
    ),
  );
  const driverAck = await driverAckResponse.json();

  assert.equal(driverAckResponse.status, 200);
  assert.equal(driverAck.ok, true);
  assertNoLiveFlags(driverAck, "Driver ack response");
  assertNoLiveFlags(driverAck.readiness, "Driver ack readiness");
  assert.equal(driverAck.event_type, "driver_ack_customer_message_ready");
  assert.equal(driverAck.preview.channel, "telegram_internal_admin");
  assert.equal(driverAck.preview.event_type, "driver_ack_customer_message_ready");
  assert.equal(driverAck.preview.safe_message, "Driver acknowledgement customer message is ready for PLO-TG-API-001.");
  assert.equal(driverAck.readiness.alertReadyForFutureSetup, true);
  assert.deepEqual(driverAck.readiness.missing_requirements, []);
  assert.equal(driverAck.alert.disabled_adapter.status, "disabled");
  assert.equal(driverAck.alert.disabled_adapter.external_send, false);

  const customerEmailResponse = await harness.route.GET(
    new Request(
      apiUrl({
        actionSource: "customer_copy_email_review",
        bookingReference: "PLO-TG-API-002",
        eventType: "customer_driver_details_email_ready",
        safeMessage: "Customer driver details email is ready for admin review.",
        safeTitle: "Customer driver details email ready",
      }),
      { headers: adminHeaders() },
    ),
  );
  const customerEmail = await customerEmailResponse.json();

  assert.equal(customerEmailResponse.status, 200);
  assertNoLiveFlags(customerEmail, "Customer driver-details email response");
  assert.equal(customerEmail.event_type, "customer_driver_details_email_ready");
  assert.equal(customerEmail.preview.safe_message, "Customer driver details email is ready for admin review.");
  assert.equal(customerEmail.preview.safe_title, "Customer driver details email ready");
  assert.equal(customerEmail.readiness.alertReadyForFutureSetup, true);

  const urgentResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-TG-API-003",
        event_type: "urgent_review_required",
      }),
      { headers: adminHeaders() },
    ),
  );
  const urgent = await urgentResponse.json();

  assert.equal(urgentResponse.status, 200);
  assertNoLiveFlags(urgent, "Urgent review response");
  assert.equal(urgent.event_type, "urgent_review_required");
  assert.equal(urgent.preview.safe_title, "Urgent admin review required");
  assert.equal(urgent.preview.safe_message, "Urgent admin review is required for PLO-TG-API-003.");
  assert.equal(urgent.readiness.alertReadyForFutureSetup, true);

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "driver_payout-secret",
        event_type: "send_live_telegram",
        safe_message: "customer_price payment invoice token",
        safe_title: "driver_payout",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assertNoLiveFlags(unsafe, "Unsafe response");
  assert.equal(unsafe.event_type, null);
  assert.equal(unsafe.preview.event_type, null);
  assert.equal(unsafe.preview.safe_message, null);
  assert.equal(unsafe.preview.safe_title, null);
  assert.equal(unsafe.readiness.alertReadyForFutureSetup, false);
  assert.deepEqual(unsafe.readiness.missing_requirements, ["event_type", "safe_message"]);
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(unsafe)),
    false,
    "Unsafe Telegram alert preview API output must not leak live-send, token, payment, or payout text.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin Telegram internal admin alert preview readiness setup API contract passed");
