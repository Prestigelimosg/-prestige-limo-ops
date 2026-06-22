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
const configMapRouteEstimateError =
  "Admin map route estimate configuration is not ready.";
const serverSessionToken = "mock-admin-map-route-estimate-session-token";
const googleMapsKeySentinel = "GOOGLE_MAPS_ROUTE_ESTIMATE_SENTINEL";
const safeApiLeakPattern =
  /GOOGLE_MAPS_ROUTE_ESTIMATE_SENTINEL|mock-admin-map-route-estimate-session-token|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeMapRouteEstimateLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-map-route-estimates.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-map-route-estimates/route.ts",
];
const originalEnv = {
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
  PRESTIGE_GOOGLE_MAPS_ROUTE_ENDPOINT:
    process.env.PRESTIGE_GOOGLE_MAPS_ROUTE_ENDPOINT,
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
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Google Maps Route Estimate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED: "true",
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "google_maps_routes",
    PRESTIGE_GOOGLE_MAPS_API_KEY: googleMapsKeySentinel,
    PRESTIGE_GOOGLE_MAPS_ROUTE_ENDPOINT:
      "https://google-maps-route-estimate-contract.test/directions/v2:computeRoutes",
    ...overrides,
  };
}

function disabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Google Maps Route Estimate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_ENABLED: undefined,
    PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "google_maps_routes",
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
    booking_reference: "GOOGLE-MAPS-ROUTE-TEST-001",
    destination: {
      label: "Changi Airport Terminal 2",
      latitude: 1.3554,
      longitude: 103.9896,
    },
    origin: {
      label: "Raffles Hotel Singapore",
      latitude: 1.295526,
      longitude: 103.854331,
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
  payload = {
    routes: [
      {
        distanceMeters: 19020,
        duration: "1680s",
        polyline: {
          encodedPolyline: "googleRoutePolyline",
        },
      },
    ],
  },
  status = 200,
} = {}) {
  const calls = [];

  globalThis.fetch = async (url, options = {}) => {
    const requestUrl = new URL(String(url));
    const call = {
      body: options.body ? JSON.parse(String(options.body)) : null,
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
    });
  };

  return calls;
}

const harness = await loadHarness();

try {
  const { estimates, route } = harness;

  assert.equal(estimates.adminMapRouteEstimateVersion, "stage-admin-map-route-estimate-v2");

  const routeHelperSource = await readFile("lib/admin-map-route-estimates.ts", "utf8");

  for (const retiredFragment of [
    "onemap_routing",
    "PRESTIGE_ONEMAP_ACCESS_TOKEN",
    "ONEMAP_ACCESS_TOKEN",
    "PRESTIGE_ONEMAP_ROUTING_ENDPOINT",
    "onemap.gov",
  ]) {
    assert.equal(
      routeHelperSource.includes(retiredFragment),
      false,
      `route estimate helper must not keep retired OneMap fragment ${retiredFragment}`,
    );
  }

  assert.deepEqual(estimates.parseAdminMapRouteEstimatePayload(routePayload()), {
    data: {
      destination: {
        label: "Changi Airport Terminal 2",
        latitude: 1.3554,
        longitude: 103.9896,
      },
      origin: {
        label: "Raffles Hotel Singapore",
        latitude: 1.295526,
        longitude: 103.854331,
      },
      route_type: "drive",
      safe_route_context: {
        booking_reference: "GOOGLE-MAPS-ROUTE-TEST-001",
        source: "admin_map_route_estimate",
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
          source: "admin_map_route_estimate",
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
          latitude: 1.295526,
          longitude: 103.854331,
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
          longitude: 103.854331,
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
  assert.equal(disabledFetchCalls.length, 0, "disabled route should not call Google Maps");
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
    assert.equal(blockedFetchCalls.length, 0, `${label}: expected no Google Maps call`);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv({ PRESTIGE_GOOGLE_MAPS_API_KEY: undefined }));

  const missingGoogleKeyFetchCalls = installFetchMock();
  const missingGoogleKeyResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(missingGoogleKeyResult.status, 503);
  assert.deepEqual(missingGoogleKeyResult.body, {
    error: configMapRouteEstimateError,
    ok: false,
  });
  assert.equal(
    missingGoogleKeyFetchCalls.length,
    0,
    "missing Google key should not call Google Maps",
  );
  assertNoLeaks(missingGoogleKeyResult, "missing Google key response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_MAP_ROUTE_ESTIMATES_PROVIDER: "onemap_routing" }));

  const retiredProviderFetchCalls = installFetchMock();
  const retiredProviderResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(retiredProviderResult.status, 503);
  assert.deepEqual(retiredProviderResult.body, {
    error: configMapRouteEstimateError,
    ok: false,
  });
  assert.equal(
    retiredProviderFetchCalls.length,
    0,
    "retired OneMap provider config should not call a provider",
  );
  assertNoLeaks(retiredProviderResult, "retired OneMap provider response should stay safe");

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

  setEnv(enabledEnv());

  const googleRouteFetchCalls = installFetchMock();
  const googleRouteResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-map-route-estimates", {
        body: JSON.stringify(routePayload()),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(googleRouteResult.status, 200);
  assert.deepEqual(googleRouteResult.body, {
    ok: true,
    route_estimate: {
      distance_meters: 19020,
      duration_seconds: 1680,
      encoded_geometry: "googleRoutePolyline",
      provider: "google_maps_routes",
      route_type: "drive",
      safe_route_context: {
        booking_reference: "GOOGLE-MAPS-ROUTE-TEST-001",
        route_status: "estimated",
        source: "admin_map_route_estimate",
      },
      version: "stage-admin-map-route-estimate-v2",
    },
  });
  assert.equal(googleRouteFetchCalls.length, 1);
  assert.equal(
    googleRouteFetchCalls[0].url,
    "https://google-maps-route-estimate-contract.test/directions/v2:computeRoutes",
  );
  assert.equal(googleRouteFetchCalls[0].method, "POST");
  assert.equal(googleRouteFetchCalls[0].headers["x-goog-api-key"], googleMapsKeySentinel);
  assert.equal(
    googleRouteFetchCalls[0].headers["x-goog-fieldmask"],
    "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
  );
  assert.deepEqual(googleRouteFetchCalls[0].body, {
    computeAlternativeRoutes: false,
    destination: {
      location: {
        latLng: {
          latitude: 1.3554,
          longitude: 103.9896,
        },
      },
    },
    origin: {
      location: {
        latLng: {
          latitude: 1.295526,
          longitude: 103.854331,
        },
      },
    },
    routingPreference: "TRAFFIC_UNAWARE",
    travelMode: "DRIVE",
    units: "METRIC",
  });
  assertNoLeaks(googleRouteResult, "Google Maps route estimate response should stay safe");
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("Admin map route estimate API contract tests passed.");
