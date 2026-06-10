import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-customer-saved-bookings-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_SAVED_BOOKINGS_SENTINEL";
const supabaseUrlSentinel = "https://customer-saved-bookings-contract.supabase.co";
const unsafeSavedBookingsLeakPattern =
  /contact_phone|contact_email|passenger|pickup_location|dropoff_location|route_summary|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|service_role/i;
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_SAVED_BOOKINGS_SENTINEL|mock-admin-customer-saved-bookings-session-token|customer-saved-bookings-contract\.supabase\.co|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-customer-saved-bookings-read.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-customer-saved-bookings/route.ts",
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
      "  const mock = globalThis.__prestigeAdminCustomerSavedBookingsReadMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-saved-bookings-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    reader: require(path.join(tempDir, "lib/admin-customer-saved-bookings-read.js")),
    route: require(path.join(tempDir, "app/api/admin-customer-saved-bookings/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.resultLimit = null;
    this.selectedColumns = null;
    this.table = table;
  }

  eq(column, value) {
    this.filters.push({ column, type: "eq", value });

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  order(column, options) {
    this.orderBy = { column, options };

    return this;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    return this.client.selectRows(this.table, this.filters, this.selectedColumns, this.resultLimit);
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      bookings: [],
    };

    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => clone(row));
    }
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  selectRows(table, filters, selectedColumns, resultLimit) {
    const failure = this.failures[`select:${table}`] || this.failures[table] || null;

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.tables[table].slice(0, resultLimit || undefined);

    return {
      data: rows.map((row) => clone(row)),
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeAdminCustomerSavedBookingsReadMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Customer Saved Bookings Read Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  };
}

function sessionHeaders(overrides = {}) {
  return {
    referer: "http://localhost/customers",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
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
  assert.doesNotMatch(text, unsafeSavedBookingsLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const seed = {
  bookings: [
    {
      admin_internal_status: "completed",
      booking_reference: "UBS-SAFE-002",
      contact_email: "private@example.test",
      contact_phone: "+65 9999 0000",
      customer_display_name: "UBS",
      customer_facing_status: "completed",
      customer_id: "customer-ubs",
      dropoff_location: "Private dropoff",
      passenger_name: "Private Passenger",
      passenger_phone: "+65 8888 0000",
      pickup_at: "2026-06-20T10:00:00.000Z",
      pickup_location: "Private pickup",
      route_summary: "Private route",
      service_type: "Airport Arrival",
    },
    {
      admin_internal_status: "confirmed",
      booking_reference: "UBS-SAFE-001",
      contact_phone: "+65 7777 0000",
      customer_display_name: "UBS",
      customer_facing_status: "confirmed",
      customer_id: "customer-ubs",
      passenger_name: "Another Private Passenger",
      pickup_at: "2026-06-15T10:00:00.000Z",
      service_type: "Hourly / Disposal",
    },
    {
      admin_internal_status: "confirmed",
      booking_reference: "RITZ-SAFE-001",
      customer_display_name: "Ritz Carlton",
      customer_facing_status: "confirmed",
      customer_id: "customer-ritz",
      pickup_at: "2026-06-18T10:00:00.000Z",
      service_type: "Point-to-Point Transfer",
    },
  ],
};

const harness = await loadHarness();

try {
  const { reader, route } = harness;

  assert.equal(reader.adminCustomerSavedBookingsReadVersion, "admin-customer-saved-bookings-read-v1");
  assert.deepEqual(
    reader.parseAdminCustomerSavedBookingsReadParams({
      customer_account: "UBS",
      limit: "5",
    }),
    {
      data: {
        customer_account: "UBS",
        customer_id: null,
        limit: 5,
      },
      ok: true,
    },
  );

  for (const [label, params] of [
    ["missing customer", {}],
    ["unsafe customer", { customer_account: "payment_link" }],
    ["bad limit", { customer_account: "UBS", limit: "999" }],
  ]) {
    const parsed = reader.parseAdminCustomerSavedBookingsReadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected params`);
    assert.equal(parsed.status, 400);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  for (const [label, request] of [
    ["anonymous", new Request("http://localhost/api/admin-customer-saved-bookings?customer_account=UBS")],
    [
      "customer referer",
      new Request("http://localhost/api/admin-customer-saved-bookings?customer_account=UBS", {
        headers: sessionHeaders({ referer: "http://localhost/book" }),
      }),
    ],
    [
      "wrong token",
      new Request("http://localhost/api/admin-customer-saved-bookings?customer_account=UBS", {
        headers: sessionHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
      }),
    ],
  ]) {
    setEnv(enabledEnv());

    const mock = installMockClient(seed);
    const result = await readRouteResponse(await route.GET(request));

    assert.equal(result.status, 403, `${label}: expected route boundary block`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv());

  const readMock = installMockClient(seed);
  const readResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-customer-saved-bookings?customer_account=UBS&limit=10", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.version, "admin-customer-saved-bookings-read-v1");
  assert.deepEqual(readResult.body.summary, {
    matched_count: 2,
    recent_read_count: 3,
    returned_count: 2,
  });
  assert.deepEqual(readResult.body.saved_bookings, [
    {
      admin_status: "completed",
      booking_month: "2026-06",
      booking_reference: "UBS-SAFE-002",
      customer_account: "UBS",
      customer_id: "customer-ubs",
      customer_status: "completed",
      pickup_at: "2026-06-20T10:00:00.000Z",
      service_type: "Airport Arrival",
      source: "admin_booking_persistence",
    },
    {
      admin_status: "confirmed",
      booking_month: "2026-06",
      booking_reference: "UBS-SAFE-001",
      customer_account: "UBS",
      customer_id: "customer-ubs",
      customer_status: "confirmed",
      pickup_at: "2026-06-15T10:00:00.000Z",
      service_type: "Hourly / Disposal",
      source: "admin_booking_persistence",
    },
  ]);
  assert.equal(readMock.client.operations.length, 0);
  assert.equal(readMock.client.selectHistory.length, 1);
  assert.equal(readMock.client.selectHistory[0].table, "bookings");
  assertNoLeaks(readResult, "saved bookings read response should stay safe");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    failures: {
      "select:bookings": {
        code: "42501",
        message: `SQL stack with ${serviceRoleSentinel} should not leak`,
      },
    },
  });
  const failureResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-customer-saved-bookings?customer_account=UBS", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin booking persistence load failed safely.",
    ok: false,
  });
  assert.equal(failureMock.client.operations.length, 0);
  assertNoLeaks(failureResult, "database failure response should stay sanitized");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminCustomerSavedBookingsReadMock;
  await harness.cleanup();
}

console.log("Admin customer saved bookings read API contract passed.");
