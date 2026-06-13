import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeFiles = [
  "app/api/admin-live-location-window-policy-preview-readiness-setup/route.ts",
  "app/api/admin-live-location-access-capture-disabled-setup/route.ts",
];
const helperFiles = [
  "lib/live-location-window-policy-setup-foundation.ts",
];
const boundaryFile = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [...routeFiles, boundaryFile, ...helperFiles];
const allowedSetupOnlyStrings = [
  "live_location_window_policy_setup_only",
  "live_location_access_capture_disabled_setup_only",
  "admin-live-location-window-policy-preview-readiness-setup",
  "setup_only",
  "setup_only_disabled",
  "planned_only",
];
const disallowedPackageNames = new Set([
  "@auth/core",
  "@googlemaps/google-maps-services-js",
  "@mapbox/mapbox-sdk",
  "@turf/turf",
  "aws-sdk",
  "geolib",
  "google-map-react",
  "jsonwebtoken",
  "jose",
  "leaflet",
  "mapbox-gl",
  "next-auth",
  "stripe",
]);
const providerImportPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["'](?:@auth\/core|@googlemaps\/google-maps-services-js|@mapbox\/mapbox-sdk|@turf\/turf|geolib|google-map-react|jose|jsonwebtoken|leaflet|mapbox-gl|next-auth|stripe)["']|require\(\s*["'](?:@auth\/core|@googlemaps\/google-maps-services-js|@mapbox\/mapbox-sdk|@turf\/turf|geolib|google-map-react|jose|jsonwebtoken|leaflet|mapbox-gl|next-auth|stripe)["']\s*\)/i;
const envReadPattern =
  /\bprocess\.env\b|\bMAPBOX_[A-Z_]*\b|\bGOOGLE_MAPS_[A-Z_]*\b|\bLOCATION_[A-Z_]*\b|\bGPS_[A-Z_]*\b|\bAUTH_[A-Z_]*\b|\bJWT_[A-Z_]*\b|\bAPI_KEY\b|\bACCESS_TOKEN\b|\bSECRET_KEY\b|\bAUTH_TOKEN\b/;
const dbOrStoragePattern =
  /createClient|supabase|\.from\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|storage\.from|storageBucket|upload\s*\(|download\s*\(|localStorage|sessionStorage|indexedDB/i;
const liveTruePattern =
  /gpsCaptureEnabled\s*[:=]\s*true|liveMapEnabled\s*[:=]\s*true|customerVisible\s*[:=]\s*true|locationStorageEnabled\s*[:=]\s*true|liveAccessEnabled\s*[:=]\s*true|external_send\s*[:=]\s*true/i;
const gpsCapturePattern =
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition|coords\b|latitude|longitude|mapbox|google\.maps|maps\.google/i;
const externalLiveCallPattern =
  /\bfetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon|request\s*\(|sendMail\s*\(|sendMessage\s*\(|send_message\s*\(|sendSms\s*\(|sendSMS\s*\(|messages\.create|client\.messages|publish\s*\(/i;
const policyActivationPattern =
  /activatePolicy|activate_policy|policyActivationEnabled\s*[:=]\s*true|policyActivated\s*[:=]\s*true|liveLocationPolicyEnabled\s*[:=]\s*true/i;
const authActivationPattern =
  /\bcookies\s*\(|\bheaders\s*\(|getServerSession|signIn\s*\(|signOut\s*\(|NextAuth|validateSession|sessionToken|bearer\s+|Authorization/i;
const paymentOrShimPattern =
  /import\s+(?:[\s\S]*?\s+from\s+)?["']stripe["']|require\(\s*["']stripe["']\s*\)|paymentLink|payment_link\s*[:=]|payNowUrl|paynowUrl|checkoutSession|createCheckout|invoice_payment\s*[:=]|legacy_shim|shim\s*\(/i;
const unsafeOutputPattern =
  /latitude|longitude|coords|watchPosition|getCurrentPosition|mapbox|google\.maps|maps\.google|driver_payout|customer_price|paynow|payment|billing|invoice|payout|internal_admin|internal_finance|service_role|server_secret|secret|stripe/i;
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

function assertNoLiveFlags(value, label) {
  assert.equal(value?.gpsCaptureEnabled, false, `${label} must keep gpsCaptureEnabled false.`);
  assert.equal(value?.liveMapEnabled, false, `${label} must keep liveMapEnabled false.`);
  assert.equal(value?.customerVisible, false, `${label} must keep customerVisible false.`);
  assert.equal(value?.locationStorageEnabled, false, `${label} must keep locationStorageEnabled false.`);
  assert.equal(value?.liveAccessEnabled, false, `${label} must keep liveAccessEnabled false.`);
  assert.equal(value?.external_send ?? false, false, `${label} must keep external_send false.`);
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

function assertBlockedNoOp(value, label) {
  assertNoLiveFlags(value, label);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
  assert.equal(value.reason, "setup_only_disabled", `${label} must stay setup-only disabled.`);
  assert.equal(value.result_label, "blocked/no-op", `${label} must expose blocked/no-op.`);
  assert.equal(value.status, "blocked", `${label} must stay blocked.`);
}

function assertNoUnsafeOutput(value, label) {
  assert.equal(
    unsafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not reveal live location/provider/payment/internal details.`,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-live-location-no-live-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");

  for (const sourceFile of harnessFiles) {
    await writeHarnessFile(tempDir, sourceFile);
  }

  const requireFromHarness = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    routes: {
      disabledAccessCapture: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-live-location-access-capture-disabled-setup/route.js",
        ),
      ),
      previewReadiness: requireFromHarness(
        path.join(
          tempDir,
          "app/api/admin-live-location-window-policy-preview-readiness-setup/route.js",
        ),
      ),
    },
    setup: requireFromHarness(
      path.join(tempDir, "lib/live-location-window-policy-setup-foundation.js"),
    ),
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
    `Live-location setup must not add provider/auth/location/payment package: ${packageName}`,
  );
}

for (const routeFile of routeFiles) {
  const source = await readFile(routeFile, "utf8");

  assert.match(source, /export async function GET/, `${routeFile} must remain GET-only setup route.`);
  assert.equal(
    /export async function (POST|PUT|PATCH|DELETE)/.test(source),
    false,
    `${routeFile} must not expose write/live-location verbs.`,
  );
}

for (const file of [...routeFiles, ...helperFiles]) {
  const source = await readFile(file, "utf8");

  assert.equal(providerImportPattern.test(source), false, `${file} must not import live-location/auth/provider/payment SDKs.`);
  assert.equal(envReadPattern.test(source), false, `${file} must not read provider/env/auth secrets.`);
  assert.equal(dbOrStoragePattern.test(source), false, `${file} must not use DB or storage writes.`);
  assert.equal(liveTruePattern.test(source), false, `${file} must not enable live-location flags.`);
  assert.equal(gpsCapturePattern.test(source), false, `${file} must not use GPS capture/map APIs.`);
  assert.equal(externalLiveCallPattern.test(source), false, `${file} must not call external live APIs.`);
  assert.equal(policyActivationPattern.test(source), false, `${file} must not activate live-location policy.`);
  assert.equal(authActivationPattern.test(source), false, `${file} must not activate auth/session access.`);
  assert.equal(paymentOrShimPattern.test(source), false, `${file} must not introduce payment or shim paths.`);
}

const setupChainSource = (
  await Promise.all([...routeFiles, ...helperFiles].map((file) => readFile(file, "utf8")))
).join("\n");

for (const setupOnlyString of allowedSetupOnlyStrings) {
  assert.ok(
    setupChainSource.includes(setupOnlyString),
    `Setup-only live-location policy string must remain allowed: ${setupOnlyString}.`,
  );
}

const harness = await loadHarness();

try {
  applyLocalAdminBoundary();

  const { buildLiveLocationWindowPolicySetup } = harness.setup;
  const policy = buildLiveLocationWindowPolicySetup({
    booking_reference: "PLO-LIVE-GUARD-001",
    pickup_at: "2026-06-13T10:00:00+08:00",
    pob_at: "2026-06-13T10:45:00+08:00",
  });

  assertNoLiveFlags(policy, "Live-location window policy helper");
  assertPolicyWindows(policy, "Live-location window policy helper");
  assert.equal(policy.status, "setup_only");
  assert.equal(policy.policy_surface, "live_location_window_policy_setup_only");
  assertNoUnsafeOutput(policy, "Live-location window policy helper");

  const previewResponse = await harness.routes.previewReadiness.GET(
    new Request(
      apiUrl("/api/admin-live-location-window-policy-preview-readiness-setup", {
        booking_reference: "PLO-LIVE-GUARD-002",
        pickup_at: "2026-06-13T10:00:00+08:00",
        pob_at: "2026-06-13T10:45:00+08:00",
      }),
      { headers: adminHeaders() },
    ),
  );
  const preview = await previewResponse.json();

  assert.equal(previewResponse.status, 200);
  assert.equal(preview.ok, true);
  assert.equal(preview.status, "setup_only");
  assertNoLiveFlags(preview, "Live-location preview/readiness API");
  assertNoLiveFlags(preview.preview, "Live-location preview/readiness API preview");
  assertNoLiveFlags(preview.readiness, "Live-location preview/readiness API readiness");
  assertNoLiveFlags(preview.policy, "Live-location preview/readiness API policy");
  assertPolicyWindows(preview.preview, "Live-location preview/readiness API preview");
  assertPolicyWindows(preview.readiness, "Live-location preview/readiness API readiness");
  assertPolicyWindows(preview.policy, "Live-location preview/readiness API policy");
  assertNoUnsafeOutput(preview, "Live-location preview/readiness API");

  const anonymousDisabledResponse = await harness.routes.disabledAccessCapture.GET(
    new Request(apiUrl("/api/admin-live-location-access-capture-disabled-setup")),
  );
  const anonymousDisabled = await anonymousDisabledResponse.json();

  assert.equal(anonymousDisabledResponse.status, 403);
  assert.equal(anonymousDisabled.ok, false);
  assert.equal(anonymousDisabled.status, "blocked");
  assertNoLiveFlags(anonymousDisabled, "Anonymous disabled live-location access/capture API");
  assertBlockedNoOp(anonymousDisabled.result, "Anonymous disabled live-location access/capture result");

  const disabledResponse = await harness.routes.disabledAccessCapture.GET(
    new Request(
      apiUrl("/api/admin-live-location-access-capture-disabled-setup", {
        booking_reference: "PLO-LIVE-GUARD-003",
        pickup_at: "2026-06-13T10:00:00+08:00",
        pob_at: "2026-06-13T10:45:00+08:00",
      }),
      { headers: adminHeaders() },
    ),
  );
  const disabled = await disabledResponse.json();

  assert.equal(disabledResponse.status, 200);
  assert.equal(disabled.ok, true);
  assert.equal(disabled.status, "blocked");
  assertNoLiveFlags(disabled, "Disabled live-location access/capture API");
  assertNoLiveFlags(disabled.preview, "Disabled live-location access/capture preview");
  assertNoLiveFlags(disabled.readiness, "Disabled live-location access/capture readiness");
  assertNoLiveFlags(disabled.policy, "Disabled live-location access/capture policy");
  assertBlockedNoOp(disabled.result, "Disabled live-location access/capture result");
  assertPolicyWindows(disabled.preview, "Disabled live-location access/capture preview");
  assertPolicyWindows(disabled.readiness, "Disabled live-location access/capture readiness");
  assertPolicyWindows(disabled.policy, "Disabled live-location access/capture policy");
  assert.deepEqual(disabled.result.gps_capture, {
    gpsCaptureEnabled: false,
    locationStorageEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.admin_map_access, {
    liveMapEnabled: false,
    status: "blocked",
  });
  assert.deepEqual(disabled.result.customer_map_access, {
    customerVisible: false,
    liveAccessEnabled: false,
    status: "blocked",
  });
  assertNoUnsafeOutput(disabled, "Disabled live-location access/capture API");
} finally {
  restoreEnv();
  await harness.cleanup();
}

console.log("live-location no-live guard passed");
