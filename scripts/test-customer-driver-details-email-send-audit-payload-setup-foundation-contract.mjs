import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-driver-details-email-send-audit-payload-setup-foundation.ts";
const helperPaths = [
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/customer-driver-details-email-readiness-setup-foundation.ts",
  helperPath,
];
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Email send audit payload helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Audit payload helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Audit payload helper must not reference provider SDKs.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Audit payload helper must not read env/provider tokens.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Audit payload helper must not define API behavior.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Audit payload helper must not use DB writes.");

for (const fragment of [
  "auditWriteEnabled: false",
  "liveSendingEnabled: false",
  "external_send: false",
  "sendingEnabled: false",
  "blocked_no_op_result",
  "customer_copy_disabled_send_button",
  "disabled_send_api",
]) {
  assert.ok(source.includes(fragment), `Missing audit payload setup fragment: ${fragment}`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-email-audit-payload-"));
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
      path.join(tempDir, "lib/customer-driver-details-email-send-audit-payload-setup-foundation.js"),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledAdapter: requireFromHarness(path.join(tempDir, "lib/admin-email-send-disabled-adapter.js")),
    notification: requireFromHarness(path.join(tempDir, "lib/admin-email-notification-setup-foundation.js")),
    policy: requireFromHarness(path.join(tempDir, "lib/admin-email-send-policy-setup-foundation.js")),
    readiness: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-details-email-readiness-setup-foundation.js"),
    ),
    recipient: requireFromHarness(path.join(tempDir, "lib/admin-email-recipient-safety-setup-foundation.js")),
    sender: requireFromHarness(path.join(tempDir, "lib/admin-email-sender-selection-setup-foundation.js")),
    template: requireFromHarness(path.join(tempDir, "lib/customer-driver-details-email-setup-foundation.js")),
  };
}

const harness = await loadHelpers();

try {
  const { buildCustomerDriverDetailsEmailSendAuditPayloadSetup } = harness.auditPayload;
  const { prepareDisabledAdminEmailSend } = harness.disabledAdapter;
  const { buildAdminEmailNotificationSetupPayload } = harness.notification;
  const { buildAdminEmailSendPolicySetup } = harness.policy;
  const { buildCustomerDriverDetailsEmailReadinessSetup } = harness.readiness;
  const { buildAdminEmailRecipientSafetySetup } = harness.recipient;
  const { buildAdminEmailSenderSelectionSetup } = harness.sender;
  const { buildCustomerDriverDetailsEmailSetup } = harness.template;

  const template = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "PLO-DRV-AUDIT-001",
    customer_email: "EA.Team+ClientA@example.com",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });
  const recipient = buildAdminEmailRecipientSafetySetup({
    booking_reference: template.payload.booking_reference,
    customer_account_label: "Client A",
    recipient_email: template.payload.customer_email,
  });
  const sender = buildAdminEmailSenderSelectionSetup({
    customer_key: "client-a",
    profiles: [
      {
        customer_keys: ["client-a"],
        is_default: true,
        sender_key: "client-a-service",
        sender_label: "Prestige Client A Desk",
        sender_role: "account_service",
      },
    ],
  });
  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: template.template.body_lines,
    booking_reference: template.payload.booking_reference,
    event_key: "customer-driver-details-plo-drv-audit-001",
    notification_type: "customer_driver_details",
    preview_text: template.template.preview_text,
    recipient_role: "customer",
    subject: template.template.subject,
  });
  const policy = buildAdminEmailSendPolicySetup({
    notification,
    recipient,
    sender,
  });
  const readiness = buildCustomerDriverDetailsEmailReadinessSetup({
    policy,
    recipient,
    sender,
    template,
  });
  const disabledSend = prepareDisabledAdminEmailSend({
    body_lines: template.template.body_lines,
    booking_reference: template.payload.booking_reference,
    recipient_email: template.payload.customer_email,
    sender_key: sender.selected_sender.sender_key,
    subject: template.template.subject,
    template_key: template.template.template_key,
  });
  const auditPayload = buildCustomerDriverDetailsEmailSendAuditPayloadSetup({
    actionSource: "customer-copy-disabled-send-button",
    disabledSend,
    policy,
    readiness,
    template,
  });

  assert.deepEqual(auditPayload, {
    action_source: "customer_copy_disabled_send_button",
    auditWriteEnabled: false,
    audit_payload: {
      action_source: "customer_copy_disabled_send_button",
      auditWriteEnabled: false,
      booking_reference: "PLO-DRV-AUDIT-001",
      customer_email: "ea.team+clienta@example.com",
      disabled_send_status: "blocked",
      policy_decision: "allowed_for_future_setup",
      readiness_status: "ready_for_future_setup",
      result: {
        external_send: false,
        liveSendingEnabled: false,
        no_op: true,
        reason: "setup_only_disabled",
        sendingEnabled: false,
        status: "blocked",
      },
      template_key: "customer_assigned_driver_details",
    },
    blocked_no_op_result: {
      external_send: false,
      liveSendingEnabled: false,
      no_op: true,
      reason: "setup_only_disabled",
      sendingEnabled: false,
      status: "blocked",
    },
    booking_reference: "PLO-DRV-AUDIT-001",
    customer_email: "ea.team+clienta@example.com",
    delivery_surface: "customer_driver_details_email_send_audit_payload_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: [],
    sendingEnabled: false,
    status: "setup_only",
    version: "customer-driver-details-email-send-audit-payload-setup-foundation-v1",
  });

  const unsafeTemplate = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "payment-token",
    customer_email: "customer_price@example.com",
  });
  const blockedAuditPayload = buildCustomerDriverDetailsEmailSendAuditPayloadSetup({
    actionSource: "smtp-secret-provider",
    disabledSend: null,
    policy: null,
    readiness: null,
    template: unsafeTemplate,
  });

  assert.deepEqual(blockedAuditPayload, {
    action_source: null,
    auditWriteEnabled: false,
    audit_payload: {
      action_source: null,
      auditWriteEnabled: false,
      booking_reference: null,
      customer_email: null,
      disabled_send_status: "missing",
      policy_decision: "blocked",
      readiness_status: "blocked",
      result: {
        external_send: false,
        liveSendingEnabled: false,
        no_op: true,
        reason: "setup_only_disabled",
        sendingEnabled: false,
        status: "blocked",
      },
      template_key: "customer_assigned_driver_details",
    },
    blocked_no_op_result: {
      external_send: false,
      liveSendingEnabled: false,
      no_op: true,
      reason: "setup_only_disabled",
      sendingEnabled: false,
      status: "blocked",
    },
    booking_reference: null,
    customer_email: null,
    delivery_surface: "customer_driver_details_email_send_audit_payload_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: [
      "action_source",
      "booking_reference",
      "customer_email",
      "disabled_send_adapter",
    ],
    sendingEnabled: false,
    status: "setup_only",
    version: "customer-driver-details-email-send-audit-payload-setup-foundation-v1",
  });
  assert.equal(
    /customer_price|driver_payout|payment|paynow|payout|invoice|billing|smtp|secret|token|api_key/i.test(
      JSON.stringify(blockedAuditPayload),
    ),
    false,
    "Audit payload output must not leak unsafe input, provider, payment, payout, token, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer driver-details email send audit payload setup foundation contract tests passed.");
