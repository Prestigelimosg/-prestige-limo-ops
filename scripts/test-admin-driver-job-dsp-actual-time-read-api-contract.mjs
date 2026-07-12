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
  /token_hash|raw_token|driver_job_link_id|safe_link_context|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
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

  select(columns) {
    this.operation = "select";
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
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.selectHistory = [];
    this.tables = {
      driver_job_dsp_actual_time_summaries: [],
    };

    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => clone(row));
    }
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
  assert.equal(failureMock.client.selectHistory.length, 1);
  assertNoLeaks(failureResult.body, "failed DSP actual-time read response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminDspActualTimeReadMock;

  if (harness) {
    await harness.cleanup();
  }
}

console.log("Admin driver job DSP actual-time read API contract passed safely.");
