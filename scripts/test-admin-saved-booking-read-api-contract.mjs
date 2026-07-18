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
  "lib/admin-saved-booking-create.ts",
  "lib/admin-saved-booking-delete.ts",
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
    this.resultOffset = 0;
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

  or(expression) {
    this.filters.push({
      expression,
      type: "or",
    });

    return this;
  }

  order(column, options) {
    this.orderBy.push({ column, options });

    return this;
  }

  range(from, to) {
    this.resultLimit = to - from + 1;
    this.resultOffset = from;

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
      this.resultOffset,
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
      filters.every((filter) => {
        if (filter.type === "or") {
          const match = String(filter.expression).match(
            /^([a-z_]+)\.is\.null,\1\.not\.in\.\(([^)]+)\)$/,
          );
          assert.ok(match, `Unexpected mocked OR filter: ${filter.expression}`);
          const [, column, excludedList] = match;
          const rowValue = row[column];
          const excludedValues = excludedList
            .split(",")
            .map((value) => value.trim().toLowerCase());

          return (
            rowValue === null ||
            rowValue === undefined ||
            !excludedValues.includes(String(rowValue).trim().toLowerCase())
          );
        }

        return String(row[filter.column]) === String(filter.value);
      }),
    );
  }

  selectRows(table, filters, orderBy, resultLimit, resultMode, resultOffset, selectedColumns) {
    const configuredFailure = this.failures[`select:${table}`] || this.failures[table] || null;
    const failure =
      typeof configuredFailure === "function"
        ? configuredFailure({
            filters,
            orderBy,
            resultLimit,
            resultMode,
            resultOffset,
            selectedColumns,
            table,
          })
        : configuredFailure;

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
      resultMode,
      resultOffset,
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
      .slice(resultOffset, resultLimit ? resultOffset + resultLimit : undefined);

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
      booking_reference: "ADM-SAVE-READ-1",
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
      offset: 0,
      scope: "all",
    },
    ok: true,
  });
  assert.deepEqual(reader.parseAdminSavedBookingListReadParams({ limit: "2" }), {
    data: {
      limit: 2,
      offset: 0,
      scope: "all",
    },
    ok: true,
  });
  assert.deepEqual(
    reader.parseAdminSavedBookingListReadParams({
      limit: "100",
      offset: "100",
      scope: "monitorable",
    }),
    {
      data: {
        limit: 100,
        offset: 100,
        scope: "monitorable",
      },
      ok: true,
    },
  );
  assert.deepEqual(reader.parseAdminSavedBookingReadParams({ booking_reference: "ADM-SAVE-READ-1" }), {
    data: {
      booking_reference: "ADM-SAVE-READ-1",
      id: undefined,
    },
    ok: true,
  });
  assert.equal(
    reader.parseAdminSavedBookingReadParams({
      booking_reference: "ADM-SAVE-READ-1",
      id: "save-read-1",
    }).ok,
    false,
  );
  assert.equal(reader.parseAdminSavedBookingReadParams({ id: "save-read-1", limit: "2" }).ok, false);
  assert.equal(reader.parseAdminSavedBookingListReadParams({ limit: "0" }).ok, false);
  assert.equal(reader.parseAdminSavedBookingListReadParams({ offset: "-1" }).ok, false);
  assert.equal(reader.parseAdminSavedBookingListReadParams({ scope: "completed" }).ok, false);
  assert.equal(reader.parseAdminSavedBookingListReadParams({ id: "save-read-1" }).ok, false);
  assert.equal(
    reader.parseAdminSavedBookingReadParams({
      id: "save-read-1",
      invoice_number: "INV-1",
    }).ok,
    false,
  );

  setEnv(enabledEnv());

  const monitorCoverageBookings = [
    ...Array.from({ length: 101 }, (_, index) => ({
      id: `monitorable-${String(index + 1).padStart(3, "0")}`,
      booking_reference: `MONITORABLE-${String(index + 1).padStart(3, "0")}`,
      created_at: new Date(Date.UTC(2026, 6, 31, 0, 0, index)).toISOString(),
      status: index % 2 === 0 ? "confirmed" : "assigned",
    })),
    {
      id: "monitor-terminal-completed",
      booking_reference: "MONITOR-TERMINAL-COMPLETED",
      created_at: "2026-08-01T00:00:02.000Z",
      status: "completed",
    },
    {
      id: "monitor-terminal-cancelled",
      booking_reference: "MONITOR-TERMINAL-CANCELLED",
      created_at: "2026-08-01T00:00:01.000Z",
      status: "cancelled",
    },
  ];
  const monitorCoverageMock = installMockClient({ bookings: monitorCoverageBookings });
  const monitorCoverageFirstPage = await routeJson(
    await route.GET(
      new Request(
        "http://localhost/api/admin-saved-bookings?limit=100&offset=0&scope=monitorable",
        { headers: sessionHeaders() },
      ),
    ),
  );
  const monitorCoverageSecondPage = await routeJson(
    await route.GET(
      new Request(
        "http://localhost/api/admin-saved-bookings?limit=100&offset=100&scope=monitorable",
        { headers: sessionHeaders() },
      ),
    ),
  );

  assert.equal(monitorCoverageFirstPage.status, 200);
  assert.equal(monitorCoverageFirstPage.body.bookings.length, 100);
  assert.equal(monitorCoverageSecondPage.status, 200);
  assert.equal(monitorCoverageSecondPage.body.bookings.length, 1);
  assert.equal(
    [...monitorCoverageFirstPage.body.bookings, ...monitorCoverageSecondPage.body.bookings].some(
      (booking) => ["completed", "cancelled"].includes(booking.status),
    ),
    false,
  );
  assert.equal(
    monitorCoverageMock.client.selectHistory.every((entry) =>
      entry.filters.some(
        (filter) =>
          filter.type === "or" &&
          String(filter.expression).includes("completed") &&
          String(filter.expression).includes("cancelled"),
      ),
    ),
    true,
  );
  assert.deepEqual(
    monitorCoverageMock.client.selectHistory.map((entry) => entry.resultOffset),
    [0, 100],
  );
  assertNoWrites(monitorCoverageMock, "monitorable saved booking pagination");
  assertNoUnsafeResponse(monitorCoverageFirstPage, "monitorable first page response");
  assertNoUnsafeResponse(monitorCoverageSecondPage, "monitorable second page response");

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

  const bookingReferenceMock = installMockClient(seed);
  const bookingReferenceReadResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?booking_reference=ADM-SAVE-READ-1", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(bookingReferenceReadResult.status, 200);
  assert.equal(bookingReferenceReadResult.body.ok, true);
  assert.equal(bookingReferenceReadResult.body.booking.id, "save-read-1");
  assert.equal(bookingReferenceReadResult.body.booking.booking_reference, "ADM-SAVE-READ-1");
  assert.equal(bookingReferenceReadResult.body.booking.customer_price_amount, 88);
  assert.deepEqual(bookingReferenceMock.client.selectHistory[0].filters, [
    {
      column: "booking_reference",
      type: "eq",
      value: "ADM-SAVE-READ-1",
    },
  ]);
  assert.equal(bookingReferenceMock.client.selectHistory[0].limit, 1);
  assertNoWrites(bookingReferenceMock, "valid booking reference read");
  assertNoUnsafeResponse(bookingReferenceReadResult, "valid booking reference read response");

  setEnv(enabledEnv());

  const mixedIdentifierMock = installMockClient(seed);
  const mixedIdentifierResult = await routeJson(
    await route.GET(
      new Request(
        "http://localhost/api/admin-saved-bookings?id=save-read-1&booking_reference=ADM-SAVE-READ-1",
        { headers: sessionHeaders() },
      ),
    ),
  );

  assert.equal(mixedIdentifierResult.status, 400);
  assert.equal(mixedIdentifierResult.body.ok, false);
  assert.equal(mixedIdentifierMock.createdClients.length, 0);
  assert.equal(mixedIdentifierMock.client.operations.length, 0);
  assertNoUnsafeResponse(mixedIdentifierResult, "mixed identifier response");

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

  const currentFallbackMock = installMockClient(
    {
      bookings: [
        {
          id: "current-schema-booking",
          admin_internal_status: "draft",
          booking_reference: "ADM-20260630160450",
          booker_id: 11,
          company_id: 26,
          contact_display_name: null,
          contact_email: "william@prestigelimo.sg",
          contact_phone: "+6599999999",
          created_at: "2026-06-30T16:04:50.000Z",
          customer_display_name: "William Test Traveller",
          customer_facing_status: "pending_review",
          dropoff_location: "Changi Airport Terminal 3",
          driver_contact: "+6598888888",
          driver_name: "Codex Driver",
          driver_plate_number: "SCDX1T",
          flight_no: "SQ123",
          passenger_name: "Codex Calendar Test",
          passenger_phone: "+6599999999",
          pickup_at: "2026-07-03T03:00:00+00:00",
          pickup_location: "10 Anson Road",
          route_summary: "10 Anson Road > Changi Airport Terminal 3",
          service_type: "TRF",
          source_surface: "admin_dashboard",
          traveler_id: 22,
          updated_at: "2026-06-30T16:05:00.000Z",
          vehicle_type_or_category: "AVF",
          companies: {
            company_name: "CODEX CUSTOMER REBOOKING TEST",
            domain: "prestigelimo.sg",
          },
          bookers: {
            booker_name: "William Test",
            email: "william@prestigelimo.sg",
            phone: "+6599999999",
          },
          travelers: {
            traveler_name: "William Test Traveller",
          },
          internal_admin_note: "SHOULD_NOT_LEAK",
          parser_debug: "SHOULD_NOT_LEAK",
        },
      ],
    },
    {
      failures: {
        "select:bookings": ({ selectedColumns }) =>
          /(?:^|, )vehicle_type(?:,|$)/.test(selectedColumns)
            ? {
                code: "42703",
                message: `Legacy scalar column cache miss with ${serviceRoleSentinel} SHOULD_NOT_LEAK`,
              }
            : null,
      },
    },
  );
  const currentFallbackResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=current-schema-booking", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(currentFallbackResult.status, 200);
  assert.equal(currentFallbackResult.body.ok, true);
  assert.equal(currentFallbackResult.body.booking.id, "current-schema-booking");
  assert.equal(currentFallbackResult.body.booking.booking_reference, "ADM-20260630160450");
  assert.equal(currentFallbackResult.body.booking.pickup_at, "2026-07-03T03:00:00+00:00");
  assert.equal(currentFallbackResult.body.booking.service_type, "TRF");
  assert.equal(currentFallbackResult.body.booking.contact_display_name, null);
  assert.equal(
    currentFallbackResult.body.booking.companies.company_name,
    "CODEX CUSTOMER REBOOKING TEST",
  );
  assert.equal(currentFallbackResult.body.booking.bookers.booker_name, "William Test");
  assert.equal(
    currentFallbackResult.body.booking.travelers.traveler_name,
    "William Test Traveller",
  );
  assert.equal(currentFallbackResult.body.booking.flight_no, "SQ123");
  assert.equal(currentFallbackResult.body.booking.driver_name, "Codex Driver");
  assert.equal(currentFallbackResult.body.booking.driver_contact, "+6598888888");
  assert.equal(currentFallbackResult.body.booking.driver_plate_number, "SCDX1T");
  assert.equal(currentFallbackResult.body.booking.status, "draft");
  assert.equal(currentFallbackResult.body.booking.internal_admin_note, undefined);
  assert.equal(currentFallbackResult.body.booking.parser_debug, undefined);
  assert.equal(currentFallbackMock.client.selectHistory.length, 2);
  assert.equal(currentFallbackMock.client.selectHistory[0].selectedColumns.includes("companies("), true);
  assert.equal(currentFallbackMock.client.selectHistory[1].selectedColumns.includes("companies("), true);
  assert.equal(currentFallbackMock.client.selectHistory[1].selectedColumns.includes("bookers("), true);
  assert.equal(currentFallbackMock.client.selectHistory[1].selectedColumns.includes("travelers("), true);
  assert.equal(currentFallbackMock.client.selectHistory[1].selectedColumns.includes("contact_display_name"), true);
  assert.equal(currentFallbackMock.client.selectHistory[1].selectedColumns.includes("driver_plate_number"), true);
  assertNoWrites(currentFallbackMock, "current schema fallback read");
  assertNoUnsafeResponse(currentFallbackResult, "current schema fallback response");

  setEnv(enabledEnv());

  const foundationFallbackMock = installMockClient(
    {
      bookings: [
        {
          id: "foundation-schema-booking",
          booking_reference: "LEGACY-FOUNDATION-1",
          booking_type: "DEP",
          created_at: "2026-06-30T15:00:00.000Z",
          driver_contact: "+6511111111",
          driver_name: "Foundation Driver",
          driver_plate_number: "SOLD1",
          dropoff_address: "Changi Airport Terminal 3",
          flight_no: "SQ999",
          job_card: "Legacy job card",
          pax: 3,
          pickup_address: "10 Anson Road",
          pickup_time: "1100",
          route: "10 Anson Road > Changi Airport Terminal 3",
          source_channel: "admin_dashboard",
          status: "assigned",
          updated_at: "2026-06-30T15:05:00.000Z",
          vehicle: "AVF",
          internal_admin_note: "SHOULD_NOT_LEAK",
          parser_debug: "SHOULD_NOT_LEAK",
        },
      ],
    },
    {
      failures: {
        "select:bookings": ({ selectedColumns }) =>
          selectedColumns.includes("companies(") || selectedColumns.includes("contact_display_name")
            ? {
                code: "42703",
                message: `Column cache miss with ${serviceRoleSentinel} SHOULD_NOT_LEAK`,
              }
            : null,
      },
    },
  );
  const foundationFallbackResult = await routeJson(
    await route.GET(
      new Request("http://localhost/api/admin-saved-bookings?id=foundation-schema-booking", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(foundationFallbackResult.status, 200);
  assert.equal(foundationFallbackResult.body.ok, true);
  assert.equal(foundationFallbackResult.body.booking.id, "foundation-schema-booking");
  assert.equal(foundationFallbackResult.body.booking.booking_reference, "LEGACY-FOUNDATION-1");
  assert.equal(foundationFallbackResult.body.booking.booking_type, "DEP");
  assert.equal(foundationFallbackResult.body.booking.pickup_time, "1100");
  assert.equal(foundationFallbackResult.body.booking.pickup_address, "10 Anson Road");
  assert.equal(foundationFallbackResult.body.booking.dropoff_address, "Changi Airport Terminal 3");
  assert.equal(foundationFallbackResult.body.booking.flight_no, "SQ999");
  assert.equal(foundationFallbackResult.body.booking.driver_name, "Foundation Driver");
  assert.equal(foundationFallbackResult.body.booking.driver_contact, "+6511111111");
  assert.equal(foundationFallbackResult.body.booking.driver_plate_number, "SOLD1");
  assert.equal(foundationFallbackResult.body.booking.status, "assigned");
  assert.equal(foundationFallbackResult.body.booking.internal_admin_note, undefined);
  assert.equal(foundationFallbackResult.body.booking.parser_debug, undefined);
  assert.equal(foundationFallbackMock.client.selectHistory.length, 4);
  assert.equal(foundationFallbackMock.client.selectHistory[3].selectedColumns.includes("contact_display_name"), false);
  assert.equal(foundationFallbackMock.client.selectHistory[3].selectedColumns.includes("pickup_time"), true);
  assertNoWrites(foundationFallbackMock, "foundation schema fallback read");
  assertNoUnsafeResponse(foundationFallbackResult, "foundation schema fallback response");

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
