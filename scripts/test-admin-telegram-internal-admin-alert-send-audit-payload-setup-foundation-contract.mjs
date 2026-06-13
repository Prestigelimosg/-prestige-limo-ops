import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath =
  "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.ts";
const helperPaths = [
  "lib/admin-telegram-alert-disabled-adapter.ts",
  "lib/admin-telegram-internal-admin-alert-setup-foundation.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Telegram alert send audit helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Telegram alert send audit helper must not use network APIs.");
assert.equal(/api\.telegram\.org|telegram\.org|t\.me|\/api\/telegram|\/telegram\b/i.test(source), false, "Telegram alert send audit helper must not include Telegram URLs.");
assert.equal(/sendMessage|getUpdates|webhook|polling/i.test(source), false, "Telegram alert send audit helper must not include Telegram send/polling operations.");
assert.equal(/\bprocess\.env\b|BOT_TOKEN|bot[_-]?token|TELEGRAM_BOT_TOKEN|TELEGRAM_API_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY/i.test(source), false, "Telegram alert send audit helper must not reference token/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Telegram alert send audit helper must not define API behavior.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Telegram alert send audit helper must not use DB writes.");

for (const fragment of [
  "buildAdminTelegramInternalAdminAlertSetup",
  "auditWriteEnabled: false",
  "providerConfigured: false",
  "liveSendingEnabled: false",
  "external_send: false",
  "sendingEnabled: false",
  "blocked_no_op_result",
  "blocked/no-op",
  "setup_only_disabled",
  "eventType",
  "actionSource",
]) {
  assert.ok(source.includes(fragment), `Missing Telegram alert send audit setup fragment: ${fragment}`);
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

async function loadHelpers() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-telegram-alert-audit-payload-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const pathName of helperPaths) {
    const outputPath = path.join(tempDir, pathName.replace(/\.ts$/, ".js"));
    const helperSource = await readFile(pathName, "utf8");

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(helperSource, pathName));
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    setup: requireFromHarness(
      path.join(tempDir, "lib/admin-telegram-internal-admin-alert-setup-foundation.js"),
    ),
  };
}

function assertNoLiveFlags(value, label) {
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  assert.equal(value.providerConfigured, false, `${label} must keep providerConfigured false.`);
  assert.equal(value.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
}

function assertBlockedNoOp(value, label) {
  assertNoLiveFlags(value, label);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
}

const harness = await loadHelpers();

try {
  const { buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup } = harness.auditPayload;
  const { buildAdminTelegramInternalAdminAlertSetup } = harness.setup;
  const readyAlert = buildAdminTelegramInternalAdminAlertSetup({
    action_source: "disabled_send_api",
    booking_reference: "PLO-TG-AUDIT-001",
    event_type: "driver-ack-customer-message-ready",
  });
  const readyAuditPayload = buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup({
    alert: readyAlert,
  });

  assert.deepEqual(readyAuditPayload, {
    actionSource: "disabled_send_api",
    action_source: "disabled_send_api",
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_send_api",
      auditWriteEnabled: false,
      bookingReference: "PLO-TG-AUDIT-001",
      channel: "telegram_internal_admin",
      disabledSendStatus: "blocked",
      eventKey: "driver_ack_customer_message_ready-PLO-TG-AUDIT-001",
      eventType: "driver_ack_customer_message_ready",
      external_send: false,
      liveSendingEnabled: false,
      preview: {
        safe_message: "Driver acknowledgement customer message is ready for PLO-TG-AUDIT-001.",
        safe_title: "Driver acknowledgement customer message ready",
      },
      providerConfigured: false,
      result: {
        external_send: false,
        liveSendingEnabled: false,
        no_op: true,
        providerConfigured: false,
        reason: "setup_only_disabled",
        result_label: "blocked/no-op",
        sendingEnabled: false,
        status: "blocked",
      },
      sendingEnabled: false,
    },
    blocked_no_op_result: {
      external_send: false,
      liveSendingEnabled: false,
      no_op: true,
      providerConfigured: false,
      reason: "setup_only_disabled",
      result_label: "blocked/no-op",
      sendingEnabled: false,
      status: "blocked",
    },
    bookingReference: "PLO-TG-AUDIT-001",
    booking_reference: "PLO-TG-AUDIT-001",
    channel: "telegram_internal_admin",
    delivery_surface: "telegram_internal_admin_alert_send_audit_payload_setup_only",
    disabled_send_status: "blocked",
    eventKey: "driver_ack_customer_message_ready-PLO-TG-AUDIT-001",
    eventType: "driver_ack_customer_message_ready",
    event_type: "driver_ack_customer_message_ready",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: [],
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation-v1",
  });
  assertBlockedNoOp(readyAuditPayload.blocked_no_op_result, "Ready audit blocked result");
  assertBlockedNoOp(readyAuditPayload.audit_payload.result, "Ready audit nested result");
  assertNoLiveFlags(readyAuditPayload, "Ready audit payload");
  assertNoLiveFlags(readyAuditPayload.audit_payload, "Ready audit nested payload");

  const inlineAuditPayload = buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup({
    actionSource: "preview_readiness_api",
    bookingReference: "PLO-TG-AUDIT-002",
    eventType: "customer_driver_details_email_ready",
    safeMessage: "Customer driver details email is ready for admin review.",
    safeTitle: "Customer driver details email ready",
  });

  assert.equal(inlineAuditPayload.actionSource, "preview_readiness_api");
  assert.equal(inlineAuditPayload.eventType, "customer_driver_details_email_ready");
  assert.equal(inlineAuditPayload.bookingReference, "PLO-TG-AUDIT-002");
  assert.equal(inlineAuditPayload.audit_payload.eventKey, "customer_driver_details_email_ready-PLO-TG-AUDIT-002");
  assert.equal(inlineAuditPayload.audit_payload.preview.safe_message, "Customer driver details email is ready for admin review.");
  assert.deepEqual(inlineAuditPayload.missing_requirements, []);
  assertBlockedNoOp(inlineAuditPayload.audit_payload.result, "Inline audit result");
  assertNoLiveFlags(inlineAuditPayload, "Inline audit payload");

  const urgentAuditPayload = buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup({
    actionSource: "disabled-send-api",
    bookingReference: "PLO-TG-AUDIT-003",
    eventType: "urgent_review_required",
  });

  assert.equal(urgentAuditPayload.actionSource, "disabled-send-api");
  assert.equal(urgentAuditPayload.eventType, "urgent_review_required");
  assert.equal(urgentAuditPayload.audit_payload.preview.safe_title, "Urgent admin review required");
  assert.equal(urgentAuditPayload.audit_payload.preview.safe_message, "Urgent admin review is required for PLO-TG-AUDIT-003.");
  assert.deepEqual(urgentAuditPayload.missing_requirements, []);

  const blockedAuditPayload = buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup({
    actionSource: "payment-token",
    bookingReference: "driver_payout-secret",
    eventType: "send_live_telegram",
    safeMessage: "customer_price payment invoice token",
    safeTitle: "driver_payout",
  });

  assert.deepEqual(blockedAuditPayload, {
    actionSource: null,
    action_source: null,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: null,
      auditWriteEnabled: false,
      bookingReference: null,
      channel: "telegram_internal_admin",
      disabledSendStatus: "blocked",
      eventKey: null,
      eventType: null,
      external_send: false,
      liveSendingEnabled: false,
      preview: {
        safe_message: null,
        safe_title: null,
      },
      providerConfigured: false,
      result: {
        external_send: false,
        liveSendingEnabled: false,
        no_op: true,
        providerConfigured: false,
        reason: "setup_only_disabled",
        result_label: "blocked/no-op",
        sendingEnabled: false,
        status: "blocked",
      },
      sendingEnabled: false,
    },
    blocked_no_op_result: {
      external_send: false,
      liveSendingEnabled: false,
      no_op: true,
      providerConfigured: false,
      reason: "setup_only_disabled",
      result_label: "blocked/no-op",
      sendingEnabled: false,
      status: "blocked",
    },
    bookingReference: null,
    booking_reference: null,
    channel: "telegram_internal_admin",
    delivery_surface: "telegram_internal_admin_alert_send_audit_payload_setup_only",
    disabled_send_status: "blocked",
    eventKey: null,
    eventType: null,
    event_type: null,
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: ["action_source", "event_type", "safe_message"],
    providerConfigured: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation-v1",
  });
  assertBlockedNoOp(blockedAuditPayload.blocked_no_op_result, "Blocked audit result");
  assertNoLiveFlags(blockedAuditPayload, "Blocked audit payload");
  assert.equal(
    /customer_price|driver_payout|payment|paynow|payout|invoice|billing|secret|token|api\.telegram|sendMessage|bot/i.test(
      JSON.stringify(blockedAuditPayload),
    ),
    false,
    "Telegram alert audit output must not leak unsafe input, provider, payment, payout, token, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin Telegram internal admin alert send audit payload setup foundation contract tests passed.");
