import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-email-sender-selection-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Sender selection helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Sender selection helper must not use network APIs.");
assert.equal(/nodemailer|sendgrid|mailgun|postmark|resend|amazonses|sesClient/i.test(source), false, "Sender selection helper must not reference email providers.");
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Sender selection helper must not reference provider tokens/env secrets.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Sender selection helper must not define API behavior.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-sender-"));
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
  const { buildAdminEmailSenderSelectionSetup } = harness.helper;
  const matched = buildAdminEmailSenderSelectionSetup({
    customer_key: "client-a",
    profiles: [
      {
        customer_keys: ["client-b"],
        is_default: true,
        sender_key: "ops-general",
        sender_label: "Prestige Ops",
        sender_role: "operations",
      },
      {
        customer_keys: ["client-a"],
        sender_key: "client-a-service",
        sender_label: "Prestige Client A Desk",
        sender_role: "account_service",
      },
    ],
  });

  assert.deepEqual(matched, {
    delivery_surface: "email_sender_selection_setup_only",
    external_send: false,
    selected_sender: {
      match_reason: "customer_match",
      sender_key: "client-a-service",
      sender_label: "Prestige Client A Desk",
      sender_role: "account_service",
    },
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-sender-selection-setup-foundation-v1",
  });

  const fallback = buildAdminEmailSenderSelectionSetup({
    customer_key: "client-c",
    profiles: [
      {
        customer_keys: ["client-b"],
        is_default: true,
        sender_key: "ops-general",
        sender_label: "Prestige Ops",
        sender_role: "operations",
      },
    ],
  });

  assert.equal(fallback.selected_sender.match_reason, "default_sender");
  assert.equal(fallback.selected_sender.sender_key, "ops-general");
  assert.equal(fallback.external_send, false);
  assert.equal(fallback.sendingEnabled, false);

  const unsafe = buildAdminEmailSenderSelectionSetup({
    customer_key: "client-a",
    profiles: [
      {
        customer_keys: ["client-a"],
        sender_key: "smtp-secret-token",
        sender_label: "customer_email payment token",
        sender_role: "driver_payout",
      },
    ],
  });

  assert.equal(unsafe.external_send, false, "Unsafe setup must still never send.");
  assert.equal(unsafe.sendingEnabled, false, "Sender selection setup must remain disabled.");
  assert.equal(unsafe.selected_sender.match_reason, "none");
  assert.equal(unsafe.selected_sender.sender_key, null);
  assert.equal(unsafe.selected_sender.sender_label, null);
  assert.equal(unsafe.selected_sender.sender_role, null);
  assert.equal(
    /smtp|secret|token|customer_email|payment|driver_payout/i.test(JSON.stringify(unsafe)),
    false,
    "Unsafe sender details must not leak in setup output.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin email sender selection setup foundation contract tests passed.");
