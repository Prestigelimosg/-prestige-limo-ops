import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-email-provider-readiness-setup/route.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-provider-readiness-setup-foundation.ts",
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
];
const safeOutputLeakPattern =
  /driver_payout|paynow|pay_now|customer_price|billing|invoice|payment|payout|finance|internal_admin|internal_finance|admin_note|parser|debug|mock_qa|dev_archive|secret|token|smtp|sendgrid|mailgun|postmark|resend/i;
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

function apiUrl() {
  return "http://localhost/api/admin-email-provider-readiness-setup";
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-provider-readiness-api-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const routeSource = await readFile(routePath, "utf8");

for (const fragment of [
  "buildAdminEmailProviderReadinessSetup",
  "prepareDisabledAdminEmailSend",
  "buildAdminEmailNotificationSetupPayload",
  "buildAdminEmailRecipientSafetySetup",
  "buildAdminEmailSenderSelectionSetup",
  "buildAdminEmailSendPolicySetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "providerConfigured",
  "liveSendingEnabled",
  "external_send",
  "provider",
  "env",
  "approval",
]) {
  assert.ok(routeSource.includes(fragment), `Missing provider readiness route fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "fetch(",
  "XMLHttpRequest",
  "WebSocket",
  "sendBeacon",
  "createClient",
  "supabase",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "nodemailer",
  "sendgrid",
  "mailgun",
  "postmark",
  "resend",
  "amazonses",
  "sendMail",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Email provider readiness API must stay admin-gated.");
  assert.equal(anonymous.external_send, false);
  assert.equal(anonymous.liveSendingEnabled, false);
  assert.deepEqual(anonymous.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(anonymous.providerConfigured, false);
  assert.equal(anonymous.sendingEnabled, false);
  assert.equal(anonymous.status, "blocked");

  const readyResponse = await harness.route.GET(new Request(apiUrl(), { headers: adminHeaders() }));
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.disabled_send_status, "blocked");
  assert.equal(ready.external_send, false);
  assert.equal(ready.liveSendingEnabled, false);
  assert.deepEqual(ready.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(ready.policy_decision, "allowed_for_future_setup");
  assert.deepEqual(ready.provider, {
    approval_status: "missing",
    env_status: "missing",
    provider_status: "missing",
  });
  assert.equal(ready.providerConfigured, false);
  assert.equal(ready.sendingEnabled, false);
  assert.equal(ready.status, "setup_only");
  assert.equal(ready.version, "admin-email-provider-readiness-setup-foundation-v1");
  assert.deepEqual(ready.readiness, {
    delivery_surface: "email_provider_readiness_setup_only",
    disabled_send_status: "blocked",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: ["provider", "env", "approval"],
    policy_decision: "allowed_for_future_setup",
    provider: {
      approval_status: "missing",
      env_status: "missing",
      provider_status: "missing",
    },
    providerConfigured: false,
    readyForFutureProviderSetup: false,
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-provider-readiness-setup-foundation-v1",
  });
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(ready)),
    false,
    "Email provider readiness API output must not leak provider tokens, payment, payout, or internals.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin email provider readiness setup API contract passed");
