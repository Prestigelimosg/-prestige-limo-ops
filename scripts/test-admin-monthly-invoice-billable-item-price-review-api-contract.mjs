import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledPriceReviewPersistenceError =
  "Admin monthly invoice billable item price review persistence is not enabled on this server.";
const lockedMonthlyInvoiceDraftError =
  "Admin monthly invoice draft is locked for invoice issue and cannot be changed safely.";
const serverSessionToken = "mock-monthly-invoice-billable-price-review-admin-session-token";
const serviceRoleSentinel =
  "SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_BILLABLE_PRICE_REVIEW_SENTINEL";
const supabaseUrlSentinel = "https://monthly-invoice-billable-price-review-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_MONTHLY_INVOICE_BILLABLE_PRICE_REVIEW_SENTINEL|mock-monthly-invoice-billable-price-review-admin-session-token|monthly-invoice-billable-price-review-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafePriceReviewLeakPattern =
  /contact_phone|contact_email|passenger|driver_payout|paynow|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification_delivery|whatsapp|telegram|sms_send|email_send|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|driver_job_link|token/i;
const sourceFiles = [
  "lib/admin-monthly-invoice-draft-lock-enforcement.ts",
  "lib/admin-monthly-invoice-billable-item-price-review-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-monthly-invoice-billable-item-price-reviews/route.ts",
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
      "  const mock = globalThis.__prestigeMonthlyInvoiceBillablePriceReviewApiMock;",
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
    path.join(os.tmpdir(), "prestige-monthly-invoice-billable-price-review-api-"),
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
      "lib/admin-monthly-invoice-billable-item-price-review-persistence.js",
    )),
    route: require(path.join(
      tempDir,
      "app/api/admin-monthly-invoice-billable-item-price-reviews/route.js",
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
      monthly_invoice_billable_item_price_reviews: [],
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

    const updatedRows = [];

    this.tables[table] = this.tables[table].map((row) => {
      const matches = filters.every((filter) => row[filter.column] === filter.value);

      if (!matches) {
        return row;
      }

      const updated = {
        ...row,
        ...clone(payload),
      };

      updatedRows.push(updated);

      return updated;
    });

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
        row.item_review_id === payload.item_review_id &&
        row.billing_item_type === payload.billing_item_type,
    );
    const now = "2026-06-10T00:00:00.000Z";
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

  globalThis.__prestigeMonthlyInvoiceBillablePriceReviewApiMock = mock;

  return mock;
}

function enabledEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Monthly Invoice Billable Price Review Test Admin",
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
  assert.doesNotMatch(text, unsafePriceReviewLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked write`);
  assert.equal(mock.client.selectHistory.length, 0, `${label}: expected no mocked read`);
}

const draftId = "00000000-0000-4000-8000-000000000001";
const draftTripLinkId = "00000000-0000-4000-8000-000000000101";
const itemReviewId = "00000000-0000-4000-8000-000000000201";
const priceReviewId = "00000000-0000-4000-8000-000000000301";
const dspItemReviewId = "00000000-0000-4000-8000-000000000202";
const seed = {
  monthly_invoice_billable_item_price_reviews: [
    {
      actor_label: "Seed Admin",
      actor_role: "admin",
      billing_item_type: "base_trip",
      booking_reference: "SAFE-MNG-001",
      booking_type: "MNG",
      calculation_basis: "fixed_trip",
      created_at: "2026-06-10T00:00:00.000Z",
      currency: "SGD",
      draft_id: draftId,
      draft_trip_link_id: draftTripLinkId,
      dsp_billable_minutes: null,
      dsp_total_minutes: null,
      id: priceReviewId,
      item_review_id: itemReviewId,
      price_decision: "include_in_invoice",
      price_review_status: "approved_for_invoice_draft",
      reviewed_customer_amount_cents: 12500,
      safe_price_review_context: {
        next_action: "Continue draft issue review.",
        price_review_summary: "MNG reviewed.",
      },
      safe_price_review_note: "Safe reviewed amount note.",
      source_price_context: {
        booking_type: "MNG",
        source: "monthly_invoice_draft_item_review",
      },
      source_surface: "admin_api",
      updated_at: "2026-06-10T00:00:00.000Z",
    },
  ],
};
const validFixedPayload = {
  billing_item_type: "base_trip",
  booking_reference: "SAFE-TRF-777",
  booking_type: "TRF",
  calculation_basis: "fixed_trip",
  currency: "SGD",
  draft_id: draftId,
  draft_trip_link_id: draftTripLinkId,
  item_review_id: "00000000-0000-4000-8000-000000000777",
  next_action: "Ready for invoice issue review.",
  price_decision: "include_in_invoice",
  price_review_status: "approved_for_invoice_draft",
  price_review_summary: "Transfer price reviewed by admin.",
  reviewed_customer_amount_cents: 9800,
  safe_price_review_note: "Safe admin-reviewed transfer amount.",
  source_price_context: {
    booking_type: "TRF",
    source: "monthly_invoice_draft_item_review",
  },
};
const validDspPayload = {
  ...validFixedPayload,
  booking_reference: "SAFE-DSP-777",
  booking_type: "DSP",
  calculation_basis: "dsp_actual_time",
  dsp_billable_minutes: 180,
  dsp_total_minutes: 195,
  item_review_id: dspItemReviewId,
  price_review_summary: "DSP actual time reviewed by admin.",
  reviewed_customer_amount_cents: 22000,
  source_price_context: {
    booking_type: "DSP",
    dsp_billable_minutes: 180,
    dsp_total_minutes: 195,
    source: "driver_status_evidence",
  },
};

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(
    persistence.adminMonthlyInvoiceBillableItemPriceReviewVersion,
    "stage-monthly-invoice-billable-item-price-review-api-v1",
  );
  assert.deepEqual(persistence.parseAdminMonthlyInvoiceBillableItemPriceReviewLoadParams({}), {
    data: {
      billing_item_type: null,
      booking_reference: null,
      booking_type: null,
      draft_id: null,
      draft_trip_link_id: null,
      item_review_id: null,
      limit: 25,
      page: 1,
      price_decision: null,
      price_review_id: null,
      price_review_status: null,
    },
    ok: true,
  });

  for (const booking_type of ["MNG", "DEP", "TRF", "arrival", "departure", "transfer"]) {
    const parsed = persistence.parseAdminMonthlyInvoiceBillableItemPriceReviewSavePayload({
      ...validFixedPayload,
      booking_reference: `SAFE-${booking_type}-001`,
      booking_type,
      item_review_id:
        booking_type === "MNG"
          ? itemReviewId
          : `00000000-0000-4000-8000-00000000${String(booking_type.length).padStart(4, "0")}`,
    });

    assert.equal(parsed.ok, true, `${booking_type}: expected fixed-trip price review accepted`);
    assert.equal(parsed.data.calculation_basis, "fixed_trip");
  }

  const parsedDsp = persistence.parseAdminMonthlyInvoiceBillableItemPriceReviewSavePayload(
    validDspPayload,
  );

  assert.equal(parsedDsp.ok, true, "Expected DSP actual-time price review accepted");
  assert.equal(parsedDsp.data.calculation_basis, "dsp_actual_time");

  for (const [label, params, expectedError] of [
    [
      "bad review id",
      { price_review_id: "not-a-uuid" },
      "Malformed monthly invoice billable item price review id rejected.",
    ],
    [
      "bad booking type",
      { booking_type: "payment" },
      "Malformed monthly invoice billable item price review booking type rejected.",
    ],
    [
      "bad status",
      { price_review_status: "invoice_sent" },
      "Malformed monthly invoice billable item price review status rejected.",
    ],
    [
      "bad decision",
      { price_decision: "paid" },
      "Malformed monthly invoice billable item price decision rejected.",
    ],
    ["bad limit", { limit: "999" }, "Malformed monthly invoice billable item price review limit rejected."],
    ["bad page", { page: "0" }, "Malformed monthly invoice billable item price review page rejected."],
  ]) {
    const parsed = persistence.parseAdminMonthlyInvoiceBillableItemPriceReviewLoadParams(params);

    assert.equal(parsed.ok, false, `${label}: expected rejected parser result`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: parser response should stay safe`);
  }

  for (const [label, payload, expectedError] of [
    [
      "unsafe field",
      {
        ...validFixedPayload,
        payment_link: "https://example.invalid/pay",
      },
      "Admin monthly invoice billable item price review details include unsupported or unsafe fields.",
    ],
    [
      "unsafe source context",
      {
        ...validFixedPayload,
        source_price_context: {
          driver_payout: 100,
        },
      },
      "Admin monthly invoice billable item price review details include unsupported or unsafe fields.",
    ],
    [
      "include without amount",
      {
        ...validFixedPayload,
        reviewed_customer_amount_cents: null,
      },
      "Including a billable item requires a reviewed customer amount.",
    ],
    [
      "non DSP actual time",
      {
        ...validFixedPayload,
        calculation_basis: "dsp_actual_time",
      },
      "DSP actual-time price review is allowed only for DSP/hourly bookings.",
    ],
    [
      "non DSP minutes",
      {
        ...validFixedPayload,
        dsp_total_minutes: 30,
      },
      "Non-DSP billable item price review must not include DSP actual minutes.",
    ],
    [
      "DSP billable exceeds total",
      {
        ...validDspPayload,
        dsp_billable_minutes: 200,
        dsp_total_minutes: 120,
      },
      "DSP billable minutes must not exceed saved actual minutes.",
    ],
    [
      "approved not included",
      {
        ...validFixedPayload,
        price_decision: "hold_for_review",
      },
      "Approved billable item price review must be included in invoice draft.",
    ],
  ]) {
    const parsed = persistence.parseAdminMonthlyInvoiceBillableItemPriceReviewSavePayload(payload);

    assert.equal(parsed.ok, false, `${label}: expected rejected save payload`);
    assert.equal(parsed.status, 400);
    assert.equal(parsed.error, expectedError);
    assertNoLeaks(parsed, `${label}: save parser response should stay safe`);
  }

  let mock = installMockClient(seed);
  setEnv(disabledEnv());

  const blockedGet = await readRouteResponse(
    await route.GET(
      new Request("http://localhost/api/admin-monthly-invoice-billable-item-price-reviews"),
    ),
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
      new Request("http://localhost/api/admin-monthly-invoice-billable-item-price-reviews", {
        headers: sessionHeaders(),
      }),
    ),
  );

  assert.equal(disabledGet.status, 503);
  assert.equal(disabledGet.body.error, disabledPriceReviewPersistenceError);
  assertNoLeaks(disabledGet.body, "disabled route response should stay safe");
  assertNoSupabaseTouched(mock, "disabled GET");

  mock = installMockClient(seed);
  setEnv(enabledEnv());

  const readResult = await readRouteResponse(
    await route.GET(
      new Request(
        `http://localhost/api/admin-monthly-invoice-billable-item-price-reviews?draft_id=${draftId}&booking_type=MNG&price_review_status=approved_for_invoice_draft&price_decision=include_in_invoice&limit=1&page=1`,
        {
          headers: sessionHeaders(),
        },
      ),
    ),
  );

  assert.equal(readResult.status, 200);
  assert.equal(readResult.body.ok, true);
  assert.equal(readResult.body.price_reviews.length, 1);
  assert.equal(readResult.body.price_reviews[0].booking_reference, "SAFE-MNG-001");
  assert.equal(readResult.body.price_reviews[0].booking_type, "MNG");
  assert.equal(readResult.body.price_reviews[0].reviewed_customer_amount_cents, 12500);
  assert.equal(readResult.body.pagination.total_price_review_count, 1);
  assert.equal(mock.createdClients.length, 1);
  assert.equal(mock.client.selectHistory.length, 1);
  assert.equal(mock.client.selectHistory[0].table, "monthly_invoice_billable_item_price_reviews");
  assertNoLeaks(readResult.body, "enabled read response should stay safe");

  const fixedSaveResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-billable-item-price-reviews", {
        body: JSON.stringify(validFixedPayload),
        headers: sessionHeaders({
          "Content-Type": "application/json",
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(fixedSaveResult.status, 200);
  assert.equal(fixedSaveResult.body.ok, true);
  assert.equal(fixedSaveResult.body.price_review.booking_reference, "SAFE-TRF-777");
  assert.equal(fixedSaveResult.body.price_review.booking_type, "TRF");
  assert.equal(fixedSaveResult.body.price_review.calculation_basis, "fixed_trip");
  assert.equal(mock.client.operations.at(-1).action, "upsert");
  assert.equal(
    mock.client.operations.at(-1).options.onConflict,
    "item_review_id,billing_item_type",
  );
  assertNoLeaks(fixedSaveResult.body, "enabled fixed-trip save response should stay safe");

  const dspSaveResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-billable-item-price-reviews", {
        body: JSON.stringify(validDspPayload),
        headers: sessionHeaders({
          "Content-Type": "application/json",
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(dspSaveResult.status, 200);
  assert.equal(dspSaveResult.body.ok, true);
  assert.equal(dspSaveResult.body.price_review.booking_type, "DSP");
  assert.equal(dspSaveResult.body.price_review.calculation_basis, "dsp_actual_time");
  assert.equal(dspSaveResult.body.price_review.dsp_total_minutes, 195);
  assert.equal(dspSaveResult.body.price_review.dsp_billable_minutes, 180);
  assertNoLeaks(dspSaveResult.body, "enabled DSP save response should stay safe");

  const lockedSaveMock = installMockClient({
    monthly_invoice_issue_records: [
      {
        draft_id: draftId,
        draft_lock_status: "locked_for_issue",
        id: "00000000-0000-4000-8000-000000009997",
        invoice_number_status: "not_generated",
        issue_record_status: "draft_locked",
      },
    ],
  });
  const lockedSaveResult = await readRouteResponse(
    await route.POST(
      new Request("http://localhost/api/admin-monthly-invoice-billable-item-price-reviews", {
        body: JSON.stringify(validFixedPayload),
        headers: sessionHeaders({
          "Content-Type": "application/json",
        }),
        method: "POST",
      }),
    ),
  );

  assert.equal(lockedSaveResult.status, 409);
  assert.deepEqual(lockedSaveResult.body, {
    error: lockedMonthlyInvoiceDraftError,
    ok: false,
  });
  assert.equal(lockedSaveMock.client.operations.length, 0);
  assert.equal(lockedSaveMock.client.selectHistory.length, 1);
  assert.equal(lockedSaveMock.client.selectHistory[0].table, "monthly_invoice_issue_records");
  assertNoLeaks(lockedSaveResult.body, "locked price review save response should stay safe");

  mock = installMockClient(seed);
  const patchResult = await readRouteResponse(
    await route.PATCH(
      new Request("http://localhost/api/admin-monthly-invoice-billable-item-price-reviews", {
        body: JSON.stringify({
          ...validFixedPayload,
          price_decision: "needs_manager_review",
          price_review_id: priceReviewId,
          price_review_status: "blocked",
          reviewed_customer_amount_cents: 11000,
          safe_price_review_note: "Safe manager review note.",
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
  assert.equal(patchResult.body.price_review.id, priceReviewId);
  assert.equal(patchResult.body.price_review.price_review_status, "blocked");
  assert.equal(mock.client.operations.at(-1).action, "update");
  assert.deepEqual(mock.client.operations.at(-1).filters, [
    {
      column: "id",
      type: "eq",
      value: priceReviewId,
    },
  ]);
  assertNoLeaks(patchResult.body, "enabled update response should stay safe");
} finally {
  restoreEnv();
  delete globalThis.__prestigeMonthlyInvoiceBillablePriceReviewApiMock;
  await harness.cleanup();
}

console.log("Admin monthly invoice billable item price review API contract tests passed.");
