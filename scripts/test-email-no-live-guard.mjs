import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

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
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const runtimeGateHelperFile = "lib/admin-customer-driver-details-email-send-action.ts";
const routeHarnessFiles = [...routeFiles, boundaryFile, runtimeGateHelperFile, ...helperFiles];
const providerPackageNames = new Set([
  "@aws-sdk/client-ses",
  "@sendgrid/mail",
  "@sendgrid/client",
  "aws-sdk",
  "mailgun.js",
  "mailgun-js",
  "nodemailer",
  "postmark",
  "resend",
]);
const providerSdkImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:resend|@aws-sdk\/client-ses|aws-sdk|@sendgrid\/mail|@sendgrid\/client|mailgun|mailgun-js|mailgun\.js|nodemailer|postmark)["']|require\(\s*["'](?:resend|@aws-sdk\/client-ses|aws-sdk|@sendgrid\/mail|@sendgrid\/client|mailgun|mailgun-js|mailgun\.js|nodemailer|postmark)["']\s*\)/i;
const providerSdkClassPattern =
  /\b(?:SESClient|SendEmailCommand|MailService|Mailgun|ServerClient)\b/;
const envReadPattern =
  /\bprocess\.env\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b|\bSENDGRID_[A-Z_]*\b|\bMAILGUN_[A-Z_]*\b|\bRESEND_[A-Z_]*\b|\bAWS_ACCESS_KEY_ID\b|\bAWS_SECRET_ACCESS_KEY\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b/i;
const externalSendPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|createTransport|smtpTransport|sendMail\s*\(|messages\.send|transporter\.sendMail/i;
const dbWritePattern = /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i;
const liveTruePattern =
  /sendingEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true/i;
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED:
    process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED,
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
  delete process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED;
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

function assertBlockedFlags(value, label, { requireLiveFlag = false } = {}) {
  assert.equal(value?.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
  assert.equal(value?.external_send, false, `${label} must keep external_send false.`);

  if (requireLiveFlag || Object.hasOwn(value || {}, "liveSendingEnabled")) {
    assert.equal(value?.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-email-no-live-guard-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of routeHarnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-details-email-send-audit-payload-setup-foundation.js"),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledAdapter: requireFromHarness(path.join(tempDir, "lib/admin-email-send-disabled-adapter.js")),
    notification: requireFromHarness(path.join(tempDir, "lib/admin-email-notification-setup-foundation.js")),
    policy: requireFromHarness(path.join(tempDir, "lib/admin-email-send-policy-setup-foundation.js")),
    providerReadiness: requireFromHarness(
      path.join(tempDir, "lib/admin-email-provider-readiness-setup-foundation.js"),
    ),
    readiness: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-details-email-readiness-setup-foundation.js"),
    ),
    recipient: requireFromHarness(path.join(tempDir, "lib/admin-email-recipient-safety-setup-foundation.js")),
    routes: {
      activationPreflight: requireFromHarness(
        path.join(tempDir, "app/api/admin-email-activation-preflight-setup/route.js"),
      ),
      disabledSend: requireFromHarness(
        path.join(tempDir, "app/api/admin-customer-driver-details-email-send-disabled-setup/route.js"),
      ),
      previewReadiness: requireFromHarness(
        path.join(tempDir, "app/api/admin-customer-driver-details-email-preview-readiness-setup/route.js"),
      ),
      providerReadiness: requireFromHarness(
        path.join(tempDir, "app/api/admin-email-provider-readiness-setup/route.js"),
      ),
    },
    sender: requireFromHarness(path.join(tempDir, "lib/admin-email-sender-selection-setup-foundation.js")),
    template: requireFromHarness(path.join(tempDir, "lib/customer-driver-details-email-setup-foundation.js")),
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
    `Email setup must not add provider SDK package: ${packageName}`,
  );
}

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only setup route.`);
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(source), false, `${routeFile} must not expose write/live-send verbs.`);
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerSdkImportPattern.test(source), false, `${file} must not import provider SDKs.`);
  assert.equal(providerSdkClassPattern.test(source), false, `${file} must not use provider SDK classes.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read provider/env secrets.`);
  assert.equal(externalSendPattern.test(source), false, `${file} must not use external/live send APIs.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable live email flags.`);
}

const selectionSource = await readFile("lib/admin-email-provider-selection-setup-foundation.ts", "utf8");

for (const providerOption of ["resend", "aws_ses", "sendgrid", "mailgun"]) {
  assert.ok(selectionSource.includes(providerOption), `Setup-only provider option must remain allowed: ${providerOption}.`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildCustomerDriverDetailsEmailSendAuditPayloadSetup } = harness.auditPayload;
  const { prepareDisabledAdminEmailSend } = harness.disabledAdapter;
  const { buildAdminEmailNotificationSetupPayload } = harness.notification;
  const { buildAdminEmailSendPolicySetup } = harness.policy;
  const { buildAdminEmailProviderReadinessSetup } = harness.providerReadiness;
  const { buildCustomerDriverDetailsEmailReadinessSetup } = harness.readiness;
  const { buildAdminEmailRecipientSafetySetup } = harness.recipient;
  const { buildAdminEmailSenderSelectionSetup } = harness.sender;
  const { buildCustomerDriverDetailsEmailSetup } = harness.template;

  const template = buildCustomerDriverDetailsEmailSetup({
    booking_reference: "PLO-NO-LIVE-001",
    customer_email: "EA.Team+NoLive@example.com",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });
  const recipient = buildAdminEmailRecipientSafetySetup({
    booking_reference: template.payload.booking_reference,
    customer_account_label: "No Live Client",
    recipient_email: template.payload.customer_email,
  });
  const sender = buildAdminEmailSenderSelectionSetup({
    customer_key: "no-live-client",
    profiles: [
      {
        customer_keys: ["no-live-client"],
        is_default: true,
        sender_key: "no-live-client-service",
        sender_label: "Prestige No Live Desk",
        sender_role: "account_service",
      },
    ],
  });
  const notification = buildAdminEmailNotificationSetupPayload({
    body_lines: template.template.body_lines,
    booking_reference: template.payload.booking_reference,
    event_key: "customer-driver-details-no-live-001",
    notification_type: "customer_driver_details",
    preview_text: template.template.preview_text,
    recipient_role: "customer",
    subject: template.template.subject,
  });
  const policy = buildAdminEmailSendPolicySetup({ notification, recipient, sender });
  const readiness = buildCustomerDriverDetailsEmailReadinessSetup({
    policy,
    recipient,
    sender,
    template,
  });
  const disabledSend = prepareDisabledAdminEmailSend({
    body_lines: template.template.body_lines,
    booking_reference: template.payload.booking_reference,
    recipient_email: template.payload.customer_email,
    sender_key: sender.selected_sender.sender_key,
    subject: template.template.subject,
    template_key: template.template.template_key,
  });
  const providerReadiness = buildAdminEmailProviderReadinessSetup({
    disabledSend,
    policy,
  });
  const auditPayload = buildCustomerDriverDetailsEmailSendAuditPayloadSetup({
    actionSource: "customer_copy_disabled_send_button",
    disabledSend,
    policy,
    readiness,
    template,
  });

  assertBlockedFlags(template, "Customer driver-details email template");
  assertBlockedFlags(policy, "Email send policy");
  assertBlockedFlags(readiness, "Customer driver-details email readiness");
  assert.equal(readiness.readyToSend, false, "Customer driver-details email readiness must not become readyToSend.");
  assertBlockedFlags(disabledSend, "Disabled email send adapter");
  assert.equal(disabledSend.status, "blocked");
  assert.equal(disabledSend.reason, "setup_only_disabled");
  assertBlockedFlags(providerReadiness, "Provider readiness helper", { requireLiveFlag: true });
  assert.equal(providerReadiness.providerConfigured, false);
  assertBlockedFlags(auditPayload, "Customer driver-details email send audit payload", { requireLiveFlag: true });
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.blocked_no_op_result.no_op, true);

  const disabledApiResponse = await harness.routes.disabledSend.GET(
    new Request(
      apiUrl("/api/admin-customer-driver-details-email-send-disabled-setup", {
        booking_reference: "PLO-NO-LIVE-001",
        customer_email: "EA.Team+NoLive@example.com",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        sender_key: "no-live-client-service",
        sender_label: "Prestige No Live Desk",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabledApi = await disabledApiResponse.json();

  assert.equal(disabledApiResponse.status, 200);
  assertBlockedFlags(disabledApi, "Disabled customer driver-details email send API");
  assertBlockedFlags(disabledApi.send, "Disabled customer driver-details email send API nested send");
  assertBlockedFlags(disabledApi.readiness, "Disabled customer driver-details email send API nested readiness");
  assert.equal(disabledApi.status, "blocked");

  const previewApiResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-customer-driver-details-email-preview-readiness-setup", {
        booking_reference: "PLO-NO-LIVE-001",
        customer_email: "EA.Team+NoLive@example.com",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        sender_key: "no-live-client-service",
        sender_label: "Prestige No Live Desk",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const previewApi = await previewApiResponse.json();

  assert.equal(previewApiResponse.status, 200);
  assertBlockedFlags(previewApi.preview, "Customer driver-details email preview API preview");
  assertBlockedFlags(previewApi.readiness, "Customer driver-details email preview API readiness");
  assert.equal(previewApi.readiness.readyToSend, false);

  const providerApiResponse = await harness.routes.providerReadiness.GET(
    new Request(apiUrl("/api/admin-email-provider-readiness-setup"), { headers: adminHeaders() }),
  );
  const providerApi = await providerApiResponse.json();

  assert.equal(providerApiResponse.status, 200);
  assertBlockedFlags(providerApi, "Email provider readiness API", { requireLiveFlag: true });
  assert.equal(providerApi.providerConfigured, false);
  assert.deepEqual(providerApi.missing_requirements, ["provider", "env", "approval"]);

  const preflightApiResponse = await harness.routes.activationPreflight.GET(
    new Request(apiUrl("/api/admin-email-activation-preflight-setup"), { headers: adminHeaders() }),
  );
  const preflightApi = await preflightApiResponse.json();

  assert.equal(preflightApiResponse.status, 200);
  assert.equal(preflightApi.activationReady, false);
  assert.equal(preflightApi.driverDetailsEmailSendGateOpen, false);
  assertBlockedFlags(preflightApi, "Email activation preflight API", { requireLiveFlag: true });
  assert.equal(preflightApi.providerConfigured, false);
  assert.deepEqual(preflightApi.blockers, ["provider", "env", "approval", "live_sending"]);
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("email no-live guard passed");
