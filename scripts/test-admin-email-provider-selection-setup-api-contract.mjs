import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-email-provider-selection-setup/route.ts";
const helperPath = "lib/admin-email-provider-selection-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
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
  const url = new URL("http://localhost/api/admin-email-provider-selection-setup");

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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-provider-selection-api-"));
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
const helperSource = await readFile(helperPath, "utf8");
const routeAndHelperSource = `${routeSource}\n${helperSource}`;

for (const fragment of [
  "buildAdminEmailProviderSelectionSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "selected_provider",
  "selectedProvider",
  "providerSelected",
  "providerConfigured",
  "liveSendingEnabled",
  "external_send",
  "resend",
  "aws_ses",
  "sendgrid",
  "mailgun",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing provider selection API fragment: ${fragment}`);
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
  assert.ok(!routeAndHelperSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden fragment: ${fragment}`);
}

assert.equal(
  /from\s+["'](?:resend|@aws-sdk|aws-sdk|@sendgrid|mailgun|mailgun\.js|nodemailer)|require\(\s*["'](?:resend|@aws-sdk|aws-sdk|@sendgrid|mailgun|mailgun\.js|nodemailer)|SESClient|SendEmailCommand|sendMail/i.test(routeAndHelperSource),
  false,
  "Provider selection API must not import provider SDKs.",
);

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Email provider selection API must stay admin-gated.");
  assert.equal(anonymous.external_send, false);
  assert.equal(anonymous.liveSendingEnabled, false);
  assert.deepEqual(anonymous.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(anonymous.providerConfigured, false);
  assert.equal(anonymous.providerSelected, false);
  assert.equal(anonymous.selectedProvider, null);
  assert.equal(anonymous.sendingEnabled, false);
  assert.equal(anonymous.status, "blocked");

  const defaultResponse = await harness.route.GET(new Request(apiUrl(), { headers: adminHeaders() }));
  const defaultSelection = await defaultResponse.json();

  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultSelection.ok, true);
  assert.equal(defaultSelection.external_send, false);
  assert.equal(defaultSelection.liveSendingEnabled, false);
  assert.deepEqual(defaultSelection.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(defaultSelection.providerConfigured, false);
  assert.deepEqual(
    defaultSelection.providerOptions.map((option) => option.provider),
    ["resend", "aws_ses", "sendgrid", "mailgun"],
  );
  assert.equal(defaultSelection.providerSelected, false);
  assert.equal(defaultSelection.selectedProvider, null);
  assert.equal(defaultSelection.selectedProviderStatus, "not_selected");
  assert.equal(defaultSelection.sendingEnabled, false);
  assert.equal(defaultSelection.status, "setup_only");
  assert.equal(defaultSelection.version, "admin-email-provider-selection-setup-foundation-v1");

  const selectedResponse = await harness.route.GET(
    new Request(apiUrl({ selected_provider: "aws-ses" }), { headers: adminHeaders() }),
  );
  const selected = await selectedResponse.json();

  assert.equal(selectedResponse.status, 200);
  assert.equal(selected.ok, true);
  assert.equal(selected.selectedProvider, "aws_ses");
  assert.equal(selected.providerSelected, true);
  assert.equal(selected.providerConfigured, false);
  assert.equal(selected.liveSendingEnabled, false);
  assert.equal(selected.external_send, false);
  assert.equal(selected.sendingEnabled, false);
  assert.equal(selected.selectedProviderStatus, "disabled");
  assert.deepEqual(selected.missing_requirements, ["env", "approval"]);
  assert.equal(selected.selection.selectedProvider, "aws_ses");
  assert.equal(selected.selection.providerConfigured, false);
  assert.equal(selected.selection.liveSendingEnabled, false);
  assert.equal(selected.selection.external_send, false);

  const camelCaseResponse = await harness.route.GET(
    new Request(apiUrl({ selectedProvider: "sendgrid" }), { headers: adminHeaders() }),
  );
  const camelCase = await camelCaseResponse.json();

  assert.equal(camelCaseResponse.status, 200);
  assert.equal(camelCase.selectedProvider, "sendgrid");
  assert.equal(camelCase.providerSelected, true);
  assert.equal(camelCase.providerConfigured, false);
  assert.equal(camelCase.liveSendingEnabled, false);
  assert.equal(camelCase.external_send, false);

  const invalidResponse = await harness.route.GET(
    new Request(apiUrl({ selected_provider: "smtp-secret-provider" }), { headers: adminHeaders() }),
  );
  const invalid = await invalidResponse.json();

  assert.equal(invalidResponse.status, 200);
  assert.equal(invalid.selectedProvider, null);
  assert.equal(invalid.providerSelected, false);
  assert.equal(invalid.providerConfigured, false);
  assert.equal(invalid.liveSendingEnabled, false);
  assert.equal(invalid.external_send, false);
  assert.deepEqual(invalid.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(invalid)),
    false,
    "Email provider selection API output must not leak unsafe provider/env/payment text.",
  );
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin email provider selection setup API contract passed");
