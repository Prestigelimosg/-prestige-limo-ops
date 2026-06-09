import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledBiddingPersistenceError =
  "Driver portal bidding persistence is not enabled on this server.";
const driverBidBlockedError =
  "Driver bidding requires approved driver auth before runtime access.";
const serverSessionToken = "mock-driver-portal-bidding-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_DRIVER_BIDDING_SENTINEL";
const supabaseUrlSentinel = "https://driver-bidding-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_DRIVER_BIDDING_SENTINEL|mock-driver-portal-bidding-admin-session-token|driver-bidding-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeBiddingLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice_number|final_invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token/i;
const sourceFiles = [
  "lib/admin-booking-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/driver-portal-bidding-persistence.ts",
  "app/api/admin-driver-job-bid-offers/route.ts",
  "app/api/driver-job-bids/route.ts",
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
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  SUPABASE_URL: process.env.SUPABASE_URL,
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
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
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeDriverBiddingApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-bidding-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    driverRoute: require(path.join(tempDir, "app/api/driver-job-bids/route.js")),
    persistence: require(path.join(tempDir, "lib/driver-portal-bidding-persistence.js")),
    route: require(path.join(tempDir, "app/api/admin-driver-job-bid-offers/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.payload = null;
    this.resultLimit = null;
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
  }

  eq(column, value) {
    this.filters.push({
      column,
      type: "eq",
      value,
    });

    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  select(columns) {
    if (!this.operation) {
      this.operation = "select";
    }

    this.selectedColumns = columns;

    return this;
  }

  single() {
    this.resultMode = "single";

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  execute() {
    if (this.operation === "insert") {
      return this.client.insertRows(this.table, this.payload, this.resultMode);
    }

    if (this.operation === "update") {
      return this.client.updateRows(this.table, this.payload, this.filters, this.resultMode);
    }

    return this.client.selectRows(
      this.table,
      this.filters,
      this.resultMode,
      this.selectedColumns,
      this.resultLimit,
    );
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.nextId = 1;
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      driver_job_bid_offers: [],
      driver_job_bids: [],
    };

    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => clone(row));
    }
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  failureFor(action, table) {
    return this.failures[`${action}:${table}`] || this.failures[table] || null;
  }

  filterRows(table, filters) {
    return this.tables[table].filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    );
  }

  insertRows(table, payload, mode) {
    const failure = this.failureFor("insert", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
      id: row.id || `mock-${table}-${this.nextId++}`,
      created_at: row.created_at || "2026-06-10T01:00:00.000Z",
      ...clone(row),
    }));

    this.operations.push({
      action: "insert",
      payload: clone(payload),
      table,
    });
    this.tables[table].push(...rows);

    return {
      data: mode === "single" ? rows[0] : rows,
      error: null,
    };
  }

  selectRows(table, filters, mode, columns, limit) {
    const failure = this.failureFor("select", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.filterRows(table, filters).slice(0, limit || undefined);

    this.selectHistory.push({
      columns,
      filters: clone(filters),
      limit,
      table,
    });

    return {
      data: mode === "single" ? rows[0] || null : clone(rows),
      error: null,
    };
  }

  updateRows(table, payload, filters, mode) {
    const failure = this.failureFor("update", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.filterRows(table, filters);

    for (const row of rows) {
      Object.assign(row, clone(payload));
    }

    this.operations.push({
      action: "update",
      filters: clone(filters),
      payload: clone(payload),
      table,
    });

    return {
      data: mode === "single" ? clone(rows[0] || null) : clone(rows),
      error: null,
    };
  }
}

function adminRequest(pathname, init = {}) {
  return new Request(`http://localhost${pathname}`, {
    ...init,
    headers: {
      origin: "http://localhost",
      referer: "http://localhost/",
      "content-type": "application/json",
      "x-prestige-admin-purpose": "admin-booking-persistence",
      "x-prestige-admin-session-token": serverSessionToken,
      ...(init.headers || {}),
    },
  });
}

function publicRequest(pathname, init = {}) {
  return new Request(`http://localhost${pathname}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers || {}),
    },
  });
}

async function readJson(response) {
  return response.json();
}

function enableAdminPersistence(client) {
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Driver bidding admin contract",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  });
  globalThis.__prestigeDriverBiddingApiMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeDriverBiddingApiMock;
}

function disableAdminPersistence(client) {
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Driver bidding admin contract",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  });
  globalThis.__prestigeDriverBiddingApiMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeDriverBiddingApiMock;
}

const harness = await loadHarness();

try {
  const {
    driverPortalBidBlockedError: exportedDriverBidBlockedError,
    parseAdminDriverJobBidOfferLoadParams,
    parseAdminDriverJobBidOfferSavePayload,
    parseAdminDriverJobBidOfferStatusUpdatePayload,
  } = harness.persistence;

  assert.equal(exportedDriverBidBlockedError, driverBidBlockedError);

  const validSavePayload = {
    booking_reference: "BID-API-CONTRACT-001",
    closes_at: "2026-06-10T08:00:00.000Z",
    offer_status: "open",
    pickup_at: "2026-06-10T10:00:00.000Z",
    safe_dropoff_area: "Changi Airport",
    safe_offer_context: {
      next_action: "Wait for driver bids",
      offer_summary: "Advance airport transfer bid offer",
    },
    safe_pickup_area: "Marina Bay",
    safe_trip_summary: "Safe route summary for bidding review",
    safe_vehicle_label: "Alphard",
  };
  const parsedSave = parseAdminDriverJobBidOfferSavePayload(validSavePayload);

  assert.equal(parsedSave.ok, true);
  assert.equal(parsedSave.data.booking_reference, "BID-API-CONTRACT-001");
  assert.equal(parsedSave.data.offer_status, "open");
  assert.equal(parsedSave.data.pickup_at, "2026-06-10T10:00:00.000Z");

  for (const unsafePayload of [
    {
      ...validSavePayload,
      customer_price: 100,
    },
    {
      ...validSavePayload,
      safe_trip_summary: "Include PayNow payout detail",
    },
    {
      ...validSavePayload,
      offer_status: "assigned",
    },
  ]) {
    const parsed = parseAdminDriverJobBidOfferSavePayload(unsafePayload);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, 400);
  }

  const parsedLoad = parseAdminDriverJobBidOfferLoadParams(
    new URLSearchParams({
      bid_status: "pending",
      driver_reference: "driver-001",
      limit: "10",
      offer_status: "open",
      page: "1",
    }),
  );

  assert.equal(parsedLoad.ok, true);
  assert.equal(parsedLoad.data.driver_reference, "driver-001");

  const parsedUnsafeLoad = parseAdminDriverJobBidOfferLoadParams(
    new URLSearchParams({
      customer_price: "100",
    }),
  );

  assert.equal(parsedUnsafeLoad.ok, false);
  assert.equal(parsedUnsafeLoad.status, 400);

  const parsedStatus = parseAdminDriverJobBidOfferStatusUpdatePayload({
    bid_offer_id: "11111111-1111-4111-8111-111111111111",
    offer_status: "closed",
  });

  assert.equal(parsedStatus.ok, true);

  const blockedAdminResponse = await harness.route.GET(
    publicRequest("/api/admin-driver-job-bid-offers"),
  );
  const blockedAdminBody = await readJson(blockedAdminResponse);

  assert.equal(blockedAdminResponse.status, 403);
  assert.equal(blockedAdminBody.error, routeBlockedMessage);
  assert.doesNotMatch(JSON.stringify(blockedAdminBody), safeApiLeakPattern);

  const disabledMock = disableAdminPersistence(new MockSupabaseClient());
  const disabledResponse = await harness.route.GET(
    adminRequest("/api/admin-driver-job-bid-offers"),
  );
  const disabledBody = await readJson(disabledResponse);

  assert.equal(disabledResponse.status, 503);
  assert.equal(disabledBody.error, disabledBiddingPersistenceError);
  assert.equal(disabledMock.createdClients.length, 0);

  const offerId = "22222222-2222-4222-8222-222222222222";
  const getClient = new MockSupabaseClient({
    driver_job_bid_offers: [
      {
        actor_label: "Dispatcher",
        actor_role: "admin",
        booking_reference: "BID-API-CONTRACT-001",
        id: offerId,
        offer_status: "open",
        opened_at: "2026-06-10T01:00:00.000Z",
        pickup_at: "2026-06-10T10:00:00.000Z",
        safe_dropoff_area: "Changi Airport",
        safe_offer_context: {
          offer_summary: "Safe offer",
        },
        safe_pickup_area: "Marina Bay",
        safe_trip_summary: "Safe route summary",
        safe_vehicle_label: "Alphard",
        source_surface: "admin_api",
      },
      {
        booking_reference: "BID-API-CONTRACT-002",
        id: "33333333-3333-4333-8333-333333333333",
        offer_status: "closed",
        pickup_at: "2026-06-11T10:00:00.000Z",
        safe_dropoff_area: "Sentosa",
        safe_offer_context: {},
        safe_pickup_area: "CBD",
        source_surface: "admin_api",
      },
    ],
    driver_job_bids: [
      {
        bid_source: "driver_portal_api",
        bid_status: "pending",
        booking_reference: "BID-API-CONTRACT-001",
        driver_job_bid_offer_id: offerId,
        driver_reference: "driver-001",
        id: "44444444-4444-4444-8444-444444444444",
        safe_bid_context: {},
        safe_driver_label: "Safe Driver Label",
        submitted_at: "2026-06-10T02:00:00.000Z",
      },
    ],
  });
  const getMock = enableAdminPersistence(getClient);
  const getResponse = await harness.route.GET(
    adminRequest("/api/admin-driver-job-bid-offers?offer_status=open&driver_reference=driver-001"),
  );
  const getBody = await readJson(getResponse);

  assert.equal(getResponse.status, 200);
  assert.equal(getBody.ok, true);
  assert.equal(getBody.bid_offers.length, 1);
  assert.equal(getBody.bid_offers[0].booking_reference, "BID-API-CONTRACT-001");
  assert.equal(getBody.bid_offers[0].bids.length, 1);
  assert.equal(getBody.bid_offers[0].bids[0].driver_reference, "driver-001");
  assert.equal(getMock.createdClients.length, 1);
  assert.equal(getClient.selectHistory.length, 2);
  assert.deepEqual(
    getClient.selectHistory.map((query) => query.table).sort(),
    ["driver_job_bid_offers", "driver_job_bids"],
  );
  assert.doesNotMatch(JSON.stringify(getBody), unsafeBiddingLeakPattern);
  assert.doesNotMatch(JSON.stringify(getBody), safeApiLeakPattern);

  const postClient = new MockSupabaseClient();
  const postMock = enableAdminPersistence(postClient);
  const postResponse = await harness.route.POST(
    adminRequest("/api/admin-driver-job-bid-offers", {
      body: JSON.stringify(validSavePayload),
      method: "POST",
    }),
  );
  const postBody = await readJson(postResponse);

  assert.equal(postResponse.status, 200);
  assert.equal(postBody.ok, true);
  assert.equal(postMock.createdClients.length, 1);
  assert.equal(postClient.operations.length, 1);
  assert.equal(postClient.operations[0].action, "insert");
  assert.equal(postClient.operations[0].table, "driver_job_bid_offers");
  assert.equal(postClient.operations[0].payload.actor_role, "admin");
  assert.equal(postClient.operations[0].payload.source_surface, "admin_api");
  assert.equal(postClient.operations[0].payload.booking_reference, "BID-API-CONTRACT-001");
  assert.equal(postClient.operations[0].payload.safe_vehicle_label, "Alphard");
  assert.doesNotMatch(JSON.stringify(postClient.operations[0].payload), unsafeBiddingLeakPattern);

  const patchClient = new MockSupabaseClient({
    driver_job_bid_offers: [
      {
        booking_reference: "BID-API-CONTRACT-001",
        id: offerId,
        offer_status: "open",
        pickup_at: "2026-06-10T10:00:00.000Z",
        safe_dropoff_area: "Changi Airport",
        safe_offer_context: {},
        safe_pickup_area: "Marina Bay",
        source_surface: "admin_api",
      },
    ],
  });
  const patchMock = enableAdminPersistence(patchClient);
  const patchResponse = await harness.route.PATCH(
    adminRequest("/api/admin-driver-job-bid-offers", {
      body: JSON.stringify({
        bid_offer_id: offerId,
        offer_status: "closed",
      }),
      method: "PATCH",
    }),
  );
  const patchBody = await readJson(patchResponse);

  assert.equal(patchResponse.status, 200);
  assert.equal(patchBody.ok, true);
  assert.equal(patchMock.createdClients.length, 1);
  assert.equal(patchClient.operations.length, 1);
  assert.equal(patchClient.operations[0].action, "update");
  assert.equal(patchClient.operations[0].table, "driver_job_bid_offers");
  assert.equal(patchClient.operations[0].payload.offer_status, "closed");
  assert.equal(typeof patchClient.operations[0].payload.closed_at, "string");
  assert.deepEqual(patchClient.operations[0].filters, [
    {
      column: "id",
      type: "eq",
      value: offerId,
    },
  ]);

  const driverBlockedMock = enableAdminPersistence(new MockSupabaseClient());

  for (const [method, call] of [
    ["GET", () => harness.driverRoute.GET(publicRequest("/api/driver-job-bids"))],
    [
      "POST",
      () =>
        harness.driverRoute.POST(
          publicRequest("/api/driver-job-bids", {
            body: JSON.stringify({
              bid_offer_id: offerId,
              driver_reference: "driver-001",
            }),
            method: "POST",
          }),
        ),
    ],
    [
      "PATCH",
      () =>
        harness.driverRoute.PATCH(
          publicRequest("/api/driver-job-bids", {
            body: JSON.stringify({
              bid_id: "55555555-5555-4555-8555-555555555555",
              action: "withdraw",
            }),
            method: "PATCH",
          }),
        ),
    ],
  ]) {
    const response = await call();
    const body = await readJson(response);

    assert.equal(response.status, 403, `${method} driver bid route must stay blocked`);
    assert.equal(body.error, driverBidBlockedError);
    assert.equal(body.ok, false);
    assert.doesNotMatch(JSON.stringify(body), safeApiLeakPattern);
  }

  assert.equal(driverBlockedMock.createdClients.length, 0);

  console.log("Driver portal bidding API contract tests passed.");
} finally {
  restoreEnv();
  delete globalThis.__prestigeDriverBiddingApiMock;
  await harness.cleanup();
}
