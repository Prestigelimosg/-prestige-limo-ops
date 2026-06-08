import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledInvoiceDraftPersistenceError =
  "Admin monthly invoice draft persistence is not enabled on this server.";
const serverSessionToken = "mock-monthly-invoice-draft-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_DRAFT_SENTINEL";
const supabaseUrlSentinel = "https://monthly-invoice-draft-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_DRAFT_SENTINEL|mock-monthly-invoice-draft-admin-session-token|monthly-invoice-draft-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeInvoiceDraftLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice_number|final_invoice|issued_invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-app-notification-events.ts",
  "lib/admin-app-notification-persistence.ts",
  "lib/admin-monthly-invoice-draft-lock-enforcement.ts",
  "lib/admin-monthly-invoice-draft-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-drafts/route.ts",
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
      "  const mock = globalThis.__prestigeMonthlyInvoiceDraftApiMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-invoice-draft-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-draft-persistence.js",
    )),
    route: require(path.join(tempDir, "app/api/admin-monthly-invoice-drafts/route.js")),
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

  delete() {
    this.operation = "delete";

    return this;
  }

  eq(column, value) {
    this.filters.push({
      column,
      type: "eq",
      value,
    });

    return this;
  }

  in(column, values) {
    this.filters.push({
      column,
      type: "in",
      values,
    });

    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  select(columns) {
    if (!this.operation) {
      this.operation = "select";
    }

    this.selectedColumns = columns;

    return this;
  }

  single() {
    this.resultMode = "single";

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  upsert(payload, options) {
    this.operation = "upsert";
    this.options = options;
    this.payload = payload;

    return this;
  }

  execute() {
    if (this.operation === "delete") {
      return this.client.deleteRows(this.table, this.filters);
    }

    if (this.operation === "insert") {
      return this.client.insertRows(this.table, this.payload, this.resultMode);
    }

    if (this.operation === "update") {
      return this.client.updateRows(this.table, this.payload, this.filters, this.resultMode);
    }

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
      admin_app_notification_outbox: [],
      monthly_invoice_draft_trip_links: [],
      monthly_invoice_drafts: [],
      monthly_invoice_issue_records: [],
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

  filterRows(table, filters) {
    return this.tables[table].filter((row) =>
      filters.every((filter) => {
        if (filter.type === "in") {
          return filter.values.includes(row[filter.column]);
        }

        return row[filter.column] === filter.value;
      }),
    );
  }

  recordOperation(action, table, payload, options = null, filters = []) {
    this.operations.push({
      action,
      filters: clone(filters),
      options: clone(options),
      payload: clone(payload),
      table,
    });
  }

  deleteRows(table, filters) {
    const failure = this.failureFor("delete", table);

    this.recordOperation("delete", table, null, null, filters);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.tables[table];
    const keepRows = rows.filter(
      (row) =>
        !filters.every((filter) =>
          filter.type === "in"
            ? filter.values.includes(row[filter.column])
            : row[filter.column] === filter.value,
        ),
    );

    this.tables[table] = keepRows;

    return {
      data: null,
      error: null,
    };
  }

  insertRows(table, payload, resultMode) {
    const failure = this.failureFor("insert", table);

    this.recordOperation("insert", table, payload);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    const now = "2026-06-07T00:00:00.000Z";
    const inserted = rows.map((row, index) => ({
      created_at: now,
      id: `00000000-0000-4000-8000-00000000${String(this.tables[table].length + index + 101).padStart(4, "0")}`,
      ...clone(row),
      updated_at: row.updated_at || now,
    }));

    this.tables[table].push(...inserted);

    return {
      data: resultMode === "single" ? clone(inserted[0] || null) : inserted.map((row) => clone(row)),
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

    const rows = this.filterRows(table, filters).slice(0, resultLimit || undefined);

    return {
      data: resultMode === "single" ? clone(rows[0] || null) : rows.map((row) => clone(row)),
      error: null,
    };
  }

  updateRows(table, payload, filters, resultMode) {
    const failure = this.failureFor("update", table);

    this.recordOperation("update", table, payload, null, filters);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.tables[table];
    const updatedRows = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      const matches = filters.every((filter) =>
        filter.type === "in"
          ? filter.values.includes(row[filter.column])
          : row[filter.column] === filter.value,
      );

      if (matches) {
        rows[index] = {
          ...row,
          ...clone(payload),
        };
        updatedRows.push(rows[index]);
      }
    }

    return {
      data: resultMode === "single" ? clone(updatedRows[0] || null) : updatedRows.map((row) => clone(row)),
      error: null,
    };
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
            id: `00000000-0000-4000-8000-00000000${String(rows.length + 1).padStart(4, "0")}`,
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
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeMonthlyInvoiceDraftApiMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly Invoice Draft Test Admin",
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
  assert.doesNotMatch(text, unsafeInvoiceDraftLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const draftId = "00000000-0000-4000-8000-000000000001";
const secondDraftId = "00000000-0000-4000-8000-000000000002";
const seed = {
  monthly_invoice_draft_trip_links: [
    {
      billing_prep_readiness: "ready",
      booking_reference: "SAFE-JOB-001",
      closeout_id: "00000000-0000-4000-8000-000000000201",
      closeout_status: "closed",
      created_at: "2026-06-07T00:00:00.000Z",
      draft_id: draftId,
      id: "00000000-0000-4000-8000-000000000101",
      safe_trip_context: {
        next_action: "Ready for draft review.",
      },
      trip_readiness_status: "ready",
      updated_at: "2026-06-07T00:00:00.000Z",
    },
  ],
  monthly_invoice_drafts: [
    {
      actor_label: "Seed Admin",
      actor_role: "admin",
      billing_month: "2026-06",
      blocked_count: 1,
      created_at: "2026-06-07T00:00:00.000Z",
      customer_account: "Acme Corporate",
      customer_id: "customer-acme",
      draft_status: "pending_admin_review",
      id: draftId,
      ready_count: 2,
      readiness_status: "mixed",
      safe_draft_note: "Safe draft note.",
      safe_draft_context: {
        draft_summary: "Two ready trips and one blocked trip.",
        next_action: "Resolve blocked trip before manager review.",
      },
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
      draft_status: "draft_planning",
      id: secondDraftId,
      ready_count: 1,
      readiness_status: "ready",
      safe_draft_note: null,
      safe_draft_context: {
        draft_summary: "One ready trip.",
        next_action: "Review draft.",
      },
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

const validCreatePayload = {
  billing_month: "2026-07",
  blocked_count: 0,
  customer_account: "Foundation Account",
  customer_id: "customer-foundation",
  draft_status: "draft_planning",
  linked_trips: [
    {
      billing_prep_readiness: "ready",
      booking_reference: "SAFE-JOB-777",
      closeout_id: "00000000-0000-4000-8000-000000000777",
      closeout_status: "closed",
      safe_trip_context: {
        next_action: "Ready for draft review.",
      },
      trip_readiness_status: "ready",
    },
  ],
  ready_count: 4,
  readiness_status: "ready",
  safe_draft_note: "Safe monthly invoice draft note.",
  safe_draft_context: {
    draft_summary: "Four saved trips are ready for invoice draft review.",
    next_action: "Review this account in the future draft batch.",
    review_status: "Draft pending admin review.",
  },
  source_grouping_summary: {
    blocked_count: 0,
    ready_count: 4,
    total_count: 4,
  },
  total_count: 4,
};
const lockedDraftId = "00000000-0000-4000-8000-000000000999";
const lockedMonthlyInvoiceDraftError =
  "Admin monthly invoice draft is locked for invoice issue and cannot be changed safely.";
const lockedDraftSeed = {
  monthly_invoice_drafts: [
    {
      billing_month: validCreatePayload.billing_month,
      customer_account: validCreatePayload.customer_account,
      id: lockedDraftId,
    },
  ],
  monthly_invoice_issue_records: [
    {
      draft_id: lockedDraftId,
      draft_lock_status: "locked_for_issue",
      id: "00000000-0000-4000-8000-000000009999",
      invoice_number_status: "not_generated",
      issue_record_status: "draft_locked",
    },
  ],
};

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(
    persistence.adminMonthlyInvoiceDraftPersistenceVersion,
    "stage-4a-monthly-invoice-draft-api-v1",
  );
  assert.deepEqual(persistence.parseAdminMonthlyInvoiceDraftLoadParams({}), {
    data: {
      billing_month: null,
      customer_account_search: null,
      draft_id: null,
      draft_status: null,
      limit: 25,
      page: 1,
      readiness_status: null,
    },
    ok: true,
  });
  assert.equal(
    persistence.parseAdminMonthlyInvoiceDraftCreatePayload(validCreatePayload).ok,
    true,
    "Expected valid safe invoice draft payload",
  );

  for (const [label, params, expectedError] of [
    ["bad draft id", { draft_id: "not-a-uuid" }, "Malformed monthly invoice draft id rejected."],
    [
      "bad month",
      { billing_month: "2026-13" },
      "Malformed monthly invoice draft billing_month rejected.",
    ],
    [
      "bad search",
      { customer_account_search: "payment_link" },
      "Malformed monthly invoice draft customer/account search rejected.",
    ],
    [
      "bad draft status",
      { draft_status: "issued" },
      "Malformed monthly invoice draft status rejected.",
    ],
    [
      "bad readiness",
      { readiness_status: "paid" },
      "Malformed monthly invoice draft readiness_status rejected.",
    ],
    ["bad limit", { limit: "999" }, "Malformed monthly invoice draft limit rejected."],
    ["bad page", { page: "0" }, "Malformed monthly invoice draft page rejected."],
  ]) {
    const parsed = persistence.parseAdminMonthlyInvoiceDraftLoadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  for (const [label, payload] of [
    [
      "unknown final invoice field",
      {
        ...validCreatePayload,
        invoice_number: "INV-001",
      },
    ],
    [
      "unsafe note",
      {
        ...validCreatePayload,
        safe_draft_note: "Create payment link",
      },
    ],
    [
      "bad count",
      {
        ...validCreatePayload,
        total_count: 99,
      },
    ],
    [
      "unsafe linked trip",
      {
        ...validCreatePayload,
        linked_trips: [
          {
            ...validCreatePayload.linked_trips[0],
            customer_price: 100,
          },
        ],
      },
    ],
  ]) {
    const parsed = persistence.parseAdminMonthlyInvoiceDraftCreatePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected create payload`);
    assert.equal(parsed.status, 400);
    assertNoLeaks(parsed, `${label}: create parser response should stay safe`);
  }

  assert.equal(
    persistence.parseAdminMonthlyInvoiceDraftUpdatePayload({
      draft_id: draftId,
      draft_status: "admin_reviewed",
      review_status: "Admin reviewed.",
    }).ok,
    true,
    "Expected valid status update payload",
  );
  assert.equal(
    persistence.parseAdminMonthlyInvoiceDraftUpdatePayload({
      draft_id: draftId,
      draft_status: "paid",
    }).ok,
    false,
    "Expected final/payment-style status to be rejected",
  );

  setEnv(disabledEnv());

  const disabledMock = installMockClient(seed);
  const disabledResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(disabledResult.status, 503);
  assert.deepEqual(disabledResult.body, {
    error: disabledInvoiceDraftPersistenceError,
    ok: false,
  });
  assertNoSupabaseTouched(disabledMock, "disabled persistence");
  assertNoLeaks(disabledResult, "disabled response should stay safe");

  for (const [label, request] of [
    [
      "anonymous GET",
      new Request("http://localhost/api/admin-monthly-invoice-drafts"),
    ],
    [
      "customer referer GET",
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        headers: sessionHeaders({ referer: "http://localhost/book" }),
      }),
    ],
    [
      "driver referer GET",
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        headers: sessionHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "wrong token POST",
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify(validCreatePayload),
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
        "http://localhost/api/admin-monthly-invoice-drafts?billing_month=2026-06&customer_account_search=acme&readiness_status=mixed&limit=1&page=1",
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.version, persistence.adminMonthlyInvoiceDraftPersistenceVersion);
  assert.equal(readResult.body.invoice_drafts.length, 1);
  assert.equal(readResult.body.invoice_drafts[0].customer_account, "Acme Corporate");
  assert.equal(readResult.body.invoice_drafts[0].linked_trips.length, 1);
  assert.deepEqual(readResult.body.pagination, {
    has_next_page: false,
    has_previous_page: false,
    page: 1,
    page_count: 1,
    page_size: 1,
    total_draft_count: 1,
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
  assert.equal(readMock.client.selectHistory[0].table, "monthly_invoice_drafts");
  assert.equal(readMock.client.selectHistory[0].limit, 500);
  assert.equal(readMock.client.selectHistory[1].table, "monthly_invoice_draft_trip_links");
  assertNoLeaks(readResult, "monthly invoice draft read response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const saveMock = installMockClient(seed);
  const saveResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify(validCreatePayload),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(saveResult.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.equal(saveResult.body.invoice_draft.customer_account, "Foundation Account");
  assert.equal(saveResult.body.invoice_draft.billing_month, "2026-07");
  assert.equal(saveResult.body.invoice_draft.actor_role, "dispatcher");
  assert.equal(saveResult.body.invoice_draft.linked_trips.length, 1);
  assert.deepEqual(saveResult.body.outbox_event, {
    delivery_surface: "admin_app",
    external_send: false,
    status: "created",
  });
  assert.equal(saveMock.client.operations.length, 4);
  assert.equal(saveMock.client.operations[0].action, "upsert");
  assert.equal(saveMock.client.operations[0].table, "monthly_invoice_drafts");
  assert.deepEqual(saveMock.client.operations[0].options, {
    onConflict: "customer_account,billing_month",
  });
  assert.equal(saveMock.client.operations[1].action, "delete");
  assert.equal(saveMock.client.operations[1].table, "monthly_invoice_draft_trip_links");
  assert.equal(saveMock.client.operations[2].action, "insert");
  assert.equal(saveMock.client.operations[2].table, "monthly_invoice_draft_trip_links");
  assert.equal(saveMock.client.operations[3].action, "insert");
  assert.equal(saveMock.client.operations[3].table, "admin_app_notification_outbox");
  assert.equal(saveMock.client.operations[3].payload.notification_type, "monthly_billing");
  assert.equal(saveMock.client.operations[3].payload.notification_status, "queued");
  assert.equal(saveMock.client.operations[3].payload.delivery_surface, "admin_app");
  assert.equal(saveMock.client.operations[3].payload.workflow_area, "monthly_billing_draft_prep");
  assert.equal(saveMock.client.operations[3].payload.safe_title, "Monthly billing draft prep saved");
  assert.equal(
    saveMock.client.operations[3].payload.safe_message,
    "Admin monthly billing draft prep was saved from grouped completed trip data.",
  );
  assert.equal(saveMock.client.operations[3].payload.safe_context.billing_month, "2026-07");
  assert.equal(saveMock.client.operations[3].payload.safe_context.ready_count, 4);
  assert.equal(saveMock.client.operations[3].payload.safe_context.blocked_count, 0);
  assert.match(
    saveMock.client.operations[3].payload.event_key,
    /^monthly-billing-draft-prep-00000000-0000-4000-8000-000000000003-2026-07-\d+$/,
  );
  assertNoLeaks(saveResult, "monthly invoice draft save response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const lockedCreateMock = installMockClient(lockedDraftSeed);
  const lockedCreateResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify(validCreatePayload),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(lockedCreateResult.status, 409);
  assert.deepEqual(lockedCreateResult.body, {
    error: lockedMonthlyInvoiceDraftError,
    ok: false,
  });
  assert.equal(lockedCreateMock.client.operations.length, 0);
  assert.equal(lockedCreateMock.client.selectHistory.length, 2);
  assert.equal(lockedCreateMock.client.selectHistory[0].table, "monthly_invoice_drafts");
  assert.equal(lockedCreateMock.client.selectHistory[1].table, "monthly_invoice_issue_records");
  assertNoLeaks(lockedCreateResult, "locked monthly invoice draft create response should stay safe");

  setEnv(enabledEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "dispatcher" }));

  const failedOutboxMock = installMockClient(seed, {
    failures: {
      "insert:admin_app_notification_outbox": {
        code: "42501",
        message: `Outbox insert denied with ${serviceRoleSentinel} should not leak`,
      },
    },
  });
  const failedOutboxResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify(validCreatePayload),
        headers: sessionHeaders(),
        method: "POST",
      }),
    ),
  );

  assert.equal(failedOutboxResult.status, 200);
  assert.equal(failedOutboxResult.body.ok, true);
  assert.equal(failedOutboxResult.body.invoice_draft.customer_account, "Foundation Account");
  assert.deepEqual(failedOutboxResult.body.outbox_event, {
    delivery_surface: "admin_app",
    external_send: false,
    status: "failed_safely",
  });
  assert.equal(failedOutboxMock.client.operations.length, 4);
  assert.equal(failedOutboxMock.client.operations[3].action, "insert");
  assert.equal(failedOutboxMock.client.operations[3].table, "admin_app_notification_outbox");
  assertNoLeaks(failedOutboxResult, "monthly invoice draft failed outbox response should stay safe");

  setEnv(enabledEnv());

  const updateMock = installMockClient(seed);
  const updateResult = await readRouteResponse(
    await route.PATCH(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify({
          draft_id: draftId,
          draft_status: "admin_reviewed",
          review_status: "Admin reviewed.",
        }),
        headers: sessionHeaders(),
        method: "PATCH",
      }),
    ),
  );

  assert.equal(updateResult.status, 200);
  assert.equal(updateResult.body.ok, true);
  assert.equal(updateResult.body.invoice_draft.draft_status, "admin_reviewed");
  assert.equal(updateResult.body.invoice_draft.linked_trips.length, 1);
  assert.equal(updateMock.client.operations.length, 1);
  assert.equal(updateMock.client.operations[0].action, "update");
  assert.equal(updateMock.client.operations[0].table, "monthly_invoice_drafts");
  assert.deepEqual(updateMock.client.operations[0].filters, [
    {
      column: "id",
      type: "eq",
      value: draftId,
    },
  ]);
  assert.equal(updateMock.client.selectHistory.length, 2);
  assert.equal(updateMock.client.selectHistory[0].table, "monthly_invoice_issue_records");
  assert.equal(updateMock.client.selectHistory[1].table, "monthly_invoice_draft_trip_links");
  assertNoLeaks(updateResult, "monthly invoice draft update response should stay safe");

  setEnv(enabledEnv());

  const lockedUpdateMock = installMockClient({
    monthly_invoice_issue_records: [
      {
        draft_id: draftId,
        draft_lock_status: "locked_for_issue",
        id: "00000000-0000-4000-8000-000000009998",
        invoice_number_status: "not_generated",
        issue_record_status: "draft_locked",
      },
    ],
  });
  const lockedUpdateResult = await readRouteResponse(
    await route.PATCH(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify({
          draft_id: draftId,
          draft_status: "admin_reviewed",
          review_status: "Admin reviewed.",
        }),
        headers: sessionHeaders(),
        method: "PATCH",
      }),
    ),
  );

  assert.equal(lockedUpdateResult.status, 409);
  assert.deepEqual(lockedUpdateResult.body, {
    error: lockedMonthlyInvoiceDraftError,
    ok: false,
  });
  assert.equal(lockedUpdateMock.client.operations.length, 0);
  assert.equal(lockedUpdateMock.client.selectHistory.length, 1);
  assert.equal(lockedUpdateMock.client.selectHistory[0].table, "monthly_invoice_issue_records");
  assertNoLeaks(lockedUpdateResult, "locked monthly invoice draft update response should stay safe");

  setEnv(enabledEnv());

  const unsafePostMock = installMockClient(seed);
  const unsafePostResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        body: JSON.stringify({
          ...validCreatePayload,
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
      "select:monthly_invoice_drafts": {
        code: "42501",
        message: `SQL stack with ${serviceRoleSentinel} should not leak`,
      },
    },
  });
  const failureResult = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-invoice-drafts", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.deepEqual(failureResult.body, {
    error: "Admin monthly invoice draft load failed safely.",
    ok: false,
  });
  assert.equal(failureMock.createdClients.length, 1);
  assert.equal(failureMock.client.operations.length, 0);
  assertNoLeaks(failureResult, "database failure response should stay sanitized");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyInvoiceDraftApiMock;
  await harness.cleanup();
}

console.log("Admin monthly invoice draft API contract tests passed.");
