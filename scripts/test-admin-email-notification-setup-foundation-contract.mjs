import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-email-notification-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Email setup helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Email setup helper must not use network APIs.");
assert.equal(/smtp|nodemailer|sendgrid|mailgun|postmark|resend|amazonses|aws[_-]?ses|sesClient/i.test(source), false, "Email setup helper must not reference email providers or SMTP.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Email setup helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Email setup helper must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-setup-"));
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
  const { buildAdminEmailNotificationSetupPayload } = harness.helper;
  const result = buildAdminEmailNotificationSetupPayload({
    body_lines: ["Driver has not acknowledged job REF-001.", "Review dispatch follow-up."],
    booking_reference: "REF-001",
    event_key: "driver-acknowledgement-follow-up-ref-001",
    notification_type: "driver_status",
    preview_text: "Driver acknowledgement follow-up is ready.",
    recipient_role: "admin",
    safe_context: {
      workflow_area: "driver_issue_alert",
    },
    subject: "Driver acknowledgement follow-up",
  });

  assert.deepEqual(result, {
    delivery_surface: "email_setup_only",
    external_send: false,
    payload: {
      body_lines: ["Driver has not acknowledged job REF-001.", "Review dispatch follow-up."],
      booking_reference: "REF-001",
      event_key: "driver-acknowledgement-follow-up-ref-001",
      notification_type: "driver_status",
      preview_text: "Driver acknowledgement follow-up is ready.",
      recipient_role: "admin",
      subject: "Driver acknowledgement follow-up",
    },
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-notification-setup-foundation-v1",
  });

  const unsafe = buildAdminEmailNotificationSetupPayload({
    body_lines: ["customer_price payment token", "Safe fallback line"],
    booking_reference: "REF-UNSAFE",
    event_key: "driver_payout-secret-token",
    notification_type: "monthly_billing",
    preview_text: "invoice_pdf payout",
    recipient_role: "customer_email",
    subject: "payment token",
  });

  assert.equal(unsafe.external_send, false, "Unsafe input must still never send.");
  assert.equal(unsafe.sendingEnabled, false, "Email setup must remain disabled.");
  assert.equal(unsafe.delivery_surface, "email_setup_only");
  assert.equal(unsafe.status, "setup_only");
  assert.equal(unsafe.payload.event_key, null, "Unsafe event key must be removed.");
  assert.deepEqual(unsafe.payload.body_lines, ["Safe fallback line"], "Unsafe body lines must be removed.");
  assert.equal(unsafe.payload.preview_text, null, "Unsafe preview text must be removed.");
  assert.equal(unsafe.payload.recipient_role, null, "Unsafe recipient role must be removed.");
  assert.equal(unsafe.payload.subject, null, "Unsafe subject must be removed.");
  assert.equal(
    /customer_price|driver_payout|payment|invoice_pdf|payout|token|customer_email/i.test(JSON.stringify(unsafe)),
    false,
    "Unsafe fields must not leak in setup output.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin email notification setup foundation contract tests passed.");
