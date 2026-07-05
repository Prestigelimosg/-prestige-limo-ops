import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const packageJsonPath = "package.json";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const liveSendHelperPath = "lib/admin-telegram-internal-admin-alert-live-send.ts";
const setupHelperPath = "lib/admin-telegram-internal-admin-alert-setup-foundation.ts";
const disabledAdapterPath = "lib/admin-telegram-alert-disabled-adapter.ts";
const routePath = "app/api/admin-telegram-internal-admin-alert-send/route.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const guardScript = "scripts/test-telegram-internal-admin-alert-live-send-guard.mjs";
const harnessFiles = [
  routePath,
  liveSendHelperPath,
  setupHelperPath,
  disabledAdapterPath,
  boundaryPath,
];
const providerSdkPackages = new Set([
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
const providerSdkImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@grammyjs\/conversations|@grammyjs\/runner|@mtproto\/core|grammy|node-telegram-bot-api|puregram|slimbot|telegraf|telebot|telegram|telegram-bot-api)["']|require\(\s*["'](?:@grammyjs\/conversations|@grammyjs\/runner|@mtproto\/core|grammy|node-telegram-bot-api|puregram|slimbot|telegraf|telebot|telegram|telegram-bot-api)["']\s*\)/i;
const forbiddenProviderOperationPattern =
  /getUpdates|setWebhook|deleteWebhook|sendLocation|sendDocument|polling|webhook/i;
const forbiddenPublicLeakPattern =
  /driver_payout|customer_price|payment|invoice|paynow|payout|finance|token|secret|api\.telegram|bot[_-]?token|chat_id|-1001234567890/i;
const fakeBotToken = ["123456789", "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi_12345"].join(":");
const fakeChatId = "-1001234567890";
const alternateChatId = "-1009876543210";
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  PRESTIGE_TELEGRAM_BOT_TOKEN: process.env.PRESTIGE_TELEGRAM_BOT_TOKEN,
  PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST:
    process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST,
  PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID:
    process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID,
  PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED:
    process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED,
};

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

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

function closeTelegramEnv() {
  delete process.env.PRESTIGE_TELEGRAM_BOT_TOKEN;
  delete process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST;
  delete process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID;
  delete process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED;
}

function openTelegramEnv({ allowlist = fakeChatId, chatId = fakeChatId } = {}) {
  process.env.PRESTIGE_TELEGRAM_BOT_TOKEN = fakeBotToken;
  process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST = allowlist;
  process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID = chatId;
  process.env.PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED = "true";
}

function adminHeaders() {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
  };
}

function requestFor(body) {
  return new Request("http://localhost/api/admin-telegram-internal-admin-alert-send", {
    body: JSON.stringify(body),
    headers: {
      "Content-Type": "application/json",
      ...adminHeaders(),
    },
    method: "POST",
  });
}

function safeLiveBody(overrides = {}) {
  return {
    action_source: "telegram_live_send_guard",
    booking_reference: "TG-LIVE-001",
    confirm_send: "approved_internal_admin_test",
    event_type: "urgent_review_required",
    safe_message: "Internal admin Telegram test from Prestige Limo Ops.",
    safe_title: "Prestige Telegram internal test",
    ...overrides,
  };
}

function assertSafeResponsePayload(payload, label) {
  assert.equal(
    forbiddenPublicLeakPattern.test(JSON.stringify(payload)),
    false,
    `${label} must not expose token, chat id, provider URL, pricing, payout, payment, invoice, or secret fragments.`,
  );
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-telegram-live-send-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: requireFromHarness(
      path.join(tempDir, "lib/admin-telegram-internal-admin-alert-live-send.js"),
    ),
    route: requireFromHarness(
      path.join(tempDir, "app/api/admin-telegram-internal-admin-alert-send/route.js"),
    ),
  };
}

const [
  ledger,
  appPage,
  packageJsonSource,
  preactivationSuite,
  liveSendHelper,
  routeSource,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(packageJsonPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(liveSendHelperPath, "utf8"),
  readFile(routePath, "utf8"),
]);
const activationSection = sectionBetween(
  ledger,
  "## Telegram Internal Admin Alert Live Send Activation Lock",
  "\n## ",
);

for (const phrase of [
  "Approval status: approved by William from Codex mobile for internal-admin Telegram activation.",
  "`POST /api/admin-telegram-internal-admin-alert-send`",
  "`PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED=true`",
  "`PRESTIGE_TELEGRAM_BOT_TOKEN`",
  "`PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID`",
  "`PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST`",
  "The normal admin Dispatch UI no longer exposes the old `Telegram Internal Admin Alert` test panel or its `Send Internal Test` action.",
  "No Telegram webhook, `getUpdates`, polling, scheduler, retry loop, batch send, DB write, schema change, customer send, driver send, live-location send, payment/PDF/billing/payout, parser, Save Booking + CRM, or `/api/admin-saved-bookings` behavior is added.",
]) {
  assertIncludes(activationSection, phrase, `Telegram activation ledger phrase: ${phrase}`);
}

const packageJson = JSON.parse(packageJsonSource);
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    providerSdkPackages.has(packageName),
    false,
    `Telegram activation must not add provider SDK package: ${packageName}`,
  );
}

for (const fragment of [
  'import "server-only";',
  "adminTelegramInternalAdminAlertLiveSendEnvGateName",
  "PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_ENABLED",
  "PRESTIGE_TELEGRAM_BOT_TOKEN",
  "PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_DEFAULT_CHAT_ID",
  "PRESTIGE_TELEGRAM_INTERNAL_ADMIN_ALERTS_CHAT_ALLOWLIST",
  "https://api.telegram.org",
  "/sendMessage",
  "protect_content: true",
  "link_preview_options",
  "approved_internal_admin_test",
]) {
  assertIncludes(liveSendHelper, fragment, `Telegram live send helper ${fragment}`);
}
assertExcludes(liveSendHelper, providerSdkImportPattern, "Telegram provider SDK import");
assertExcludes(liveSendHelper, forbiddenProviderOperationPattern, "Telegram webhook/polling/non-message operation");
assertExcludes(liveSendHelper, /\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|createClient|supabase/i, "Telegram live send helper DB write path");

for (const fragment of [
  "resolveAdminDispatcherBoundary(request, adminBookingPersistencePurpose",
  'allowServerSessionRoleMethodsWithoutRequestToken: ["POST"]',
  "executeAdminTelegramInternalAdminAlertLiveSend",
]) {
  assertIncludes(routeSource, fragment, `Telegram live send route ${fragment}`);
}
assertExcludes(routeSource, /api\.telegram\.org|PRESTIGE_TELEGRAM_BOT_TOKEN|chat_id|getUpdates|setWebhook|deleteWebhook/i, "Telegram live send route secret/provider internals");

for (const fragment of [
  "data-telegram-alert-send-test",
  "data-telegram-alert-preview",
  "data-telegram-alert-generate",
  "Telegram Internal Admin Alert",
  "Send Internal Test",
  "approved_internal_admin_test",
]) {
  assertExcludes(appPage, fragment, `Removed Telegram internal admin dashboard test UI ${fragment}`);
}
assertExcludes(appPage, /PRESTIGE_TELEGRAM|TELEGRAM_BOT_TOKEN|api\.telegram\.org|chat_id|getUpdates|setWebhook|deleteWebhook/i, "Telegram app page provider/env leakage");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite Telegram live send guard registration");

const harness = await loadHarness();
const originalFetch = global.fetch;
const providerCalls = [];

try {
  applyLocalAdminBoundary();
  closeTelegramEnv();

  global.fetch = async (url, init = {}) => {
    providerCalls.push({ init, url: String(url) });

    return new Response(JSON.stringify({ ok: true, result: { message_id: 123 } }), {
      headers: { "Content-Type": "application/json" },
      status: 200,
    });
  };

  const closedResponse = await harness.route.POST(requestFor(safeLiveBody()));
  const closedPayload = await closedResponse.json();

  assert.equal(closedResponse.status, 503);
  assert.equal(closedPayload.reason, "env_gate_closed");
  assert.equal(closedPayload.external_send, false);
  assert.equal(providerCalls.length, 0, "Closed Telegram gate must not call provider.");
  assertSafeResponsePayload(closedPayload, "Closed gate response");

  openTelegramEnv();

  const missingConfirmationResponse = await harness.route.POST(
    requestFor(safeLiveBody({ confirm_send: "not-approved" })),
  );
  const missingConfirmationPayload = await missingConfirmationResponse.json();

  assert.equal(missingConfirmationResponse.status, 400);
  assert.equal(missingConfirmationPayload.reason, "missing_confirmation");
  assert.equal(providerCalls.length, 0, "Missing confirmation must not call provider.");
  assertSafeResponsePayload(missingConfirmationPayload, "Missing confirmation response");

  const sentResponse = await harness.route.POST(requestFor(safeLiveBody()));
  const sentPayload = await sentResponse.json();

  assert.equal(sentResponse.status, 200);
  assert.equal(sentPayload.ok, true);
  assert.equal(sentPayload.status, "sent");
  assert.equal(sentPayload.external_send, true);
  assert.equal(sentPayload.provider_message_id_present, true);
  assert.equal(sentPayload.redacted_chat_configured, true);
  assert.equal(providerCalls.length, 1, "Approved Telegram send must call provider once.");
  assert.equal(providerCalls[0].url, `https://api.telegram.org/bot${fakeBotToken}/sendMessage`);

  const providerBody = JSON.parse(providerCalls[0].init.body);

  assert.equal(providerBody.chat_id, fakeChatId);
  assert.equal(providerBody.protect_content, true);
  assert.equal(providerBody.link_preview_options?.is_disabled, true);
  assert.equal(providerBody.text.includes("Prestige Limo Ops"), true);
  assert.equal(providerBody.text.includes("Internal admin Telegram test"), true);
  assertSafeResponsePayload(sentPayload, "Sent response");

  const unsafeResponse = await harness.route.POST(
    requestFor(
      safeLiveBody({
        action_source: "driver_payout-secret",
        booking_reference: "customer_price-token",
        event_type: "send_live_telegram",
        safe_message: "customer_price payment invoice token",
        safe_title: "driver_payout",
      }),
    ),
  );
  const unsafePayload = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 400);
  assert.equal(unsafePayload.reason, "invalid_alert");
  assert.equal(providerCalls.length, 1, "Unsafe Telegram input must not call provider.");
  assertSafeResponsePayload(unsafePayload, "Unsafe input response");

  openTelegramEnv({ allowlist: alternateChatId, chatId: fakeChatId });

  const blockedChatResponse = await harness.route.POST(requestFor(safeLiveBody()));
  const blockedChatPayload = await blockedChatResponse.json();

  assert.equal(blockedChatResponse.status, 403);
  assert.equal(blockedChatPayload.reason, "chat_not_allowlisted");
  assert.equal(providerCalls.length, 1, "Non-allowlisted Telegram chat must not call provider.");
  assertSafeResponsePayload(blockedChatPayload, "Non-allowlisted chat response");

  openTelegramEnv();

  const directHelperResult = await harness.helper.executeAdminTelegramInternalAdminAlertLiveSend(
    safeLiveBody(),
    {
      fetcher: async () =>
        new Response(JSON.stringify({ ok: false }), {
          headers: { "Content-Type": "application/json" },
          status: 200,
        }),
    },
  );

  assert.equal(directHelperResult.status, "failed");
  assert.equal(directHelperResult.reason, "provider_failure");
  assert.equal(directHelperResult.external_send, false);
  assertSafeResponsePayload(directHelperResult, "Provider failure response");
} finally {
  global.fetch = originalFetch;
  restoreEnv();
  await harness.cleanup();
}

console.log("Telegram internal admin alert live send guard passed");
