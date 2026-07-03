import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-saved-booking-delete-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_DELETE_SENTINEL";
const supabaseUrlSentinel = "https://admin-saved-booking-delete-contract.supabase.co";
const unsafeResponsePattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_DELETE_SENTINEL|mock-admin-saved-booking-delete-session-token|admin-saved-booking-delete-contract\.supabase\.co|customer_price|customer_rate|driver_payout|paynow|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|internal_admin_note|admin_finance|mock_archive|mock_qa|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Saved booking delete contract admin",
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
      "  const mock = globalThis.__prestigeAdminSavedBookingDeleteApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin saved booking delete Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-saved-booking-delete-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    deletePersistence: require(path.join(tempDir, "lib/admin-saved-booking-delete.js")),
    route: require(path.join(tempDir, "app/api/admin-saved-bookings/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
    this.deleteRequested = false;
  }

  delete() {
    this.deleteRequested = true;

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

  execute() {
    if (!this.deleteRequested) {
      throw new Error(`Unexpected non-delete query for ${this.table}`);
    }

    return this.client.deleteRows(
      this.table,
      this.filters,
      this.resultMode,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(seed, failures = {}) {
    this.deleteHistory = [];
    this.failures = failures;
    this.operations = [];
    this.rows = clone(seed);
  }

  from(table) {
    this.operations.push({
      table,
      type: "from",
    });

    return new MockSupabaseQuery(this, table);
  }

  deleteRows(table, filters, resultMode, selectedColumns) {
    const failure = this.failures[`delete:${table}`] || this.failures[table] || null;

    this.deleteHistory.push({
      filters: clone(filters),
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
      filters.every((filter) => {
        if (filter.type === "in") {
          return filter.values.map(String).includes(String(row[filter.column]));
        }

        return String(row[filter.column]) === String(filter.value);
      }),
    );
    this.rows[table] = rows.filter((row) => !matches.includes(row));

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

  globalThis.__prestigeAdminSavedBookingDeleteApiMock = mock;

  return mock;
}

function deleteRequest(url, body, headers = sessionHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "DELETE",
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

function assertNoDeletes(mock, label) {
  assert.equal(mock.client.deleteHistory.length, 0, `${label} unexpectedly deleted rows`);
}

const seed = {
  bookings: [
    {
      id: "delete-completed-1",
      status: "completed",
    },
    {
      id: "delete-cancelled-1",
      status: "cancelled",
    },
    {
      id: "delete-confirmed-1",
      status: "confirmed",
    },
  ],
};

const harness = await loadHarness();

try {
  const { deletePersistence, route } = harness;

  assert.equal(deletePersistence.adminSavedBookingDeleteVersion, "admin-saved-booking-delete-v1");
  assert.deepEqual(deletePersistence.parseAdminSavedBookingDeletePayload({
    booking_id: "delete-completed-1",
  }), {
    data: {
      booking_id: "delete-completed-1",
    },
    ok: true,
  });
  assert.equal(deletePersistence.parseAdminSavedBookingDeletePayload({}).ok, false);
  assert.equal(deletePersistence.parseAdminSavedBookingDeletePayload({ booking_id: "delete-completed-1", status: "completed" }).ok, false);

  setEnv(enabledEnv());

  const blockedMock = installMockClient(seed);
  const blockedResult = await routeJson(
    await route.DELETE(
      deleteRequest("http://localhost/api/admin-saved-bookings", {
        booking_id: "delete-completed-1",
      }, sessionHeaders({ referer: "http://localhost/my-bookings" })),
    ),
  );

  assert.equal(blockedResult.status, 403);
  assert.equal(blockedResult.body.error, routeBlockedMessage);
  assert.equal(blockedMock.createdClients.length, 0);
  assertNoDeletes(blockedMock, "blocked customer surface");
  assertNoUnsafeResponse(blockedResult, "blocked response");

  setEnv(enabledEnv());

  const invalidMock = installMockClient(seed);
  const invalidResult = await routeJson(
    await route.DELETE(
      deleteRequest("http://localhost/api/admin-saved-bookings", {
        booking_id: "delete-completed-1",
        status: "completed",
      }),
    ),
  );

  assert.equal(invalidResult.status, 400);
  assert.equal(invalidMock.createdClients.length, 0);
  assertNoDeletes(invalidMock, "invalid payload");
  assertNoUnsafeResponse(invalidResult, "invalid payload response");

  setEnv(enabledEnv());

  const confirmedMock = installMockClient(seed);
  const confirmedResult = await routeJson(
    await route.DELETE(
      deleteRequest("http://localhost/api/admin-saved-bookings", {
        booking_id: "delete-confirmed-1",
      }),
    ),
  );

  assert.equal(confirmedResult.status, 404);
  assert.equal(confirmedResult.body.error, "Archived saved booking delete target was not found.");
  assert.equal(confirmedMock.client.deleteHistory.length, 1);
  assert.deepEqual(confirmedMock.client.deleteHistory[0].filters, [
    {
      column: "id",
      type: "eq",
      value: "delete-confirmed-1",
    },
    {
      column: "status",
      type: "in",
      values: ["completed", "cancelled"],
    },
  ]);
  assert.equal(confirmedMock.client.rows.bookings.some((booking) => booking.id === "delete-confirmed-1"), true);
  assertNoUnsafeResponse(confirmedResult, "confirmed target response");

  setEnv(enabledEnv());

  const validMock = installMockClient(seed);
  const validResult = await routeJson(
    await route.DELETE(
      deleteRequest("http://localhost/api/admin-saved-bookings", {
        booking_id: "delete-completed-1",
      }),
    ),
  );

  assert.equal(validResult.status, 200);
  assert.deepEqual(validResult.body, {
    booking: {
      id: "delete-completed-1",
      status: "completed",
    },
    ok: true,
    version: "admin-saved-booking-delete-v1",
  });
  assert.equal(validMock.createdClients.length, 1);
  assert.equal(validMock.client.deleteHistory.length, 1);
  assert.equal(validMock.client.deleteHistory[0].table, "bookings");
  assert.deepEqual(validMock.client.deleteHistory[0].filters, [
    {
      column: "id",
      type: "eq",
      value: "delete-completed-1",
    },
    {
      column: "status",
      type: "in",
      values: ["completed", "cancelled"],
    },
  ]);
  assert.equal(validMock.client.deleteHistory[0].selectedColumns, "id, status");
  assert.equal(validMock.client.rows.bookings.some((booking) => booking.id === "delete-completed-1"), false);
  assertNoUnsafeResponse(validResult, "valid response");

  setEnv(enabledEnv());

  const cancelledMock = installMockClient(seed);
  const cancelledResult = await routeJson(
    await route.DELETE(
      deleteRequest("http://localhost/api/admin-saved-bookings", {
        booking_id: "delete-cancelled-1",
      }),
    ),
  );

  assert.equal(cancelledResult.status, 200);
  assert.deepEqual(cancelledResult.body, {
    booking: {
      id: "delete-cancelled-1",
      status: "cancelled",
    },
    ok: true,
    version: "admin-saved-booking-delete-v1",
  });
  assert.equal(cancelledMock.client.deleteHistory.length, 1);
  assert.equal(cancelledMock.client.rows.bookings.some((booking) => booking.id === "delete-cancelled-1"), false);
  assertNoUnsafeResponse(cancelledResult, "cancelled response");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    "delete:bookings": {
      code: "42501",
      message: "permission denied for table bookings",
      status: 403,
    },
  });
  const failureResult = await routeJson(
    await route.DELETE(
      deleteRequest("http://localhost/api/admin-saved-bookings", {
        booking_id: "delete-completed-1",
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.equal(failureResult.body.error, "Admin saved booking delete failed safely.");
  assert.equal(failureMock.client.deleteHistory.length, 1);
  assertNoUnsafeResponse(failureResult, "failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminSavedBookingDeleteApiMock;
  await harness.cleanup();
}

console.log("Admin saved booking delete API contract passed.");
