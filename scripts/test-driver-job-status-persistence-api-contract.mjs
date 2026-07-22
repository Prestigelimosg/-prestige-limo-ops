import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const sourceFiles = [
  "lib/driver-job-status-workflow.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-contract.ts",
  "lib/driver-job-link-mock-tokens.ts",
  "lib/driver-job-link-mock-store.ts",
  "lib/driver-job-link-mode.ts",
  "lib/driver-job-status-persistence.ts",
  "lib/driver-device-push-notification.ts",
  "lib/driver-portal-session.ts",
  "lib/driver-job-link-production.ts",
  "app/api/driver-job/[token]/route.ts",
  "app/api/driver-job/[token]/status/route.ts",
];

const validToken = "driver-status-contract-token-a";
const expiredToken = "driver-status-contract-token-expired";
const farFutureToken = "driver-status-contract-token-far-future";
const revokedToken = "driver-status-contract-token-revoked";
const nowDate = new Date();
const now = nowDate.toISOString();
const validExpiresAt = new Date(nowDate.getTime() + 6 * 60 * 60 * 1000).toISOString();
const expiredExpiresAt = new Date(nowDate.getTime() - 60 * 60 * 1000).toISOString();
const farFutureExpiresAt = new Date(nowDate.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
const originalEnv = {
  DRIVER_JOB_LINK_MODE: process.env.DRIVER_JOB_LINK_MODE,
  NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE,
  PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:
    process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED,
};
let GET;
let PATCH;
let applyProductionDriverJobStatusUpdate;
let driverJobStatusPersistenceVersion;
let getProductionDriverJobPayloadForToken;
let hashDriverJobLinkToken;
let loadDriverJobPayloadThroughStatusPersistence;
let productionDriverJobLinksConfigured;
let saveDriverJobDetailsThroughStatusPersistence;
let saveDriverJobStatusThroughStatusPersistence;
let setDriverJobProductionSupabaseClientForTests;

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
  const outputSource = transpileTypescript(await readFile(sourcePath, "utf8"), sourcePath);
  const jsPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const tsPath = path.join(tempDir, relativePath);

  await mkdir(path.dirname(jsPath), { recursive: true });
  await writeFile(jsPath, outputSource);
  await writeFile(tsPath, outputSource);
}

async function writeMockModules(tempDir) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const webPushPath = path.join(tempDir, "node_modules/web-push/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(webPushPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    webPushPath,
    "module.exports = { sendNotification: async () => undefined, setVapidDetails: () => undefined };",
  );
  await writeFile(
    supabasePath,
    [
      "function createClient() {",
      "  const mock = globalThis.__prestigeDriverJobStatusPersistenceMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked driver job status Supabase client.');",
      "  }",
      "  mock.createdClients.push({});",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-job-status-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    link: require(path.join(tempDir, "lib/driver-job-link.ts")),
    mode: require(path.join(tempDir, "lib/driver-job-link-mode.ts")),
    persistence: require(path.join(tempDir, "lib/driver-job-status-persistence.ts")),
    production: require(path.join(tempDir, "lib/driver-job-link-production.ts")),
    route: require(path.join(tempDir, "app/api/driver-job/[token]/route.js")),
    statusRoute: require(path.join(tempDir, "app/api/driver-job/[token]/status/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.action = "select";
    this.client = client;
    this.columns = "";
    this.filters = [];
    this.limitCount = null;
    this.orderBy = null;
    this.payload = null;
    this.table = table;
  }

  eq(column, value) {
    this.filters.push({ column, value });

    return this;
  }

  insert(payload) {
    this.action = "insert";
    this.payload = payload;

    return this;
  }

  update(payload) {
    this.action = "update";
    this.payload = payload;

    return this;
  }

  delete() {
    this.action = "delete";

    return this;
  }

  limit(value) {
    this.limitCount = value;

    return this;
  }

  maybeSingle() {
    return this.client.resolveSelect(this, "maybeSingle");
  }

  order(column, options) {
    this.orderBy = { column, options };

    return this;
  }

  select(columns) {
    this.columns = columns;

    return this;
  }

  single() {
    if (this.action === "insert") {
      return this.client.resolveInsert(this);
    }

    if (this.action === "update") {
      return this.client.resolveUpdate(this, "single");
    }

    return this.client.resolveSelect(this, "single");
  }

  then(resolve, reject) {
    if (this.action === "delete") {
      return this.client.resolveDelete(this).then(resolve, reject);
    }

    if (this.action === "update") {
      return this.client.resolveUpdate(this, "array").then(resolve, reject);
    }

    return this.client.resolveSelect(this, "array").then(resolve, reject);
  }
}

class MockSupabaseClient {
  constructor(seed = {}) {
    this.actualTimeInsertError = Boolean(seed.actualTimeInsertError);
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      bookings: seed.bookings || [],
      drivers: seed.drivers || [],
      driver_job_dsp_actual_time_events: seed.driver_job_dsp_actual_time_events || [],
      driver_job_links: seed.driver_job_links || [],
      driver_job_status_events: seed.driver_job_status_events || [],
      driver_live_location_latest_positions: seed.driver_live_location_latest_positions || [],
    };
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  async resolveInsert(query) {
    this.operations.push({
      action: "insert",
      payload: query.payload,
      table: query.table,
    });

    if (query.table === "drivers") {
      const row = {
        id: this.tables.drivers.reduce((largest, driver) => Math.max(largest, Number(driver.id) || 0), 0) + 1,
        ...query.payload,
      };

      this.tables.drivers.push(row);

      return { data: row, error: null };
    }

    if (
      query.table !== "driver_job_status_events" &&
      query.table !== "driver_job_dsp_actual_time_events"
    ) {
      return {
        data: null,
        error: { code: "unexpected_table" },
      };
    }

    if (query.table === "driver_job_dsp_actual_time_events" && this.actualTimeInsertError) {
      return {
        data: null,
        error: { code: "actual_time_unavailable" },
      };
    }

    const row = {
      id:
        query.table === "driver_job_status_events"
          ? `mock-event-${this.tables.driver_job_status_events.length + 1}`
          : `mock-actual-time-${this.tables.driver_job_dsp_actual_time_events.length + 1}`,
      occurred_at: now,
      ...query.payload,
      created_at: now,
    };

    this.tables[query.table].push(row);

    return {
      data: row,
      error: null,
    };
  }

  async resolveUpdate(query, resultMode) {
    this.operations.push({
      action: "update",
      filters: query.filters,
      payload: query.payload,
      table: query.table,
    });

    const updatedRows = [];

    this.tables[query.table] = this.tables[query.table].map((row) => {
      if (!query.filters.every((filter) => row[filter.column] === filter.value)) {
        return row;
      }

      const updated = { ...row, ...query.payload };
      updatedRows.push(updated);
      return updated;
    });

    if (resultMode === "single") {
      return {
        data: updatedRows[0] || null,
        error: updatedRows[0] ? null : { code: "PGRST116" },
      };
    }

    return { data: updatedRows, error: null };
  }

  async resolveDelete(query) {
    this.operations.push({
      action: "delete",
      filters: query.filters,
      table: query.table,
    });

    const beforeCount = this.tables[query.table].length;

    this.tables[query.table] = this.tables[query.table].filter(
      (row) => !query.filters.every((filter) => row[filter.column] === filter.value),
    );

    return {
      count: beforeCount - this.tables[query.table].length,
      data: null,
      error: null,
    };
  }

  async resolveSelect(query, resultMode) {
    this.selectHistory.push({
      columns: query.columns,
      filters: query.filters,
      limit: query.limitCount,
      orderBy: query.orderBy,
      resultMode,
      table: query.table,
    });

    let rows = [...this.tables[query.table]];

    for (const filter of query.filters) {
      rows = rows.filter((row) => row[filter.column] === filter.value);
    }

    if (query.orderBy) {
      const direction = query.orderBy.options?.ascending === false ? -1 : 1;

      rows.sort((a, b) => {
        const left = String(a[query.orderBy.column] || "");
        const right = String(b[query.orderBy.column] || "");

        return left.localeCompare(right) * direction;
      });
    }

    if (query.limitCount !== null) {
      rows = rows.slice(0, query.limitCount);
    }

    if (resultMode === "maybeSingle") {
      return {
        data: rows[0] || null,
        error: null,
      };
    }

    if (resultMode === "single") {
      return {
        data: rows[0] || null,
        error: rows[0] ? null : { code: "PGRST116" },
      };
    }

    return {
      data: rows,
      error: null,
    };
  }
}

function createSeededClient({
  actualTimeInsertError = false,
  bookingType = "DEP",
  bookings = [],
  drivers = [],
  latestOccurredAt = "2026-06-07T09:00:00.000Z",
  latestSafeStatusNote = null,
  latestStatus = "ots",
  priorStatusEvents = [],
} = {}) {
  return new MockSupabaseClient({
    actualTimeInsertError,
    bookings,
    drivers,
    driver_job_dsp_actual_time_events: [],
    driver_job_links: [
      {
        booking_reference: "DRV-JOB-API-001",
        driver_id: null,
        expires_at: validExpiresAt,
        id: "91c9d972-6fa5-4f3b-b157-bb56a9366c7c",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {
          customer_price_amount: 160,
          driver_job_payload: {
            assigned_driver_contact: "+65 8000 1001",
            assigned_driver_name: "Safe Driver One",
            assigned_driver_plate: "SLA1234X",
            assigned_driver_vehicle_model: "Mercedes V Class",
            booking_type: bookingType,
            dropoff_location: "Changi Airport Terminal 3",
            flight_no: "SQ001",
            internal_admin_note: "SECRET_INTERNAL_NOTE",
            passenger_name: "Safe Passenger",
            pickup_date: "2026-06-09",
            pickup_location: "Raffles Hotel Singapore",
            pickup_time: "0900hrs",
            route: "Raffles Hotel Singapore > Changi Airport Terminal 3",
            status: "assigned",
          },
          paynow_payout: "SECRET_PAYNOW_PAYOUT",
        },
        token_hash: hashDriverJobLinkToken(validToken),
      },
      {
        booking_reference: "DRV-JOB-API-EXPIRED",
        expires_at: expiredExpiresAt,
        id: "7bc159e4-4f96-4963-9a29-36743fa1647f",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {},
        token_hash: hashDriverJobLinkToken(expiredToken),
      },
      {
        booking_reference: "DRV-JOB-API-FAR-FUTURE",
        expires_at: farFutureExpiresAt,
        id: "b63a81ec-005e-4f89-9622-3256b470d4f2",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {},
        token_hash: hashDriverJobLinkToken(farFutureToken),
      },
      {
        booking_reference: "DRV-JOB-API-REVOKED",
        expires_at: validExpiresAt,
        id: "5e42b861-2815-490b-9513-32f6b96e8f7b",
        link_status: "revoked",
        revoked_at: "2026-06-07T08:00:00.000Z",
        safe_link_context: {},
        token_hash: hashDriverJobLinkToken(revokedToken),
      },
    ],
    driver_job_status_events: [
      ...(latestStatus
        ? [
            {
              actor_label: "verified_driver_job_link",
              actor_role: "driver",
              booking_reference: "DRV-JOB-API-001",
              driver_job_link_id: "91c9d972-6fa5-4f3b-b157-bb56a9366c7c",
              occurred_at: latestOccurredAt,
              safe_status_context: {},
              safe_status_note: latestSafeStatusNote,
              source_surface: "driver_job_api",
              status_source: "driver_job_api",
              status_value: latestStatus,
            },
          ]
        : []),
      ...priorStatusEvents,
    ],
    driver_live_location_latest_positions: [
      {
        booking_reference: "DRV-JOB-API-001",
        driver_job_link_id: "91c9d972-6fa5-4f3b-b157-bb56a9366c7c",
        sharing_state: "active",
      },
    ],
  });
}

function routeContext(token) {
  return {
    params: Promise.resolve({ token }),
  };
}

async function getDriverJob(token) {
  const response = await GET(
    new Request(`http://localhost/api/driver-job/${encodeURIComponent(token)}`),
    routeContext(token),
  );

  return {
    body: await response.json(),
    status: response.status,
  };
}

async function patchDriverJobStatus(token, status, body = {}) {
  const response = await PATCH(
    new Request(`http://localhost/api/driver-job/${encodeURIComponent(token)}/status`, {
      body: JSON.stringify({ ...body, status }),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    routeContext(token),
  );

  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoDriverJobLeaks(value) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, /SECRET_/i);
  assert.doesNotMatch(text, /customer_price/i);
  assert.doesNotMatch(text, /customer charge/i);
  assert.doesNotMatch(text, /billing/i);
  assert.doesNotMatch(text, /invoice/i);
  assert.doesNotMatch(text, /payment/i);
  assert.doesNotMatch(text, /paynow/i);
  assert.doesNotMatch(text, /payout/i);
  assert.doesNotMatch(text, /finance/i);
  assert.doesNotMatch(text, /internal_admin_note/i);
  assert.doesNotMatch(text, /parser/i);
  assert.doesNotMatch(text, /debug/i);
  assert.doesNotMatch(text, /proof/i);
  assert.doesNotMatch(text, /photo/i);
  assert.doesNotMatch(text, /live_location/i);
  assert.doesNotMatch(text, /service_role/i);
  assert.doesNotMatch(text, /driver-status-contract-token/i);
  assert.doesNotMatch(text, new RegExp(hashDriverJobLinkToken(validToken)));
  assert.doesNotMatch(text, /\b160\b/, "Driver route must not expose customer price.");
}

function assertInsertedStatusEvent(client, expectedStatus, expected = {}) {
  if (expected.totalOperations !== undefined) {
    assert.equal(client.operations.length, expected.totalOperations);
  } else {
    assert.equal(client.operations.length, 1);
  }

  const statusOperations = client.operations.filter(
    (operation) => operation.table === "driver_job_status_events",
  );

  assert.equal(statusOperations.length, 1);
  const [operation] = statusOperations;

  assert.equal(operation.action, "insert");
  assert.equal(operation.table, "driver_job_status_events");
  assert.equal(operation.payload.booking_reference, "DRV-JOB-API-001");
  assert.equal(operation.payload.driver_job_link_id, "91c9d972-6fa5-4f3b-b157-bb56a9366c7c");
  assert.equal(operation.payload.status_value, expectedStatus);
  assert.equal(operation.payload.status_source, "driver_job_api");
  assert.equal(operation.payload.source_surface, "driver_job_api");
  assert.equal(operation.payload.actor_role, "driver");
  assert.equal(operation.payload.actor_label, "verified_driver_job_link");
  assert.equal(operation.payload.safe_status_note, expected.safeStatusNote ?? null);
  assert.deepEqual(operation.payload.safe_status_context, expected.safeStatusContext ?? {});
  assertNoDriverJobLeaks(operation.payload);
}

function assertInsertedActualTimeEvent(
  client,
  expectedEventType,
  expectedStatus,
  expectedBookingType = "hourly",
) {
  const actualTimeOperations = client.operations.filter(
    (operation) => operation.table === "driver_job_dsp_actual_time_events",
  );

  assert.equal(actualTimeOperations.length, 1);
  const [operation] = actualTimeOperations;

  assert.equal(operation.action, "insert");
  assert.equal(operation.payload.booking_reference, "DRV-JOB-API-001");
  assert.equal(operation.payload.driver_job_link_id, "91c9d972-6fa5-4f3b-b157-bb56a9366c7c");
  assert.equal(operation.payload.event_type, expectedEventType);
  assert.equal(operation.payload.occurred_at, now);
  assert.equal(operation.payload.source_surface, "driver_job_api");
  assert.equal(operation.payload.actor_role, "driver");
  assert.equal(operation.payload.actor_label, "verified_driver_job_link");
  assert.equal(operation.payload.safe_event_note, null);
  assert.deepEqual(operation.payload.safe_event_context, {
    actual_time_policy: "hourly_start_ots_end_completed",
    booking_type: expectedBookingType,
    driver_status_event: expectedStatus,
  });
  assertNoDriverJobLeaks(operation.payload);
}

function assertDeletedCompletedSharingMarker(client) {
  const deleteOperations = client.operations.filter(
    (operation) => operation.table === "driver_live_location_latest_positions",
  );

  assert.equal(deleteOperations.length, 1);
  const [operation] = deleteOperations;

  assert.equal(operation.action, "delete");
  assert.deepEqual(operation.filters, [
    {
      column: "driver_job_link_id",
      value: "91c9d972-6fa5-4f3b-b157-bb56a9366c7c",
    },
  ]);
  assert.equal(client.tables.driver_live_location_latest_positions.length, 0);
}

function assertExpiredCompletedBookingLinks(client) {
  const expiryOperations = client.operations.filter(
    (operation) => operation.table === "driver_job_links" && operation.action === "update",
  );

  assert.equal(expiryOperations.length, 1);
  assert.deepEqual(expiryOperations[0].filters, [
    { column: "booking_reference", value: "DRV-JOB-API-001" },
    { column: "link_status", value: "active" },
  ]);
  assert.equal(expiryOperations[0].payload.link_status, "expired");
  assert.equal(expiryOperations[0].payload.expires_at, now);
  assert.equal(expiryOperations[0].payload.updated_at, now);
  assert.equal(
    client.tables.driver_job_links
      .filter((link) => link.booking_reference === "DRV-JOB-API-001")
      .every((link) => link.link_status === "expired" && link.expires_at === now),
    true,
    "Driver JC must expire all active private links for only the completed driver-report booking.",
  );
  assert.equal(
    client.tables.driver_job_links.find(
      (link) => link.booking_reference === "DRV-JOB-API-REVOKED",
    ).link_status,
    "revoked",
    "Driver JC must not alter another booking or turn an explicit revoke into an expiry.",
  );
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

const harness = await loadHarness();

({
  applyProductionDriverJobStatusUpdate,
  getProductionDriverJobPayloadForToken,
  setDriverJobProductionSupabaseClientForTests,
} = harness.production);
({ driverJobStatusPersistenceVersion, loadDriverJobPayloadThroughStatusPersistence, saveDriverJobDetailsThroughStatusPersistence, saveDriverJobStatusThroughStatusPersistence } =
  harness.persistence);
({ hashDriverJobLinkToken } = harness.link);
({ productionDriverJobLinksConfigured } = harness.mode);
({ GET } = harness.route);
({ PATCH } = harness.statusRoute);

try {
  assert.equal(
    driverJobStatusPersistenceVersion,
    "stage-driver-job-status-production-adapter-v1",
  );
  assert.equal(productionDriverJobLinksConfigured(), false);
  assert.equal(
    productionDriverJobLinksConfigured({
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true",
    }),
    true,
  );

  delete process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED;
  setDriverJobProductionSupabaseClientForTests(createSeededClient());

  const disabledInjectedGet = await getProductionDriverJobPayloadForToken(validToken);
  const disabledInjectedPatch = await applyProductionDriverJobStatusUpdate({
    status: "OTW",
    token: validToken,
  });

  assert.deepEqual(disabledInjectedGet, {
    ok: false,
    payload: null,
    reason: "not_configured",
  });
  assert.deepEqual(disabledInjectedPatch, {
    ok: false,
    payload: null,
    reason: "not_configured",
  });

  process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED = "true";

  {
    const client = createSeededClient({
      bookings: [{ booking_reference: "DRV-JOB-API-001", driver_id: null }],
    });
    const result = await saveDriverJobDetailsThroughStatusPersistence({
      client,
      driverContact: "+65 8111 2222",
      driverName: "Calendar Driver One",
      driverPlateNumber: "SLA1234X",
      driverVehicleModel: "Mercedes V Class",
      now,
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(client.tables.drivers.length, 1);
    assert.deepEqual(client.tables.drivers[0], {
      availability_status: "available",
      contact_number: "+65 8111 2222",
      driver_name: "Calendar Driver One",
      id: 1,
      plate_number: "SLA1234X",
      vehicle_type: "Mercedes V Class",
    });
    assert.equal(client.tables.bookings[0].driver_id, 1);
    assert.equal(client.tables.driver_job_links[0].driver_id, 1);
    assert.ok(client.tables.driver_job_links[0].safe_link_context.driver_acknowledged_at);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({
      bookings: [{ booking_reference: "DRV-JOB-API-001", driver_id: null }],
      drivers: [{
        availability_status: "available",
        contact_number: "+65 8111 2222",
        driver_name: "Calendar Driver One",
        id: 27,
        plate_number: "SLA1234X",
        vehicle_type: "Mercedes V Class",
      }],
    });
    const result = await saveDriverJobDetailsThroughStatusPersistence({
      client,
      driverContact: "+65 8111 2222",
      driverName: "Calendar Driver One",
      driverPlateNumber: "SLA1234X",
      driverVehicleModel: "Mercedes V Class",
      now,
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(client.tables.drivers.length, 1, "Future jobs must reuse the exact driver contact identity.");
    assert.equal(client.tables.bookings[0].driver_id, 27);
    assert.equal(client.tables.driver_job_links[0].driver_id, 27);
    assert.equal(
      client.operations.filter((operation) => operation.table === "drivers" && operation.action === "insert").length,
      0,
    );
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({
      priorStatusEvents: [
        {
          actor_label: "verified_driver_job_link",
          actor_role: "driver",
          booking_reference: "DRV-JOB-API-001",
          driver_job_link_id: "91c9d972-6fa5-4f3b-b157-bb56a9366c7c",
          occurred_at: "2026-06-07T08:00:00.000Z",
          safe_status_context: {},
          safe_status_note: "Driver left base safely.",
          source_surface: "driver_job_api",
          status_source: "driver_job_api",
          status_value: "driver_otw",
        },
      ],
    });
    const result = await loadDriverJobPayloadThroughStatusPersistence({
      client,
      now,
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, "ok");
    assert.equal(result.payload.reference, "DRV-JOB-API-001");
    assert.equal(result.payload.pickupLocation, "Raffles Hotel Singapore");
    assert.equal(result.payload.dropoffLocation, "Changi Airport Terminal 3");
    assert.equal(result.payload.status, "ots");
    assert.deepEqual(
      result.payload.statusHistory.map((event) => ({
        note: event.safeNote,
        status: event.status,
        time: event.occurredAt,
      })),
      [
        {
          note: null,
          status: "ots",
          time: "2026-06-07T09:00:00.000Z",
        },
        {
          note: "Driver left base safely.",
          status: "driver_otw",
          time: "2026-06-07T08:00:00.000Z",
        },
      ],
    );
    assert.equal(
      client.selectHistory.find(
        (query) => query.table === "driver_job_status_events" && query.limit === 10,
      )?.limit,
      10,
      "Driver token payload should read a compact status history, not only one latest row.",
    );
    assert.equal(result.payload.assignedDriver.name, "Safe Driver One");
    assert.equal(result.payload.assignedDriver.contact, "+65 8000 1001");
    assert.equal(result.payload.assignedDriver.plate, "SLA1234X");
    assert.equal(result.payload.assignedDriver.vehicleModel, "Mercedes V Class");
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    client.tables.bookings = [
      {
        admin_internal_status: "confirmed",
        booking_reference: "DRV-JOB-API-001",
        customer_price_amount: 999,
        driver_contact: "+65 8111 1111",
        driver_name: "Stale Booking Driver",
        driver_plate_number: "STALE1",
        dropoff_location: "Amended Marina Bay Dropoff",
        flight_no: "SQ999",
        internal_admin_note: "SECRET_AMENDMENT_NOTE",
        passenger_name: "Safe Passenger",
        pickup_at: "2026-07-15T00:30:00+08:00",
        pickup_location: "Amended Changi Pickup",
        route_summary: "Amended Changi Pickup > Amended Marina Bay Dropoff",
        service_type: "MNG",
        updated_at: "2026-07-13T02:56:44.000Z",
        vehicle_type_or_category: "Mercedes V Class",
      },
    ];
    const result = await loadDriverJobPayloadThroughStatusPersistence({
      client,
      now,
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.payload.pickupDate, "2026-07-15");
    assert.equal(result.payload.pickupTime, "0030hrs");
    assert.equal(result.payload.pickupLocation, "Amended Changi Pickup");
    assert.equal(result.payload.dropoffLocation, "Amended Marina Bay Dropoff");
    assert.equal(result.payload.route, "Amended Changi Pickup > Amended Marina Bay Dropoff");
    assert.equal(result.payload.scheduleUpdatedAt, "2026-07-13T02:56:44.000Z");
    assert.equal(result.payload.bookingType, "MNG");
    assert.equal(result.payload.assignedDriver.name, "Safe Driver One");
    assert.equal(result.payload.assignedDriver.contact, "+65 8000 1001");
    assert.equal(result.payload.assignedDriver.plate, "SLA1234X");
    assert.equal(result.payload.acknowledged, false);
    assert.doesNotMatch(
      JSON.stringify(result),
      /customer_price_amount|SECRET_AMENDMENT_NOTE/,
    );
    assert.deepEqual(
      client.selectHistory.find((query) => query.table === "bookings")?.filters,
      [{ column: "booking_reference", value: "DRV-JOB-API-001" }],
      "Driver token read must scope the current safe booking schedule to the exact link reference.",
    );
    assertNoDriverJobLeaks(result);
  }

  {
    const oldLinkId = "11111111-1111-4111-8111-111111111111";
    const freshLinkId = "22222222-2222-4222-8222-222222222222";
    const client = new MockSupabaseClient({
      driver_job_dsp_actual_time_events: [],
      driver_job_links: [
        {
          booking_reference: "DRV-JOB-API-001",
          expires_at: validExpiresAt,
          id: freshLinkId,
          link_status: "active",
          revoked_at: null,
          safe_link_context: {
            driver_job_payload: {
              booking_type: "DEP",
              dropoff_location: "Airport",
              passenger_name: "Fresh Passenger",
              pickup_date: "2026-06-09",
              pickup_location: "Hotel",
              pickup_time: "0900hrs",
              route: "Hotel > Airport",
              status: "assigned",
            },
          },
          token_hash: hashDriverJobLinkToken(validToken),
        },
      ],
      driver_job_status_events: [
        {
          actor_label: "verified_driver_job_link",
          actor_role: "driver",
          booking_reference: "DRV-JOB-API-001",
          driver_job_link_id: oldLinkId,
          id: "mock-completed-event-from-older-link",
          occurred_at: "2026-06-07T12:00:00.000Z",
          safe_status_context: {},
          safe_status_note: null,
          source_surface: "driver_job_api",
          status_source: "driver_job_api",
          status_value: "completed",
        },
      ],
      driver_live_location_latest_positions: [],
    });
    const loaded = await loadDriverJobPayloadThroughStatusPersistence({
      client,
      now,
      token: validToken,
    });
    const statusRead = client.selectHistory.find(
      (query) => query.table === "driver_job_status_events" && query.limit === 1,
    );

    assert.equal(loaded.ok, false);
    assert.equal(loaded.reason, "expired");
    assert.equal(loaded.payload, null);
    assert.deepEqual(
      statusRead?.filters,
      [
        { column: "booking_reference", value: "DRV-JOB-API-001" },
        { column: "status_value", value: "completed" },
      ],
      "Every private link must fail closed when the exact booking already has driver JC evidence.",
    );
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(loaded);

    const updated = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "OTW",
      token: validToken,
    });
    const insertedStatus = client.operations.find(
      (operation) => operation.table === "driver_job_status_events",
    );

    assert.equal(updated.ok, false);
    assert.equal(updated.reason, "expired");
    assert.equal(insertedStatus, undefined);
    assertNoDriverJobLeaks(updated);
  }

  for (const [token, reason] of [
    ["not-a-real-driver-token", "unauthorized"],
    [expiredToken, "expired"],
    [farFutureToken, "expired"],
    [revokedToken, "revoked"],
  ]) {
    const client = createSeededClient();
    const result = await loadDriverJobPayloadThroughStatusPersistence({
      client,
      now,
      token,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, reason);
    assert.equal(result.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "POB",
      token: farFutureToken,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "expired");
    assert.equal(result.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "OTW",
      token: validToken,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "out_of_order");
    assert.equal(result.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({
      bookingType: "hourly",
      latestStatus: "driver_otw",
    });
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "OTS",
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, "updated");
    assert.equal(result.status, "ots");
    assert.equal(result.payload.status, "ots");
    assertInsertedStatusEvent(client, "ots", { totalOperations: 2 });
    assertInsertedActualTimeEvent(client, "dsp_start", "ots");
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({
      bookingType: "DSP",
      latestStatus: "driver_otw",
    });
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "OTS",
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, "updated");
    assert.equal(result.status, "ots");
    assertInsertedStatusEvent(client, "ots", { totalOperations: 2 });
    assertInsertedActualTimeEvent(client, "dsp_start", "ots", "dsp");
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "POB",
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, "updated");
    assert.equal(result.status, "pob");
    assert.equal(result.payload.reference, "DRV-JOB-API-001");
    assert.equal(result.payload.status, "pob");
    assert.deepEqual(
      result.payload.statusHistory.map((event) => event.status),
      ["pob", "ots"],
    );
    assert.deepEqual(result.sharing_cleanup, {
      customerVisible: false,
      external_send: false,
      no_op: true,
      ok: true,
      reason: "not_terminal_status",
    });
    assert.equal(client.tables.driver_live_location_latest_positions.length, 1);
    assertInsertedStatusEvent(client, "pob");
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({ bookingType: "hourly", latestStatus: "pob" });
    client.tables.driver_job_links.push({
      ...client.tables.driver_job_links[0],
      id: "33333333-3333-4333-8333-333333333333",
      token_hash: hashDriverJobLinkToken("older-active-link-for-same-booking"),
    });
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      completionNote: "Passenger dropped at hotel lobby.",
      exceptionReason: "No exception.",
      now,
      safeStatusContext: {
        dispatcher_visible: true,
      },
      status: "Job Completed",
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, "updated");
    assert.equal(result.status, "completed");
    assert.equal(result.payload.status, "completed");
    assert.equal(result.payload.statusHistory[0].safeNote, "Passenger dropped at hotel lobby.");
    assertInsertedStatusEvent(client, "completed", {
      safeStatusContext: {
        completion_note_status: "provided",
        dispatcher_visible: true,
        exception_reason_status: "provided",
      },
      safeStatusNote: "Passenger dropped at hotel lobby.",
      totalOperations: 4,
    });
    assertInsertedActualTimeEvent(client, "dsp_end", "completed");
    assert.deepEqual(result.sharing_cleanup, {
      customerVisible: false,
      external_send: false,
      no_op: false,
      ok: true,
      reason: "completed_marker_cleared",
    });
    assert.deepEqual(result.link_expiry, {
      no_op: false,
      ok: true,
      reason: "completed_links_expired",
    });
    assertDeletedCompletedSharingMarker(client);
    assertExpiredCompletedBookingLinks(client);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({
      actualTimeInsertError: true,
      bookingType: "hourly",
      latestStatus: "driver_otw",
    });
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "OTS",
      token: validToken,
    });

    assert.equal(result.ok, true);
    assert.equal(result.reason, "updated");
    assert.equal(result.status, "ots");
    assertInsertedStatusEvent(client, "ots", { totalOperations: 2 });
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({ latestStatus: "pob" });
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      completionNote: "Passenger dropped at hotel lobby.",
      now,
      safeStatusContext: {
        amount: 10,
      },
      status: "Job Completed",
      token: validToken,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_status");
    assert.equal(result.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient({ latestStatus: "pob" });
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      completionNote: "Contains driver payout details and must be blocked.",
      now,
      status: "Job Completed",
      token: validToken,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_status");
    assert.equal(result.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    const result = await saveDriverJobStatusThroughStatusPersistence({
      client,
      now,
      status: "cancelled",
      token: validToken,
    });

    assert.equal(result.ok, false);
    assert.equal(result.reason, "invalid_status");
    assert.equal(result.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }

  process.env.DRIVER_JOB_LINK_MODE = "production";
  delete process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE;

  {
    const client = createSeededClient();
    setDriverJobProductionSupabaseClientForTests(client);

    const result = await getDriverJob(validToken);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.mode, "production");
    assert.equal(result.body.payload.reference, "DRV-JOB-API-001");
    assert.equal(result.body.payload.status, "ots");
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    setDriverJobProductionSupabaseClientForTests(client);

    const result = await patchDriverJobStatus(validToken, "OTW");
    const reloaded = await getDriverJob(validToken);

    assert.equal(result.status, 409);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.reason, "out_of_order");
    assert.equal(result.body.payload, null);
    assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.payload.status, "ots");
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
    assertNoDriverJobLeaks(reloaded);
  }

  {
    const client = createSeededClient();
    setDriverJobProductionSupabaseClientForTests(client);

    const result = await patchDriverJobStatus(validToken, "POB");
    const reloaded = await getDriverJob(validToken);

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.mode, "production");
    assert.equal(result.body.status, "pob");
    assert.equal(result.body.payload.status, "pob");
    assert.equal(reloaded.status, 200);
    assert.equal(reloaded.body.payload.status, "pob");
    assert.deepEqual(result.body.sharing_cleanup, {
      customerVisible: false,
      external_send: false,
      no_op: true,
      ok: true,
      reason: "not_terminal_status",
    });
    assert.equal(client.tables.driver_live_location_latest_positions.length, 1);
    assertInsertedStatusEvent(client, "pob");
    assertNoDriverJobLeaks(result);
    assertNoDriverJobLeaks(reloaded);
  }

  {
    const client = createSeededClient({ latestStatus: "pob" });
    setDriverJobProductionSupabaseClientForTests(client);

    const result = await patchDriverJobStatus(validToken, "Job Completed", {
      completion_note: "Passenger dropped safely at lobby.",
      exception_reason: "No exception.",
      safe_status_context: {
        driver_visible: true,
      },
    });

    assert.equal(result.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.mode, "production");
    assert.equal(result.body.status, "completed");
    assert.equal(result.body.payload.status, "completed");
    assert.equal(result.body.payload.statusHistory[0].safeNote, "Passenger dropped safely at lobby.");
    assertInsertedStatusEvent(client, "completed", {
      safeStatusContext: {
        completion_note_status: "provided",
        driver_visible: true,
        exception_reason_status: "provided",
      },
      safeStatusNote: "Passenger dropped safely at lobby.",
      totalOperations: 3,
    });
    assert.deepEqual(result.body.sharing_cleanup, {
      customerVisible: false,
      external_send: false,
      no_op: false,
      ok: true,
      reason: "completed_marker_cleared",
    });
    assert.deepEqual(result.body.link_expiry, {
      no_op: false,
      ok: true,
      reason: "completed_links_expired",
    });
    assertDeletedCompletedSharingMarker(client);
    assertExpiredCompletedBookingLinks(client);
    const reloaded = await getDriverJob(validToken);
    assert.equal(reloaded.status, 410);
    assert.equal(reloaded.body.ok, false);
    assert.equal(reloaded.body.reason, "expired");
    assert.equal(reloaded.body.payload, null);
    assertNoDriverJobLeaks(reloaded);
    assertNoDriverJobLeaks(result);
  }

  {
    const client = createSeededClient();
    setDriverJobProductionSupabaseClientForTests(client);

    const result = await patchDriverJobStatus(validToken, "cancelled");

    assert.equal(result.status, 400);
    assert.equal(result.body.ok, false);
    assert.equal(result.body.reason, "invalid_status");
    assert.equal(result.body.payload, null);
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
  }
} finally {
  setDriverJobProductionSupabaseClientForTests(null);
  restoreEnv();
  await harness.cleanup();
}

console.log("Driver job status persistence API contract tests passed.");
