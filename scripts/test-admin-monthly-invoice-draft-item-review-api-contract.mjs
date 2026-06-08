import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledItemReviewPersistenceError =
  "Admin monthly invoice draft item review persistence is not enabled on this server.";
const serverSessionToken = "mock-monthly-invoice-draft-item-review-admin-session-token";
const serviceRoleSentinel =
  "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_DRAFT_ITEM_REVIEW_SENTINEL";
const supabaseUrlSentinel = "https://monthly-invoice-draft-item-review-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_DRAFT_ITEM_REVIEW_SENTINEL|mock-monthly-invoice-draft-item-review-admin-session-token|monthly-invoice-draft-item-review-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeItemReviewLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice_number|final_invoice|issued_invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|driver_job_link|token/i;
const sourceFiles = [
  "lib/admin-monthly-invoice-draft-item-review-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-draft-item-reviews/route.ts",
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
      "  const mock = globalThis.__prestigeMonthlyInvoiceDraftItemReviewApiMock;",
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
  const tempDir = await mkdtemp(
    path.join(os.tmpdir(), "prestige-monthly-invoice-draft-item-review-api-"),
  );

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-draft-item-review-persistence.js",
    )),
    route: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-draft-item-reviews/route.js",
    )),
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

  eq(column, value) {
    this.filters.push({
      column,
      type: "eq",
      value,
    });

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
      monthly_invoice_draft_item_reviews: [],
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
      filters.every((filter) => row[filter.column] === filter.value),
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
      const matches = filters.every((filter) => row[filter.column] === filter.value);

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
        row.draft_id === payload.draft_id &&
        row.booking_reference === payload.booking_reference,
    );
    const now = "2026-06-08T00:00:00.000Z";
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

  globalThis.__prestigeMonthlyInvoiceDraftItemReviewApiMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly Invoice Draft Item Review Test Admin",
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
  assert.doesNotMatch(text, unsafeItemReviewLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const draftId = "00000000-0000-4000-8000-000000000001";
const draftTripLinkId = "00000000-0000-4000-8000-000000000101";
const itemReviewId = "00000000-0000-4000-8000-000000000201";
const seed = {
  monthly_invoice_draft_item_reviews: [
    {
      actor_label: "Seed Admin",
      actor_role: "admin",
      billing_item_decision: "include_in_draft",
      booking_reference: "SAFE-JOB-001",
      created_at: "2026-06-08T00:00:00.000Z",
      draft_id: draftId,
      draft_trip_link_id: draftTripLinkId,
      extra_charge_review_status: "none",
      id: itemReviewId,
      item_review_status: "reviewed",
      safe_item_review_context: {
        item_review_summary: "Saved item reviewed.",
        next_action: "Ready for issue review.",
      },
      safe_item_review_note: "Safe item review note.",
      source_surface: "admin_api",
      source_trip_summary: {
        booking_reference: "SAFE-JOB-001",
        source: "monthly_invoice_draft_trip_link",
      },
      trip_detail_review_status: "reviewed",
      updated_at: "2026-06-08T00:00:00.000Z",
    },
  ],
};
const validSavePayload = {
  billing_item_decision: "include_in_draft",
  booking_reference: "SAFE-JOB-777",
  draft_id: draftId,
  draft_trip_link_id: draftTripLinkId,
  extra_charge_review_status: "none",
  item_review_status: "reviewed",
  item_review_summary: "Saved draft item reviewed.",
  next_action: "Continue to issue review after remaining items.",
  review_status: "Reviewed by admin.",
  safe_item_review_note: "Safe invoice draft item review note.",
  source_trip_summary: {
    booking_reference: "SAFE-JOB-777",
    billing_prep_readiness: "ready",
    closeout_status: "closed",
    source: "monthly_invoice_draft_trip_link",
  },
  trip_detail_review_status: "reviewed",
};

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(
    persistence.adminMonthlyInvoiceDraftItemReviewPersistenceVersion,
    "stage-monthly-invoice-draft-item-review-api-v1",
  );
  assert.deepEqual(persistence.parseAdminMonthlyInvoiceDraftItemReviewLoadParams({}), {
    data: {
      billing_item_decision: null,
      booking_reference: null,
      draft_id: null,
      draft_trip_link_id: null,
      item_review_id: null,
      item_review_status: null,
      limit: 25,
      page: 1,
    },
    ok: true,
  });
  assert.equal(
    persistence.parseAdminMonthlyInvoiceDraftItemReviewSavePayload(validSavePayload).ok,
    true,
    "Expected valid safe item review payload",
  );

  for (const [label, params, expectedError] of [
    [
      "bad review id",
      { item_review_id: "not-a-uuid" },
      "Malformed monthly invoice draft item review id rejected.",
    ],
    [
      "bad draft id",
      { draft_id: "not-a-uuid" },
      "Malformed monthly invoice draft item review draft_id rejected.",
    ],
    [
      "bad trip link id",
      { draft_trip_link_id: "not-a-uuid" },
      "Malformed monthly invoice draft item review trip link id rejected.",
    ],
    [
      "bad booking reference",
      { booking_reference: "payment_link" },
      "Malformed monthly invoice draft item review booking reference rejected.",
    ],
    [
      "bad status",
      { item_review_status: "paid" },
      "Malformed monthly invoice draft item review status rejected.",
    ],
    [
      "bad decision",
      { billing_item_decision: "payment_link" },
      "Malformed monthly invoice draft item review decision rejected.",
    ],
    ["bad limit", { limit: "999" }, "Malformed monthly invoice draft item review limit rejected."],
    ["bad page", { page: "0" }, "Malformed monthly invoice draft item review page rejected."],
  ]) {
    const parsed = persistence.parseAdminMonthlyInvoiceDraftItemReviewLoadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  for (const [label, payload] of [
    [
      "unknown final invoice field",
      {
        ...validSavePayload,
        invoice_number: "INV-001",
      },
    ],
    [
      "unsafe note",
      {
        ...validSavePayload,
        safe_item_review_note: "Create payment link",
      },
    ],
    [
      "reviewed with blocked decision",
      {
        ...validSavePayload,
        billing_item_decision: "blocked",
      },
    ],
    [
      "unsafe source summary",
      {
        ...validSavePayload,
        source_trip_summary: {
          customer_price: 100,
        },
      },
    ],
  ]) {
    const parsed = persistence.parseAdminMonthlyInvoiceDraftItemReviewSavePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected save payload`);
    assert.equal(parsed.status, 400);
    assertNoLeaks(parsed, `${label}: save parser response should stay safe`);
  }

  let mock = installMockClient(seed);
  setEnv(disabledEnv());

  const blockedGet = await readRouteResponse(
    await route.GET(new Request("http://localhost/api/admin-monthly-invoice-draft-item-reviews")),
  );

  assert.equal(blockedGet.status, 403);
  assert.equal(blockedGet.body.error, routeBlockedMessage);
  assertNoLeaks(blockedGet.body, "blocked anonymous route response should stay safe");
  assertNoSupabaseTouched(mock, "blocked anonymous GET");

  mock = installMockClient(seed);
  setEnv({
    ...disabledEnv(),
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
  });

  const disabledGet = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-invoice-draft-item-reviews", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(disabledGet.status, 503);
  assert.equal(disabledGet.body.error, disabledItemReviewPersistenceError);
  assertNoLeaks(disabledGet.body, "disabled route response should stay safe");
  assertNoSupabaseTouched(mock, "disabled GET");

  mock = installMockClient(seed);
  setEnv(enabledEnv());

  const readResult = await readRouteResponse(
    await route.GET(
      new Request(
        `http://localhost/api/admin-monthly-invoice-draft-item-reviews?draft_id=${draftId}&item_review_status=reviewed&billing_item_decision=include_in_draft&limit=1&page=1`,
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.item_reviews.length, 1);
  assert.equal(readResult.body.item_reviews[0].booking_reference, "SAFE-JOB-001");
  assert.equal(readResult.body.item_reviews[0].item_review_status, "reviewed");
  assert.equal(readResult.body.pagination.total_item_review_count, 1);
  assert.equal(mock.createdClients.length, 1);
  assert.equal(mock.client.selectHistory.length, 1);
  assertNoLeaks(readResult.body, "enabled read response should stay safe");

  const saveResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-draft-item-reviews", {
        body: JSON.stringify(validSavePayload),
        headers: sessionHeaders({
          "Content-Type": "application/json",
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(saveResult.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.equal(saveResult.body.item_review.booking_reference, "SAFE-JOB-777");
  assert.equal(saveResult.body.item_review.item_review_status, "reviewed");
  assert.equal(mock.client.operations.at(-1).action, "upsert");
  assert.equal(
    mock.client.operations.at(-1).options.onConflict,
    "draft_id,booking_reference",
  );
  assertNoLeaks(saveResult.body, "enabled save response should stay safe");

  const patchResult = await readRouteResponse(
    await route.PATCH(
      new Request("http://localhost/api/admin-monthly-invoice-draft-item-reviews", {
        body: JSON.stringify({
          ...validSavePayload,
          item_review_id: itemReviewId,
          item_review_status: "blocked",
          billing_item_decision: "blocked",
          trip_detail_review_status: "blocked",
          extra_charge_review_status: "blocked",
          safe_item_review_note: "Safe blocked item review note.",
        }),
        headers: sessionHeaders({
          "Content-Type": "application/json",
        }),
        method: "PATCH",
      }),
    ),
  );

  assert.equal(patchResult.status, 200);
  assert.equal(patchResult.body.ok, true);
  assert.equal(patchResult.body.item_review.id, itemReviewId);
  assert.equal(patchResult.body.item_review.item_review_status, "blocked");
  assert.equal(mock.client.operations.at(-1).action, "update");
  assert.deepEqual(mock.client.operations.at(-1).filters, [
    {
      column: "id",
      type: "eq",
      value: itemReviewId,
    },
  ]);
  assertNoLeaks(patchResult.body, "enabled update response should stay safe");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyInvoiceDraftItemReviewApiMock;
  await harness.cleanup();
}

console.log("Admin monthly invoice draft item review API contract tests passed.");
