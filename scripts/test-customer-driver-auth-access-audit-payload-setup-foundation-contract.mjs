import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/customer-driver-auth-access-audit-payload-setup-foundation.ts";
const readinessHelperPath = "lib/customer-driver-auth-readiness-setup-foundation.ts";
const disabledAuthAccessRoutePath = "app/api/admin-customer-driver-auth-access-disabled-setup/route.ts";
const sourceFiles = [
  helperPath,
  readinessHelperPath,
  disabledAuthAccessRoutePath,
  "lib/admin-dispatcher-auth-boundary.ts",
];
const disabledAuthAccessSource = "admin-customer-driver-auth-access-disabled-setup";
const previewReadinessSource = "admin-customer-driver-auth-readiness-preview-setup";
const unsafeOutputPattern =
  /raw_token|session_token|refresh_token|access_token|jwt|password|magic_link|otp|cookie|claim|service_role|server_secret|secret|customer_price|driver_payout|paynow|billing|invoice|payment|pdf|payout|finance|internal_admin|parser_debug|mock_archive/i;
const helperSource = await readFile(helperPath, "utf8");
const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

assert.equal(helperSource.includes("server-only"), true, "Auth access audit helper must stay server-only.");
assert.equal(/fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i.test(helperSource), false, "Auth access audit helper must not use network APIs.");
assert.equal(/export async function (GET|POST|PUT|PATCH|DELETE)|\/api\//i.test(helperSource), false, "Auth access audit helper must not define API behavior.");
assert.equal(
  /\bprocess\.env\b|\bSUPABASE_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/.test(
    helperSource,
  ),
  false,
  "Auth access audit helper must not read env/provider secrets.",
);
assert.equal(/createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(/i.test(helperSource), false, "Auth access audit helper must not use DB writes.");
assert.equal(/cookies\s*\(|headers\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|createSession|issueToken|createToken|auth\.users/i.test(helperSource), false, "Auth access audit helper must not activate sessions, auth, or token issuing.");
assert.equal(/@supabase\/supabase-js|@auth\/core|next-auth|jose|jsonwebtoken|stripe/i.test(helperSource), false, "Auth access audit helper must not reference auth/provider/payment SDKs.");
assert.equal(/legacy_shim|shim\s*\(/i.test(helperSource), false, "Auth access audit helper must not introduce shims.");

for (const fragment of [
  "buildCustomerDriverAuthReadinessSetup",
  disabledAuthAccessSource,
  previewReadinessSource,
  "customer_driver_auth_access_audit_payload_setup_only",
  "customerDriverAuthAccessAuditActorTypes",
  "saved_booking",
  "job_visibility",
  "actorType",
  "accessTarget",
  "auditWriteEnabled: false",
  "audit_write_enabled",
  "blocked_no_op_result",
  "customerAuthEnabled: false",
  "driverAuthEnabled: false",
  "liveSessionEnabled: false",
  "authProviderConfigured: false",
  "accessPolicyEnabled: false",
  "tokenIssued: false",
  "liveAccessEnabled: false",
  "external_send: false",
]) {
  assert.ok(helperSource.includes(fragment), `Missing auth access audit setup fragment: ${fragment}`);
}

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
  const url = new URL("http://localhost/api/admin-customer-driver-auth-access-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function blockedNoOpResult() {
  return {
    accessPolicyEnabled: false,
    authProviderConfigured: false,
    customerAuthEnabled: false,
    driverAuthEnabled: false,
    external_send: false,
    liveAccessEnabled: false,
    liveSessionEnabled: false,
    no_op: true,
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    tokenIssued: false,
  };
}

function assertAuthAccessAuditDisabled(value, label) {
  assert.equal(value.customerAuthEnabled, false, `${label} must keep customerAuthEnabled false.`);
  assert.equal(value.driverAuthEnabled, false, `${label} must keep driverAuthEnabled false.`);
  assert.equal(value.liveSessionEnabled, false, `${label} must keep liveSessionEnabled false.`);
  assert.equal(value.authProviderConfigured, false, `${label} must keep authProviderConfigured false.`);
  assert.equal(value.accessPolicyEnabled, false, `${label} must keep accessPolicyEnabled false.`);
  assert.equal(value.tokenIssued, false, `${label} must keep tokenIssued false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value.external_send, false, `${label} must keep external_send false.`);

  if (Object.hasOwn(value, "auditWriteEnabled")) {
    assert.equal(value.auditWriteEnabled, false, `${label} must keep auditWriteEnabled false.`);
  }
}

function assertBlockedNoOp(value, label) {
  assert.deepEqual(value, blockedNoOpResult(), `${label} must stay blocked/no-op.`);
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-auth-audit-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of sourceFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    audit: requireFromHarness(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    disabledAuthAccessRoute: requireFromHarness(
      path.join(tempDir, disabledAuthAccessRoutePath.replace(/\.ts$/, ".js")),
    ),
    readiness: requireFromHarness(path.join(tempDir, readinessHelperPath.replace(/\.ts$/, ".js"))),
  };
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildCustomerDriverAuthAccessAuditPayloadSetup } = harness.audit;
  const { buildCustomerDriverAuthReadinessSetup } = harness.readiness;
  const disabledResponse = await harness.disabledAuthAccessRoute.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-AUTH-AUDIT-001",
        customer_account_reference: "CUSTOMER-ACCOUNT-001",
        driver_reference: "DRIVER-OPS-001",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();
  const setup = buildCustomerDriverAuthReadinessSetup({
    booking_reference: "PLO-AUTH-AUDIT-001",
    customer_account_reference: "CUSTOMER-ACCOUNT-001",
    driver_reference: "DRIVER-OPS-001",
  });
  const auditPayload = buildCustomerDriverAuthAccessAuditPayloadSetup({
    accessTarget: "saved-booking",
    actionSource: "disabled-auth-access-api",
    actorType: "customer",
    disabledAuthAccess: disabled.result,
    setup,
  });

  assert.deepEqual(auditPayload, {
    accessPolicyEnabled: false,
    accessTarget: "saved_booking",
    access_target: "saved_booking",
    actionSource: "disabled_auth_access_api",
    action_source: "disabled_auth_access_api",
    actorType: "customer",
    actor_type: "customer",
    auditWriteEnabled: false,
    audit_payload: {
      accessPolicyEnabled: false,
      accessTarget: "saved_booking",
      access_target: "saved_booking",
      actionSource: "disabled_auth_access_api",
      action_source: "disabled_auth_access_api",
      actorType: "customer",
      actor_type: "customer",
      auditWriteEnabled: false,
      authProviderConfigured: false,
      auth_readiness_status: "ready_for_future_setup",
      booking_reference: "PLO-AUTH-AUDIT-001",
      customerAuthEnabled: false,
      customer_account_reference: "CUSTOMER-ACCOUNT-001",
      disabledAuthAccessStatus: "blocked",
      disabled_auth_access_source: disabledAuthAccessSource,
      disabled_auth_access_status: "blocked",
      driverAuthEnabled: false,
      driver_reference: "DRIVER-OPS-001",
      external_send: false,
      liveAccessEnabled: false,
      liveSessionEnabled: false,
      preview_readiness_source: previewReadinessSource,
      result: blockedNoOpResult(),
      tokenIssued: false,
    },
    audit_write_enabled: false,
    authProviderConfigured: false,
    auth_readiness_status: "ready_for_future_setup",
    blocked_no_op_result: blockedNoOpResult(),
    booking_reference: "PLO-AUTH-AUDIT-001",
    customerAuthEnabled: false,
    customer_account_reference: "CUSTOMER-ACCOUNT-001",
    delivery_surface: "customer_driver_auth_access_audit_payload_setup_only",
    disabledAuthAccessStatus: "blocked",
    disabled_auth_access_status: "blocked",
    driverAuthEnabled: false,
    driver_reference: "DRIVER-OPS-001",
    external_send: false,
    liveAccessEnabled: false,
    liveSessionEnabled: false,
    missing_requirements: [],
    status: "setup_only",
    tokenIssued: false,
    version: "customer-driver-auth-access-audit-payload-setup-foundation-v1",
  });
  assertAuthAccessAuditDisabled(auditPayload, "Ready auth access audit payload");
  assertAuthAccessAuditDisabled(auditPayload.audit_payload, "Ready nested auth access audit payload");
  assertBlockedNoOp(auditPayload.blocked_no_op_result, "Ready auth access blocked result");
  assertBlockedNoOp(auditPayload.audit_payload.result, "Ready nested auth access blocked result");
  assertNoUnsafeOutput(auditPayload, "Ready auth access audit payload");

  const inlineAuditPayload = buildCustomerDriverAuthAccessAuditPayloadSetup({
    access_target: "job-visibility",
    action_source: "setup_contract_test",
    actor_type: "driver",
    bookingReference: "PLO-AUTH-AUDIT-002",
    disabled_auth_access: disabled.result,
    driverReference: "DRIVER-OPS-002",
  });

  assert.equal(inlineAuditPayload.actorType, "driver");
  assert.equal(inlineAuditPayload.accessTarget, "job_visibility");
  assert.equal(inlineAuditPayload.actionSource, "setup_contract_test");
  assert.equal(inlineAuditPayload.booking_reference, "PLO-AUTH-AUDIT-002");
  assert.equal(inlineAuditPayload.customer_account_reference, null);
  assert.equal(inlineAuditPayload.driver_reference, "DRIVER-OPS-002");
  assert.equal(inlineAuditPayload.disabledAuthAccessStatus, "blocked");
  assert.deepEqual(inlineAuditPayload.missing_requirements, []);
  assertAuthAccessAuditDisabled(inlineAuditPayload, "Inline auth access audit payload");
  assertBlockedNoOp(inlineAuditPayload.blocked_no_op_result, "Inline auth access blocked result");
  assertNoUnsafeOutput(inlineAuditPayload, "Inline auth access audit payload");

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

  assert.equal(unsafeAuditPayload.actorType, null);
  assert.equal(unsafeAuditPayload.accessTarget, null);
  assert.equal(unsafeAuditPayload.actionSource, null);
  assert.equal(unsafeAuditPayload.booking_reference, null);
  assert.equal(unsafeAuditPayload.customer_account_reference, null);
  assert.equal(unsafeAuditPayload.driver_reference, null);
  assert.equal(unsafeAuditPayload.disabledAuthAccessStatus, "missing");
  assert.deepEqual(unsafeAuditPayload.missing_requirements, [
    "actor_type",
    "access_target",
    "action_source",
    "disabled_auth_access_result",
  ]);
  assertAuthAccessAuditDisabled(unsafeAuditPayload, "Unsafe auth access audit payload");
  assertAuthAccessAuditDisabled(unsafeAuditPayload.audit_payload, "Unsafe nested auth access audit payload");
  assertBlockedNoOp(unsafeAuditPayload.blocked_no_op_result, "Unsafe auth access blocked result");
  assertBlockedNoOp(unsafeAuditPayload.audit_payload.result, "Unsafe nested auth access blocked result");
  assertNoUnsafeOutput(unsafeAuditPayload, "Unsafe auth access audit payload");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("customer/driver auth access audit payload setup foundation contract passed");
