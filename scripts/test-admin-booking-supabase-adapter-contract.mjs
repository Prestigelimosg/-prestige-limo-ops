import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const customerBlockedMessage =
  "Booking requests can be submitted only from the customer booking form.";
const disabledPersistenceError =
  "Admin booking persistence is not enabled on this server.";
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
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_SENTINEL_DO_NOT_LEAK";
const serverOnlySentinel = "SERVER_ONLY_SECRET_SENTINEL_DO_NOT_LEAK";
const serverSessionToken = "mock-contract-admin-session-token";
const supabaseUrlSentinel = "https://contract-ready.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_SENTINEL|SERVER_ONLY_SECRET_SENTINEL|service_role|server-only|server_only|sql|stack|secret|key/i;
const forbiddenResponseLeakPattern =
  /customer_charge|customer_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_qa|archive|service_role|server_only|secret/i;
const sourceFiles = [
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-bookings/route.ts",
  "app/api/customer-booking-requests/route.ts",
];

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
      "  const mock = globalThis.__prestigeSupabaseAdapterMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-supabase-contract-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);
  const adapter = require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js"));
  const persistence = require(path.join(tempDir, "lib/admin-booking-persistence.js"));
  const adminRoute = require(path.join(tempDir, "app/api/admin-bookings/route.js"));
  const customerRoute = require(path.join(tempDir, "app/api/customer-booking-requests/route.js"));

  return {
    adapter,
    adminRoute,
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerRoute,
    persistence,
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
  constructor(seed = {}) {
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

    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => clone(row));
      this.nextIds[table] = rows.length + 1;
    }
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  createId(table) {
    const nextId = this.nextIds[table]++;

    return `${table}-${nextId}`;
  }

  recordOperation(action, table, payload) {
    this.operations.push({
      action,
      payload: clone(payload),
      table,
    });
  }

  insertRows(table, payload, resultMode, selectedColumns) {
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
    this.recordOperation("update", table, payload);

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

    if (resultMode === "single") {
      return {
        data: this.projectRow(hydratedRows[0] || null, selectedColumns),
        error: null,
      };
    }

    if (resultMode === "maybeSingle") {
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

function installMockClient(seed) {
  const client = new MockSupabaseClient(seed);

  globalThis.__prestigeSupabaseAdapterMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeSupabaseAdapterMock;
}

function canonicalAdminPayload(overrides = {}) {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: "SAFE-ADM-001",
      cancellation_review_status: "pending_review",
      change_review_status: "pending_review",
      contact_display_name: "Safe Ops Contact",
      contact_email: "safe-ops@example.com",
      contact_phone: "+65 9000 0001",
      customer_display_name: "Safe Ops Account",
      customer_facing_status: "pending_review",
      dropoff_location: "Safe Canonical Dropoff",
      passenger_name: "Safe Passenger",
      passenger_phone: "+65 9000 0002",
      pickup_at: "2026-06-08T10:30:00+08:00",
      pickup_location: "Safe Canonical Pickup",
      request_review_status: "pending_review",
      route_summary: "Safe Canonical Pickup > Safe Canonical Stop > Safe Canonical Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-dashboard",
      ...overrides.booking,
    },
    route_points: [
      {
        location: "Safe Canonical Pickup",
        notes: "Safe pickup note",
        point_type: "pickup",
        sequence: 1,
      },
      {
        location: "Safe Canonical Stop",
        notes: "Safe stop note",
        point_type: "stop",
        sequence: 2,
      },
      {
        location: "Safe Canonical Dropoff",
        notes: "Safe dropoff note",
        point_type: "dropoff",
        sequence: 3,
      },
      ...(overrides.route_points || []),
    ],
    service_items: [
      {
        item_type: "extra_stop",
        notes: "Safe extra stop note",
        quantity: 1,
      },
      {
        blocks_count: 2,
        notes: "Safe midnight note",
        service_item_type: "midnight_charge",
      },
      ...(overrides.service_items || []),
    ],
  };
}

function canonicalCustomerPayload(overrides = {}) {
  return {
    companyName: "Direct Customer Company",
    contactNo: "+65 9000 2222",
    dropoffLocation: "Direct Customer Dropoff",
    emailAddress: "direct-customer@example.com",
    extraStops: "Direct Customer Stop",
    flightNumber: "SQ222",
    luggage: "1",
    passengerCount: "2",
    passengerName: "Direct Customer Passenger",
    pickupDate: "2026-06-08",
    pickupLocation: "Direct Customer Pickup",
    pickupTime: "10:30",
    serviceType: "Airport Arrival",
    vehicleType: "Alphard / Vellfire",
    ...overrides,
  };
}

function adminActor() {
  return {
    actor_label: "Contract Test Admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
}

function adminAudit(action = "admin_booking_create") {
  return {
    action,
    actor_label: "Contract Test Admin",
    change_summary: "Contract test safe operational booking write.",
    source_route: "/api/admin-bookings",
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

function customerHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    origin: "http://localhost",
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-request",
    ...overrides,
  };
}

function jsonRequest(url, body, options = {}) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: options.headers || { "content-type": "application/json" },
    method: options.method || "POST",
  });
}

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoUnsafeKeys(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, forbiddenResponseLeakPattern, `${label} should not include unsafe field names.`);
  assert.doesNotMatch(text, /SUPABASE_SERVICE_ROLE_KEY_SENTINEL|SERVER_ONLY_SECRET_SENTINEL/);
}

function assertNoApiLeak(value, label) {
  assert.doesNotMatch(JSON.stringify(value), safeApiLeakPattern, label);
}

function insertedOperation(client, table) {
  return client.operations.find((operation) => operation.action === "insert" && operation.table === table);
}

function insertedOperations(client, table) {
  return client.operations.filter((operation) => operation.action === "insert" && operation.table === table);
}

function assertSixTableCreateMapping(mock) {
  const { client } = mock;
  const insertedTables = insertedOperations(client, "customers")
    .concat(insertedOperations(client, "customer_contacts"))
    .concat(insertedOperations(client, "bookings"))
    .concat(insertedOperations(client, "booking_route_points"))
    .concat(insertedOperations(client, "booking_service_items"))
    .concat(insertedOperations(client, "audit_logs"))
    .map((operation) => operation.table);

  assert.deepEqual(
    [...new Set(insertedTables)].sort(),
    [
      "audit_logs",
      "booking_route_points",
      "booking_service_items",
      "bookings",
      "customer_contacts",
      "customers",
    ],
  );

  assert.deepEqual(insertedOperation(client, "customers").payload, {
    display_name: "Safe Ops Account",
    status: "active",
  });
  assert.deepEqual(insertedOperation(client, "customer_contacts").payload, {
    customer_id: "customers-1",
    display_name: "Safe Ops Contact",
    email: "safe-ops@example.com",
    is_primary: true,
    phone: "+65 9000 0001",
    role_label: "booking_contact",
  });
  assert.deepEqual(insertedOperation(client, "bookings").payload, {
    admin_internal_status: "needs_review",
    booking_reference: "SAFE-ADM-001",
    cancellation_review_status: "pending_review",
    change_review_status: "pending_review",
    contact_display_name: "Safe Ops Contact",
    contact_email: "safe-ops@example.com",
    contact_phone: "+65 9000 0001",
    customer_display_name: "Safe Ops Account",
    customer_facing_status: "pending_review",
    customer_id: "customers-1",
    dropoff_location: "Safe Canonical Dropoff",
    passenger_name: "Safe Passenger",
    passenger_phone: "+65 9000 0002",
    pickup_at: "2026-06-08T10:30:00+08:00",
    pickup_location: "Safe Canonical Pickup",
    request_review_status: "pending_review",
    route_summary: "Safe Canonical Pickup > Safe Canonical Stop > Safe Canonical Dropoff",
    service_type: "MNG",
    short_notice_review_status: "not_required",
    source_surface: "admin_dashboard",
  });
  assert.deepEqual(insertedOperation(client, "booking_route_points").payload, [
    {
      booking_id: "bookings-1",
      location: "Safe Canonical Pickup",
      notes: "Safe pickup note",
      point_type: "pickup",
      sequence: 1,
    },
    {
      booking_id: "bookings-1",
      location: "Safe Canonical Stop",
      notes: "Safe stop note",
      point_type: "stop",
      sequence: 2,
    },
    {
      booking_id: "bookings-1",
      location: "Safe Canonical Dropoff",
      notes: "Safe dropoff note",
      point_type: "dropoff",
      sequence: 3,
    },
  ]);
  assert.deepEqual(insertedOperation(client, "booking_service_items").payload, [
    {
      booking_id: "bookings-1",
      item_type: "extra_stop",
      notes: "Safe extra stop note",
      quantity: 1,
    },
    {
      booking_id: "bookings-1",
      item_type: "midnight",
      notes: "Safe midnight note",
      quantity: 2,
    },
  ]);

  const auditRow = insertedOperation(client, "audit_logs").payload;

  assert.equal(auditRow.actor_role, "admin");
  assert.equal(auditRow.action_type, "booking_created");
  assert.equal(auditRow.booking_id, "bookings-1");
  assert.equal(auditRow.customer_id, "customers-1");
  assert.equal(auditRow.booking_reference, "SAFE-ADM-001");
  assert.equal(auditRow.source_surface, "admin_api");
  assert.equal(auditRow.safe_before, null);
  assert.equal(auditRow.safe_after.booking_reference, "SAFE-ADM-001");
  assert.equal(auditRow.safe_after.customer_display_name, "Safe Ops Account");
  assertNoUnsafeKeys(client.operations, "mocked Supabase write operations");
}

function assertCreatedClient(mock) {
  assert.equal(mock.createdClients.length, 1);
  assert.equal(mock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(mock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.deepEqual(mock.createdClients[0].options, {
    auth: {
      persistSession: false,
    },
  });
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

  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  });

  const parsedAdmin = persistence.parseAdminBookingPersistencePayload(canonicalAdminPayload());

  assert.equal(parsedAdmin.ok, true);

  const createMock = installMockClient();
  const createResult = await adapter.createAdminBookingThroughSupabaseAdapter(
    parsedAdmin.data,
    adminAudit(),
    adminActor(),
  );

  assert.equal(createResult.ok, true);
  assert.equal(createResult.data.booking_reference, "SAFE-ADM-001");
  assert.equal(createResult.data.source_surface, "admin_dashboard");
  assert.deepEqual(
    createResult.data.route_points.map((routePoint) => routePoint.location_text),
    ["Safe Canonical Pickup", "Safe Canonical Stop", "Safe Canonical Dropoff"],
  );
  assert.deepEqual(
    createResult.data.service_items.map((serviceItem) => serviceItem.item_type),
    ["extra_stop", "midnight"],
  );
  assertCreatedClient(createMock);
  assertSixTableCreateMapping(createMock);

  const listResult = await adapter.listAdminBookingsThroughSupabaseAdapter(adminActor());

  assert.equal(listResult.ok, true);
  assert.equal(listResult.data.length, 1);
  assert.equal(listResult.data[0].booking_reference, "SAFE-ADM-001");
  assertNoUnsafeKeys(listResult, "list adapter DTO");

  const updatePayload = canonicalAdminPayload({
    booking: {
      admin_internal_status: "approved_internally",
      booking_reference: "SAFE-ADM-001",
      customer_facing_status: "confirmed",
      pickup_location: "Updated Safe Pickup",
      route_summary: "Updated Safe Pickup > Updated Safe Dropoff",
      service_type: "Transfer",
    },
    route_points: [],
    service_items: [
      {
        notes: "Safe waiting note",
        quantity: 3,
        service_item_type: "waiting_time",
      },
    ],
  });
  updatePayload.route_points = [
    {
      location_text: "Updated Safe Pickup",
      point_type: "pickup",
      sequence_number: 1,
    },
    {
      location_text: "Updated Safe Dropoff",
      point_type: "dropoff",
      sequence_number: 2,
    },
  ];
  updatePayload.booking.dropoff_location = "Updated Safe Dropoff";
  const parsedUpdate = persistence.parseAdminBookingUpdatePayload({
    ...updatePayload,
    target_booking_reference: "SAFE-ADM-001",
  });

  assert.equal(parsedUpdate.ok, true);

  const updateResult = await adapter.updateAdminBookingThroughSupabaseAdapter(
    parsedUpdate.data,
    adminAudit("admin_booking_update"),
    adminActor(),
  );

  assert.equal(updateResult.ok, true);
  assert.equal(updateResult.data.pickup_location, "Updated Safe Pickup");
  assert.equal(updateResult.data.admin_internal_status, "Ready for Confirmation");

  const updateOperation = createMock.client.operations.find(
    (operation) => operation.action === "update" && operation.table === "bookings",
  );
  const auditUpdates = insertedOperations(createMock.client, "audit_logs");

  assert.equal(updateOperation.payload.service_type, "transfer");
  assert.equal(updateOperation.payload.admin_internal_status, "approved_internal");
  assert.equal(updateOperation.payload.customer_facing_status, "confirmed");
  assert.equal(auditUpdates.at(-1).payload.action_type, "booking_updated");
  assert.equal(auditUpdates.at(-1).payload.safe_before.booking_reference, "SAFE-ADM-001");
  assert.equal(auditUpdates.at(-1).payload.safe_after.pickup_location, "Updated Safe Pickup");
  assertNoUnsafeKeys(updateOperation, "mocked update operation");

  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  });

  const disabledMock = installMockClient();
  const disabledResult = await persistence.createAdminBooking(parsedAdmin.data, adminActor(), adminAudit());

  assert.deepEqual(disabledResult, {
    error: disabledPersistenceError,
    ok: false,
    status: 503,
  });
  assert.equal(disabledMock.createdClients.length, 0);
  assert.equal(disabledMock.client.operations.length, 0);

  for (const unsafeField of [
    "customer_price",
    "customer_charge",
    "rate_amount",
    "driver_payout",
    "paynow_payout",
    "invoice_number",
    "invoice_payment_pdf_link",
    "billing_automation_status",
    "internal_finance_notes",
    "parser_debug_internals",
    "raw_ai_parser_prompt_text",
    "live_location_url",
    "proof_photo_url",
    "notification_delivery_records",
    "mock_qa_archive",
    "dev_workbench_content",
    "service_role_secret",
    "server_only_secret",
  ]) {
    const unsafePayload = canonicalAdminPayload({
      booking: {
        [unsafeField]: `${unsafeField} must be rejected`,
      },
    });
    const unsafeMock = installMockClient();
    const unsafeParsed = persistence.parseAdminBookingPersistencePayload(unsafePayload);

    assert.equal(unsafeParsed.ok, false, `${unsafeField} should be rejected`);
    assert.equal(unsafeParsed.status, 400);
    assert.equal(unsafeParsed.error, "Forbidden admin booking fields rejected.");
    assert.equal(unsafeMock.createdClients.length, 0);
    assert.equal(unsafeMock.client.operations.length, 0);
  }

  const missingBoundary = await readRouteResponse(
    await adminRoute.GET(new Request("http://localhost/api/admin-bookings")),
  );

  assert.equal(missingBoundary.status, 403);
  assert.deepEqual(missingBoundary.body, {
    error: routeBlockedMessage,
    ok: false,
  });
  assertNoApiLeak(missingBoundary, "admin missing-boundary response should hide server internals");

  const forbiddenAdminRouteMock = installMockClient();
  const forbiddenAdminRoute = await readRouteResponse(
    await adminRoute.POST(
      jsonRequest(
        "http://localhost/api/admin-bookings",
        {
          ...canonicalAdminPayload(),
          booking: {
            ...canonicalAdminPayload().booking,
            service_role_secret: serverOnlySentinel,
          },
        },
        {
          headers: adminHeaders(),
          method: "POST",
        },
      ),
    ),
  );

  assert.equal(forbiddenAdminRoute.status, 400);
  assert.deepEqual(forbiddenAdminRoute.body, {
    error: "Forbidden admin booking fields rejected.",
    ok: false,
  });
  assert.equal(forbiddenAdminRouteMock.createdClients.length, 0);
  assert.equal(forbiddenAdminRouteMock.client.operations.length, 0);
  assertNoUnsafeKeys(forbiddenAdminRoute, "admin forbidden route response");

  const disabledRouteMock = installMockClient();
  const disabledAdminRoute = await readRouteResponse(
    await adminRoute.POST(
      jsonRequest("http://localhost/api/admin-bookings", canonicalAdminPayload(), {
        headers: adminHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(disabledAdminRoute.status, 503);
  assert.equal(disabledAdminRoute.body.ok, false);
  assert.equal(disabledAdminRoute.body.error, disabledPersistenceError);
  assert.equal(disabledRouteMock.createdClients.length, 0);
  assert.equal(disabledRouteMock.client.operations.length, 0);
  assertNoApiLeak(disabledAdminRoute, "admin disabled route response should hide server internals");

  const blockedCustomerRoute = await readRouteResponse(
    await customerRoute.POST(
      jsonRequest(
        "http://localhost/api/customer-booking-requests",
        canonicalCustomerPayload(),
        {
          headers: {
            "content-type": "application/json",
            "x-prestige-customer-purpose": "customer-booking-request",
          },
          method: "POST",
        },
      ),
    ),
  );

  assert.equal(blockedCustomerRoute.status, 403);
  assert.deepEqual(blockedCustomerRoute.body, {
    error: customerBlockedMessage,
    ok: false,
  });
  assertNoApiLeak(blockedCustomerRoute, "blocked customer route response should hide server internals");

  const customerUnsafeRouteMock = installMockClient();
  const customerUnsafeRoute = await readRouteResponse(
    await customerRoute.POST(
      jsonRequest(
        "http://localhost/api/customer-booking-requests",
        canonicalCustomerPayload({
          driverPayout: "must not be accepted",
        }),
        {
          headers: customerHeaders(),
          method: "POST",
        },
      ),
    ),
  );

  assert.equal(customerUnsafeRoute.status, 400);
  assert.equal(customerUnsafeRoute.body.ok, false);
  assert.equal(
    customerUnsafeRoute.body.error,
    "Booking request includes fields outside the approved request scope.",
  );
  assert.equal(customerUnsafeRouteMock.createdClients.length, 0);
  assert.equal(customerUnsafeRouteMock.client.operations.length, 0);
  assertNoUnsafeKeys(customerUnsafeRoute, "customer unsafe route response");

  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: "https://example.supabase.co",
  });

  const customerCreateMock = installMockClient();
  const customerCreateRoute = await readRouteResponse(
    await customerRoute.POST(
      jsonRequest(
        "http://localhost/api/customer-booking-requests",
        canonicalCustomerPayload(),
        {
          headers: customerHeaders(),
          method: "POST",
        },
      ),
    ),
  );

  assert.equal(customerCreateRoute.status, 403);
  assert.deepEqual(customerCreateRoute.body, {
    error: "Booking request could not be saved safely.",
    ok: false,
  });
  assert.equal(customerCreateMock.createdClients.length, 0);
  assert.equal(customerCreateMock.client.operations.length, 0);
  assertNoApiLeak(customerCreateRoute, "blocked customer enabled-write response should hide server internals");
} finally {
  restoreEnv();
  delete globalThis.__prestigeSupabaseAdapterMock;
  await harness.cleanup();
}

console.log("Admin booking Supabase adapter mocked contract tests passed.");
