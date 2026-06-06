import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledWorkflowStatusPersistenceError =
  "Admin booking workflow status persistence is not enabled on this server.";
const serverSessionToken = "mock-workflow-status-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_WORKFLOW_STATUS_SENTINEL";
const supabaseUrlSentinel = "https://workflow-status-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_WORKFLOW_STATUS_SENTINEL|mock-workflow-status-admin-session-token|workflow-status-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeWorkflowLeakPattern =
  /customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-booking-workflow-status-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-booking-workflow-statuses/route.ts",
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
      "  const mock = globalThis.__prestigeWorkflowStatusApiMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-workflow-status-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(tempDir, "lib/admin-booking-workflow-status-persistence.js")),
    route: require(path.join(tempDir, "app/api/admin-booking-workflow-statuses/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.options = null;
    this.orderBy = null;
    this.payload = null;
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
  }

  select(columns) {
    if (!this.operation) {
      this.operation = "select";
    }

    this.selectedColumns = columns;

    return this;
  }

  upsert(payload, options) {
    this.operation = "upsert";
    this.options = options;
    this.payload = payload;

    return this;
  }

  eq(column, value) {
    this.filters.push({ column, value });

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

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    if (this.operation === "upsert") {
      return this.client.upsertRows(this.table, this.payload, this.options, this.resultMode);
    }

    return this.client.selectRows(
      this.table,
      this.filters,
      this.orderBy,
      this.resultMode,
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
      booking_workflow_statuses: [],
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

  recordOperation(action, table, payload, options = null) {
    this.operations.push({
      action,
      options: clone(options),
      payload: clone(payload),
      table,
    });
  }

  upsertRows(table, payload, options, resultMode) {
    const failure = this.failureFor("upsert", table);

    this.recordOperation("upsert", table, payload, options);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.tables[table];
    const existingIndex = rows.findIndex(
      (row) =>
        row.booking_reference === payload.booking_reference &&
        row.workflow_area === payload.workflow_area,
    );
    const now = "2026-06-06T00:00:00.000Z";
    const persisted =
      existingIndex >= 0
        ? {
            ...rows[existingIndex],
            ...clone(payload),
          }
        : {
            created_at: now,
            id: `mock-workflow-status-${rows.length + 1}`,
            ...clone(payload),
          };

    if (!persisted.created_at) {
      persisted.created_at = now;
    }

    if (existingIndex >= 0) {
      rows[existingIndex] = persisted;
    } else {
      rows.push(persisted);
    }

    return {
      data: resultMode === "single" ? clone(persisted) : [clone(persisted)],
      error: null,
    };
  }

  selectRows(table, filters, orderBy, resultMode, selectedColumns) {
    const failure = this.failureFor("select", table);

    this.selectHistory.push({
      filters: clone(filters),
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
      rows = rows.sort((first, second) =>
        String(first[orderBy.column] || "").localeCompare(String(second[orderBy.column] || "")),
      );
    }

    return {
      data: resultMode === "single" ? clone(rows[0] || null) : rows.map((row) => clone(row)),
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeWorkflowStatusApiMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Workflow Status Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  };
}

function disabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  };
}

function workflowPayload(overrides = {}) {
  return {
    booking_reference: "SAFE-WF-001",
    safe_status_context: {
      next_action: "Release after dispatcher review.",
      safe_note: "Dispatcher checked safe customer and driver copy.",
    },
    status_label: "Ready for dispatch release",
    status_value: "ready",
    workflow_area: "dispatch_release",
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

function jsonRequest(url, body, headers = sessionHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeApiLeakPattern, label);
  assert.doesNotMatch(text, unsafeWorkflowLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(
    persistence.adminBookingWorkflowStatusPersistenceVersion,
    "stage-4a-429-admin-workflow-status-api-v1",
  );

  const parsedPayload = persistence.parseAdminBookingWorkflowStatusSavePayload(workflowPayload());

  assert.equal(parsedPayload.ok, true);
  assert.deepEqual(parsedPayload.data, workflowPayload());

  for (const [label, payload, expectedError] of [
    [
      "bad booking reference",
      workflowPayload({ booking_reference: "../unsafe" }),
      "Missing or malformed workflow status booking_reference.",
    ],
    [
      "bad workflow area",
      workflowPayload({ workflow_area: "monthly_billing" }),
      "Missing or malformed workflow status workflow_area.",
    ],
    [
      "bad status value",
      workflowPayload({ status_value: "invoice_ready" }),
      "Missing or malformed workflow status status_value.",
    ],
    [
      "unknown actor field",
      workflowPayload({ actor_role: "customer" }),
      "Unknown workflow status fields rejected: workflow_status.actor_role",
    ],
  ]) {
    const parsed = persistence.parseAdminBookingWorkflowStatusSavePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser error should stay safe`);
  }

  for (const payload of [
    workflowPayload({
      safe_status_context: {
        driver_payout: "must not persist",
      },
    }),
    workflowPayload({
      safe_status_context: {
        safe_note: "Do not store driver payout details here.",
      },
    }),
    workflowPayload({
      status_label: "Invoice payment ready",
    }),
  ]) {
    const parsed = persistence.parseAdminBookingWorkflowStatusSavePayload(payload);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, "Forbidden workflow status fields rejected.");
    assertNoLeaks(parsed, "forbidden parser response should stay generic");
  }

  setEnv(disabledEnv());

  const disabledMock = installMockClient();
  const disabledResult = await readRouteResponse(
    await route.POST(
      jsonRequest(
        "http://localhost/api/admin-booking-workflow-statuses",
        workflowPayload(),
        adminHeaders(),
      ),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledWorkflowStatusPersistenceError,
    ok: false,
  });
  assertNoSupabaseTouched(disabledMock, "disabled persistence");
  assertNoLeaks(disabledResult, "disabled route response");

  for (const [label, request] of [
    [
      "anonymous GET",
      new Request(
        "http://localhost/api/admin-booking-workflow-statuses?booking_reference=SAFE-WF-001",
      ),
    ],
    [
      "customer referer POST",
      jsonRequest(
        "http://localhost/api/admin-booking-workflow-statuses",
        workflowPayload(),
        sessionHeaders({ referer: "http://localhost/book" }),
      ),
    ],
    [
      "driver referer POST",
      jsonRequest(
        "http://localhost/api/admin-booking-workflow-statuses",
        workflowPayload(),
        sessionHeaders({ referer: "http://localhost/driver-job-demo" }),
      ),
    ],
    [
      "wrong token POST",
      jsonRequest(
        "http://localhost/api/admin-booking-workflow-statuses",
        workflowPayload(),
        sessionHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
      ),
    ],
  ]) {
    setEnv(enabledEnv());

    const mock = installMockClient();
    const response =
      request.method === "GET"
        ? await route.GET(request)
        : await route.POST(request);
    const result = await readRouteResponse(response);

    assert.equal(result.status, 403, `${label}: expected route boundary block`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv());

  const invalidPayloadMock = installMockClient();
  const invalidPayloadResult = await readRouteResponse(
    await route.POST(
      jsonRequest(
        "http://localhost/api/admin-booking-workflow-statuses",
        workflowPayload({
          safe_status_context: {
            safe_note: "Send payment PDF link.",
          },
        }),
      ),
    ),
  );

  assert.equal(invalidPayloadResult.status, 400);
  assert.deepEqual(invalidPayloadResult.body, {
    error: "Forbidden workflow status fields rejected.",
    ok: false,
  });
  assertNoSupabaseTouched(invalidPayloadMock, "invalid route payload");
  assertNoLeaks(invalidPayloadResult, "invalid route payload response");

  for (const role of ["admin", "dispatcher"]) {
    setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const mock = installMockClient();
    const result = await readRouteResponse(
      await route.POST(
        jsonRequest(
          "http://localhost/api/admin-booking-workflow-statuses",
          workflowPayload({ booking_reference: `SAFE-WF-${role.toUpperCase()}` }),
        ),
      ),
    );

    assert.equal(result.status, 200, `${role}: expected mocked workflow status save`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.status.booking_reference, `SAFE-WF-${role.toUpperCase()}`);
    assert.equal(result.body.status.workflow_area, "dispatch_release");
    assert.equal(result.body.status.status_value, "ready");
    assert.equal(result.body.status.source_surface, "admin_api");
    assert.equal(result.body.status.actor_role, role);
    assert.equal(result.body.status.safe_status_context.safe_note, "Dispatcher checked safe customer and driver copy.");
    assert.equal(mock.createdClients.length, 1);
    assert.deepEqual(mock.createdClients[0].options, {
      auth: {
        persistSession: false,
      },
    });
    assert.equal(mock.createdClients[0].url, supabaseUrlSentinel);
    assert.equal(mock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
    assert.equal(mock.client.operations.length, 1);
    assert.equal(mock.client.operations[0].action, "upsert");
    assert.equal(mock.client.operations[0].table, "booking_workflow_statuses");
    assert.deepEqual(mock.client.operations[0].options, {
      onConflict: "booking_reference,workflow_area",
    });
    assert.equal(mock.client.operations[0].payload.source_surface, "admin_api");
    assert.equal(mock.client.operations[0].payload.actor_role, role);
    assertNoLeaks(result, `${role}: route response should stay safe`);
  }

  setEnv(enabledEnv());

  const readMock = installMockClient({
    booking_workflow_statuses: [
      {
        actor_label: "Workflow Status Test Admin",
        actor_role: "admin",
        booking_reference: "SAFE-WF-001",
        created_at: "2026-06-06T00:00:00.000Z",
        id: "workflow-status-row-1",
        safe_status_context: {
          next_action: "Keep ready for release.",
          safe_note: "Loaded safe note only.",
        },
        source_surface: "admin_api",
        status_label: "Ready for dispatch release",
        status_value: "ready",
        updated_at: "2026-06-06T00:00:00.000Z",
        workflow_area: "dispatch_release",
      },
    ],
  });
  const readResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-booking-workflow-statuses?booking_reference=SAFE-WF-001",
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.statuses.length, 1);
  assert.equal(readResult.body.statuses[0].booking_reference, "SAFE-WF-001");
  assert.equal(readResult.body.statuses[0].workflow_area, "dispatch_release");
  assert.equal(readMock.createdClients.length, 1);
  assert.equal(readMock.client.operations.length, 0);
  assert.equal(readMock.client.selectHistory.length, 1);
  assert.deepEqual(readMock.client.selectHistory[0].filters, [
    {
      column: "booking_reference",
      value: "SAFE-WF-001",
    },
  ]);
  assertNoLeaks(readResult, "GET response should stay safe");

  setEnv(enabledEnv());

  const localActorMock = installMockClient();
  const localActorResult = await persistence.saveAdminBookingWorkflowStatus(workflowPayload(), {
    actor_label: "Local dev actor",
    actor_role: "admin",
    boundary_mode: "local-dev-admin-surface",
    source_surface: "admin_api",
  });

  assert.deepEqual(localActorResult, {
    error:
      "Admin booking workflow status persistence requires a verified admin or dispatcher server session.",
    ok: false,
    status: 403,
  });
  assertNoSupabaseTouched(localActorMock, "enabled local actor");
  assertNoLeaks(localActorResult, "enabled local actor response");

  setEnv(enabledEnv());

  const failureMock = installMockClient(
    {},
    {
      failures: {
        "upsert:booking_workflow_statuses": {
          code: "42501",
          message: `SQL stack with ${serviceRoleSentinel} should not leak`,
        },
      },
    },
  );
  const failureResult = await readRouteResponse(
    await route.POST(
      jsonRequest(
        "http://localhost/api/admin-booking-workflow-statuses",
        workflowPayload({ booking_reference: "SAFE-WF-FAILURE" }),
      ),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin booking workflow status save failed safely.",
    ok: false,
  });
  assert.equal(failureMock.createdClients.length, 1);
  assert.equal(failureMock.client.operations.length, 1);
  assertNoLeaks(failureResult, "database failure response should stay sanitized");
} finally {
  restoreEnv();
  delete globalThis.__prestigeWorkflowStatusApiMock;
  await harness.cleanup();
}

console.log("Admin booking workflow status API contract tests passed.");
