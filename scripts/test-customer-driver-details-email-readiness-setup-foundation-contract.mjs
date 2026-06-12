import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPaths = [
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/customer-driver-details-email-readiness-setup-foundation.ts",
];
const readinessPath = "lib/customer-driver-details-email-readiness-setup-foundation.ts";
const source = await readFile(readinessPath, "utf8");

assert.equal(source.includes("server-only"), true, "Customer driver-details email readiness helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Readiness helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Readiness helper must not reference email providers.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Readiness helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Readiness helper must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-email-readiness-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const helperPath of helperPaths) {
    const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
    const helperSource = await readFile(helperPath, "utf8");

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(helperSource, helperPath));
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
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
  const { buildAdminEmailNotificationSetupPayload } = harness.notification;
  const { buildAdminEmailRecipientSafetySetup } = harness.recipient;
  const { buildAdminEmailSenderSelectionSetup } = harness.sender;
  const { buildAdminEmailSendPolicySetup } = harness.policy;
  const { buildCustomerDriverDetailsEmailSetup } = harness.template;
  const { buildCustomerDriverDetailsEmailReadinessSetup } = harness.readiness;

  const template = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "PLO-DRV-001",
    customer_email: "ea@example.com",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });
  const recipient = buildAdminEmailRecipientSafetySetup({
    booking_reference: "PLO-DRV-001",
    customer_account_label: "Client A",
    recipient_email: "ea@example.com",
  });
  const sender = buildAdminEmailSenderSelectionSetup({
    customer_key: "client-a",
    profiles: [
      {
        customer_keys: ["client-a"],
        sender_key: "client-a-service",
        sender_label: "Prestige Client A Desk",
        sender_role: "account_service",
      },
    ],
  });
  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: template.template.body_lines,
    booking_reference: template.payload.booking_reference,
    event_key: "customer-driver-details-plo-drv-001",
    notification_type: "booking_workflow",
    preview_text: template.template.preview_text,
    recipient_role: "customer",
    subject: template.template.subject,
  });
  const policy = buildAdminEmailSendPolicySetup({
    notification,
    recipient,
    sender,
  });
  const ready = buildCustomerDriverDetailsEmailReadinessSetup({
    policy,
    recipient,
    sender,
    template,
  });

  assert.deepEqual(ready, {
    delivery_surface: "customer_driver_details_email_readiness_setup_only",
    external_send: false,
    missing_requirements: [],
    policy_decision: "allowed_for_future_setup",
    readyForFutureSetup: true,
    readyToSend: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "customer-driver-details-email-readiness-setup-foundation-v1",
  });

  const blocked = buildCustomerDriverDetailsEmailReadinessSetup({
    policy: buildAdminEmailSendPolicySetup({
      notification: buildAdminEmailNotificationSetupPayload({ body_lines: [], subject: "" }),
      recipient: buildAdminEmailRecipientSafetySetup({ recipient_email: "not-an-email" }),
      sender: buildAdminEmailSenderSelectionSetup({ customer_key: "missing", profiles: [] }),
    }),
    recipient: buildAdminEmailRecipientSafetySetup({ recipient_email: "not-an-email" }),
    sender: buildAdminEmailSenderSelectionSetup({ customer_key: "missing", profiles: [] }),
    template: buildCustomerDriverDetailsEmailSetup({
      booking_reference: "PLO-DRV-002",
      customer_email: "not-an-email",
    }),
  });

  assert.deepEqual(blocked, {
    delivery_surface: "customer_driver_details_email_readiness_setup_only",
    external_send: false,
    missing_requirements: [
      "customer_driver_details_template",
      "recipient_safety",
      "sender_selection",
      "email_send_policy",
    ],
    policy_decision: "blocked",
    readyForFutureSetup: false,
    readyToSend: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "customer-driver-details-email-readiness-setup-foundation-v1",
  });
  assert.equal(
    /payment|payout|smtp|secret|token|api_key|sendgrid|mailgun|postmark/i.test(JSON.stringify(blocked)),
    false,
    "Readiness output must not leak provider, payment, payout, token, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Customer driver-details email readiness setup foundation contract tests passed.");
