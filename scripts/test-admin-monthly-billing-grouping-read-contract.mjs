import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledMonthlyBillingGroupingReadError =
  "Admin monthly billing grouping read is not enabled on this server.";
const serverSessionToken = "mock-monthly-billing-grouping-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_BILLING_GROUPING_SENTINEL";
const supabaseUrlSentinel = "https://monthly-billing-grouping-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_BILLING_GROUPING_SENTINEL|mock-monthly-billing-grouping-admin-session-token|monthly-billing-grouping-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeMonthlyBillingLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-monthly-billing-grouping-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-billing-groups/route.ts",
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
      "  const mock = globalThis.__prestigeMonthlyBillingGroupingReadMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-billing-grouping-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    grouping: require(path.join(tempDir, "lib/admin-monthly-billing-grouping-read.js")),
    route: require(path.join(tempDir, "app/api/admin-monthly-billing-groups/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.resultLimit = null;
    this.selectedColumns = null;
    this.table = table;
  }

  select(columns) {
    this.operation = "select";
    this.selectedColumns = columns;

    return this;
  }

  in(column, values) {
    this.filters.push({ column, operator: "in", values });

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    return this.client.selectRows(
      this.table,
      this.filters,
      this.selectedColumns,
      this.resultLimit,
    );
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      bookings: [],
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

  failureFor(action, table, selectedColumns) {
    const failure = this.failures[`${action}:${table}`] || this.failures[table] || null;

    if (typeof failure === "function") {
      return failure(selectedColumns);
    }

    return failure;
  }

  selectRows(table, filters, selectedColumns, resultLimit) {
    const failure = this.failureFor("select", table, selectedColumns);

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.tables[table]
      .filter((row) =>
        filters.every((filter) => {
          if (filter.operator === "in") {
            return filter.values.includes(row[filter.column]);
          }

          return row[filter.column] === filter.value;
        }),
      )
      .slice(0, resultLimit || undefined);

    return {
      data: rows.map((row) => clone(row)),
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeMonthlyBillingGroupingReadMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly Billing Grouping Test Admin",
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

function adminHeaders(overrides = {}) {
  return {
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

async function readRouteResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeApiLeakPattern, label);
  assert.doesNotMatch(text, unsafeMonthlyBillingLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const seed = {
  bookings: [
    {
      admin_internal_status: "completed",
      booking_reference: "MONTHLY-READY-JUN",
      customer_display_name: "Acme Corporate",
      customer_id: "customer-acme",
      pickup_at: "2026-06-04T10:00:00.000Z",
    },
    {
      admin_internal_status: "completed",
      booking_reference: "MONTHLY-BLOCKED-JUN",
      customer_display_name: "Acme Corporate",
      customer_id: "customer-acme",
      pickup_at: "2026-06-18T10:00:00.000Z",
    },
    {
      admin_internal_status: "draft",
      booking_reference: "MONTHLY-DRAFT-JUN",
      customer_display_name: "Acme Corporate",
      customer_id: "customer-acme",
      pickup_at: "2026-06-20T10:00:00.000Z",
    },
    {
      admin_internal_status: "completed",
      booking_reference: "MONTHLY-READY-JUL",
      customer_display_name: "Acme Corporate",
      customer_id: "customer-acme",
      pickup_at: "2026-07-02T10:00:00.000Z",
    },
  ],
  completed_booking_closeouts: [
    {
      billing_prep_readiness: "ready",
      booking_reference: "MONTHLY-READY-JUN",
      closeout_status: "ready_for_billing_prep",
      completed_job_status: "completed",
      dsp_actual_hours_readiness: "ready",
      extra_charges_readiness: "none",
      updated_at: "2026-06-04T12:00:00.000Z",
    },
    {
      billing_prep_readiness: "not_ready",
      booking_reference: "MONTHLY-BLOCKED-JUN",
      closeout_status: "needs_review",
      completed_job_status: "completed",
      dsp_actual_hours_readiness: "ready",
      extra_charges_readiness: "blocked",
      updated_at: "2026-06-18T12:00:00.000Z",
    },
    {
      billing_prep_readiness: "ready",
      booking_reference: "MONTHLY-DRAFT-JUN",
      closeout_status: "ready_for_billing_prep",
      completed_job_status: "completed",
      dsp_actual_hours_readiness: "ready",
      extra_charges_readiness: "ready",
      updated_at: "2026-06-20T12:00:00.000Z",
    },
    {
      billing_prep_readiness: "ready",
      booking_reference: "MONTHLY-READY-JUL",
      closeout_status: "ready_for_billing_prep",
      completed_job_status: "completed",
      dsp_actual_hours_readiness: "not_applicable",
      extra_charges_readiness: "ready",
      updated_at: "2026-07-02T12:00:00.000Z",
    },
    {
      billing_prep_readiness: "ready",
      booking_reference: "MONTHLY-NOBOOK-JUN",
      closeout_status: "ready_for_billing_prep",
      completed_job_status: "completed",
      dsp_actual_hours_readiness: "ready",
      extra_charges_readiness: "ready",
      updated_at: "2026-06-22T12:00:00.000Z",
    },
  ],
};

const harness = await loadHarness();

try {
  const { grouping, route } = harness;

  assert.equal(
    grouping.adminMonthlyBillingGroupingReadVersion,
    "stage-4a-439-admin-monthly-billing-grouping-read-v1",
  );

  assert.deepEqual(grouping.parseAdminMonthlyBillingGroupingReadParams({}), {
    data: {
      billing_month: null,
      limit: 100,
    },
    ok: true,
  });
  assert.deepEqual(
    grouping.parseAdminMonthlyBillingGroupingReadParams({
      billing_month: "2026-06",
      limit: "1",
    }),
    {
      data: {
        billing_month: "2026-06",
        limit: 1,
      },
      ok: true,
    },
  );

  for (const [label, params, expectedError] of [
    [
      "bad month",
      { billing_month: "2026-13" },
      "Malformed monthly billing grouping billing_month rejected.",
    ],
    [
      "bad limit",
      { limit: "999" },
      "Malformed monthly billing grouping limit rejected.",
    ],
  ]) {
    const parsed = grouping.parseAdminMonthlyBillingGroupingReadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  setEnv(disabledEnv());

  const disabledMock = installMockClient(seed);
  const disabledResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-groups", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledMonthlyBillingGroupingReadError,
    ok: false,
  });
  assertNoSupabaseTouched(disabledMock, "disabled persistence");
  assertNoLeaks(disabledResult, "disabled response should stay safe");

  for (const [label, request] of [
    [
      "anonymous GET",
      new Request("http://localhost/api/admin-monthly-billing-groups"),
    ],
    [
      "customer referer GET",
      new Request("http://localhost/api/admin-monthly-billing-groups", {
        headers: sessionHeaders({ referer: "http://localhost/book" }),
      }),
    ],
    [
      "driver referer GET",
      new Request("http://localhost/api/admin-monthly-billing-groups", {
        headers: sessionHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "wrong token GET",
      new Request("http://localhost/api/admin-monthly-billing-groups", {
        headers: sessionHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
      }),
    ],
  ]) {
    setEnv(enabledEnv());

    const mock = installMockClient(seed);
    const result = await readRouteResponse(await route.GET(request));

    assert.equal(result.status, 403, `${label}: expected route boundary block`);
    assert.deepEqual(result.body, {
      error: routeBlockedMessage,
      ok: false,
    });
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(result, `${label}: response should stay safe`);
  }

  setEnv(enabledEnv());

  const readMock = installMockClient(seed);
  const readResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-groups?billing_month=2026-06", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.version, grouping.adminMonthlyBillingGroupingReadVersion);
  assert.deepEqual(readResult.body.groups, [
    {
      billing_month: "2026-06",
      blocked_count: 2,
      customer_account: "Acme Corporate",
      customer_id: "customer-acme",
      ready_count: 1,
      safe_readiness_status: "mixed",
      total_count: 3,
    },
  ]);
  assert.deepEqual(readResult.body.summary, {
    blocked_count: 2,
    group_count: 1,
    ready_count: 1,
    total_count: 3,
  });
  assert.equal(readMock.createdClients.length, 1);
  assert.deepEqual(readMock.createdClients[0].options, {
    auth: {
      persistSession: false,
    },
  });
  assert.equal(readMock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(readMock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(readMock.client.operations.length, 0);
  assert.equal(readMock.client.selectHistory.length, 2);
  assert.equal(readMock.client.selectHistory[0].table, "completed_booking_closeouts");
  assert.equal(readMock.client.selectHistory[0].limit, 500);
  assert.equal(readMock.client.selectHistory[1].table, "bookings");
  assert.deepEqual(readMock.client.selectHistory[1].filters, [
    {
      column: "booking_reference",
      operator: "in",
      values: [
        "MONTHLY-READY-JUN",
        "MONTHLY-BLOCKED-JUN",
        "MONTHLY-DRAFT-JUN",
        "MONTHLY-READY-JUL",
        "MONTHLY-NOBOOK-JUN",
      ],
    },
  ]);
  assertNoLeaks(readResult, "monthly billing grouping response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const dispatcherMock = installMockClient(seed);
  const dispatcherResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-groups?limit=1", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(dispatcherResult.status, 200);
  assert.equal(dispatcherResult.body.groups.length, 1);
  assert.equal(dispatcherResult.body.summary.group_count, 1);
  assert.equal(dispatcherMock.client.operations.length, 0);
  assertNoLeaks(dispatcherResult, "dispatcher monthly billing grouping response should stay safe");

  setEnv(enabledEnv());

  const fallbackMock = installMockClient(
    {
      bookings: [
        {
          admin_internal_status: "completed",
          booking_reference: "MONTHLY-FOUNDATION-AUG",
          customer_display_name: "Foundation Account",
          customer_id: "customer-foundation",
          pickup_datetime: "2026-08-12T10:00:00.000Z",
        },
      ],
      completed_booking_closeouts: [
        {
          billing_prep_readiness: "ready",
          booking_reference: "MONTHLY-FOUNDATION-AUG",
          closeout_status: "ready_for_billing_prep",
          completed_job_status: "completed",
          dsp_actual_hours_readiness: "ready",
          extra_charges_readiness: "none",
          updated_at: "2026-08-12T12:00:00.000Z",
        },
      ],
    },
    {
      failures: {
        "select:bookings": (selectedColumns) =>
          selectedColumns.includes("pickup_at")
            ? {
                code: "42703",
                message: "column pickup_at does not exist",
              }
            : null,
      },
    },
  );
  const fallbackResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-groups", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(fallbackResult.status, 200);
  assert.deepEqual(fallbackResult.body.groups, [
    {
      billing_month: "2026-08",
      blocked_count: 0,
      customer_account: "Foundation Account",
      customer_id: "customer-foundation",
      ready_count: 1,
      safe_readiness_status: "ready",
      total_count: 1,
    },
  ]);
  assert.equal(fallbackMock.client.selectHistory.length, 3);
  assert.equal(fallbackMock.client.selectHistory[1].selectedColumns.includes("pickup_at"), true);
  assert.equal(fallbackMock.client.selectHistory[2].selectedColumns.includes("pickup_datetime"), true);
  assertNoLeaks(fallbackResult, "foundation fallback response should stay safe");

  setEnv(enabledEnv());

  const localActorMock = installMockClient(seed);
  const localActorResult = await grouping.loadAdminMonthlyBillingGroups(
    {},
    {
      actor_label: "Local dev actor",
      actor_role: "admin",
      boundary_mode: "local-dev-admin-surface",
      source_surface: "admin_api",
    },
  );

  assert.deepEqual(localActorResult, {
    error:
      "Admin monthly billing grouping read requires a verified admin or dispatcher server session.",
    ok: false,
    status: 403,
  });
  assertNoSupabaseTouched(localActorMock, "enabled local actor");
  assertNoLeaks(localActorResult, "enabled local actor response should stay safe");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    failures: {
      "select:completed_booking_closeouts": {
        code: "42501",
        message: `SQL stack with ${serviceRoleSentinel} should not leak`,
      },
    },
  });
  const failureResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-groups", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin monthly billing grouping read failed safely.",
    ok: false,
  });
  assert.equal(failureMock.createdClients.length, 1);
  assert.equal(failureMock.client.operations.length, 0);
  assertNoLeaks(failureResult, "database failure response should stay sanitized");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyBillingGroupingReadMock;
  await harness.cleanup();
}

console.log("Admin monthly billing grouping read contract tests passed.");
