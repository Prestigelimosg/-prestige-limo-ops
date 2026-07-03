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

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
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

    return this.client.resolveSelect(this, "single");
  }

  then(resolve, reject) {
    if (this.action === "delete") {
      return this.client.resolveDelete(this).then(resolve, reject);
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
  latestOccurredAt = "2026-06-07T09:00:00.000Z",
  latestSafeStatusNote = null,
  latestStatus = "ots",
  priorStatusEvents = [],
} = {}) {
  return new MockSupabaseClient({
    actualTimeInsertError,
    driver_job_dsp_actual_time_events: [],
    driver_job_links: [
      {
        booking_reference: "DRV-JOB-API-001",
        expires_at: validExpiresAt,
        id: "91c9d972-6fa5-4f3b-b157-bb56a9366c7c",
        link_status: "active",
        revoked_at: null,
        safe_link_context: {
          customer_price_amount: 160,
          driver_job_payload: {
            assigned_driver: {
              contact: "+65 8000 1001",
              name: "Safe Driver One",
              plate: "SLA1234X",
              vehicleModel: "Mercedes V Class",
            },
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
({ driverJobStatusPersistenceVersion, loadDriverJobPayloadThroughStatusPersistence, saveDriverJobStatusThroughStatusPersistence } =
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
      client.selectHistory.find((query) => query.table === "driver_job_status_events")?.limit,
      10,
      "Driver token payload should read a compact status history, not only one latest row.",
    );
    assert.equal(result.payload.assignedDriver.name, "Safe Driver One");
    assert.equal(client.operations.length, 0);
    assertNoDriverJobLeaks(result);
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
      totalOperations: 3,
    });
    assertInsertedActualTimeEvent(client, "dsp_end", "completed");
    assert.deepEqual(result.sharing_cleanup, {
      customerVisible: false,
      external_send: false,
      no_op: false,
      ok: true,
      reason: "completed_marker_cleared",
    });
    assertDeletedCompletedSharingMarker(client);
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
      totalOperations: 2,
    });
    assert.deepEqual(result.body.sharing_cleanup, {
      customerVisible: false,
      external_send: false,
      no_op: false,
      ok: true,
      reason: "completed_marker_cleared",
    });
    assertDeletedCompletedSharingMarker(client);
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
