import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-telegram-internal-admin-alert-preview-readiness-setup/route.ts",
  "app/api/admin-telegram-internal-admin-alert-send-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/admin-telegram-alert-disabled-adapter.ts",
  "lib/admin-telegram-internal-admin-alert-setup-foundation.ts",
  "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const routeHarnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const eventTypes = [
  "driver_ack_customer_message_ready",
  "customer_driver_details_email_ready",
  "urgent_review_required",
];
const telegramProviderPackageNames = new Set([
  "@grammyjs/conversations",
  "@grammyjs/runner",
  "@mtproto/core",
  "grammy",
  "node-telegram-bot-api",
  "puregram",
  "slimbot",
  "telegraf",
  "telebot",
  "telegram",
  "telegram-bot-api",
]);
const telegramProviderImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@grammyjs\/conversations|@grammyjs\/runner|@mtproto\/core|grammy|node-telegram-bot-api|puregram|slimbot|telegraf|telebot|telegram|telegram-bot-api)["']|require\(\s*["'](?:@grammyjs\/conversations|@grammyjs\/runner|@mtproto\/core|grammy|node-telegram-bot-api|puregram|slimbot|telegraf|telebot|telegram|telegram-bot-api)["']\s*\)/i;
const telegramProviderClassPattern = /\b(?:Telegraf|TelegramBot|MTProto|GrammyError|BotError)\b/;
const botTokenEnvPattern =
  /\bprocess\.env\b|BOT_TOKEN|bot[_-]?token|TELEGRAM_BOT_TOKEN|TELEGRAM_API_KEY|TELEGRAM_TOKEN|API_KEY|ACCESS_TOKEN|SECRET_KEY/i;
const telegramApiPattern =
  /api\.telegram\.org|telegram\.org|(?:^|[/:.])t\.me(?:[/:?]|$)|\/api\/telegram|\/telegram\b/i;
const externalSendPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMessage\s*\(|getUpdates\s*\(|setWebhook\s*\(|deleteWebhook\s*\(|telegram\.(?:send|post|request)/i;
const dbWritePattern = /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i;
const liveTruePattern =
  /sendingEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i;
const unsafeOutputPattern =
  /driver_payout|customer_price|payment|invoice|paynow|payout|finance|token|secret|api\.telegram|sendMessage|bot[_-]?token/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function apiUrl(pathname, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertNoLiveFlags(value, label, { requireLiveFlag = false } = {}) {
  assert.equal(value?.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
  assert.equal(value?.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value?.providerConfigured, false, `${label} must keep providerConfigured false.`);

  if (requireLiveFlag || Object.hasOwn(value || {}, "liveSendingEnabled")) {
    assert.equal(value?.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  } else {
    assert.equal(value?.liveSendingEnabled ?? false, false, `${label} must not enable liveSendingEnabled.`);
  }
}

function assertBlockedNoOp(value, label) {
  assertNoLiveFlags(value, label, { requireLiveFlag: true });
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
}

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

async function writeHarnessFile(tempDir, relativePath) {
  const source = await readFile(relativePath, "utf8");
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, relativePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-telegram-no-live-guard-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of routeHarnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      disabledSend: requireFromHarness(
        path.join(tempDir, "app/api/admin-telegram-internal-admin-alert-send-disabled-setup/route.js"),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-telegram-internal-admin-alert-preview-readiness-setup/route.js",
        ),
      ),
    },
    setup: requireFromHarness(
      path.join(tempDir, "lib/admin-telegram-internal-admin-alert-setup-foundation.js"),
    ),
  };
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    telegramProviderPackageNames.has(packageName),
    false,
    `Telegram setup must not add provider SDK package: ${packageName}`,
  );
}

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only setup route.`);
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(source), false, `${routeFile} must not expose write/live-send verbs.`);
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(telegramProviderImportPattern.test(source), false, `${file} must not import Telegram provider SDKs.`);
  assert.equal(telegramProviderClassPattern.test(source), false, `${file} must not use Telegram provider SDK classes.`);
  assert.equal(botTokenEnvPattern.test(source), false, `${file} must not read bot token/env secrets.`);
  assert.equal(telegramApiPattern.test(source), false, `${file} must not include Telegram API URLs.`);
  assert.equal(externalSendPattern.test(source), false, `${file} must not use external Telegram send APIs.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable live Telegram flags.`);
}

const setupSource = await readFile("lib/admin-telegram-internal-admin-alert-setup-foundation.ts", "utf8");

for (const eventType of eventTypes) {
  assert.ok(setupSource.includes(eventType), `Setup-only Telegram event string must remain allowed: ${eventType}.`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup } = harness.auditPayload;
  const { adminTelegramInternalAdminAlertEventTypes, buildAdminTelegramInternalAdminAlertSetup } =
    harness.setup;

  assert.deepEqual(adminTelegramInternalAdminAlertEventTypes, eventTypes);

  const setupAlert = buildAdminTelegramInternalAdminAlertSetup({
    action_source: "telegram_no_live_guard",
    booking_reference: "PLO-TG-NO-LIVE-001",
    event_type: "driver_ack_customer_message_ready",
  });

  assertNoLiveFlags(setupAlert, "Telegram internal admin alert setup helper");
  assertNoLiveFlags(setupAlert.alert_payload, "Telegram internal admin alert setup payload");
  assert.equal(setupAlert.disabled_adapter.delivery_surface, "telegram_disabled");
  assert.equal(setupAlert.disabled_adapter.external_send, false);
  assert.equal(setupAlert.disabled_adapter.status, "disabled");
  assert.deepEqual(setupAlert.missing_requirements, []);

  const previewApiResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-telegram-internal-admin-alert-preview-readiness-setup", {
        action_source: "telegram_no_live_guard",
        booking_reference: "PLO-TG-NO-LIVE-001",
        event_type: "driver_ack_customer_message_ready",
      }),
      { headers: adminHeaders() },
    ),
  );
  const previewApi = await previewApiResponse.json();

  assert.equal(previewApiResponse.status, 200);
  assertNoLiveFlags(previewApi, "Telegram preview/readiness API", { requireLiveFlag: true });
  assertNoLiveFlags(previewApi.preview, "Telegram preview/readiness API preview");
  assertNoLiveFlags(previewApi.readiness, "Telegram preview/readiness API readiness", {
    requireLiveFlag: true,
  });
  assert.equal(previewApi.readiness.alertReadyForFutureSetup, true);

  const disabledApiResponse = await harness.routes.disabledSend.GET(
    new Request(
      apiUrl("/api/admin-telegram-internal-admin-alert-send-disabled-setup", {
        action_source: "telegram_no_live_guard",
        booking_reference: "PLO-TG-NO-LIVE-002",
        event_type: "customer_driver_details_email_ready",
        safe_message: "Customer driver details email is ready for admin review.",
        safe_title: "Customer driver details email ready",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabledApi = await disabledApiResponse.json();

  assert.equal(disabledApiResponse.status, 200);
  assertNoLiveFlags(disabledApi, "Disabled Telegram admin alert send API", { requireLiveFlag: true });
  assertNoLiveFlags(disabledApi.readiness, "Disabled Telegram admin alert send API readiness", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(disabledApi.send, "Disabled Telegram admin alert send API nested send");
  assertBlockedNoOp(disabledApi.result, "Disabled Telegram admin alert send API nested result");
  assert.equal(disabledApi.status, "blocked");
  assert.equal(disabledApi.send.disabled_adapter.external_send, false);
  assert.equal(disabledApi.send.disabled_adapter.status, "disabled");

  const auditPayload = buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup({
    actionSource: "disabled_send_api",
    alert: setupAlert,
  });

  assertNoLiveFlags(auditPayload, "Telegram admin alert audit payload", { requireLiveFlag: true });
  assertNoLiveFlags(auditPayload.audit_payload, "Telegram admin alert nested audit payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Telegram admin alert audit blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Telegram admin alert nested audit result");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_payload.auditWriteEnabled, false);
  assert.equal(auditPayload.eventType, "driver_ack_customer_message_ready");
  assert.equal(auditPayload.actionSource, "telegram_no_live_guard");
  assert.equal(auditPayload.disabled_send_status, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);

  const unsafeAuditPayload = buildAdminTelegramInternalAdminAlertSendAuditPayloadSetup({
    actionSource: "payment-token",
    bookingReference: "driver_payout-secret",
    eventType: "send_live_telegram",
    safeMessage: "customer_price payment invoice token",
    safeTitle: "driver_payout",
  });

  assertNoLiveFlags(unsafeAuditPayload, "Unsafe Telegram admin alert audit payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe Telegram audit blocked result");
  assert.equal(unsafeAuditPayload.auditWriteEnabled, false);
  assert.equal(unsafeAuditPayload.eventType, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "event_type",
    "safe_message",
  ]);
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(unsafeAuditPayload)),
    false,
    "Telegram no-live guard output must not leak unsafe input, provider, payment, payout, token, or secret details.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("Telegram internal admin alert no-live guard passed");
