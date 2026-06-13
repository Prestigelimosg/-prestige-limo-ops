import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPaths = [
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/driver-ack-customer-message-handoff-setup-foundation.ts",
];
const helperPath = "lib/driver-ack-customer-message-handoff-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Driver ack handoff helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Driver ack handoff helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Driver ack handoff helper must not reference provider SDKs.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Driver ack handoff helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Driver ack handoff helper must not define API behavior.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Driver ack handoff helper must not use DB writes.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-ack-customer-handoff-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const relativePath of helperPaths) {
    const helperSource = await readFile(relativePath, "utf8");
    const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, transpileTypescript(helperSource, relativePath));
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHelper();

try {
  const { buildDriverAckCustomerMessageHandoffSetup } = harness.helper;
  const ready = buildDriverAckCustomerMessageHandoffSetup({
    booking_reference: "PLO-ACK-001",
    customer_email: "EA.Team+ClientA@example.com",
    driver: {
      name: "Tan Driver",
      phone: "+65 8888 0000",
    },
    driver_ack_status: "driver_acknowledged",
    vehicle: {
      plate: "SLA1234X",
      type: "Mercedes V-Class",
    },
  });

  assert.deepEqual(ready, {
    adminReviewRequired: true,
    customerEmailReady: true,
    delivery_surface: "driver_ack_customer_message_handoff_setup_only",
    disabled_send: {
      delivery_surface: "email_disabled",
      external_send: false,
      payload_preview: {
        booking_reference: "PLO-ACK-001",
        body_line_count: 4,
        recipient_email: "ea.team+clienta@example.com",
        sender_key: null,
        subject: "Assigned driver details for PLO-ACK-001",
        template_key: "customer_assigned_driver_details",
      },
      reason: "setup_only_disabled",
      sendingEnabled: false,
      status: "blocked",
      version: "admin-email-send-disabled-adapter-v1",
    },
    driver_ack_status: "acknowledged",
    external_send: false,
    handoff_status: "ready_for_admin_review",
    missing_requirements: [],
    preview: {
      body_line_count: 4,
      delivery_surface: "customer_driver_details_email_setup_only",
      preview_text: "Your assigned driver is Tan Driver.",
      recipient_status: "valid",
      subject: "Assigned driver details for PLO-ACK-001",
      template_key: "customer_assigned_driver_details",
    },
    sendingEnabled: false,
    status: "setup_only",
    version: "driver-ack-customer-message-handoff-setup-foundation-v1",
  });

  const blocked = buildDriverAckCustomerMessageHandoffSetup({
    booking_reference: "payment-token",
    customer_email: "customer_price@example.com",
    driver: {
      name: "driver_payout",
      phone: "billing_amount",
    },
    driver_ack_status: "waiting",
    vehicle: {
      plate: "SLA1234X",
      type: "Mercedes",
    },
  });

  assert.equal(blocked.adminReviewRequired, true);
  assert.equal(blocked.customerEmailReady, false);
  assert.equal(blocked.sendingEnabled, false);
  assert.equal(blocked.external_send, false);
  assert.equal(blocked.disabled_send.sendingEnabled, false);
  assert.equal(blocked.disabled_send.external_send, false);
  assert.equal(blocked.disabled_send.status, "blocked");
  assert.equal(blocked.driver_ack_status, "blocked");
  assert.equal(blocked.handoff_status, "blocked_for_admin_review");
  assert.deepEqual(blocked.missing_requirements, [
    "driver_acknowledged",
    "booking_reference",
    "customer_email",
    "driver_name",
    "driver_phone",
  ]);
  assert.equal(blocked.disabled_send.payload_preview.booking_reference, null);
  assert.equal(blocked.disabled_send.payload_preview.recipient_email, null);
  assert.equal(blocked.disabled_send.payload_preview.subject, "Assigned driver details");
  assert.equal(
    /customer_price|driver_payout|billing|payment|invoice|payout|paynow|smtp|secret|token|api_key|parser|debug/i.test(
      JSON.stringify(blocked),
    ),
    false,
    "Driver ack handoff output must not leak unsafe customer, finance, provider, token, or parser details.",
  );
} finally {
  await harness.cleanup();
}

console.log("Driver ack customer message handoff setup foundation contract tests passed.");
