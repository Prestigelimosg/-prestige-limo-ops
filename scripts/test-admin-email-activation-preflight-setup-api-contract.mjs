import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-email-activation-preflight-setup/route.ts";
const providerSelectionPath = "lib/admin-email-provider-selection-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/admin-email-send-disabled-adapter.ts",
  "lib/admin-email-notification-setup-foundation.ts",
  "lib/admin-email-provider-readiness-setup-foundation.ts",
  providerSelectionPath,
  "lib/admin-email-recipient-safety-setup-foundation.ts",
  "lib/admin-email-sender-selection-setup-foundation.ts",
  "lib/admin-email-send-policy-setup-foundation.ts",
];
const activationBlockers = ["provider", "env", "approval", "live_sending"];
const safeOutputLeakPattern =
  /driver_payout|paynow|pay_now|customer_price|billing|invoice|payment|payout|finance|internal_admin|internal_finance|admin_note|parser|debug|mock_qa|dev_archive|secret|token|smtp|api_key|access_token/i;
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

function apiUrl(params = {}) {
  const url = new URL("http://localhost/api/admin-email-activation-preflight-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-activation-preflight-api-"));
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
const selectionSource = await readFile(providerSelectionPath, "utf8");
const routeAndSelectionSource = `${routeSource}\n${selectionSource}`;

for (const fragment of [
  "buildAdminEmailProviderSelectionSetup",
  "buildAdminEmailProviderReadinessSetup",
  "prepareDisabledAdminEmailSend",
  "buildAdminEmailNotificationSetupPayload",
  "buildAdminEmailRecipientSafetySetup",
  "buildAdminEmailSenderSelectionSetup",
  "buildAdminEmailSendPolicySetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "activationReady",
  "liveSendingEnabled",
  "sendingEnabled",
  "external_send",
  "providerConfigured",
  "providerSelected",
  "selectedProvider",
  "live_sending",
]) {
  assert.ok(routeSource.includes(fragment), `Missing email activation preflight route fragment: ${fragment}`);
}

for (const fragment of ["resend", "aws_ses", "sendgrid", "mailgun"]) {
  assert.ok(routeAndSelectionSource.includes(fragment), `Missing provider selection fragment: ${fragment}`);
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
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

assert.equal(
  /from\s+["'](?:resend|@aws-sdk|aws-sdk|@sendgrid|mailgun|mailgun\.js|nodemailer)|require\(\s*["'](?:resend|@aws-sdk|aws-sdk|@sendgrid|mailgun|mailgun\.js|nodemailer)|SESClient|SendEmailCommand|sendMail/i.test(routeSource),
  false,
  "Email activation preflight API must not import provider SDKs.",
);

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Email activation preflight API must stay admin-gated.");
  assert.equal(anonymous.activationReady, false);
  assert.equal(anonymous.external_send, false);
  assert.equal(anonymous.liveSendingEnabled, false);
  assert.deepEqual(anonymous.blockers, activationBlockers);
  assert.deepEqual(anonymous.missing_requirements, activationBlockers);
  assert.equal(anonymous.providerConfigured, false);
  assert.equal(anonymous.providerSelected, false);
  assert.equal(anonymous.selectedProvider, null);
  assert.equal(anonymous.sendingEnabled, false);
  assert.equal(anonymous.status, "blocked");

  const defaultResponse = await harness.route.GET(new Request(apiUrl(), { headers: adminHeaders() }));
  const preflight = await defaultResponse.json();

  assert.equal(defaultResponse.status, 200);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.activationReady, false);
  assert.equal(preflight.activationStatus, "blocked");
  assert.deepEqual(preflight.blockers, activationBlockers);
  assert.equal(preflight.external_send, false);
  assert.equal(preflight.liveSendingEnabled, false);
  assert.deepEqual(preflight.missing_requirements, activationBlockers);
  assert.equal(preflight.providerConfigured, false);
  assert.equal(preflight.providerSelected, false);
  assert.equal(preflight.selectedProvider, null);
  assert.equal(preflight.sendingEnabled, false);
  assert.equal(preflight.status, "setup_only");
  assert.equal(preflight.version, "admin-email-activation-preflight-setup-api-v1");
  assert.deepEqual(preflight.componentStatuses, {
    disabledSend: "blocked",
    emailPolicy: "allowed_for_future_setup",
    providerReadiness: "setup_only",
    providerSelection: "not_selected",
  });
  assert.equal(preflight.disabled_send_status, "blocked");
  assert.equal(preflight.policy_decision, "allowed_for_future_setup");
  assert.equal(preflight.readiness.providerConfigured, false);
  assert.equal(preflight.readiness.liveSendingEnabled, false);
  assert.equal(preflight.readiness.external_send, false);
  assert.deepEqual(preflight.readiness.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(preflight.selection.providerSelected, false);
  assert.equal(preflight.selection.providerConfigured, false);
  assert.equal(preflight.selection.liveSendingEnabled, false);
  assert.equal(preflight.selection.external_send, false);
  assert.deepEqual(preflight.selection.missing_requirements, ["provider", "env", "approval"]);

  const selectedResponse = await harness.route.GET(
    new Request(apiUrl({ selected_provider: "resend" }), { headers: adminHeaders() }),
  );
  const selected = await selectedResponse.json();

  assert.equal(selectedResponse.status, 200);
  assert.equal(selected.ok, true);
  assert.equal(selected.activationReady, false);
  assert.deepEqual(selected.blockers, activationBlockers);
  assert.equal(selected.selectedProvider, "resend");
  assert.equal(selected.providerSelected, true);
  assert.equal(selected.providerConfigured, false);
  assert.equal(selected.liveSendingEnabled, false);
  assert.equal(selected.external_send, false);
  assert.equal(selected.sendingEnabled, false);
  assert.deepEqual(selected.selection.missing_requirements, ["env", "approval"]);
  assert.equal(selected.componentStatuses.providerSelection, "disabled");

  const camelCaseResponse = await harness.route.GET(
    new Request(apiUrl({ selectedProvider: "aws-ses" }), { headers: adminHeaders() }),
  );
  const camelCase = await camelCaseResponse.json();

  assert.equal(camelCaseResponse.status, 200);
  assert.equal(camelCase.selectedProvider, "aws_ses");
  assert.equal(camelCase.providerSelected, true);
  assert.equal(camelCase.providerConfigured, false);
  assert.equal(camelCase.liveSendingEnabled, false);
  assert.equal(camelCase.external_send, false);
  assert.deepEqual(camelCase.blockers, activationBlockers);

  const invalidResponse = await harness.route.GET(
    new Request(apiUrl({ selected_provider: "smtp-secret-provider" }), { headers: adminHeaders() }),
  );
  const invalid = await invalidResponse.json();

  assert.equal(invalidResponse.status, 200);
  assert.equal(invalid.activationReady, false);
  assert.equal(invalid.selectedProvider, null);
  assert.equal(invalid.providerSelected, false);
  assert.equal(invalid.providerConfigured, false);
  assert.equal(invalid.liveSendingEnabled, false);
  assert.equal(invalid.external_send, false);
  assert.deepEqual(invalid.blockers, activationBlockers);
  assert.deepEqual(invalid.selection.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(invalid)),
    false,
    "Email activation preflight API output must not leak unsafe provider/env/payment text.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin email activation preflight setup API contract passed");
