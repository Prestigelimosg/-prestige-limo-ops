import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledIssueRecordPersistenceError =
  "Admin monthly invoice issue record persistence is not enabled on this server.";
const serverSessionToken = "mock-monthly-invoice-issue-record-admin-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_ISSUE_RECORD_SENTINEL";
const supabaseUrlSentinel = "https://monthly-invoice-issue-record-contract.supabase.co";
const issueRecordId = "33333333-3333-4333-8333-333333333333";
const issueReviewId = "11111111-1111-4111-8111-111111111111";
const secondIssueReviewId = "44444444-4444-4444-8444-444444444444";
const draftId = "22222222-2222-4222-8222-222222222222";
const secondDraftId = "55555555-5555-4555-8555-555555555555";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_ISSUE_RECORD_SENTINEL|mock-monthly-invoice-issue-record-admin-session-token|monthly-invoice-issue-record-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeIssueRecordLeakPattern =
  /contact_phone|contact_email|passenger|customer_price|quoted_price|rate_amount|driver_payout|paynow|payment_link|pdf_url|pdf_link|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-monthly-invoice-issue-record-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-issue-records/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly invoice issue record contract admin",
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
      "  const mock = globalThis.__prestigeMonthlyInvoiceIssueRecordApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked monthly invoice issue record Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-monthly-invoice-issue-record-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(
      tempDir,
      "lib/admin-monthly-invoice-issue-record-persistence.js",
    )),
    route: require(path.join(tempDir, "app/api/admin-monthly-invoice-issue-records/route.js")),
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
      const conflictColumn = query.options?.onConflict || "issue_review_id";
      const existingIndex = this.tables[query.table].findIndex(
        (row) => row[conflictColumn] === payload[conflictColumn],
      );
      const nextRow = {
        actor_label: "Contract admin",
        actor_role: "admin",
        created_at: "2026-06-08T00:00:00.000Z",
        id: existingIndex >= 0 ? this.tables[query.table][existingIndex].id : "issue-record-created-id",
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

  globalThis.__prestigeMonthlyInvoiceIssueRecordApiMock = mock;

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
    unsafeIssueRecordLeakPattern.test(serialized),
    false,
    `${label} leaked customer/driver/PDF-link/payment-link/payout/private fields.`,
  );
}

function seedRows() {
  return {
    monthly_invoice_issue_records: [
      {
        actor_label: "Contract admin",
        actor_role: "admin",
        billing_month: "2026-07",
        created_at: "2026-06-08T00:00:00.000Z",
        customer_account: "Foundation Account",
        draft_id: draftId,
        draft_lock_status: "locked_for_issue",
        id: issueRecordId,
        invoice_delivery_status: "sent_manually",
        invoice_number: "PLO-202607-0001",
        invoice_number_status: "reserved",
        issue_record_status: "unpaid",
        issue_review_id: issueReviewId,
        payment_record_status: "unpaid",
        pdf_generation_status: "generated_not_sent",
        safe_issue_record_context: {
          issue_summary: "Safe invoice issue record summary",
          next_action: "Confirm manual payment status",
        },
        safe_issue_record_note: "Safe issue record note.",
        source_issue_review_summary: {
          source: "monthly_invoice_issue_review",
          status: "ready_for_future_issue",
        },
        source_surface: "admin_api",
        updated_at: "2026-06-08T00:00:00.000Z",
      },
      {
        actor_label: "Contract admin",
        actor_role: "dispatcher",
        billing_month: "2026-08",
        created_at: "2026-06-08T00:00:00.000Z",
        customer_account: "Other Account",
        draft_id: secondDraftId,
        draft_lock_status: "lock_blocked",
        id: "issue-record-two",
        invoice_delivery_status: "not_sent",
        invoice_number: null,
        invoice_number_status: "reservation_blocked",
        issue_record_status: "blocked",
        issue_review_id: secondIssueReviewId,
        payment_record_status: "manual_review",
        pdf_generation_status: "generation_blocked",
        safe_issue_record_context: {
          next_action: "Resolve blocked issue record",
        },
        safe_issue_record_note: "Safe blocked issue record note.",
        source_issue_review_summary: {
          source: "monthly_invoice_issue_review",
          status: "blocked",
        },
        source_surface: "admin_api",
        updated_at: "2026-06-08T00:00:00.000Z",
      },
    ],
  };
}

const validCreatePayload = {
  billing_month: "2026-07",
  customer_account: "Foundation Account",
  draft_id: draftId,
  draft_lock_status: "locked_for_issue",
  invoice_delivery_status: "not_sent",
  invoice_number: null,
  invoice_number_status: "not_reserved",
  issue_record_status: "draft_locked",
  issue_review_id: issueReviewId,
  issue_summary: "Safe invoice issue record summary",
  lock_status: "Draft locked for issue review",
  next_action: "Reserve invoice number after admin approval",
  payment_record_status: "not_recorded",
  pdf_generation_status: "not_requested",
  safe_issue_record_note: "Safe invoice issue record note.",
  source_issue_review_summary: {
    draft_status: "manager_approved",
    source: "monthly_invoice_issue_review",
  },
};

const validPaidPayload = {
  ...validCreatePayload,
  invoice_delivery_status: "sent_manually",
  invoice_number: "PLO-202607-0002",
  invoice_number_status: "reserved",
  issue_record_status: "paid",
  payment_record_status: "paid",
  pdf_generation_status: "generated_not_sent",
};
const validBlockedUpdatePayload = {
  ...validCreatePayload,
  draft_lock_status: "lock_blocked",
  issue_record_status: "blocked",
  lock_status: "Issue record blocked for invoice sequence review",
  next_action: "Resolve the invoice issue record before reservation.",
  safe_issue_record_note: "Safe blocked issue record note.",
};

const sourceText = await Promise.all(
  sourceFiles.map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const joinedSourceText = sourceText.join("\n");
const issueRecordSourceText = await Promise.all(
  [
    "lib/admin-monthly-invoice-issue-record-persistence.ts",
    "app/api/admin-monthly-invoice-issue-records/route.ts",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assert.equal(
  /\.delete\s*\(/.test(issueRecordSourceText.join("\n")),
  false,
  "Monthly invoice issue record API must not delete rows.",
);
assert.equal(
  /payment_link|pdf_url|pdf_link|driver_payout|payout_amount|paynow|stripe/i.test(
    joinedSourceText.match(/invoiceIssueRecordSelect\s*=\s*([^;]+)/)?.[1] || "",
  ),
  false,
  "Monthly invoice issue record select must not include unsafe payment/PDF/payout fields.",
);

const harness = await loadHarness();

try {
  assert.deepEqual(harness.persistence.parseAdminMonthlyInvoiceIssueRecordLoadParams({}), {
    data: {
      billing_month: null,
      customer_account_search: null,
      draft_id: null,
      invoice_delivery_status: null,
      invoice_number_status: null,
      issue_record_id: null,
      issue_record_status: null,
      issue_review_id: null,
      limit: 25,
      page: 1,
      payment_record_status: null,
      pdf_generation_status: null,
    },
    ok: true,
  });
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueRecordCreatePayload(validCreatePayload).ok,
    true,
    "Expected safe draft-lock issue record payload to parse.",
  );
  assert.equal(
    harness.persistence.parseAdminMonthlyInvoiceIssueRecordCreatePayload(validPaidPayload).ok,
    false,
    "Expected manual invoice number payload to be rejected by sequence-only guard.",
  );

  for (const [label, params] of [
    ["bad issue record id", { issue_record_id: "not-a-uuid" }],
    ["bad month", { billing_month: "2026-13" }],
    ["bad issue status", { issue_record_status: "auto_charge" }],
    ["bad invoice status", { invoice_number_status: "payment_link" }],
    ["bad pdf status", { pdf_generation_status: "pdf_url" }],
    ["bad delivery status", { invoice_delivery_status: "auto_sent" }],
    ["bad payment status", { payment_record_status: "stripe_paid" }],
    ["bad limit", { limit: "999" }],
    ["bad page", { page: "0" }],
  ]) {
    const parsed = harness.persistence.parseAdminMonthlyInvoiceIssueRecordLoadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  for (const [label, payload] of [
    [
      "unsafe payment link",
      {
        ...validCreatePayload,
        payment_link: "https://example.invalid/pay",
      },
    ],
    [
      "unsafe note",
      {
        ...validCreatePayload,
        safe_issue_record_note: "Create payment link.",
      },
    ],
    [
      "numbered status missing invoice number",
      {
        ...validCreatePayload,
        issue_record_status: "invoice_number_reserved",
      },
    ],
    [
      "manual invoice number without reserved status",
      {
        ...validCreatePayload,
        invoice_number: "PLO-202607-0003",
      },
    ],
    [
      "paid before manual send",
      {
        ...validCreatePayload,
        invoice_number: "PLO-202607-0004",
        invoice_number_status: "reserved",
        issue_record_status: "paid",
        payment_record_status: "paid",
      },
    ],
  ]) {
    const parsed = harness.persistence.parseAdminMonthlyInvoiceIssueRecordCreatePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected create payload`);
    assert.equal(parsed.status, 400);
    assertNoLeaks(parsed, `${label}: create parser response should stay safe`);
  }

  setEnv({});
  delete globalThis.__prestigeMonthlyInvoiceIssueRecordApiMock;
  const publicBlocked = await callJson(
    harness.route.GET,
    new Request("http://localhost/api/admin-monthly-invoice-issue-records"),
  );
  assert.equal(publicBlocked.response.status, 403, "Anonymous route access should be blocked.");
  assert.equal(publicBlocked.body.error, routeBlockedMessage);
  assertNoLeaks(publicBlocked, "anonymous blocked route");

  const disabledMock = installMockClient(seedRows());
  const disabledResult = await callJson(
    harness.route.GET,
    new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
      headers: {
        referer: "http://localhost/",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      },
    }),
  );
  assert.equal(disabledResult.response.status, 503, "Default-off persistence should be disabled.");
  assert.equal(disabledResult.body.error, disabledIssueRecordPersistenceError);
  assert.equal(disabledMock.createdClients.length, 0, "Disabled request must not create client.");
  assert.equal(disabledMock.client.operations.length, 0, "Disabled request must not write.");
  assertNoLeaks(disabledResult, "disabled route");

  validEnv();
  installMockClient(seedRows());
  for (const [label, request] of [
    [
      "wrong purpose",
      new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
        headers: validHeaders({ "x-prestige-admin-purpose": "customer-booking-status-read" }),
      }),
    ],
    [
      "customer referer",
      new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
        headers: validHeaders({ referer: "http://localhost/my-bookings" }),
      }),
    ],
    [
      "driver referer",
      new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
        headers: validHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "wrong token",
      new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
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
      "http://localhost/api/admin-monthly-invoice-issue-records?billing_month=2026-07&customer_account_search=Foundation&issue_record_status=unpaid&invoice_number_status=reserved&pdf_generation_status=generated_not_sent&invoice_delivery_status=sent_manually&payment_record_status=unpaid&limit=1&page=1",
      {
        headers: validHeaders(),
      },
    ),
  );
  assert.equal(readResult.response.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.issue_records.length, 1);
  assert.equal(readResult.body.issue_records[0].issue_review_id, issueReviewId);
  assert.equal(readResult.body.issue_records[0].invoice_number, "PLO-202607-0001");
  assert.equal(readResult.body.pagination.total_record_count, 1);
  assert.equal(readMock.createdClients.length, 1, "Expected one server-only Supabase client.");
  assert.equal(readMock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(readMock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(readMock.client.operations.length, 0, "GET must not write.");
  assert.equal(readMock.client.selectHistory[0].table, "monthly_invoice_issue_records");
  assertNoLeaks(readResult, "monthly invoice issue record read response");

  validEnv();
  const saveMock = installMockClient({ monthly_invoice_issue_records: [] });
  const saveResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
      body: JSON.stringify(validCreatePayload),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "POST",
    }),
  );
  assert.equal(saveResult.response.status, 200);
  assert.equal(saveResult.body.ok, true);
  assert.equal(saveResult.body.issue_record.issue_review_id, issueReviewId);
  assert.equal(saveResult.body.issue_record.issue_record_status, "draft_locked");
  assert.equal(saveMock.client.operations.length, 1);
  assert.equal(saveMock.client.operations[0].operation, "upsert");
  assert.equal(saveMock.client.operations[0].table, "monthly_invoice_issue_records");
  assert.equal(saveMock.client.operations[0].options.onConflict, "issue_review_id");
  assertNoLeaks(saveResult, "monthly invoice issue record save response");

  const unsafeSaveResult = await callJson(
    harness.route.POST,
    new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
      body: JSON.stringify({
        ...validCreatePayload,
        pdf_url: "https://example.invalid/invoice.pdf",
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
    new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
      body: JSON.stringify({
        ...validBlockedUpdatePayload,
        issue_record_id: issueRecordId,
      }),
      headers: validHeaders({ "content-type": "application/json" }),
      method: "PATCH",
    }),
  );
  assert.equal(updateResult.response.status, 200);
  assert.equal(updateResult.body.issue_record.issue_record_status, "blocked");
  assert.equal(updateMock.client.operations[0].operation, "update");
  assert.deepEqual(updateMock.client.operations[0].filters, [
    {
      column: "id",
      type: "eq",
      value: issueRecordId,
    },
  ]);
  assertNoLeaks(updateResult, "monthly invoice issue record update response");

  validEnv();
  installMockClient(seedRows(), {
    failures: {
      "select:monthly_invoice_issue_records": {
        code: "42501",
        message: "row level security",
      },
    },
  });
  const rlsResult = await callJson(
    harness.route.GET,
    new Request("http://localhost/api/admin-monthly-invoice-issue-records", {
      headers: validHeaders(),
    }),
  );
  assert.equal(rlsResult.response.status, 500);
  assert.equal(rlsResult.body.error, "Admin monthly invoice issue record load failed safely.");
  assertNoLeaks(rlsResult, "RLS safe failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyInvoiceIssueRecordApiMock;
  await harness.cleanup();
}

console.log("Admin monthly invoice issue record API contract tests passed.");
