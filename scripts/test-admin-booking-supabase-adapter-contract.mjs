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
  "lib/admin-app-notification-persistence.ts",
  "lib/admin-device-push-notification.ts",
  "lib/admin-new-booking-email-alert.ts",
  "lib/singapore-pickup-display.ts",
  "lib/customer-runtime-session-map.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/customer-booking-receipt-email.ts",
  "lib/customer-portal-access-account.ts",
  "lib/customer-portal-access-link.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-mode.ts",
  "lib/driver-job-status-workflow.ts",
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
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
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
  const webPushPath = path.join(tempDir, "node_modules/web-push/index.js");
  const jobCardPreparationPath = path.join(
    tempDir,
    "lib/codex-job-card-auto-preparation.js",
  );

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(webPushPath), { recursive: true });
  await mkdir(path.dirname(jobCardPreparationPath), { recursive: true });
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
  await writeFile(
    webPushPath,
    [
      "function setVapidDetails() {}",
      "async function sendNotification() { return { statusCode: 201 }; }",
      "module.exports = { setVapidDetails, sendNotification };",
      "module.exports.default = module.exports;",
    ].join("\n"),
  );
  await writeFile(
    jobCardPreparationPath,
    [
      "async function prepareCodexJobCardForAdminReview() {}",
      "module.exports = { prepareCodexJobCardForAdminReview };",
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
  constructor(seed = {}, options = {}) {
    this.operations = [];
    this.failures = options.failures || {};
    this.selectFailures = (options.selectFailures || []).map((failure) => ({
      ...failure,
      calls: 0,
    }));
    this.selectHistory = [];
    this.schemaMode = options.schemaMode || "cumulative";
    this.tables = {
      audit_logs: [],
      booking_route_points: [],
      booking_service_items: [],
      bookings: [],
      customer_driver_app_notification_outbox: [],
      customer_contacts: [],
      customers: [],
      driver_job_links: [],
    };
    this.nextIds = {
      audit_logs: 1,
      booking_route_points: 1,
      booking_service_items: 1,
      bookings: 1,
      customer_driver_app_notification_outbox: 1,
      customer_contacts: 1,
      customers: 1,
      driver_job_links: 1,
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

    return nextId;
  }

  recordOperation(action, table, payload) {
    this.operations.push({
      action,
      payload: clone(payload),
      table,
    });
  }

  failureFor(action, table) {
    return this.failures[`${action}:${table}`] || this.failures[table] || null;
  }

  selectFailureFor(table, selectedColumns) {
    const columns = String(selectedColumns || "");
    const failure = this.selectFailures.find(
      (item) =>
        item.table === table &&
        (!item.column || columns.includes(item.column)) &&
        (!item.once || item.calls === 0),
    );

    if (!failure) {
      return null;
    }

    failure.calls += 1;

    return failure.error;
  }

  insertRejectedByMockSchema(table, row) {
    const cumulativeRequiredColumns = {
      audit_logs: ["action", "entity_type"],
      booking_route_points: ["location_text", "sequence_number"],
      booking_service_items: ["service_item_type"],
      customer_contacts: ["contact_name"],
    };
    const currentForbiddenColumns = {
      audit_logs: ["action", "actor_label", "change_summary", "entity_id", "entity_type", "source_route"],
      booking_route_points: ["location_text", "sequence_number", "timing_note"],
      booking_service_items: ["blocks_count", "service_item_type"],
      customer_contacts: ["contact_name", "contact_type"],
    };
    const foundationRequiredColumns = {
      audit_logs: ["action", "entity_type"],
      booking_route_points: ["location_text", "sequence_number"],
      booking_service_items: ["service_item_type"],
      bookings: ["pickup_datetime", "route_type", "source_channel"],
      customer_contacts: ["contact_name"],
    };
    const foundationForbiddenColumns = {
      bookings: [
        "cancellation_review_status",
        "change_review_status",
        "contact_display_name",
        "passenger_name",
        "passenger_phone",
        "pickup_at",
        "request_review_status",
        "route_summary",
        "service_type",
        "source_surface",
      ],
    };

    if (this.schemaMode === "cumulative") {
      return (cumulativeRequiredColumns[table] || []).some((column) => !(column in row));
    }

    if (this.schemaMode === "current") {
      return (currentForbiddenColumns[table] || []).some((column) => column in row);
    }

    if (this.schemaMode === "foundation") {
      return (
        (foundationRequiredColumns[table] || []).some((column) => !(column in row)) ||
        (foundationForbiddenColumns[table] || []).some((column) => column in row)
      );
    }

    return false;
  }

  insertRows(table, payload, resultMode, selectedColumns) {
    const rows = Array.isArray(payload) ? payload : [payload];
    const configuredFailure = this.failureFor("insert", table);

    if (configuredFailure) {
      return {
        data: null,
        error: configuredFailure,
      };
    }

    if (rows.some((row) => this.insertRejectedByMockSchema(table, row))) {
      return {
        data: null,
        error: {
          code: "mock_schema_contract_rejection",
        },
      };
    }

    this.recordOperation("insert", table, payload);

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
    const configuredFailure = this.failureFor("update", table);

    if (configuredFailure) {
      return {
        data: null,
        error: configuredFailure,
      };
    }

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
    const configuredFailure = this.failureFor("delete", table);

    if (configuredFailure) {
      return {
        data: null,
        error: configuredFailure,
      };
    }

    this.recordOperation("delete", table, { filters });

    const filteredIds = new Set(this.applyFilters(this.tables[table], filters).map((row) => row.id));
    this.tables[table] = this.tables[table].filter((row) => !filteredIds.has(row.id));

    return {
      data: null,
      error: null,
    };
  }

  selectRows(table, filters, limitCount, orderBy, resultMode, selectedColumns) {
    this.selectHistory.push({
      selectedColumns,
      table,
    });

    const configuredFailure =
      this.selectFailureFor(table, selectedColumns) || this.failureFor("select", table);

    if (configuredFailure) {
      return {
        data: null,
        error: configuredFailure,
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
    if (!row) {
      return row;
    }

    if (selectedColumns !== "id") {
      const projectedRow = clone(row);

      for (const driverField of ["driver_contact", "driver_name", "driver_plate_number"]) {
        if (!String(selectedColumns || "").includes(driverField)) {
          delete projectedRow[driverField];
        }
      }

      return projectedRow;
    }

    return {
      id: row.id,
    };
  }
}

function installMockClient(seed, options) {
  const client = new MockSupabaseClient(seed, options);

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
      pickup_at: "2030-06-08T10:30:00+08:00",
      pickup_location: "Safe Canonical Pickup",
      request_review_status: "pending_review",
      route_summary: "Safe Canonical Pickup > Safe Canonical Stop > Safe Canonical Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-dashboard",
      vehicle_type_or_category: "AVF",
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
    display_name: "Safe Ops Account / Booker: Safe Ops Contact / Passenger: Safe Passenger",
    status: "active",
  });
  assert.deepEqual(insertedOperation(client, "customer_contacts").payload, {
    customer_id: 1,
    contact_name: "Safe Ops Contact",
    contact_type: "booking_contact",
    email: "safe-ops@example.com",
    phone: "+65 9000 0001",
  });
  assert.deepEqual(insertedOperation(client, "bookings").payload, {
    admin_internal_status: "needs_review",
    booker_id: null,
    booking_reference: "SAFE-ADM-001",
    cancellation_review_status: "pending_review",
    change_review_status: "pending_review",
    contact_display_name: "Safe Ops Contact",
    contact_email: "safe-ops@example.com",
    contact_phone: "+65 9000 0001",
    customer_display_name: "Safe Ops Account",
    customer_facing_status: "pending_review",
    customer_id: 1,
    company_id: null,
    driver_contact: null,
    driver_name: null,
    driver_plate_number: null,
    dropoff_datetime: null,
    dropoff_location: "Safe Canonical Dropoff",
    flight_no: null,
    passenger_name: "Safe Passenger",
    passenger_phone: "+65 9000 0002",
    pickup_at: "2030-06-08T10:30:00+08:00",
    pickup_location: "Safe Canonical Pickup",
    request_review_status: "pending_review",
    route_summary: "Safe Canonical Pickup > Safe Canonical Stop > Safe Canonical Dropoff",
    service_type: "MNG",
    short_notice_review_status: "not_required",
    source_surface: "admin_dashboard",
    traveler_id: null,
    vehicle_type_or_category: "AVF",
  });
  assert.deepEqual(insertedOperation(client, "booking_route_points").payload, [
    {
      booking_id: 1,
      location: "Safe Canonical Pickup",
      location_text: "Safe Canonical Pickup",
      notes: "Safe pickup note",
      point_type: "pickup",
      sequence: 1,
      sequence_number: 1,
      timing_note: "Safe pickup note",
    },
    {
      booking_id: 1,
      location: "Safe Canonical Stop",
      location_text: "Safe Canonical Stop",
      notes: "Safe stop note",
      point_type: "stop",
      sequence: 2,
      sequence_number: 2,
      timing_note: "Safe stop note",
    },
    {
      booking_id: 1,
      location: "Safe Canonical Dropoff",
      location_text: "Safe Canonical Dropoff",
      notes: "Safe dropoff note",
      point_type: "dropoff",
      sequence: 3,
      sequence_number: 3,
      timing_note: "Safe dropoff note",
    },
  ]);
  assert.deepEqual(insertedOperation(client, "booking_service_items").payload, [
    {
      blocks_count: 1,
      booking_id: 1,
      item_type: "extra_stop",
      notes: "Safe extra stop note",
      quantity: 1,
      service_item_type: "extra_stop",
    },
    {
      blocks_count: 2,
      booking_id: 1,
      item_type: "midnight",
      notes: "Safe midnight note",
      quantity: 2,
      service_item_type: "midnight_charge",
    },
  ]);

  const auditRow = insertedOperation(client, "audit_logs").payload;

  assert.equal(auditRow.actor_role, "admin");
  assert.equal(auditRow.action, "booking_created");
  assert.equal(auditRow.action_type, "booking_created");
  assert.equal(auditRow.actor_label, "Contract Test Admin");
  assert.equal(auditRow.booking_id, 1);
  assert.equal(auditRow.change_summary, "Contract test safe operational booking write.");
  assert.equal(auditRow.customer_id, 1);
  assert.equal(auditRow.entity_id, 1);
  assert.equal(auditRow.entity_type, "booking");
  assert.equal(auditRow.booking_reference, "SAFE-ADM-001");
  assert.equal(auditRow.source_surface, "admin_api");
  assert.equal(auditRow.source_route, "/api/admin-bookings");
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

  const adminBookingsRouteSource = await readFile("app/api/admin-bookings/route.ts", "utf8");

  assert.match(
    adminBookingsRouteSource,
    /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["POST",\s*"PATCH"\]/,
    "admin-bookings live dashboard writes must use server-session role without browser token exposure",
  );

  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST: "1",
    PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: "true",
    PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE: "one-customer",
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

  const driverReloadFallbackPayload = canonicalAdminPayload({
    booking: {
      booking_reference: "SAFE-DRIVER-CALENDAR-UPDATE-001",
      driver_contact: "+65 9000 0104",
      driver_name: "Safe Calendar Driver",
      driver_plate_number: "SCD104A",
    },
  });
  const parsedDriverReloadFallbackUpdate = persistence.parseAdminBookingUpdatePayload({
    ...driverReloadFallbackPayload,
    target_booking_reference: "SAFE-DRIVER-CALENDAR-UPDATE-001",
  });

  assert.equal(parsedDriverReloadFallbackUpdate.ok, true);

  const driverReloadFallbackMock = installMockClient(
    {
      bookings: [
        {
          ...canonicalAdminPayload().booking,
          booking_reference: "SAFE-DRIVER-CALENDAR-UPDATE-001",
          customer_id: 104,
          id: 104,
          source_surface: "admin_dashboard",
        },
      ],
    },
    {
      selectFailures: [
        {
          column: "driver_name",
          error: {
            code: "PGRST204",
            message: "Sanitized mock driver reload schema-cache source.",
          },
          table: "bookings",
        },
      ],
    },
  );
  const driverReloadFallbackResult = await adapter.updateAdminBookingThroughSupabaseAdapter(
    parsedDriverReloadFallbackUpdate.data,
    adminAudit("admin_booking_update"),
    adminActor(),
  );

  assert.equal(driverReloadFallbackResult.ok, true);
  assert.equal(driverReloadFallbackResult.data.driver_contact, "+65 9000 0104");
  assert.equal(driverReloadFallbackResult.data.driver_name, "Safe Calendar Driver");
  assert.equal(driverReloadFallbackResult.data.driver_plate_number, "SCD104A");
  const driverReloadFallbackAudit = insertedOperations(
    driverReloadFallbackMock.client,
    "audit_logs",
  ).at(-1);
  assert.equal(driverReloadFallbackAudit.payload.safe_before.driver_name, null);
  assert.equal(driverReloadFallbackAudit.payload.safe_after.driver_name, "Safe Calendar Driver");
  assert.equal(driverReloadFallbackAudit.payload.safe_after.driver_plate_number, "SCD104A");
  assert.ok(
    driverReloadFallbackMock.client.selectFailures[0].calls >= 2,
    "Expected both the current and foundation driver-bearing reloads to fail before the safe driverless fallback.",
  );
  assert.doesNotMatch(
    driverReloadFallbackMock.client.selectHistory.at(-1).selectedColumns,
    /driver_name|driver_contact|driver_plate_number/,
    "Expected the successful compatibility reload to omit driver fields before the update result restores the values that were just written.",
  );
  assertNoUnsafeKeys(driverReloadFallbackResult, "driver reload fallback update result");
  globalThis.__prestigeSupabaseAdapterMock = createMock;

  const customerRequestDecisionPayload = canonicalAdminPayload({
    booking: {
      admin_internal_status: "Ready for Confirmation",
      booking_reference: "SAFE-ADM-001",
      customer_facing_status: "confirmed",
      pickup_at: "2026-06-01T10:30:00+08:00",
      pickup_location: "Customer Request Decision Pickup",
      request_review_status: "approved",
      route_summary: "Customer Request Decision Pickup > Customer Request Decision Dropoff",
      short_notice_review_status: "reviewed",
      source_channel: "customer-booking-request",
      source_surface: "customer-booking-request",
    },
    route_points: [],
    service_items: [
      {
        notes: "Safe customer request decision service note",
        quantity: 1,
        service_item_type: "extra_stop",
      },
    ],
  });
  customerRequestDecisionPayload.booking.dropoff_location = "Customer Request Decision Dropoff";
  customerRequestDecisionPayload.route_points = [
    {
      location_text: "Customer Request Decision Pickup",
      point_type: "pickup",
      sequence_number: 1,
    },
    {
      location_text: "Customer Request Decision Dropoff",
      point_type: "dropoff",
      sequence_number: 2,
    },
  ];

  const parsedCustomerRequestDecision = persistence.parseAdminBookingUpdatePayload({
    ...customerRequestDecisionPayload,
    target_booking_reference: "SAFE-ADM-001",
  });

  assert.equal(parsedCustomerRequestDecision.ok, true);
  assert.equal(parsedCustomerRequestDecision.data.booking.admin_internal_status, "Ready for Confirmation");
  assert.equal(parsedCustomerRequestDecision.data.booking.customer_facing_status, "confirmed");
  assert.equal(parsedCustomerRequestDecision.data.booking.request_review_status, "approved");
  assert.equal(parsedCustomerRequestDecision.data.booking.short_notice_review_status, "reviewed");

  const customerRequestDecisionRoute = await readRouteResponse(
    await adminRoute.PATCH(
      jsonRequest(
        "http://localhost/api/admin-bookings",
        {
          ...customerRequestDecisionPayload,
          target_booking_reference: "SAFE-ADM-001",
        },
        {
          headers: adminHeaders({
            "x-prestige-admin-session-token": serverSessionToken,
          }),
          method: "PATCH",
        },
      ),
    ),
  );
  const customerNotificationInsert = insertedOperation(
    createMock.client,
    "customer_driver_app_notification_outbox",
  );

  assert.equal(customerRequestDecisionRoute.status, 200);
  assert.equal(customerRequestDecisionRoute.body.ok, true);
  assert.equal(customerRequestDecisionRoute.body.booking.admin_internal_status, "Ready for Confirmation");
  assert.equal(customerRequestDecisionRoute.body.booking.customer_facing_status, "confirmed");
  assert.equal(customerRequestDecisionRoute.body.booking.request_review_status, "approved");
  assert.equal(customerRequestDecisionRoute.body.booking.short_notice_review_status, "reviewed");
  assert.equal(customerRequestDecisionRoute.body.customer_notification.ok, true);
  assert.equal(
    customerRequestDecisionRoute.body.customer_notification.notification.safe_title,
    "Booking request confirmed",
  );
  assert.equal(
    customerRequestDecisionRoute.body.customer_notification.notification.safe_message,
    "Your booking request has been confirmed by Prestige Limo.",
  );
  assert.equal(customerNotificationInsert.payload.booking_reference, "SAFE-ADM-001");
  assert.equal(customerNotificationInsert.payload.delivery_surface, "customer_app");
  assert.equal(customerNotificationInsert.payload.notification_status, "queued");
  assert.equal(customerNotificationInsert.payload.notification_type, "booking_status");
  assert.equal(customerNotificationInsert.payload.workflow_area, "customer_request_review");
  assert.deepEqual(customerNotificationInsert.payload.safe_context, {
    customer_facing_status: "confirmed",
    request_review_status: "approved",
    source: "customer_request_review",
  });
  assert.doesNotMatch(
    JSON.stringify(customerNotificationInsert.payload),
    /contact_phone|contact_email|customer_price|driver_payout|paynow|invoice|payment|pdf|billing|finance|telegram|whatsapp|sms|email|raw_token|token_hash|internal_note|admin_note|mock_qa|archive/i,
    "Expected customer request decision notification insert to stay customer-safe.",
  );

  const splitCustomerMock = installMockClient();
  const splitFirst = persistence.parseAdminBookingPersistencePayload(
    canonicalAdminPayload({
      booking: {
        booking_reference: "SAFE-SPLIT-001",
        contact_display_name: "UBS Desk One",
        contact_email: "desk-one@example.com",
        customer_display_name: "UBS",
        passenger_name: "Traveller One",
      },
    }),
  );
  const splitSecond = persistence.parseAdminBookingPersistencePayload(
    canonicalAdminPayload({
      booking: {
        booking_reference: "SAFE-SPLIT-002",
        contact_display_name: "UBS Desk Two",
        contact_email: "desk-two@example.com",
        customer_display_name: "UBS",
        passenger_name: "Traveller Two",
      },
    }),
  );

  assert.equal(splitFirst.ok, true);
  assert.equal(splitSecond.ok, true);
  assert.equal(
    (await adapter.createAdminBookingThroughSupabaseAdapter(splitFirst.data, adminAudit(), adminActor())).ok,
    true,
  );
  assert.equal(
    (await adapter.createAdminBookingThroughSupabaseAdapter(splitSecond.data, adminAudit(), adminActor())).ok,
    true,
  );

  const splitCustomerNames = insertedOperations(splitCustomerMock.client, "customers").map(
    (operation) => operation.payload.display_name,
  );
  const splitBookingCustomerIds = insertedOperations(splitCustomerMock.client, "bookings").map(
    (operation) => operation.payload.customer_id,
  );

  assert.deepEqual(splitCustomerNames, [
    "UBS / Booker: UBS Desk One / Passenger: Traveller One",
    "UBS / Booker: UBS Desk Two / Passenger: Traveller Two",
  ]);
  assert.deepEqual(splitCustomerNames.includes("UBS"), false);
  assert.notEqual(
    splitBookingCustomerIds[0],
    splitBookingCustomerIds[1],
    "Same company bookings must not share one portal customer_id when booker/passenger differs.",
  );

  const currentSchemaPayload = canonicalAdminPayload({
    booking: {
      booking_reference: "SAFE-CURRENT-001",
    },
  });
  const parsedCurrentSchemaPayload = persistence.parseAdminBookingPersistencePayload(currentSchemaPayload);

  assert.equal(parsedCurrentSchemaPayload.ok, true);

  const currentSchemaMock = installMockClient({}, { schemaMode: "current" });
  const currentSchemaResult = await adapter.createAdminBookingThroughSupabaseAdapter(
    parsedCurrentSchemaPayload.data,
    adminAudit(),
    adminActor(),
  );

  assert.equal(currentSchemaResult.ok, true);
  assert.equal(currentSchemaResult.data.booking_reference, "SAFE-CURRENT-001");

  for (const operation of currentSchemaMock.client.operations.filter((item) => item.action === "insert")) {
    assertNoUnsafeKeys(operation, "current-schema insert operation");
    const rows = Array.isArray(operation.payload) ? operation.payload : [operation.payload];

    for (const row of rows) {
      assert.deepEqual(
        Object.keys(row).filter((key) =>
          [
            "actor_label",
            "change_summary",
            "contact_name",
            "contact_type",
            "blocks_count",
            "entity_id",
            "entity_type",
            "location_text",
            "sequence_number",
            "service_item_type",
            "source_route",
            "timing_note",
          ].includes(key),
        ),
        [],
        "Current-schema inserts should not include cumulative legacy DB columns.",
      );
    }
  }

  const foundationSchemaPayload = canonicalAdminPayload({
    booking: {
      booking_reference: "SAFE-FOUNDATION-CREATE-001",
      driver_contact: "+65 9000 0100",
      driver_name: "Foundation Safe Driver",
      driver_plate_number: "SFD100A",
    },
  });
  const parsedFoundationSchemaPayload =
    persistence.parseAdminBookingPersistencePayload(foundationSchemaPayload);

  assert.equal(parsedFoundationSchemaPayload.ok, true);

  const foundationSchemaMock = installMockClient({}, { schemaMode: "foundation" });
  const foundationSchemaResult = await adapter.createAdminBookingThroughSupabaseAdapter(
    parsedFoundationSchemaPayload.data,
    adminAudit(),
    adminActor(),
  );
  const foundationBookingInsert = insertedOperation(foundationSchemaMock.client, "bookings");

  assert.equal(foundationSchemaResult.ok, true);
  assert.equal(foundationSchemaResult.data.booking_reference, "SAFE-FOUNDATION-CREATE-001");
  assert.equal(foundationSchemaResult.data.pickup_at, "2030-06-08T10:30:00+08:00");
  assert.equal(foundationSchemaResult.data.service_type, "MNG");
  assert.deepEqual(foundationBookingInsert.payload, {
    admin_internal_status: "needs_review",
    booker_id: null,
    booking_reference: "SAFE-FOUNDATION-CREATE-001",
    company_id: null,
    contact_email: "safe-ops@example.com",
    contact_phone: "+65 9000 0001",
    customer_display_name: "Safe Ops Account",
    customer_facing_status: "pending_review",
    customer_id: 1,
    dropoff_datetime: null,
    dropoff_location: "Safe Canonical Dropoff",
    driver_contact: "+65 9000 0100",
    driver_name: "Foundation Safe Driver",
    driver_plate_number: "SFD100A",
    flight_no: null,
    luggage_count: null,
    parser_source_reference: null,
    pax_count: null,
    pickup_datetime: "2030-06-08T10:30:00+08:00",
    pickup_location: "Safe Canonical Pickup",
    route_type: "MNG",
    short_notice_review_status: "not_required",
    source_channel: "admin-dashboard",
    traveler_id: null,
    vehicle_type_or_category: "AVF",
  });
  assert.doesNotMatch(
    JSON.stringify(foundationBookingInsert.payload),
    /pickup_at|service_type|source_surface|route_summary|contact_display_name|passenger_name|request_review_status/,
  );
  assertNoUnsafeKeys(foundationSchemaResult, "foundation-schema create result");

  const foundationReadMock = installMockClient(
    {
      booking_route_points: [
        {
          booking_id: 101,
          location_text: "Foundation Safe Pickup",
          point_type: "pickup",
          sequence_number: 1,
          timing_note: "Foundation safe pickup timing",
        },
        {
          booking_id: 101,
          location_text: "Foundation Safe Dropoff",
          point_type: "dropoff",
          sequence_number: 2,
          timing_note: "Foundation safe dropoff timing",
        },
      ],
      booking_service_items: [
        {
          blocks_count: 2,
          booking_id: 101,
          quantity: null,
          service_item_type: "midnight_charge",
        },
      ],
      bookings: [
        {
          admin_internal_status: "needs_review",
          booking_reference: "SAFE-FOUNDATION-GET-001",
          contact_email: "foundation-safe@example.com",
          contact_phone: "+65 9000 0101",
          created_at: "2026-06-04T00:00:00.000Z",
          customer_display_name: "Foundation Safe Customer",
          customer_facing_status: "pending_review",
          customer_id: 25,
          dropoff_location: "Foundation Safe Dropoff",
          driver_contact: "+65 9000 0102",
          driver_name: "Foundation Read Driver",
          driver_plate_number: "SFR102A",
          id: 101,
          luggage_count: 1,
          parser_source_reference: "SAFE-PARSER-REFERENCE",
          pax_count: 2,
          pickup_datetime: "2026-06-09T10:30:00+08:00",
          pickup_location: "Foundation Safe Pickup",
          route_type: "transfer",
          short_notice_review_status: "not_required",
          source_channel: "admin-dashboard",
          updated_at: "2026-06-04T00:00:00.000Z",
          vehicle_type_or_category: "Alphard",
        },
      ],
    },
    {
      selectFailures: [
        {
          column: "pickup_at",
          error: {
            code: "PGRST204",
            message: "Sanitized mock schema cache column source.",
          },
          table: "bookings",
        },
      ],
    },
  );
  const foundationFallbackRoute = await readRouteResponse(
    await adminRoute.GET(
      new Request("http://localhost/api/admin-bookings", {
        headers: adminHeaders({
          "x-prestige-admin-session-token": serverSessionToken,
        }),
      }),
    ),
  );

  assert.equal(foundationFallbackRoute.status, 200);
  assert.equal(foundationFallbackRoute.body.ok, true);
  assert.equal(foundationFallbackRoute.body.bookings.length, 1);
  assert.equal(foundationFallbackRoute.body.bookings[0].booking_reference, "SAFE-FOUNDATION-GET-001");
  assert.equal(foundationFallbackRoute.body.bookings[0].driver_contact, "+65 9000 0102");
  assert.equal(foundationFallbackRoute.body.bookings[0].driver_name, "Foundation Read Driver");
  assert.equal(foundationFallbackRoute.body.bookings[0].driver_plate_number, "SFR102A");
  assert.equal(foundationFallbackRoute.body.bookings[0].pickup_at, "2026-06-09T10:30:00+08:00");
  assert.equal(foundationFallbackRoute.body.bookings[0].service_type, "transfer");
  assert.equal(foundationFallbackRoute.body.bookings[0].pax_count, 2);
  assert.equal(foundationFallbackRoute.body.bookings[0].luggage_count, 1);
  assert.deepEqual(
    foundationFallbackRoute.body.bookings[0].route_points.map((routePoint) => routePoint.location_text),
    ["Foundation Safe Pickup", "Foundation Safe Dropoff"],
  );
  assert.deepEqual(foundationFallbackRoute.body.bookings[0].service_items, [
    {
      blocks_count: 2,
      item_type: null,
      notes: null,
      quantity: 2,
      service_item_type: "midnight_charge",
    },
  ]);
  assert.equal(foundationReadMock.createdClients.length, 1);
  assert.equal(foundationReadMock.client.operations.length, 0);
  assert.equal(foundationReadMock.client.selectFailures[0].calls, 2);
  assert.equal(foundationReadMock.client.selectHistory.length, 3);
  assert.match(foundationReadMock.client.selectHistory[0].selectedColumns, /pickup_at/);
  assert.match(foundationReadMock.client.selectHistory[2].selectedColumns, /driver_name/);
  assert.match(foundationReadMock.client.selectHistory[2].selectedColumns, /pickup_datetime/);
  assert.doesNotMatch(foundationReadMock.client.selectHistory[2].selectedColumns, /internal_note/);
  assertNoUnsafeKeys(foundationFallbackRoute, "foundation fallback GET response");

  const foundationReadLegacyDriverMock = installMockClient(
    {
      bookings: [
        {
          admin_internal_status: "needs_review",
          booking_reference: "SAFE-FOUNDATION-LEGACY-DRIVER-GET-001",
          contact_email: "foundation-legacy-driver-safe@example.com",
          contact_phone: "+65 9000 0103",
          created_at: "2026-06-04T00:00:00.000Z",
          customer_display_name: "Foundation Legacy Driver Customer",
          customer_facing_status: "pending_review",
          customer_id: 26,
          dropoff_location: "Foundation Legacy Driver Dropoff",
          id: 102,
          luggage_count: 1,
          parser_source_reference: "SAFE-PARSER-REFERENCE",
          pax_count: 2,
          pickup_datetime: "2026-06-10T10:30:00+08:00",
          pickup_location: "Foundation Legacy Driver Pickup",
          route_type: "transfer",
          short_notice_review_status: "not_required",
          source_channel: "admin-dashboard",
          updated_at: "2026-06-04T00:00:00.000Z",
          vehicle_type_or_category: "Alphard",
        },
      ],
    },
    {
      selectFailures: [
        {
          column: "pickup_at",
          error: {
            code: "PGRST204",
            message: "Sanitized mock schema cache column source.",
          },
          table: "bookings",
        },
        {
          column: "driver_name",
          error: {
            code: "PGRST204",
            message: "Sanitized mock legacy driver column source.",
          },
          table: "bookings",
        },
      ],
    },
  );
  const foundationLegacyDriverFallbackRoute = await readRouteResponse(
    await adminRoute.GET(
      new Request("http://localhost/api/admin-bookings", {
        headers: adminHeaders({
          "x-prestige-admin-session-token": serverSessionToken,
        }),
      }),
    ),
  );

  assert.equal(foundationLegacyDriverFallbackRoute.status, 200);
  assert.equal(foundationLegacyDriverFallbackRoute.body.ok, true);
  assert.equal(foundationLegacyDriverFallbackRoute.body.bookings.length, 1);
  assert.equal(
    foundationLegacyDriverFallbackRoute.body.bookings[0].booking_reference,
    "SAFE-FOUNDATION-LEGACY-DRIVER-GET-001",
  );
  assert.equal(foundationLegacyDriverFallbackRoute.body.bookings[0].driver_name, null);
  assert.equal(foundationReadLegacyDriverMock.client.selectFailures[0].calls, 2);
  assert.equal(foundationReadLegacyDriverMock.client.selectFailures[1].calls, 2);
  assert.equal(foundationReadLegacyDriverMock.client.selectHistory.length, 5);
  assert.match(foundationReadLegacyDriverMock.client.selectHistory[2].selectedColumns, /driver_name/);
  assert.doesNotMatch(foundationReadLegacyDriverMock.client.selectHistory[4].selectedColumns, /driver_name/);
  assertNoUnsafeKeys(
    foundationLegacyDriverFallbackRoute,
    "foundation legacy driver fallback GET response",
  );

  const columnFailureMock = installMockClient(
    {},
    {
      failures: {
        "select:customers": {
          code: "42703",
          message: "Sanitized mock column classification source.",
        },
      },
    },
  );
  const columnFailureResult = await adapter.createAdminBookingThroughSupabaseAdapter(
    parsedAdmin.data,
    adminAudit(),
    adminActor(),
  );

  assert.deepEqual(columnFailureResult, {
    category: "column_missing",
    error: "Admin booking persistence save failed safely.",
    ok: false,
    operation: "customer_lookup",
    status: 500,
  });
  assert.equal(columnFailureMock.createdClients.length, 1);
  assert.equal(columnFailureMock.client.operations.length, 0);
  assertNoApiLeak(columnFailureResult, "direct adapter categorized failure should stay sanitized");

  const permissionFailureMock = installMockClient(
    {},
    {
      failures: {
        "insert:bookings": {
          code: "42501",
          message: "Sanitized mock permission classification source.",
        },
      },
    },
  );
  const permissionFailureResult = await adapter.createAdminBookingThroughSupabaseAdapter(
    parsedAdmin.data,
    adminAudit(),
    adminActor(),
  );

  assert.equal(permissionFailureResult.ok, false);
  assert.equal(permissionFailureResult.error, "Admin booking persistence save failed safely.");
  assert.equal(permissionFailureResult.category, "permission_or_rls_denied");
  assertNoApiLeak(permissionFailureResult, "permission categorized failure should stay sanitized");
  assert.ok(permissionFailureMock.client.operations.some((operation) => operation.table === "customer_contacts"));

  const serverSessionNoTokenRouteMock = installMockClient();
  const serverSessionNoTokenRoute = await readRouteResponse(
    await adminRoute.POST(
      jsonRequest("http://localhost/api/admin-bookings", canonicalAdminPayload(), {
        headers: adminHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(serverSessionNoTokenRoute.status, 200);
  assert.equal(serverSessionNoTokenRoute.body.ok, true);
  assert.equal(serverSessionNoTokenRoute.body.booking.booking_reference, "SAFE-ADM-001");
  assertCreatedClient(serverSessionNoTokenRouteMock);
  assertNoUnsafeKeys(serverSessionNoTokenRoute, "server-session no-token admin route response");

  const categorizedRouteMock = installMockClient(
    {},
    {
      failures: {
        "select:customers": {
          code: "42703",
          message: "Sanitized mock route classification source.",
        },
      },
    },
  );
  const categorizedRouteFailure = await readRouteResponse(
    await adminRoute.POST(
      jsonRequest("http://localhost/api/admin-bookings", canonicalAdminPayload(), {
        headers: adminHeaders({
          "x-prestige-admin-session-token": serverSessionToken,
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(categorizedRouteFailure.status, 500);
  assert.deepEqual(categorizedRouteFailure.body, {
    error: "Admin booking persistence save failed safely.",
    ok: false,
    safe_error_category: "column_missing",
    safe_error_operation: "customer_lookup",
  });
  assert.equal(categorizedRouteMock.createdClients.length, 1);
  assert.equal(categorizedRouteMock.client.operations.length, 0);
  assertNoApiLeak(categorizedRouteFailure, "categorized route response should hide raw internal database details");

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

  assert.equal(customerCreateRoute.status, 503);
  assert.deepEqual(customerCreateRoute.body, {
    error: "Booking request intake is not enabled or configured on this server.",
    ok: false,
  });
  assert.equal(customerCreateMock.createdClients.length, 0);
  assert.equal(customerCreateMock.client.operations.length, 0);
  assertNoApiLeak(customerCreateRoute, "customer missing-config enabled-write response should hide server internals");
} finally {
  restoreEnv();
  delete globalThis.__prestigeSupabaseAdapterMock;
  await harness.cleanup();
}

console.log("Admin booking Supabase adapter mocked contract tests passed.");
