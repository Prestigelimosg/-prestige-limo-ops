import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledPersistenceError =
  "Admin booking persistence is not enabled on this server.";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_GATE_SENTINEL_DO_NOT_LEAK";
const supabaseUrlSentinel = "https://gate-sentinel.supabase.co";
const serverSessionToken = "mock-admin-dispatcher-session-token";
const unsafeFieldLeakPattern =
  /customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|service_role|server_only|secret/i;
const safeResponseLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_GATE_SENTINEL|mock-admin-dispatcher-session-token|gate-sentinel\.supabase\.co|service_role|server-only|server_only|stack|sql|supabase internals|createClient|secret|key/i;
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
      "  const mock = globalThis.__prestigePersistenceGateMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
  await mkdir(path.join(tempDir, "lib"), { recursive: true });
  await writeFile(
    path.join(tempDir, "lib/customer-driver-app-notification-persistence.js"),
    [
      "async function maybePersistCustomerDriverAppNotification() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { maybePersistCustomerDriverAppNotification };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-app-notification-persistence.js"),
    [
      "async function createCustomerBookingRequestAdminAppNotification() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { createCustomerBookingRequestAdminAppNotification };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-device-push-notification.js"),
    [
      "async function sendAdminNewBookingDevicePushAlert() {",
      "  return { external_send: false, no_op: true, ok: true, status: 'blocked' };",
      "}",
      "module.exports = { sendAdminNewBookingDevicePushAlert };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-new-booking-email-alert.js"),
    [
      "async function sendAdminNewBookingEmailAlert() {",
      "  return { external_send: false, no_op: true, ok: true, status: 'blocked' };",
      "}",
      "module.exports = { sendAdminNewBookingEmailAlert };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/customer-saved-bookings-read.js"),
    [
      "function resolveCustomerSavedBookingsBoundaryForPurpose() {",
      "  return { error: 'Customer portal authentication is required.', ok: false, status: 401 };",
      "}",
      "async function resolveCustomerSavedBookingsVerifiedIdentity() {",
      "  return { error: 'Customer portal authentication is required.', ok: false, status: 401 };",
      "}",
      "module.exports = { resolveCustomerSavedBookingsBoundaryForPurpose, resolveCustomerSavedBookingsVerifiedIdentity };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-persistence-gate-"));

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

    return this;
  }

  delete() {
    this.operation = "delete";

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
        created_at: row.created_at || "2026-06-04T00:00:00.000Z",
        updated_at: row.updated_at || "2026-06-04T00:00:00.000Z",
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

    this.recordOperation("update", table, payload);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.applyFilters(this.tables[table], filters);

    for (const row of rows) {
      Object.assign(row, clone(payload));
    }

    return {
      data: null,
      error: null,
    };
  }

  deleteRows(table, filters) {
    this.recordOperation("delete", table, { filters });

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

  globalThis.__prestigePersistenceGateMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigePersistenceGateMock;
}

function adminPayload(overrides = {}) {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: "GATE-ADM-001",
      contact_display_name: "Gate Safe Contact",
      contact_email: "gate-safe@example.com",
      contact_phone: "+65 9000 0101",
      customer_display_name: "Gate Safe Account",
      customer_facing_status: "pending_review",
      dropoff_location: "Gate Safe Dropoff",
      passenger_name: "Gate Passenger",
      passenger_phone: "+65 9000 0102",
      pickup_at: "2026-06-08T10:30:00+08:00",
      pickup_location: "Gate Safe Pickup",
      route_summary: "Gate Safe Pickup > Gate Safe Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-api",
      ...overrides.booking,
    },
    route_points: [
      {
        location: "Gate Safe Pickup",
        point_type: "pickup",
        sequence: 1,
      },
      {
        location: "Gate Safe Dropoff",
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
    companyName: "Gate Customer Company",
    contactNo: "+65 9000 0202",
    dropoffLocation: "Gate Customer Dropoff",
    emailAddress: "gate-customer@example.com",
    extraStops: "",
    flightNumber: "SQ202",
    luggage: "1",
    passengerCount: "2",
    passengerName: "Gate Customer Passenger",
    pickupDate: "2030-07-08",
    pickupLocation: "Gate Customer Pickup",
    pickupTime: "10:30",
    serviceType: "Airport Arrival",
    vehicleType: "Alphard / Vellfire",
    ...overrides,
  };
}

function singaporeDateTimeParts(date) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    day: "2-digit",
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Singapore",
    year: "numeric",
  })
    .formatToParts(date)
    .reduce((memo, part) => {
      if (part.type !== "literal") {
        memo[part.type] = part.value;
      }
      return memo;
    }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
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

function postJson(url, body, headers) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
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

function assertSafeCreateOperations(mock, expectedActorRole) {
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
  assert.equal(
    insertedOperation(mock, "customers").payload.display_name,
    "Gate Safe Account / Booker: Gate Safe Contact / Passenger: Gate Passenger",
  );
  assert.equal(insertedOperation(mock, "bookings").payload.booking_reference, "GATE-ADM-001");
  assert.equal(insertedOperation(mock, "bookings").payload.customer_display_name, "Gate Safe Account");
  assert.equal(insertedOperation(mock, "bookings").payload.pickup_at, "2026-06-08T10:30:00+08:00");
  assert.equal(insertedOperation(mock, "bookings").payload.route_summary, "Gate Safe Pickup > Gate Safe Dropoff");
  assert.equal(insertedOperation(mock, "bookings").payload.service_type, "MNG");
  assert.equal(insertedOperation(mock, "bookings").payload.admin_internal_status, "admin_review_required");
  assert.equal(insertedOperation(mock, "audit_logs").payload.actor_role, expectedActorRole);
  assert.equal(insertedOperation(mock, "audit_logs").payload.action_type, "booking_created");
  assertNoLeaks(mock.client.operations, "safe mocked persistence operations should not include unsafe fields");
}

function assertSafeCustomerBookingRequestOperations(mock) {
  const insertedTables = mock.client.operations
    .filter((operation) => operation.action === "insert")
    .map((operation) => operation.table);

  assert.deepEqual([...new Set(insertedTables)].sort(), [
    "audit_logs",
    "booking_route_points",
    "bookings",
    "customer_contacts",
    "customers",
  ]);
  assert.equal(
    insertedOperation(mock, "customers").payload.display_name,
    "Gate Customer Company / Passenger: Gate Customer Passenger",
  );

  const bookingRow = insertedOperation(mock, "bookings").payload;

  assert.match(bookingRow.booking_reference, /^CUST-\d{14}-[A-Z0-9]+$/);
  assert.equal(bookingRow.customer_display_name, "Gate Customer Company");
  assert.equal(bookingRow.contact_phone, "+65 9000 0202");
  assert.equal(bookingRow.contact_email, "gate-customer@example.com");
  assert.equal(bookingRow.passenger_name, "Gate Customer Passenger");
  assert.equal(bookingRow.pickup_at, "2030-07-08T10:30:00+08:00");
  assert.equal(bookingRow.pickup_location, "Gate Customer Pickup");
  assert.equal(bookingRow.dropoff_location, "Gate Customer Dropoff");
  assert.equal(bookingRow.route_summary, "Gate Customer Pickup > Gate Customer Dropoff");
  assert.equal(bookingRow.service_type, "arrival");
  assert.equal(bookingRow.customer_facing_status, "received");
  assert.equal(bookingRow.admin_internal_status, "admin_review_required");
  assert.equal(bookingRow.source_surface, "customer_booking_request");

  const routeRows = insertedOperation(mock, "booking_route_points").payload;

  assert.equal(routeRows.length, 2);
  assert.equal(routeRows[0].location, "Gate Customer Pickup");
  assert.equal(routeRows[1].location, "Gate Customer Dropoff");

  const auditRow = insertedOperation(mock, "audit_logs").payload;

  assert.equal(auditRow.actor_role, "system");
  assert.equal(auditRow.action_type, "booking_created");
  assert.equal(auditRow.source_surface, "system");
  assert.match(auditRow.reason, /Source: \/book/);
  assert.match(auditRow.reason, /Actor: Customer booking request/);
  assertNoLeaks(mock.client.operations, "customer booking request mocked persistence operations should stay safe");
}

function enabledWriteEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Gate Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  };
}

const harness = await loadHarness();

try {
  const { adapter, adminRoute, customerRoute, persistence } = harness;

  assert.equal(
    adapter.adminBookingSupabaseAdapterVersion,
    "stage-4a-376-server-only-supabase-adapter-v1",
  );
  assert.equal(
    persistence.adminBookingPersistenceContractVersion,
    "stage-4a-376-admin-only-safe-operational-adapter-v1",
  );

  for (const [label, flagValue] of [
    ["missing feature flag", undefined],
    ["false feature flag", "false"],
  ]) {
    setEnv({
      NEXT_PUBLIC_SUPABASE_URL: undefined,
      PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: flagValue,
      PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
      PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
      PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
      SUPABASE_URL: supabaseUrlSentinel,
    });

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(postJson("http://localhost/api/admin-bookings", adminPayload(), adminHeaders())),
    );

    assert.equal(result.status, 503, `${label}: expected disabled persistence status`);
    assert.deepEqual(result.body, {
      error: disabledPersistenceError,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  for (const [label, envOverrides, headers] of [
    [
      "enabled flag without server-session auth mode",
      { PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined },
      adminHeaders(),
    ],
    ["enabled flag with anonymous request", {}, { "content-type": "application/json" }],
    [
      "enabled flag with customer referer",
      {},
      sessionHeaders({ referer: "http://localhost/book" }),
    ],
    [
      "enabled flag with driver referer",
      {},
      sessionHeaders({ referer: "http://localhost/driver-job/mock-token" }),
    ],
    [
      "enabled flag with public origin spoof",
      {},
      sessionHeaders({ origin: "https://public.example.invalid" }),
    ],
  ]) {
    setEnv(enabledWriteEnv(envOverrides));

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(postJson("http://localhost/api/admin-bookings", adminPayload(), headers)),
    );

    assert.equal(result.status, 403, `${label}: expected blocked admin boundary`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  for (const role of ["customer", "driver", "system", "local-dev-admin", ""]) {
    setEnv(enabledWriteEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        postJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
      ),
    );

    assert.equal(result.status, 403, `Malformed session role ${JSON.stringify(role)} should be blocked`);
    assertNoSupabaseTouched(mock, `malformed role ${JSON.stringify(role)}`);
    assertNoLeaks(result, `malformed role ${JSON.stringify(role)} response should stay safe`);
  }

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
    setEnv(enabledWriteEnv());

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        postJson(
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

    assert.equal(result.status, 400, `${unsafeField} should be rejected before persistence`);
    assert.deepEqual(result.body, {
      error: "Forbidden admin booking fields rejected.",
      ok: false,
    });
    assertNoSupabaseTouched(mock, `${unsafeField} unsafe field`);
    assertNoLeaks(result, `${unsafeField} response should stay generic`);
  }

  for (const role of ["admin", "dispatcher"]) {
    setEnv(enabledWriteEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        postJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
      ),
    );

    assert.equal(result.status, 200, `${role} server session should reach mocked safe persistence path`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.booking.booking_reference, "GATE-ADM-001");
    assert.equal(result.body.booking.customer_display_name, "Gate Safe Account");
    assert.equal(result.body.booking.pickup_at, "2026-06-08T10:30:00+08:00");
    assert.equal(result.body.booking.route_summary, "Gate Safe Pickup > Gate Safe Dropoff");
    assert.equal(result.body.booking.admin_internal_status, "Admin Review Required");
    assert.equal(mock.createdClients.length, 1);
    assert.equal(mock.createdClients[0].url, supabaseUrlSentinel);
    assert.equal(mock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
    assert.deepEqual(mock.createdClients[0].options, {
      auth: {
        persistSession: false,
      },
    });
    assertSafeCreateOperations(mock, role);
    assertNoLeaks(result, `${role} response should expose only safe DTO fields`);
  }

  for (const actor of [
    {
      actor_label: "Customer request actor",
      actor_role: "system",
      boundary_mode: "customer-booking-request-surface",
      source_surface: "customer_booking_request",
    },
    {
      actor_label: "Local dev actor",
      actor_role: "admin",
      boundary_mode: "local-dev-admin-surface",
      source_surface: "admin_api",
    },
    {
      actor_label: "Wrong source actor",
      actor_role: "admin",
      boundary_mode: "server-session-role-surface",
      source_surface: "system",
    },
  ]) {
    setEnv(enabledWriteEnv());

    const mock = installMockClient();
    const parsed = persistence.parseAdminBookingPersistencePayload(adminPayload());
    const result = await persistence.createAdminBooking(parsed.data, actor, {
      action: "admin_booking_create",
      actor_label: actor.actor_label,
      change_summary: "Malformed actor should be blocked.",
      source_route: "/api/admin-bookings",
    });

    assert.deepEqual(result, {
      error: "Admin booking persistence requires a verified admin or dispatcher server session.",
      ok: false,
      status: 403,
    });
    assertNoSupabaseTouched(mock, `adapter actor ${actor.actor_label}`);
    assertNoLeaks(result, `adapter actor ${actor.actor_label} response should stay safe`);
  }

  setEnv(enabledWriteEnv());

  const customerMock = installMockClient();
  const customerResult = await readResponse(
    await customerRoute.POST(
      postJson(
        "http://localhost/api/customer-booking-requests",
        customerPayload(),
        customerHeaders(),
      ),
    ),
  );

  assert.equal(customerResult.status, 200);
  assert.equal(customerResult.body.ok, true);
  assert.match(customerResult.body.request.booking_reference, /^CUST-\d{14}-[A-Z0-9]+$/);
  assert.equal(customerResult.body.request.customer_facing_status, "Request Received");
  assert.equal(customerResult.body.request.return_booking_reference, null);
  assert.equal(customerResult.body.request.return_trip_requested, false);
  assert.equal(customerResult.body.request.short_notice_review_required, false);
  assert.deepEqual(Object.keys(customerResult.body.request).sort(), [
    "booking_reference",
    "customer_facing_status",
    "return_booking_reference",
    "return_trip_requested",
    "short_notice_review_required",
  ]);
  assert.equal(customerMock.createdClients.length, 1);
  assertSafeCustomerBookingRequestOperations(customerMock);
  assertNoLeaks(customerResult, "customer request enabled-write response should stay safe");

  const shortNotice = singaporeDateTimeParts(new Date(Date.now() + 2 * 60 * 60 * 1000));
  const parsedShortNotice = persistence.parseCustomerBookingRequestPayload(
    customerPayload({
      pickupDate: shortNotice.date,
      pickupTime: shortNotice.time,
    }),
  );

  assert.equal(parsedShortNotice.ok, true);
  assert.equal(parsedShortNotice.data.booking.admin_internal_status, "Admin Review Required");
  assert.equal(parsedShortNotice.data.booking.short_notice_review_status, "Admin Review Required");

  setEnv(enabledWriteEnv());

  const failureMock = installMockClient({
    failures: {
      "insert:bookings": {
        message: `SQL stack with ${serviceRoleSentinel} and Supabase internals should not leak`,
      },
    },
  });
  const failureResult = await readResponse(
    await adminRoute.POST(
      postJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin booking persistence save failed safely.",
    ok: false,
    safe_error_category: "unknown_adapter_failure",
    safe_error_operation: "booking_row",
  });
  assert.equal(failureMock.createdClients.length, 1);
  assertNoLeaks(failureResult, "adapter failure response should hide Supabase internals");
} finally {
  restoreEnv();
  delete globalThis.__prestigePersistenceGateMock;
  await harness.cleanup();
}

console.log("Admin booking persistence API gate tests passed.");
