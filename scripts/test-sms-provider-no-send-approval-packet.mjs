import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const ledgerPath = "docs/current-implementation-ledger.md";
const appPagePath = "app/page.tsx";
const packageJsonPath = "package.json";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const routeFiles = [
  "app/api/admin-sms-customer-driver-details-preview-readiness-setup/route.ts",
  "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/sms-customer-driver-details-setup-foundation.ts",
  "lib/sms-customer-driver-details-send-audit-payload-setup-foundation.ts",
];

const smsProviderPackageNames = new Set([
  "@aws-sdk/client-sns",
  "@vonage/server-sdk",
  "africastalking",
  "aws-sdk",
  "clicksend",
  "messagebird",
  "nexmo",
  "plivo",
  "sinch",
  "sms77-client",
  "telnyx",
  "twilio",
  "vonage",
]);
const smsProviderImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@aws-sdk\/client-sns|@vonage\/server-sdk|africastalking|aws-sdk|clicksend|messagebird|nexmo|plivo|sinch|sms77-client|telnyx|twilio|vonage)["']|require\(\s*["'](?:@aws-sdk\/client-sns|@vonage\/server-sdk|africastalking|aws-sdk|clicksend|messagebird|nexmo|plivo|sinch|sms77-client|telnyx|twilio|vonage)["']\s*\)/i;
const smsProviderClassPattern =
  /\b(?:MessageBird|Nexmo|Plivo|PublishCommand|SNSClient|Telnyx|Twilio|Vonage)\b/;
const smsEnvPattern =
  /\bprocess\.env\b|SMS_[A-Z_]*|TWILIO_[A-Z_]*|VONAGE_[A-Z_]*|SNS_[A-Z_]*|AWS_ACCESS_KEY|AWS_SECRET|API_KEY|ACCESS_TOKEN|SECRET_KEY|ACCOUNT_SID|AUTH_TOKEN/;
const smsApiPattern =
  /api\.twilio|api\.vonage|api\.messagebird|api\.telnyx|api\.plivo|rest\.nexmo|sms_api|sns\.[a-z0-9-]+\.amazonaws\.com|\/Messages\.json/i;
const externalSendPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|sendText\s*\(|messages\.create|client\.messages|publish\s*\(|sns\.publish|request\s*\(/i;
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

const packetSection = sectionBetween(ledger, "### SMS Provider No-Send Approval Packet Lock");

for (const phrase of [
  "Approval status: pending future SMS staging test approval.",
  "This is a docs/test-only no-send approval packet guarded by `scripts/test-sms-provider-no-send-approval-packet.mjs`.",
  "Current SMS routes remain setup-only/no-live:",
  "`GET /api/admin-sms-customer-driver-details-preview-readiness-setup`",
  "`GET /api/admin-sms-customer-driver-details-send-disabled-setup`",
  "Current SMS send surface remains disabled/no-op with `external_send: false`, `sendingEnabled: false`, `liveSendingEnabled: false`, and `providerConfigured: false`.",
  "No provider env values are printed, required, or read by the current SMS setup-only routes/helpers.",
  "No SMS API/provider activation is approved.",
  "No live SMS send is approved.",
  "Future staging SMS test requires separate owner approval, secret-safe provider env-name handling, recipient allowlist, content guard, one-message test scope, and rollback/disable plan.",
  "Future SMS content must exclude pricing, payout, payment/PDF, auth, location/photo/calendar, parser/debug, internal notes, and secrets.",
  "Future live/provider send wiring must not change Save Booking + CRM.",
  "Future live/provider send wiring must not change `/api/admin-saved-bookings`.",
  "Future live/provider send wiring must not change parser behavior or `/api/ai-parse`.",
  "Future live/provider send wiring must not add UI sectors/buttons/cards.",
  "Future live/provider send wiring must not add new shims.",
  "Required tests before any future SMS staging send:",
  "provider env-name/secret-safe listing guard",
  "recipient allowlist guard",
  "content forbidden-field guard",
  "single-send staging approval guard",
  "rollback/disable verification guard",
  "Rollback note:",
  "No runtime implementation, UI/API/helper behavior change, env change, deployment, DB read/write, migration, provider activation, live send, parser change, Save Booking + CRM change, `/api/admin-saved-bookings` change, payment/PDF/pricing/payout/auth/location/photo/calendar activation, UI sector/button/card, or new shim is approved by this packet.",
]) {
  assertIncludes(packetSection, phrase, `SMS provider no-send approval packet phrase: ${phrase}`);
}

for (const forbiddenApprovalPhrase of [
  "runtime implementation approved",
  "safe to send now",
  "provider activation approved",
  "SMS API activation approved",
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
    smsProviderPackageNames.has(packageName),
    false,
    `SMS no-send packet must not add provider SDK package: ${packageName}`,
  );
}

for (const [index, file] of [...routeFiles, ...helperFiles].entries()) {
  const source = setupSources[index];

  if (routeFiles.includes(file)) {
    assert.match(source, /export async function GET/, `${file} must remain GET-only setup route.`);
    assertExcludes(source, /export async function (POST|PUT|PATCH|DELETE)/, `${file} live-send verb`);
  }

  assertExcludes(source, smsProviderImportPattern, `${file} provider SDK import`);
  assertExcludes(source, smsProviderClassPattern, `${file} provider SDK class`);
  assertExcludes(source, smsEnvPattern, `${file} SMS provider/env secret read`);
  assertExcludes(source, smsApiPattern, `${file} SMS provider API URL`);
  assertExcludes(source, externalSendPattern, `${file} external SMS send API`);
  assertExcludes(source, dbWritePattern, `${file} DB write path`);
  assertExcludes(source, liveTruePattern, `${file} live SMS flags`);
}

const smsSetupChain = setupSources.join("\n");

for (const fragment of [
  "sms_customer_driver_details_setup_only",
  "sms_customer_driver_details_send_audit_payload_setup_only",
  "sms_disabled",
  "external_send: false",
  "liveSendingEnabled: false",
  "sendingEnabled: false",
  "providerConfigured: false",
]) {
  assertIncludes(smsSetupChain, fragment, `SMS setup-only fragment: ${fragment}`);
}

assertIncludes(
  appPage,
  'const adminSmsCustomerDriverDetailsSendDisabledApiPath =\n  "/api/admin-sms-customer-driver-details-send-disabled-setup";',
  "Customer Copy SMS disabled-send route",
);
assertIncludes(appPage, 'checkAdminCustomerDriverDetailsMessageDisabledSend("sms")', "Customer Copy SMS disabled-send action");
assertExcludes(
  appPage,
  "/api/admin-sms-customer-driver-details-preview-readiness-setup",
  "app/page.tsx SMS preview route runtime wiring",
);
assertExcludes(
  appPage,
  /api\.twilio|api\.vonage|api\.messagebird|api\.telnyx|api\.plivo|twilio|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages/i,
  "app/page.tsx SMS live provider/send wiring",
);

const saveBookingSource = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingSource, 'fetch("/api/admin-bookings"', "Save Booking + CRM safe endpoint");
assertExcludes(saveBookingSource, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

assertExcludes(aiParseRoute, /twilio|vonage|messagebird|telnyx|plivo|sendSms|messages\.create/i, "Parser SMS provider separation");
assertExcludes(
  adminSavedBookingsRoute,
  "scripts/test-sms-provider-no-send-approval-packet.mjs",
  "admin-saved-bookings SMS approval guard separation",
);

assertIncludes(
  preactivationSuite,
  "scripts/test-sms-provider-no-send-approval-packet.mjs",
  "Preactivation suite registration",
);

console.log("SMS provider no-send approval packet guard passed.");
