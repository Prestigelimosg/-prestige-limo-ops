import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-telegram-internal-admin-alert-setup-foundation.ts";
const helperPaths = [
  "lib/admin-telegram-alert-disabled-adapter.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Telegram internal admin alert helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Telegram internal admin alert helper must not use network APIs.");
assert.equal(/api\.telegram\.org|telegram\.org|t\.me|\/api\/telegram|\/telegram\b/i.test(source), false, "Telegram internal admin alert helper must not include Telegram URLs.");
assert.equal(/sendMessage|getUpdates|webhook|polling/i.test(source), false, "Telegram internal admin alert helper must not include Telegram send/polling operations.");
assert.equal(/\bprocess\.env\b|BOT_TOKEN|bot[_-]?token|TELEGRAM_BOT_TOKEN|TELEGRAM_API_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY/i.test(source), false, "Telegram internal admin alert helper must not reference token/env secrets.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Telegram internal admin alert helper must not use DB writes.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Telegram internal admin alert helper must not define API behavior.");

for (const fragment of [
  "driver_ack_customer_message_ready",
  "customer_driver_details_email_ready",
  "urgent_review_required",
  "telegram_internal_admin",
  "sendingEnabled: false",
  "external_send: false",
  "providerConfigured: false",
  "prepareDisabledAdminTelegramAlert",
]) {
  assert.ok(source.includes(fragment), `Missing Telegram internal admin alert setup fragment: ${fragment}`);
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-telegram-internal-alert-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const pathName of helperPaths) {
    const outputPath = path.join(tempDir, pathName.replace(/\.ts$/, ".js"));
    const helperSource = await readFile(pathName, "utf8");

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(helperSource, pathName));
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(
      path.join(tempDir, "lib/admin-telegram-internal-admin-alert-setup-foundation.js"),
    ),
  };
}

const harness = await loadHelper();

try {
  const {
    adminTelegramInternalAdminAlertEventTypes,
    buildAdminTelegramInternalAdminAlertSetup,
  } = harness.helper;

  assert.deepEqual(adminTelegramInternalAdminAlertEventTypes, [
    "driver_ack_customer_message_ready",
    "customer_driver_details_email_ready",
    "urgent_review_required",
  ]);

  const driverAckReady = buildAdminTelegramInternalAdminAlertSetup({
    action_source: "driver_ack_handoff_setup",
    booking_reference: "PLO-TG-001",
    event_type: "driver-ack-customer-message-ready",
  });

  assert.deepEqual(driverAckReady, {
    action_source: "driver_ack_handoff_setup",
    alert_payload: {
      action_source: "driver_ack_handoff_setup",
      booking_reference: "PLO-TG-001",
      channel: "telegram_internal_admin",
      event_type: "driver_ack_customer_message_ready",
      external_send: false,
      providerConfigured: false,
      safe_message: "Driver acknowledgement customer message is ready for PLO-TG-001.",
      safe_title: "Driver acknowledgement customer message ready",
      sendingEnabled: false,
    },
    booking_reference: "PLO-TG-001",
    channel: "telegram_internal_admin",
    delivery_surface: "telegram_internal_admin_alert_setup_only",
    disabled_adapter: {
      delivery_surface: "telegram_disabled",
      event_key: "driver_ack_customer_message_ready-PLO-TG-001",
      external_send: false,
      notification_type: "driver_ack_customer_message_ready",
      preview: {
        safe_message: "Driver acknowledgement customer message is ready for PLO-TG-001.",
        safe_title: "Driver acknowledgement customer message ready",
      },
      status: "disabled",
      version: "admin-telegram-alert-disabled-adapter-v1",
    },
    event_type: "driver_ack_customer_message_ready",
    external_send: false,
    missing_requirements: [],
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-telegram-internal-admin-alert-setup-foundation-v1",
  });

  const customerDriverDetailsReady = buildAdminTelegramInternalAdminAlertSetup({
    action_source: "customer_copy_email_review",
    booking_reference: "PLO-TG-002",
    event_type: "customer_driver_details_email_ready",
    safe_message: "Customer driver details email is ready for admin review.",
    safe_title: "Customer driver details email ready",
  });

  assert.equal(customerDriverDetailsReady.channel, "telegram_internal_admin");
  assert.equal(customerDriverDetailsReady.alert_payload.event_type, "customer_driver_details_email_ready");
  assert.equal(customerDriverDetailsReady.alert_payload.safe_message, "Customer driver details email is ready for admin review.");
  assert.equal(customerDriverDetailsReady.providerConfigured, false);
  assert.equal(customerDriverDetailsReady.sendingEnabled, false);
  assert.equal(customerDriverDetailsReady.external_send, false);
  assert.equal(customerDriverDetailsReady.disabled_adapter.status, "disabled");
  assert.deepEqual(customerDriverDetailsReady.missing_requirements, []);

  const urgentReview = buildAdminTelegramInternalAdminAlertSetup({
    booking_reference: "PLO-TG-003",
    event_type: "urgent_review_required",
  });

  assert.equal(urgentReview.event_type, "urgent_review_required");
  assert.equal(urgentReview.alert_payload.safe_title, "Urgent admin review required");
  assert.equal(urgentReview.alert_payload.safe_message, "Urgent admin review is required for PLO-TG-003.");
  assert.equal(urgentReview.disabled_adapter.notification_type, "urgent_review_required");
  assert.equal(urgentReview.providerConfigured, false);
  assert.equal(urgentReview.sendingEnabled, false);
  assert.equal(urgentReview.external_send, false);

  const unsafe = buildAdminTelegramInternalAdminAlertSetup({
    action_source: "payment-token",
    booking_reference: "driver_payout-secret",
    event_type: "send_live_telegram",
    safe_message: "customer_price payment invoice token",
    safe_title: "driver_payout",
  });

  assert.deepEqual(unsafe, {
    action_source: null,
    alert_payload: {
      action_source: null,
      booking_reference: null,
      channel: "telegram_internal_admin",
      event_type: null,
      external_send: false,
      providerConfigured: false,
      safe_message: null,
      safe_title: null,
      sendingEnabled: false,
    },
    booking_reference: null,
    channel: "telegram_internal_admin",
    delivery_surface: "telegram_internal_admin_alert_setup_only",
    disabled_adapter: {
      delivery_surface: "telegram_disabled",
      event_key: null,
      external_send: false,
      notification_type: null,
      preview: {
        safe_message: null,
        safe_title: null,
      },
      status: "disabled",
      version: "admin-telegram-alert-disabled-adapter-v1",
    },
    event_type: null,
    external_send: false,
    missing_requirements: ["event_type", "safe_message"],
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-telegram-internal-admin-alert-setup-foundation-v1",
  });
  assert.equal(
    /driver_payout|customer_price|payment|invoice|token|secret|api\.telegram|sendMessage|bot/i.test(
      JSON.stringify(unsafe),
    ),
    false,
    "Unsafe Telegram internal admin alert output must not leak live-send, token, payment, or payout text.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin Telegram internal admin alert setup foundation contract tests passed.");
