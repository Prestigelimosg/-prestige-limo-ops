import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledMapRouteEstimateError =
  "Admin map route estimate is not enabled on this server.";
const serverSessionToken = "mock-admin-map-route-estimate-session-token";
const mapsKeySentinel = "GOOGLE_MAPS_API_KEY_ROUTE_ESTIMATE_SENTINEL";
const safeApiLeakPattern =
  /GOOGLE_MAPS_API_KEY_ROUTE_ESTIMATE_SENTINEL|mock-admin-map-route-estimate-session-token|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeMapRouteEstimateLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-map-route-estimates.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-map-route-estimates/route.ts",
];
const originalEnv = {
  GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
  PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED:
    process.env.PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED,
  PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
    process.env.PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL,
  PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE,
  PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN:
    process.env.PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN,
  PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED:
    process.env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED,
  PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER:
    process.env.PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER,
  PRESTIGE_GOOGLE_MAPS_API_KEY: process.env.PRESTIGE_GOOGLE_MAPS_API_KEY,
  PRESTIGE_GOOGLE_MAPS_ROUTES_ENDPOINT: process.env.PRESTIGE_GOOGLE_MAPS_ROUTES_ENDPOINT,
};
const originalFetch = globalThis.fetch;

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

function transpileTypescript(source, filename) {
  return ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: filename,
  }).outputText;
}

async function writeHarnessFile(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function writeMockModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-map-route-estimate-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    estimates: require(path.join(tempDir, "lib/admin-map-route-estimates.js")),
    route: require(path.join(tempDir, "app/api/admin-map-route-estimates/route.js")),
  };
}

function enabledEnv(overrides = {}) {
  return {
    GOOGLE_MAPS_API_KEY: mapsKeySentinel,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Map Route Estimate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED: "true",
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "google_routes",
    PRESTIGE_GOOGLE_MAPS_ROUTES_ENDPOINT:
      "https://maps-route-estimate-contract.test/computeRoutes",
    ...overrides,
  };
}

function disabledEnv() {
  return {
    GOOGLE_MAPS_API_KEY: mapsKeySentinel,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Map Route Estimate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED: undefined,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "google_routes",
  };
}

function adminHeaders(overrides = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    ...overrides,
  };
}

function sessionHeaders(overrides = {}) {
  return adminHeaders({
    "x-prestige-admin-session-token": serverSessionToken,
    ...overrides,
  });
}

function routePayload(overrides = {}) {
  return {
    booking_reference: "MAP-ROUTE-ESTIMATE-TEST-001",
    destination: "Changi Airport Terminal 3",
    origin: "Raffles Hotel Singapore",
    waypoints: ["Marina Bay Sands"],
    ...overrides,
  };
}

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeApiLeakPattern, label);
  assert.doesNotMatch(text, unsafeMapRouteEstimateLeakPattern, label);
}

function installFetchMock({
  ok = true,
  payload = {
    routes: [
      {
        distanceMeters: 22750,
        duration: "2150s",
        polyline: {
          encodedPolyline: "safeEncodedPolylineForAdminRouteOnly",
        },
        staticDuration: "1980s",
      },
    ],
  },
  status = 200,
} = {}) {
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const call = {
      body: options.body ? JSON.parse(String(options.body)) : null,
      headers: Object.fromEntries(new Headers(options.headers || {}).entries()),
      method: options.method || "GET",
      url: String(url),
    };

    calls.push(call);

    return new Response(JSON.stringify(payload), {
      headers: {
        "content-type": "application/json",
      },
      status,
      statusText: ok ? "OK" : "Provider failed",
    });
  };

  return calls;
}

const harness = await loadHarness();

try {
  const { estimates, route } = harness;

  assert.equal(estimates.adminMapRouteEstimateVersion, "stage-admin-map-route-estimate-v1");

  assert.deepEqual(estimates.parseAdminMapRouteEstimatePayload(routePayload()), {
    data: {
      destination: "Changi Airport Terminal 3",
      origin: "Raffles Hotel Singapore",
      safe_route_context: {
        booking_reference: "MAP-ROUTE-ESTIMATE-TEST-001",
        source: "admin_map_route_estimate",
      },
      waypoints: ["Marina Bay Sands"],
    },
    ok: true,
  });

  for (const [label, payload] of [
    ["missing origin", routePayload({ origin: "" })],
    ["missing destination", routePayload({ destination: "" })],
    ["unsafe origin", routePayload({ origin: "customer_price route" })],
    ["unsafe booking reference", routePayload({ booking_reference: "payment_link" })],
    [
      "too many waypoints",
      routePayload({
        waypoints: [
          "Stop 1",
          "Stop 2",
          "Stop 3",
          "Stop 4",
          "Stop 5",
          "Stop 6",
          "Stop 7",
        ],
      }),
    ],
  ]) {
    const parsed = estimates.parseAdminMapRouteEstimatePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, "Admin map route estimate details are malformed.");
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  setEnv(disabledEnv());

  const disabledFetchCalls = installFetchMock();
  const disabledResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledMapRouteEstimateError,
    ok: false,
  });
  assert.equal(disabledFetchCalls.length, 0, "disabled route should not call map provider");
  assertNoLeaks(disabledResult, "disabled response should stay safe");

  for (const [label, request] of [
    [
      "anonymous POST",
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        method: "POST",
      }),
    ],
    [
      "customer referer POST",
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders({ referer: "http://localhost/book" }),
        method: "POST",
      }),
    ],
    [
      "driver referer POST",
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders({ referer: "http://localhost/driver-job-demo" }),
        method: "POST",
      }),
    ],
    [
      "wrong token POST",
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
        method: "POST",
      }),
    ],
  ]) {
    setEnv(enabledEnv());

    const blockedFetchCalls = installFetchMock();
    const result = await readRouteResponse(await route.POST(request));

    assert.equal(result.status, 403, `${label}: expected route boundary block`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assert.equal(blockedFetchCalls.length, 0, `${label}: expected no map provider call`);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv());

  const fetchCalls = installFetchMock();
  const readResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.deepEqual(readResult.body, {
    ok: true,
    route_estimate: {
      distance_meters: 22750,
      duration_seconds: 2150,
      encoded_polyline: "safeEncodedPolylineForAdminRouteOnly",
      provider: "google_routes",
      safe_route_context: {
        booking_reference: "MAP-ROUTE-ESTIMATE-TEST-001",
        route_status: "estimated",
        source: "admin_map_route_estimate",
      },
      static_duration_seconds: 1980,
      version: "stage-admin-map-route-estimate-v1",
    },
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://maps-route-estimate-contract.test/computeRoutes",
  );
  assert.equal(fetchCalls[0].method, "POST");
  assert.deepEqual(fetchCalls[0].body, {
    computeAlternativeRoutes: false,
    destination: {
      address: "Changi Airport Terminal 3",
    },
    intermediates: [
      {
        address: "Marina Bay Sands",
      },
    ],
    languageCode: "en",
    origin: {
      address: "Raffles Hotel Singapore",
    },
    routingPreference: "TRAFFIC_AWARE",
    travelMode: "DRIVE",
    units: "METRIC",
  });
  assert.equal(fetchCalls[0].headers["x-goog-api-key"], mapsKeySentinel);
  assert.equal(
    fetchCalls[0].headers["x-goog-fieldmask"],
    "routes.distanceMeters,routes.duration,routes.staticDuration,routes.polyline.encodedPolyline",
  );
  assertNoLeaks(readResult, "map route estimate response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const dispatcherFetchCalls = installFetchMock({
    payload: {
      routes: [
        {
          distanceMeters: 8020,
          duration: "920s",
        },
      ],
    },
  });
  const dispatcherResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(
          routePayload({
            booking_reference: "",
            destination: "Singapore Flyer",
            origin: "Gardens by the Bay",
            waypoints: [],
          }),
        ),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(dispatcherResult.status, 200);
  assert.deepEqual(dispatcherResult.body.route_estimate, {
    distance_meters: 8020,
    duration_seconds: 920,
    encoded_polyline: null,
    provider: "google_routes",
    safe_route_context: {
      route_status: "estimated",
      source: "admin_map_route_estimate",
    },
    static_duration_seconds: null,
    version: "stage-admin-map-route-estimate-v1",
  });
  assert.equal(dispatcherFetchCalls.length, 1);
  assertNoLeaks(dispatcherResult, "dispatcher route estimate response should stay safe");

  setEnv(enabledEnv({ GOOGLE_MAPS_API_KEY: undefined, PRESTIGE_GOOGLE_MAPS_API_KEY: undefined }));

  const missingKeyFetchCalls = installFetchMock();
  const missingKeyResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(missingKeyResult.status, 503);
  assert.deepEqual(missingKeyResult.body, {
    error: "Admin map route estimate configuration is not ready.",
    ok: false,
  });
  assert.equal(missingKeyFetchCalls.length, 0, "missing key should not call map provider");
  assertNoLeaks(missingKeyResult, "missing key response should stay safe");

  setEnv(enabledEnv());

  const badProviderFetchCalls = installFetchMock({
    payload: {
      routes: [
        {
          duration: "920s",
        },
      ],
    },
  });
  const badProviderResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(badProviderResult.status, 502);
  assert.deepEqual(badProviderResult.body, {
    error: "Admin map route estimate provider failed safely.",
    ok: false,
  });
  assert.equal(badProviderFetchCalls.length, 1);
  assertNoLeaks(badProviderResult, "provider failure response should stay safe");
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("Admin map route estimate API contract tests passed.");
