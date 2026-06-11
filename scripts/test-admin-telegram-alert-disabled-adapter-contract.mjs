import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-telegram-alert-disabled-adapter.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Adapter must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Adapter must not use network APIs.");
assert.equal(/api\.telegram\.org|telegram\.org|t\.me|\/api\/telegram|\/telegram\b/i.test(source), false, "Adapter must not include Telegram URLs.");
assert.equal(/sendMessage|getUpdates|webhook|polling/i.test(source), false, "Adapter must not include Telegram send/polling operations.");
assert.equal(/process\.env|BOT_TOKEN|bot[_-]?token/i.test(source), false, "Adapter must not reference token/env secrets.");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-telegram-disabled-"));
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
  const { prepareDisabledAdminTelegramAlert } = harness.helper;
  const result = prepareDisabledAdminTelegramAlert({
    booking_reference: "REF-001",
    event_key: "driver-missed-job-ref-001",
    notification_type: "driver_status",
    priority: "urgent",
    safe_context: {
      workflow_area: "driver_issue_alert",
    },
    safe_message: "Driver has not acknowledged job REF-001.",
    safe_title: "Missed job risk",
    workflow_area: "driver_issue_alert",
  });

  assert.deepEqual(result, {
    delivery_surface: "telegram_disabled",
    event_key: "driver-missed-job-ref-001",
    external_send: false,
    notification_type: "driver_status",
    preview: {
      safe_message: "Driver has not acknowledged job REF-001.",
      safe_title: "Missed job risk",
    },
    status: "disabled",
    version: "admin-telegram-alert-disabled-adapter-v1",
  });

  const unsafe = prepareDisabledAdminTelegramAlert({
    event_key: "driver_payout-secret-token",
    notification_type: "monthly_billing",
    safe_message: "customer_price payment invoice token",
    safe_title: "driver_payout",
  });

  assert.equal(unsafe.external_send, false, "Unsafe input must still never send.");
  assert.equal(unsafe.delivery_surface, "telegram_disabled");
  assert.equal(unsafe.status, "disabled");
  assert.equal(unsafe.event_key, null, "Unsafe event key must be removed.");
  assert.equal(unsafe.preview.safe_message, null, "Unsafe message must be removed.");
  assert.equal(unsafe.preview.safe_title, null, "Unsafe title must be removed.");
  assert.equal(
    /customer_price|driver_payout|payment|invoice|token/i.test(JSON.stringify(unsafe)),
    false,
    "Unsafe fields must not leak in adapter output.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin Telegram disabled adapter contract tests passed.");
