import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const packageJsonPath = "package.json";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const routeFiles = [
  "app/api/admin-customer-driver-details-email-preview-readiness-setup/route.ts",
  "app/api/admin-customer-driver-details-email-review-item-setup/route.ts",
  "app/api/admin-customer-driver-details-email-send-disabled-setup/route.ts",
  "app/api/admin-driver-ack-customer-message-handoff-setup/route.ts",
  "app/api/admin-email-activation-preflight-setup/route.ts",
  "app/api/admin-email-provider-readiness-setup/route.ts",
  "app/api/admin-email-provider-selection-setup/route.ts",
];
const helperFiles = [
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

const emailProviderPackageNames = new Set([
  "@aws-sdk/client-ses",
  "@sendgrid/client",
  "@sendgrid/mail",
  "aws-sdk",
  "mailgun-js",
  "mailgun.js",
  "nodemailer",
  "postmark",
  "resend",
]);
const emailProviderImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend)["']|require\(\s*["'](?:@aws-sdk\/client-ses|@sendgrid\/client|@sendgrid\/mail|aws-sdk|mailgun-js|mailgun\.js|nodemailer|postmark|resend)["']\s*\)/i;
const emailProviderClassPattern =
  /\b(?:SESClient|SendEmailCommand|MailService|Mailgun|ServerClient|Transporter)\b/;
const emailEnvPattern =
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bAWS_ACCESS_KEY_ID\b|\bAWS_SECRET_ACCESS_KEY\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b/i;
const externalSendPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|createTransport|smtpTransport|sendMail\s*\(|messages\.send|transporter\.sendMail|client\.send/i;
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

const packetSection = sectionBetween(ledger, "### Email Provider No-Send Approval Packet Lock");

for (const phrase of [
  "Approval status: superseded for Driver Details Email by the gated send action contract; setup foundations remain setup-only/no-live.",
  "This is a docs/test-only no-send approval packet guarded by `scripts/test-email-provider-no-send-approval-packet.mjs`.",
  "Current Email setup routes remain setup-only/no-live:",
  "`GET /api/admin-customer-driver-details-email-preview-readiness-setup`",
  "`GET /api/admin-customer-driver-details-email-send-disabled-setup`",
  "`GET /api/admin-email-provider-readiness-setup`",
  "`GET /api/admin-email-provider-selection-setup`",
  "`GET /api/admin-email-activation-preflight-setup`",
  "The setup-only disabled Email send surface remains available as a no-op audit/setup route with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.",
  "The admin Customer Copy Email button now uses the separate gated Driver Details Email route `POST /api/admin-customer-driver-details-email-send-action`.",
  "No provider env values are printed, required, or read by the current Email setup-only routes/helpers.",
  "No SMTP provider, SMS, WhatsApp, Telegram customer/driver send, automatic fallback, batch send, scheduler, polling, or retry automation is approved by this setup packet.",
  "Future staging Email test requires separate owner approval, secret-safe provider env-name handling, recipient allowlist, content guard, one-message test scope, and rollback/disable plan.",
  "Future Email content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.",
  "Future live/provider send wiring must not change Save Booking + CRM.",
  "Future live/provider send wiring must not change `/api/admin-saved-bookings`.",
  "Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.",
  "Future live/provider send wiring must not add UI sectors/buttons/cards.",
  "Future live/provider send wiring must not add new shims.",
  "Required tests before any future Email staging send:",
  "provider env-name/secret-safe listing guard",
  "recipient allowlist guard",
  "content forbidden-field guard",
  "single-send staging approval guard",
  "rollback/disable verification guard",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `Email provider no-send approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to send now",
  "provider activation approved",
  "SMTP activation approved",
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
    emailProviderPackageNames.has(packageName),
    false,
    `Email no-send packet must not add provider SDK package: ${packageName}`,
  );
}

for (const [index, file] of [...routeFiles, ...helperFiles].entries()) {
  const source = setupSources[index];

  if (routeFiles.includes(file)) {
    assert.match(source, /export async function GET/, `${file} must remain GET-only setup route.`);
    assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${file} live-send verb`);
  }

  assertExcludes(source, emailProviderImportPattern, `${file} provider SDK import`);
  assertExcludes(source, emailProviderClassPattern, `${file} provider SDK class`);
  assertExcludes(source, emailEnvPattern, `${file} Email provider/env secret read`);
  assertExcludes(source, externalSendPattern, `${file} external Email send API`);
  assertExcludes(source, dbWritePattern, `${file} DB write path`);
  assertExcludes(source, liveTruePattern, `${file} live Email flags`);
}

const emailSetupChain = setupSources.join("\n");

for (const fragment of [
  "customer_driver_details_email_setup_only",
  "customer_driver_details_email_send_audit_payload_setup_only",
  "email_provider_readiness_setup_only",
  "email_provider_selection_setup_only",
  "email_disabled",
  "external_send: false",
  "liveSendingEnabled: false",
  "sendingEnabled: false",
  "providerConfigured: false",
]) {
  assertIncludes(emailSetupChain, fragment, `Email setup-only fragment: ${fragment}`);
}

assertIncludes(
  appPage,
  'const adminCustomerDriverDetailsEmailSendActionApiPath =\n  "/api/admin-customer-driver-details-email-send-action";',
  "Customer Copy Email gated-send route",
);
assertIncludes(
  appPage,
  'const adminEmailActivationPreflightApiPath =\n  "/api/admin-email-activation-preflight-setup";',
  "Email activation preflight route",
);
assertIncludes(
  appPage,
  "Email uses the gated email route. WhatsApp and SMS are parked setup-only/no-live.",
  "Customer Copy Email gated route and parked SMS/WhatsApp boundary",
);
assertExcludes(
  appPage,
  "/api/admin-email-provider-readiness-setup",
  "app/page.tsx Email provider readiness route runtime wiring",
);
assertExcludes(
  appPage,
  "/api/admin-email-provider-selection-setup",
  "app/page.tsx Email provider selection route runtime wiring",
);
assertExcludes(
  appPage,
  /nodemailer|sendgrid|mailgun|postmark|resend|amazonses|SESClient|sendMail\s*\(|createTransport|smtpTransport/i,
  "app/page.tsx Email live provider/send wiring",
);

const saveBookingSource = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingSource, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBookingSource, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(
  aiParseRoute,
  /nodemailer|sendgrid|mailgun|postmark|resend|amazonses|SESClient|sendMail\s*\(|createTransport|smtpTransport/i,
  "Parser Email provider separation",
);
assertExcludes(
  adminSavedBookingsRoute,
  "scripts/test-email-provider-no-send-approval-packet.mjs",
  "admin-saved-bookings Email approval guard separation",
);

assertIncludes(
  preactivationSuite,
  "scripts/test-email-provider-no-send-approval-packet.mjs",
  "Preactivation suite registration",
);

console.log("Email provider no-send approval packet guard passed.");
