import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-sms-customer-driver-details-preview-readiness-setup/route.ts",
  "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/sms-customer-driver-details-setup-foundation.ts",
  "lib/sms-customer-driver-details-send-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const routeHarnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "sms_customer",
  "sms_disabled",
  "sms_customer_driver_details_setup_only",
  "sms_customer_driver_details_send_audit_payload_setup_only",
  "customer_assigned_driver_details_sms",
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
const unsafeOutputPattern =
  /driver_payout|customer_price|payment|invoice|paynow|payout|finance|internal_admin|internal_finance|token|secret|api\.twilio|api\.vonage|messagebird|sendMessage|sendSms/i;
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

function assertNoLiveFlags(value, label, { requireLiveFlag = false } = {}) {
  assert.equal(value?.sendingEnabled, false, `${label} must keep sendingEnabled false.`);
  assert.equal(value?.external_send, false, `${label} must keep external_send false.`);
  assert.equal(value?.providerConfigured, false, `${label} must keep providerConfigured false.`);

  if (requireLiveFlag || Object.hasOwn(value || {}, "liveSendingEnabled")) {
    assert.equal(value?.liveSendingEnabled, false, `${label} must keep liveSendingEnabled false.`);
  } else {
    assert.equal(value?.liveSendingEnabled ?? false, false, `${label} must not enable liveSendingEnabled.`);
  }
}

function assertBlockedNoOp(value, label) {
  assertNoLiveFlags(value, label, { requireLiveFlag: true });
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-sms-no-live-guard-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of routeHarnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    auditPayload: requireFromHarness(
      path.join(
        tempDir,
        "lib/sms-customer-driver-details-send-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      disabledSend: requireFromHarness(
        path.join(tempDir, "app/api/admin-sms-customer-driver-details-send-disabled-setup/route.js"),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-sms-customer-driver-details-preview-readiness-setup/route.js",
        ),
      ),
    },
    setup: requireFromHarness(
      path.join(tempDir, "lib/sms-customer-driver-details-setup-foundation.js"),
    ),
  };
}

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const installedPackages = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.devDependencies || {}),
];

for (const packageName of installedPackages) {
  assert.equal(
    smsProviderPackageNames.has(packageName),
    false,
    `SMS setup must not add provider SDK package: ${packageName}`,
  );
}

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only setup route.`);
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(source), false, `${routeFile} must not expose write/live-send verbs.`);
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(smsProviderImportPattern.test(source), false, `${file} must not import SMS provider SDKs.`);
  assert.equal(smsProviderClassPattern.test(source), false, `${file} must not use SMS provider SDK classes.`);
  assert.equal(smsEnvPattern.test(source), false, `${file} must not read SMS provider/env secrets.`);
  assert.equal(smsApiPattern.test(source), false, `${file} must not include SMS API URLs.`);
  assert.equal(externalSendPattern.test(source), false, `${file} must not use external SMS send APIs.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable live SMS flags.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only SMS/channel string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildSmsCustomerDriverDetailsSendAuditPayloadSetup } = harness.auditPayload;
  const { buildSmsCustomerDriverDetailsSetup } = harness.setup;
  const setup = buildSmsCustomerDriverDetailsSetup({
    booking_reference: "PLO-SMS-NO-LIVE-001",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-NO-LIVE-001",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assertNoLiveFlags(setup, "SMS customer driver-details setup helper", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(setup.payload, "SMS customer driver-details setup payload", {
    requireLiveFlag: true,
  });
  assert.equal(setup.channel, "sms_customer");
  assert.equal(setup.customerMessageReady, true);
  assert.equal(setup.smsMessageReady, true);
  assert.deepEqual(setup.missing_requirements, []);

  const previewApiResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-sms-customer-driver-details-preview-readiness-setup", {
        booking_reference: "PLO-SMS-NO-LIVE-001",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-NO-LIVE-001",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const previewApi = await previewApiResponse.json();

  assert.equal(previewApiResponse.status, 200);
  assertNoLiveFlags(previewApi, "SMS preview/readiness API", { requireLiveFlag: true });
  assertNoLiveFlags(previewApi.preview, "SMS preview/readiness API preview", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(previewApi.preview.payload, "SMS preview/readiness API payload", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(previewApi.readiness, "SMS preview/readiness API readiness", {
    requireLiveFlag: true,
  });
  assert.equal(previewApi.readiness.customerMessageReady, true);
  assert.equal(previewApi.readiness.smsMessageReady, true);
  assert.deepEqual(previewApi.readiness.missing_requirements, []);

  const disabledApiResponse = await harness.routes.disabledSend.GET(
    new Request(
      apiUrl("/api/admin-sms-customer-driver-details-send-disabled-setup", {
        booking_reference: "PLO-SMS-NO-LIVE-002",
        driver_name: "Lim Driver",
        driver_phone: "+65 8777 0000",
        pickup_time: "13 Jun 2026, 09:00",
        secure_details_link: "https://prestige.example/customer-driver-details/PLO-SMS-NO-LIVE-002",
        vehicle_plate: "SLA4321Z",
        vehicle_type: "Toyota Alphard",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabledApi = await disabledApiResponse.json();

  assert.equal(disabledApiResponse.status, 200);
  assertNoLiveFlags(disabledApi, "Disabled SMS customer driver-details send API", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(disabledApi.readiness, "Disabled SMS send API readiness", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(disabledApi.preview, "Disabled SMS send API preview", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(disabledApi.preview.payload, "Disabled SMS send API preview payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(disabledApi.send, "Disabled SMS send API nested send");
  assertBlockedNoOp(disabledApi.result, "Disabled SMS send API nested result");
  assert.equal(disabledApi.status, "blocked");
  assert.equal(disabledApi.send.delivery_surface, "sms_disabled");

  const auditPayload = buildSmsCustomerDriverDetailsSendAuditPayloadSetup({
    actionSource: "disabled_send_api",
    customerPhone: "+65 9123 4567",
    messageTarget: "Primary passenger SMS",
    setup,
  });

  assertNoLiveFlags(auditPayload, "SMS customer driver-details audit payload", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(auditPayload.audit_payload, "SMS customer driver-details nested audit payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "SMS audit blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "SMS nested audit result");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.audit_payload.auditWriteEnabled, false);
  assert.equal(auditPayload.disabled_send_status, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);

  const unsafeAuditPayload = buildSmsCustomerDriverDetailsSendAuditPayloadSetup({
    actionSource: "payment-token",
    booking_reference: "payment-token",
    customerPhone: "customer_price token",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    messageTarget: "invoice secret",
    pickup_time: "10:00",
    secure_details_link: "https://prestige.example/customer-driver-details/payment-token",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
  });

  assertNoLiveFlags(unsafeAuditPayload, "Unsafe SMS customer driver-details audit payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe SMS audit blocked result");
  assert.equal(unsafeAuditPayload.auditWriteEnabled, false);
  assert.equal(unsafeAuditPayload.audit_write_enabled, false);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingReference, null);
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "booking_reference",
  ]);
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(unsafeAuditPayload)),
    false,
    "SMS no-live guard output must not leak unsafe input, provider, payment, payout, token, or secret details.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("SMS customer driver-details no-live guard passed");
