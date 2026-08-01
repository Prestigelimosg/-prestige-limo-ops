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
  "lib/admin-customer-driver-details-email-send-action.ts",
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
  PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED:
    process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED,
  PRESTIGE_EMAIL_PROVIDER: process.env.PRESTIGE_EMAIL_PROVIDER,
  PRESTIGE_DRIVER_DETAILS_EMAIL_FROM: process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_FROM,
  PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO:
    process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO,
  PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST:
    process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
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
  delete process.env.PRESTIGE_EMAIL_PROVIDER;
  delete process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_FROM;
  delete process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO;
  delete process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST;
  delete process.env.RESEND_API_KEY;
}

function applyReadyEmailConfiguration() {
  process.env.PRESTIGE_EMAIL_PROVIDER = "resend";
  process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_FROM =
    "Prestige Limo Dispatch <info@prestigelimo.sg>";
  process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_REPLY_TO = "info@prestigelimo.sg";
  process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_STAGING_RECIPIENT_ALLOWLIST =
    "info@prestigelimo.sg";
  process.env.RESEND_API_KEY = "test-resend-configured-value";
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
  "driverDetailsEmailSendGateOpen",
  "senderMatched",
  "replyToMatched",
  "recipientAllowlistConfigured",
  "providerCredentialConfigured",
  "configurationReady",
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

  assert.equal(anonymousResponse.status, 403, "Email activation preflight API must stay anonymous-gated.");
  assert.equal(anonymous.activationReady, false);
  assert.equal(anonymous.driverDetailsEmailSendGateOpen, false);
  assert.equal(anonymous.external_send, false);
  assert.equal(anonymous.liveSendingEnabled, false);
  assert.deepEqual(anonymous.blockers, activationBlockers);
  assert.deepEqual(anonymous.missing_requirements, activationBlockers);
  assert.equal(anonymous.providerConfigured, false);
  assert.equal(anonymous.providerSelected, false);
  assert.equal(anonymous.selectedProvider, null);
  assert.equal(anonymous.sendingEnabled, false);
  assert.equal(anonymous.status, "blocked");

  const crossOriginResponse = await harness.route.GET(
    new Request(apiUrl(), {
      headers: {
        referer: "http://evil.example/",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
    }),
  );
  const crossOrigin = await crossOriginResponse.json();

  assert.equal(crossOriginResponse.status, 403, "Email activation preflight API must stay cross-origin gated.");
  assert.equal(crossOrigin.activationReady, false);
  assert.equal(crossOrigin.driverDetailsEmailSendGateOpen, false);
  assert.equal(crossOrigin.external_send, false);
  assert.equal(crossOrigin.liveSendingEnabled, false);
  assert.equal(crossOrigin.providerConfigured, false);
  assert.equal(crossOrigin.sendingEnabled, false);
  assert.equal(crossOrigin.status, "blocked");

  process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED = "true";
  const setupOnlyDashboardResponse = await harness.route.GET(
    new Request(apiUrl(), { headers: adminHeaders() }),
  );
  const setupOnlyDashboard = await setupOnlyDashboardResponse.json();

  assert.equal(
    setupOnlyDashboardResponse.status,
    200,
    "Email activation preflight setup-only admin dashboard read must avoid staging 403 noise.",
  );
  assert.equal(setupOnlyDashboard.ok, true);
  assert.equal(setupOnlyDashboard.activationReady, false);
  assert.equal(setupOnlyDashboard.driverDetailsEmailSendGateOpen, false);
  assert.equal(setupOnlyDashboard.activationStatus, "blocked");
  assert.deepEqual(setupOnlyDashboard.blockers, activationBlockers);
  assert.equal(setupOnlyDashboard.external_send, false);
  assert.equal(setupOnlyDashboard.liveSendingEnabled, false);
  assert.equal(setupOnlyDashboard.providerConfigured, false);
  assert.equal(setupOnlyDashboard.providerSelected, false);
  assert.equal(setupOnlyDashboard.sendingEnabled, false);
  assert.equal(setupOnlyDashboard.status, "blocked");
  applyLocalAdminBoundary();

  const defaultResponse = await harness.route.GET(new Request(apiUrl(), { headers: adminHeaders() }));
  const preflight = await defaultResponse.json();

  assert.equal(defaultResponse.status, 200);
  assert.equal(preflight.ok, true);
  assert.equal(preflight.activationReady, false);
  assert.equal(preflight.driverDetailsEmailSendGateOpen, false);
  assert.equal(preflight.activationStatus, "blocked");
  assert.deepEqual(preflight.blockers, activationBlockers);
  assert.equal(preflight.external_send, false);
  assert.equal(preflight.liveSendingEnabled, false);
  assert.deepEqual(preflight.missing_requirements, activationBlockers);
  assert.equal(preflight.providerConfigured, false);
  assert.equal(preflight.providerSelected, false);
  assert.equal(preflight.selectedProvider, null);
  assert.equal(preflight.senderMatched, false);
  assert.equal(preflight.replyToMatched, false);
  assert.equal(preflight.recipientAllowlistConfigured, false);
  assert.equal(preflight.providerCredentialConfigured, false);
  assert.equal(preflight.configurationReady, false);
  assert.equal(preflight.sendingEnabled, false);
  assert.equal(preflight.status, "blocked");
  assert.equal(preflight.version, "admin-email-activation-preflight-setup-api-v1");
  assert.deepEqual(preflight.componentStatuses, {
    disabledSend: "blocked",
    emailPolicy: "allowed_for_future_setup",
    providerReadiness: "blocked",
    providerSelection: "not_selected",
  });
  assert.equal(preflight.disabled_send_status, "blocked");
  assert.equal(preflight.policy_decision, "allowed_for_future_setup");
  assert.equal(preflight.readiness.providerConfigured, false);
  assert.equal(preflight.readiness.liveSendingEnabled, false);
  assert.equal(preflight.readiness.external_send, false);
  assert.deepEqual(preflight.readiness.missing_requirements, activationBlockers);
  assert.equal(preflight.selection.providerSelected, false);
  assert.equal(preflight.selection.providerConfigured, false);
  assert.equal(preflight.selection.liveSendingEnabled, false);
  assert.equal(preflight.selection.external_send, false);
  assert.deepEqual(preflight.selection.missing_requirements, activationBlockers);

  const requestedProviderResponse = await harness.route.GET(
    new Request(apiUrl({ selected_provider: "resend" }), { headers: adminHeaders() }),
  );
  const requestedProvider = await requestedProviderResponse.json();

  assert.equal(requestedProviderResponse.status, 200);
  assert.equal(requestedProvider.ok, true);
  assert.equal(requestedProvider.activationReady, false);
  assert.deepEqual(requestedProvider.blockers, activationBlockers);
  assert.equal(
    requestedProvider.selectedProvider,
    null,
    "A query parameter must not claim that the server selected a provider.",
  );
  assert.equal(requestedProvider.providerSelected, false);
  assert.equal(requestedProvider.providerConfigured, false);
  assert.equal(requestedProvider.liveSendingEnabled, false);
  assert.equal(requestedProvider.external_send, false);
  assert.equal(requestedProvider.sendingEnabled, false);

  applyReadyEmailConfiguration();
  const configuredGateClosedResponse = await harness.route.GET(
    new Request(apiUrl(), { headers: adminHeaders() }),
  );
  const configuredGateClosed = await configuredGateClosedResponse.json();

  assert.equal(configuredGateClosedResponse.status, 200);
  assert.equal(configuredGateClosed.ok, true);
  assert.equal(configuredGateClosed.providerSelected, true);
  assert.equal(configuredGateClosed.selectedProvider, "resend");
  assert.equal(configuredGateClosed.senderMatched, true);
  assert.equal(configuredGateClosed.replyToMatched, true);
  assert.equal(configuredGateClosed.recipientAllowlistConfigured, true);
  assert.equal(configuredGateClosed.providerCredentialConfigured, true);
  assert.equal(configuredGateClosed.providerConfigured, true);
  assert.equal(configuredGateClosed.configurationReady, true);
  assert.equal(configuredGateClosed.driverDetailsEmailSendGateOpen, false);
  assert.equal(configuredGateClosed.activationReady, false);
  assert.equal(configuredGateClosed.sendingEnabled, false);
  assert.equal(configuredGateClosed.liveSendingEnabled, false);
  assert.equal(configuredGateClosed.external_send, false);
  assert.equal(configuredGateClosed.status, "ready_for_gate");
  assert.equal(configuredGateClosed.activationStatus, "ready_for_gate");
  assert.deepEqual(configuredGateClosed.blockers, ["approval", "live_sending"]);
  assert.deepEqual(configuredGateClosed.missing_requirements, ["approval", "live_sending"]);

  process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED = "true";
  const gateOpenResponse = await harness.route.GET(
    new Request(apiUrl(), { headers: adminHeaders() }),
  );
  const gateOpen = await gateOpenResponse.json();

  assert.equal(gateOpenResponse.status, 200);
  assert.equal(gateOpen.ok, true);
  assert.equal(gateOpen.driverDetailsEmailSendGateOpen, true);
  assert.equal(gateOpen.providerConfigured, true);
  assert.equal(gateOpen.configurationReady, true);
  assert.equal(gateOpen.activationReady, true);
  assert.equal(gateOpen.external_send, false);
  assert.equal(gateOpen.sendingEnabled, true);
  assert.equal(gateOpen.liveSendingEnabled, true);
  assert.equal(gateOpen.status, "ready");
  assert.equal(gateOpen.activationStatus, "ready");
  assert.deepEqual(gateOpen.blockers, []);
  assert.deepEqual(gateOpen.missing_requirements, []);
  delete process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_SEND_ENABLED;

  process.env.PRESTIGE_DRIVER_DETAILS_EMAIL_FROM = "Wrong Sender <wrong@example.com>";
  const mismatchedSenderResponse = await harness.route.GET(
    new Request(apiUrl(), { headers: adminHeaders() }),
  );
  const mismatchedSender = await mismatchedSenderResponse.json();

  assert.equal(mismatchedSenderResponse.status, 200);
  assert.equal(mismatchedSender.providerSelected, true);
  assert.equal(mismatchedSender.senderMatched, false);
  assert.equal(mismatchedSender.replyToMatched, true);
  assert.equal(mismatchedSender.providerConfigured, false);
  assert.equal(mismatchedSender.configurationReady, false);
  assert.equal(mismatchedSender.activationReady, false);
  assert.deepEqual(mismatchedSender.blockers, ["env", "approval", "live_sending"]);

  const invalidResponse = await harness.route.GET(
    new Request(apiUrl({ selected_provider: "smtp-secret-provider" }), { headers: adminHeaders() }),
  );
  const invalid = await invalidResponse.json();

  assert.equal(invalidResponse.status, 200);
  assert.equal(invalid.activationReady, false);
  assert.equal(invalid.selectedProvider, "resend");
  assert.equal(invalid.providerSelected, true);
  assert.equal(invalid.providerConfigured, false);
  assert.equal(invalid.liveSendingEnabled, false);
  assert.equal(invalid.external_send, false);
  assert.deepEqual(invalid.blockers, ["env", "approval", "live_sending"]);
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
