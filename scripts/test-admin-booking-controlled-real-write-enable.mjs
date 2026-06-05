import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const disabledPersistenceError =
  "Admin booking persistence is not enabled on this server.";
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const stagingReadinessError =
  "Admin booking persistence staging configuration is not ready.";
const customerSafeError = "Booking request could not be saved safely.";
const serviceRoleSentinel =
  "SUPABASE_SERVICE_ROLE_CONTROLLED_WRITE_SENTINEL_DO_NOT_LEAK";
const supabaseUrlSentinel = "https://controlled-write.supabase.co";
const nextPublicSupabaseUrlSentinel = "https://public-only-controlled-write.supabase.co";
const serverSessionToken = "mock-controlled-real-write-admin-session-token";
const unsafeFieldLeakPattern =
  /customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|service_role|server_only|secret/i;
const safeResponseLeakPattern =
  /SUPABASE_SERVICE_ROLE_CONTROLLED_WRITE_SENTINEL|mock-controlled-real-write-admin-session-token|controlled-write\.supabase\.co|public-only-controlled-write\.supabase\.co|PRESTIGE_ADMIN|service_role|server-only|server_only|stack|sql|supabase internals|createClient|secret|key|token/i;
const sourceFiles = [
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-bookings/route.ts",
  "app/api/customer-booking-requests/route.ts",
];
const originalEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
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

async function writeMockModules(tempDir, options = {}) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(
    serverOnlyPath,
    options.blockServerOnly ? "throw new Error('CLIENT_IMPORT_BLOCKED');" : "",
  );
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeControlledRealWriteMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('UNEXPECTED_REAL_SUPABASE_CLIENT');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-controlled-real-write-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
    adminRoute: require(path.join(tempDir, "app/api/admin-bookings/route.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerRoute: require(path.join(tempDir, "app/api/customer-booking-requests/route.js")),
    persistence: require(path.join(tempDir, "lib/admin-booking-persistence.js")),
  };
}

async function assertBrowserImportBlocked() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-controlled-browser-"));

  try {
    await writeMockModules(tempDir, { blockServerOnly: true });
    await writeHarnessFile(tempDir, "lib/admin-booking-supabase-adapter.ts");

    const require = createRequire(import.meta.url);

    assert.throws(
      () => require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
      /CLIENT_IMPORT_BLOCKED/,
      "Browser/client-style import must stop at the server-only adapter boundary",
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.table = table;
    this.filters = [];
    this.limitCount = null;
    this.operation = null;
    this.orderBy = null;
    this.payload = null;
    this.resultMode = "many";
    this.selectedColumns = null;
  }

  select(columns) {
    if (!this.operation) {
      this.operation = "select";
    }

    this.selectedColumns = columns;

    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;
    this.client.recordOperation("insert", this.table, payload);

    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;
    this.client.recordOperation("update", this.table, payload);

    return this;
  }

  delete() {
    this.operation = "delete";
    this.client.recordOperation("delete", this.table, { filters: this.filters });

    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });

    return this;
  }

  limit(count) {
    this.limitCount = count;

    return this;
  }

  order(column, options) {
    this.orderBy = { column, options };

    return this;
  }

  single() {
    this.resultMode = "single";

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    if (this.operation === "insert") {
      return this.client.insertRows(this.table, this.payload, this.resultMode, this.selectedColumns);
    }

    if (this.operation === "update") {
      return this.client.updateRows(this.table, this.payload, this.filters);
    }

    if (this.operation === "delete") {
      return this.client.deleteRows(this.table, this.filters);
    }

    return this.client.selectRows(
      this.table,
      this.filters,
      this.limitCount,
      this.orderBy,
      this.resultMode,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
    this.tables = {
      audit_logs: [],
      booking_route_points: [],
      booking_service_items: [],
      bookings: [],
      customer_contacts: [],
      customers: [],
    };
    this.nextIds = {
      audit_logs: 1,
      booking_route_points: 1,
      booking_service_items: 1,
      bookings: 1,
      customer_contacts: 1,
      customers: 1,
    };
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  recordOperation(action, table, payload) {
    this.operations.push({
      action,
      payload: clone(payload),
      table,
    });
  }

  createId(table) {
    return `${table}-${this.nextIds[table]++}`;
  }

  failureFor(action, table) {
    return this.failures[`${action}:${table}`] || null;
  }

  insertRows(table, payload, resultMode, selectedColumns) {
    const failure = this.failureFor("insert", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    const insertedRows = rows.map((row) => {
      const insertedRow = {
        id: this.createId(table),
        ...clone(row),
        created_at: row.created_at || "2026-06-05T00:00:00.000Z",
        updated_at: row.updated_at || "2026-06-05T00:00:00.000Z",
      };

      this.tables[table].push(insertedRow);

      return insertedRow;
    });

    if (resultMode === "single") {
      return {
        data: this.projectRow(insertedRows[0], selectedColumns),
        error: null,
      };
    }

    return {
      data: Array.isArray(payload) ? insertedRows.map((row) => this.projectRow(row, selectedColumns)) : null,
      error: null,
    };
  }

  updateRows(table, payload, filters) {
    const failure = this.failureFor("update", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    for (const row of this.applyFilters(this.tables[table], filters)) {
      Object.assign(row, clone(payload));
    }

    return {
      data: null,
      error: null,
    };
  }

  deleteRows(table, filters) {
    const filteredIds = new Set(this.applyFilters(this.tables[table], filters).map((row) => row.id));

    this.tables[table] = this.tables[table].filter((row) => !filteredIds.has(row.id));

    return {
      data: null,
      error: null,
    };
  }

  selectRows(table, filters, limitCount, orderBy, resultMode, selectedColumns) {
    const failure = this.failureFor("select", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    let rows = this.applyFilters(this.tables[table], filters);

    if (orderBy) {
      const direction = orderBy.options?.ascending === false ? -1 : 1;
      rows = [...rows].sort((first, second) =>
        String(first[orderBy.column] || "").localeCompare(String(second[orderBy.column] || "")) * direction,
      );
    }

    if (typeof limitCount === "number") {
      rows = rows.slice(0, limitCount);
    }

    const hydratedRows = rows.map((row) =>
      table === "bookings" ? this.hydrateBookingRow(row) : clone(row),
    );

    if (resultMode === "single" || resultMode === "maybeSingle") {
      return {
        data: this.projectRow(hydratedRows[0] || null, selectedColumns),
        error: null,
      };
    }

    return {
      data: hydratedRows.map((row) => this.projectRow(row, selectedColumns)),
      error: null,
    };
  }

  applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => String(row[filter.column]) === String(filter.value)),
    );
  }

  hydrateBookingRow(row) {
    return {
      ...clone(row),
      booking_route_points: this.tables.booking_route_points
        .filter((routePoint) => routePoint.booking_id === row.id)
        .map(clone),
      booking_service_items: this.tables.booking_service_items
        .filter((serviceItem) => serviceItem.booking_id === row.id)
        .map(clone),
    };
  }

  projectRow(row, selectedColumns) {
    if (!row || selectedColumns !== "id") {
      return row ? clone(row) : row;
    }

    return {
      id: row.id,
    };
  }
}

function installMockClient(options) {
  const client = new MockSupabaseClient(options);

  globalThis.__prestigeControlledRealWriteMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeControlledRealWriteMock;
}

function blankEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
    ...overrides,
  };
}

function readyEnv(overrides = {}) {
  return blankEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Controlled Write Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

function killSwitchClosedEnv(overrides = {}) {
  return readyEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
    ...overrides,
  });
}

function adminPayload(overrides = {}) {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: "CONTROLLED-ADM-001",
      cancellation_review_status: "pending_review",
      change_review_status: "pending_review",
      contact_display_name: "Controlled Safe Contact",
      contact_email: "controlled-safe@example.com",
      contact_phone: "+65 9000 4101",
      customer_display_name: "Controlled Safe Account",
      customer_facing_status: "pending_review",
      dropoff_location: "Controlled Safe Dropoff",
      passenger_name: "Controlled Passenger",
      passenger_phone: "+65 9000 4102",
      pickup_at: "2026-06-08T10:30:00+08:00",
      pickup_location: "Controlled Safe Pickup",
      request_review_status: "pending_review",
      route_summary: "Controlled Safe Pickup > Controlled Safe Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-api",
      ...overrides.booking,
    },
    route_points: [
      {
        location: "Controlled Safe Pickup",
        notes: "Safe pickup note",
        point_type: "pickup",
        sequence: 1,
      },
      {
        location: "Controlled Safe Dropoff",
        notes: "Safe dropoff note",
        point_type: "dropoff",
        sequence: 2,
      },
      ...(overrides.route_points || []),
    ],
    service_items: [
      {
        item_type: "extra_stop",
        notes: "Safe non-financial service item",
        quantity: 1,
      },
      ...(overrides.service_items || []),
    ],
  };
}

function customerPayload(overrides = {}) {
  return {
    companyName: "Controlled Customer Company",
    contactNo: "+65 9000 4202",
    dropoffLocation: "Controlled Customer Dropoff",
    emailAddress: "controlled-customer@example.com",
    extraStops: "",
    flightNumber: "SQ202",
    luggage: "1",
    passengerCount: "2",
    passengerName: "Controlled Customer Passenger",
    pickupDate: "2026-06-08",
    pickupLocation: "Controlled Customer Pickup",
    pickupTime: "10:30",
    serviceType: "Airport Arrival",
    vehicleType: "Alphard / Vellfire",
    ...overrides,
  };
}

function adminHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
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

function customerHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    origin: "http://localhost",
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-request",
    ...overrides,
  };
}

function requestWithJson(url, body, headers, method = "POST") {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method,
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeResponseLeakPattern, label);
  assert.doesNotMatch(text, unsafeFieldLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client creation`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked DB operation`);
}

function insertedOperation(mock, table) {
  return mock.client.operations.find((operation) => operation.action === "insert" && operation.table === table);
}

function validActor(role = "admin") {
  return {
    actor_label: `Controlled ${role}`,
    actor_role: role,
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
}

function assertSafeCreateOperations(mock, expectedRole) {
  const insertedTables = mock.client.operations
    .filter((operation) => operation.action === "insert")
    .map((operation) => operation.table);

  assert.deepEqual([...new Set(insertedTables)].sort(), [
    "audit_logs",
    "booking_route_points",
    "booking_service_items",
    "bookings",
    "customer_contacts",
    "customers",
  ]);
  assert.equal(insertedOperation(mock, "customers").payload.display_name, "Controlled Safe Account");
  assert.equal(insertedOperation(mock, "bookings").payload.booking_reference, "CONTROLLED-ADM-001");
  assert.equal(insertedOperation(mock, "bookings").payload.customer_display_name, "Controlled Safe Account");
  assert.equal(insertedOperation(mock, "bookings").payload.pickup_at, "2026-06-08T10:30:00+08:00");
  assert.equal(insertedOperation(mock, "bookings").payload.route_summary, "Controlled Safe Pickup > Controlled Safe Dropoff");
  assert.equal(insertedOperation(mock, "bookings").payload.service_type, "MNG");
  assert.equal(insertedOperation(mock, "audit_logs").payload.actor_role, expectedRole);
  assert.equal(insertedOperation(mock, "audit_logs").payload.action_type, "booking_created");
  assertNoLeaks(mock.client.operations, "mocked persistence operations must not include unsafe fields");
}

await assertBrowserImportBlocked();

const harness = await loadHarness();

try {
  const { adminRoute, customerRoute, persistence } = harness;

  for (const [label, env] of [
    ["default config", blankEnv()],
    ["missing feature flag", blankEnv({
      PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
      PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
      PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
      SUPABASE_URL: supabaseUrlSentinel,
    })],
    ["kill-switch closed", killSwitchClosedEnv()],
  ]) {
    setEnv(env);

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
      ),
    );

    assert.equal(result.status, 503, `${label}: expected disabled persistence status`);
    assert.deepEqual(result.body, {
      error: disabledPersistenceError,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: disabled response must stay safe`);
  }

  setEnv(readyEnv({
    NEXT_PUBLIC_SUPABASE_URL: nextPublicSupabaseUrlSentinel,
    SUPABASE_URL: undefined,
  }));

  const publicOnlyMock = installMockClient();
  const publicOnlyResult = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    ),
  );

  assert.equal(publicOnlyResult.status, 503);
  assert.deepEqual(publicOnlyResult.body, {
    error: stagingReadinessError,
    ok: false,
  });
  assertNoSupabaseTouched(publicOnlyMock, "NEXT_PUBLIC-only config");
  assertNoLeaks(publicOnlyResult, "NEXT_PUBLIC-only config response must stay safe");

  for (const [label, headers] of [
    ["anonymous request", { "content-type": "application/json" }],
    ["customer referer", sessionHeaders({ referer: "http://localhost/book" })],
    ["driver referer", sessionHeaders({ referer: "http://localhost/driver-job/mock-token" })],
    ["public origin", sessionHeaders({ origin: "https://public.example.invalid" })],
  ]) {
    setEnv(readyEnv());

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", adminPayload(), headers),
      ),
    );

    assert.equal(result.status, 403, `${label}: expected admin boundary block`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: blocked response must stay safe`);
  }

  setEnv(readyEnv());

  const customerMock = installMockClient();
  const customerResult = await readResponse(
    await customerRoute.POST(
      requestWithJson(
        "http://localhost/api/customer-booking-requests",
        customerPayload(),
        customerHeaders(),
      ),
    ),
  );

  assert.equal(customerResult.status, 403);
  assert.deepEqual(customerResult.body, {
    error: customerSafeError,
    ok: false,
  });
  assertNoSupabaseTouched(customerMock, "customer booking request path");
  assertNoLeaks(customerResult, "customer booking request response must stay safe");

  for (const unsafeField of [
    "customer_price",
    "quoted_price",
    "driver_payout",
    "paynow_payout",
    "invoice_payment_pdf_link",
    "internal_finance_notes",
    "parser_debug_internals",
    "raw_ai_parser_prompt_text",
    "live_location_url",
    "proof_photo_url",
    "notification_send_records",
    "mock_archive_content",
    "dev_workbench_content",
  ]) {
    setEnv(readyEnv());

    const routeMock = installMockClient();
    const routeResult = await readResponse(
      await adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          adminPayload({
            booking: {
              [unsafeField]: `${unsafeField} should not pass`,
            },
          }),
          sessionHeaders(),
        ),
      ),
    );

    assert.equal(routeResult.status, 400, `${unsafeField}: route should reject before adapter`);
    assert.deepEqual(routeResult.body, {
      error: "Forbidden admin booking fields rejected.",
      ok: false,
    });
    assertNoSupabaseTouched(routeMock, `${unsafeField} route`);
    assertNoLeaks(routeResult, `${unsafeField} route response must stay safe`);

    const directMock = installMockClient();
    const directResult = await persistence.createAdminBooking(
      adminPayload({
        booking: {
          [unsafeField]: `${unsafeField} should not pass direct create`,
        },
      }),
      validActor(),
    );

    assert.deepEqual(directResult, {
      error: "Forbidden admin booking fields rejected.",
      ok: false,
      status: 400,
    });
    assertNoSupabaseTouched(directMock, `${unsafeField} direct create`);
    assertNoLeaks(directResult, `${unsafeField} direct create response must stay safe`);
  }

  const directUpdateMock = installMockClient();
  const directUpdateResult = await persistence.updateAdminBooking(
    {
      target_booking_reference: "CONTROLLED-ADM-001",
      ...adminPayload({
        booking: {
          booking_reference: "CONTROLLED-ADM-001",
          invoice_pdf_url: "https://example.invalid/unsafe.pdf",
        },
      }),
    },
    validActor(),
  );

  assert.deepEqual(directUpdateResult, {
    error: "Forbidden admin booking fields rejected.",
    ok: false,
    status: 400,
  });
  assertNoSupabaseTouched(directUpdateMock, "direct update unsafe payload");
  assertNoLeaks(directUpdateResult, "direct update unsafe response must stay safe");

  for (const role of ["admin", "dispatcher"]) {
    setEnv(readyEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
      ),
    );

    assert.equal(result.status, 200, `${role}: expected mocked controlled write`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.booking.booking_reference, "CONTROLLED-ADM-001");
    assert.equal(result.body.booking.customer_display_name, "Controlled Safe Account");
    assert.equal(result.body.booking.pickup_at, "2026-06-08T10:30:00+08:00");
    assert.equal(result.body.booking.route_summary, "Controlled Safe Pickup > Controlled Safe Dropoff");
    assert.equal(mock.createdClients.length, 1, `${role}: expected one mocked client`);
    assert.equal(mock.createdClients[0].url, supabaseUrlSentinel);
    assert.equal(mock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
    assert.deepEqual(mock.createdClients[0].options, {
      auth: {
        persistSession: false,
      },
    });
    assertSafeCreateOperations(mock, role);
    assertNoLeaks(result, `${role}: safe response must not expose secrets or unsafe fields`);
  }

  setEnv(readyEnv());

  const failureMock = installMockClient({
    failures: {
      "insert:bookings": {
        message: `SQL stack with ${serviceRoleSentinel} and Supabase internals should not leak`,
      },
    },
  });
  const failureResult = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin booking persistence save failed safely.",
    ok: false,
  });
  assert.equal(failureMock.createdClients.length, 1);
  assertNoLeaks(failureResult, "adapter failure response must hide Supabase internals");
} finally {
  restoreEnv();
  delete globalThis.__prestigeControlledRealWriteMock;
  await harness.cleanup();
}

console.log("Admin booking controlled real-write enablement tests passed.");
