import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-bookers.ts";
const routePath = "app/api/admin-bookers/route.ts";
const appPagePath = "app/page.tsx";
const legacyRoutePath = "app/api/admin-legacy-data/rest/v1/[table]/route.ts";
const serverSessionToken = "mock-admin-bookers-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_BOOKERS_SENTINEL";
const supabaseUrlSentinel = "https://admin-bookers-contract.supabase.co";
const safeLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_BOOKERS_SENTINEL|mock-admin-bookers-session-token|admin-bookers-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient|customer_price|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|mock_archive|dev_workbench/i;
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Admin bookers contract",
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
      "  const mock = globalThis.__prestigeAdminBookersApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin bookers Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-bookers-api-"));

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
    helper: createRequire(import.meta.url)(path.join(tempDir, helperPath.replace(/\.ts$/, ".js"))),
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
    this.client.operations.push({
      filters: JSON.parse(JSON.stringify(this.filters)),
      operation: this.operation,
      payload: JSON.parse(JSON.stringify(this.payload)),
      selectedColumns: this.selectedColumns,
      table: this.table,
    });

    if (this.operation === "insert") {
      return {
        data: {
          id: 102,
          ...this.payload,
        },
        error: null,
      };
    }

    if (this.operation === "update") {
      return {
        data: {
          booker_name: "Safe Booker",
          company_id: 7,
          email: "safe@example.invalid",
          id: this.filters.find((filter) => filter.column === "id")?.value || 101,
          phone: "90000000",
          ...this.payload,
        },
        error: null,
      };
    }

    const row = this.client.rows.bookers[0] || null;

    return {
      data: mode === "maybe" || mode === "single" ? row : row ? [row] : [],
      error: null,
    };
  }
}

class MockClient {
  constructor() {
    this.operations = [];
    this.rows = {
      bookers: [
        {
          booker_name: "Safe Booker",
          company_id: 7,
          email: "safe@example.invalid",
          id: 101,
          phone: "90000000",
        },
      ],
    };
  }

  from(table) {
    return new MockQuery(this, table);
  }
}

function installMock() {
  const mock = {
    client: new MockClient(),
    createdClients: [],
  };

  globalThis.__prestigeAdminBookersApiMock = mock;

  return mock;
}

const [helperSource, routeSource, appPageSource, legacyRouteSource] = await Promise.all(
  [helperPath, routePath, appPagePath, legacyRoutePath].map((relativePath) =>
    readFile(path.join(process.cwd(), relativePath), "utf8"),
  ),
);

assert.equal(helperSource.includes('from("bookers")'), true, "Typed helper must own bookers access.");
assert.equal(routeSource.includes("/api/admin-legacy-data/rest/v1"), false, "Typed route must not use legacy shim.");
assert.equal(appPageSource.includes("adminLegacyTables.bookers"), false, "App must not use legacy bookers table.");
assert.equal(
  appPageSource.includes("traveler.booker_id") && appPageSource.includes("traveler.booker_name"),
  true,
  "Verified PA selector must reuse the established rate-setup traveler projection.",
);
assert.equal(legacyRouteSource.includes("bookers: new Set"), false, "Legacy route must not allow bookers.");
assert.equal(
  /\.(?:delete|upsert|rpc)\s*\(/.test(helperSource),
  false,
  "Admin bookers helper must not delete, upsert, or call RPC.",
);

const harness = await loadHarness();

try {
  assert.equal(harness.helper.adminBookersVersion, "admin-bookers-api-v1");

  setEnv();
  let mock = installMock();
  let response = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-bookers?company_id=7&phone=90000000"),
    ),
  );

  assert.equal(response.status, 403, "Anonymous admin booker lookup must be blocked.");
  assertSafeBody(response.body, "anonymous lookup");
  assert.equal(mock.createdClients.length, 0);
  assert.equal(mock.client.operations.length, 0);

  setEnv();
  mock = installMock();
  response = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-bookers?company_id=7&phone=90000000", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(response.status, 200, "Safe admin booker lookup should pass.");
  assert.deepEqual(response.body.booker, mock.client.rows.bookers[0]);
  assert.deepEqual(
    mock.client.operations.map(({ filters, operation, table }) => ({ filters, operation, table })),
    [
      {
        filters: [
          { column: "company_id", operator: "eq", value: 7 },
          { column: "phone", operator: "eq", value: "90000000" },
        ],
        operation: "select",
        table: "bookers",
      },
    ],
  );
  assertSafeBody(response.body, "safe lookup");

  setEnv();
  mock = installMock();
  response = await readResponse(
    await harness.route.POST(
      jsonRequest("http://localhost/api/admin-bookers", {
        booker_name: "Safe Booker",
        company_id: 7,
        email: "safe@example.invalid",
        phone: "90000000",
      }),
    ),
  );

  assert.equal(response.status, 200, "Safe admin booker create should pass.");
  assert.equal(response.body.booker.id, 102);
  assert.equal(mock.client.operations[0].operation, "insert");
  assert.equal(mock.client.operations[0].table, "bookers");
  assertSafeBody(response.body, "safe create");

  setEnv();
  mock = installMock();
  response = await readResponse(
    await harness.route.PATCH(
      patchRequest("http://localhost/api/admin-bookers", {
        booker_name: "Safe Booker",
        email: "safe@example.invalid",
        id: 101,
        phone: "90000000",
      }),
    ),
  );

  assert.equal(response.status, 200, "Safe admin booker update should pass.");
  assert.equal(response.body.booker.id, 101);
  assert.equal(mock.client.operations[0].operation, "update");
  assert.equal(mock.client.operations[0].table, "bookers");
  assertSafeBody(response.body, "safe update");

  setEnv();
  mock = installMock();
  response = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-bookers?booker_name=driver_payout", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(response.status, 400, "Unsafe booker lookup should fail closed.");
  assert.equal(mock.client.operations.length, 0);
  assertSafeBody(response.body, "unsafe lookup");

  for (const method of ["PUT", "DELETE"]) {
    setEnv();
    mock = installMock();
    response = await readResponse(await harness.route[method]());

    assert.equal(response.status, 403, `${method} should stay blocked.`);
    assert.equal(mock.client.operations.length, 0);
    assertSafeBody(response.body, `${method} response`);
  }
} finally {
  restoreEnv();
  await harness.cleanup();
  delete globalThis.__prestigeAdminBookersApiMock;
}

console.log("Admin bookers API contract tests passed.");
