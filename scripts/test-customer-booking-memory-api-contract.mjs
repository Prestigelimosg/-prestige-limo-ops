import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const customerAuthRequiredMessage =
  "Customer booking memory read requires secure customer account access.";
const sessionToken = "mock-customer-booking-memory-session-token";
const sessionCookieName = "prestige_customer_saved_bookings_session";
const customSessionCookieName = "prestige_customer_portal_session";
const authUserId = "33333333-3333-4333-8333-333333333333";
const customerAccountReference = "44444444-4444-4444-8444-444444444444";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_BOOKING_MEMORY_SENTINEL";
const supabaseUrlSentinel = "https://customer-booking-memory-contract.supabase.co";
const allowedMemoryFields = [
  "dropoff_location",
  "last_used_at",
  "passenger_name",
  "pickup_location",
  "service_type",
  "vehicle_type",
];
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_BOOKING_MEMORY_SENTINEL|mock-customer-booking-memory-session-token|customer-booking-memory-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const unsafeCustomerBookingMemoryLeakPattern =
  /admin_internal_status|admin_status|billing|contact_phone|contact_email|passenger_phone|customer_price|quoted_price|rate_amount|driver_payout|paynow|pay_now|invoice|payment|pdf|payout|finance|parser_debug|parser_learning|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|internal_finance_note|internal_note|admin_note|server_secret|session_token|raw_token|token_hash|driver_token/i;
const sourceFiles = [
  "lib/customer-booking-memory-read.ts",
  "lib/admin-booking-persistence.ts",
  "app/api/customer-booking-memory/route.ts",
];
const originalEnv = {
  PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED:
    process.env.PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED,
  PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_MODE:
    process.env.PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_MODE,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID,
  PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME:
    process.env.PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME,
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
    PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_ENABLED: "true",
    PRESTIGE_CUSTOMER_BOOKING_MEMORY_AUTH_MODE: "server-session-token",
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_AUTH_USER_ID: authUserId,
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_TOKEN: sessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

function validHeaders(extra = {}) {
  return {
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-memory-read",
    "x-prestige-customer-session-token": sessionToken,
    ...extra,
  };
}

function sessionCookie(token = sessionToken, name = sessionCookieName) {
  return `${name}=${encodeURIComponent(token)}`;
}

function validCookieHeaders(extra = {}) {
  return {
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-memory-read",
    cookie: sessionCookie(),
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
  const savedBookingsPath = path.join(tempDir, "lib/customer-saved-bookings-read.js");
  const accessAccountPath = path.join(tempDir, "lib/customer-portal-access-account.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(savedBookingsPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeCustomerBookingMemoryApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked customer booking memory Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
  await writeFile(
    savedBookingsPath,
    [
      "function resolveCustomerSavedBookingsBoundaryForPurpose() {",
      "  return { error: 'legacy memory session fallback', ok: false, status: 403 };",
      "}",
      "module.exports = { resolveCustomerSavedBookingsBoundaryForPurpose };",
    ].join("\n"),
  );
  await writeFile(
    accessAccountPath,
    "module.exports = { async assertActiveCustomerPortalAccessAccount() { return { error: 'not used by legacy harness', ok: false, status: 403 }; } };",
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-booking-memory-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    read: require(path.join(tempDir, "lib/customer-booking-memory-read.js")),
    route: require(path.join(tempDir, "app/api/customer-booking-memory/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.orderBy = null;
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
      bookers: [],
      bookings: [],
      customer_access_accounts: [],
      travelers: [],
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
    throw new Error("Customer booking memory API contract forbids writes.");
  }

  update(payload) {
    this.operations.push({ action: "update", payload });
    throw new Error("Customer booking memory API contract forbids writes.");
  }

  upsert(payload) {
    this.operations.push({ action: "upsert", payload });
    throw new Error("Customer booking memory API contract forbids writes.");
  }

  delete() {
    this.operations.push({ action: "delete" });
    throw new Error("Customer booking memory API contract forbids writes.");
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

    if (Number.isInteger(query.limit)) {
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

  globalThis.__prestigeCustomerBookingMemoryApiMock = mock;

  return mock;
}

async function json(response) {
  return response.json();
}

function assertSafeApiBody(body, label) {
  const serialized = JSON.stringify(body);

  assert.equal(safeApiLeakPattern.test(serialized), false, `${label} leaked server internals.`);
  assert.equal(
    unsafeCustomerBookingMemoryLeakPattern.test(serialized),
    false,
    `${label} leaked customer-private, admin, finance, payout, parser, token, or mock/archive fields.`,
  );
}

function assertAllowedMemoryShape(memory, label) {
  assert.deepEqual(
    Object.keys(memory).sort(),
    allowedMemoryFields,
    `${label}: booking memory record must expose only customer-safe fields.`,
  );
}

function seedBookingMemoryRows() {
  return {
    bookings: [
      {
        admin_finance_note: "must not leak",
        admin_internal_status: "confirmed",
        booking_reference: "MEMORY-001",
        contact_email: "must-not-return@example.com",
        contact_phone: "+6590000000",
        created_at: "2026-06-08T01:00:00.000Z",
        customer_id: customerAccountReference,
        customer_price: "9999",
        dropoff_location: "Changi Airport Terminal 3",
        driver_payout: "123",
        internal_admin_note: "VIP handling note",
        invoice_number: "INV-001",
        passenger_name: "Boss A",
        passenger_phone: "+6591111111",
        paynow_payout_reference: "PNOW-001",
        pickup_datetime: "2026-06-10T09:00:00.000Z",
        pickup_location: "West Coast Residence",
        route_type: "Airport Departure",
        updated_at: "2026-06-09T03:00:00.000Z",
        vehicle: "Mercedes S-Class",
      },
      {
        booking_reference: "MEMORY-002",
        customer_id: customerAccountReference,
        dropoff_location: "Raffles Singapore",
        passenger_name: "Boss B",
        pickup_at: "2026-06-10T10:00:00.000Z",
        pickup_location: "Orchard Office",
        service_type: "Point-to-Point Transfer",
        updated_at: "2026-06-09T02:00:00.000Z",
        vehicle_type: "Alphard / Vellfire",
      },
      {
        booking_reference: "MEMORY-003",
        customer_id: customerAccountReference,
        dropoff_location: "Old dropoff",
        passenger_name: "Boss A",
        pickup_at: "2026-05-10T10:00:00.000Z",
        pickup_location: "Old pickup",
        service_type: "Hourly / Disposal",
        updated_at: "2026-06-09T01:00:00.000Z",
        vehicle_type: "Mercedes Viano / V-Class",
      },
      {
        booking_reference: "MEMORY-004",
        customer_id: customerAccountReference,
        dropoff_location: "internal_admin_note holding room",
        passenger_name: "finance note passenger",
        pickup_at: "2026-06-10T09:00:00.000Z",
        pickup_location: "driver_payout office",
        service_type: "payment transfer",
        updated_at: "2026-06-09T04:00:00.000Z",
      },
      {
        booking_reference: "OTHER-CUSTOMER-001",
        customer_id: "55555555-5555-4555-8555-555555555555",
        dropoff_location: "Other dropoff",
        passenger_name: "Other Boss",
        pickup_at: "2026-06-09T09:00:00.000Z",
        pickup_location: "Other pickup",
        service_type: "transfer",
        updated_at: "2026-06-09T05:00:00.000Z",
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
    "lib/customer-booking-memory-read.ts",
    "app/api/customer-booking-memory/route.ts",
  ].map((relativePath) => readFile(path.join(process.cwd(), relativePath), "utf8")),
);
const bookingMemorySelectSource =
  joinedSourceText.match(/customerBookingMemorySelect\s*=\s*([^;]+)/)?.[1] || "";

assert.equal(
  /\.(?:insert|upsert|delete|update)\s*\(/.test(readPathSourceText.join("\n")),
  false,
  "Customer booking memory read path must remain read-only.",
);
assert.equal(
  bookingMemorySelectSource.includes("vehicle_type_or_category"),
  true,
  "Customer booking memory must select the wired bookings vehicle column.",
);
assert.equal(
  bookingMemorySelectSource.includes(", vehicle_type,"),
  false,
  "Customer booking memory must not select the absent legacy vehicle_type column.",
);
assert.equal(
  /admin_internal_status|contact_phone|contact_email|passenger_phone|customer_price|driver_payout|paynow|invoice|payment|payout|parser_source_reference/.test(
    bookingMemorySelectSource,
  ),
  false,
  "Customer booking memory select must not include private customer/admin/finance/payout/parser columns.",
);

const harness = await loadHarness();

try {
  assert.deepEqual(
    harness.read.parseCustomerBookingMemoryReadParams(new URLSearchParams("q=Boss&limit=2")),
    {
      data: {
        limit: 2,
        q: "Boss",
      },
      ok: true,
    },
    "Expected safe customer booking memory params to parse.",
  );
  assert.equal(
    harness.read.parseCustomerBookingMemoryReadParams(new URLSearchParams("q=driver_payout")).status,
    400,
    "Unsafe memory query values should be rejected.",
  );
  assert.equal(
    harness.read.parseCustomerBookingMemoryReadParams(new URLSearchParams("q=Boss&admin_note=1")).status,
    400,
    "Unsafe query fields should be rejected.",
  );
  assert.equal(
    harness.read.parseCustomerBookingMemoryReadParams(new URLSearchParams("limit=1000")).status,
    400,
    "Oversized limit should be rejected.",
  );

  setEnv({});
  delete globalThis.__prestigeCustomerBookingMemoryApiMock;
  const disabledResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: {
        referer: "http://localhost/book",
        "x-prestige-customer-purpose": "customer-booking-memory-read",
      },
    }),
  );
  const disabledBody = await json(disabledResponse);
  assert.equal(disabledResponse.status, 403, "Default-off route should be blocked.");
  assert.equal(disabledBody.error, customerAuthRequiredMessage);
  assertSafeApiBody(disabledBody, "default-off route body");

  validEnv();
  installMockClient(seedBookingMemoryRows());
  for (const [label, request] of [
    ["anonymous", new Request("http://localhost/api/customer-booking-memory?limit=2")],
    [
      "wrong purpose",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validHeaders({ "x-prestige-customer-purpose": "customer-saved-bookings-read" }),
      }),
    ],
    [
      "portal referer",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validHeaders({ referer: "http://localhost/my-bookings" }),
      }),
    ],
    [
      "driver page referer",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validHeaders({ referer: "http://localhost/driver-job-demo" }),
      }),
    ],
    [
      "foreign origin",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validHeaders({ origin: "https://evil.example" }),
      }),
    ],
    [
      "wrong token",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validHeaders({ "x-prestige-customer-session-token": "wrong-token" }),
      }),
    ],
    [
      "wrong cookie token",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validCookieHeaders({ cookie: sessionCookie("wrong-token") }),
      }),
    ],
    [
      "ambiguous cookie token",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validCookieHeaders({
          cookie: `${sessionCookie("wrong-token")}; ${sessionCookie()}`,
        }),
      }),
    ],
    [
      "ambiguous trusted cookie names",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validCookieHeaders({
          cookie: `${sessionCookie()}; ${sessionCookie("wrong-token", "prestige_customer_session")}`,
        }),
      }),
    ],
    [
      "unsafe cookie name",
      new Request("http://localhost/api/customer-booking-memory?limit=2", {
        headers: validCookieHeaders({
          cookie: sessionCookie(sessionToken, "prestige_customer_session_token"),
        }),
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
  const tokenBoundary = harness.read.resolveCustomerBookingMemoryBoundary(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validHeaders(),
    }),
  );
  assert.equal(tokenBoundary.ok, true, "Expected server-session-token memory boundary to pass.");
  assert.equal(tokenBoundary.data.mode, "server-session-token");
  assert.equal(tokenBoundary.data.auth_user_id, authUserId);

  validEnv();
  const cookieBoundary = harness.read.resolveCustomerBookingMemoryBoundary(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validCookieHeaders(),
    }),
  );
  assert.equal(cookieBoundary.ok, true, "Expected cookie-backed customer memory boundary to pass.");
  assert.equal(cookieBoundary.data.mode, "server-session-cookie");
  assert.equal(cookieBoundary.data.auth_user_id, authUserId);

  validEnv({
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME: customSessionCookieName,
  });
  const configuredCookieBoundary = harness.read.resolveCustomerBookingMemoryBoundary(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validCookieHeaders({
        cookie: sessionCookie(sessionToken, customSessionCookieName),
      }),
    }),
  );
  assert.equal(configuredCookieBoundary.ok, true, "Expected configured safe cookie name to pass.");
  assert.equal(configuredCookieBoundary.data.mode, "server-session-cookie");

  validEnv({
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME: customSessionCookieName,
  });
  const configuredDefaultCookieBoundary = harness.read.resolveCustomerBookingMemoryBoundary(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validCookieHeaders(),
    }),
  );
  assert.equal(
    configuredDefaultCookieBoundary.ok,
    false,
    "Configured cookie names should not also accept the default session cookie.",
  );
  assert.equal(configuredDefaultCookieBoundary.status, 403);

  validEnv({
    PRESTIGE_CUSTOMER_SAVED_BOOKINGS_SESSION_COOKIE_NAME: "prestige_customer_session_token",
  });
  const unsafeConfiguredCookieBoundary = harness.read.resolveCustomerBookingMemoryBoundary(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validCookieHeaders(),
    }),
  );
  assert.equal(
    unsafeConfiguredCookieBoundary.ok,
    false,
    "Unsafe configured cookie names should fail closed instead of falling back to defaults.",
  );
  assert.equal(unsafeConfiguredCookieBoundary.status, 403);

  validEnv();
  const routeMock = installMockClient(seedBookingMemoryRows());
  const response = await harness.route.GET(
    new Request("http://localhost/api/customer-booking-memory?limit=2&q=Boss", {
      headers: validHeaders(),
    }),
  );
  const body = await json(response);

  assert.equal(response.status, 200, "Expected memory route read to pass with guarded customer boundary.");
  assert.equal(body.ok, true);
  assert.equal(body.version, "customer-booking-memory-read-v1");
  assert.equal(body.memories.length, 2);
  assertAllowedMemoryShape(body.memories[0], "first memory response");
  assertAllowedMemoryShape(body.memories[1], "second memory response");
  assert.deepEqual(body.memories, [
    {
      dropoff_location: "Changi Airport Terminal 3",
      last_used_at: "2026-06-09T03:00:00.000Z",
      passenger_name: "Boss A",
      pickup_location: "West Coast Residence",
      service_type: "Airport Departure",
      vehicle_type: "Mercedes S-Class",
    },
    {
      dropoff_location: "Raffles Singapore",
      last_used_at: "2026-06-09T02:00:00.000Z",
      passenger_name: "Boss B",
      pickup_location: "Orchard Office",
      service_type: "Point-to-Point Transfer",
      vehicle_type: "Alphard / Vellfire",
    },
  ]);
  assertSafeApiBody(body, "route success body");
  assert.equal(routeMock.createdClients.length, 1, "Expected one server-only Supabase client.");
  assert.equal(routeMock.createdClients[0].url, supabaseUrlSentinel);
  assert.equal(routeMock.createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(routeMock.createdClients[0].options.auth.persistSession, false);
  assert.equal(routeMock.client.operations.length, 0, "Customer booking memory read route must not write.");
  assert.deepEqual(routeMock.client.selectHistory[0].filters, [
    { column: "auth_user_id", value: authUserId },
    { column: "account_status", value: "active" },
  ]);
  assert.deepEqual(routeMock.client.selectHistory[1].filters, [
    { column: "customer_id", value: customerAccountReference },
  ]);
  assert.deepEqual(routeMock.client.selectHistory[1].orderBy, {
    column: "updated_at",
    options: { ascending: false },
  });
  assert.equal(routeMock.client.selectHistory[1].limit, 10, "Expected compact overfetch for dedupe.");
  assert.equal(
    /admin_internal_status|contact_phone|contact_email|passenger_phone|customer_price|driver_payout|paynow|invoice|payment|payout|parser_source_reference/.test(
      routeMock.client.selectHistory[1].selectedColumns,
    ),
    false,
    "Select columns should avoid private customer/admin/finance/payout/parser fields.",
  );

  validEnv();
  const profileSeed = seedBookingMemoryRows();
  profileSeed.customer_access_accounts[0].company_id = 7;
  profileSeed.customer_access_accounts[0].booker_id = 55;
  profileSeed.bookers = [
    {
      booker_name: "William Booker",
      company_id: 7,
      email: "william@prestigelimo.sg",
      id: 55,
      phone: "+65 9000 1234",
    },
  ];
  profileSeed.travelers = [
    {
      booker_id: 55,
      company_id: 7,
      default_dropoff_address: "Changi Airport Terminal 3",
      default_pickup_address: "Orchard Hotel",
      id: 901,
      preferred_vehicle: "Alphard / Vellfire",
      traveler_name: "Traveller One",
    },
    {
      booker_id: 77,
      company_id: 7,
      id: 902,
      traveler_name: "Other Booker Traveller",
    },
  ];
  const profileMock = installMockClient(profileSeed);
  const profileResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validHeaders(),
    }),
  );
  const profileBody = await json(profileResponse);

  assert.equal(profileResponse.status, 200);
  assert.deepEqual(profileBody.booker_profile, {
    booker_name: "William Booker",
    email: "william@prestigelimo.sg",
    phone: "+65 9000 1234",
  });
  assert.deepEqual(profileBody.travelers, [
    {
      default_dropoff_address: "Changi Airport Terminal 3",
      default_pickup_address: "Orchard Hotel",
      id: 901,
      preferred_vehicle: "Alphard / Vellfire",
      traveler_name: "Traveller One",
    },
  ]);
  assert.deepEqual(
    profileMock.client.selectHistory.find((query) => query.table === "bookers").filters,
    [
      { column: "id", value: 55 },
      { column: "company_id", value: 7 },
    ],
  );
  assert.deepEqual(
    profileMock.client.selectHistory.find((query) => query.table === "travelers").filters,
    [
      { column: "company_id", value: 7 },
      { column: "booker_id", value: 55 },
    ],
  );
  assertSafeApiBody(profileBody, "verified booker profile response");

  validEnv();
  const cookieRouteMock = installMockClient(seedBookingMemoryRows());
  const cookieResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-booking-memory?limit=1&q=West", {
      headers: validCookieHeaders(),
    }),
  );
  const cookieBody = await json(cookieResponse);
  assert.equal(cookieResponse.status, 200, "Expected route read to pass with same-origin session cookie.");
  assert.equal(cookieBody.ok, true);
  assert.equal(cookieBody.memories.length, 1);
  assert.equal(cookieBody.memories[0].passenger_name, "Boss A");
  assertAllowedMemoryShape(cookieBody.memories[0], "cookie-backed memory response");
  assertSafeApiBody(cookieBody, "cookie-backed route success body");
  assert.equal(cookieRouteMock.client.operations.length, 0, "Cookie-backed customer booking memory read must not write.");
  assert.equal(
    /admin_internal_status|contact_phone|contact_email|passenger_phone|customer_price|driver_payout|paynow|invoice|payment|payout|parser_source_reference/.test(
      cookieRouteMock.client.selectHistory[1].selectedColumns,
    ),
    false,
    "Cookie-backed select columns should avoid private customer/admin/finance/payout/parser fields.",
  );

  validEnv();
  installMockClient({ bookings: [], customer_access_accounts: [] });
  const emptyResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validHeaders(),
    }),
  );
  const emptyBody = await json(emptyResponse);
  assert.equal(emptyResponse.status, 200);
  assert.deepEqual(emptyBody.memories, []);
  assertSafeApiBody(emptyBody, "empty customer account response");

  validEnv();
  installMockClient(seedBookingMemoryRows(), {
    failures: {
      "select:bookings": { code: "42501", message: "row level security" },
    },
  });
  const failureResponse = await harness.route.GET(
    new Request("http://localhost/api/customer-booking-memory?limit=2", {
      headers: validHeaders(),
    }),
  );
  const failureBody = await json(failureResponse);
  assert.equal(failureResponse.status, 500);
  assert.equal(failureBody.error, "Customer booking memory read failed safely.");
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
  delete globalThis.__prestigeCustomerBookingMemoryApiMock;
  await harness.cleanup();
}

console.log("Customer booking memory API contract tests passed.");
