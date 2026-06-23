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
  "execute-window",
  "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED",
  "small-live-customer-runtime-window-deploy-approved",
  "PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL",
  "expectedMaskedProductionProjectRef = \"kvv...atm\"",
  "exactAllowlistSize = 2",
  "selectExactTwoLiveWindowTargets",
  "businessCustomerLabelPattern",
  "buildSessionMap",
  "PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP",
  "exactly two customer sessions mapped privately with no token values printed",
  "exactly two private customer sessions to exactly two allowlisted customer accounts",
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
  "small-live-customer-runtime-production-window-execute",
  "runExecuteWindow",
  "runVercelDeploy",
  "\"--yes\", \"vercel\", \"--prod\", \"--force\", \"--yes\"",
  "deploymentEnvOverrides",
  "gate_overrides_only: true",
  "persistent_vercel_env_changed: false",
  "fetchJsonOrText",
  "verifyRootHealth",
  "provePreWindowBlocked",
  "runFixtureProof",
  "cleanupLiveWindowRows",
  "verifyZeroNotificationRows",
  "provePostRollbackBlocked",
  "assertSafePortalProjection",
  "assertSafeCustomerNotificationProjection",
  "docs_evidence_record_required_after_success: true",
  "provider_send: false",
  "db_write: false",
  "secrets_printed: false",
  "private_customer_data_printed: false",
]) {
  assertIncludes(runner, fragment, `runner fragment ${fragment}`);
}

for (const fragment of [
  ".from(\"customers\")",
  ".from(\"bookings\")",
  ".from(notificationTable)",
  ".delete()",
  ".eq(\"delivery_surface\", \"customer_app\")",
  ".eq(\"event_key\", fixture.eventKey)",
]) {
  assertIncludes(runner, fragment, `runner DB-scope fragment ${fragment}`);
}

for (const fragment of [
  "This is a disabled-by-default guard plus execution runner scaffold for a future separately approved small live Customer Portal + Customer In-App production allowlist window.",
  "The runner is `scripts/run-small-live-customer-runtime-production-window.mjs`.",
  "The no-side-effect preflight phase still requires `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_APPROVED=small-live-customer-runtime-window-approved` and `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=preflight-only`.",
  "The execution phase is disabled by default and additionally requires `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_PHASE=execute-window`, `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_DEPLOY_APPROVED=small-live-customer-runtime-window-deploy-approved`, and `PRESTIGE_SMALL_LIVE_CUSTOMER_RUNTIME_WINDOW_TARGET_URL` before it can open any live window.",
  "Execution mode can deploy a bounded production window using Vercel deployment-time environment overrides only; it must not edit Vercel project env, local env files, source files, or persistent saved env values.",
  "The live-window scope remains exactly two hidden active production customer accounts, with one latest active booking per allowlisted account.",
  "Execution mode selects the two targets internally and must not print customer names, customer IDs, account references, booking references, auth user IDs, row IDs, phone/email/contact data, session tokens, cookies, API keys, DB URLs, env values, or private customer data.",
  "Execution mode must use `PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_MAP` to map exactly two private customer sessions to exactly two allowlisted customer accounts without printing token values.",
  "Execution mode may create exactly one temporary `customer_app` notification row per allowlisted customer through the existing admin `Send In-App` route, then must delete only those matching temporary event-key rows and prove zero matching rows remain.",
  "Execution mode must prove production root health, pre-window blocked routes, customer portal read for both allowlisted customers, customer in-app read for both allowlisted customers, admin Send In-App for both allowlisted customers, anonymous/missing-session/wrong-session/wrong-customer/cross-origin/wrong-referer blocks, cleanup, rollback deployment, and post-rollback blocked/no-read proof.",
  "Customer Portal live-window visibility must stay limited to safe saved-booking fields only.",
  "Customer In-App live-window visibility must stay limited to safe customer-app notification fields only.",
  "Admin `Send In-App` remains fixed-template only: title `Driver details ready`; message `Your Prestige Limo driver details are ready in your customer app.`",
  "Stop conditions include any out-of-allowlist read, wrong-customer read, forbidden field exposure, provider send attempt, billing/payment/PDF/payout activation, secret/private-data print risk, failure to clean up temporary rows, or inability to prove rollback immediately.",
  "Provider sends, Email/Resend, Telegram, WhatsApp, SMS, Google Maps, OneMap, FlightAware, billing/payment/PDF/invoice, pricing/rates/customer_rates, payout/PayNow/driver_payout_rules, parser/debug/internal/admin notes, secrets/tokens/cookies/JWTs, raw provider payloads, Save Booking internals, `/api/admin-saved-bookings` internals, live-location/driver GPS, OTS/photo/storage, free-form customer messages, fallback/blast/scheduler/retry, and all-customer activation remain blocked.",
  "This lock is not approval to run the live window or keep production runtime live; the execution phase still requires a separate owner approval immediately before use.",
]) {
  assertIncludes(lockSection, fragment, `ledger lock fragment ${fragment}`);
}

for (const forbiddenPattern of [
  /process\.env\.[A-Z0-9_]+\s*=/,
  /vercel\s+env\s+add/i,
  /writeFile|appendFile|rm\(|unlink|mkdir/i,
  /from\s+["'](?:resend|nodemailer|@sendgrid\/mail|mailgun\.js|twilio)["']|api\.telegram\.org|sendMessage|sendMail|twilio\.messages/i,
  /https:\/\/(?:maps|routes|places)\.googleapis\.com|https:\/\/www\.onemap\.gov\.sg|ONEMAP_TOKEN|FLIGHTAWARE_API_KEY|AEROAPI_KEY/i,
  /console\.log\s*\([^)]*process\.env/i,
  /console\.log\(.*SUPABASE/i,
  /console\.log\(.*TOKEN/i,
]) {
  assertExcludes(runner, forbiddenPattern, "runner forbidden side-effect surface");
}

for (const forbiddenPhrase of [
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
