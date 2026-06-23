import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const runnerPath = "scripts/run-small-live-customer-runtime-production-window.mjs";
const guardPath = "scripts/test-small-live-customer-runtime-production-window-runner-guard.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const [runner, ledger, preactivationSuite] = await Promise.all([
  readFile(runnerPath, "utf8"),
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

const lockSection = sectionBetween(
  ledger,
  "### Small Live Customer Production Runtime Allowlist Window Runner Guard Lock",
);

for (const fragment of [
  "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED",
  "small-live-customer-runtime-window-approved",
  "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE",
  "preflight-only",
  "exactAllowlistSize = 2",
  "two hidden active production customer accounts",
  "one latest active booking per allowlisted customer",
  "PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE",
  "PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST",
  "Driver details ready",
  "Your Prestige Limo driver details are ready in your customer app.",
  "small-live-customer-runtime-production-window-preflight",
  "activation_run: false",
  "env_changed_by_runner: false",
  "provider_send: false",
  "deploy: false",
  "db_write: false",
  "secrets_printed: false",
  "private_customer_data_printed: false",
]) {
  assertIncludes(runner, fragment, `runner fragment ${fragment}`);
}

for (const fragment of [
  "This is a disabled-by-default guard plus no-side-effect runner scaffold for a future separately approved small live Customer Portal + Customer In-App production allowlist window.",
  "The runner is `scripts/run-small-live-customer-runtime-production-window.mjs`.",
  "The runner requires `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED=small-live-customer-runtime-window-approved` and `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=preflight-only` before it emits a live-window preflight packet.",
  "This scaffold does not open production gates, edit Vercel env, edit env files, deploy, read or write the database, create customer access mappings, create notification rows, run provider calls, or activate runtime.",
  "The live-window scope remains exactly two hidden active production customer accounts, with one latest active booking per allowlisted account.",
  "Future live-window gate names are names-only/no-values: `PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID`, `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_MODE`, `PRESTIGE_CUSTOMER_PORTAL_SESSION_ISSUE_TOKEN`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_MODE`, `PRESTIGE_CUSTOMER_PORTAL_RUNTIME_ACCOUNT_ALLOWLIST`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED`, `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE`, and `PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST`.",
  "Customer Portal live-window visibility must stay limited to safe saved-booking fields only.",
  "Customer In-App live-window visibility must stay limited to safe customer-app notification fields only.",
  "Admin `Send In-App` remains fixed-template only: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`",
  "The future live window must prove production root health, exact allowlist scope, customer portal read for both allowlisted customers, customer in-app read for both allowlisted customers, admin Send In-App for both allowlisted customers, anonymous/missing-session/wrong-session/wrong-customer/cross-origin/wrong-referer blocks, audit/monitoring proof, rollback proof, and post-rollback blocked/no-read proof.",
  "Stop conditions include any out-of-allowlist read, wrong-customer read, forbidden field exposure, provider send attempt, billing/payment/PDF/payout activation, secret/private-data print risk, or inability to prove rollback immediately.",
  "Provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback/blast/scheduler/retry, and all-customer activation remain blocked.",
  "A future actual live allowlist window requires separate owner approval after this scaffold promotion; this lock is not approval to open or keep production runtime live.",
]) {
  assertIncludes(lockSection, fragment, `ledger lock fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /createClient|@supabase\/supabase-js|\.from\(/i,
  /fetch\s*\(/i,
  /vercel\s+env|npx\s+--yes\s+vercel|vercel\s+--prod|vercel\s+deploy/i,
  /process\.env\.[A-Z0-9_]+\s*=/,
  /writeFile|appendFile|rm\(|unlink|mkdir/i,
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']|api\.telegram\.org|sendMessage|sendMail|twilio\.messages/i,
  /https:\/\/(?:maps|routes|places)\.googleapis\.com|https:\/\/www\.onemap\.gov\.sg|ONEMAP_TOKEN|FLIGHTAWARE_API_KEY|AEROAPI_KEY/i,
  /console\.log\s*\([^)]*process\.env/i,
]) {
  assertExcludes(runner, forbiddenPattern, "runner forbidden side-effect surface");
}

for (const forbiddenPhrase of [
  "live window is active",
  "all-customer activation is approved",
  "provider sends are approved",
  "free-form customer message is approved",
  "billing/payment/PDF is approved",
  "payout is approved",
  "may print secrets",
  "may print tokens",
  "may print booking references",
  "may print customer names",
]) {
  assertExcludes(lockSection, forbiddenPhrase, "forbidden live-window ledger claim");
}

assertIncludes(preactivationSuite, guardPath, "preactivation suite registration");

console.log("Small live customer production runtime allowlist window runner guard passed.");
