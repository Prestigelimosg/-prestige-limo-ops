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
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-provider-readiness-setup-foundation.ts",
];
const providerReadinessPath = "lib/admin-email-provider-readiness-setup-foundation.ts";
const source = await readFile(providerReadinessPath, "utf8");

assert.equal(source.includes("server-only"), true, "Email provider readiness helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Email provider readiness helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Email provider readiness helper must not reference provider SDKs.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Email provider readiness helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Email provider readiness helper must not define API behavior.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Email provider readiness helper must not use DB writes.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-provider-readiness-"));
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
    disabledAdapter: requireFromHarness(path.join(tempDir, "lib/admin-email-send-disabled-adapter.js")),
    notification: requireFromHarness(path.join(tempDir, "lib/admin-email-notification-setup-foundation.js")),
    policy: requireFromHarness(path.join(tempDir, "lib/admin-email-send-policy-setup-foundation.js")),
    providerReadiness: requireFromHarness(
      path.join(tempDir, "lib/admin-email-provider-readiness-setup-foundation.js"),
    ),
    recipient: requireFromHarness(path.join(tempDir, "lib/admin-email-recipient-safety-setup-foundation.js")),
    sender: requireFromHarness(path.join(tempDir, "lib/admin-email-sender-selection-setup-foundation.js")),
  };
}

const harness = await loadHelpers();

try {
  const { prepareDisabledAdminEmailSend } = harness.disabledAdapter;
  const { buildAdminEmailNotificationSetupPayload } = harness.notification;
  const { buildAdminEmailSendPolicySetup } = harness.policy;
  const { buildAdminEmailProviderReadinessSetup } = harness.providerReadiness;
  const { buildAdminEmailRecipientSafetySetup } = harness.recipient;
  const { buildAdminEmailSenderSelectionSetup } = harness.sender;

  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: ["Booking: PLO-DRV-001", "Driver: Tan Driver"],
    booking_reference: "PLO-DRV-001",
    event_key: "customer-driver-details-plo-drv-001",
    notification_type: "customer_driver_details",
    preview_text: "Your assigned driver is Tan Driver.",
    recipient_role: "customer",
    subject: "Assigned driver details for PLO-DRV-001",
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
        is_default: true,
        sender_key: "client-a-service",
        sender_label: "Prestige Client A Desk",
        sender_role: "account_service",
      },
    ],
  });
  const policy = buildAdminEmailSendPolicySetup({
    notification,
    recipient,
    sender,
  });
  const disabledSend = prepareDisabledAdminEmailSend({
    body_lines: notification.payload.body_lines,
    booking_reference: notification.payload.booking_reference,
    recipient_email: recipient.recipient.recipient_email,
    sender_key: sender.selected_sender.sender_key,
    subject: notification.payload.subject,
    template_key: "customer_assigned_driver_details",
  });
  const readiness = buildAdminEmailProviderReadinessSetup({
    disabledSend,
    policy,
  });

  assert.deepEqual(readiness, {
    delivery_surface: "email_provider_readiness_setup_only",
    disabled_send_status: "blocked",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: ["provider", "env", "approval"],
    policy_decision: "allowed_for_future_setup",
    provider: {
      approval_status: "missing",
      env_status: "missing",
      provider_status: "missing",
    },
    providerConfigured: false,
    readyForFutureProviderSetup: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-provider-readiness-setup-foundation-v1",
  });

  const blocked = buildAdminEmailProviderReadinessSetup({
    disabledSend: null,
    policy: buildAdminEmailSendPolicySetup({
      notification: buildAdminEmailNotificationSetupPayload({ body_lines: [], subject: "" }),
      recipient: buildAdminEmailRecipientSafetySetup({ recipient_email: "not-an-email" }),
      sender: buildAdminEmailSenderSelectionSetup({ customer_key: "missing", profiles: [] }),
    }),
  });

  assert.deepEqual(blocked, {
    delivery_surface: "email_provider_readiness_setup_only",
    disabled_send_status: "missing",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: ["provider", "env", "approval", "send_policy", "disabled_send_adapter"],
    policy_decision: "blocked",
    provider: {
      approval_status: "missing",
      env_status: "missing",
      provider_status: "missing",
    },
    providerConfigured: false,
    readyForFutureProviderSetup: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-provider-readiness-setup-foundation-v1",
  });
  assert.equal(blocked.providerConfigured, false, "Provider must remain unconfigured.");
  assert.equal(blocked.liveSendingEnabled, false, "Live email sending must remain disabled.");
  assert.equal(blocked.external_send, false, "Provider readiness setup must never send.");
  assert.equal(
    /customer_price|driver_payout|payment|invoice|payout|smtp|secret|token|api_key/i.test(JSON.stringify(blocked)),
    false,
    "Provider readiness output must not leak payment, payout, provider, token, or secret details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin email provider readiness setup foundation contract tests passed.");
