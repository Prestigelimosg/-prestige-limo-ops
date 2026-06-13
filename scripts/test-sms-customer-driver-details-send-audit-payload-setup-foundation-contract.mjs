import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/sms-customer-driver-details-send-audit-payload-setup-foundation.ts";
const helperPaths = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/sms-customer-driver-details-setup-foundation.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "SMS send audit helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "SMS send audit helper must not use network APIs.");
assert.equal(/twilio|vonage|messagebird|aws-sns|snsClient|publishCommand|plivo|telnyx/i.test(source), false, "SMS send audit helper must not reference SMS provider SDKs.");
assert.equal(/\bprocess\.env\b|SMS_[A-Z_]*|TWILIO_[A-Z_]*|VONAGE_[A-Z_]*|SNS_[A-Z_]*|API_KEY|ACCESS_TOKEN|SECRET_KEY/.test(source), false, "SMS send audit helper must not read env/provider secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "SMS send audit helper must not define API behavior.");
assert.equal(/sendMessage|send_message|messages\.create|client\.messages|publish\s*\(|sendSms|sendSMS|sendText/i.test(source), false, "SMS send audit helper must not include send operations.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "SMS send audit helper must not use DB writes.");

for (const fragment of [
  "buildSmsCustomerDriverDetailsSetup",
  "auditWriteEnabled: false",
  "audit_write_enabled: false",
  "providerConfigured: false",
  "liveSendingEnabled: false",
  "external_send: false",
  "sendingEnabled: false",
  "blocked_no_op_result",
  "blocked/no-op",
  "setup_only_disabled",
  "actionSource",
  "customerPhone",
  "messageTarget",
  "secure_details_link",
]) {
  assert.ok(source.includes(fragment), `Missing SMS customer driver-details send audit setup fragment: ${fragment}`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-sms-driver-audit-payload-"));
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
        "lib/sms-customer-driver-details-send-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    setup: requireFromHarness(
      path.join(tempDir, "lib/sms-customer-driver-details-setup-foundation.js"),
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
  const { buildSmsCustomerDriverDetailsSendAuditPayloadSetup } = harness.auditPayload;
  const { buildSmsCustomerDriverDetailsSetup } = harness.setup;
  const readySetup = buildSmsCustomerDriverDetailsSetup({
    booking_reference: "PLO-SMS-AUDIT-001",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-AUDIT-001",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });
  const readyAuditPayload = buildSmsCustomerDriverDetailsSendAuditPayloadSetup({
    actionSource: "disabled-send-api",
    customerPhone: "+65 9123 4567",
    messageTarget: "Primary passenger SMS",
    setup: readySetup,
  });

  assert.deepEqual(readyAuditPayload, {
    actionSource: "disabled_send_api",
    action_source: "disabled_send_api",
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: "disabled_send_api",
      auditWriteEnabled: false,
      bookingReference: "PLO-SMS-AUDIT-001",
      booking_reference: "PLO-SMS-AUDIT-001",
      channel: "sms_customer",
      customerPhone: "+65 9123 4567",
      customer_phone: "+65 9123 4567",
      disabledSendStatus: "blocked",
      external_send: false,
      liveSendingEnabled: false,
      messageKey: "customer_assigned_driver_details_sms",
      messageTarget: "Primary passenger SMS",
      message_target: "Primary passenger SMS",
      preview: {
        message_key: "customer_assigned_driver_details_sms",
        message_text:
          "Prestige: Booking PLO-SMS-AUDIT-001. Pickup 12 Jun 2026, 10:00. Driver Tan Driver +65 8888 0000. Vehicle Mercedes V-Class SLA1234X. Details https://prestige.example/customer-driver-details/PLO-SMS-AUDIT-001.",
        preview_text: "Driver Tan Driver assigned.",
      },
      providerConfigured: false,
      readinessStatus: "ready_for_future_setup",
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
      secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-AUDIT-001",
      sendingEnabled: false,
    },
    audit_write_enabled: false,
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
    bookingReference: "PLO-SMS-AUDIT-001",
    booking_reference: "PLO-SMS-AUDIT-001",
    channel: "sms_customer",
    customerPhone: "+65 9123 4567",
    customer_phone: "+65 9123 4567",
    delivery_surface: "sms_customer_driver_details_send_audit_payload_setup_only",
    disabled_send_status: "blocked",
    external_send: false,
    liveSendingEnabled: false,
    messageTarget: "Primary passenger SMS",
    message_target: "Primary passenger SMS",
    missing_requirements: [],
    providerConfigured: false,
    secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-AUDIT-001",
    sendingEnabled: false,
    status: "setup_only",
    version: "sms-customer-driver-details-send-audit-payload-setup-foundation-v1",
  });
  assertBlockedNoOp(readyAuditPayload.blocked_no_op_result, "Ready audit blocked result");
  assertBlockedNoOp(readyAuditPayload.audit_payload.result, "Ready audit nested result");
  assertNoLiveFlags(readyAuditPayload, "Ready audit payload");
  assertNoLiveFlags(readyAuditPayload.audit_payload, "Ready audit nested payload");
  assert.equal(readyAuditPayload.auditWriteEnabled, false);
  assert.equal(readyAuditPayload.audit_write_enabled, false);

  const inlineAuditPayload = buildSmsCustomerDriverDetailsSendAuditPayloadSetup({
    action_source: "preview-readiness-api",
    bookingReference: "PLO-SMS-AUDIT-002",
    customer_phone: "+65 9234 5678",
    detailsLink: "https://prestige.example/customer-driver-details/PLO-SMS-AUDIT-002",
    driver: {
      name: "Lim Driver",
      phone: "+65 8777 0000",
    },
    pickupTime: "13 Jun 2026, 09:00",
    vehicle: {
      plate: "SLA4321Z",
      type: "Toyota Alphard",
    },
  });

  assert.equal(inlineAuditPayload.actionSource, "preview_readiness_api");
  assert.equal(inlineAuditPayload.bookingReference, "PLO-SMS-AUDIT-002");
  assert.equal(inlineAuditPayload.customerPhone, "+65 9234 5678");
  assert.equal(inlineAuditPayload.messageTarget, "+65 9234 5678");
  assert.equal(
    inlineAuditPayload.secure_details_link,
    "https://prestige.example/customer-driver-details/PLO-SMS-AUDIT-002",
  );
  assert.equal(inlineAuditPayload.disabled_send_status, "blocked");
  assert.equal(inlineAuditPayload.audit_payload.readinessStatus, "ready_for_future_setup");
  assert.deepEqual(inlineAuditPayload.missing_requirements, []);
  assertBlockedNoOp(inlineAuditPayload.blocked_no_op_result, "Inline audit blocked result");
  assertNoLiveFlags(inlineAuditPayload, "Inline audit payload");

  const unsafeAuditPayload = buildSmsCustomerDriverDetailsSendAuditPayloadSetup({
    actionSource: "payment-token",
    booking_reference: "payment-token",
    customerPhone: "customer_price token",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    messageTarget: "invoice secret",
    pickup_time: "10:00",
    secure_details_link: "https://prestige.example/customer-driver-details/payment-token",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
  });

  assert.deepEqual(unsafeAuditPayload, {
    actionSource: null,
    action_source: null,
    auditWriteEnabled: false,
    audit_payload: {
      actionSource: null,
      auditWriteEnabled: false,
      bookingReference: null,
      booking_reference: null,
      channel: "sms_customer",
      customerPhone: null,
      customer_phone: null,
      disabledSendStatus: "blocked",
      external_send: false,
      liveSendingEnabled: false,
      messageKey: "customer_assigned_driver_details_sms",
      messageTarget: null,
      message_target: null,
      preview: {
        message_key: "customer_assigned_driver_details_sms",
        message_text: "Prestige: Pickup 10:00. Vehicle Mercedes SLA1234X.",
        preview_text: null,
      },
      providerConfigured: false,
      readinessStatus: "blocked",
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
      secure_details_link: null,
      sendingEnabled: false,
    },
    audit_write_enabled: false,
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
    channel: "sms_customer",
    customerPhone: null,
    customer_phone: null,
    delivery_surface: "sms_customer_driver_details_send_audit_payload_setup_only",
    disabled_send_status: "blocked",
    external_send: false,
    liveSendingEnabled: false,
    messageTarget: null,
    message_target: null,
    missing_requirements: ["action_source", "booking_reference"],
    providerConfigured: false,
    secure_details_link: null,
    sendingEnabled: false,
    status: "setup_only",
    version: "sms-customer-driver-details-send-audit-payload-setup-foundation-v1",
  });
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe audit blocked result");
  assertNoLiveFlags(unsafeAuditPayload, "Unsafe audit payload");
  assert.equal(
    /customer_price|driver_payout|payment|paynow|payout|invoice|billing|internal_admin|internal_finance|secret|token|twilio|vonage|messagebird|sendMessage/i.test(
      JSON.stringify(unsafeAuditPayload),
    ),
    false,
    "SMS customer driver-details audit output must not leak unsafe input, provider, payment, payout, token, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("SMS customer driver-details send audit payload setup foundation contract tests passed.");
