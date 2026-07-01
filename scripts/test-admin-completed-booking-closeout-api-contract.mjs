import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledCompletedBookingCloseoutPersistenceError =
  "Admin completed booking closeout persistence is not enabled on this server.";
const serverSessionToken = "mock-completed-closeout-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_COMPLETED_CLOSEOUT_SENTINEL";
const supabaseUrlSentinel = "https://completed-closeout-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_COMPLETED_CLOSEOUT_SENTINEL|mock-completed-closeout-admin-session-token|completed-closeout-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeCloseoutLeakPattern =
  /customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-completed-booking-closeout-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-completed-booking-closeouts/route.ts",
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
      "  const mock = globalThis.__prestigeCompletedCloseoutApiMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-completed-closeout-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-completed-booking-closeout-persistence.js",
    )),
    route: require(path.join(tempDir, "app/api/admin-completed-booking-closeouts/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.options = null;
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
      completed_booking_closeouts: [],
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
      (row) => row.booking_reference === payload.booking_reference,
    );
    const now = "2026-06-07T00:00:00.000Z";
    const persisted =
      existingIndex >= 0
        ? {
            ...rows[existingIndex],
            ...clone(payload),
          }
        : {
            created_at: now,
            id: `mock-completed-closeout-${rows.length + 1}`,
            ...clone(payload),
          };

    if (!persisted.created_at) {
      persisted.created_at = now;
    }

    if (!persisted.updated_at) {
      persisted.updated_at = now;
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

  selectRows(table, filters, resultMode, selectedColumns) {
    const failure = this.failureFor("select", table);

    this.selectHistory.push({
      filters: clone(filters),
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.tables[table].filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    );

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

  globalThis.__prestigeCompletedCloseoutApiMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Completed Closeout Test Admin",
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

function closeoutPayload(overrides = {}) {
  return {
    billing_prep_readiness: "ready",
    booking_reference: "SAFE-CLOSEOUT-001",
    closeout_status: "ready_for_billing_prep",
    completed_job_status: "completed",
    dsp_actual_hours_readiness: "ready",
    extra_charges_readiness: "none",
    safe_closeout_context: {
      closeout_summary: "Completion details reviewed for closeout.",
      next_action: "Queue for monthly billing prep review.",
    },
    safe_closeout_note: "Dispatcher reviewed completed trip closeout fields.",
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
  assert.doesNotMatch(text, unsafeCloseoutLeakPattern, label);
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
    persistence.adminCompletedBookingCloseoutPersistenceVersion,
    "stage-4a-436-admin-completed-booking-closeout-api-v1",
  );

  const parsedPayload = persistence.parseAdminCompletedBookingCloseoutSavePayload(
    closeoutPayload(),
  );

  assert.equal(parsedPayload.ok, true);
  assert.deepEqual(parsedPayload.data, closeoutPayload());

  for (const [label, payload, expectedError] of [
    [
      "bad booking reference",
      closeoutPayload({ booking_reference: "../unsafe" }),
      "Missing or malformed completed booking closeout booking_reference.",
    ],
    [
      "bad closeout status",
      closeoutPayload({ closeout_status: "invoice_ready" }),
      "Missing or malformed completed booking closeout closeout_status.",
    ],
    [
      "bad completed job status",
      closeoutPayload({ completed_job_status: "paid" }),
      "Missing or malformed completed booking closeout completed_job_status.",
    ],
    [
      "bad DSP actual hours readiness",
      closeoutPayload({ dsp_actual_hours_readiness: "amount_ready" }),
      "Missing or malformed completed booking closeout dsp_actual_hours_readiness.",
    ],
    [
      "bad extra charges readiness",
      closeoutPayload({ extra_charges_readiness: "charge_amount_ready" }),
      "Missing or malformed completed booking closeout extra_charges_readiness.",
    ],
    [
      "bad billing prep readiness",
      closeoutPayload({ billing_prep_readiness: "invoice_ready" }),
      "Missing or malformed completed booking closeout billing_prep_readiness.",
    ],
    [
      "unknown actor field",
      closeoutPayload({ actor_role: "customer" }),
      "Unknown completed booking closeout fields rejected: completed_booking_closeout.actor_role",
    ],
  ]) {
    const parsed = persistence.parseAdminCompletedBookingCloseoutSavePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser error should stay safe`);
  }

  const unknownContextParsed = persistence.parseAdminCompletedBookingCloseoutSavePayload(
    closeoutPayload({
      safe_closeout_context: {
        dispatch_log: "unknown",
      },
    }),
  );

  assert.equal(unknownContextParsed.ok, false);
  assert.equal(unknownContextParsed.status, 400);
  assert.equal(
    unknownContextParsed.error,
    "Unknown completed booking closeout safe context fields rejected: safe_closeout_context.dispatch_log",
  );
  assertNoLeaks(unknownContextParsed, "unknown context parser response should stay safe");

  for (const payload of [
    closeoutPayload({
      driver_payout: "must not persist",
    }),
    closeoutPayload({
      safe_closeout_context: {
        closeout_summary: "Driver payout detail must not persist.",
      },
    }),
    closeoutPayload({
      safe_closeout_note: "Send invoice payment PDF link.",
    }),
  ]) {
    const parsed = persistence.parseAdminCompletedBookingCloseoutSavePayload(payload);

    assert.equal(parsed.ok, false);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, "Forbidden completed booking closeout fields rejected.");
    assertNoLeaks(parsed, "forbidden parser response should stay generic");
  }

  setEnv(disabledEnv());

  const disabledMock = installMockClient();
  const disabledResult = await readRouteResponse(
    await route.POST(
      jsonRequest(
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload(),
        adminHeaders(),
      ),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledCompletedBookingCloseoutPersistenceError,
    ok: false,
  });
  assertNoSupabaseTouched(disabledMock, "disabled persistence");
  assertNoLeaks(disabledResult, "disabled route response");

  for (const [label, request] of [
    [
      "anonymous GET",
      new Request(
        "http://localhost/api/admin-completed-booking-closeouts?booking_reference=SAFE-CLOSEOUT-001",
      ),
    ],
    [
      "customer referer POST",
      jsonRequest(
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload(),
        sessionHeaders({ referer: "http://localhost/book" }),
      ),
    ],
    [
      "driver referer POST",
      jsonRequest(
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload(),
        sessionHeaders({ referer: "http://localhost/driver-job-demo" }),
      ),
    ],
    [
      "wrong token POST",
      jsonRequest(
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload(),
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
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload({
          safe_closeout_note: "Payment PDF link ready.",
        }),
      ),
    ),
  );

  assert.equal(invalidPayloadResult.status, 400);
  assert.deepEqual(invalidPayloadResult.body, {
    error: "Forbidden completed booking closeout fields rejected.",
    ok: false,
  });
  assertNoSupabaseTouched(invalidPayloadMock, "invalid route payload");
  assertNoLeaks(invalidPayloadResult, "invalid route payload response");

  setEnv(enabledEnv());

  const dashboardPostMock = installMockClient();
  const dashboardPostResult = await readRouteResponse(
    await route.POST(
      jsonRequest(
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload({ booking_reference: "SAFE-CLOSEOUT-DASHBOARD" }),
        adminHeaders(),
      ),
    ),
  );

  assert.equal(dashboardPostResult.status, 200, "same-origin dashboard POST should save without exposing the private session token");
  assert.equal(dashboardPostResult.body.ok, true);
  assert.equal(dashboardPostResult.body.closeout.booking_reference, "SAFE-CLOSEOUT-DASHBOARD");
  assert.equal(dashboardPostResult.body.closeout.actor_role, "admin");
  assert.equal(dashboardPostResult.body.closeout.source_surface, "admin_api");
  assert.equal(dashboardPostMock.createdClients.length, 1);
  assertNoLeaks(dashboardPostResult, "same-origin dashboard POST response should stay safe");

  for (const role of ["admin", "dispatcher"]) {
    setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const mock = installMockClient();
    const result = await readRouteResponse(
      await route.POST(
        jsonRequest(
          "http://localhost/api/admin-completed-booking-closeouts",
          closeoutPayload({ booking_reference: `SAFE-CLOSEOUT-${role.toUpperCase()}` }),
        ),
      ),
    );

    assert.equal(result.status, 200, `${role}: expected mocked closeout save`);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.closeout.booking_reference, `SAFE-CLOSEOUT-${role.toUpperCase()}`);
    assert.equal(result.body.closeout.closeout_status, "ready_for_billing_prep");
    assert.equal(result.body.closeout.completed_job_status, "completed");
    assert.equal(result.body.closeout.dsp_actual_hours_readiness, "ready");
    assert.equal(result.body.closeout.extra_charges_readiness, "none");
    assert.equal(result.body.closeout.billing_prep_readiness, "ready");
    assert.equal(result.body.closeout.source_surface, "admin_api");
    assert.equal(result.body.closeout.actor_role, role);
    assert.equal(
      result.body.closeout.safe_closeout_context.next_action,
      "Queue for monthly billing prep review.",
    );
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
    assert.equal(mock.client.operations[0].table, "completed_booking_closeouts");
    assert.deepEqual(mock.client.operations[0].options, {
      onConflict: "booking_reference",
    });
    assert.equal(mock.client.operations[0].payload.source_surface, "admin_api");
    assert.equal(mock.client.operations[0].payload.actor_role, role);
    assert.equal(
      mock.client.operations[0].payload.safe_closeout_note,
      "Dispatcher reviewed completed trip closeout fields.",
    );
    assertNoLeaks(result, `${role}: route response should stay safe`);
  }

  setEnv(enabledEnv());

  const readMock = installMockClient({
    completed_booking_closeouts: [
      {
        actor_label: "Completed Closeout Test Admin",
        actor_role: "admin",
        billing_prep_readiness: "ready",
        booking_reference: "SAFE-CLOSEOUT-001",
        closeout_status: "ready_for_billing_prep",
        completed_job_status: "completed",
        created_at: "2026-06-07T00:00:00.000Z",
        dsp_actual_hours_readiness: "ready",
        extra_charges_readiness: "none",
        id: "completed-closeout-row-1",
        safe_closeout_context: {
          closeout_summary: "Loaded safe closeout summary.",
          next_action: "Keep ready for monthly billing prep.",
        },
        safe_closeout_note: "Loaded safe note only.",
        source_surface: "admin_api",
        updated_at: "2026-06-07T00:00:00.000Z",
      },
    ],
  });
  const readResult = await readRouteResponse(
    await route.GET(
      new Request(
        "http://localhost/api/admin-completed-booking-closeouts?booking_reference=SAFE-CLOSEOUT-001",
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.closeout.booking_reference, "SAFE-CLOSEOUT-001");
  assert.equal(readResult.body.closeout.closeout_status, "ready_for_billing_prep");
  assert.equal(readMock.createdClients.length, 1);
  assert.equal(readMock.client.operations.length, 0);
  assert.equal(readMock.client.selectHistory.length, 1);
  assert.deepEqual(readMock.client.selectHistory[0].filters, [
    {
      column: "booking_reference",
      value: "SAFE-CLOSEOUT-001",
    },
  ]);
  assertNoLeaks(readResult, "GET response should stay safe");

  setEnv(enabledEnv());

  const localActorMock = installMockClient();
  const localActorResult = await persistence.saveAdminCompletedBookingCloseout(
    closeoutPayload(),
    {
      actor_label: "Local dev actor",
      actor_role: "admin",
      boundary_mode: "local-dev-admin-surface",
      source_surface: "admin_api",
    },
  );

  assert.deepEqual(localActorResult, {
    error:
      "Admin completed booking closeout persistence requires a verified admin or dispatcher server session.",
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
        "upsert:completed_booking_closeouts": {
          code: "42501",
          message: `SQL stack with ${serviceRoleSentinel} should not leak`,
        },
      },
    },
  );
  const failureResult = await readRouteResponse(
    await route.POST(
      jsonRequest(
        "http://localhost/api/admin-completed-booking-closeouts",
        closeoutPayload({ booking_reference: "SAFE-CLOSEOUT-FAILURE" }),
      ),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin completed booking closeout save failed safely.",
    ok: false,
  });
  assert.equal(failureMock.createdClients.length, 1);
  assert.equal(failureMock.client.operations.length, 1);
  assertNoLeaks(failureResult, "database failure response should stay sanitized");
} finally {
  restoreEnv();
  delete globalThis.__prestigeCompletedCloseoutApiMock;
  await harness.cleanup();
}

console.log("Admin completed booking closeout API contract tests passed.");
