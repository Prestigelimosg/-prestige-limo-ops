import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-email-send-disabled-adapter.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Disabled email adapter must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Disabled email adapter must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Disabled email adapter must not reference email providers.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Disabled email adapter must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Disabled email adapter must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-disabled-"));
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

const harness = await loadHelper();

try {
  const { prepareDisabledAdminEmailSend } = harness.helper;
  const result = prepareDisabledAdminEmailSend({
    body_lines: ["Booking: PLO-DRV-001", "Driver: Tan Driver"],
    booking_reference: "PLO-DRV-001",
    recipient_email: "ea@example.com",
    sender_key: "client-a-service",
    subject: "Assigned driver details for PLO-DRV-001",
    template_key: "customer_assigned_driver_details",
  });

  assert.deepEqual(result, {
    delivery_surface: "email_disabled",
    external_send: false,
    payload_preview: {
      booking_reference: "PLO-DRV-001",
      body_line_count: 2,
      recipient_email: "ea@example.com",
      sender_key: "client-a-service",
      subject: "Assigned driver details for PLO-DRV-001",
      template_key: "customer_assigned_driver_details",
    },
    reason: "setup_only_disabled",
    sendingEnabled: false,
    status: "blocked",
    version: "admin-email-send-disabled-adapter-v1",
  });

  const unsafe = prepareDisabledAdminEmailSend({
    body_lines: ["customer_price payment token", "Safe line"],
    booking_reference: "payment-token",
    recipient_email: "customer_price@example.com",
    sender_key: "smtp-secret-token",
    subject: "driver_payout invoice_pdf",
    template_key: "payment_link",
  });

  assert.equal(unsafe.external_send, false, "Disabled email adapter must never send.");
  assert.equal(unsafe.sendingEnabled, false, "Disabled email adapter must stay disabled.");
  assert.equal(unsafe.status, "blocked");
  assert.equal(unsafe.reason, "setup_only_disabled");
  assert.equal(unsafe.payload_preview.booking_reference, null);
  assert.equal(unsafe.payload_preview.body_line_count, 1);
  assert.equal(unsafe.payload_preview.recipient_email, null);
  assert.equal(unsafe.payload_preview.sender_key, null);
  assert.equal(unsafe.payload_preview.subject, null);
  assert.equal(unsafe.payload_preview.template_key, null);
  assert.equal(
    /customer_price|driver_payout|payment|invoice_pdf|payout|smtp|secret|token/i.test(JSON.stringify(unsafe)),
    false,
    "Unsafe email send details must not leak from disabled adapter output.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin disabled email send adapter contract tests passed.");
