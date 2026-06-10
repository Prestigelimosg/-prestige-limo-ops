import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-saved-booking-driver-assignment-session-token";
const serviceRoleSentinel =
  "SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_DRIVER_ASSIGNMENT_SENTINEL";
const supabaseUrlSentinel =
  "https://admin-saved-booking-driver-assignment-contract.supabase.co";
const unsafeResponsePattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_DRIVER_ASSIGNMENT_SENTINEL|mock-admin-saved-booking-driver-assignment-session-token|admin-saved-booking-driver-assignment-contract\.supabase\.co|customer_price|customer_rate|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|internal_admin_note|admin_finance|mock_archive|mock_qa|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-saved-booking-driver-assignment.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-saved-booking-driver-assignments/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL:
      "Saved booking driver assignment contract admin",
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
  const supabasePath = path.join(
    tempDir,
    "node_modules/@supabase/supabase-js/index.js",
  );

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeAdminSavedBookingDriverAssignmentApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin saved booking driver assignment Supabase client.');",
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
    path.join(os.tmpdir(), "prestige-admin-saved-booking-driver-assignment-api-"),
  );

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(
      path.join(tempDir, "lib/admin-saved-booking-driver-assignment.js"),
    ),
    route: require(
      path.join(tempDir, "app/api/admin-saved-booking-driver-assignments/route.js"),
    ),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
    this.updatePayload = null;
  }

  eq(column, value) {
    this.filters.push({
      column,
      type: "eq",
      value,
    });

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return this;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  update(payload) {
    this.updatePayload = clone(payload);

    return this;
  }

  execute() {
    if (!this.updatePayload) {
      throw new Error(`Unexpected non-update query for ${this.table}`);
    }

    return this.client.updateRows(
      this.table,
      this.filters,
      this.updatePayload,
      this.resultMode,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(seed, failures = {}) {
    this.failures = failures;
    this.operations = [];
    this.rows = clone(seed);
    this.updateHistory = [];
  }

  from(table) {
    this.operations.push({
      table,
      type: "from",
    });

    return new MockSupabaseQuery(this, table);
  }

  updateRows(table, filters, updatePayload, resultMode, selectedColumns) {
    const failure = this.failures[`update:${table}`] || this.failures[table] || null;

    this.updateHistory.push({
      filters: clone(filters),
      payload: clone(updatePayload),
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

    const rows = this.rows[table] || [];
    const matches = rows.filter((row) =>
      filters.every((filter) => String(row[filter.column]) === String(filter.value)),
    );

    for (const row of matches) {
      Object.assign(row, updatePayload);
    }

    return {
      data: resultMode === "maybeSingle" ? matches[0] ?? null : matches,
      error: null,
    };
  }
}

function installMockClient(seed, failures = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, failures),
    createdClients: [],
  };

  globalThis.__prestigeAdminSavedBookingDriverAssignmentApiMock = mock;

  return mock;
}

function jsonRequest(url, body, headers = sessionHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "PATCH",
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
  assert.equal(mock.client.updateHistory.length, 0, `${label} unexpectedly updated rows`);
}

const seed = {
  bookings: [
    {
      id: "assign-booking-1",
      status: "confirmed",
      updated_at: "2026-05-27T02:30:00.000Z",
    },
    {
      id: "clear-booking-1",
      status: "assigned",
      updated_at: "2026-05-28T02:30:00.000Z",
    },
  ],
};

const validAssignPayload = {
  action: "assign",
  booking_id: "assign-booking-1",
  driver_contact: "+65 8000 1111",
  driver_dispatch_include_payout: true,
  driver_id: 42,
  driver_name: "CONTRACT TEST DRIVER",
  driver_notes: "Meet at arrivals",
  driver_payout_amount: 88,
  driver_payout_max: 66,
  driver_payout_min: 66,
  driver_payout_override: null,
  driver_payout_reason: null,
  driver_payout_unit: "job",
  driver_plate_number: "SLC888C",
};

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(
    persistence.adminSavedBookingDriverAssignmentVersion,
    "admin-saved-booking-driver-assignment-v1",
  );
  assert.equal(
    persistence.parseAdminSavedBookingDriverAssignmentPayload(validAssignPayload).ok,
    true,
  );
  assert.equal(
    persistence.parseAdminSavedBookingDriverAssignmentPayload({
      ...validAssignPayload,
      customer_price_amount: 123,
    }).ok,
    false,
  );
  assert.equal(
    persistence.parseAdminSavedBookingDriverAssignmentPayload({
      ...validAssignPayload,
      status: "assigned",
    }).ok,
    false,
  );
  assert.equal(
    persistence.parseAdminSavedBookingDriverAssignmentPayload({
      ...validAssignPayload,
      driver_payout_amount: "not money",
    }).ok,
    false,
  );
  assert.equal(
    persistence.parseAdminSavedBookingDriverAssignmentPayload({
      action: "clear",
      booking_id: "clear-booking-1",
      status: "confirmed",
    }).ok,
    true,
  );
  assert.equal(
    persistence.parseAdminSavedBookingDriverAssignmentPayload({
      action: "clear",
      booking_id: "clear-booking-1",
      driver_name: "SHOULD NOT BE ACCEPTED",
      status: "confirmed",
    }).ok,
    false,
  );

  setEnv(enabledEnv());

  const blockedMock = installMockClient(seed);
  const blockedResult = await routeJson(
    await route.PATCH(
      jsonRequest(
        "http://localhost/api/admin-saved-booking-driver-assignments",
        validAssignPayload,
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

  const invalidPayloadMock = installMockClient(seed);
  const invalidPayloadResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-driver-assignments", {
        ...validAssignPayload,
        invoice_number: "INV-1",
      }),
    ),
  );

  assert.equal(invalidPayloadResult.status, 400);
  assert.equal(invalidPayloadMock.createdClients.length, 0);
  assertNoWrites(invalidPayloadMock, "invalid payload");
  assertNoUnsafeResponse(invalidPayloadResult, "invalid payload response");

  setEnv(enabledEnv());

  const assignMock = installMockClient(seed);
  const assignResult = await routeJson(
    await route.PATCH(
      jsonRequest(
        "http://localhost/api/admin-saved-booking-driver-assignments",
        validAssignPayload,
      ),
    ),
  );

  assert.equal(assignResult.status, 200);
  assert.equal(assignResult.body.ok, true);
  assert.equal(assignResult.body.version, "admin-saved-booking-driver-assignment-v1");
  assert.deepEqual(
    {
      id: assignResult.body.booking.id,
      status: assignResult.body.booking.status,
    },
    {
      id: "assign-booking-1",
      status: "assigned",
    },
  );
  assert.match(assignResult.body.booking.updated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(assignMock.createdClients.length, 1);
  assert.equal(assignMock.client.updateHistory.length, 1);
  assert.equal(assignMock.client.updateHistory[0].table, "bookings");
  assert.deepEqual(assignMock.client.updateHistory[0].filters, [
    {
      column: "id",
      type: "eq",
      value: "assign-booking-1",
    },
  ]);
  assert.deepEqual(
    Object.keys(assignMock.client.updateHistory[0].payload).sort(),
    [
      "driver_contact",
      "driver_dispatch_include_payout",
      "driver_id",
      "driver_name",
      "driver_notes",
      "driver_payout_amount",
      "driver_payout_max",
      "driver_payout_min",
      "driver_payout_override",
      "driver_payout_reason",
      "driver_payout_unit",
      "driver_plate_number",
      "status",
      "updated_at",
    ],
  );
  assert.equal(assignMock.client.updateHistory[0].payload.status, "assigned");
  assert.equal(assignMock.client.updateHistory[0].payload.driver_name, "CONTRACT TEST DRIVER");
  assert.equal(assignMock.client.updateHistory[0].selectedColumns, "id, status, updated_at");
  assertNoUnsafeResponse(assignResult, "assign response");

  setEnv(enabledEnv());

  const clearMock = installMockClient(seed);
  const clearResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-driver-assignments", {
        action: "clear",
        booking_id: "clear-booking-1",
        status: "confirmed",
      }),
    ),
  );

  assert.equal(clearResult.status, 200);
  assert.equal(clearResult.body.ok, true);
  assert.equal(clearResult.body.booking.id, "clear-booking-1");
  assert.equal(clearResult.body.booking.status, "confirmed");
  assert.equal(clearMock.client.updateHistory.length, 1);
  assert.deepEqual(
    Object.keys(clearMock.client.updateHistory[0].payload).sort(),
    [
      "driver_contact",
      "driver_dispatch_include_payout",
      "driver_id",
      "driver_name",
      "driver_notes",
      "driver_payout_override",
      "driver_payout_reason",
      "driver_plate_number",
      "status",
      "updated_at",
    ],
  );
  assert.equal(clearMock.client.updateHistory[0].payload.driver_id, null);
  assert.equal(clearMock.client.updateHistory[0].payload.driver_dispatch_include_payout, false);
  assert.equal(clearMock.client.updateHistory[0].payload.status, "confirmed");
  assertNoUnsafeResponse(clearResult, "clear response");

  setEnv(enabledEnv());

  const missingMock = installMockClient(seed);
  const missingResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-driver-assignments", {
        ...validAssignPayload,
        booking_id: "missing-booking",
      }),
    ),
  );

  assert.equal(missingResult.status, 404);
  assert.equal(
    missingResult.body.error,
    "Admin saved booking driver assignment target was not found.",
  );
  assert.equal(missingMock.client.updateHistory.length, 1);
  assertNoUnsafeResponse(missingResult, "missing response");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    "update:bookings": {
      code: "42501",
      message: "permission denied for table bookings",
      status: 403,
    },
  });
  const failureResult = await routeJson(
    await route.PATCH(
      jsonRequest(
        "http://localhost/api/admin-saved-booking-driver-assignments",
        validAssignPayload,
      ),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.equal(
    failureResult.body.error,
    "Admin saved booking driver assignment update failed safely.",
  );
  assert.equal(failureMock.client.updateHistory.length, 1);
  assertNoUnsafeResponse(failureResult, "failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminSavedBookingDriverAssignmentApiMock;
  await harness.cleanup();
}

console.log("Admin saved booking driver assignment API contract passed.");
