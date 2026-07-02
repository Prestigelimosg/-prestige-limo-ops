import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-telegram-live-location-evidence-contract-guard.mjs";

const telegramRouteFiles = [
  "app/api/admin-telegram-internal-admin-alert-preview-readiness-setup/route.ts",
  "app/api/admin-telegram-internal-admin-alert-send-disabled-setup/route.ts",
];

const telegramHelperFiles = [
  "lib/admin-telegram-alert-disabled-adapter.ts",
  "lib/admin-telegram-internal-admin-alert-setup-foundation.ts",
  "lib/admin-telegram-internal-admin-alert-send-audit-payload-setup-foundation.ts",
];

const liveLocationFiles = [
  "app/api/admin-live-location-setup/route.ts",
  "app/api/admin-live-location-window-policy-preview-readiness-setup/route.ts",
  "app/api/admin-live-location-access-capture-disabled-setup/route.ts",
  "lib/admin-live-location-setup-foundation.ts",
  "lib/live-location-window-policy-setup-foundation.ts",
];

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

const [ledger, preactivationSuite, ...surfaceSources] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  ...[...telegramRouteFiles, ...telegramHelperFiles, ...liveLocationFiles].map((file) =>
    readFile(file, "utf8"),
  ),
]);

const evidenceSection = sectionBetween(
  ledger,
  "### Telegram True Live Location Evidence Contract Guard Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved Telegram True Live Location evidence pass.",
  "This lock does not activate Telegram provider setup, Telegram credentials, Telegram Bot API calls, Telegram sends, bot token creation/use, env changes, DB read/write, driver GPS capture, live-location routes/helpers, scheduler/timer/polling/retry behavior, customer map, admin live map, auth activation, session/token/cookie creation, deployment, UI expansion, or production activation.",
  "Future Telegram true live-location activation requires explicit owner approval.",
  "Future Telegram provider/bot setup requires explicit owner approval.",
  "Future staging chat/recipient allowlist requires explicit owner approval.",
  "Future live-location start action requires explicit owner approval.",
  "Future POB plus 5 minute auto-stop behavior requires explicit owner approval.",
  "Future driver location source requires explicit owner approval.",
  "Future DB persistence or RLS/policy changes require explicit owner approval if introduced.",
  "Future rollback/disable plan requires explicit owner approval.",
  "Future env/provider proof must be names-only and must not print tokens, chat IDs, cookies, passwords, API keys, env values, database URLs, or secrets.",
  "`PRESTIGE_TELEGRAM_LIVE_LOCATION_ENABLED`",
  "`PRESTIGE_TELEGRAM_LIVE_LOCATION_STAGING_CHAT_ALLOWLIST`",
  "`PRESTIGE_TELEGRAM_LIVE_LOCATION_AUTO_STOP_AFTER_POB_MINUTES`",
  "`TELEGRAM_BOT_TOKEN`",
  "Future Telegram gate must be closed by default.",
  "Closed gate must not read `TELEGRAM_BOT_TOKEN`.",
  "Closed gate must not call Telegram.",
  "Public, customer, and driver unauthorized routes must not trigger Telegram sends.",
  "Admin/dispatcher boundary is required for any future start/send action.",
  "Staging chat/recipient allowlist proof is required.",
  "Future evidence is limited to exactly one bounded staging live-location evidence action unless separately approved.",
  "Batch send is forbidden.",
  "Retry loop is forbidden unless separately approved and bounded.",
  "Polling loop is forbidden unless separately approved and bounded.",
  "Scheduler/background worker is forbidden unless separately approved and bounded.",
  "Fallback to WhatsApp, SMS, or Email is forbidden.",
  "Automatic multi-channel blast is forbidden.",
  "POB status source proof is required from the guarded driver status workflow `driver_otw -> ots -> pob -> completed`.",
  "Auto-stop 5 minutes after POB proof is required.",
  "Rollback/disable proof is required after any future evidence pass.",
  "No token, chat ID, env value, raw provider payload, finance/internal/admin/provider/debug data, or secret may be exposed.",
  "No DB persistence is approved unless separately approved with table/RLS proof.",
  "Customer-facing Telegram live-location evidence must not expose pricing, payout, PayNow, payout preferences, `driver_payout_rules`, `customer_rates`, payment/PDF/billing, invoice content, internal/admin notes, parser/debug fields, secrets/tokens, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, auth/session/cookie/JWT values, or OTS photo/storage data unless separately approved.",
  "Telegram live location must remain separate from Customer/Driver Auth activation, OTS photo/storage, calendar, billing/payment/PDF, pricing/rates/customer_rates, `driver_payout_rules`, payout execution, Email/WhatsApp/SMS sends, FlightAware live lookup, parser, Save Booking, `/api/admin-saved-bookings`, UI sector/card/button expansion, shims, and production activation.",
  "Current Telegram live-location surfaces remain setup-only/no-live and current live-location surfaces remain setup-only/disabled.",
  "No true live-location route/helper exists and no driver GPS source exists for true live location in this lane.",
  "WhatsApp remains a later phase.",
  "Email remains driver-details and admin-selected secure tracking link only; Email must not do native/streaming live location.",
  "This guard adds `scripts/test-telegram-live-location-evidence-contract-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(evidenceSection, phrase, `Telegram live-location evidence phrase: ${phrase}`);
}

for (const forbidden of [
  "Telegram live location is approved now",
  "Telegram provider activation is approved now",
  "Telegram bot token may be configured now",
  "Telegram send is approved now",
  "live GPS capture is approved now",
  "customer live map is active",
  "admin live map is active",
  "location storage is approved now",
  "scheduler is approved now",
  "polling is approved now",
  "retry loop is approved now",
  "fallback to WhatsApp is approved",
  "fallback to SMS is approved",
  "fallback to Email is approved",
  "multi-channel blast is approved",
  "auth activation may be mixed with Telegram live location",
  "Save Booking may be changed for Telegram live location",
  "/api/admin-saved-bookings may be changed for Telegram live location",
  "new UI sector is approved",
  "new shim is approved",
]) {
  assertExcludes(evidenceSection, forbidden, "forbidden Telegram live-location activation phrase");
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "preactivation Telegram live-location evidence guard registration",
);

const currentSurfaceSource = surfaceSources.join("\n");

for (const fragment of [
  "external_send: false",
  "liveSendingEnabled: false",
  "sendingEnabled: false",
  "providerConfigured: false",
  "gpsCaptureEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "locationStorageEnabled: false",
  "liveAccessEnabled: false",
  "auto_stop_minutes_after_pob: 5",
]) {
  assertIncludes(currentSurfaceSource, fragment, `current no-live/setup-only fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /TELEGRAM_BOT_TOKEN|BOT_TOKEN|process\.env|api\.telegram\.org|sendLocation|sendMessage|getUpdates|setWebhook|deleteWebhook/i,
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /external_send\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|sendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i,
  /gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true/i,
  /setInterval|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
]) {
  assertExcludes(
    currentSurfaceSource,
    forbiddenPattern,
    "current Telegram/live-location setup surfaces",
  );
}

console.log("Telegram True Live Location evidence contract guard passed");
