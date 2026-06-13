import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-whatsapp-customer-driver-details-preview-readiness-setup/route.ts",
  "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/admin-whatsapp-message-disabled-adapter.ts",
  "lib/customer-driver-details-email-setup-foundation.ts",
  "lib/whatsapp-customer-driver-details-setup-foundation.ts",
  "lib/whatsapp-customer-driver-details-send-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const routeHarnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "whatsapp_customer",
  "whatsapp_disabled",
  "whatsapp_customer_driver_details_setup_only",
  "whatsapp_customer_driver_details_send_audit_payload_setup_only",
];
const whatsAppProviderPackageNames = new Set([
  "@green-api/whatsapp-api-client",
  "@twilio/conversations",
  "@whiskeysockets/baileys",
  "360dialog",
  "messagebird",
  "twilio",
  "vonage",
  "wati",
  "whatsapp",
  "whatsapp-cloud-api",
  "whatsapp-web.js",
]);
const whatsAppProviderImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@green-api\/whatsapp-api-client|@twilio\/conversations|@whiskeysockets\/baileys|360dialog|messagebird|twilio|vonage|wati|whatsapp|whatsapp-cloud-api|whatsapp-web\.js)["']|require\(\s*["'](?:@green-api\/whatsapp-api-client|@twilio\/conversations|@whiskeysockets\/baileys|360dialog|messagebird|twilio|vonage|wati|whatsapp|whatsapp-cloud-api|whatsapp-web\.js)["']\s*\)/i;
const whatsAppProviderClassPattern =
  /\b(?:Baileys|Client|MessageBird|MessagingResponse|Twilio|Vonage|WATIClient|WhatsAppBusiness|WhatsAppCloudApi)\b/;
const whatsAppEnvPattern =
  /\bprocess\.env\b|ACCESS_TOKEN|PHONE_NUMBER_ID|WHATSAPP_[A-Z_]*|WATI_[A-Z_]*|TWILIO_[A-Z_]*|META_[A-Z_]*|API_KEY|SECRET_KEY/;
const whatsAppApiPattern =
  /graph\.facebook\.com|api\.whatsapp|whatsapp\.com|wa\.me|\/messages\b|\/message_templates\b/i;
const externalSendPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|sendMessage\s*\(|send_message\s*\(|messages\.create|client\.messages|request\s*\(/i;
const dbWritePattern = /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i;
const liveTruePattern =
  /sendingEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true|liveSendingEnabled\s*[:=]\s*true|providerConfigured\s*[:=]\s*true/i;
const unsafeOutputPattern =
  /driver_payout|customer_price|payment|invoice|paynow|payout|finance|internal_admin|internal_finance|token|secret|graph\.facebook|api\.whatsapp|sendMessage/i;
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-whatsapp-no-live-guard-"));
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
        "lib/whatsapp-customer-driver-details-send-audit-payload-setup-foundation.js",
      ),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      disabledSend: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-whatsapp-customer-driver-details-send-disabled-setup/route.js",
        ),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-whatsapp-customer-driver-details-preview-readiness-setup/route.js",
        ),
      ),
    },
    setup: requireFromHarness(
      path.join(tempDir, "lib/whatsapp-customer-driver-details-setup-foundation.js"),
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
    whatsAppProviderPackageNames.has(packageName),
    false,
    `WhatsApp setup must not add provider SDK package: ${packageName}`,
  );
}

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only setup route.`);
  assert.equal(/export async function (POST|PUT|PATCH|DELETE)/.test(source), false, `${routeFile} must not expose write/live-send verbs.`);
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(whatsAppProviderImportPattern.test(source), false, `${file} must not import WhatsApp provider SDKs.`);
  assert.equal(whatsAppProviderClassPattern.test(source), false, `${file} must not use WhatsApp provider SDK classes.`);
  assert.equal(whatsAppEnvPattern.test(source), false, `${file} must not read WhatsApp provider/env secrets.`);
  assert.equal(whatsAppApiPattern.test(source), false, `${file} must not include WhatsApp API URLs.`);
  assert.equal(externalSendPattern.test(source), false, `${file} must not use external WhatsApp send APIs.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable live WhatsApp flags.`);
}

const setupSource = await readFile("lib/whatsapp-customer-driver-details-setup-foundation.ts", "utf8");
const auditSource = await readFile(
  "lib/whatsapp-customer-driver-details-send-audit-payload-setup-foundation.ts",
  "utf8",
);

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    `${setupSource}\n${auditSource}`.includes(setupOnlyString),
    `Setup-only WhatsApp/channel string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildWhatsAppCustomerDriverDetailsSendAuditPayloadSetup } = harness.auditPayload;
  const { buildWhatsAppCustomerDriverDetailsSetup } = harness.setup;
  const setup = buildWhatsAppCustomerDriverDetailsSetup({
    booking_reference: "PLO-WA-NO-LIVE-001",
    driver_name: "Tan Driver",
    driver_phone: "+65 8888 0000",
    pickup_time: "12 Jun 2026, 10:00",
    route: "Changi Airport T3 to Raffles Hotel",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes V-Class",
  });

  assertNoLiveFlags(setup, "WhatsApp customer driver-details setup helper", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(setup.payload, "WhatsApp customer driver-details setup payload", {
    requireLiveFlag: true,
  });
  assert.equal(setup.disabled_message.delivery_surface, "whatsapp_disabled");
  assert.equal(setup.disabled_message.external_send, false);
  assert.equal(setup.disabled_message.status, "disabled");
  assert.equal(setup.customerMessageReady, true);
  assert.deepEqual(setup.missing_requirements, []);

  const previewApiResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-whatsapp-customer-driver-details-preview-readiness-setup", {
        booking_reference: "PLO-WA-NO-LIVE-001",
        driver_name: "Tan Driver",
        driver_phone: "+65 8888 0000",
        pickup_time: "12 Jun 2026, 10:00",
        route: "Changi Airport T3 to Raffles Hotel",
        vehicle_plate: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      }),
      { headers: adminHeaders() },
    ),
  );
  const previewApi = await previewApiResponse.json();

  assert.equal(previewApiResponse.status, 200);
  assertNoLiveFlags(previewApi, "WhatsApp preview/readiness API", { requireLiveFlag: true });
  assertNoLiveFlags(previewApi.preview, "WhatsApp preview/readiness API preview", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(previewApi.preview.payload, "WhatsApp preview/readiness API payload", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(previewApi.readiness, "WhatsApp preview/readiness API readiness", {
    requireLiveFlag: true,
  });
  assert.equal(previewApi.readiness.customerMessageReady, true);
  assert.deepEqual(previewApi.readiness.missing_requirements, []);
  assert.equal(previewApi.preview.disabled_message.external_send, false);
  assert.equal(previewApi.preview.disabled_message.status, "disabled");

  const disabledApiResponse = await harness.routes.disabledSend.GET(
    new Request(
      apiUrl("/api/admin-whatsapp-customer-driver-details-send-disabled-setup", {
        booking_reference: "PLO-WA-NO-LIVE-002",
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
  const disabledApi = await disabledApiResponse.json();

  assert.equal(disabledApiResponse.status, 200);
  assertNoLiveFlags(disabledApi, "Disabled WhatsApp customer driver-details send API", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(disabledApi.readiness, "Disabled WhatsApp send API readiness", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(disabledApi.preview, "Disabled WhatsApp send API preview", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(disabledApi.send, "Disabled WhatsApp send API nested send");
  assertBlockedNoOp(disabledApi.result, "Disabled WhatsApp send API nested result");
  assert.equal(disabledApi.status, "blocked");
  assert.equal(disabledApi.send.disabled_message.external_send, false);
  assert.equal(disabledApi.send.disabled_message.status, "disabled");

  const auditPayload = buildWhatsAppCustomerDriverDetailsSendAuditPayloadSetup({
    actionSource: "disabled_send_api",
    customerPhone: "+65 9123 4567",
    messageTarget: "Primary passenger WhatsApp",
    setup,
  });

  assertNoLiveFlags(auditPayload, "WhatsApp customer driver-details audit payload", {
    requireLiveFlag: true,
  });
  assertNoLiveFlags(auditPayload.audit_payload, "WhatsApp customer driver-details nested audit payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "WhatsApp audit blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "WhatsApp nested audit result");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_write_enabled, false);
  assert.equal(auditPayload.audit_payload.auditWriteEnabled, false);
  assert.equal(auditPayload.disabled_send_status, "blocked");
  assert.deepEqual(auditPayload.missing_requirements, []);

  const unsafeAuditPayload = buildWhatsAppCustomerDriverDetailsSendAuditPayloadSetup({
    actionSource: "payment-token",
    booking_reference: "payment-token",
    customerPhone: "customer_price token",
    driver_name: "driver_payout",
    driver_phone: "billing_amount",
    messageTarget: "invoice secret",
    pickup_time: "10:00",
    route: "internal_finance_note",
    vehicle_plate: "SLA1234X",
    vehicle_type: "Mercedes",
  });

  assertNoLiveFlags(unsafeAuditPayload, "Unsafe WhatsApp customer driver-details audit payload", {
    requireLiveFlag: true,
  });
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe WhatsApp audit blocked result");
  assert.equal(unsafeAuditPayload.auditWriteEnabled, false);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.bookingReference, null);
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "action_source",
    "booking_reference",
  ]);
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(unsafeAuditPayload)),
    false,
    "WhatsApp no-live guard output must not leak unsafe input, provider, payment, payout, token, or secret details.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("WhatsApp customer driver-details no-live guard passed");
