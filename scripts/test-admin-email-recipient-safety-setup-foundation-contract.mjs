import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-email-recipient-safety-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Recipient safety helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Recipient safety helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Recipient safety helper must not reference email providers.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Recipient safety helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Recipient safety helper must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-recipient-"));
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
  const { buildAdminEmailRecipientSafetySetup } = harness.helper;
  const valid = buildAdminEmailRecipientSafetySetup({
    booking_reference: "PLO-EMAIL-001",
    customer_account_label: "Client A",
    recipient_email: "Ops.Contact+ClientA@example.com",
  });

  assert.deepEqual(valid, {
    delivery_surface: "email_recipient_safety_setup_only",
    external_send: false,
    recipient: {
      booking_reference: "PLO-EMAIL-001",
      customer_account_label: "Client A",
      recipient_email: "ops.contact+clienta@example.com",
      recipient_status: "valid",
    },
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-recipient-safety-setup-foundation-v1",
  });

  for (const recipient_email of ["", "not-an-email", "missing-at.example.com", "unsafe-token@example.com"]) {
    const blocked = buildAdminEmailRecipientSafetySetup({
      booking_reference: "PLO-EMAIL-002",
      customer_account_label: "Client B",
      recipient_email,
    });

    assert.equal(blocked.external_send, false, "Blocked recipient must still never send.");
    assert.equal(blocked.sendingEnabled, false, "Recipient safety setup must remain disabled.");
    assert.equal(blocked.recipient.recipient_status, "blocked");
    assert.equal(blocked.recipient.recipient_email, null);
  }

  const unsafe = buildAdminEmailRecipientSafetySetup({
    booking_reference: "payment-token",
    customer_account_label: "driver_payout",
    recipient_email: "safe@example.com",
  });

  assert.equal(unsafe.recipient.recipient_status, "valid");
  assert.equal(unsafe.recipient.recipient_email, "safe@example.com");
  assert.equal(unsafe.recipient.booking_reference, null, "Unsafe booking reference must be removed.");
  assert.equal(unsafe.recipient.customer_account_label, null, "Unsafe account label must be removed.");
  assert.equal(
    /payment|token|driver_payout/i.test(JSON.stringify(unsafe)),
    false,
    "Unsafe details must not leak in recipient safety output.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin email recipient safety setup foundation contract tests passed.");
