import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledIssueReviewPersistenceError =
  "Admin monthly invoice issue review persistence is not enabled on this server.";
const serverSessionToken = "mock-monthly-invoice-issue-review-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_ISSUE_REVIEW_SENTINEL";
const supabaseUrlSentinel = "https://monthly-invoice-issue-review-contract.supabase.co";
const draftId = "11111111-1111-4111-8111-111111111111";
const secondDraftId = "22222222-2222-4222-8222-222222222222";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_ISSUE_REVIEW_SENTINEL|mock-monthly-invoice-issue-review-admin-session-token|monthly-invoice-issue-review-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeIssueReviewLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice_number|final_invoice|issued_invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-monthly-invoice-draft-lock-enforcement.ts",
  "lib/admin-monthly-invoice-issue-review-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-issue-reviews/route.ts",
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

function validEnv(overrides = {}) {
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly invoice issue review contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

function validHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...extra,
  };
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
      "  const mock = globalThis.__prestigeMonthlyInvoiceIssueReviewApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked monthly invoice issue review Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-invoice-issue-review-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-issue-review-persistence.js",
    )),
    route: require(path.join(tempDir, "app/api/admin-monthly-invoice-issue-reviews/route.js")),
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
    return this.client.execute({
      filters: this.filters,
      operation: this.operation || "select",
      options: this.options,
      payload: this.payload,
      resultLimit: this.resultLimit,
      resultMode: this.resultMode,
      selectedColumns: this.selectedColumns,
      table: this.table,
    });
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      monthly_invoice_issue_reviews: [],
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

  applyFilters(rows, filters) {
    return rows.filter((row) =>
      filters.every((filter) => {
        if (filter.type === "eq") {
          return row[filter.column] === filter.value;
        }

        return false;
      }),
    );
  }

  execute(query) {
    const failure = this.failureFor(query.operation, query.table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    if (query.operation === "select") {
      this.selectHistory.push(clone(query));

      let rows = this.applyFilters(this.tables[query.table], query.filters);

      if (Number.isInteger(query.resultLimit)) {
        rows = rows.slice(0, query.resultLimit);
      }

      return {
        data: rows.map((row) => clone(row)),
        error: null,
      };
    }

    if (query.operation === "upsert") {
      this.operations.push(clone(query));

      const payload = clone(query.payload);
      const conflictColumn = query.options?.onConflict || "draft_id";
      const existingIndex = this.tables[query.table].findIndex(
        (row) => row[conflictColumn] === payload[conflictColumn],
      );
      const nextRow = {
        actor_label: "Contract admin",
        actor_role: "admin",
        created_at: "2026-06-08T00:00:00.000Z",
        id: existingIndex >= 0 ? this.tables[query.table][existingIndex].id : "issue-review-created-id",
        source_surface: "admin_api",
        ...this.tables[query.table][existingIndex],
        ...payload,
        updated_at: payload.updated_at || "2026-06-08T00:00:00.000Z",
      };

      if (existingIndex >= 0) {
        this.tables[query.table][existingIndex] = nextRow;
      } else {
        this.tables[query.table].push(nextRow);
      }

      return {
        data: clone(nextRow),
        error: null,
      };
    }

    if (query.operation === "update") {
      this.operations.push(clone(query));

      const rows = this.applyFilters(this.tables[query.table], query.filters);

      for (const row of rows) {
        Object.assign(row, clone(query.payload));
      }

      return {
        data: clone(rows[0] || null),
        error: rows.length > 0 ? null : { code: "PGRST116", message: "No rows updated" },
      };
    }

    this.operations.push(clone(query));

    return {
      data: null,
      error: { message: `Unsupported operation ${query.operation}` },
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeMonthlyInvoiceIssueReviewApiMock = mock;

  return mock;
}

async function callJson(handler, request) {
  const response = await handler(request);

  return {
    body: await response.json(),
    response,
  };
}

function assertNoLeaks(value, label) {
  const serialized = JSON.stringify(value);

  assert.equal(safeApiLeakPattern.test(serialized), false, `${label} leaked server internals.`);
  assert.equal(
    unsafeIssueReviewLeakPattern.test(serialized),
    false,
    `${label} leaked invoice/payment/payout/notification/customer/driver/private fields.`,
  );
}

function seedRows() {
  return {
    monthly_invoice_issue_reviews: [
      {
        actor_label: "Contract admin",
        actor_role: "admin",
        billing_month: "2026-07",
        blocked_count: 0,
        created_at: "2026-06-08T00:00:00.000Z",
        customer_account: "Foundation Account",
        draft_id: draftId,
        draft_status_snapshot: "manager_approved",
        id: "issue-review-one",
        issue_review_status: "ready_for_future_issue",
        ready_count: 2,
        readiness_status: "ready",
        safe_issue_context: {
          issue_summary: "Safe issue review summary",
          next_action: "Prepare future issue approval",
          review_status: "Reviewed",
        },
        safe_issue_note: "Safe issue review note.",
        source_draft_summary: {
          source: "monthly_invoice_draft",
          total_count: 2,
        },
        source_surface: "admin_api",
        total_count: 2,
        updated_at: "2026-06-08T00:00:00.000Z",
      },
      {
        actor_label: "Contract admin",
        actor_role: "dispatcher",
        billing_month: "2026-08",
        blocked_count: 1,
        created_at: "2026-06-08T00:00:00.000Z",
        customer_account: "Other Account",
        draft_id: secondDraftId,
        draft_status_snapshot: "pending_admin_review",
        id: "issue-review-two",
        issue_review_status: "blocked",
        ready_count: 1,
        readiness_status: "mixed",
        safe_issue_context: {
          next_action: "Resolve blocked trip",
        },
        safe_issue_note: "Safe blocked issue review note.",
        source_draft_summary: {
          source: "monthly_invoice_draft",
          total_count: 2,
        },
        source_surface: "admin_api",
        total_count: 2,
        updated_at: "2026-06-08T00:00:00.000Z",
      },
    ],
  };
}

const validCreatePayload = {
  billing_month: "2026-07",
  blocked_count: 0,
  customer_account: "Foundation Account",
  draft_id: draftId,
  draft_status_snapshot: "manager_approved",
  issue_review_status: "ready_for_future_issue",
  issue_summary: "Safe issue review summary",
  next_action: "Prepare future issue approval",
  ready_count: 2,
  readiness_status: "ready",
  review_status: "Reviewed",
  safe_issue_note: "Safe issue review note.",
  source_draft_summary: {
    draft_status: "manager_approved",
    source: "monthly_invoice_draft",
    total_count: 2,
  },
  total_count: 2,
};
const lockedMonthlyInvoiceDraftError =
  "Admin monthly invoice draft is locked for invoice issue and cannot be changed safely.";

const sourceText = await Promise.all(
  sourceFiles.map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const joinedSourceText = sourceText.join("\n");
const issueReviewSourceText = await Promise.all(
  [
    "lib/admin-monthly-invoice-issue-review-persistence.ts",
    "app/api/admin-monthly-invoice-issue-reviews/route.ts",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assert.equal(
  /\.delete\s*\(/.test(issueReviewSourceText.join("\n")),
  false,
  "Monthly invoice issue review API must not delete rows.",
);
assert.equal(
  /invoice_number|final_invoice|payment_link|pdf_url|driver_payout|payout_amount/.test(
    joinedSourceText.match(/invoiceIssueReviewSelect\s*=\s*([^;]+)/)?.[1] || "",
  ),
  false,
  "Monthly invoice issue review select must not include invoice/payment/PDF/payout fields.",
);

const harness = await loadHarness();

try {
  assert.deepEqual(harness.persistence.parseAdminMonthlyInvoiceIssueReviewLoadParams({}), {
    data: {
      billing_month: null,
      customer_account_search: null,
      draft_id: null,
      issue_review_status: null,
      limit: 25,
      page: 1,
      readiness_status: null,
    },
    ok: true,
  });
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueReviewLoadParams({
      invoice_number: "PLO-2026-0001",
    }).status,
    400,
    "Unsafe read params should be rejected.",
  );
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueReviewLoadParams({
      billing_month: "2026-13",
    }).status,
    400,
    "Invalid billing month should be rejected.",
  );
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueReviewCreatePayload(validCreatePayload).ok,
    true,
    "Expected valid issue review payload to parse.",
  );
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueReviewCreatePayload({
      ...validCreatePayload,
      invoice_number: "PLO-2026-0001",
    }).status,
    400,
    "Unsafe create fields should be rejected.",
  );
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueReviewCreatePayload({
      ...validCreatePayload,
      total_count: 99,
    }).status,
    400,
    "Mismatched counts should be rejected.",
  );
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueReviewUpdatePayload({
      draft_id: draftId,
      issue_review_status: "manager_reviewed",
    }).ok,
    true,
    "Expected valid issue review update to parse.",
  );

  setEnv({});
  delete globalThis.__prestigeMonthlyInvoiceIssueReviewApiMock;
  const publicBlocked = await callJson(
    harness.route.GET,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews"),
  );
  assert.equal(publicBlocked.response.status, 403, "Anonymous route access should be blocked.");
  assert.equal(publicBlocked.body.error, routeBlockedMessage);
  assertNoLeaks(publicBlocked, "anonymous blocked route");

  const disabledResult = await callJson(
    harness.route.GET,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      headers: {
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
    }),
  );
  assert.equal(disabledResult.response.status, 503, "Default-off persistence should be disabled.");
  assert.equal(disabledResult.body.error, disabledIssueReviewPersistenceError);
  assertNoLeaks(disabledResult, "disabled route");

  validEnv();
  installMockClient(seedRows());
  for (const [label, request] of [
    [
      "wrong purpose",
      new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
        headers: validHeaders({ "x-prestige-admin-purpose": "customer-booking-status-read" }),
      }),
    ],
    [
      "customer referer",
      new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
        headers: validHeaders({ referer: "http://localhost/my-bookings" }),
      }),
    ],
    [
      "driver referer",
      new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
        headers: validHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "wrong token",
      new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
        headers: validHeaders({ "x-prestige-admin-session-token": "wrong-token" }),
      }),
    ],
  ]) {
    const blocked = await callJson(harness.route.GET, request);

    assert.equal(blocked.response.status, 403, `${label} should be blocked.`);
    assert.equal(blocked.body.error, routeBlockedMessage, `${label} should use safe blocked message.`);
    assertNoLeaks(blocked, `${label} blocked response`);
  }

  validEnv();
  const readMock = installMockClient(seedRows());
  const readResult = await callJson(
    harness.route.GET,
    new Request(
      "http://localhost/api/admin-monthly-invoice-issue-reviews?billing_month=2026-07&customer_account_search=Foundation&readiness_status=ready&limit=1&page=1",
      {
        headers: validHeaders(),
      },
    ),
  );
  assert.equal(readResult.response.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.issue_reviews.length, 1);
  assert.equal(readResult.body.issue_reviews[0].draft_id, draftId);
  assert.equal(readResult.body.issue_reviews[0].issue_review_status, "ready_for_future_issue");
  assert.equal(readResult.body.pagination.total_review_count, 1);
  assert.equal(readMock.createdClients.length, 1, "Expected one server-only Supabase client.");
  assert.equal(readMock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(readMock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(readMock.client.operations.length, 0, "GET must not write.");
  assert.equal(readMock.client.selectHistory[0].table, "monthly_invoice_issue_reviews");
  assertNoLeaks(readResult, "monthly invoice issue review read response");

  validEnv();
  const saveMock = installMockClient({ monthly_invoice_issue_reviews: [] });
  const saveResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      body: JSON.stringify(validCreatePayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(saveResult.response.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.equal(saveResult.body.issue_review.draft_id, draftId);
  assert.equal(saveResult.body.issue_review.issue_review_status, "ready_for_future_issue");
  assert.equal(saveMock.client.operations.length, 1);
  assert.equal(saveMock.client.operations[0].operation, "upsert");
  assert.equal(saveMock.client.operations[0].table, "monthly_invoice_issue_reviews");
  assert.equal(saveMock.client.operations[0].options.onConflict, "draft_id");
  assertNoLeaks(saveResult, "monthly invoice issue review save response");

  validEnv();
  const lockedCreateMock = installMockClient({
    monthly_invoice_issue_records: [
      {
        draft_id: draftId,
        draft_lock_status: "locked_for_issue",
        id: "00000000-0000-4000-8000-000000009995",
        invoice_number_status: "not_generated",
        issue_record_status: "draft_locked",
      },
    ],
  });
  const lockedCreateResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      body: JSON.stringify(validCreatePayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(lockedCreateResult.response.status, 409);
  assert.deepEqual(lockedCreateResult.body, {
    error: lockedMonthlyInvoiceDraftError,
    ok: false,
  });
  assert.equal(lockedCreateMock.client.operations.length, 0);
  assert.equal(lockedCreateMock.client.selectHistory.length, 1);
  assert.equal(lockedCreateMock.client.selectHistory[0].table, "monthly_invoice_issue_records");
  assertNoLeaks(lockedCreateResult, "locked monthly invoice issue review create response");

  const unsafeSaveResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      body: JSON.stringify({
        ...validCreatePayload,
        safe_issue_note: "Create payment link and PDF.",
      }),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(unsafeSaveResult.response.status, 400);
  assertNoLeaks(unsafeSaveResult, "unsafe save response");

  validEnv();
  const updateMock = installMockClient(seedRows());
  const updateResult = await callJson(
    harness.route.PATCH,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      body: JSON.stringify({
        draft_id: draftId,
        issue_review_status: "manager_reviewed",
        safe_issue_context: {
          next_action: "Hold for future approved issue activation",
        },
      }),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "PATCH",
    }),
  );
  assert.equal(updateResult.response.status, 200);
  assert.equal(updateResult.body.issue_review.issue_review_status, "manager_reviewed");
  assert.equal(updateMock.client.operations[0].operation, "update");
  assert.deepEqual(updateMock.client.operations[0].filters, [
    {
      column: "draft_id",
      type: "eq",
      value: draftId,
    },
  ]);
  assertNoLeaks(updateResult, "monthly invoice issue review update response");

  validEnv();
  const lockedUpdateMock = installMockClient({
    monthly_invoice_issue_records: [
      {
        draft_id: draftId,
        draft_lock_status: "locked_for_issue",
        id: "00000000-0000-4000-8000-000000009994",
        invoice_number_status: "not_generated",
        issue_record_status: "draft_locked",
      },
    ],
  });
  const lockedUpdateResult = await callJson(
    harness.route.PATCH,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      body: JSON.stringify({
        draft_id: draftId,
        issue_review_status: "manager_reviewed",
        safe_issue_context: {
          next_action: "Hold for future approved issue activation",
        },
      }),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "PATCH",
    }),
  );
  assert.equal(lockedUpdateResult.response.status, 409);
  assert.deepEqual(lockedUpdateResult.body, {
    error: lockedMonthlyInvoiceDraftError,
    ok: false,
  });
  assert.equal(lockedUpdateMock.client.operations.length, 0);
  assert.equal(lockedUpdateMock.client.selectHistory.length, 1);
  assert.equal(lockedUpdateMock.client.selectHistory[0].table, "monthly_invoice_issue_records");
  assertNoLeaks(lockedUpdateResult, "locked monthly invoice issue review update response");

  validEnv();
  installMockClient(seedRows(), {
    failures: {
      "select:monthly_invoice_issue_reviews": {
        code: "42501",
        message: "row level security",
      },
    },
  });
  const rlsResult = await callJson(
    harness.route.GET,
    new Request("http://localhost/api/admin-monthly-invoice-issue-reviews", {
      headers: validHeaders(),
    }),
  );
  assert.equal(rlsResult.response.status, 500);
  assert.equal(rlsResult.body.error, "Admin monthly invoice issue review load failed safely.");
  assertNoLeaks(rlsResult, "RLS safe failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyInvoiceIssueReviewApiMock;
  await harness.cleanup();
}

console.log("Admin monthly invoice issue review API contract tests passed.");
