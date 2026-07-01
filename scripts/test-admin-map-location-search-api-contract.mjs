import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledLocationSearchError =
  "Admin map location search is not enabled on this server.";
const configLocationSearchError =
  "Admin map location search configuration is not ready.";
const serverSessionToken = "mock-admin-map-location-search-session-token";
const googleMapsKeySentinel = "GOOGLE_MAPS_LOCATION_SEARCH_SENTINEL";
const safeApiLeakPattern =
  /GOOGLE_MAPS_LOCATION_SEARCH_SENTINEL|mock-admin-map-location-search-session-token|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeLocationSearchLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-map-location-search.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-map-location-search/route.ts",
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
  PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED:
    process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED,
  PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER:
    process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER,
  PRESTIGE_GOOGLE_MAPS_API_KEY: process.env.PRESTIGE_GOOGLE_MAPS_API_KEY,
  PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT:
    process.env.PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-map-location-search-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    locations: require(path.join(tempDir, "lib/admin-map-location-search.js")),
    route: require(path.join(tempDir, "app/api/admin-map-location-search/route.js")),
  };
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Google Maps Location Search Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED: "true",
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER: "google_maps_geocoding",
    PRESTIGE_GOOGLE_MAPS_API_KEY: googleMapsKeySentinel,
    PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT:
      "https://google-maps-location-search-contract.test/maps/api/geocode/json",
    ...overrides,
  };
}

function disabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Google Maps Location Search Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED: undefined,
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER: "google_maps_geocoding",
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

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeApiLeakPattern, label);
  assert.doesNotMatch(text, unsafeLocationSearchLeakPattern, label);
}

function installFetchMock({
  payload = {
    results: [
      {
        address_components: [
          {
            long_name: "189673",
            short_name: "189673",
            types: ["postal_code"],
          },
        ],
        formatted_address: "1 Beach Road, Singapore 189673",
        geometry: {
          location: {
            lat: 1.295526,
            lng: 103.854331,
          },
        },
      },
    ],
    status: "OK",
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
    });
  };

  return calls;
}

const harness = await loadHarness();

try {
  const { locations, route } = harness;

  assert.equal(
    locations.adminMapLocationSearchVersion,
    "stage-admin-map-location-search-v2",
  );

  const locationHelperSource = await readFile("lib/admin-map-location-search.ts", "utf8");

  for (const retiredFragment of [
    "onemap_search",
    "PRESTIGE_ONEMAP_ACCESS_TOKEN",
    "ONEMAP_ACCESS_TOKEN",
    "PRESTIGE_ONEMAP_SEARCH_ENDPOINT",
    "onemap.gov",
  ]) {
    assert.equal(
      locationHelperSource.includes(retiredFragment),
      false,
      `location helper must not keep retired OneMap fragment ${retiredFragment}`,
    );
  }

  assert.deepEqual(
    locations.parseAdminMapLocationSearchParams(
      new URLSearchParams("query=Raffles%20Hotel%20Singapore&page=1"),
    ),
    {
      data: {
        page: 1,
        query: "Raffles Hotel Singapore",
        safe_route_context: {
          source: "admin_map_location_search",
        },
      },
      ok: true,
    },
  );

  for (const [label, params, expectedError] of [
    ["missing query", "", "Admin map location search query is malformed."],
    [
      "unsafe query",
      "query=customer_price",
      "Admin map location search query is malformed.",
    ],
    [
      "email query",
      "query=ops%40example.com",
      "Admin map location search query is malformed.",
    ],
    [
      "phone query",
      "query=91234567",
      "Admin map location search query is malformed.",
    ],
    ["bad page", "query=Raffles%20Hotel&page=0", "Admin map location search page is malformed."],
  ]) {
    const parsed = locations.parseAdminMapLocationSearchParams(new URLSearchParams(params));

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  setEnv(disabledEnv());

  const disabledFetchCalls = installFetchMock();
  const disabledResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledLocationSearchError,
    ok: false,
  });
  assert.equal(disabledFetchCalls.length, 0, "disabled route should not call Google Maps");
  assertNoLeaks(disabledResult, "disabled response should stay safe");

  for (const [label, request] of [
    [
      "missing admin purpose",
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: {
          referer: "http://localhost/",
          "x-prestige-admin-session-token": serverSessionToken,
        },
      }),
    ],
    [
      "customer page referer",
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders({
          referer: "http://localhost/my-bookings",
        }),
      }),
    ],
    [
      "driver page referer",
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders({
          referer: "http://localhost/driver-job-demo",
        }),
      }),
    ],
  ]) {
    setEnv(enabledEnv());
    const blockedFetchCalls = installFetchMock();
    const result = await readRouteResponse(await route.GET(request));

    assert.equal(result.status, 403, `${label}: expected blocked route`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assert.equal(blockedFetchCalls.length, 0, `${label}: expected no Google Maps call`);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  for (const [label, request] of [
    [
      "same-origin admin GET without request token",
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: adminHeaders(),
      }),
    ],
    [
      "same-origin admin GET with ignored wrong request token",
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders({
          "x-prestige-admin-session-token": "wrong-token",
        }),
      }),
    ],
  ]) {
    setEnv(enabledEnv());
    const safeReadFetchCalls = installFetchMock();
    const result = await readRouteResponse(await route.GET(request));

    assert.equal(result.status, 200, `${label}: expected safe admin read`);
    assert.equal(result.body.ok, true, `${label}: expected ok response`);
    assert.equal(
      result.body.location_search?.safe_route_context?.source,
      "admin_map_location_search",
      `${label}: expected admin search context`,
    );
    assert.equal(safeReadFetchCalls.length, 1, `${label}: expected one Google Maps call`);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "driver" }));

  const driverRoleFetchCalls = installFetchMock();
  const driverRoleResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(driverRoleResult.status, 403);
  assert.deepEqual(driverRoleResult.body, {
    error: routeBlockedMessage,
    ok: false,
  });
  assert.equal(driverRoleFetchCalls.length, 0, "driver role should not call Google Maps");
  assertNoLeaks(driverRoleResult, "driver role response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_GOOGLE_MAPS_API_KEY: undefined }));

  const missingGoogleKeyFetchCalls = installFetchMock();
  const missingGoogleKeyResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(missingGoogleKeyResult.status, 503);
  assert.deepEqual(missingGoogleKeyResult.body, {
    error: configLocationSearchError,
    ok: false,
  });
  assert.equal(
    missingGoogleKeyFetchCalls.length,
    0,
    "missing Google key should not call Google Maps",
  );
  assertNoLeaks(missingGoogleKeyResult, "missing Google key response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER: "onemap_search" }));

  const retiredProviderFetchCalls = installFetchMock();
  const retiredProviderResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(retiredProviderResult.status, 503);
  assert.deepEqual(retiredProviderResult.body, {
    error: configLocationSearchError,
    ok: false,
  });
  assert.equal(
    retiredProviderFetchCalls.length,
    0,
    "retired OneMap provider config should not call a provider",
  );
  assertNoLeaks(retiredProviderResult, "retired OneMap provider response should stay safe");

  setEnv(enabledEnv());

  for (const [label, mockOptions] of [
    ["provider error body", { payload: { results: [], status: "REQUEST_DENIED" } }],
    ["bad provider status", { payload: {}, status: 429 }],
  ]) {
    const badProviderFetchCalls = installFetchMock(mockOptions);
    const badProviderResult = await readRouteResponse(
      await route.GET(
        new Request("http://localhost/api/admin-map-location-search?query=Raffles%20Hotel", {
          headers: sessionHeaders(),
        }),
      ),
    );

    assert.equal(badProviderResult.status, 502, `${label}: expected provider failure`);
    assert.deepEqual(badProviderResult.body, {
      error: "Admin map location search provider failed safely.",
      ok: false,
    });
    assert.equal(badProviderFetchCalls.length, 1);
    assertNoLeaks(badProviderResult, `${label}: provider failure response should stay safe`);
  }

  setEnv(enabledEnv());

  const googleFetchCalls = installFetchMock();
  const googleSearchResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-map-location-search?query=Raffles%20Hotel%20Singapore&page=1",
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(googleSearchResult.status, 200);
  assert.deepEqual(googleSearchResult.body, {
    location_search: {
      found: 1,
      page: 1,
      provider: "google_maps_geocoding",
      query: "Raffles Hotel Singapore",
      results: [
        {
          address: "1 Beach Road, Singapore 189673",
          block_no: null,
          building: null,
          label: "1 Beach Road, Singapore 189673",
          latitude: 1.295526,
          longitude: 103.854331,
          postal: "189673",
          road_name: null,
        },
      ],
      safe_route_context: {
        search_status: "loaded",
        source: "admin_map_location_search",
      },
      total_pages: 1,
      version: "stage-admin-map-location-search-v2",
    },
    ok: true,
  });
  assert.equal(googleFetchCalls.length, 1);
  assert.equal(
    googleFetchCalls[0].url,
    "https://google-maps-location-search-contract.test/maps/api/geocode/json",
  );
  assert.equal(googleFetchCalls[0].method, "GET");
  assert.deepEqual(googleFetchCalls[0].searchParams, {
    address: "Raffles Hotel Singapore",
    components: "country:SG",
    key: googleMapsKeySentinel,
    region: "sg",
  });
  assert.equal(
    Object.keys(googleFetchCalls[0].headers).length,
    0,
    "Google geocoding request should not send token headers",
  );
  assertNoLeaks(googleSearchResult, "Google Maps location search response should stay safe");
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("Admin map location search API contract tests passed.");
