import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledDriverJobStatusReadError =
  "Admin driver job status read is not enabled on this server.";
const serverSessionToken = "mock-driver-status-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_DRIVER_STATUS_READ_SENTINEL";
const supabaseUrlSentinel = "https://driver-status-read-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_DRIVER_STATUS_READ_SENTINEL|mock-driver-status-admin-session-token|driver-status-read-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeDriverStatusLeakPattern =
  /token_hash|raw_token|driver_job_link_id|safe_link_context|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-driver-job-status-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/driver-job-status-workflow.ts",
  "app/api/admin-driver-job-statuses/route.ts",
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
      "  const mock = globalThis.__prestigeAdminDriverJobStatusReadMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-driver-status-read-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    read: require(path.join(tempDir, "lib/admin-driver-job-status-read.js")),
    route: require(path.join(tempDir, "app/api/admin-driver-job-statuses/route.js")),
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
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      driver_job_status_events: [],
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

  globalThis.__prestigeAdminDriverJobStatusReadMock = mock;

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

function validServerSessionEnv(overrides = {}) {
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Dispatcher contract",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

async function json(response) {
  return response.json();
}

function assertSafeApiBody(body, label) {
  const serialized = JSON.stringify(body);

  assert.equal(safeApiLeakPattern.test(serialized), false, `${label} leaked server internals.`);
}

function assertNoUnsafeDriverStatusBody(body, label) {
  const serialized = JSON.stringify(body);

  assert.equal(
    unsafeDriverStatusLeakPattern.test(serialized),
    false,
    `${label} leaked forbidden driver/customer/admin-private fields.`,
  );
}

function seedStatusRows() {
  return {
    driver_job_status_events: [
      {
        actor_label: "Driver safe label",
        actor_role: "driver",
        booking_reference: "DRV-STATUS-REF-001",
        created_at: "2026-06-07T09:10:00.000Z",
        driver_job_link_id: "must-not-return",
        occurred_at: "2026-06-07T09:10:00.000Z",
        safe_status_note: "Reached pickup side road",
        source_surface: "driver_job_api",
        status_source: "driver_job_api",
        status_value: "driver_otw",
        token_hash: "must-not-return",
      },
      {
        actor_label: "Contains service_role and must be dropped",
        actor_role: "driver",
        booking_reference: "DRV-STATUS-REF-001",
        created_at: "2026-06-07T09:25:00.000Z",
        occurred_at: "2026-06-07T09:25:00.000Z",
        safe_status_note: "Contains invoice and must be dropped",
        source_surface: "driver_job_api",
        status_source: "driver_job_api",
        status_value: "ots",
      },
      {
        actor_label: "Other booking",
        actor_role: "driver",
        booking_reference: "OTHER-REF-001",
        created_at: "2026-06-07T09:40:00.000Z",
        occurred_at: "2026-06-07T09:40:00.000Z",
        safe_status_note: "Other safe note",
        source_surface: "driver_job_api",
        status_source: "driver_job_api",
        status_value: "pob",
      },
    ],
  };
}

function readOnlyActor() {
  return {
    actor_label: "Dispatcher contract",
    actor_role: "dispatcher",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
  };
}

const sourceText = await Promise.all(
  sourceFiles.map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const joinedSourceText = sourceText.join("\n");
const readPathSourceText = await Promise.all(
  [
    "lib/admin-driver-job-status-read.ts",
    "app/api/admin-driver-job-statuses/route.ts",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assert.equal(
  /\.(?:insert|upsert|delete|update)\s*\(/.test(readPathSourceText.join("\n")),
  false,
  "Admin driver job status read path must remain read-only.",
);
assert.equal(
  /token_hash|raw_token|driver_job_link_id|safe_link_context/.test(
    joinedSourceText.match(/driverJobStatusEventSelect\s*=\s*([^;]+)/)?.[1] || "",
  ),
  false,
  "Admin driver job status select must not include token/link internals.",
);

const harness = await loadHarness();

try {
  assert.deepEqual(
    harness.read.parseAdminDriverJobStatusReadParams(
      new URLSearchParams("booking_reference=DRV-STATUS-REF-001"),
    ),
    {
      data: {
        booking_reference: "DRV-STATUS-REF-001",
        limit: 10,
      },
      ok: true,
    },
    "Default read params should accept a safe booking reference.",
  );
  assert.equal(
    harness.read.parseAdminDriverJobStatusReadParams(
      new URLSearchParams("booking_reference=bad value"),
    ).status,
    400,
    "Malformed booking reference should be rejected.",
  );
  assert.equal(
    harness.read.parseAdminDriverJobStatusReadParams(
      new URLSearchParams("booking_reference=DRV-STATUS-REF-001&limit=1000"),
    ).status,
    400,
    "Oversized limit should be rejected.",
  );

  setEnv({ PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false" });
  delete globalThis.__prestigeAdminDriverJobStatusReadMock;
  const disabledResult = await harness.read.loadAdminDriverJobStatuses(
    { booking_reference: "DRV-STATUS-REF-001" },
    readOnlyActor(),
  );
  assert.equal(disabledResult.ok, false, "Read should be disabled by default.");
  assert.equal(disabledResult.status, 503);
  assert.equal(disabledResult.error, disabledDriverJobStatusReadError);

  validServerSessionEnv();
  const mock = installMockClient(seedStatusRows());
  const readResult = await harness.read.loadAdminDriverJobStatuses(
    { booking_reference: "DRV-STATUS-REF-001", limit: 2 },
    readOnlyActor(),
  );
  assert.equal(readResult.ok, true, "Expected direct helper read to pass.");
  assert.equal(readResult.data.latest_status, "ots");
  assert.equal(readResult.data.statuses.length, 2);
  assert.equal(readResult.data.summary.event_count, 2);
  assert.equal(readResult.data.summary.has_status_history, true);
  assert.equal(readResult.data.statuses[0].actor_label, null);
  assert.equal(readResult.data.statuses[0].safe_status_note, null);
  assert.equal(readResult.data.statuses[1].safe_status_note, "Reached pickup side road");
  assertNoUnsafeDriverStatusBody(readResult.data, "direct read result");
  assert.equal(mock.createdClients.length, 1, "Expected one server-only Supabase client.");
  assert.equal(mock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(mock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.deepEqual(mock.client.selectHistory[0].filters, [
    { column: "booking_reference", value: "DRV-STATUS-REF-001" },
  ]);
  assert.deepEqual(mock.client.selectHistory[0].orderBy, {
    column: "occurred_at",
    options: { ascending: false },
  });
  assert.equal(mock.client.selectHistory[0].limit, 2);
  assert.equal(mock.client.operations.length, 0, "Read helper must not write.");
  assert.equal(
    /token_hash|raw_token|driver_job_link_id|safe_link_context/.test(
      mock.client.selectHistory[0].selectedColumns,
    ),
    false,
    "Select columns should avoid driver token/link internals.",
  );

  validServerSessionEnv();
  const routeMock = installMockClient(seedStatusRows());
  const response = await harness.route.GET(
    new Request(
      "http://localhost/api/admin-driver-job-statuses?booking_reference=DRV-STATUS-REF-001&limit=1",
      { headers: validAdminHeaders() },
    ),
  );
  const body = await json(response);
  assert.equal(response.status, 200);
  assert.equal(body.ok, true);
  assert.equal(body.latest_status, "ots");
  assert.equal(body.statuses.length, 1);
  assert.equal(body.summary.event_count, 1);
  assertSafeApiBody(body, "route success body");
  assertNoUnsafeDriverStatusBody(body, "route success body");
  assert.equal(routeMock.client.operations.length, 0, "Route must not write.");

  validServerSessionEnv();
  installMockClient(seedStatusRows());
  for (const [label, request] of [
    ["anonymous", new Request("http://localhost/api/admin-driver-job-statuses?booking_reference=DRV-STATUS-REF-001")],
    [
      "customer page",
      new Request(
        "http://localhost/api/admin-driver-job-statuses?booking_reference=DRV-STATUS-REF-001",
        { headers: validAdminHeaders({ referer: "http://localhost/customers" }) },
      ),
    ],
    [
      "driver page",
      new Request(
        "http://localhost/api/admin-driver-job-statuses?booking_reference=DRV-STATUS-REF-001",
        { headers: validAdminHeaders({ referer: "http://localhost/driver-job-demo" }) },
      ),
    ],
    [
      "wrong token",
      new Request(
        "http://localhost/api/admin-driver-job-statuses?booking_reference=DRV-STATUS-REF-001",
        { headers: validAdminHeaders({ "x-prestige-admin-session-token": "wrong-token" }) },
      ),
    ],
  ]) {
    const blockedResponse = await harness.route.GET(request);
    const blockedBody = await json(blockedResponse);

    assert.equal(blockedResponse.status, 403, `${label} should be blocked.`);
    assert.equal(blockedBody.error, routeBlockedMessage);
    assertSafeApiBody(blockedBody, `${label} blocked body`);
  }

  validServerSessionEnv();
  installMockClient(seedStatusRows());
  const invalidRouteResponse = await harness.route.GET(
    new Request("http://localhost/api/admin-driver-job-statuses?booking_reference=bad value", {
      headers: validAdminHeaders(),
    }),
  );
  const invalidRouteBody = await json(invalidRouteResponse);
  assert.equal(invalidRouteResponse.status, 400);
  assertSafeApiBody(invalidRouteBody, "invalid route body");

  validServerSessionEnv();
  installMockClient(seedStatusRows(), {
    failures: {
      "select:driver_job_status_events": { code: "42501", message: "row level security" },
    },
  });
  const failureResult = await harness.read.loadAdminDriverJobStatuses(
    { booking_reference: "DRV-STATUS-REF-001" },
    readOnlyActor(),
  );
  assert.equal(failureResult.ok, false);
  assert.equal(failureResult.status, 500);
  assert.equal(failureResult.category, "permission_or_rls_denied");
  assert.equal(failureResult.error, "Admin driver job status read failed safely.");
  assertSafeApiBody(failureResult, "safe adapter failure");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminDriverJobStatusReadMock;
  await harness.cleanup();
}

console.log("Admin driver job status read API contract tests passed.");
