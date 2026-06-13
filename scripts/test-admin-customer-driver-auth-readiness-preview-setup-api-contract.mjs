import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-customer-driver-auth-readiness-preview-setup/route.ts";
const helperPath = "lib/customer-driver-auth-readiness-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
const safeOutputLeakPattern =
  /raw_token|session_token|refresh_token|access_token|jwt|password|magic_link|otp|cookie|claim|service_role|server_secret|secret|customer_price|driver_payout|paynow|billing|invoice|payment|pdf|payout|finance|internal_admin|parser_debug|mock_archive/i;
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
  const url = new URL("http://localhost/api/admin-customer-driver-auth-readiness-preview-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertAuthReadinessDisabled(value, label) {
  assert.equal(value.customerAuthEnabled, false, `${label} must keep customerAuthEnabled false.`);
  assert.equal(value.driverAuthEnabled, false, `${label} must keep driverAuthEnabled false.`);
  assert.equal(value.liveSessionEnabled, false, `${label} must keep liveSessionEnabled false.`);
  assert.equal(value.authProviderConfigured, false, `${label} must keep authProviderConfigured false.`);
  assert.equal(value.accessPolicyEnabled, false, `${label} must keep accessPolicyEnabled false.`);
}

function assertBlockedActivation(value, label) {
  assert.deepEqual(
    value.blocked_activation,
    {
      access_policy: "blocked",
      auth_provider: "missing",
      customer_auth: "blocked",
      driver_auth: "blocked",
      live_customer_access: "blocked",
      live_driver_access: "blocked",
      live_session: "blocked",
      session_creation: "blocked",
    },
    `${label} must keep future auth/session/live access blocked.`,
  );
}

function assertPlannedAccess(value, label) {
  assert.deepEqual(
    value.planned_access,
    {
      customer_auth_activation: "planned_only",
      customer_saved_booking_session: "planned_only",
      driver_auth_activation: "planned_only",
      driver_only_job_visibility_beyond_token_flow: "planned_only",
    },
    `${label} must keep auth access planned only.`,
  );
}

function assertMissingRequirements(value, label) {
  assert.deepEqual(
    value.missing_requirements,
    [
      "customer_auth_approval",
      "driver_auth_approval",
      "auth_provider",
      "live_session_approval",
      "access_policy_approval",
    ],
    `${label} must keep approval/provider/policy blockers.`,
  );
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    safeOutputLeakPattern.test(JSON.stringify(value)),
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-auth-api-"));
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
  "buildCustomerDriverAuthReadinessSetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "customer_driver_auth_readiness_setup_only",
  "customerAuthEnabled",
  "driverAuthEnabled",
  "liveSessionEnabled",
  "authProviderConfigured",
  "accessPolicyEnabled",
  "customer_saved_booking_session_planned",
  "driver_only_job_visibility_beyond_token_flow_planned",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing auth readiness API fragment: ${fragment}`);
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
  ".from(",
  "insert(",
  "upsert(",
  "update(",
  "delete(",
  "process.env",
  "cookies(",
  "headers(",
  "getServerSession",
  "signIn(",
  "signOut(",
  "NextAuth",
  "createSession",
  "issueToken",
  "createToken",
  "auth.users",
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "@supabase/supabase-js",
  "@auth/core",
  "next-auth",
  "jose",
  "jsonwebtoken",
  "stripe",
  "legacy_shim",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Auth readiness preview API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertAuthReadinessDisabled(anonymous, "Anonymous blocked response");
  assertAuthReadinessDisabled(anonymous.preview, "Anonymous blocked preview");
  assertAuthReadinessDisabled(anonymous.readiness, "Anonymous blocked readiness");
  assertAuthReadinessDisabled(anonymous.setup, "Anonymous blocked setup");
  assertBlockedActivation(anonymous.readiness, "Anonymous blocked readiness");
  assertBlockedActivation(anonymous.setup, "Anonymous blocked setup");
  assertMissingRequirements(anonymous.readiness, "Anonymous blocked readiness");
  assertMissingRequirements(anonymous.setup, "Anonymous blocked setup");
  assertPlannedAccess(anonymous.preview, "Anonymous blocked preview");
  assertPlannedAccess(anonymous.setup, "Anonymous blocked setup");
  assertNoUnsafeOutput(anonymous, "Anonymous blocked response");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-AUTH-API-001",
        customer_account_reference: "CUSTOMER-ACCOUNT-001",
        driver_reference: "DRIVER-OPS-001",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "setup_only");
  assert.equal(ready.version, "customer-driver-auth-readiness-setup-foundation-v1");
  assertAuthReadinessDisabled(ready, "Ready response");
  assertAuthReadinessDisabled(ready.preview, "Ready preview");
  assertAuthReadinessDisabled(ready.readiness, "Ready readiness");
  assertAuthReadinessDisabled(ready.setup, "Ready setup");
  assertBlockedActivation(ready.readiness, "Ready readiness");
  assertBlockedActivation(ready.setup, "Ready setup");
  assertMissingRequirements(ready.readiness, "Ready readiness");
  assertMissingRequirements(ready.setup, "Ready setup");
  assertPlannedAccess(ready.preview, "Ready preview");
  assertPlannedAccess(ready.setup, "Ready setup");
  assert.equal(ready.preview.booking_reference, "PLO-AUTH-API-001");
  assert.equal(ready.preview.customer_account_reference, "CUSTOMER-ACCOUNT-001");
  assert.equal(ready.preview.driver_reference, "DRIVER-OPS-001");
  assert.equal(ready.readiness.policy_surface, "customer_driver_auth_readiness_setup_only");
  assert.equal(ready.setup.booking_reference, "PLO-AUTH-API-001");
  assert.equal(ready.setup.customer_account_reference, "CUSTOMER-ACCOUNT-001");
  assert.equal(ready.setup.driver_reference, "DRIVER-OPS-001");
  assert.equal(ready.setup.customer_saved_booking_session_planned, true);
  assert.equal(ready.setup.driver_only_job_visibility_beyond_token_flow_planned, true);
  assertNoUnsafeOutput(ready, "Ready response");

  const unsafeResponse = await harness.route.GET(
    new Request(
      apiUrl({
        bookingReference: "payment-secret",
        customerAccountReference: "customer_price",
        driverReference: "driver_payout_session_token",
      }),
      { headers: adminHeaders() },
    ),
  );
  const unsafe = await unsafeResponse.json();

  assert.equal(unsafeResponse.status, 200);
  assert.equal(unsafe.preview.booking_reference, null);
  assert.equal(unsafe.preview.customer_account_reference, null);
  assert.equal(unsafe.preview.driver_reference, null);
  assertAuthReadinessDisabled(unsafe, "Unsafe response");
  assertAuthReadinessDisabled(unsafe.preview, "Unsafe preview");
  assertNoUnsafeOutput(unsafe, "Unsafe response");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin customer/driver auth readiness preview setup API contract passed");
