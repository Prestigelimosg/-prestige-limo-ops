import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-saved-booking-read-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_READ_SENTINEL";
const supabaseUrlSentinel = "https://admin-saved-booking-read-contract.supabase.co";
const unsafeResponsePattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_READ_SENTINEL|mock-admin-saved-booking-read-session-token|admin-saved-booking-read-contract\.supabase\.co|SHOULD_NOT_LEAK|parser_debug|raw_ai|parser_prompt|internal_admin_note|admin_finance|mock_archive|mock_qa|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-saved-booking-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-saved-bookings/route.ts",
];
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
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
  VERCEL_ENV: process.env.VERCEL_ENV,
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

function enabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Saved booking read contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  };
}

function sessionHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...extra,
  };
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
      "  const mock = globalThis.__prestigeAdminSavedBookingReadApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin saved booking read Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-saved-booking-read-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    reader: require(path.join(tempDir, "lib/admin-saved-booking-read.js")),
    route: require(path.join(tempDir, "app/api/admin-saved-bookings/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.orderBy = [];
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

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  order(column, options) {
    this.orderBy.push({ column, options });

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return this.execute();
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    return this.client.selectRows(
      this.table,
      this.filters,
      this.orderBy,
      this.resultLimit,
      this.resultMode,
      this.selectedColumns,
    );
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

  filterRows(table, filters) {
    return this.tables[table].filter((row) =>
      filters.every((filter) => String(row[filter.column]) === String(filter.value)),
    );
  }

  selectRows(table, filters, orderBy, resultLimit, resultMode, selectedColumns) {
    const failure = this.failures[`select:${table}`] || this.failures[table] || null;

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
      resultMode,
      selectedColumns,
      table,
    });
    this.operations.push({
      action: "select",
      filters: clone(filters),
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.filterRows(table, filters)
      .sort((first, second) => {
        for (const order of orderBy) {
          const firstValue = String(first[order.column] ?? "");
          const secondValue = String(second[order.column] ?? "");
          const comparison = firstValue.localeCompare(secondValue);

          if (comparison !== 0) {
            return order.options?.ascending === false ? -comparison : comparison;
          }
        }

        return 0;
      })
      .slice(0, resultLimit || undefined);

    return {
      data: resultMode === "maybeSingle" ? rows[0] ?? null : rows,
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeAdminSavedBookingReadApiMock = mock;

  return mock;
}

async function routeJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoUnsafeResponse(value, label) {
  assert.equal(
    unsafeResponsePattern.test(JSON.stringify(value)),
    false,
    `${label}: expected no secret/internal/debug leakage`,
  );
}

function assertNoWrites(mock, label) {
  assert.deepEqual(
    mock.client.operations.filter((operation) => operation.action !== "select"),
    [],
    `${label}: expected no mocked write operations`,
  );
}

const seed = {
  bookings: [
    {
      id: "save-read-1",
      company_id: 42,
      booker_id: 43,
      traveler_id: 44,
      booking_type: "MNG",
      vehicle: "AVF",
      pickup_time: "1530",
      pickup_address: "Changi Airport T3",
      dropoff_address: "Raffles Hotel Singapore",
      flight_no: "SQ333",
      route: "Changi Airport T3 > Raffles Hotel Singapore",
      pax: 2,
      job_card: "AVF MNG\n27 May 2026, 1530hrs\nName: Contract Traveler",
      status: "assigned",
      driver_id: 51,
      driver_name: "Contract Driver",
      driver_contact: "+65 9999 0000",
      driver_plate_number: "SLV100A",
      customer_rate: 70,
      customer_rate_unit: "job",
      customer_price_amount: 88,
      customer_rate_override: null,
      customer_price_override_reason: null,
      driver_payout_min: 50,
      driver_payout_max: 60,
      driver_payout_amount: 55,
      driver_payout_override: null,
      driver_payout_reason: null,
      driver_payout_unit: "job",
      driver_notes: "Admin dispatcher note for the internal dashboard only.",
      driver_dispatch_include_payout: false,
      midnight_surcharge: 0,
      midnight_payout: 0,
      extra_stop_count: 0,
      extra_stop_surcharge: 0,
      extra_stop_payout: 0,
      child_seat_required: true,
      child_seat_count: 1,
      child_seat_type: "booster",
      child_seat_customer_surcharge: 15,
      child_seat_driver_payout: 5,
      pricing_source: "contract-test",
      created_at: "2026-05-27T07:30:00.000Z",
      updated_at: "2026-05-27T07:31:00.000Z",
      companies: {
        company_name: "CONTRACT COMPANY",
        domain: "example.com",
      },
      bookers: {
        booker_name: "CONTRACT BOOKER",
        email: "booker@example.com",
        phone: "+65 8888 0000",
      },
      travelers: {
        traveler_name: "CONTRACT TRAVELER",
      },
      internal_admin_note: "SHOULD_NOT_LEAK",
      parser_debug: "SHOULD_NOT_LEAK",
    },
    {
      id: "other-booking",
      booking_type: "DEP",
      created_at: "2026-05-28T07:30:00.000Z",
      companies: {
        company_name: "OTHER COMPANY",
      },
    },
  ],
};

const harness = await loadHarness();

try {
  const { reader, route } = harness;

  assert.equal(reader.adminSavedBookingReadVersion, "admin-saved-booking-read-v1");

  assert.equal(reader.parseAdminSavedBookingReadParams({}).ok, false);
  assert.deepEqual(reader.parseAdminSavedBookingListReadParams({}), {
    data: {
      limit: 25,
    },
    ok: true,
  });
  assert.deepEqual(reader.parseAdminSavedBookingListReadParams({ limit: "2" }), {
    data: {
      limit: 2,
    },
    ok: true,
  });
  assert.equal(reader.parseAdminSavedBookingReadParams({ id: "save-read-1", limit: "2" }).ok, false);
  assert.equal(reader.parseAdminSavedBookingListReadParams({ limit: "0" }).ok, false);
  assert.equal(reader.parseAdminSavedBookingListReadParams({ id: "save-read-1" }).ok, false);
  assert.equal(
    reader.parseAdminSavedBookingReadParams({
      id: "save-read-1",
      invoice_number: "INV-1",
    }).ok,
    false,
  );

  setEnv(enabledEnv());

  const blockedMock = installMockClient(seed);
  const blockedResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=save-read-1", {
        headers: sessionHeaders({ referer: "http://localhost/my-bookings" }),
      }),
    ),
  );

  assert.equal(blockedResult.status, 403);
  assert.equal(blockedResult.body.error, routeBlockedMessage);
  assert.equal(blockedMock.createdClients.length, 0);
  assert.equal(blockedMock.client.operations.length, 0);
  assertNoUnsafeResponse(blockedResult, "blocked response");

  const driverBlockedMock = installMockClient(seed);
  const driverBlockedResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=save-read-1", {
        headers: sessionHeaders({ referer: "http://localhost/driver-job/mock-token" }),
      }),
    ),
  );

  assert.equal(driverBlockedResult.status, 403);
  assert.equal(driverBlockedResult.body.error, routeBlockedMessage);
  assert.equal(driverBlockedMock.createdClients.length, 0);
  assert.equal(driverBlockedMock.client.operations.length, 0);
  assertNoUnsafeResponse(driverBlockedResult, "driver blocked response");

  const listBlockedMock = installMockClient(seed);
  const listBlockedResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?limit=2", {
        headers: sessionHeaders({ referer: "http://localhost/my-bookings" }),
      }),
    ),
  );

  assert.equal(listBlockedResult.status, 403);
  assert.equal(listBlockedResult.body.error, routeBlockedMessage);
  assert.equal(listBlockedMock.createdClients.length, 0);
  assert.equal(listBlockedMock.client.operations.length, 0);
  assertNoUnsafeResponse(listBlockedResult, "blocked list response");

  setEnv(enabledEnv());

  const validMock = installMockClient(seed);
  const readResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=save-read-1", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.version, "admin-saved-booking-read-v1");
  assert.equal(readResult.body.booking.id, "save-read-1");
  assert.equal(readResult.body.booking.companies.company_name, "CONTRACT COMPANY");
  assert.equal(readResult.body.booking.bookers.booker_name, "CONTRACT BOOKER");
  assert.equal(readResult.body.booking.travelers.traveler_name, "CONTRACT TRAVELER");
  assert.equal(readResult.body.booking.customer_price_amount, 88);
  assert.equal(readResult.body.booking.driver_payout_amount, 55);
  assert.equal(readResult.body.booking.internal_admin_note, undefined);
  assert.equal(readResult.body.booking.parser_debug, undefined);
  assert.equal(validMock.createdClients.length, 1);
  assert.equal(validMock.client.selectHistory.length, 1);
  assert.equal(validMock.client.selectHistory[0].table, "bookings");
  assert.deepEqual(validMock.client.selectHistory[0].filters, [
    {
      column: "id",
      type: "eq",
      value: "save-read-1",
    },
  ]);
  assert.equal(validMock.client.selectHistory[0].limit, 1);
  assert.equal(validMock.client.selectHistory[0].selectedColumns.includes("bookings("), false);
  assert.equal(validMock.client.selectHistory[0].selectedColumns.includes("internal_admin_note"), false);
  assert.equal(validMock.client.selectHistory[0].selectedColumns.includes("parser_debug"), false);
  assertNoWrites(validMock, "valid read");
  assertNoUnsafeResponse(readResult, "valid read response");

  setEnv(enabledEnv());

  const listMock = installMockClient(seed);
  const listResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?limit=2", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(listResult.status, 200);
  assert.equal(listResult.body.ok, true);
  assert.equal(listResult.body.version, "admin-saved-booking-read-v1");
  assert.deepEqual(
    listResult.body.bookings.map((booking) => booking.id),
    ["other-booking", "save-read-1"],
  );
  assert.equal(listResult.body.bookings[0].companies.company_name, "OTHER COMPANY");
  assert.equal(listResult.body.bookings[1].customer_price_amount, 88);
  assert.equal(listResult.body.bookings[1].driver_payout_amount, 55);
  assert.equal(listResult.body.bookings[1].internal_admin_note, undefined);
  assert.equal(listResult.body.bookings[1].parser_debug, undefined);
  assert.equal(listMock.createdClients.length, 1);
  assert.equal(listMock.client.selectHistory.length, 1);
  assert.equal(listMock.client.selectHistory[0].table, "bookings");
  assert.deepEqual(listMock.client.selectHistory[0].filters, []);
  assert.deepEqual(listMock.client.selectHistory[0].orderBy, [
    {
      column: "created_at",
      options: {
        ascending: false,
      },
    },
  ]);
  assert.equal(listMock.client.selectHistory[0].limit, 2);
  assert.equal(listMock.client.selectHistory[0].selectedColumns.includes("internal_admin_note"), false);
  assert.equal(listMock.client.selectHistory[0].selectedColumns.includes("parser_debug"), false);
  assertNoWrites(listMock, "valid list read");
  assertNoUnsafeResponse(listResult, "valid list response");

  setEnv(enabledEnv());

  const missingMock = installMockClient(seed);
  const missingResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=missing-booking", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(missingResult.status, 200);
  assert.equal(missingResult.body.ok, true);
  assert.equal(missingResult.body.booking, null);
  assertNoWrites(missingMock, "missing read");
  assertNoUnsafeResponse(missingResult, "missing response");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    failures: {
      "select:bookings": {
        code: "42501",
        message: `SQL stack with ${serviceRoleSentinel} SHOULD_NOT_LEAK`,
      },
    },
  });
  const failureResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=save-read-1", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.equal(failureResult.body.ok, false);
  assert.equal(failureResult.body.error, "Admin saved booking read failed safely.");
  assertNoWrites(failureMock, "failure read");
  assertNoUnsafeResponse(failureResult, "failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminSavedBookingReadApiMock;
  await harness.cleanup();
}

console.log("Admin saved booking read API contract passed.");
