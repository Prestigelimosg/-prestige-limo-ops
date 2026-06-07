import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledDraftPlanPersistenceError =
  "Admin monthly billing draft planning persistence is not enabled on this server.";
const serverSessionToken = "mock-monthly-billing-draft-plan-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_BILLING_DRAFT_PLAN_SENTINEL";
const supabaseUrlSentinel = "https://monthly-billing-draft-plan-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_BILLING_DRAFT_PLAN_SENTINEL|mock-monthly-billing-draft-plan-admin-session-token|monthly-billing-draft-plan-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeBillingDraftLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-monthly-billing-draft-plan-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-billing-draft-plans/route.ts",
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
      "  const mock = globalThis.__prestigeMonthlyBillingDraftPlanApiMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-billing-draft-plan-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-monthly-billing-draft-plan-persistence.js",
    )),
    route: require(path.join(tempDir, "app/api/admin-monthly-billing-draft-plans/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.options = null;
    this.payload = null;
    this.resultLimit = null;
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

  limit(count) {
    this.resultLimit = count;

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
      monthly_billing_draft_plans: [],
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

  upsertRows(table, payload, options) {
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
        row.customer_account === payload.customer_account &&
        row.billing_month === payload.billing_month,
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
            id: `mock-monthly-billing-draft-plan-${rows.length + 1}`,
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
      data: clone(persisted),
      error: null,
    };
  }

  selectRows(table, filters, resultMode, selectedColumns, resultLimit) {
    const failure = this.failureFor("select", table);

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
        filters.every((filter) => row[filter.column] === filter.value),
      )
      .slice(0, resultLimit || undefined);

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

  globalThis.__prestigeMonthlyBillingDraftPlanApiMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly Billing Draft Plan Test Admin",
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
  assert.doesNotMatch(text, unsafeBillingDraftLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const seed = {
  monthly_billing_draft_plans: [
    {
      actor_label: "Seed Admin",
      actor_role: "admin",
      billing_month: "2026-06",
      blocked_count: 1,
      created_at: "2026-06-07T00:00:00.000Z",
      customer_account: "Acme Corporate",
      customer_id: "customer-acme",
      draft_status: "planning",
      id: "seed-acme-jun",
      ready_count: 2,
      readiness_status: "mixed",
      safe_draft_context: {
        draft_summary: "Two ready trips and one blocked trip.",
        next_action: "Resolve blocked trip before billing draft review.",
      },
      safe_draft_note: "Safe planning note.",
      source_grouping_summary: {
        blocked_count: 1,
        ready_count: 2,
        total_count: 3,
      },
      source_surface: "admin_api",
      total_count: 3,
      updated_at: "2026-06-07T00:00:00.000Z",
    },
    {
      actor_label: "Seed Admin",
      actor_role: "admin",
      billing_month: "2026-06",
      blocked_count: 0,
      created_at: "2026-06-07T00:00:00.000Z",
      customer_account: "Zeta Account",
      customer_id: "customer-zeta",
      draft_status: "ready_for_billing_draft_review",
      id: "seed-zeta-jun",
      ready_count: 1,
      readiness_status: "ready",
      safe_draft_context: {
        draft_summary: "One ready trip.",
        next_action: "Review billing draft details later.",
      },
      safe_draft_note: null,
      source_grouping_summary: {
        blocked_count: 0,
        ready_count: 1,
        total_count: 1,
      },
      source_surface: "admin_api",
      total_count: 1,
      updated_at: "2026-06-07T00:00:00.000Z",
    },
  ],
};

const validSavePayload = {
  billing_month: "2026-07",
  blocked_count: 0,
  customer_account: "Foundation Account",
  customer_id: "customer-foundation",
  draft_status: "ready_for_billing_draft_review",
  ready_count: 4,
  readiness_status: "ready",
  safe_draft_context: {
    draft_summary: "Four saved trips are ready for billing draft review.",
    next_action: "Review this account in the future draft batch.",
  },
  safe_draft_note: "Safe monthly billing draft planning note.",
  source_grouping_summary: {
    blocked_count: 0,
    ready_count: 4,
    total_count: 4,
  },
  total_count: 4,
};

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(
    persistence.adminMonthlyBillingDraftPlanPersistenceVersion,
    "stage-4a-monthly-billing-draft-plan-api-v1",
  );
  assert.deepEqual(persistence.parseAdminMonthlyBillingDraftPlanLoadParams({}), {
    data: {
      billing_month: null,
      customer_account_search: null,
      draft_status: null,
      limit: 25,
      page: 1,
      readiness_status: null,
    },
    ok: true,
  });
  assert.equal(
    persistence.parseAdminMonthlyBillingDraftPlanSavePayload(validSavePayload).ok,
    true,
    "Expected valid safe draft plan payload",
  );

  for (const [label, params, expectedError] of [
    [
      "bad month",
      { billing_month: "2026-13" },
      "Malformed monthly billing draft planning billing_month rejected.",
    ],
    [
      "bad search",
      { customer_account_search: "invoice_number" },
      "Malformed monthly billing draft planning customer/account search rejected.",
    ],
    [
      "bad draft status",
      { draft_status: "invoiced" },
      "Malformed monthly billing draft planning draft_status rejected.",
    ],
    [
      "bad readiness",
      { readiness_status: "paid" },
      "Malformed monthly billing draft planning readiness_status rejected.",
    ],
    [
      "bad limit",
      { limit: "999" },
      "Malformed monthly billing draft planning limit rejected.",
    ],
    [
      "bad page",
      { page: "0" },
      "Malformed monthly billing draft planning page rejected.",
    ],
  ]) {
    const parsed = persistence.parseAdminMonthlyBillingDraftPlanLoadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  for (const [label, payload] of [
    [
      "unknown invoice field",
      {
        ...validSavePayload,
        invoice_number: "INV-001",
      },
    ],
    [
      "unsafe note",
      {
        ...validSavePayload,
        safe_draft_note: "Create payment link",
      },
    ],
    [
      "bad count",
      {
        ...validSavePayload,
        total_count: 99,
      },
    ],
  ]) {
    const parsed = persistence.parseAdminMonthlyBillingDraftPlanSavePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected save payload`);
    assert.equal(parsed.status, 400);
    assertNoLeaks(parsed, `${label}: save parser response should stay safe`);
  }

  setEnv(disabledEnv());

  const disabledMock = installMockClient(seed);
  const disabledResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledDraftPlanPersistenceError,
    ok: false,
  });
  assertNoSupabaseTouched(disabledMock, "disabled persistence");
  assertNoLeaks(disabledResult, "disabled response should stay safe");

  for (const [label, request] of [
    [
      "anonymous GET",
      new Request("http://localhost/api/admin-monthly-billing-draft-plans"),
    ],
    [
      "customer referer GET",
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        headers: sessionHeaders({ referer: "http://localhost/book" }),
      }),
    ],
    [
      "driver referer GET",
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        headers: sessionHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "wrong token POST",
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        body: JSON.stringify(validSavePayload),
        headers: sessionHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
        method: "POST",
      }),
    ],
  ]) {
    setEnv(enabledEnv());

    const mock = installMockClient(seed);
    const result = await readRouteResponse(await route[request.method](request));

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
      new Request(
        "http://localhost/api/admin-monthly-billing-draft-plans?billing_month=2026-06&customer_account_search=acme&readiness_status=mixed&limit=1&page=1",
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.version, persistence.adminMonthlyBillingDraftPlanPersistenceVersion);
  assert.deepEqual(readResult.body.draft_plans, [seed.monthly_billing_draft_plans[0]]);
  assert.deepEqual(readResult.body.pagination, {
    has_next_page: false,
    has_previous_page: false,
    page: 1,
    page_count: 1,
    page_size: 1,
    total_plan_count: 1,
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
  assert.equal(readMock.client.selectHistory.length, 1);
  assert.equal(readMock.client.selectHistory[0].table, "monthly_billing_draft_plans");
  assert.equal(readMock.client.selectHistory[0].limit, 500);
  assertNoLeaks(readResult, "monthly billing draft planning read response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const saveMock = installMockClient(seed);
  const saveResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        body: JSON.stringify(validSavePayload),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(saveResult.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.equal(saveResult.body.draft_plan.customer_account, "Foundation Account");
  assert.equal(saveResult.body.draft_plan.billing_month, "2026-07");
  assert.equal(saveResult.body.draft_plan.actor_role, "dispatcher");
  assert.equal(saveMock.client.operations.length, 1);
  assert.deepEqual(saveMock.client.operations[0], {
    action: "upsert",
    options: {
      onConflict: "customer_account,billing_month",
    },
    payload: {
      ...validSavePayload,
      actor_label: "Monthly Billing Draft Plan Test Admin",
      actor_role: "dispatcher",
      source_surface: "admin_api",
      updated_at: saveMock.client.operations[0].payload.updated_at,
    },
    table: "monthly_billing_draft_plans",
  });
  assertNoLeaks(saveResult, "monthly billing draft planning save response should stay safe");

  setEnv(enabledEnv());

  const unsafePostMock = installMockClient(seed);
  const unsafePostResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        body: JSON.stringify({
          ...validSavePayload,
          payment_link: "https://unsafe.example",
        }),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(unsafePostResult.status, 400);
  assert.equal(unsafePostResult.body.ok, false);
  assertNoSupabaseTouched(unsafePostMock, "unsafe post");
  assertNoLeaks(unsafePostResult, "unsafe post response should stay safe");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    failures: {
      "select:monthly_billing_draft_plans": {
        code: "42501",
        message: `SQL stack with ${serviceRoleSentinel} should not leak`,
      },
    },
  });
  const failureResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-billing-draft-plans", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin monthly billing draft planning load failed safely.",
    ok: false,
  });
  assert.equal(failureMock.createdClients.length, 1);
  assert.equal(failureMock.client.operations.length, 0);
  assertNoLeaks(failureResult, "database failure response should stay sanitized");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyBillingDraftPlanApiMock;
  await harness.cleanup();
}

console.log("Admin monthly billing draft plan API contract tests passed.");
