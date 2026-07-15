import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const emailNotificationSetupPath = "lib/admin-email-notification-setup-foundation.ts";
const guardScript = "scripts/test-email-provider-staging-send-safety-contract.mjs";

const setupRouteFiles = [
  "app/api/admin-customer-driver-details-email-preview-readiness-setup/route.ts",
  "app/api/admin-customer-driver-details-email-review-item-setup/route.ts",
  "app/api/admin-customer-driver-details-email-send-disabled-setup/route.ts",
  "app/api/admin-email-activation-preflight-setup/route.ts",
  "app/api/admin-email-provider-readiness-setup/route.ts",
  "app/api/admin-email-provider-selection-setup/route.ts",
];

const setupHelperFiles = [
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-provider-readiness-setup-foundation.ts",
  "lib/admin-email-provider-selection-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/customer-driver-details-email-readiness-setup-foundation.ts",
  "lib/customer-driver-details-email-send-audit-payload-setup-foundation.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/driver-ack-customer-message-handoff-setup-foundation.ts",
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

const [ledger, preactivationSuite, emailNotificationSetup, ...setupSources] =
  await Promise.all([
    readFile(ledgerPath, "utf8"),
    readFile(preactivationSuitePath, "utf8"),
    readFile(emailNotificationSetupPath, "utf8"),
    ...[...setupRouteFiles, ...setupHelperFiles].map((file) => readFile(file, "utf8")),
  ]);

const safetySection = sectionBetween(
  ledger,
  "### Email Provider Staging Send Safety Contract Lock",
);
const productionTestSection = sectionBetween(
  ledger,
  "### Controlled Production Driver Details Email Test Approval",
);

for (const phrase of [
  "This is a docs/test-only guard for a future separately approved one-message staging Email send evidence pass.",
  "This lock does not activate Email sending, provider credentials, provider SDKs, SMTP/API calls, env changes, deployment, DB read/write, or live send behavior.",
  "Future Email provider handling must list env names only; env values, secrets, API keys, SMTP passwords, access tokens, provider tokens, and connection strings must never be printed, logged, committed, echoed, or surfaced.",
  "A recipient allowlist is required before any future staging Email send evidence pass.",
  "Future Email send content must exclude pricing, payout, payment/PDF/billing, auth/location/photo/calendar/OTS, parser/internal debug, internal notes, secrets/tokens, `customer_rates`, and `driver_payout_rules`.",
  "Future staging Email send scope must be exactly one message only; batch send, resend automation, scheduler, polling, retry loop, customer-visible auto-refresh, and background sends remain forbidden.",
  "Future staging Email send evidence requires explicit owner approval naming the staging target, provider, env-name handling, allowlisted recipient, content fixture, one-message boundary, rollback/disable proof, and checks.",
  "Future Driver Details Email may be app-sent through Resend only when admin explicitly clicks the Email action, the exact Email driver-details gate is approved/opened, and staging recipient allowlist proof passes; this does not approve Telegram/WhatsApp provider sends.",
  "Rollback/disable proof is required after any future send evidence; the provider gate must be closed again and disabled/no-op behavior must be verified.",
  "Future Email may include an admin-selected secure tracking-link live-location email only after separate owner approval for that exact channel/action gate.",
  "Email must not auto-send live location, must not send native/streaming live location, and must not be the future automatic live-location channel.",
  "No provider activation or provider send is approved by this guard.",
]) {
  assertIncludes(safetySection, phrase, `Email staging-send safety phrase: ${phrase}`);
}

for (const forbidden of [
  "Email sending is approved now",
  "provider credentials may be configured now",
  "live Email send is approved",
  "batch send is approved",
  "auto-send live location email is approved",
  "native live location email is approved",
  "streaming live location email is approved",
  "env values may be printed",
]) {
  assertExcludes(safetySection, forbidden, `forbidden Email staging-send approval phrase`);
}

for (const phrase of [
  "The owner approved exactly one controlled Production Driver Details Email test on 2026-07-15.",
  "`ADM-20260712063110`",
  "`TEST DRIVER CRM 20260516`",
  "`info@prestigelimo.sg`",
  "Only `PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED` may be temporarily changed for this test",
  "The established route, helper, Customer Copy Email button, recipient allowlist, privacy allowlist, same-origin admin boundary, same-page success lock, and deterministic Resend idempotency key must be reused without duplication.",
  "Production must first receive an isolated `origin/main`-based candidate containing only the existing booking-status repair and the reviewed Driver Details Email hardening; `staging` must not be deployed or merged.",
  "Success requires exactly one send-route POST, HTTP 200 `send_succeeded`, `provider_request_count: 1`, one safe provider message id, one disabled same-page `Emailed` state, and owner-mailbox receipt confirmation.",
  "Rollback must set the Production gate closed again, redeploy the same source, verify `Email gate off`, and prove no later send-route request.",
  "No Supabase branch, Supabase configuration/data change, Automation toggle, calendar/map action, invoice/payment/payout action, customer/driver in-app message, or second external Email is approved.",
]) {
  assertIncludes(productionTestSection, phrase, `Controlled Production Email test phrase: ${phrase}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite Email staging-send safety registration",
);

assertIncludes(emailNotificationSetup, '"live_location"', "Email content blocked live_location field");

const setupCombined = setupSources.join("\n");

for (const fragment of [
  "external_send: false",
  "sendingEnabled: false",
  "liveSendingEnabled: false",
  "providerConfigured: false",
]) {
  assertIncludes(setupCombined, fragment, `current Email setup-only flag ${fragment}`);
}

for (const forbiddenPattern of [
  /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/,
  /^\s*import\s+.*from\s+["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend)["']/im,
  /require\(\s*["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend)["']\s*\)/i,
  /\b(?:SESClient|SendEmailCommand)\b/,
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b/i,
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|createTransport|smtpTransport|sendMail\s*\(|messages\.send|transporter\.sendMail/i,
  /external_send\s*[:=]\s*true|sendingEnabled\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i,
  /setInterval|setTimeout|cron|scheduler|polling|retryLoop|retry_loop|queueMicrotask|new Worker/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/i,
]) {
  assertExcludes(setupCombined, forbiddenPattern, "Email staging-send setup surface");
}

console.log("Email provider staging send safety contract guard passed");
