import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-saved-booking-create-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_CREATE_SENTINEL";
const supabaseUrlSentinel = "https://admin-saved-booking-create-contract.supabase.co";
const unsafeResponsePattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_CREATE_SENTINEL|mock-admin-saved-booking-create-session-token|admin-saved-booking-create-contract\.supabase\.co|customer_price|customer_rate|driver_payout|paynow|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|internal_admin_note|admin_finance|mock_archive|mock_qa|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-saved-booking-create.ts",
  "lib/admin-saved-booking-delete.ts",
  "lib/admin-saved-booking-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-saved-bookings/route.ts",
];
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
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
  VERCEL_ENV: process.env.VERCEL_ENV,
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

function enabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Saved booking create contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  };
}

function sessionHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
    "content-type": "application/json",
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
      "  const mock = globalThis.__prestigeAdminSavedBookingCreateApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin saved booking create Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-saved-booking-create-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    createPersistence: require(path.join(tempDir, "lib/admin-saved-booking-create.js")),
    route: require(path.join(tempDir, "app/api/admin-saved-bookings/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.insertPayload = null;
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
  }

  insert(payload) {
    this.insertPayload = clone(payload);

    return this;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  single() {
    this.resultMode = "single";

    return this.execute();
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  execute() {
    if (!this.insertPayload) {
      throw new Error(`Unexpected non-insert query for ${this.table}`);
    }

    return this.client.insertRow(
      this.table,
      this.insertPayload,
      this.resultMode,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(options = {}) {
    this.failures = options.failures || {};
    this.insertHistory = [];
    this.nextId = options.nextId || "create-booking-1";
    this.rows = {
      bookings: [],
    };
  }

  from(table) {
    assert.equal(table, "bookings", `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  insertRow(table, insertPayload, resultMode, selectedColumns) {
    const failure = this.failures[`insert:${table}`] || this.failures[table] || null;

    this.insertHistory.push({
      payload: clone(insertPayload),
      resultMode,
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const row = {
      ...insertPayload,
      id: this.nextId,
    };

    this.rows[table].push(row);

    return {
      data: resultMode === "single" ? { id: row.id, status: row.status } : [row],
      error: null,
    };
  }
}

function installMockClient(options = {}) {
  const mock = {
    client: new MockSupabaseClient(options),
    createdClients: [],
  };

  globalThis.__prestigeAdminSavedBookingCreateApiMock = mock;

  return mock;
}

function postRequest(url, body, headers = sessionHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

async function routeJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoUnsafeResponse(result, label) {
  assert.equal(
    unsafeResponsePattern.test(JSON.stringify(result.body)),
    false,
    `${label} leaked an unsafe response field: ${JSON.stringify(result.body)}`,
  );
}

function assertNoWrites(mock, label) {
  assert.equal(mock.client.insertHistory.length, 0, `${label} unexpectedly inserted rows`);
}

const validPayload = {
  booker_id: 21,
  booking_type: "MNG",
  child_seat_count: 1,
  child_seat_customer_surcharge: 15,
  child_seat_driver_payout: 5,
  child_seat_required: true,
  child_seat_type: "booster seat",
  company_id: 11,
  customer_price_amount: 160,
  customer_price_override_reason: "Approved quote",
  customer_rate: 95,
  customer_rate_override: 160,
  customer_rate_unit: "arrival",
  driver_contact: "+65 8000 1111",
  driver_dispatch_include_payout: true,
  driver_id: 31,
  driver_name: "CONTRACT SAVE DRIVER",
  driver_notes: "Meet at arrival belt",
  driver_payout_amount: 82,
  driver_payout_max: 66,
  driver_payout_min: 66,
  driver_payout_override: 82,
  driver_payout_reason: "Approved override",
  driver_payout_unit: "job",
  driver_plate_number: "SLC888C",
  dropoff_address: "Raffles Hotel Singapore",
  extra_stop_count: 1,
  extra_stop_payout: 10,
  extra_stop_surcharge: 20,
  flight_no: "SQ333",
  job_card: "JOB CARD SAFE TEXT",
  midnight_payout: 0,
  midnight_surcharge: 0,
  pax: 2,
  pickup_address: "Changi Airport T3",
  pickup_time: "2026-05-27T15:30:00.000+08:00",
  pricing_source: "customer_override",
  route: "Changi Airport T3 > Raffles Hotel Singapore",
  status: "assigned",
  traveler_id: 22,
  vehicle: "AVF",
};

const harness = await loadHarness();

try {
  const { createPersistence, route } = harness;

  assert.equal(createPersistence.adminSavedBookingCreateVersion, "admin-saved-booking-create-v1");
  assert.equal(createPersistence.parseAdminSavedBookingCreatePayload(validPayload).ok, true);
  assert.equal(
    createPersistence.parseAdminSavedBookingCreatePayload({
      ...validPayload,
      invoice_number: "INV-1",
    }).ok,
    false,
  );
  assert.equal(
    createPersistence.parseAdminSavedBookingCreatePayload({
      ...validPayload,
      status: "paid",
    }).ok,
    false,
  );
  assert.equal(
    createPersistence.parseAdminSavedBookingCreatePayload({
      ...validPayload,
      pax: 0,
    }).ok,
    false,
  );

  setEnv(enabledEnv());

  const blockedMock = installMockClient();
  const blockedResult = await routeJson(
    await route.POST(
      postRequest(
        "http://localhost/api/admin-saved-bookings",
        validPayload,
        sessionHeaders({ referer: "http://localhost/my-bookings" }),
      ),
    ),
  );

  assert.equal(blockedResult.status, 403);
  assert.equal(blockedResult.body.error, routeBlockedMessage);
  assert.equal(blockedMock.createdClients.length, 0);
  assertNoWrites(blockedMock, "blocked customer surface");
  assertNoUnsafeResponse(blockedResult, "blocked response");

  setEnv(enabledEnv());

  const invalidPayloadMock = installMockClient();
  const invalidPayloadResult = await routeJson(
    await route.POST(
      postRequest("http://localhost/api/admin-saved-bookings", {
        ...validPayload,
        payment_status: "paid",
      }),
    ),
  );

  assert.equal(invalidPayloadResult.status, 400);
  assert.equal(invalidPayloadMock.createdClients.length, 0);
  assertNoWrites(invalidPayloadMock, "invalid payload");
  assertNoUnsafeResponse(invalidPayloadResult, "invalid payload response");

  setEnv(enabledEnv());

  const validMock = installMockClient({ nextId: "create-booking-1" });
  const validResult = await routeJson(
    await route.POST(
      postRequest("http://localhost/api/admin-saved-bookings", validPayload),
    ),
  );

  assert.equal(validResult.status, 200);
  assert.equal(validResult.body.ok, true);
  assert.equal(validResult.body.version, "admin-saved-booking-create-v1");
  assert.deepEqual(validResult.body.booking, {
    id: "create-booking-1",
    status: "assigned",
  });
  assert.equal(validMock.createdClients.length, 1);
  assert.equal(validMock.client.insertHistory.length, 1);
  assert.equal(validMock.client.insertHistory[0].table, "bookings");
  assert.equal(validMock.client.insertHistory[0].selectedColumns, "id, status");
  assert.deepEqual(
    Object.keys(validMock.client.insertHistory[0].payload).sort(),
    Object.keys(validPayload).sort(),
  );
  assert.equal(validMock.client.insertHistory[0].payload.customer_price_amount, 160);
  assert.equal(validMock.client.insertHistory[0].payload.driver_payout_amount, 82);
  assertNoUnsafeResponse(validResult, "valid response");

  setEnv(enabledEnv());

  const noReturnMock = installMockClient({ nextId: "" });
  noReturnMock.client.insertRow = function insertWithoutReturn(table, insertPayload, resultMode, selectedColumns) {
    this.insertHistory.push({
      payload: clone(insertPayload),
      resultMode,
      selectedColumns,
      table,
    });

    return {
      data: null,
      error: null,
    };
  };
  const noReturnResult = await routeJson(
    await route.POST(
      postRequest("http://localhost/api/admin-saved-bookings", validPayload),
    ),
  );

  assert.equal(noReturnResult.status, 500);
  assert.equal(noReturnResult.body.error, "Admin saved booking create result was not returned.");
  assert.equal(noReturnMock.client.insertHistory.length, 1);
  assertNoUnsafeResponse(noReturnResult, "no-return response");

  setEnv(enabledEnv());

  const failureMock = installMockClient({
    failures: {
      "insert:bookings": {
        code: "42501",
        message: "permission denied for table bookings",
        status: 403,
      },
    },
  });
  const failureResult = await routeJson(
    await route.POST(
      postRequest("http://localhost/api/admin-saved-bookings", validPayload),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.equal(failureResult.body.error, "Admin saved booking create failed safely.");
  assert.equal(failureMock.client.insertHistory.length, 1);
  assertNoUnsafeResponse(failureResult, "failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminSavedBookingCreateApiMock;
  await harness.cleanup();
}

console.log("Admin saved booking create API contract passed.");
