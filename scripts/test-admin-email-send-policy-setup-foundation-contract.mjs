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
];
const policyPath = "lib/admin-email-send-policy-setup-foundation.ts";
const source = await readFile(policyPath, "utf8");

assert.equal(source.includes("server-only"), true, "Email send policy helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Email send policy helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Email send policy helper must not reference email providers.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Email send policy helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Email send policy helper must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-policy-"));
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
    recipient: requireFromHarness(path.join(tempDir, "lib/admin-email-recipient-safety-setup-foundation.js")),
    sender: requireFromHarness(path.join(tempDir, "lib/admin-email-sender-selection-setup-foundation.js")),
  };
}

const harness = await loadHelpers();

try {
  const { buildAdminEmailNotificationSetupPayload } = harness.notification;
  const { buildAdminEmailRecipientSafetySetup } = harness.recipient;
  const { buildAdminEmailSenderSelectionSetup } = harness.sender;
  const { buildAdminEmailSendPolicySetup } = harness.policy;

  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: ["Driver has not acknowledged job REF-001."],
    booking_reference: "REF-001",
    event_key: "driver-acknowledgement-follow-up-ref-001",
    notification_type: "driver_status",
    preview_text: "Driver acknowledgement follow-up is ready.",
    recipient_role: "admin",
    subject: "Driver acknowledgement follow-up",
  });
  const recipient = buildAdminEmailRecipientSafetySetup({
    booking_reference: "REF-001",
    customer_account_label: "Client A",
    recipient_email: "ops@example.com",
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
  const allowed = buildAdminEmailSendPolicySetup({
    notification,
    recipient,
    sender,
  });

  assert.deepEqual(allowed, {
    decision: "allowed_for_future_setup",
    delivery_surface: "email_send_policy_setup_only",
    external_send: false,
    missing_requirements: [],
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-send-policy-setup-foundation-v1",
  });

  const blocked = buildAdminEmailSendPolicySetup({
    notification: buildAdminEmailNotificationSetupPayload({
      body_lines: [],
      subject: "",
    }),
    recipient: buildAdminEmailRecipientSafetySetup({
      recipient_email: "not-an-email",
    }),
    sender: buildAdminEmailSenderSelectionSetup({
      customer_key: "missing",
      profiles: [],
    }),
  });

  assert.deepEqual(blocked, {
    decision: "blocked",
    delivery_surface: "email_send_policy_setup_only",
    external_send: false,
    missing_requirements: ["notification_template", "recipient_valid", "sender_selected"],
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-send-policy-setup-foundation-v1",
  });
  assert.equal(
    /payment|payout|smtp|secret|token|api_key|sendgrid|mailgun|postmark/i.test(JSON.stringify(blocked)),
    false,
    "Policy output must not leak provider, payment, payout, token, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin email send policy setup foundation contract tests passed.");
