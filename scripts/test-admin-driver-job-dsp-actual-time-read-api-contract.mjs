import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledDspActualTimeReadError =
  "Admin driver job DSP actual time read is not enabled on this server.";
const serverSessionToken = "mock-dsp-actual-time-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_DSP_ACTUAL_TIME_READ_SENTINEL";
const supabaseUrlSentinel = "https://dsp-actual-time-read-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_DSP_ACTUAL_TIME_READ_SENTINEL|mock-dsp-actual-time-admin-session-token|dsp-actual-time-read-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeDspActualTimeLeakPattern =
  /token_hash|raw_token|driver_job_link_id|safe_link_context|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-driver-job-dsp-actual-time-read.ts",
  "lib/hourly-billing.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-driver-job-dsp-actual-time-summaries/route.ts",
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
      "  const mock = globalThis.__prestigeAdminDspActualTimeReadMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-dsp-actual-time-read-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    read: require(path.join(tempDir, "lib/admin-driver-job-dsp-actual-time-read.js")),
    route: require(path.join(
      tempDir,
      "app/api/admin-driver-job-dsp-actual-time-summaries/route.js",
    )),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.orderBy = null;
    this.resultLimit = null;
    this.selectedColumns = null;
    this.table = table;
  }

  eq(column, value) {
    this.filters.push({ column, value });

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

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  select(columns) {
    this.operation ||= "select";
    this.selectedColumns = columns;

    return this;
  }

  single() {
    this.singleRow = true;

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    if (this.operation === "insert") {
      return this.client.insertRow(
        this.table,
        this.payload,
        this.selectedColumns,
        this.singleRow,
      );
    }

    return this.client.selectRows(
      this.table,
      this.filters,
      this.orderBy,
      this.resultLimit,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.insertHistory = [];
    this.selectHistory = [];
    this.tables = {
      bookings: [],
      driver_job_dsp_actual_time_events: [],
      driver_job_dsp_actual_time_summaries: [],
      driver_job_status_events: [],
    };

    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => clone(row));
    }
  }

  insertRow(table, payload, selectedColumns, singleRow) {
    const failure = this.failureFor("insert", table);

    this.insertHistory.push({
      payload: clone(payload),
      selectedColumns,
      singleRow: Boolean(singleRow),
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const row = {
      ...clone(payload),
      created_at: payload.created_at || "2026-07-26T12:00:00.000Z",
    };

    this.tables[table].push(row);

    return {
      data: singleRow ? clone(row) : [clone(row)],
      error: null,
    };
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  failureFor(action, table) {
    return this.failures[`${action}:${table}`] || this.failures[table] || null;
  }

  selectRows(table, filters, orderBy, resultLimit, selectedColumns) {
    const failure = this.failureFor("select", table);

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    let rows = this.tables[table].filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    );

    if (orderBy) {
      const direction = orderBy.options?.ascending === false ? -1 : 1;

      rows = rows.sort((first, second) =>
        String(first[orderBy.column] || "").localeCompare(String(second[orderBy.column] || "")) *
        direction,
      );
    }

    return {
      data: rows.slice(0, resultLimit || undefined).map((row) => clone(row)),
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeAdminDspActualTimeReadMock = mock;

  return mock;
}

function validAdminHeaders(overrides = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...overrides,
  };
}

function enabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "DSP actual-time contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  };
}

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const serialized = JSON.stringify(value);

  assert.equal(safeApiLeakPattern.test(serialized), false, `${label} leaked server internals.`);
  assert.equal(
    unsafeDspActualTimeLeakPattern.test(serialized),
    false,
    `${label} leaked unsafe DSP actual-time data.`,
  );
}

const seed = {
  bookings: [
    {
      booking_reference: "SAFE-DSP-001",
      service_type: "DSP",
    },
    {
      booking_reference: "SAFE-DSP-002",
      service_type: "Hourly / Disposal",
    },
    {
      booking_reference: "SAFE-DEP-001",
      service_type: "DEP",
    },
  ],
  driver_job_dsp_actual_time_events: [],
  driver_job_dsp_actual_time_summaries: [
    {
      actual_time_status: "complete",
      booking_reference: "SAFE-DSP-001",
      driver_job_link_id: "must-not-be-selected-or-returned",
      dsp_ended_at: "2026-06-10T04:15:00.000Z",
      dsp_started_at: "2026-06-10T01:00:00.000Z",
      total_minutes: 195,
    },
    {
      actual_time_status: "started",
      booking_reference: "SAFE-DSP-002",
      dsp_ended_at: null,
      dsp_started_at: "2026-06-10T02:00:00.000Z",
      total_minutes: null,
    },
  ],
  driver_job_status_events: [],
};

let harness;

try {
  harness = await loadHarness();
  const { read, route } = harness;

  assert.deepEqual(
    read.parseAdminDriverJobDspActualTimeReadParams({
      booking_reference: "SAFE-DSP-001",
      limit: "2",
    }),
    {
      data: {
        booking_reference: "SAFE-DSP-001",
        limit: 2,
      },
      ok: true,
    },
  );
  assert.equal(
    read.parseAdminDriverJobDspActualTimeReadParams({
      booking_reference: "",
    }).status,
    400,
  );
  assert.equal(
    read.parseAdminDriverJobDspActualTimeReadParams({
      booking_reference: "SAFE-DSP-001",
      limit: "99",
    }).status,
    400,
  );

  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
  });
  installMockClient(seed);
  const disabledResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-001",
        {
          headers: validAdminHeaders({ "x-prestige-admin-session-token": "" }),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledDspActualTimeReadError,
    ok: false,
  });
  assertNoLeaks(disabledResult.body, "disabled read response");

  setEnv(enabledEnv());
  installMockClient(seed);
  const blockedResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-001",
        {
          headers: {
            referer: "http://localhost/driver-job-demo",
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(blockedResult.status, 403);
  assert.deepEqual(blockedResult.body, {
    error: routeBlockedMessage,
    ok: false,
  });
  assertNoLeaks(blockedResult.body, "blocked read response");

  const customerFolderMock = installMockClient(seed);
  const customerFolderReadResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-001&limit=1",
        {
          headers: validAdminHeaders({
            referer: "http://localhost/customers/155?name=Safe+Customer",
          }),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(customerFolderReadResult.status, 200);
  assert.equal(customerFolderReadResult.body.ok, true);
  assert.equal(customerFolderReadResult.body.booking_reference, "SAFE-DSP-001");
  assert.equal(customerFolderMock.client.selectHistory.length, 2);
  assertNoLeaks(customerFolderReadResult.body, "customer-folder DSP actual-time read response");

  const mock = installMockClient(seed);
  const readResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-001&limit=3",
        {
          headers: validAdminHeaders(),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.booking_reference, "SAFE-DSP-001");
  assert.equal(readResult.body.latest_summary.actual_time_status, "complete");
  assert.equal(readResult.body.latest_summary.dsp_total_minutes, 195);
  assert.equal(readResult.body.latest_summary.dsp_billable_minutes, 180);
  assert.equal(readResult.body.summary.has_complete_actual_time, true);
  assert.deepEqual(mock.client.selectHistory, [
    {
      filters: [
        {
          column: "booking_reference",
          value: "SAFE-DSP-001",
        },
        {
          column: "event_type",
          value: "dsp_end",
        },
        {
          column: "source_surface",
          value: "admin_api",
        },
      ],
      limit: 20,
      orderBy: {
        column: "created_at",
        options: {
          ascending: false,
          nullsFirst: false,
        },
      },
      selectedColumns:
        "booking_reference, event_type, occurred_at, safe_event_note, safe_event_context, source_surface, actor_role, created_at",
      table: "driver_job_dsp_actual_time_events",
    },
    {
      filters: [
        {
          column: "booking_reference",
          value: "SAFE-DSP-001",
        },
      ],
      limit: 3,
      orderBy: {
        column: "dsp_ended_at",
        options: {
          ascending: false,
          nullsFirst: false,
        },
      },
      selectedColumns:
        "booking_reference, dsp_started_at, dsp_ended_at, total_minutes, actual_time_status",
      table: "driver_job_dsp_actual_time_summaries",
    },
  ]);
  assertNoLeaks(readResult.body, "enabled DSP actual-time read response");

  const startedResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-002",
        {
          headers: validAdminHeaders(),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(startedResult.status, 200);
  assert.equal(startedResult.body.latest_summary.actual_time_status, "started");
  assert.equal(startedResult.body.latest_summary.dsp_total_minutes, null);
  assert.equal(startedResult.body.latest_summary.dsp_billable_minutes, null);
  assert.equal(startedResult.body.summary.has_complete_actual_time, false);
  assertNoLeaks(startedResult.body, "started DSP actual-time read response");

  const canonicalJcMock = installMockClient({
    driver_job_dsp_actual_time_summaries: [],
    driver_job_status_events: [
      {
        booking_reference: "ADM-20260725150239",
        occurred_at: "2026-07-26T11:14:00.000Z",
        status_value: "completed",
      },
    ],
  });
  const canonicalJcResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=ADM-20260725150239",
        {
          headers: validAdminHeaders(),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(canonicalJcResult.status, 200);
  assert.equal(canonicalJcResult.body.ok, true);
  assert.equal(
    canonicalJcResult.body.latest_summary.dsp_ended_at,
    "2026-07-26T11:14:00.000Z",
  );
  assert.equal(canonicalJcResult.body.latest_summary.dsp_started_at, null);
  assert.equal(canonicalJcResult.body.latest_summary.dsp_total_minutes, null);
  assert.equal(canonicalJcResult.body.latest_summary.actual_time_status, "not_started");
  assert.deepEqual(canonicalJcMock.client.selectHistory[2], {
    filters: [
      {
        column: "booking_reference",
        value: "ADM-20260725150239",
      },
      {
        column: "status_value",
        value: "completed",
      },
    ],
    limit: 1,
    orderBy: {
      column: "occurred_at",
      options: {
        ascending: false,
        nullsFirst: false,
      },
    },
    selectedColumns: "booking_reference, status_value, occurred_at",
    table: "driver_job_status_events",
  });
  assertNoLeaks(canonicalJcResult.body, "canonical Driver JC fallback response");

  const failureMock = installMockClient(seed, {
    failures: {
      "select:driver_job_dsp_actual_time_summaries": {
        code: "42501",
        message: "row level security violation",
      },
    },
  });
  const failureResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-001",
        {
          headers: validAdminHeaders(),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin driver job DSP actual time read failed safely.",
    ok: false,
  });
  assert.equal(failureMock.client.selectHistory.length, 2);
  assertNoLeaks(failureResult.body, "failed DSP actual-time read response");

  assert.equal(
    read.parseAdminDriverJobDspBillingTimeCorrectionParams({
      booking_reference: "SAFE-DSP-001",
      correction_reason: "",
      dsp_ended_at: "2026-07-26T19:14:00+08:00",
      dsp_started_at: "2026-07-26T13:00:00+08:00",
    }).status,
    400,
  );
  assert.equal(
    read.parseAdminDriverJobDspBillingTimeCorrectionParams({
      booking_reference: "SAFE-DSP-001",
      correction_reason: "Customer started early",
      dsp_ended_at: "2026-07-26T12:59:00+08:00",
      dsp_started_at: "2026-07-26T13:00:00+08:00",
    }).status,
    400,
  );
  assert.equal(
    read.parseAdminDriverJobDspBillingTimeCorrectionParams({
      booking_reference: "SAFE-DSP-001",
      correction_reason: "Impossible duration",
      dsp_ended_at: "2026-09-01T13:00:00+08:00",
      dsp_started_at: "2026-07-26T13:00:00+08:00",
    }).status,
    400,
  );

  const fixedTripMock = installMockClient(seed);
  const fixedTripResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-driver-job-dsp-actual-time-summaries", {
        body: JSON.stringify({
          booking_reference: "SAFE-DEP-001",
          correction_reason: "Must stay DSP-only",
          dsp_ended_at: "2026-07-26T19:14:00+08:00",
          dsp_started_at: "2026-07-26T13:00:00+08:00",
        }),
        headers: validAdminHeaders({
          "content-type": "application/json",
          referer: "http://localhost/customers/155?name=Safe+Customer",
          "x-prestige-admin-session-token": "",
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(fixedTripResult.status, 409);
  assert.equal(fixedTripMock.client.insertHistory.length, 0);
  assertNoLeaks(fixedTripResult.body, "fixed-trip DSP correction rejection");

  const blockedCorrectionMock = installMockClient(seed);
  const blockedCorrectionResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-driver-job-dsp-actual-time-summaries", {
        body: JSON.stringify({
          booking_reference: "SAFE-DSP-001",
          correction_reason: "Blocked external write",
          dsp_ended_at: "2026-07-26T19:14:00+08:00",
          dsp_started_at: "2026-07-26T13:00:00+08:00",
        }),
        headers: {
          "content-type": "application/json",
          referer: "https://example.com/customers/155",
          "x-prestige-admin-purpose": "admin-booking-persistence",
        },
        method: "POST",
      }),
    ),
  );

  assert.equal(blockedCorrectionResult.status, 403);
  assert.equal(blockedCorrectionMock.client.insertHistory.length, 0);
  assertNoLeaks(blockedCorrectionResult.body, "blocked DSP correction response");

  const correctionMock = installMockClient(seed);
  const correctionResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-driver-job-dsp-actual-time-summaries", {
        body: JSON.stringify({
          booking_reference: "SAFE-DSP-001",
          correction_reason: "Customer service started 15 minutes early",
          dsp_ended_at: "2026-07-26T19:14:00+08:00",
          dsp_started_at: "2026-07-26T12:45:00+08:00",
        }),
        headers: validAdminHeaders({
          "content-type": "application/json",
          referer: "http://localhost/customers/155?name=Safe+Customer",
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(correctionResult.status, 200);
  assert.equal(correctionResult.body.ok, true);
  assert.equal(
    correctionResult.body.corrected_summary.billing_time_source,
    "admin_correction",
  );
  assert.equal(
    correctionResult.body.corrected_summary.dsp_started_at,
    "2026-07-26T04:45:00.000Z",
  );
  assert.equal(
    correctionResult.body.corrected_summary.dsp_ended_at,
    "2026-07-26T11:14:00.000Z",
  );
  assert.equal(correctionResult.body.corrected_summary.dsp_total_minutes, 389);
  assert.equal(correctionMock.client.insertHistory.length, 1);
  assert.deepEqual(correctionMock.client.insertHistory[0].payload, {
    actor_label: "DSP actual-time contract admin",
    actor_role: "admin",
    booking_reference: "SAFE-DSP-001",
    driver_job_link_id: null,
    event_type: "dsp_end",
    occurred_at: "2026-07-26T11:14:00.000Z",
    safe_event_context: {
      actual_time_policy: "admin_billing_time_correction",
      billing_started_at: "2026-07-26T04:45:00.000Z",
    },
    safe_event_note: "Customer service started 15 minutes early",
    source_surface: "admin_api",
  });
  assertNoLeaks(correctionResult.body, "saved DSP billing-time correction response");

  const correctedReadResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-driver-job-dsp-actual-time-summaries?booking_reference=SAFE-DSP-001&limit=1",
        {
          headers: validAdminHeaders(),
          method: "GET",
        },
      ),
    ),
  );

  assert.equal(correctedReadResult.status, 200);
  assert.equal(correctedReadResult.body.latest_summary.billing_time_source, "admin_correction");
  assert.equal(correctedReadResult.body.latest_summary.dsp_total_minutes, 389);
  assert.equal(correctedReadResult.body.summaries.length, 1);
  assertNoLeaks(correctedReadResult.body, "corrected DSP actual-time read response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminDspActualTimeReadMock;

  if (harness) {
    await harness.cleanup();
  }
}

console.log("Admin driver job DSP actual-time read API contract passed safely.");
