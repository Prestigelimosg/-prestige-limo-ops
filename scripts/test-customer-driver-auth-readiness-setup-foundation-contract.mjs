import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-driver-auth-readiness-setup-foundation.ts";
const source = await readFile(helperPath, "utf8");
const unsafeOutputPattern =
  /raw_token|session_token|refresh_token|access_token|jwt|password|magic_link|otp|cookie|claim|service_role|server_secret|secret|customer_price|driver_payout|paynow|billing|invoice|payment|pdf|payout|finance|internal_admin|parser_debug|mock_archive/i;

assert.equal(source.includes("server-only"), true, "Auth readiness helper must stay server-only.");
assert.equal(
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@supabase\/supabase-js|@auth\/core|next-auth|jose|jsonwebtoken|stripe)["']|require\(\s*["'](?:@supabase\/supabase-js|@auth\/core|next-auth|jose|jsonwebtoken|stripe)["']\s*\)/i.test(
    source,
  ),
  false,
  "Auth readiness helper must not import auth/provider/payment SDKs.",
);
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(
    source,
  ),
  false,
  "Auth readiness helper must not read env/provider secrets.",
);
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(source), false, "Auth readiness helper must not use network APIs.");
assert.equal(/createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i.test(source), false, "Auth readiness helper must not use DB writes.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source), false, "Auth readiness helper must not define API behavior.");
assert.equal(/cookies\s*\(|headers\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|createSession|issueToken|createToken|auth\.users/i.test(source), false, "Auth readiness helper must not activate sessions, auth, or token issuing.");
assert.equal(/localStorage|sessionStorage|indexedDB/i.test(source), false, "Auth readiness helper must not activate browser storage.");
assert.equal(/legacy_shim|shim\s*\(/i.test(source), false, "Auth readiness helper must not introduce shims.");

for (const fragment of [
  "customerDriverAuthReadinessSetupFoundationVersion",
  "buildCustomerDriverAuthReadinessSetup",
  "customer_driver_auth_readiness_setup_only",
  "customerAuthEnabled: false",
  "driverAuthEnabled: false",
  "liveSessionEnabled: false",
  "authProviderConfigured: false",
  "accessPolicyEnabled: false",
  "customer_auth_activation_planned: true",
  "driver_auth_activation_planned: true",
  "customer_saved_booking_session_planned: true",
  "driver_only_job_visibility_beyond_token_flow_planned: true",
]) {
  assert.ok(source.includes(fragment), `Missing auth readiness setup fragment: ${fragment}`);
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

async function loadHelper() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-auth-readiness-"));
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

function assertAuthReadinessDisabled(value, label) {
  assert.equal(value.customerAuthEnabled, false, `${label} must keep customerAuthEnabled false.`);
  assert.equal(value.driverAuthEnabled, false, `${label} must keep driverAuthEnabled false.`);
  assert.equal(value.liveSessionEnabled, false, `${label} must keep liveSessionEnabled false.`);
  assert.equal(value.authProviderConfigured, false, `${label} must keep authProviderConfigured false.`);
  assert.equal(value.accessPolicyEnabled, false, `${label} must keep accessPolicyEnabled false.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose auth secrets, payment, payout, finance, parser, or mock archive text.`,
  );
}

const harness = await loadHelper();

try {
  const {
    buildCustomerDriverAuthReadinessSetup,
    customerDriverAuthReadinessSetupFoundationVersion,
  } = harness.helper;

  assert.equal(
    customerDriverAuthReadinessSetupFoundationVersion,
    "customer-driver-auth-readiness-setup-foundation-v1",
  );

  const readiness = buildCustomerDriverAuthReadinessSetup({
    booking_reference: "PLO-AUTH-001",
    customer_account_reference: "CUSTOMER-ACCOUNT-001",
    driver_reference: "DRIVER-OPS-001",
  });

  assert.deepEqual(readiness, {
    accessPolicyEnabled: false,
    authProviderConfigured: false,
    blocked_activation: {
      access_policy: "blocked",
      auth_provider: "missing",
      customer_auth: "blocked",
      driver_auth: "blocked",
      live_customer_access: "blocked",
      live_driver_access: "blocked",
      live_session: "blocked",
      session_creation: "blocked",
    },
    booking_reference: "PLO-AUTH-001",
    customer_account_reference: "CUSTOMER-ACCOUNT-001",
    customer_auth_activation_planned: true,
    customer_saved_booking_session_planned: true,
    customerAuthEnabled: false,
    driver_auth_activation_planned: true,
    driver_only_job_visibility_beyond_token_flow_planned: true,
    driver_reference: "DRIVER-OPS-001",
    driverAuthEnabled: false,
    liveSessionEnabled: false,
    missing_requirements: [
      "customer_auth_approval",
      "driver_auth_approval",
      "auth_provider",
      "live_session_approval",
      "access_policy_approval",
    ],
    planned_access: {
      customer_auth_activation: "planned_only",
      customer_saved_booking_session: "planned_only",
      driver_auth_activation: "planned_only",
      driver_only_job_visibility_beyond_token_flow: "planned_only",
    },
    policyReady: true,
    policy_surface: "customer_driver_auth_readiness_setup_only",
    status: "setup_only",
    version: "customer-driver-auth-readiness-setup-foundation-v1",
  });
  assertAuthReadinessDisabled(readiness, "ready auth readiness policy");
  assertNoUnsafeOutput(readiness, "ready auth readiness policy");

  const fallback = buildCustomerDriverAuthReadinessSetup();

  assert.equal(fallback.booking_reference, null);
  assert.equal(fallback.customer_account_reference, null);
  assert.equal(fallback.driver_reference, null);
  assertAuthReadinessDisabled(fallback, "fallback auth readiness policy");
  assertNoUnsafeOutput(fallback, "fallback auth readiness policy");

  const unsafe = buildCustomerDriverAuthReadinessSetup({
    bookingReference: "payment-secret",
    customerAccountReference: "customer_price",
    driverReference: "driver_payout_session_token",
  });

  assert.equal(unsafe.booking_reference, null);
  assert.equal(unsafe.customer_account_reference, null);
  assert.equal(unsafe.driver_reference, null);
  assertAuthReadinessDisabled(unsafe, "unsafe auth readiness policy");
  assertNoUnsafeOutput(unsafe, "unsafe auth readiness policy");
} finally {
  await harness.cleanup();
}

console.log("Customer/driver auth readiness setup foundation contract passed");
