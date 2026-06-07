import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledMapRouteEstimateError =
  "Admin OneMap route estimate is not enabled on this server.";
const serverSessionToken = "mock-admin-onemap-route-estimate-session-token";
const oneMapTokenSentinel = "ONEMAP_ACCESS_TOKEN_ROUTE_ESTIMATE_SENTINEL";
const safeApiLeakPattern =
  /ONEMAP_ACCESS_TOKEN_ROUTE_ESTIMATE_SENTINEL|mock-admin-onemap-route-estimate-session-token|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeMapRouteEstimateLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-map-route-estimates.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-map-route-estimates/route.ts",
];
const originalEnv = {
  ONEMAP_ACCESS_TOKEN: process.env.ONEMAP_ACCESS_TOKEN,
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
  PRESTIGE_ONEMAP_ACCESS_TOKEN: process.env.PRESTIGE_ONEMAP_ACCESS_TOKEN,
  PRESTIGE_ONEMAP_ROUTING_ENDPOINT: process.env.PRESTIGE_ONEMAP_ROUTING_ENDPOINT,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-onemap-route-estimate-"));

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
    ONEMAP_ACCESS_TOKEN: oneMapTokenSentinel,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "OneMap Route Estimate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED: "true",
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "onemap_routing",
    PRESTIGE_ONEMAP_ROUTING_ENDPOINT:
      "https://onemap-route-estimate-contract.test/routingsvc/route",
    ...overrides,
  };
}

function disabledEnv() {
  return {
    ONEMAP_ACCESS_TOKEN: oneMapTokenSentinel,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "OneMap Route Estimate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED: undefined,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "onemap_routing",
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
    booking_reference: "ONEMAP-ROUTE-ESTIMATE-TEST-001",
    destination: {
      label: "HarbourFront Centre",
      latitude: 1.2739864,
      longitude: 103.8012642,
    },
    origin: {
      label: "Little India pickup",
      latitude: 1.3081592,
      longitude: 103.8551479,
    },
    route_type: "drive",
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
    route_geometry: "{u`GktxxR?G",
    route_summary: {
      end_point: "destination",
      start_point: "origin",
      total_distance: 22750,
      total_time: 2150,
    },
    status: 0,
    status_message: "Found route between points",
  },
  status = 200,
} = {}) {
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const call = {
      headers: Object.fromEntries(new Headers(options.headers || {}).entries()),
      method: options.method || "GET",
      searchParams: Object.fromEntries(requestUrl.searchParams.entries()),
      url: requestUrl.origin + requestUrl.pathname,
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

  assert.equal(estimates.adminMapRouteEstimateVersion, "stage-admin-onemap-route-estimate-v1");

  assert.deepEqual(estimates.parseAdminMapRouteEstimatePayload(routePayload()), {
    data: {
      destination: {
        label: "HarbourFront Centre",
        latitude: 1.2739864,
        longitude: 103.8012642,
      },
      origin: {
        label: "Little India pickup",
        latitude: 1.3081592,
        longitude: 103.8551479,
      },
      route_type: "drive",
      safe_route_context: {
        booking_reference: "ONEMAP-ROUTE-ESTIMATE-TEST-001",
        source: "admin_onemap_route_estimate",
      },
    },
    ok: true,
  });

  assert.deepEqual(
    estimates.parseAdminMapRouteEstimatePayload({
      destination_latitude: 1.2739864,
      destination_longitude: 103.8012642,
      origin_latitude: 1.3081592,
      origin_longitude: 103.8551479,
      route_type: "walk",
    }),
    {
      data: {
        destination: {
          label: null,
          latitude: 1.2739864,
          longitude: 103.8012642,
        },
        origin: {
          label: null,
          latitude: 1.3081592,
          longitude: 103.8551479,
        },
        route_type: "walk",
        safe_route_context: {
          source: "admin_onemap_route_estimate",
        },
      },
      ok: true,
    },
  );

  for (const [label, payload] of [
    ["missing origin", routePayload({ origin: null })],
    ["missing destination", routePayload({ destination: null })],
    [
      "unsafe origin label",
      routePayload({
        origin: {
          label: "customer_price route",
          latitude: 1.3081592,
          longitude: 103.8551479,
        },
      }),
    ],
    ["unsafe booking reference", routePayload({ booking_reference: "payment_link" })],
    [
      "outside Singapore latitude",
      routePayload({
        origin: {
          label: "Johor pickup",
          latitude: 1.6,
          longitude: 103.8551479,
        },
      }),
    ],
    [
      "bad route type",
      routePayload({
        route_type: "pt",
      }),
    ],
  ]) {
    const parsed = estimates.parseAdminMapRouteEstimatePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, "Admin OneMap route estimate details are malformed.");
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
  assert.equal(disabledFetchCalls.length, 0, "disabled route should not call OneMap");
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
    assert.equal(blockedFetchCalls.length, 0, `${label}: expected no OneMap call`);
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
      encoded_geometry: "{u`GktxxR?G",
      provider: "onemap_routing",
      route_type: "drive",
      safe_route_context: {
        booking_reference: "ONEMAP-ROUTE-ESTIMATE-TEST-001",
        route_status: "estimated",
        source: "admin_onemap_route_estimate",
      },
      version: "stage-admin-onemap-route-estimate-v1",
    },
  });
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://onemap-route-estimate-contract.test/routingsvc/route",
  );
  assert.equal(fetchCalls[0].method, "GET");
  assert.deepEqual(fetchCalls[0].searchParams, {
    end: "1.2739864,103.8012642",
    routeType: "drive",
    start: "1.3081592,103.8551479",
  });
  assert.equal(fetchCalls[0].headers.authorization, oneMapTokenSentinel);
  assertNoLeaks(readResult, "OneMap route estimate response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const dispatcherFetchCalls = installFetchMock({
    payload: {
      route_summary: {
        total_distance: 8020,
        total_time: 920,
      },
    },
  });
  const dispatcherResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(
          routePayload({
            booking_reference: "",
            destination: {
              latitude: 1.2895,
              longitude: 103.8631,
            },
            origin: {
              latitude: 1.2816,
              longitude: 103.8636,
            },
            route_type: "cycle",
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
    encoded_geometry: null,
    provider: "onemap_routing",
    route_type: "cycle",
    safe_route_context: {
      route_status: "estimated",
      source: "admin_onemap_route_estimate",
    },
    version: "stage-admin-onemap-route-estimate-v1",
  });
  assert.equal(dispatcherFetchCalls.length, 1);
  assert.deepEqual(dispatcherFetchCalls[0].searchParams, {
    end: "1.2895,103.8631",
    routeType: "cycle",
    start: "1.2816,103.8636",
  });
  assertNoLeaks(dispatcherResult, "dispatcher OneMap route estimate response should stay safe");

  setEnv(enabledEnv({ ONEMAP_ACCESS_TOKEN: undefined, PRESTIGE_ONEMAP_ACCESS_TOKEN: undefined }));

  const missingTokenFetchCalls = installFetchMock();
  const missingTokenResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(missingTokenResult.status, 503);
  assert.deepEqual(missingTokenResult.body, {
    error: "Admin OneMap route estimate configuration is not ready.",
    ok: false,
  });
  assert.equal(missingTokenFetchCalls.length, 0, "missing token should not call OneMap");
  assertNoLeaks(missingTokenResult, "missing token response should stay safe");

  setEnv(enabledEnv());

  const badProviderFetchCalls = installFetchMock({
    payload: {
      route_summary: {
        total_time: 920,
      },
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
    error: "Admin OneMap route estimate provider failed safely.",
    ok: false,
  });
  assert.equal(badProviderFetchCalls.length, 1);
  assertNoLeaks(badProviderResult, "provider failure response should stay safe");
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("Admin OneMap route estimate API contract tests passed.");
