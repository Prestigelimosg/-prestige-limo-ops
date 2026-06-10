import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const customerAuthRequiredMessage =
  "Customer saved bookings read requires secure customer account access before saved bookings can be read.";
const sessionToken = "mock-customer-saved-bookings-session-token";
const authUserId = "33333333-3333-4333-8333-333333333333";
const customerAccountReference = "44444444-4444-4444-8444-444444444444";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_SAVED_BOOKINGS_SENTINEL";
const supabaseUrlSentinel = "https://customer-saved-bookings-contract.supabase.co";
const allowedSavedBookingFields = [
  "booking_month",
  "booking_reference",
  "created_at",
  "customer_facing_status",
  "dropoff_location",
  "passenger_name",
  "pickup_at",
  "pickup_location",
  "service_type",
  "updated_at",
];
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_SAVED_BOOKINGS_SENTINEL|mock-customer-saved-bookings-session-token|customer-saved-bookings-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const unsafeCustomerSavedBookingsLeakPattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|session_token|raw_token|token_hash|driver_token/i;
const sourceFiles = [
  "lib/customer-saved-bookings-read.ts",
  "lib/admin-booking-persistence.ts",
  "app/api/customer-saved-bookings/route.ts",
];
const originalEnv = {
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN,
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
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_ENABLED: "true",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_MODE: "server-session-token",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: authUserId,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: sessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

function validHeaders(extra = {}) {
  return {
    referer: "http://localhost/my-bookings",
    "x-prestige-customer-purpose": "customer-saved-bookings-read",
    "x-prestige-customer-session-token": sessionToken,
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
      "  const mock = globalThis.__prestigeCustomerSavedBookingsApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked customer saved bookings Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-saved-bookings-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    read: require(path.join(tempDir, "lib/customer-saved-bookings-read.js")),
    route: require(path.join(tempDir, "app/api/customer-saved-bookings/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.orderBy = null;
    this.rangeEnd = null;
    this.rangeStart = null;
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

  range(start, end) {
    this.rangeStart = start;
    this.rangeEnd = end;

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
    return this.client.selectRows({
      filters: this.filters,
      limit: this.resultLimit,
      orderBy: this.orderBy,
      rangeEnd: this.rangeEnd,
      rangeStart: this.rangeStart,
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
      bookings: [],
      customer_access_accounts: [],
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

  insert(payload) {
    this.operations.push({ action: "insert", payload });
    throw new Error("Customer saved bookings API contract forbids writes.");
  }

  update(payload) {
    this.operations.push({ action: "update", payload });
    throw new Error("Customer saved bookings API contract forbids writes.");
  }

  upsert(payload) {
    this.operations.push({ action: "upsert", payload });
    throw new Error("Customer saved bookings API contract forbids writes.");
  }

  delete() {
    this.operations.push({ action: "delete" });
    throw new Error("Customer saved bookings API contract forbids writes.");
  }

  selectRows(query) {
    const failure = this.failureFor("select", query.table);

    this.selectHistory.push(clone(query));

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    let rows = this.tables[query.table].filter((row) =>
      query.filters.every((filter) => row[filter.column] === filter.value),
    );

    if (query.orderBy) {
      const direction = query.orderBy.options?.ascending === false ? -1 : 1;

      rows = rows.sort(
        (first, second) =>
          String(first[query.orderBy.column] || "").localeCompare(String(second[query.orderBy.column] || "")) *
          direction,
      );
    }

    if (Number.isInteger(query.rangeStart) && Number.isInteger(query.rangeEnd)) {
      rows = rows.slice(query.rangeStart, query.rangeEnd + 1);
    } else if (Number.isInteger(query.limit)) {
      rows = rows.slice(0, query.limit);
    }

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

  globalThis.__prestigeCustomerSavedBookingsApiMock = mock;

  return mock;
}

async function json(response) {
  return response.json();
}

function assertSafeApiBody(body, label) {
  const serialized = JSON.stringify(body);

  assert.equal(safeApiLeakPattern.test(serialized), false, `${label} leaked server internals.`);
  assert.equal(
    unsafeCustomerSavedBookingsLeakPattern.test(serialized),
    false,
    `${label} leaked customer-private, admin, finance, payout, parser, token, or mock/archive fields.`,
  );
}

function assertAllowedSavedBookingShape(booking, label) {
  assert.deepEqual(
    Object.keys(booking).sort(),
    allowedSavedBookingFields,
    `${label}: saved booking record must expose only customer-safe fields.`,
  );
}

function seedSavedBookingRows() {
  return {
    bookings: [
      {
        admin_finance_note: "must not leak",
        admin_internal_status: "confirmed",
        booking_reference: "CUST-SAVED-001",
        contact_email: "must-not-return@example.com",
        contact_phone: "+6590000000",
        created_at: "2026-06-08T01:00:00.000Z",
        customer_facing_status: "confirmed",
        customer_id: customerAccountReference,
        customer_price: "9999",
        dropoff_location: "Raffles Singapore",
        driver_payout: "123",
        internal_admin_note: "VIP handling note",
        invoice_number: "INV-001",
        passenger_name: "Safe Passenger",
        passenger_phone: "+6591111111",
        paynow_payout_reference: "PNOW-001",
        pickup_at: "2026-06-08T09:00:00.000Z",
        pickup_location: "Changi Airport",
        service_type: "arrival",
        updated_at: "2026-06-08T01:30:00.000Z",
      },
      {
        booking_reference: "CUST-SAVED-002",
        customer_facing_status: "completed",
        customer_id: customerAccountReference,
        dropoff_location: "Fullerton Hotel",
        passenger_name: "Another Passenger",
        pickup_at: "2026-06-09T09:00:00.000Z",
        pickup_location: "Marina Bay Sands",
        service_type: "transfer",
        updated_at: "2026-06-08T01:10:00.000Z",
      },
      {
        booking_reference: "CUST-SAVED-003",
        customer_facing_status: "confirmed",
        customer_id: customerAccountReference,
        dropoff_location: "internal_admin_note holding room",
        passenger_name: "finance note passenger",
        pickup_at: "2026-06-10T09:00:00.000Z",
        pickup_location: "driver_payout office",
        service_type: "payment transfer",
        updated_at: "2026-06-08T01:20:00.000Z",
      },
      {
        booking_reference: "OTHER-CUSTOMER-001",
        customer_facing_status: "confirmed",
        customer_id: "55555555-5555-4555-8555-555555555555",
        dropoff_location: "Other dropoff",
        passenger_name: "Other Passenger",
        pickup_at: "2026-06-09T09:00:00.000Z",
        pickup_location: "Other pickup",
        service_type: "transfer",
        updated_at: "2026-06-08T02:10:00.000Z",
      },
    ],
    customer_access_accounts: [
      {
        account_status: "active",
        auth_user_id: authUserId,
        customer_account_reference: customerAccountReference,
        safe_display_label: "Safe customer account",
      },
      {
        account_status: "active",
        auth_user_id: "99999999-9999-4999-8999-999999999999",
        customer_account_reference: "55555555-5555-4555-8555-555555555555",
        safe_display_label: "Other customer account",
      },
    ],
  };
}

const sourceText = await Promise.all(
  sourceFiles.map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const joinedSourceText = sourceText.join("\n");
const readPathSourceText = await Promise.all(
  [
    "lib/customer-saved-bookings-read.ts",
    "app/api/customer-saved-bookings/route.ts",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);

assert.equal(
  /\.(?:insert|upsert|delete|update)\s*\(/.test(readPathSourceText.join("\n")),
  false,
  "Customer saved bookings read path must remain read-only.",
);
assert.equal(
  /admin_internal_status|contact_phone|contact_email|passenger_phone|customer_price|driver_payout|paynow|invoice|payment|payout|parser_source_reference/.test(
    joinedSourceText.match(/customerSavedBookingsSelect\s*=\s*([^;]+)/)?.[1] || "",
  ),
  false,
  "Customer saved bookings select must not include private customer/admin/finance/payout/parser columns.",
);

const harness = await loadHarness();

try {
  assert.deepEqual(
    harness.read.parseCustomerSavedBookingsReadParams(
      new URLSearchParams("booking_reference=CUST-SAVED-001"),
    ),
    {
      data: {
        booking_reference: "CUST-SAVED-001",
        limit: 10,
        page: 1,
      },
      ok: true,
    },
    "Expected safe saved bookings lookup params to parse.",
  );
  assert.equal(
    harness.read.parseCustomerSavedBookingsReadParams(
      new URLSearchParams("booking_reference=bad value"),
    ).status,
    400,
    "Malformed booking reference should be rejected.",
  );
  assert.equal(
    harness.read.parseCustomerSavedBookingsReadParams(
      new URLSearchParams("booking_reference=CUST-SAVED-001&admin_internal_status=confirmed"),
    ).status,
    400,
    "Unsafe query fields should be rejected.",
  );
  assert.equal(
    harness.read.parseCustomerSavedBookingsReadParams(
      new URLSearchParams("booking_reference=CUST-SAVED-001&limit=1000"),
    ).status,
    400,
    "Oversized limit should be rejected.",
  );

  setEnv({});
  delete globalThis.__prestigeCustomerSavedBookingsApiMock;
  const disabledResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
      headers: {
        referer: "http://localhost/my-bookings",
        "x-prestige-customer-purpose": "customer-saved-bookings-read",
      },
    }),
  );
  const disabledBody = await json(disabledResponse);
  assert.equal(disabledResponse.status, 403, "Default-off route should be blocked.");
  assert.equal(disabledBody.error, customerAuthRequiredMessage);
  assertSafeApiBody(disabledBody, "default-off route body");

  validEnv();
  installMockClient(seedSavedBookingRows());
  for (const [label, request] of [
    ["anonymous", new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001")],
    [
      "wrong purpose",
      new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
        headers: validHeaders({ "x-prestige-customer-purpose": "customer-booking-status-read" }),
      }),
    ],
    [
      "customer folder referer",
      new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
        headers: validHeaders({ referer: "http://localhost/customers" }),
      }),
    ],
    [
      "driver page referer",
      new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
        headers: validHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "wrong token",
      new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
        headers: validHeaders({ "x-prestige-customer-session-token": "wrong-token" }),
      }),
    ],
  ]) {
    const blockedResponse = await harness.route.GET(request);
    const blockedBody = await json(blockedResponse);

    assert.equal(blockedResponse.status, 403, `${label} should be blocked.`);
    assert.equal(blockedBody.error, customerAuthRequiredMessage, `${label} should use auth-required message.`);
    assertSafeApiBody(blockedBody, `${label} blocked body`);
  }

  validEnv();
  const routeMock = installMockClient(seedSavedBookingRows());
  const response = await harness.route.GET(
    new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
      headers: validHeaders(),
    }),
  );
  const body = await json(response);

  assert.equal(response.status, 200, "Expected route read to pass with guarded customer boundary.");
  assert.equal(body.ok, true);
  assert.equal(body.version, "stage-customer-saved-bookings-read-api-v1");
  assert.equal(body.saved_bookings.length, 1);
  assertAllowedSavedBookingShape(body.saved_bookings[0], "single booking response");
  assert.deepEqual(body.saved_bookings[0], {
    booking_month: "2026-06",
    booking_reference: "CUST-SAVED-001",
    created_at: "2026-06-08T01:00:00.000Z",
    customer_facing_status: "confirmed",
    dropoff_location: "Raffles Singapore",
    passenger_name: "Safe Passenger",
    pickup_at: "2026-06-08T09:00:00.000Z",
    pickup_location: "Changi Airport",
    service_type: "arrival",
    updated_at: "2026-06-08T01:30:00.000Z",
  });
  assert.equal(body.pagination.has_next_page, false);
  assertSafeApiBody(body, "route success body");
  assert.equal(routeMock.createdClients.length, 1, "Expected one server-only Supabase client.");
  assert.equal(routeMock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(routeMock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(routeMock.client.operations.length, 0, "Customer saved bookings read route must not write.");
  assert.deepEqual(routeMock.client.selectHistory[0].filters, [
    { column: "auth_user_id", value: authUserId },
    { column: "account_status", value: "active" },
  ]);
  assert.deepEqual(routeMock.client.selectHistory[1].filters, [
    { column: "customer_id", value: customerAccountReference },
    { column: "booking_reference", value: "CUST-SAVED-001" },
  ]);
  assert.deepEqual(routeMock.client.selectHistory[1].orderBy, {
    column: "pickup_at",
    options: { ascending: false },
  });
  assert.deepEqual(
    {
      rangeEnd: routeMock.client.selectHistory[1].rangeEnd,
      rangeStart: routeMock.client.selectHistory[1].rangeStart,
    },
    { rangeEnd: 10, rangeStart: 0 },
    "Expected compact one-extra-row range for has_next_page.",
  );
  assert.equal(
    /admin_internal_status|contact_phone|contact_email|passenger_phone|customer_price|driver_payout|paynow|invoice|payment|payout|parser_source_reference/.test(
      routeMock.client.selectHistory[1].selectedColumns,
    ),
    false,
    "Select columns should avoid private customer/admin/finance/payout/parser fields.",
  );

  validEnv();
  const pageMock = installMockClient(seedSavedBookingRows());
  const pageResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-saved-bookings?limit=1&page=1", {
      headers: validHeaders(),
    }),
  );
  const pageBody = await json(pageResponse);
  assert.equal(pageResponse.status, 200);
  assert.equal(pageBody.saved_bookings.length, 1);
  assert.equal(pageBody.pagination.has_next_page, true);
  assert.equal(pageMock.client.selectHistory[1].rangeEnd, 1);
  assertAllowedSavedBookingShape(pageBody.saved_bookings[0], "paged booking response");
  assertSafeApiBody(pageBody, "paged response body");

  validEnv();
  installMockClient(seedSavedBookingRows());
  const sanitizingResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-003", {
      headers: validHeaders(),
    }),
  );
  const sanitizingBody = await json(sanitizingResponse);
  assert.equal(sanitizingResponse.status, 200);
  assert.equal(sanitizingBody.saved_bookings.length, 1);
  assert.equal(sanitizingBody.saved_bookings[0].dropoff_location, null);
  assert.equal(sanitizingBody.saved_bookings[0].passenger_name, null);
  assert.equal(sanitizingBody.saved_bookings[0].pickup_location, null);
  assert.equal(sanitizingBody.saved_bookings[0].service_type, null);
  assertSafeApiBody(sanitizingBody, "sanitized unsafe field-value response");

  validEnv();
  installMockClient({ bookings: [], customer_access_accounts: [] });
  const emptyResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
      headers: validHeaders(),
    }),
  );
  const emptyBody = await json(emptyResponse);
  assert.equal(emptyResponse.status, 200);
  assert.equal(emptyBody.saved_bookings.length, 0);
  assertSafeApiBody(emptyBody, "empty customer account response");

  validEnv();
  installMockClient(seedSavedBookingRows(), {
    failures: {
      "select:bookings": { code: "42501", message: "row level security" },
    },
  });
  const failureResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-saved-bookings?booking_reference=CUST-SAVED-001", {
      headers: validHeaders(),
    }),
  );
  const failureBody = await json(failureResponse);
  assert.equal(failureResponse.status, 500);
  assert.equal(failureBody.error, "Customer saved bookings read failed safely.");
  assertSafeApiBody(failureBody, "safe failure body");

  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const blockedWriteResponse = await harness.route[method]();
    const blockedWriteBody = await json(blockedWriteResponse);
    assert.equal(blockedWriteResponse.status, 403, `${method} should stay blocked.`);
    assert.equal(blockedWriteBody.error, customerAuthRequiredMessage);
    assertSafeApiBody(blockedWriteBody, `${method} blocked body`);
  }
} finally {
  restoreEnv();
  delete globalThis.__prestigeCustomerSavedBookingsApiMock;
  await harness.cleanup();
}

console.log("Customer saved bookings API contract tests passed.");
