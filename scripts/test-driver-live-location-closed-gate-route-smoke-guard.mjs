import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const ledgerPath = "docs/current-implementation-ledger.md";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const guardScript =
  "scripts/test-driver-live-location-closed-gate-route-smoke-guard.mjs";
const driverRoutePath = "app/api/driver-job/[token]/live-location/route.ts";
const adminRoutePath = "app/api/admin-active-jobs-map-locations/route.ts";
const scaffoldPath = "lib/driver-live-location-scaffold.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const harnessFiles = [driverRoutePath, adminRoutePath, scaffoldPath, boundaryPath];

const originalEnv = {
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
};

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sectionBetween(source, startHeading, nextHeadingPrefix = "\n### ") {
  const start = source.indexOf(startHeading);
  assert.notEqual(start, -1, `Missing section heading: ${startHeading}`);
  const next = source.indexOf(nextHeadingPrefix, start + startHeading.length);

  return next === -1 ? source.slice(start) : source.slice(start, next);
}

function applyLocalAdminBoundary() {
  delete process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE;
  delete process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN;
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-live-location-closed-gate-"));
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
      admin: requireFromHarness(
        path.join(tempDir, "app/api/admin-active-jobs-map-locations/route.js"),
      ),
      driver: requireFromHarness(
        path.join(tempDir, "app/api/driver-job/[token]/live-location/route.js"),
      ),
    },
  };
}

function assertNoSecretOrPrivateOutput(value, label) {
  const serialized = JSON.stringify(value);

  assert.equal(
    /safe-driver-token|SUPABASE|SERVICE_ROLE|ANON_KEY|service_role|server_secret|api_key|access_token|cookie|jwt|latitude|longitude|coords|booking_reference|customer_phone|customer_email|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i.test(
      serialized,
    ),
    false,
    `${label} must not expose secrets, private data, coordinates, finance, or raw identifiers.`,
  );
}

function assertClosedDriverPayload(value, action) {
  assert.equal(value.ok, false, `${action} response must keep ok false.`);
  assert.equal(value.result?.action, action, `${action} response must echo safe action.`);
  assert.equal(value.result?.customerVisible, false, `${action} must keep customerVisible false.`);
  assert.equal(value.result?.external_send, false, `${action} must keep external_send false.`);
  assert.equal(value.result?.gpsCaptureEnabled, false, `${action} must keep gpsCaptureEnabled false.`);
  assert.equal(value.result?.liveMapEnabled, false, `${action} must keep liveMapEnabled false.`);
  assert.equal(value.result?.locationStorageEnabled, false, `${action} must keep locationStorageEnabled false.`);
  assert.equal(value.result?.no_op, true, `${action} must keep no_op true.`);
  assert.equal(value.result?.reason, "driver_live_location_scaffold_closed", `${action} reason must stay closed.`);
  assert.equal(value.result?.sharing_state, "inactive", `${action} must keep inactive sharing state.`);
  assert.equal(value.result?.token_present, true, `${action} may reveal token presence only.`);
  assert.equal(Object.hasOwn(value.result || {}, "token"), false, `${action} must not return token.`);
  assertNoSecretOrPrivateOutput(value, `${action} driver route`);
}

function assertClosedAdminPayload(value) {
  assert.equal(value.ok, false, "admin active-jobs response must keep ok false.");
  assert.deepEqual(value.result?.active_jobs, [], "admin active-jobs payload must stay empty.");
  assert.equal(value.result?.customerVisible, false, "admin active-jobs must keep customerVisible false.");
  assert.equal(value.result?.external_send, false, "admin active-jobs must keep external_send false.");
  assert.equal(value.result?.gpsCaptureEnabled, false, "admin active-jobs must keep gpsCaptureEnabled false.");
  assert.equal(value.result?.liveMapEnabled, false, "admin active-jobs must keep liveMapEnabled false.");
  assert.equal(value.result?.locationStorageEnabled, false, "admin active-jobs must keep locationStorageEnabled false.");
  assert.equal(value.result?.map_rendered, false, "admin active-jobs must not render a map.");
  assert.equal(value.result?.marker_count, 0, "admin active-jobs must not return markers.");
  assert.equal(value.result?.no_op, true, "admin active-jobs must keep no_op true.");
  assert.equal(value.result?.reason, "driver_live_location_scaffold_closed", "admin active-jobs reason must stay closed.");
  assertNoSecretOrPrivateOutput(value, "admin active-jobs route");
}

const [
  ledger,
  preactivationSuite,
  driverRouteSource,
  adminRouteSource,
  scaffoldSource,
] = await Promise.all([
  readFile(ledgerPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(driverRoutePath, "utf8"),
  readFile(adminRoutePath, "utf8"),
  readFile(scaffoldPath, "utf8"),
]);

const ledgerSection = sectionBetween(
  ledger,
  "### Driver Live Location Closed-Gate Route Smoke Guard Lock",
);

for (const phrase of [
  "This is a local docs/test-only in-process smoke guard for the disabled Driver Live Location route scaffold.",
  "This lock does not activate GPS capture, live-location runtime, admin active-jobs map runtime, customer live map links, route/helper writes, table reads/writes, migration application, env changes, deploy, provider calls, provider sends, billing/payment/PDF/payout, or production activation.",
  "The guard calls `POST /api/driver-job/[token]/live-location` through a temporary harness and requires HTTP 503 safe no-op with `action: \"share\"`, `gpsCaptureEnabled: false`, `locationStorageEnabled: false`, `liveMapEnabled: false`, `customerVisible: false`, `external_send: false`, and `sharing_state: \"inactive\"`.",
  "The guard calls `DELETE /api/driver-job/[token]/live-location` through a temporary harness and requires HTTP 503 safe no-op with `action: \"stop\"` and the same disabled/no-op flags.",
  "The guard calls `GET /api/admin-active-jobs-map-locations` anonymously and requires HTTP 403 before any active-jobs payload is returned.",
  "The guard calls `GET /api/admin-active-jobs-map-locations` with the same-origin admin surface boundary and requires HTTP 503 safe no-op with `active_jobs: []`, `map_rendered: false`, and `marker_count: 0`.",
  "The guard must not print or return driver job tokens, Supabase URLs, service-role keys, anon keys, row IDs, booking references, private customer data, live coordinates, cookies, JWTs, API keys, env values, or secrets.",
  "The guard must not parse coordinate request bodies, call browser GPS APIs, create a Supabase client, read/write location rows, render a map, read map/provider keys, call Google Maps/OneMap/FlightAware, send Email/Telegram/WhatsApp/SMS, run timers/schedulers/polling/retries, or touch billing/payment/PDF/payout.",
  "This smoke guard is not live evidence and does not replace future separately approved fake/staging-safe table/RLS, GPS capture, admin map, stale/offline, POB auto-stop, customer access, cleanup, and rollback evidence.",
  "This guard adds `scripts/test-driver-live-location-closed-gate-route-smoke-guard.mjs` and registers it in `scripts/test-preactivation-verification-suite.mjs`.",
]) {
  assertIncludes(ledgerSection, phrase, `closed-gate smoke ledger phrase ${phrase}`);
}

assertIncludes(preactivationSuite, guardScript, "preactivation closed-gate smoke guard registration");

for (const fragment of [
  "export async function POST",
  "export async function DELETE",
  "buildDriverLiveLocationCaptureScaffoldResponse",
  "{ status: 503 }",
]) {
  assertIncludes(driverRouteSource, fragment, `driver route smoke source ${fragment}`);
}

for (const fragment of [
  "export async function GET",
  "resolveAdminDispatcherBoundary",
  "buildAdminActiveJobsMapScaffoldResponse",
  "{ status: 403 }",
  "{ status: 503 }",
]) {
  assertIncludes(adminRouteSource, fragment, `admin route smoke source ${fragment}`);
}

for (const forbiddenPattern of [
  /navigator\.geolocation|getCurrentPosition|watchPosition|clearWatch|GeolocationPosition/i,
  /createClient|@supabase\/supabase-js|\.from\(|\.(?:insert|upsert|update|delete|select)\s*\(/i,
  /fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon/i,
  /PRESTIGE_GOOGLE_MAPS_API_KEY|GOOGLE_MAPS_API_KEY|google\.maps|maps\.google|OneMap|ONEMAP|FlightAware|AeroAPI/i,
  /TELEGRAM_BOT_TOKEN|messages\.create|sendMail\s*\(|sendSms\s*\(|sendMessage\s*\(/i,
  /setInterval|setTimeout|cron|queueMicrotask|new Worker|retryLoop|retry_loop|polling/i,
  /customer_price|driver_payout|customer_rates|driver_payout_rules|paynow|billing|invoice|payment|payout/i,
  /internal_admin|internal_finance|parser_debug|service_role|server_secret|access_token|api_key/i,
]) {
  assertExcludes(
    `${driverRouteSource}\n${adminRouteSource}\n${scaffoldSource}`,
    forbiddenPattern,
    "closed-gate route smoke source",
  );
}

assertExcludes(driverRouteSource, /request\.json|FormData|arrayBuffer|blob\(/i, "closed driver route smoke source");
assert.equal(
  adminRouteSource.indexOf("const body = await request.json()") >
    adminRouteSource.indexOf('if (!runtimeGateOpen())'),
  true,
  "closed admin map gate must reject stale-pin DELETE before request-body parsing",
);

applyLocalAdminBoundary();

const harness = await loadHarness();

try {
  const driverContext = {
    params: Promise.resolve({
      token: "safe-driver-token-placeholder",
    }),
  };

  const shareResponse = await harness.routes.driver.POST(
    new Request("http://localhost/api/driver-job/safe/live-location", {
      method: "POST",
    }),
    driverContext,
  );
  assert.equal(shareResponse.status, 503, "driver share route must stay closed with HTTP 503.");
  assertClosedDriverPayload(await shareResponse.json(), "share");

  const stopResponse = await harness.routes.driver.DELETE(
    new Request("http://localhost/api/driver-job/safe/live-location", {
      method: "DELETE",
    }),
    driverContext,
  );
  assert.equal(stopResponse.status, 503, "driver stop route must stay closed with HTTP 503.");
  assertClosedDriverPayload(await stopResponse.json(), "stop");

  const anonymousAdminResponse = await harness.routes.admin.GET(
    new Request("http://localhost/api/admin-active-jobs-map-locations"),
  );
  assert.equal(
    anonymousAdminResponse.status,
    403,
    "anonymous admin active-jobs route must be blocked before active-jobs payload.",
  );
  const anonymousBody = await anonymousAdminResponse.json();
  assert.equal(anonymousBody.ok, false, "anonymous admin response must keep ok false.");
  assert.equal(
    Object.hasOwn(anonymousBody, "result"),
    false,
    "anonymous admin response must not include active-jobs result payload.",
  );
  assertNoSecretOrPrivateOutput(anonymousBody, "anonymous admin active-jobs route");

  const sameOriginAdminResponse = await harness.routes.admin.GET(
    new Request("http://localhost/api/admin-active-jobs-map-locations", {
      headers: {
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
    }),
  );
  assert.equal(
    sameOriginAdminResponse.status,
    503,
    "same-origin admin active-jobs route must stay closed with HTTP 503.",
  );
  assertClosedAdminPayload(await sameOriginAdminResponse.json());
} finally {
  await harness.cleanup();
  restoreEnv();
}

console.log("Driver live-location closed-gate route smoke guard passed");
