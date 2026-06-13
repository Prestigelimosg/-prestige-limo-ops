import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-email-provider-selection-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");

assert.equal(source.includes("server-only"), true, "Email provider selection helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Email provider selection helper must not use network APIs.");
assert.equal(
  /from\s+["'](?:resend|@aws-sdk|aws-sdk|@sendgrid|mailgun|mailgun\.js|nodemailer)|require\(\s*["'](?:resend|@aws-sdk|aws-sdk|@sendgrid|mailgun|mailgun\.js|nodemailer)|SESClient|SendEmailCommand|sendMail/i.test(source),
  false,
  "Email provider selection helper must not import provider SDKs.",
);
assert.equal(/\bprocess\.env\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bSMTP_[A-Z_]*\b|\bEMAIL_PROVIDER\b/i.test(source), false, "Email provider selection helper must not reference env/provider tokens.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Email provider selection helper must not define API behavior.");
assert.equal(/createClient|supabase|insert\(|upsert\(|update\(|delete\(/i.test(source), false, "Email provider selection helper must not use DB writes.");

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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-email-provider-selection-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const outputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, helperPath));

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: createRequire(import.meta.url)(outputPath),
  };
}

const harness = await loadHelper();

try {
  const {
    adminEmailProviderSelectionOptions,
    buildAdminEmailProviderSelectionSetup,
  } = harness.helper;

  assert.deepEqual(adminEmailProviderSelectionOptions, [
    "resend",
    "aws_ses",
    "sendgrid",
    "mailgun",
  ]);

  const defaultSelection = buildAdminEmailProviderSelectionSetup();

  assert.deepEqual(defaultSelection, {
    delivery_surface: "email_provider_selection_setup_only",
    external_send: false,
    liveSendingEnabled: false,
    missing_requirements: ["provider", "env", "approval"],
    providerConfigured: false,
    providerOptions: [
      {
        external_send: false,
        liveSendingEnabled: false,
        provider: "resend",
        providerConfigured: false,
        selection_status: "available_for_future_selection",
      },
      {
        external_send: false,
        liveSendingEnabled: false,
        provider: "aws_ses",
        providerConfigured: false,
        selection_status: "available_for_future_selection",
      },
      {
        external_send: false,
        liveSendingEnabled: false,
        provider: "sendgrid",
        providerConfigured: false,
        selection_status: "available_for_future_selection",
      },
      {
        external_send: false,
        liveSendingEnabled: false,
        provider: "mailgun",
        providerConfigured: false,
        selection_status: "available_for_future_selection",
      },
    ],
    providerSelected: false,
    selectedProvider: null,
    selectedProviderStatus: "not_selected",
    sendingEnabled: false,
    status: "setup_only",
    version: "admin-email-provider-selection-setup-foundation-v1",
  });

  const selected = buildAdminEmailProviderSelectionSetup({
    selectedProvider: "aws-ses",
  });

  assert.equal(selected.selectedProvider, "aws_ses");
  assert.equal(selected.providerSelected, true);
  assert.equal(selected.providerConfigured, false);
  assert.equal(selected.liveSendingEnabled, false);
  assert.equal(selected.external_send, false);
  assert.equal(selected.sendingEnabled, false);
  assert.equal(selected.selectedProviderStatus, "disabled");
  assert.deepEqual(selected.missing_requirements, ["env", "approval"]);

  for (const provider of ["resend", "aws_ses", "sendgrid", "mailgun"]) {
    const result = buildAdminEmailProviderSelectionSetup({ selectedProvider: provider });

    assert.equal(result.selectedProvider, provider);
    assert.equal(result.providerSelected, true);
    assert.equal(result.providerConfigured, false);
    assert.equal(result.liveSendingEnabled, false);
    assert.equal(result.external_send, false);
  }

  const invalid = buildAdminEmailProviderSelectionSetup({
    selectedProvider: "smtp-secret-provider",
  });

  assert.equal(invalid.selectedProvider, null);
  assert.equal(invalid.providerSelected, false);
  assert.equal(invalid.providerConfigured, false);
  assert.equal(invalid.liveSendingEnabled, false);
  assert.equal(invalid.external_send, false);
  assert.deepEqual(invalid.missing_requirements, ["provider", "env", "approval"]);
  assert.equal(
    /payment|payout|smtp|secret|token|api_key|access_token/i.test(JSON.stringify(invalid)),
    false,
    "Provider selection output must not leak unsafe provider/env/payment text.",
  );
} finally {
  await harness.cleanup();
}

console.log("Admin email provider selection setup foundation contract tests passed.");
