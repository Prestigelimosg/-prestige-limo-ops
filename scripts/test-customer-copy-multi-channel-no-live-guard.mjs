import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const appPagePath = "app/page.tsx";
const routeFiles = [
  "app/api/admin-customer-driver-details-email-send-disabled-setup/route.ts",
  "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.ts",
  "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const helperFiles = [
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/admin-whatsapp-message-disabled-adapter.ts",
  "lib/customer-driver-details-email-readiness-setup-foundation.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/sms-customer-driver-details-setup-foundation.ts",
  "lib/whatsapp-customer-driver-details-setup-foundation.ts",
];
const routeHarnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const providerPackageNames = new Set([
  "@aws-sdk/client-ses",
  "@aws-sdk/client-sns",
  "@green-api/whatsapp-api-client",
  "@sendgrid/client",
  "@sendgrid/mail",
  "@twilio/conversations",
  "@vonage/server-sdk",
  "@whiskeysockets/baileys",
  "360dialog",
  "africastalking",
  "aws-sdk",
  "clicksend",
  "mailgun-js",
  "mailgun.js",
  "messagebird",
  "nexmo",
  "nodemailer",
  "plivo",
  "postmark",
  "resend",
  "sinch",
  "sms77-client",
  "stripe",
  "telnyx",
  "twilio",
  "vonage",
  "wati",
  "whatsapp",
  "whatsapp-cloud-api",
  "whatsapp-web.js",
]);
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:resend|@aws-sdk\/client-ses|@aws-sdk\/client-sns|aws-sdk|@sendgrid\/mail|@sendgrid\/client|mailgun|mailgun-js|mailgun\.js|nodemailer|postmark|@green-api\/whatsapp-api-client|@twilio\/conversations|@vonage\/server-sdk|@whiskeysockets\/baileys|360dialog|africastalking|clicksend|messagebird|nexmo|plivo|sinch|sms77-client|telnyx|twilio|vonage|wati|whatsapp|whatsapp-cloud-api|whatsapp-web\.js|stripe)["']|require\(\s*["'](?:resend|@aws-sdk\/client-ses|@aws-sdk\/client-sns|aws-sdk|@sendgrid\/mail|@sendgrid\/client|mailgun|mailgun-js|mailgun\.js|nodemailer|postmark|@green-api\/whatsapp-api-client|@twilio\/conversations|@vonage\/server-sdk|@whiskeysockets\/baileys|360dialog|africastalking|clicksend|messagebird|nexmo|plivo|sinch|sms77-client|telnyx|twilio|vonage|wati|whatsapp|whatsapp-cloud-api|whatsapp-web\.js|stripe)["']\s*\)/i;
const providerClassPattern =
  /\b(?:Baileys|Client|Mailgun|MessageBird|Nexmo|Plivo|PublishCommand|SESClient|SNSClient|SendEmailCommand|Telnyx|Twilio|Vonage|WATIClient|WhatsAppBusiness|WhatsAppCloudApi)\b/;
const envReadPattern =
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bSMS_[A-Z_]*\b|\bTWILIO_[A-Z_]*\b|\bVONAGE_[A-Z_]*\b|\bSNS_[A-Z_]*\b|\bWHATSAPP_[A-Z_]*\b|\bWATI_[A-Z_]*\b|\bMETA_[A-Z_]*\b|\bAWS_ACCESS_KEY_ID\b|\bAWS_SECRET_ACCESS_KEY\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bACCOUNT_SID\b|\bAUTH_TOKEN\b/;
const externalProviderSendPattern =
  /api\.twilio|api\.vonage|api\.messagebird|api\.telnyx|api\.plivo|api\.whatsapp|api\.telegram|graph\.facebook\.com|rest\.nexmo|sns\.[a-z0-9-]+\.amazonaws\.com|\/Messages\.json|\/messages\b|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|sendText\s*\(|messages\.create|client\.messages|publish\s*\(|sns\.publish|createTransport|smtpTransport|sendBeacon|XMLHttpRequest|WebSocket/i;
const externalFetchPattern = /\bfetch\s*\(\s*["'`]https?:\/\//i;
const dbWritePattern = /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i;
const liveTruePattern =
  /sendingEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i;
const unsafeUiPattern =
  /driver_payout|customer_price|payment|paynow|payout|billing|invoice|internal_admin|internal_finance|service_role|secret|token|stripe/i;
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

function countMatches(source, pattern) {
  return [...source.matchAll(pattern)].length;
}

function extractBetween(source, startNeedle, endNeedle, label) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);

  assert.notEqual(start, -1, `Missing ${label} start marker.`);
  assert.notEqual(end, -1, `Missing ${label} end marker.`);

  return source.slice(start, end);
}

function assertNoLiveFlags(value, label) {
  assert.equal(value?.sendingEnabled ?? false, false, `${label} must keep sendingEnabled false.`);
  assert.equal(value?.external_send ?? false, false, `${label} must keep external_send false.`);
  assert.equal(value?.liveSendingEnabled ?? false, false, `${label} must keep liveSendingEnabled false.`);

  if (Object.hasOwn(value || {}, "providerConfigured")) {
    assert.equal(value?.providerConfigured, false, `${label} must keep providerConfigured false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assertNoLiveFlags(value, label);
  assert.equal(value?.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value?.status, "blocked", `${label} must stay blocked.`);

  if (Object.hasOwn(value || {}, "no_op")) {
    assert.equal(value.no_op, true, `${label} must stay no-op.`);
  }
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-copy-multi-channel-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of routeHarnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      emailDisabledSend: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-customer-driver-details-email-send-disabled-setup/route.js",
        ),
      ),
      smsDisabledSend: requireFromHarness(
        path.join(tempDir, "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.js"),
      ),
      whatsappDisabledSend: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.js",
        ),
      ),
    },
  };
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    providerPackageNames.has(packageName),
    false,
    `Customer Copy multi-channel setup must not add provider/payment SDK package: ${packageName}`,
  );
}

const appSource = await readFile(appPagePath, "utf8");
const customerCopySection = extractBetween(
  appSource,
  'data-dispatch-workflow-step="customer-whatsapp-copy"',
  'data-dispatch-workflow-step="driver-dispatch-copy"',
  "Customer Copy section",
);
const appOutsideCustomerCopy = appSource.replace(customerCopySection, "");
const emailHandlerSource = extractBetween(
  appSource,
  "async function checkAdminCustomerDriverDetailsEmailDisabledSend()",
  "async function checkAdminCustomerDriverDetailsMessageDisabledSend",
  "Customer Copy email disabled-send handler",
);
const messageHandlerSource = extractBetween(
  appSource,
  "async function checkAdminCustomerDriverDetailsMessageDisabledSend",
  "const adminCustomerDriverDetailsEmailDisabledSendStateMatchesReference",
  "Customer Copy WhatsApp/SMS disabled-send handler",
);

for (const [label, pattern] of [
  ["email review item", /data-admin-customer-driver-details-email-review-item="true"/g],
  ["email disabled-send action", /data-admin-customer-driver-details-email-disabled-send-action="true"/g],
  ["email disabled-send status", /data-admin-customer-driver-details-email-disabled-send-status="true"/g],
  ["whatsapp disabled-send item", /data-admin-customer-driver-details-whatsapp-disabled-send-item="true"/g],
  ["whatsapp disabled-send action", /data-admin-customer-driver-details-whatsapp-disabled-send-action="true"/g],
  ["whatsapp disabled-send status", /data-admin-customer-driver-details-whatsapp-disabled-send-status="true"/g],
  ["sms disabled-send item", /data-admin-customer-driver-details-sms-disabled-send-item="true"/g],
  ["sms disabled-send action", /data-admin-customer-driver-details-sms-disabled-send-action="true"/g],
  ["sms disabled-send status", /data-admin-customer-driver-details-sms-disabled-send-status="true"/g],
]) {
  assert.equal(countMatches(appSource, pattern), 1, `${label} must exist exactly once.`);
  assert.equal(countMatches(customerCopySection, pattern), 1, `${label} must stay inside Customer Copy.`);
  assert.equal(countMatches(appOutsideCustomerCopy, pattern), 0, `${label} must not appear outside Customer Copy.`);
}

assert.ok(
  customerCopySection.includes("data-admin-customer-driver-details-email-disabled-send-action") &&
    customerCopySection.includes("Customer driver details WhatsApp") &&
    customerCopySection.includes("Customer driver details SMS") &&
    appSource.includes("Review WhatsApp to customer") &&
    appSource.includes("Review SMS to customer") &&
    appSource.includes("Review email to customer"),
  "Customer Copy must include compact Email, WhatsApp, and SMS disabled-send rows.",
);
assert.ok(
  customerCopySection.includes("disabled-send-sending-enabled") &&
    customerCopySection.includes("disabled-send-external-send") &&
    appSource.includes("sendingEnabled false") &&
    appSource.includes("external_send false"),
  "Customer Copy WhatsApp/SMS rows must show setup-only disabled flags.",
);

const dispatchWorkflowSteps = [
  ...appSource.matchAll(/data-dispatch-workflow-step="([^"]+)"/g),
].map((match) => match[1]);
const forbiddenChannelSteps = dispatchWorkflowSteps.filter(
  (step) => /email|sms|whatsapp/i.test(step) && step !== "customer-whatsapp-copy",
);

assert.deepEqual(
  forbiddenChannelSteps,
  [],
  "Customer Copy multi-channel UI must not add standalone Email/WhatsApp/SMS workflow sectors.",
);
assert.equal(
  /<h2[^>]*>\s*(?:Email|WhatsApp|SMS|Customer driver details (?:Email|WhatsApp|SMS))\s*<\/h2>/i.test(
    appOutsideCustomerCopy,
  ),
  false,
  "Customer Copy multi-channel UI must not add standalone Email/WhatsApp/SMS cards.",
);

for (const [label, source] of [
  ["Customer Copy email disabled-send handler", emailHandlerSource],
  ["Customer Copy WhatsApp/SMS disabled-send handler", messageHandlerSource],
  ["Customer Copy section", customerCopySection],
]) {
  assert.equal(providerImportPattern.test(source), false, `${label} must not import provider SDKs.`);
  assert.equal(providerClassPattern.test(source), false, `${label} must not instantiate provider SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${label} must not read provider/env secrets.`);
  assert.equal(externalFetchPattern.test(source), false, `${label} must not fetch external URLs.`);
  assert.equal(externalProviderSendPattern.test(source), false, `${label} must not use provider send APIs.`);
  assert.equal(dbWritePattern.test(source), false, `${label} must not use DB writes.`);
  assert.equal(liveTruePattern.test(source), false, `${label} must not enable live sending flags.`);
  assert.equal(unsafeUiPattern.test(source), false, `${label} must not expose payment, payout, internal, or secret fields.`);
}

for (const handlerSource of [emailHandlerSource, messageHandlerSource]) {
  assert.match(handlerSource, /method:\s*"GET"/, "Customer Copy disabled-send handlers must use GET.");
  assert.equal(
    /method:\s*"(POST|PUT|PATCH|DELETE)"/.test(handlerSource),
    false,
    "Customer Copy disabled-send handlers must not use write methods.",
  );
}

for (const routeFile of routeFiles) {
  const routeSource = await readFile(routeFile, "utf8");

  assert.match(routeSource, /export async function GET/, `${routeFile} must remain GET-only.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(routeSource),
    false,
    `${routeFile} must not expose write/live-send verbs.`,
  );
  assert.equal(providerImportPattern.test(routeSource), false, `${routeFile} must not import provider SDKs.`);
  assert.equal(providerClassPattern.test(routeSource), false, `${routeFile} must not use provider SDK classes.`);
  assert.equal(envReadPattern.test(routeSource), false, `${routeFile} must not read provider/env secrets.`);
  assert.equal(externalFetchPattern.test(routeSource), false, `${routeFile} must not fetch external URLs.`);
  assert.equal(externalProviderSendPattern.test(routeSource), false, `${routeFile} must not use provider send APIs.`);
  assert.equal(dbWritePattern.test(routeSource), false, `${routeFile} must not use DB writes.`);
  assert.equal(liveTruePattern.test(routeSource), false, `${routeFile} must not enable live sending flags.`);
  assert.equal(/stripe|payment|paynow|payout|driver_payout|customer_price/i.test(routeSource), false, `${routeFile} must not add payment or payout behavior.`);
}

const helperSource = (
  await Promise.all(helperFiles.map((file) => readFile(file, "utf8")))
).join("\n");

assert.equal(providerImportPattern.test(helperSource), false, "Customer Copy disabled-send helpers must not import provider SDKs.");
assert.equal(envReadPattern.test(helperSource), false, "Customer Copy disabled-send helpers must not read provider/env secrets.");
assert.equal(externalFetchPattern.test(helperSource), false, "Customer Copy disabled-send helpers must not fetch external URLs.");
assert.equal(externalProviderSendPattern.test(helperSource), false, "Customer Copy disabled-send helpers must not use provider send APIs.");
assert.equal(liveTruePattern.test(helperSource), false, "Customer Copy disabled-send helpers must not enable live sending flags.");

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const emailResponse = await harness.routes.emailDisabledSend.GET(
    new Request(
      apiUrl("/api/admin-customer-driver-details-email-send-disabled-setup", {
        booking_reference: "PLO-MULTI-NO-LIVE-001",
        customer_account_label: "No Live Client",
        customer_email: "EA.Team+NoLive@example.com",
        customer_key: "no-live-client",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        sender_key: "no-live-client-service",
        sender_label: "Prestige No Live Desk",
        sender_role: "account_service",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const email = await emailResponse.json();

  assert.equal(emailResponse.status, 200);
  assert.equal(email.ok, true);
  assertBlockedNoOp(email, "Customer Copy email disabled-send API");
  assertBlockedNoOp(email.send, "Customer Copy email disabled-send nested send");
  assertNoLiveFlags(email.preview, "Customer Copy email disabled-send preview");
  assertNoLiveFlags(email.readiness, "Customer Copy email disabled-send readiness");
  assert.equal(email.readiness.readyToSend, false);

  const whatsappResponse = await harness.routes.whatsappDisabledSend.GET(
    new Request(
      apiUrl("/api/admin-whatsapp-customer-driver-details-send-disabled-setup", {
        booking_reference: "PLO-MULTI-NO-LIVE-002",
        driver_name: "Lim Driver",
        driver_phone: "+65 8777 0000",
        pickup_time: "13 Jun 2026, 09:00",
        route: "Marina Bay Sands to Changi Airport T1",
        vehicle_plate: "SLA4321Z",
        vehicle_type: "Toyota Alphard",
      }),
      { headers: adminHeaders() },
    ),
  );
  const whatsapp = await whatsappResponse.json();

  assert.equal(whatsappResponse.status, 200);
  assert.equal(whatsapp.ok, true);
  assertBlockedNoOp(whatsapp, "Customer Copy WhatsApp disabled-send API");
  assertBlockedNoOp(whatsapp.send, "Customer Copy WhatsApp disabled-send nested send");
  assertBlockedNoOp(whatsapp.result, "Customer Copy WhatsApp disabled-send nested result");
  assertNoLiveFlags(whatsapp.preview, "Customer Copy WhatsApp disabled-send preview");
  assertNoLiveFlags(whatsapp.preview.payload, "Customer Copy WhatsApp disabled-send preview payload");
  assertNoLiveFlags(whatsapp.readiness, "Customer Copy WhatsApp disabled-send readiness");
  assert.equal(whatsapp.send.delivery_surface, "whatsapp_disabled");

  const smsResponse = await harness.routes.smsDisabledSend.GET(
    new Request(
      apiUrl("/api/admin-sms-customer-driver-details-send-disabled-setup", {
        booking_reference: "PLO-MULTI-NO-LIVE-003",
        driver_name: "Ong Driver",
        driver_phone: "+65 8666 0000",
        pickup_time: "14 Jun 2026, 08:00",
        secure_details_link: "https://prestige.example/customer-driver-details/PLO-MULTI-NO-LIVE-003",
        vehicle_plate: "SLA5678Y",
        vehicle_type: "Mercedes E-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const sms = await smsResponse.json();

  assert.equal(smsResponse.status, 200);
  assert.equal(sms.ok, true);
  assertBlockedNoOp(sms, "Customer Copy SMS disabled-send API");
  assertBlockedNoOp(sms.send, "Customer Copy SMS disabled-send nested send");
  assertBlockedNoOp(sms.result, "Customer Copy SMS disabled-send nested result");
  assertNoLiveFlags(sms.preview, "Customer Copy SMS disabled-send preview");
  assertNoLiveFlags(sms.preview.payload, "Customer Copy SMS disabled-send preview payload");
  assertNoLiveFlags(sms.readiness, "Customer Copy SMS disabled-send readiness");
  assert.equal(sms.send.delivery_surface, "sms_disabled");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("Customer Copy multi-channel no-live guard passed");
