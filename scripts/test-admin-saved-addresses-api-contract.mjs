import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-saved-addresses.ts";
const routePath = "app/api/admin-saved-addresses/route.ts";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const serverSessionToken = "mock-admin-saved-addresses-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_ADDRESSES_SENTINEL";
const supabaseUrlSentinel = "https://admin-saved-addresses-contract.supabase.co";
const safeLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_ADDRESSES_SENTINEL|mock-admin-saved-addresses-session-token|admin-saved-addresses-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient|customer_price|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|mock_archive|dev_workbench/i;
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Admin saved addresses contract",
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

function jsonRequest(url, body, headers = adminHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

function patchRequest(url, body, headers = adminHeaders()) {
  return new Request(url, {
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
      "  const mock = globalThis.__prestigeAdminSavedAddressesApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin saved addresses Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-saved-addresses-api-"));

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
    this.operation = "select";
    this.payload = null;
    this.selectedColumns = null;
    this.table = table;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  eq(column, value) {
    this.filters.push({ column, operator: "eq", value });

    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, operator: "ilike", value });

    return this;
  }

  limit(count) {
    this.limitCount = count;

    return this;
  }

  single() {
    return Promise.resolve(this.execute("single"));
  }

  maybeSingle() {
    return Promise.resolve(this.execute("maybe"));
  }

  execute(mode) {
    const operation = {
      action: this.operation,
      filters: this.filters,
      mode,
      payload: this.payload,
      selectedColumns: this.selectedColumns,
      table: this.table,
    };

    this.client.operations.push(operation);

    if (this.client.failures[this.operation]) {
      return {
        data: null,
        error: this.client.failures[this.operation],
      };
    }

    return {
      data: {
        address: this.payload?.address || "1 Safe Street",
        address_role: this.payload?.address_role || "traveler_default",
        company_id: this.payload?.company_id || 7,
        id: this.payload?.id || 44,
        is_default: this.payload?.is_default ?? true,
        label: this.payload?.label || "Default",
        last_used_at: this.payload?.last_used_at || "2026-06-11T00:00:00.000Z",
        traveler_id: this.payload?.traveler_id || 9,
        use_count: this.payload?.use_count ?? 1,
      },
      error: null,
    };
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute("array")).then(resolve, reject);
  }
}

class MockSupabaseClient {
  constructor(options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
  }

  from(table) {
    assert.equal(table, "saved_addresses", "typed API must only touch saved_addresses");

    return new MockQuery(this, table);
  }
}

function installMockClient(options) {
  const client = new MockSupabaseClient(options);

  globalThis.__prestigeAdminSavedAddressesApiMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeAdminSavedAddressesApiMock;
}

const helperSource = await readFile(helperPath, "utf8");
const routeSource = await readFile(routePath, "utf8");
const appPageSource = await readFile(appPagePath, "utf8");
const legacyRouteSource = await readFile(legacyRoutePath, "utf8");

assert.equal(helperSource.includes('from("saved_addresses")'), true, "Helper must target saved_addresses.");
assert.equal(routeSource.includes("/api/admin-legacy-data/rest/v1"), false, "Route must not proxy legacy data.");
assert.equal(appPageSource.includes("adminLegacyTables.savedAddresses"), false, "App must not use legacy saved addresses table.");
assert.equal(appPageSource.includes("/api/admin-saved-addresses"), true, "App must use typed saved addresses API.");
assert.equal(legacyRouteSource.includes("saved_addresses: new Set"), false, "Legacy route must not allow saved_addresses.");
assert.equal(/\.(delete|upsert|rpc)\s*\(/.test(helperSource), false, "Helper must not expose delete/upsert/rpc.");

const harness = await loadHarness();

try {
  const { route } = harness;

  setEnv();
  let mock = installMockClient();
  let response = await readResponse(
    await route.GET(
      new Request("http://localhost/api/admin-saved-addresses?traveler_id=9&address=1%20Safe%20Street", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(response.status, 200, "GET lookup succeeds");
  assert.deepEqual(Object.keys(response.body.saved_address).sort(), [
    "address",
    "address_role",
    "company_id",
    "id",
    "is_default",
    "label",
    "last_used_at",
    "traveler_id",
    "use_count",
  ]);
  assert.deepEqual(
    mock.client.operations.map((operation) => `${operation.action}:${operation.table}`),
    ["select:saved_addresses"],
  );
  assertSafeBody(response.body, "GET response");

  setEnv();
  mock = installMockClient();
  response = await readResponse(
    await route.POST(jsonRequest("http://localhost/api/admin-saved-addresses", {
      address: "1 Safe Street",
      address_role: "traveler_default",
      company_id: 7,
      is_default: true,
      label: "Default",
      last_used_at: "2026-06-11T00:00:00.000Z",
      traveler_id: 9,
      use_count: 1,
    })),
  );

  assert.equal(response.status, 200, "POST create succeeds");
  assert.equal(response.body.saved_address.last_used_at, "2026-06-11T00:00:00.000Z");
  assert.deepEqual(
    mock.client.operations.map((operation) => `${operation.action}:${operation.table}`),
    ["insert:saved_addresses"],
  );
  assertSafeBody(response.body, "POST response");

  setEnv();
  mock = installMockClient();
  response = await readResponse(
    await route.PATCH(patchRequest("http://localhost/api/admin-saved-addresses", {
      address: "1 Safe Street",
      company_id: 7,
      id: 44,
      is_default: true,
      last_used_at: "2026-06-11T01:00:00.000Z",
      use_count: 2,
    })),
  );

  assert.equal(response.status, 200, "PATCH update succeeds");
  assert.equal(response.body.saved_address.use_count, 2);
  assert.deepEqual(
    mock.client.operations.map((operation) => `${operation.action}:${operation.table}`),
    ["update:saved_addresses"],
  );
  assertSafeBody(response.body, "PATCH response");

  setEnv();
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      new Request("http://localhost/api/admin-saved-addresses?address=driver_payout", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(response.status, 400, "unsafe lookup is rejected");
  assert.equal(mock.createdClients.length, 1, "unsafe lookup validates after server config only");
  assert.equal(mock.client.operations.length, 0, "unsafe lookup must not touch saved_addresses");
  assertSafeBody(response.body, "unsafe lookup response");

  setEnv();
  mock = installMockClient();
  response = await readResponse(await route.DELETE());

  assert.equal(response.status, 403, "DELETE is blocked");
  assert.equal(mock.createdClients.length, 0, "blocked DELETE must not create a client");
  assert.equal(mock.client.operations.length, 0, "blocked DELETE must not touch saved_addresses");
  assertSafeBody(response.body, "DELETE response");
} finally {
  await harness.cleanup();
  restoreEnv();
  delete globalThis.__prestigeAdminSavedAddressesApiMock;
}

console.log("Admin saved addresses API contract tests passed.");
