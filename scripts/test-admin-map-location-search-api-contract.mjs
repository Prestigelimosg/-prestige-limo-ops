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
const serverSessionToken = "mock-admin-onemap-location-search-session-token";
const googleMapsKeySentinel = "GOOGLE_MAPS_LOCATION_SEARCH_SENTINEL";
const oneMapTokenSentinel = "ONEMAP_ACCESS_TOKEN_LOCATION_SEARCH_SENTINEL";
const safeApiLeakPattern =
  /ONEMAP_ACCESS_TOKEN_LOCATION_SEARCH_SENTINEL|mock-admin-onemap-location-search-session-token|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeLocationSearchLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-map-location-search.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-map-location-search/route.ts",
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
  PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED:
    process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED,
  PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER:
    process.env.PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER,
  PRESTIGE_GOOGLE_MAPS_API_KEY: process.env.PRESTIGE_GOOGLE_MAPS_API_KEY,
  PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT:
    process.env.PRESTIGE_GOOGLE_MAPS_SEARCH_ENDPOINT,
  PRESTIGE_ONEMAP_ACCESS_TOKEN: process.env.PRESTIGE_ONEMAP_ACCESS_TOKEN,
  PRESTIGE_ONEMAP_SEARCH_ENDPOINT: process.env.PRESTIGE_ONEMAP_SEARCH_ENDPOINT,
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-onemap-location-search-"));

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
    ONEMAP_ACCESS_TOKEN: oneMapTokenSentinel,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "OneMap Location Search Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED: "true",
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER: "onemap_search",
    PRESTIGE_ONEMAP_SEARCH_ENDPOINT:
      "https://onemap-location-search-contract.test/elastic/search",
    ...overrides,
  };
}

function googleEnabledEnv(overrides = {}) {
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
    ONEMAP_ACCESS_TOKEN: oneMapTokenSentinel,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "OneMap Location Search Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_ENABLED: undefined,
    PRESTIGE_ADMIN_MAP_LOCATION_SEARCH_PROVIDER: "onemap_search",
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
    found: 1,
    pageNum: 1,
    results: [
      {
        ADDRESS: "640 ROWELL ROAD SINGAPORE 200640",
        BLK_NO: "640",
        BUILDING: "NIL",
        LATITUDE: "1.30743547948389",
        LONGITUDE: "103.854713903431",
        POSTAL: "200640",
        ROAD_NAME: "ROWELL ROAD",
        SEARCHVAL: "640 ROWELL ROAD SINGAPORE 200640",
      },
    ],
    totalNumPages: 1,
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

  assert.deepEqual(
    locations.parseAdminMapLocationSearchParams(
      new URLSearchParams("query=200640&page=2"),
    ),
    {
      data: {
        page: 2,
        query: "200640",
        safe_route_context: {
          source: "admin_map_location_search",
        },
      },
      ok: true,
    },
  );

  assert.deepEqual(
    locations.parseAdminMapLocationSearchParams(
      new URLSearchParams("searchVal=Revenue%20House&pageNum=01"),
    ),
    {
      data: {
        page: 1,
        query: "Revenue House",
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
    ["bad page", "query=200640&page=0", "Admin map location search page is malformed."],
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
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledLocationSearchError,
    ok: false,
  });
  assert.equal(disabledFetchCalls.length, 0, "disabled route should not call OneMap");
  assertNoLeaks(disabledResult, "disabled response should stay safe");

  for (const [label, request] of [
    [
      "missing admin purpose",
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: {
          referer: "http://localhost/",
          "x-prestige-admin-session-token": serverSessionToken,
        },
      }),
    ],
    [
      "customer page referer",
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: sessionHeaders({
          referer: "http://localhost/my-bookings",
        }),
      }),
    ],
    [
      "driver page referer",
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: sessionHeaders({
          referer: "http://localhost/driver-job-demo",
        }),
      }),
    ],
    [
      "missing session token",
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: adminHeaders(),
      }),
    ],
    [
      "wrong session token",
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: sessionHeaders({
          "x-prestige-admin-session-token": "wrong-token",
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
    assert.equal(blockedFetchCalls.length, 0, `${label}: expected no OneMap call`);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "driver" }));

  const driverRoleFetchCalls = installFetchMock();
  const driverRoleResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(driverRoleResult.status, 403);
  assert.deepEqual(driverRoleResult.body, {
    error: routeBlockedMessage,
    ok: false,
  });
  assert.equal(driverRoleFetchCalls.length, 0, "driver role should not call OneMap");
  assertNoLeaks(driverRoleResult, "driver role response should stay safe");

  setEnv(enabledEnv());

  const fetchCalls = installFetchMock();
  const searchResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=200640&page=1", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(searchResult.status, 200);
  assert.deepEqual(searchResult.body, {
    location_search: {
      found: 1,
      page: 1,
      provider: "onemap_search",
      query: "200640",
      results: [
        {
          address: "640 ROWELL ROAD SINGAPORE 200640",
          block_no: "640",
          building: null,
          label: "640 ROWELL ROAD SINGAPORE 200640",
          latitude: 1.30743547948389,
          longitude: 103.854713903431,
          postal: "200640",
          road_name: "ROWELL ROAD",
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
  assert.equal(fetchCalls.length, 1);
  assert.equal(
    fetchCalls[0].url,
    "https://onemap-location-search-contract.test/elastic/search",
  );
  assert.equal(fetchCalls[0].method, "GET");
  assert.deepEqual(fetchCalls[0].searchParams, {
    getAddrDetails: "Y",
    pageNum: "1",
    returnGeom: "Y",
    searchVal: "200640",
  });
  assert.equal(fetchCalls[0].headers.authorization, oneMapTokenSentinel);
  assertNoLeaks(searchResult, "OneMap location search response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const dispatcherFetchCalls = installFetchMock({
    payload: {
      found: 0,
      pageNum: 2,
      results: [],
      totalNumPages: 0,
    },
  });
  const dispatcherResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?q=No%20matching%20address&page=2", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(dispatcherResult.status, 200);
  assert.deepEqual(dispatcherResult.body.location_search, {
    found: 0,
    page: 2,
    provider: "onemap_search",
    query: "No matching address",
    results: [],
    safe_route_context: {
      search_status: "loaded",
      source: "admin_map_location_search",
    },
    total_pages: 0,
    version: "stage-admin-map-location-search-v2",
  });
  assert.equal(dispatcherFetchCalls.length, 1);
  assert.deepEqual(dispatcherFetchCalls[0].searchParams, {
    getAddrDetails: "Y",
    pageNum: "2",
    returnGeom: "Y",
    searchVal: "No matching address",
  });
  assertNoLeaks(dispatcherResult, "dispatcher OneMap location search response should stay safe");

  setEnv(enabledEnv({ ONEMAP_ACCESS_TOKEN: undefined, PRESTIGE_ONEMAP_ACCESS_TOKEN: undefined }));

  const missingTokenFetchCalls = installFetchMock();
  const missingTokenResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-map-location-search?query=200640", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(missingTokenResult.status, 503);
  assert.deepEqual(missingTokenResult.body, {
    error: "Admin map location search configuration is not ready.",
    ok: false,
  });
  assert.equal(missingTokenFetchCalls.length, 0, "missing token should not call OneMap");
  assertNoLeaks(missingTokenResult, "missing token response should stay safe");

  setEnv(enabledEnv());

  for (const [label, mockOptions] of [
    ["provider error body", { payload: { error: "Authentication token missing.", results: [] } }],
    ["bad provider status", { payload: {}, status: 429 }],
  ]) {
    const badProviderFetchCalls = installFetchMock(mockOptions);
    const badProviderResult = await readRouteResponse(
      await route.GET(
        new Request("http://localhost/api/admin-map-location-search?query=200640", {
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

  setEnv(googleEnabledEnv());

  const googleFetchCalls = installFetchMock({
    payload: {
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
  });
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

  setEnv(googleEnabledEnv({ PRESTIGE_GOOGLE_MAPS_API_KEY: undefined }));

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
    error: "Admin map location search configuration is not ready.",
    ok: false,
  });
  assert.equal(
    missingGoogleKeyFetchCalls.length,
    0,
    "missing Google key should not call Google Maps",
  );
  assertNoLeaks(missingGoogleKeyResult, "missing Google key response should stay safe");
} finally {
  restoreEnv();
  globalThis.fetch = originalFetch;
  await harness.cleanup();
}

console.log("Admin map location search API contract tests passed.");
