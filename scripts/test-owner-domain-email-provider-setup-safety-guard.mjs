import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript = "scripts/test-owner-domain-email-provider-setup-safety-guard.mjs";

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

const [ledger, preactivationSuite, ...setupSources] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  ...[...setupRouteFiles, ...setupHelperFiles].map((file) => readFile(file, "utf8")),
]);

const ownerDomainSection = sectionBetween(
  ledger,
  "### Owner Domain Email Provider Setup Safety Contract Lock",
);

for (const phrase of [
  "This is a docs/test-only guard for future owner-domain outbound Email setup before any SMTP/API/provider activation or one-message staging send evidence.",
  "This lock does not activate Email sending, provider credentials, provider SDKs, SMTP/API calls, IMAP login/test, DNS changes, env changes, deployment, DB read/write, runtime API behavior, UI, route/helper changes, or live send behavior.",
  "Future app Email must use owner-domain email addresses.",
  "Future Driver Details Email sender is dispatch@<owner-domain>.",
  "Future Driver Details Email reply-to is dispatch@<owner-domain> or a dedicated cPanel reply inbox on the owner domain.",
  "Future Invoice Email sender is billing@<owner-domain>, but invoice email remains a separate billing lane.",
  "Outbound app Email must use SMTP or an approved Email API.",
  "IMAP is receive-only and must never be treated as a send mechanism.",
  "A cPanel mailbox may be used only for inbox/replies unless cPanel SMTP is separately approved as the outbound provider.",
  "Future outbound provider options are names only: resend, aws_ses, sendgrid, mailgun, cpanel_smtp.",
  "Future env names are names only and no env values, secrets, API keys, SMTP passwords, IMAP passwords, provider tokens, DNS secret values, or connection strings may be printed, logged, committed, echoed, or surfaced.",
  "Future env names only: PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED, PRESTIGE_EMAIL_PROVIDER, PRESTIGE_DRIVER_DETAILS_EMAIL_FROM, PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO, PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST, PRESTIGE_SMTP_HOST, PRESTIGE_SMTP_PORT, PRESTIGE_SMTP_USER, PRESTIGE_SMTP_PASSWORD, PRESTIGE_SMTP_SECURE, RESEND_API_KEY, AWS_SES_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, SENDGRID_API_KEY, MAILGUN_API_KEY, MAILGUN_DOMAIN.",
  "Future DNS/auth proof requires SPF, DKIM, DMARC, provider/domain alignment, owner-domain sender proof, and reply inbox proof, with names only and no secret values.",
  "A staging recipient allowlist is required before any future one-message staging Driver Details Email send evidence.",
  "Future Driver Details Email staging evidence must be one-message-only.",
  "Future rollback/disable proof must close the send gate, verify the disabled/no-op route, prove no follow-up send, and keep provider credentials non-live unless separately approved.",
  "Driver-details Email must not imply invoice/PDF/payment/billing activation.",
  "Invoice Email remains a separate billing lane, and billing@<owner-domain> may be used later only after separate billing/invoice approval.",
  "Email may later send admin-selected secure tracking-link live location only; Email must not auto-send live location and must not send native/streaming live location.",
  "Telegram remains the first future true live-location channel; Telegram POB plus 5 minute auto-stop remains future-only and is not implemented by this lock.",
  "No provider activation, provider send, Email send, SMTP login/test, IMAP login/test, DNS change, env change, DB read/write, deploy, parser change, Save Booking change, `/api/admin-saved-bookings` change, pricing/rates/customer_rates change, driver_payout_rules change, payout/payment/PDF/billing change, auth/location/photo/calendar/OTS change, UI sector/card/button change, or shim change is approved by this lock.",
  "This lock adds `scripts/test-owner-domain-email-provider-setup-safety-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ownerDomainSection, phrase, `owner-domain email safety phrase: ${phrase}`);
}

for (const forbidden of [
  "IMAP may be used to send email",
  "IMAP is an outbound send mechanism",
  "Email sending is approved now",
  "provider credentials may be configured now",
  "live Email send is approved",
  "SMTP login is approved now",
  "IMAP login is approved now",
  "DNS changes are approved now",
  "invoice email is part of driver-details email",
  "billing@<owner-domain> is approved for driver details",
  "dispatch@<owner-domain> may send invoices",
  "Email may auto-send live location",
  "Email may send native live location",
  "Email may send streaming live location",
  "Telegram POB plus 5 minute auto-stop is active now",
  "provider send is approved without gate approval",
  "env values may be printed",
  "secrets may be printed",
  "API keys may be printed",
  "SMTP passwords may be printed",
  "IMAP passwords may be printed",
  "DNS secret values may be printed",
]) {
  assertExcludes(ownerDomainSection, forbidden, "forbidden owner-domain email safety phrase");
}

for (const envName of [
  "PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED",
  "PRESTIGE_EMAIL_PROVIDER",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_FROM",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO",
  "PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST",
  "PRESTIGE_SMTP_HOST",
  "PRESTIGE_SMTP_PORT",
  "PRESTIGE_SMTP_USER",
  "PRESTIGE_SMTP_PASSWORD",
  "PRESTIGE_SMTP_SECURE",
  "RESEND_API_KEY",
  "AWS_SES_REGION",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "SENDGRID_API_KEY",
  "MAILGUN_API_KEY",
  "MAILGUN_DOMAIN",
]) {
  assertIncludes(ownerDomainSection, envName, `future env-name-only ${envName}`);
  assertExcludes(
    ownerDomainSection,
    new RegExp(`${envName}\\s*[:=]\\s*["']?[^\\s,.)]+`, "i"),
    `future env-name-only ${envName} value`,
  );
}

for (const provider of ["resend", "aws_ses", "sendgrid", "mailgun", "cpanel_smtp"]) {
  assertIncludes(ownerDomainSection, provider, `future owner-domain provider option ${provider}`);
}

assertIncludes(
  preactivationSuite,
  guardScript,
  "Preactivation suite owner-domain email provider setup safety registration",
);

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
  /^\s*import\s+.*from\s+["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend|imap|imapflow)["']/im,
  /require\(\s*["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend|imap|imapflow)["']\s*\)/i,
  /\b(?:SESClient|SendEmailCommand)\b/,
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bIMAP_[A-Z_]*\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b/i,
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|createTransport|smtpTransport|sendMail\s*\(|messages\.send|transporter\.sendMail|imap\.connect|new ImapFlow/i,
  /external_send\s*[:=]\s*true|sendingEnabled\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i,
  /setInterval|setTimeout|cron|scheduler|polling|retryLoop|retry_loop|queueMicrotask|new Worker/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.insert\(|\.upsert\(|\.update\(|\.delete\(/i,
]) {
  assertExcludes(setupCombined, forbiddenPattern, "owner-domain Email setup surface");
}

console.log("Owner domain email provider setup safety guard passed");
