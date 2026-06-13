import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-live-location-access-capture-disabled-setup/route.ts";
const helperPath = "lib/live-location-window-policy-setup-foundation.ts";
const sourceFiles = [
  routePath,
  "lib/admin-dispatcher-auth-boundary.ts",
  helperPath,
];
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
  const url = new URL("http://localhost/api/admin-live-location-access-capture-disabled-setup");

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return url.toString();
}

function assertDisabled(value, label) {
  assert.equal(value.gpsCaptureEnabled, false, `${label} must keep gpsCaptureEnabled false.`);
  assert.equal(value.liveMapEnabled, false, `${label} must keep liveMapEnabled false.`);
  assert.equal(value.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value.locationStorageEnabled, false, `${label} must keep locationStorageEnabled false.`);
  assert.equal(value.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);

  if (Object.hasOwn(value, "external_send")) {
    assert.equal(value.external_send, false, `${label} must keep external_send false.`);
  }
}

function assertPolicyWindows(value, label) {
  assert.equal(
    value.customer_window_opens_minutes_before_pickup ??
      value.customer_visible_window_minutes_before_pickup,
    30,
    `${label} must keep the customer window at 30 minutes before pickup.`,
  );
  assert.equal(value.auto_stop_minutes_after_pob, 5, `${label} must keep auto-stop at 5 minutes after POB.`);
  assert.equal(value.admin_live_map_planned, true, `${label} must keep admin live map planned.`);
  assert.equal(value.customer_live_map_link_planned, true, `${label} must keep customer live map link planned.`);
}

function assertNoOpResult(result, label) {
  assertDisabled(result, label);
  assert.equal(result.status, "blocked", `${label} must stay blocked.`);
  assert.equal(result.no_op, true, `${label} must stay no-op.`);
  assert.equal(result.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(result.result_label, "blocked/no-op", `${label} must keep blocked/no-op label.`);
  assert.equal(
    result.preview_readiness_source,
    "admin-live-location-window-policy-preview-readiness-setup",
    `${label} must reference the preview/readiness setup API.`,
  );
  assert.deepEqual(result.gps_capture, {
    gpsCaptureEnabled: false,
    locationStorageEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.admin_map_access, {
    liveMapEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(result.customer_map_access, {
    customerVisible: false,
    liveAccessEnabled: false,
    status: "blocked",
  });
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-live-location-access-capture-disabled-"));
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
  "buildLiveLocationWindowPolicySetup",
  "resolveAdminDispatcherBoundary",
  "adminBookingPersistencePurpose",
  "export async function GET",
  "admin-live-location-window-policy-preview-readiness-setup",
  "live_location_access_capture_disabled_setup_only",
  "gps_capture",
  "admin_map_access",
  "customer_map_access",
  "external_send: false",
  "gpsCaptureEnabled: false",
  "liveMapEnabled: false",
  "customerVisible: false",
  "locationStorageEnabled: false",
  "liveAccessEnabled: false",
  "status: \"blocked\"",
]) {
  assert.ok(routeAndHelperSource.includes(fragment), `Missing disabled live-location API fragment: ${fragment}`);
}

for (const fragment of [
  "export async function POST",
  "export async function PUT",
  "export async function PATCH",
  "export async function DELETE",
  "navigator.geolocation",
  "watchPosition",
  "getCurrentPosition",
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
  "localStorage",
  "sessionStorage",
  "indexedDB",
  "storage.from",
  "process.env",
  "nodemailer",
  "sendgrid",
  "mailgun",
  "resend",
  "twilio",
  "vonage",
  "messagebird",
  "whatsapp-cloud-api",
  "telegram",
  "stripe",
  "mapbox",
  "google.maps",
  "sendMessage",
  "send_message",
  "messages.create",
  "sendSms",
  "sendSMS",
  "AUTH_TOKEN",
  "ACCESS_TOKEN",
  "SECRET_KEY",
]) {
  assert.ok(!routeSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden route fragment: ${fragment}`);
  assert.ok(!helperSource.toLowerCase().includes(fragment.toLowerCase()), `Forbidden helper fragment: ${fragment}`);
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const anonymousResponse = await harness.route.GET(new Request(apiUrl()));
  const anonymous = await anonymousResponse.json();

  assert.equal(anonymousResponse.status, 403, "Disabled live-location API must stay admin-gated.");
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.status, "blocked");
  assertDisabled(anonymous, "Anonymous blocked response");
  assertDisabled(anonymous.preview, "Anonymous blocked preview");
  assertDisabled(anonymous.readiness, "Anonymous blocked readiness");
  assertDisabled(anonymous.result, "Anonymous blocked result");
  assertDisabled(anonymous.policy, "Anonymous blocked policy");
  assertNoOpResult(anonymous.result, "Anonymous blocked result");
  assertPolicyWindows(anonymous.preview, "Anonymous blocked preview");
  assertPolicyWindows(anonymous.readiness, "Anonymous blocked readiness");
  assert.equal(anonymous.policy.status, "setup_only");

  const readyResponse = await harness.route.GET(
    new Request(
      apiUrl({
        booking_reference: "PLO-LIVE-DISABLED-001",
        pickup_at: "2026-06-13T10:00:00+08:00",
        pob_at: "2026-06-13T10:45:00+08:00",
      }),
      { headers: adminHeaders() },
    ),
  );
  const ready = await readyResponse.json();

  assert.equal(readyResponse.status, 200);
  assert.equal(ready.ok, true);
  assert.equal(ready.status, "blocked");
  assertDisabled(ready, "Ready response");
  assertDisabled(ready.preview, "Ready preview");
  assertDisabled(ready.readiness, "Ready readiness");
  assertDisabled(ready.result, "Ready result");
  assertDisabled(ready.policy, "Ready policy");
  assertNoOpResult(ready.result, "Ready result");
  assertPolicyWindows(ready.preview, "Ready preview");
  assertPolicyWindows(ready.readiness, "Ready readiness");
  assertPolicyWindows(ready.policy, "Ready policy");
  assert.equal(ready.result.booking_reference, "PLO-LIVE-DISABLED-001");
  assert.deepEqual(ready.result, {
    admin_map_access: {
      liveMapEnabled: false,
      status: "blocked",
    },
    booking_reference: "PLO-LIVE-DISABLED-001",
    customer_map_access: {
      customerVisible: false,
      liveAccessEnabled: false,
      status: "blocked",
    },
    customerVisible: false,
    delivery_surface: "live_location_access_capture_disabled_setup_only",
    external_send: false,
    gps_capture: {
      gpsCaptureEnabled: false,
      locationStorageEnabled: false,
      status: "blocked",
    },
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    no_op: true,
    preview_readiness_source: "admin-live-location-window-policy-preview-readiness-setup",
    reason: "setup_only_disabled",
    result_label: "blocked/no-op",
    status: "blocked",
    version: "live-location-window-policy-setup-foundation-v1",
  });
  assert.deepEqual(ready.readiness, {
    admin_live_map_planned: true,
    auto_stop_minutes_after_pob: 5,
    customer_live_map_link_planned: true,
    customer_window_opens_minutes_before_pickup: 30,
    customerVisible: false,
    external_send: false,
    gpsCaptureEnabled: false,
    liveAccessEnabled: false,
    liveMapEnabled: false,
    locationStorageEnabled: false,
    policyReady: true,
    status: "blocked",
  });
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("admin live-location access capture disabled setup API contract passed");
