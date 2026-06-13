import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-customer-driver-auth-readiness-preview-setup/route.ts",
  "app/api/admin-customer-driver-auth-access-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/customer-driver-auth-readiness-setup-foundation.ts",
  "lib/customer-driver-auth-access-audit-payload-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "customer_driver_auth_readiness_setup_only",
  "customer_driver_auth_access_disabled_setup_only",
  "customer_driver_auth_access_audit_payload_setup_only",
  "admin-customer-driver-auth-readiness-preview-setup",
  "admin-customer-driver-auth-access-disabled-setup",
  "customer_auth_activation",
  "customer_saved_booking_session",
  "driver_auth_activation",
  "driver_only_job_visibility_beyond_token_flow",
  "saved_booking",
  "job_visibility",
  "setup_only",
  "setup_only_disabled",
  "blocked/no-op",
];
const disallowedPackageNames = new Set([
  "@auth/core",
  "@supabase/auth-js",
  "@supabase/ssr",
  "auth0",
  "firebase",
  "jose",
  "jsonwebtoken",
  "lucia",
  "next-auth",
  "stripe",
]);
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@auth\/core|@supabase\/auth-js|@supabase\/ssr|@supabase\/supabase-js|auth0|firebase|jose|jsonwebtoken|lucia|next-auth|stripe)["']|require\(\s*["'](?:@auth\/core|@supabase\/auth-js|@supabase\/ssr|@supabase\/supabase-js|auth0|firebase|jose|jsonwebtoken|lucia|next-auth|stripe)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/;
const dbWritePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|auth\.users/i;
const authActivationPattern =
  /cookies\s*\(|headers\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|createSession|createUser|signUp\s*\(|signInWith|exchangeCodeForSession|setSession|refreshSession|verifyOtp|magicLink|issueToken|createToken|jwt\.sign|jsonwebtoken|auth\.users/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const liveTruePattern =
  /customerAuthEnabled\s*[:=]\s*true|driverAuthEnabled\s*[:=]\s*true|liveSessionEnabled\s*[:=]\s*true|authProviderConfigured\s*[:=]\s*true|accessPolicyEnabled\s*[:=]\s*true|tokenIssued\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|auditWriteEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const browserStoragePattern = /localStorage|sessionStorage|indexedDB/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /raw_token|session_token|refresh_token|access_token|jwt|password|magic_link|otp|cookie|claim|service_role|server_secret|secret|customer_price|driver_payout|paynow|billing|invoice|payment|pdf|payout|finance|internal_admin|parser_debug|mock_archive/i;
const expectedBlockedActivation = {
  access_policy: "blocked",
  auth_provider: "missing",
  customer_auth: "blocked",
  driver_auth: "blocked",
  live_customer_access: "blocked",
  live_driver_access: "blocked",
  live_session: "blocked",
  session_creation: "blocked",
};
const expectedPlannedAccess = {
  customer_auth_activation: "planned_only",
  customer_saved_booking_session: "planned_only",
  driver_auth_activation: "planned_only",
  driver_only_job_visibility_beyond_token_flow: "planned_only",
};
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

function assertAuthDisabled(value, label) {
  assert.equal(value?.customerAuthEnabled, false, `${label} must keep customerAuthEnabled false.`);
  assert.equal(value?.driverAuthEnabled, false, `${label} must keep driverAuthEnabled false.`);
  assert.equal(value?.liveSessionEnabled, false, `${label} must keep liveSessionEnabled false.`);
  assert.equal(value?.authProviderConfigured, false, `${label} must keep authProviderConfigured false.`);
  assert.equal(value?.accessPolicyEnabled, false, `${label} must keep accessPolicyEnabled false.`);

  if (Object.hasOwn(value ?? {}, "tokenIssued")) {
    assert.equal(value.tokenIssued, false, `${label} must keep tokenIssued false.`);
  }

  if (Object.hasOwn(value ?? {}, "liveAccessEnabled")) {
    assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  }

  if (Object.hasOwn(value ?? {}, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }

  if (Object.hasOwn(value ?? {}, "external_send")) {
    assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  }
}

function assertBlockedActivation(value, label) {
  assert.deepEqual(
    value?.blocked_activation,
    expectedBlockedActivation,
    `${label} must keep auth/session/live access activation blocked.`,
  );
}

function assertPlannedAccess(value, label) {
  assert.deepEqual(value?.planned_access, expectedPlannedAccess, `${label} must keep auth planned only.`);
}

function assertBlockedNoOp(value, label) {
  assertAuthDisabled(value, label);
  assert.equal(value?.status, "blocked", `${label} must stay blocked.`);
  assert.equal(value?.no_op, true, `${label} must stay no-op.`);
  assert.equal(value?.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value?.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose auth secrets, payment, payout, finance, parser, or mock archive text.`,
  );
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-auth-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-auth-access-audit-payload-setup-foundation.js"),
    ),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    readiness: requireFromHarness(
      path.join(tempDir, "lib/customer-driver-auth-readiness-setup-foundation.js"),
    ),
    routes: {
      disabledAccess: requireFromHarness(
        path.join(tempDir, "app/api/admin-customer-driver-auth-access-disabled-setup/route.js"),
      ),
      previewReadiness: requireFromHarness(
        path.join(tempDir, "app/api/admin-customer-driver-auth-readiness-preview-setup/route.js"),
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
    disallowedPackageNames.has(packageName),
    false,
    `Customer/driver auth setup must not add auth/provider/payment package: ${packageName}`,
  );
}

const authRouteFiles = (await readdir("app/api", { recursive: true }))
  .filter((file) => file.endsWith("route.ts"))
  .map((file) => path.join("app/api", file))
  .filter((file) => file.includes("admin-customer-driver-auth"))
  .sort();

assert.deepEqual(authRouteFiles, [...routeFiles].sort(), "Customer/driver auth must keep only setup GET routes.");

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain a GET setup route.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live auth verbs.`,
  );
}

for (const helperFile of helperFiles) {
  const source = await readFile(helperFile, "utf8");

  assert.equal(source.includes("server-only"), true, `${helperFile} must stay server-only.`);
  assert.equal(
    /export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(source),
    false,
    `${helperFile} must not define API behavior.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import auth/provider/payment SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read auth/provider env secrets.`);
  assert.equal(dbWritePattern.test(source), false, `${file} must not use DB writes or auth tables.`);
  assert.equal(authActivationPattern.test(source), false, `${file} must not activate auth, sessions, or tokens.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable auth/live flags.`);
  assert.equal(browserStoragePattern.test(source), false, `${file} must not create browser/session storage.`);
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only customer/driver auth policy string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildCustomerDriverAuthReadinessSetup } = harness.readiness;
  const { buildCustomerDriverAuthAccessAuditPayloadSetup } = harness.audit;
  const setup = buildCustomerDriverAuthReadinessSetup({
    booking_reference: "PLO-AUTH-GUARD-001",
    customer_account_reference: "CUSTOMER-ACCOUNT-001",
    driver_reference: "DRIVER-OPS-001",
  });

  assertAuthDisabled(setup, "Customer/driver auth readiness helper");
  assert.equal(setup.status, "setup_only");
  assert.equal(setup.policy_surface, "customer_driver_auth_readiness_setup_only");
  assertBlockedActivation(setup, "Customer/driver auth readiness helper");
  assertPlannedAccess(setup, "Customer/driver auth readiness helper");
  assertNoUnsafeOutput(setup, "Customer/driver auth readiness helper");

  const anonymousPreviewResponse = await harness.routes.previewReadiness.GET(
    new Request(apiUrl("/api/admin-customer-driver-auth-readiness-preview-setup")),
  );
  const anonymousPreview = await anonymousPreviewResponse.json();

  assert.equal(anonymousPreviewResponse.status, 403);
  assert.equal(anonymousPreview.ok, false);
  assert.equal(anonymousPreview.status, "blocked");
  assertAuthDisabled(anonymousPreview, "Anonymous auth readiness preview API");
  assertAuthDisabled(anonymousPreview.preview, "Anonymous auth readiness preview API preview");
  assertAuthDisabled(anonymousPreview.readiness, "Anonymous auth readiness preview API readiness");
  assertAuthDisabled(anonymousPreview.setup, "Anonymous auth readiness preview API setup");
  assertBlockedActivation(anonymousPreview.readiness, "Anonymous auth readiness preview API readiness");
  assertBlockedActivation(anonymousPreview.setup, "Anonymous auth readiness preview API setup");
  assertNoUnsafeOutput(anonymousPreview, "Anonymous auth readiness preview API");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-customer-driver-auth-readiness-preview-setup", {
        booking_reference: "PLO-AUTH-GUARD-002",
        customer_account_reference: "CUSTOMER-ACCOUNT-002",
        driver_reference: "DRIVER-OPS-002",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assertAuthDisabled(preview, "Auth readiness preview API");
  assertAuthDisabled(preview.preview, "Auth readiness preview API preview");
  assertAuthDisabled(preview.readiness, "Auth readiness preview API readiness");
  assertAuthDisabled(preview.setup, "Auth readiness preview API setup");
  assertBlockedActivation(preview.readiness, "Auth readiness preview API readiness");
  assertBlockedActivation(preview.setup, "Auth readiness preview API setup");
  assertPlannedAccess(preview.preview, "Auth readiness preview API preview");
  assertPlannedAccess(preview.setup, "Auth readiness preview API setup");
  assertNoUnsafeOutput(preview, "Auth readiness preview API");

  const anonymousDisabledResponse = await harness.routes.disabledAccess.GET(
    new Request(apiUrl("/api/admin-customer-driver-auth-access-disabled-setup")),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertAuthDisabled(anonymousDisabled, "Anonymous disabled auth access API");
  assertAuthDisabled(anonymousDisabled.preview, "Anonymous disabled auth access API preview");
  assertAuthDisabled(anonymousDisabled.readiness, "Anonymous disabled auth access API readiness");
  assertAuthDisabled(anonymousDisabled.setup, "Anonymous disabled auth access API setup");
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled auth access API result");
  assertNoUnsafeOutput(anonymousDisabled, "Anonymous disabled auth access API");

  const disabledResponse = await harness.routes.disabledAccess.GET(
    new Request(
      apiUrl("/api/admin-customer-driver-auth-access-disabled-setup", {
        booking_reference: "PLO-AUTH-GUARD-003",
        customer_account_reference: "CUSTOMER-ACCOUNT-003",
        driver_reference: "DRIVER-OPS-003",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();

  assert.equal(disabledResponse.status, 200);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.status, "blocked");
  assertAuthDisabled(disabled, "Disabled auth access API");
  assertAuthDisabled(disabled.preview, "Disabled auth access API preview");
  assertAuthDisabled(disabled.readiness, "Disabled auth access API readiness");
  assertAuthDisabled(disabled.setup, "Disabled auth access API setup");
  assertBlockedNoOp(disabled.result, "Disabled auth access API result");
  assert.deepEqual(disabled.result.customer_access, {
    customerAuthEnabled: false,
    liveAccessEnabled: false,
    liveSessionEnabled: false,
    status: "blocked",
    tokenIssued: false,
  });
  assert.deepEqual(disabled.result.driver_access, {
    driverAuthEnabled: false,
    liveAccessEnabled: false,
    liveSessionEnabled: false,
    status: "blocked",
    tokenIssued: false,
  });
  assertNoUnsafeOutput(disabled, "Disabled auth access API");

  const auditPayload = buildCustomerDriverAuthAccessAuditPayloadSetup({
    accessTarget: "saved_booking",
    actionSource: "disabled_auth_access_api",
    actorType: "customer",
    disabledAuthAccess: disabled.result,
    setup,
  });

  assertAuthDisabled(auditPayload, "Customer auth access audit payload");
  assertAuthDisabled(auditPayload.audit_payload, "Nested customer auth access audit payload");
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Customer auth access audit blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Nested customer auth access audit blocked result");
  assert.equal(auditPayload.auditWriteEnabled, false);
  assert.equal(auditPayload.audit_payload.auditWriteEnabled, false);
  assert.equal(auditPayload.actorType, "customer");
  assert.equal(auditPayload.accessTarget, "saved_booking");
  assert.equal(auditPayload.actionSource, "disabled_auth_access_api");
  assert.deepEqual(auditPayload.missing_requirements, []);
  assertNoUnsafeOutput(auditPayload, "Customer auth access audit payload");

  const driverAuditPayload = buildCustomerDriverAuthAccessAuditPayloadSetup({
    access_target: "job-visibility",
    action_source: "setup-contract-test",
    actor_type: "driver",
    bookingReference: "PLO-AUTH-GUARD-004",
    disabled_auth_access: disabled.result,
    driverReference: "DRIVER-OPS-004",
  });

  assertAuthDisabled(driverAuditPayload, "Driver auth access audit payload");
  assertBlockedNoOp(driverAuditPayload.blocked_no_op_result, "Driver auth access audit blocked result");
  assert.equal(driverAuditPayload.actorType, "driver");
  assert.equal(driverAuditPayload.accessTarget, "job_visibility");
  assert.equal(driverAuditPayload.actionSource, "setup_contract_test");
  assert.deepEqual(driverAuditPayload.missing_requirements, []);
  assertNoUnsafeOutput(driverAuditPayload, "Driver auth access audit payload");

  const unsafeAuditPayload = buildCustomerDriverAuthAccessAuditPayloadSetup({
    accessTarget: "payment",
    actionSource: "server_secret",
    actorType: "admin",
    booking_reference: "payment-secret",
    customerAccountReference: "customer_price",
    disabledAuthAccess: {
      accessPolicyEnabled: true,
      authProviderConfigured: true,
      customerAuthEnabled: true,
      delivery_surface: "customer_driver_auth_access_disabled_setup_only",
      driverAuthEnabled: true,
      external_send: true,
      liveAccessEnabled: true,
      liveSessionEnabled: true,
      no_op: false,
      reason: "active",
      result_label: "active",
      status: "active",
      tokenIssued: true,
    },
    driverReference: "driver_payout_session_token",
  });

  assertAuthDisabled(unsafeAuditPayload, "Unsafe auth access audit payload");
  assertAuthDisabled(unsafeAuditPayload.audit_payload, "Nested unsafe auth access audit payload");
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe auth access audit blocked result");
  assertBlockedNoOp(unsafeAuditPayload.audit_payload.result, "Nested unsafe auth access audit blocked result");
  assert.equal(unsafeAuditPayload.actorType, null);
  assert.equal(unsafeAuditPayload.accessTarget, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "actor_type",
    "access_target",
    "action_source",
    "disabled_auth_access_result",
  ]);
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe auth access audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("customer/driver auth no-live guard passed");
