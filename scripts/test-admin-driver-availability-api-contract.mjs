import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-driver-availability.ts";
const routePath = "app/api/admin-driver-availability/route.ts";
const appPagePath = "app/page.tsx";
const serverSessionToken = "mock-admin-driver-availability-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_DRIVER_AVAILABILITY_SENTINEL";
const supabaseUrlSentinel = "https://admin-driver-availability-contract.supabase.co";
const safeLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_DRIVER_AVAILABILITY_SENTINEL|mock-admin-driver-availability-session-token|admin-driver-availability-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient|customer_price|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|mock_archive|dev_workbench/i;
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

function restoreEnv() {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setEnv(overrides = {}) {
  restoreEnv();

  for (const [key, value] of Object.entries({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Admin driver availability contract",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  })) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function adminHeaders(extra = {}) {
  return {
    origin: "http://localhost",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...extra,
  };
}

function patchRequest(body, headers = adminHeaders()) {
  return new Request("http://localhost/api/admin-driver-availability", {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "PATCH",
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertSafeBody(body, label) {
  assert.equal(safeLeakPattern.test(JSON.stringify(body)), false, `${label}: unsafe response leak.`);
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
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");

  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeAdminDriverAvailabilityApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin driver availability Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-driver-availability-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of [
    "lib/admin-dispatcher-auth-boundary.ts",
    "lib/admin-booking-persistence.ts",
    "lib/admin-booking-supabase-adapter.ts",
    helperPath,
    routePath,
  ]) {
    await writeHarnessFile(tempDir, relativePath);
  }

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: createRequire(import.meta.url)(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

class MockQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.payload = null;
    this.selectedColumns = null;
    this.table = table;
  }

  update(payload) {
    this.payload = payload;

    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: "eq", value });

    return this;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  single() {
    this.client.operations.push({
      action: "update",
      filters: this.filters,
      payload: this.payload,
      selectedColumns: this.selectedColumns,
      table: this.table,
    });

    return Promise.resolve({
      data: {
        availability_status: this.payload.availability_status,
        id: 901,
        updated_at: this.payload.updated_at,
      },
      error: null,
    });
  }
}

class MockSupabaseClient {
  constructor() {
    this.operations = [];
  }

  from(table) {
    assert.equal(table, "drivers", "typed API must only touch drivers");

    return new MockQuery(this, table);
  }
}

function installMockClient() {
  const client = new MockSupabaseClient();

  globalThis.__prestigeAdminDriverAvailabilityApiMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeAdminDriverAvailabilityApiMock;
}

const helperSource = await readFile(helperPath, "utf8");
const routeSource = await readFile(routePath, "utf8");
const appPageSource = await readFile(appPagePath, "utf8");

assert.equal(helperSource.includes('from("drivers")'), true, "Helper must target drivers.");
assert.equal(routeSource.includes("/api/admin-legacy-data/rest/v1"), false, "Route must not proxy legacy data.");
assert.equal(appPageSource.includes("/api/admin-driver-availability"), true, "App must use typed availability API.");
assert.equal(/customer_rates|driver_payout_rules|payout_preferences/.test(helperSource), false, "Helper must not expose rate/payout fields.");
assert.equal(helperSource.includes("id, availability_status, updated_at"), true, "Helper must select only availability fields.");
assert.equal(/\.(delete|insert|upsert|rpc)\s*\(/.test(helperSource), false, "Helper must not expose delete/insert/upsert/rpc.");

const deactivateDriverProfileStart = appPageSource.indexOf("async function deactivateDriverProfile");
const deactivateDriverProfileEnd = appPageSource.indexOf("function clearDeletedDriverIdFromBookingState");
assert.notEqual(deactivateDriverProfileStart, -1, "App page must keep driver deactivation handler.");
assert.notEqual(deactivateDriverProfileEnd, -1, "App page must keep driver deactivation boundary.");
const deactivateDriverProfileSource = appPageSource.slice(deactivateDriverProfileStart, deactivateDriverProfileEnd);
assert.equal(
  deactivateDriverProfileSource.includes("updateAdminDriverAvailability(payload)"),
  true,
  "Driver deactivation must use typed availability API.",
);
assert.equal(
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data/.test(deactivateDriverProfileSource),
  false,
  "Driver deactivation must not depend on the legacy data shim.",
);

const harness = await loadHarness();

try {
  const { route } = harness;

  setEnv();
  let mock = installMockClient();
  let response = await readResponse(
    await route.PATCH(patchRequest({
      availability_status: "inactive",
      id: "901",
      updated_at: "2026-06-11T00:00:00.000Z",
    })),
  );

  assert.equal(response.status, 200, "PATCH availability succeeds");
  assert.deepEqual(Object.keys(response.body.driver).sort(), ["availability_status", "id", "updated_at"]);
  assert.deepEqual(
    mock.client.operations.map((operation) => `${operation.action}:${operation.table}`),
    ["update:drivers"],
  );
  assert.deepEqual(mock.client.operations[0].payload, {
    availability_status: "inactive",
    updated_at: "2026-06-11T00:00:00.000Z",
  });
  assertSafeBody(response.body, "PATCH response");

  setEnv();
  mock = installMockClient();
  response = await readResponse(
    await route.PATCH(patchRequest({
      availability_status: "driver_payout",
      id: "901",
      updated_at: "2026-06-11T00:00:00.000Z",
    })),
  );

  assert.equal(response.status, 400, "unsafe status is rejected");
  assert.equal(mock.createdClients.length, 1, "unsafe status validates after server config only");
  assert.equal(mock.client.operations.length, 0, "unsafe status must not touch drivers");
  assertSafeBody(response.body, "unsafe response");

  setEnv();
  mock = installMockClient();
  response = await readResponse(await route.DELETE());

  assert.equal(response.status, 403, "DELETE is blocked");
  assert.equal(mock.createdClients.length, 0, "blocked DELETE must not create a client");
  assert.equal(mock.client.operations.length, 0, "blocked DELETE must not touch drivers");
  assertSafeBody(response.body, "DELETE response");
} finally {
  await harness.cleanup();
  restoreEnv();
  delete globalThis.__prestigeAdminDriverAvailabilityApiMock;
}

console.log("Admin driver availability API contract tests passed.");
