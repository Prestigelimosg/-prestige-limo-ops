import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const packageJsonPath = "package.json";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const routeFiles = [
  "app/api/admin-telegram-internal-admin-alert-preview-readiness-setup/route.ts",
  "app/api/admin-telegram-internal-admin-alert-send-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/admin-telegram-alert-disabled-adapter.ts",
  "lib/admin-telegram-internal-admin-alert-setup-foundation.ts",
  "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.ts",
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
const telegramEnvPattern =
  /\bprocess\.env\b|BOT_TOKEN|\b[A-Z0-9_]*(?:TELEGRAM|BOT)_[A-Z0-9_]+\b|API_KEY|ACCESS_TOKEN|SECRET_KEY/;
const telegramApiPattern =
  /api\.telegram\.org|telegram\.org|(?:^|[/:.])t\.me(?:[/:?]|$)|\/api\/telegram|\/telegram\b/i;
const externalSendPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMessage\s*\(|getUpdates\s*\(|setWebhook\s*\(|deleteWebhook\s*\(|telegram\.(?:send|post|request)/i;
const dbWritePattern = /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i;
const liveTruePattern =
  /sendingEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i;

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

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

const [
  ledger,
  appPage,
  packageJsonSource,
  preactivationSuite,
  aiParseRoute,
  adminSavedBookingsRoute,
  ...setupSources
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(packageJsonPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  ...[...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")),
]);

const packetSection = sectionBetween(ledger, "### Telegram Provider No-Send Approval Packet Lock");

for (const phrase of [
  "Approval status: pending future Telegram staging test approval.",
  "This is a docs/test-only no-send approval packet guarded by `scripts/test-telegram-provider-no-send-approval-packet.mjs`.",
  "Current Telegram routes remain setup-only/no-live:",
  "`GET /api/admin-telegram-internal-admin-alert-preview-readiness-setup`",
  "`GET /api/admin-telegram-internal-admin-alert-send-disabled-setup`",
  "Current Telegram send surface remains disabled/no-op with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.",
  "No provider env values are printed, required, or read by the current Telegram setup-only routes/helpers.",
  "No Telegram bot token/API activation is approved.",
  "No live Telegram send is approved.",
  "Future staging Telegram test requires separate owner approval, secret-safe bot/env-name handling, recipient/chat allowlist, content guard, one-message test scope, and rollback/disable plan.",
  "Future Telegram content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.",
  "Future live/provider send wiring must not change Save Booking + CRM.",
  "Future live/provider send wiring must not change `/api/admin-saved-bookings`.",
  "Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.",
  "Future live/provider send wiring must not add UI sectors/buttons/cards.",
  "Future live/provider send wiring must not add new shims.",
  "Required tests before any future Telegram staging send:",
  "provider env-name/secret-safe listing guard",
  "recipient/chat allowlist guard",
  "content forbidden-field guard",
  "single-send staging approval guard",
  "rollback/disable verification guard",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `Telegram provider no-send approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to send now",
  "provider activation approved",
  "bot token activation approved",
  "live send approved",
  "env values required",
  "secret values printed",
  "pricing approved",
  "payout approved",
  "payment approved",
  "PDF approved",
]) {
  assertExcludes(packetSection, forbiddenApprovalPhrase, `Forbidden approval phrase ${forbiddenApprovalPhrase}`);
}

const packageJson = JSON.parse(packageJsonSource);
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    telegramProviderPackageNames.has(packageName),
    false,
    `Telegram no-send packet must not add provider SDK package: ${packageName}`,
  );
}

for (const [index, file] of [...routeFiles, ...helperFiles].entries()) {
  const source = setupSources[index];

  if (routeFiles.includes(file)) {
    assert.match(source, /export async function GET/, `${file} must remain GET-only setup route.`);
    assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${file} live-send verb`);
  }

  assertExcludes(source, telegramProviderImportPattern, `${file} provider SDK import`);
  assertExcludes(source, telegramProviderClassPattern, `${file} provider SDK class`);
  assertExcludes(source, telegramEnvPattern, `${file} Telegram provider/env secret read`);
  assertExcludes(source, telegramApiPattern, `${file} Telegram provider API URL`);
  assertExcludes(source, externalSendPattern, `${file} external Telegram send API`);
  assertExcludes(source, dbWritePattern, `${file} DB write path`);
  assertExcludes(source, liveTruePattern, `${file} live Telegram flags`);
}

const telegramSetupChain = setupSources.join("\n");

for (const fragment of [
  "telegram_internal_admin_alert_setup_only",
  "telegram_internal_admin_alert_send_audit_payload_setup_only",
  "telegram_disabled",
  "external_send: false",
  "liveSendingEnabled: false",
  "sendingEnabled: false",
  "providerConfigured: false",
]) {
  assertIncludes(telegramSetupChain, fragment, `Telegram setup-only fragment: ${fragment}`);
}

assertExcludes(
  appPage,
  "/api/admin-telegram-internal-admin-alert-preview-readiness-setup",
  "app/page.tsx Telegram preview route runtime wiring",
);
assertExcludes(
  appPage,
  "/api/admin-telegram-internal-admin-alert-send-disabled-setup",
  "app/page.tsx Telegram disabled-send route runtime wiring",
);
assertIncludes(appPage, "Mock/local only. Does not send Telegram", "Telegram mock-only UI boundary");
assertExcludes(
  appPage,
  /api\.telegram\.org|node-telegram-bot-api|telegraf|sendMessage\s*\(|telegram\.(?:send|post|request)/i,
  "app/page.tsx Telegram live provider/send wiring",
);

const saveBookingSource = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingSource, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBookingSource, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, /telegram|provider|sendMessage/i, "Parser Telegram provider separation");
assertExcludes(
  adminSavedBookingsRoute,
  "scripts/test-telegram-provider-no-send-approval-packet.mjs",
  "admin-saved-bookings Telegram approval guard separation",
);

assertIncludes(
  preactivationSuite,
  "scripts/test-telegram-provider-no-send-approval-packet.mjs",
  "Preactivation suite registration",
);

console.log("Telegram provider no-send approval packet guard passed.");
