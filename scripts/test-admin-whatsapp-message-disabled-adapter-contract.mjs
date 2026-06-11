import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-whatsapp-message-disabled-adapter.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Adapter must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Adapter must not use network APIs.");
assert.equal(/graph\.facebook\.com|whatsapp\.com|wa\.me|api\.whatsapp|\/messages\b|\/message_templates\b/i.test(source), false, "Adapter must not include WhatsApp API URLs or message endpoints.");
assert.equal(/sendMessage|send_message|getUpdates|webhook|polling|template/i.test(source), false, "Adapter must not include send/polling/template operations.");
assert.equal(/process\.env|ACCESS_TOKEN|PHONE_NUMBER_ID|WATI|TWILIO|META|bot[_-]?token/i.test(source), false, "Adapter must not reference provider tokens/env secrets.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-whatsapp-disabled-"));
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
  const { prepareDisabledAdminWhatsAppMessage } = harness.helper;
  const result = prepareDisabledAdminWhatsAppMessage({
    booking_reference: "REF-001",
    event_key: "customer-utility-reminder-ref-001",
    notification_type: "booking_workflow",
    priority: "normal",
    safe_context: {
      workflow_area: "booking_followup",
    },
    safe_message: "Your Prestige booking update is ready for review.",
    safe_title: "Booking update",
    workflow_area: "booking_followup",
  });

  assert.deepEqual(result, {
    delivery_surface: "whatsapp_disabled",
    event_key: "customer-utility-reminder-ref-001",
    external_send: false,
    notification_type: "booking_workflow",
    preview: {
      safe_message: "Your Prestige booking update is ready for review.",
      safe_title: "Booking update",
    },
    status: "disabled",
    version: "admin-whatsapp-message-disabled-adapter-v1",
  });

  const unsafe = prepareDisabledAdminWhatsAppMessage({
    event_key: "customer_price-secret-token",
    notification_type: "monthly_billing",
    safe_message: "driver_payout payment invoice token",
    safe_title: "customer_phone",
  });

  assert.equal(unsafe.external_send, false, "Unsafe input must still never send.");
  assert.equal(unsafe.delivery_surface, "whatsapp_disabled");
  assert.equal(unsafe.status, "disabled");
  assert.equal(unsafe.event_key, null, "Unsafe event key must be removed.");
  assert.equal(unsafe.preview.safe_message, null, "Unsafe message must be removed.");
  assert.equal(unsafe.preview.safe_title, null, "Unsafe title must be removed.");
  assert.equal(
    /customer_price|customer_phone|driver_payout|payment|invoice|token/i.test(JSON.stringify(unsafe)),
    false,
    "Unsafe fields must not leak in adapter output.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin WhatsApp disabled adapter contract tests passed.");
