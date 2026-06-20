import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-flightaware-aeroapi-live-lookup-action/route.ts";
const helperPath = "lib/admin-flightaware-aeroapi-live-lookup-action.ts";
const boundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";
const ledgerPath = "docs/current-implementation-ledger.md";
const routePathFragment = "/api/admin-flightaware-aeroapi-live-lookup-action";
const guardScript = "scripts/test-admin-flightaware-aeroapi-live-lookup-action-api-contract.mjs";
const gateEnvName = "PRESTIGE_FLIGHTAWARE_AEROAPI_LIVE_LOOKUP_ENABLED";

const originalEnv = {
  FLIGHTAWARE_AEROAPI_API_KEY: process.env.FLIGHTAWARE_AEROAPI_API_KEY,
  FLIGHTAWARE_AEROAPI_BASE_URL: process.env.FLIGHTAWARE_AEROAPI_BASE_URL,
  [gateEnvName]: process.env[gateEnvName],
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
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

function setEnv(overrides) {
  restoreEnv();

  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

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

function assertSafeResponse(value, label) {
  const serialized = JSON.stringify(value);

  for (const forbidden of [
    "test-flightaware-secret-key",
    "raw_provider_response",
    "rawProviderResponse",
    "response_headers",
    "debug_payload",
    "customer_price",
    "billing",
    "invoice",
    "driver_payout",
    "paynow",
    "internal_admin",
    "admin_notes",
    "parser_debug",
    "mock_archive",
  ]) {
    assert.equal(
      serialized.toLowerCase().includes(forbidden.toLowerCase()),
      false,
      `${label} must not expose ${forbidden}.`,
    );
  }
}

function adminHeaders(extra = {}) {
  return {
    "x-prestige-admin-purpose": "admin-booking-persistence",
    origin: "http://localhost",
    referer: "http://localhost/",
    ...extra,
  };
}

function serverSessionHeaders() {
  return adminHeaders({
    "x-prestige-admin-session-token": "flight-test-admin-token",
  });
}

function routeUrl(pathname = routePathFragment) {
  return new URL(`http://localhost${pathname}`);
}

function validInput() {
  return {
    flight_no: "SQ318",
    service_code: "MNG",
  };
}

async function responseJson(response) {
  return JSON.parse(await response.text());
}

function assertClosed(value, label) {
  assert.equal(value.ok, false, `${label} must not look up.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.reason, "flight_lookup_gate_closed", `${label} must report closed gate.`);
  assert.equal(value.no_op, true, `${label} must remain no-op.`);
  assert.equal(value.lookup_enabled, false, `${label} must not enable lookup.`);
  assert.equal(value.external_request_enabled, false, `${label} must not enable external request.`);
  assert.equal(value.provider_request_count, 0, `${label} must make zero provider requests.`);
  assert.equal(value.database_persistence_enabled, false, `${label} must not persist DB data.`);
  assert.equal(value.scheduler_enabled, false, `${label} must not schedule.`);
  assert.equal(value.retry_enabled, false, `${label} must not retry.`);
  assert.equal(value.env_gate_name, gateEnvName, `${label} must expose only gate env name.`);
  assertSafeResponse(value, label);
}

function assertMissingProvider(value, label) {
  assert.equal(value.ok, false, `${label} must not look up.`);
  assert.equal(value.status, "blocked", `${label} must remain blocked.`);
  assert.equal(value.reason, "provider_not_configured", `${label} must report provider not configured.`);
  assert.equal(value.provider_request_count, 0, `${label} must make zero provider requests.`);
  assert.equal(value.lookup, null, `${label} must not include lookup data.`);
  assertSafeResponse(value, label);
}

function assertInvalid(value, label) {
  assert.equal(value.ok, false, `${label} must reject invalid input.`);
  assert.equal(value.status, "rejected", `${label} must report rejected status.`);
  assert.equal(value.reason, "invalid_input", `${label} must report invalid input.`);
  assert.equal(value.provider_request_count, 0, `${label} must not call provider.`);
  assertSafeResponse(value, label);
}

function assertSuccess(value, label) {
  assert.equal(value.ok, true, `${label} must succeed.`);
  assert.equal(value.status, "looked_up", `${label} must report looked_up.`);
  assert.equal(value.reason, "lookup_succeeded", `${label} must report lookup_succeeded.`);
  assert.equal(value.provider_request_count, 1, `${label} must make exactly one provider request.`);
  assert.equal(value.external_request_enabled, true, `${label} must mark external request enabled only after call.`);
  assert.equal(value.lookup?.provider, "flightaware_aeroapi", `${label} must identify provider.`);
  assert.equal(value.lookup?.flightNumber, "SQ318", `${label} must normalize flight number.`);
  assert.equal(value.lookup?.customerVisible, false, `${label} must stay customer hidden.`);
  assert.equal(value.lookup?.scheduledArrivalIso, "2026-06-21T05:10:00.000Z");
  assert.equal(value.lookup?.estimatedArrivalIso, "2026-06-21T05:35:00.000Z");
  assert.equal(value.database_persistence_enabled, false, `${label} must not persist DB data.`);
  assert.equal(value.scheduler_enabled, false, `${label} must not schedule.`);
  assert.equal(value.retry_enabled, false, `${label} must not retry.`);
  assert.deepEqual(Object.keys(value.lookup).sort(), [
    "customerVisible",
    "estimatedArrivalIso",
    "flightNumber",
    "provider",
    "scheduledArrivalIso",
    "sourceUpdatedAtIso",
    "status",
  ]);
  assertSafeResponse(value, label);
}

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
}

async function writeTranspiled(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-flightaware-live-lookup-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const adapterPath = path.join(tempDir, adapterStubPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(adapterPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    adapterPath,
    [
      "function adminDispatcherBoundaryToPersistenceAdapterActor(context) {",
      "  return {",
      "    actor_label: context.actorLabel || 'Harness admin',",
      "    actor_role: context.role === 'dispatcher' ? 'dispatcher' : 'admin',",
      "    boundary_mode: context.mode,",
      "    source_surface: 'admin_api',",
      "  };",
      "}",
      "module.exports = { adminDispatcherBoundaryToPersistenceAdapterActor };",
    ].join("\n"),
  );

  for (const relativePath of [boundaryPath, helperPath, routePath]) {
    await writeTranspiled(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

const [
  routeSource,
  helperSource,
  preactivationSuite,
  ledger,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(helperPath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
  readFile(ledgerPath, "utf8"),
]);
const combined = `${routeSource}\n${helperSource}`;

assertIncludes(routeSource, "export async function POST", "FlightAware live lookup route");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "FlightAware live lookup route");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "FlightAware live lookup route");
assertIncludes(routeSource, "adminDispatcherBoundaryToPersistenceAdapterActor", "FlightAware live lookup route");
assertIncludes(routeSource, "executeAdminFlightAwareAeroApiLiveLookupAction", "FlightAware live lookup route");
assertExcludes(routeSource, "export async function GET", "FlightAware live lookup route");
assertExcludes(routeSource, "export async function PATCH", "FlightAware live lookup route");
assertExcludes(routeSource, "export async function DELETE", "FlightAware live lookup route");

for (const fragment of [
  "server-only",
  gateEnvName,
  "FLIGHTAWARE_AEROAPI_API_KEY",
  "FLIGHTAWARE_AEROAPI_BASE_URL",
  "flight_lookup_gate_closed",
  "provider_not_configured",
  "provider_timeout",
  "provider_failure",
  "lookup_succeeded",
  "provider_request_count: 0",
  "provider_request_count: 1",
  "AbortSignal.timeout",
  "customerVisible: false",
  "database_persistence_enabled: false",
  "scheduler_enabled: false",
  "retry_enabled: false",
]) {
  assertIncludes(helperSource, fragment, `FlightAware live lookup helper ${fragment}`);
}

for (const fragment of [
  "createClient",
  "@supabase/supabase-js",
  ".from(",
  ".insert(",
  ".upsert(",
  ".update(",
  ".delete(",
  "sendMessage",
  "telegram",
  "whatsapp",
  "sms",
  "email",
  "payment",
  "payout",
  "invoice_pdf",
  "pdf_link",
]) {
  assertExcludes(combined.toLowerCase(), fragment.toLowerCase(), `FlightAware live lookup source ${fragment}`);
}

const gateCheckIndex = helperSource.indexOf("if (!lookupGateOpen())");
const tokenReadIndex = helperSource.indexOf("process.env.FLIGHTAWARE_AEROAPI_API_KEY");
const providerCallIndex = helperSource.indexOf("await fetchProvider");

assert.notEqual(gateCheckIndex, -1, "FlightAware helper must check gate.");
assert.notEqual(tokenReadIndex, -1, "FlightAware helper must contain provider token read.");
assert.notEqual(providerCallIndex, -1, "FlightAware helper must contain provider fetch call.");
assert.ok(tokenReadIndex > gateCheckIndex, "Provider token read must occur only after closed-gate check.");
assert.ok(providerCallIndex > tokenReadIndex, "Provider fetch must occur only after token/config validation.");

assertIncludes(preactivationSuite, guardScript, "Preactivation suite FlightAware live lookup guard");
assertIncludes(ledger, "FlightAware/AeroAPI Gated Live Lookup Contract Lock", "Ledger FlightAware live lookup contract lock");
assertIncludes(ledger, routePathFragment, "Ledger FlightAware live lookup route");
assertIncludes(ledger, gateEnvName, "Ledger FlightAware live lookup gate");

const harness = await loadHarness();
const originalFetch = globalThis.fetch;

try {
  const { helper, route } = harness;
  let providerRequests = 0;

  globalThis.fetch = async () => {
    providerRequests += 1;
    throw new Error("Provider fetch must stay blocked in closed-gate tests.");
  };

  setEnv({
    FLIGHTAWARE_AEROAPI_API_KEY: "test-flightaware-secret-key",
    FLIGHTAWARE_AEROAPI_BASE_URL: "https://aeroapi.flightaware.com/aeroapi",
    [gateEnvName]: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
  });

  const closedResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validInput()),
      headers: adminHeaders(),
      method: "POST",
    }),
  );
  const closed = await responseJson(closedResponse);

  assert.equal(closedResponse.status, 503, "Closed FlightAware lookup route must return 503.");
  assertClosed(closed, "closed FlightAware lookup route");
  assert.equal(providerRequests, 0, "Closed gate must not make provider requests.");

  const publicResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validInput()),
      headers: { origin: "http://localhost" },
      method: "POST",
    }),
  );
  const publicBody = await responseJson(publicResponse);

  assert.equal(publicResponse.status, 403, "Public/missing-boundary lookup route must return 403.");
  assert.equal(publicBody.ok, false, "Public/missing-boundary lookup route must reject.");
  assert.equal(providerRequests, 0, "Public/missing-boundary route must not call provider.");

  setEnv({
    FLIGHTAWARE_AEROAPI_API_KEY: undefined,
    FLIGHTAWARE_AEROAPI_BASE_URL: undefined,
    [gateEnvName]: "true",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Flight lookup harness",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "flight-test-admin-token",
  });

  const invalidResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify({ flight_no: "not a flight", service_code: "HOURLY" }),
      headers: serverSessionHeaders(),
      method: "POST",
    }),
  );
  const invalid = await responseJson(invalidResponse);

  assert.equal(invalidResponse.status, 400, "Invalid FlightAware lookup input must return 400.");
  assertInvalid(invalid, "invalid FlightAware lookup route");
  assert.equal(providerRequests, 0, "Invalid input must not call provider.");

  const missingProviderResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validInput()),
      headers: serverSessionHeaders(),
      method: "POST",
    }),
  );
  const missingProvider = await responseJson(missingProviderResponse);

  assert.equal(missingProviderResponse.status, 503, "Missing provider config must return 503.");
  assertMissingProvider(missingProvider, "missing provider FlightAware lookup route");
  assert.equal(providerRequests, 0, "Missing provider config must not call provider.");

  setEnv({
    FLIGHTAWARE_AEROAPI_API_KEY: "test-flightaware-secret-key",
    FLIGHTAWARE_AEROAPI_BASE_URL: "https://aeroapi.flightaware.com/aeroapi",
    [gateEnvName]: "true",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Flight lookup harness",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "flight-test-admin-token",
  });

  globalThis.fetch = async (_url, init) => {
    providerRequests += 1;
    assert.equal(init.method, "GET", "Provider call must be GET-only.");
    assert.equal(init.headers["x-apikey"], "test-flightaware-secret-key", "Provider call must use configured token internally.");

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          flights: [
            {
              debug_payload: "must not leak",
              estimated_in: "2026-06-21T05:35:00Z",
              ident: "SQ318",
              raw_provider_response: "must not leak",
              scheduled_in: "2026-06-21T05:10:00Z",
              status: "arriving",
            },
          ],
          headers: {
            authorization: "must not leak",
          },
        };
      },
    };
  };

  const successResponse = await route.POST(
    new Request(routeUrl(), {
      body: JSON.stringify(validInput()),
      headers: serverSessionHeaders(),
      method: "POST",
    }),
  );
  const success = await responseJson(successResponse);

  assert.equal(successResponse.status, 200, "Successful FlightAware lookup route must return 200.");
  assertSuccess(success, "successful FlightAware lookup route");
  assert.equal(providerRequests, 1, "Successful route must make exactly one provider request.");

  const timeout = await helper.executeAdminFlightAwareAeroApiLiveLookupAction(
    validInput(),
    {
      actor_label: "Harness admin",
      actor_role: "admin",
      boundary_mode: "server-session-role-surface",
      source_surface: "admin_api",
    },
    {
      providerFetch: async () => {
        throw { name: "AbortError" };
      },
    },
  );

  assert.equal(timeout.ok, false, "Timeout result must fail safely.");
  assert.equal(timeout.reason, "provider_timeout", "Timeout result must use provider_timeout reason.");
  assert.equal(timeout.provider_request_count, 1, "Timeout result must count exactly one provider request.");
  assertSafeResponse(timeout, "timeout FlightAware lookup helper");
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("admin FlightAware AeroAPI live lookup action API contract guard passed");
