import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin legacy data is available only from the internal admin dashboard.";
const unsupportedContractMessage =
  "Admin legacy data request is outside the allowed contract.";
const safeFailureMessage = "Admin legacy data request failed safely.";
const serverSessionToken = randomUUID();
const serviceRoleSentinel = randomUUID();
const supabaseUrlSentinel = `stage-route-${randomUUID()}`;
const safeResponseLeakPattern =
  /service_role|server-only|server_only|stack|sql|supabase internals|createClient|secret|token|key|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|mock_archive|dev_workbench/i;
const sourceFiles = [
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-legacy-data/rest/v1/[table]/route.ts",
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

function setEnv(overrides = {}) {
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
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeLegacyRouteMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-legacy-admin-route-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-legacy-data/rest/v1/[table]/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.limitCount = null;
    this.operation = "select";
    this.orderBy = null;
    this.payload = null;
    this.resultMode = "many";
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

  upsert(payload) {
    this.operation = "upsert";
    this.payload = payload;

    return this;
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  delete() {
    this.operation = "delete";

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

  order(column, options) {
    this.orderBy = { column, options };

    return this;
  }

  single() {
    this.resultMode = "single";

    return Promise.resolve(this.execute());
  }

  maybeSingle() {
    this.resultMode = "maybe";

    return Promise.resolve(this.execute());
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    const failure = this.client.failures[`${this.operation}:${this.table}`];

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    this.client.operations.push({
      action: this.operation,
      filters: clone(this.filters),
      payload: clone(this.payload),
      selectedColumns: this.selectedColumns,
      table: this.table,
    });

    if (this.operation === "insert" || this.operation === "upsert") {
      return {
        data: this.resultMode === "single" ? { id: "mock-row-1" } : null,
        error: null,
      };
    }

    if (this.operation === "update" || this.operation === "delete") {
      return {
        data: null,
        error: null,
      };
    }

    const row = this.client.rows[this.table]?.[0] || null;

    return {
      data: this.resultMode === "single" || this.resultMode === "maybe" ? clone(row) : row ? [clone(row)] : [],
      error: null,
    };
  }
}

class MockSupabaseClient {
  constructor(options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
    this.rows = {
      bookers: [{ id: 1, booker_name: "Safe Booker", company_id: 1, email: "safe@example.invalid", phone: "90000000" }],
      bookings: [{ id: "booking-1", booking_type: "MNG", status: "confirmed" }],
      companies: [{ id: 1, company_name: "Safe Company", domain: "safe.example.invalid" }],
      drivers: [{ id: 1, availability_status: "available", driver_name: "Safe Driver" }],
      rate_settings: [{ id: "default", midnight_surcharge: 10 }],
      saved_addresses: [{ id: 1, address: "Safe Address", company_id: 1, traveler_id: 1 }],
      travelers: [{ id: 1, company_id: 1, traveler_name: "Safe Traveler" }],
    };
  }

  from(table) {
    assert.ok(this.rows[table], `Unexpected mocked table access: ${table}`);

    return new MockSupabaseQuery(this, table);
  }
}

function installMockClient(options) {
  const client = new MockSupabaseClient(options);

  globalThis.__prestigeLegacyRouteMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeLegacyRouteMock;
}

function enabledSessionEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Legacy Route Test Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    VERCEL_ENV: undefined,
    ...overrides,
  };
}

function localDevEnv(overrides = {}) {
  return {
    NODE_ENV: "test",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    VERCEL_ENV: undefined,
    ...overrides,
  };
}

function routeContext(table) {
  return {
    params: Promise.resolve({ table }),
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

function getRequest(url, headers = sessionHeaders()) {
  return new Request(url, {
    headers,
    method: "GET",
  });
}

function postJson(url, body, headers = sessionHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...headers,
    },
    method: "POST",
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.ok(!text.includes(serverSessionToken), `${label}: session value leaked`);
  assert.ok(!text.includes(serviceRoleSentinel), `${label}: service value leaked`);
  assert.ok(!text.includes(supabaseUrlSentinel), `${label}: server URL value leaked`);
  assert.doesNotMatch(text, safeResponseLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client creation`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked DB operation`);
}

const harness = await loadHarness();

try {
  const { route } = harness;

  for (const [label, headers] of [
    ["anonymous request", {}],
    ["customer referer", sessionHeaders({ referer: "http://localhost/book" })],
    ["driver referer", sessionHeaders({ referer: "http://localhost/driver-job/mock-token" })],
    ["wrong purpose", sessionHeaders({ "x-prestige-admin-purpose": "customer-booking-request" })],
  ]) {
    setEnv(enabledSessionEnv());
    const mock = installMockClient();
    const response = await readResponse(
      await route.GET(
        getRequest("http://localhost/api/admin-legacy-data/rest/v1/companies?select=id", headers),
        routeContext("companies"),
      ),
    );

    assert.equal(response.status, 403, label);
    assert.equal(response.body.error, routeBlockedMessage, label);
    assertNoSupabaseTouched(mock, label);
    assertNoLeaks(response.body, label);
  }

  setEnv(enabledSessionEnv());
  let mock = installMockClient();
  let response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/customers?select=id"),
      routeContext("customers"),
    ),
  );

  assert.equal(response.status, 404, "unknown tables stay blocked");
  assertNoSupabaseTouched(mock, "unknown table");
  assertNoLeaks(response.body, "unknown table response");

  setEnv(enabledSessionEnv());
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/bookers?select=id,company_id"),
      routeContext("bookers"),
    ),
  );

  assert.equal(response.status, 404, "retired bookers table stays blocked on the legacy route");
  assertNoSupabaseTouched(mock, "retired bookers table");
  assertNoLeaks(response.body, "retired bookers table response");

  setEnv(enabledSessionEnv());
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/companies?select=id,company_name&id=eq.1&single=maybe"),
      routeContext("companies"),
    ),
  );

  assert.equal(response.status, 200, "valid admin session read reaches mocked handler");
  assert.equal(response.body.company_name, "Safe Company");
  assert.equal(mock.createdClients.length, 1, "valid read creates one server-only client");
  assert.deepEqual(
    mock.client.operations.map((operation) => `${operation.action}:${operation.table}`),
    ["select:companies"],
  );
  assertNoLeaks(response.body, "valid read response");

  setEnv(enabledSessionEnv());
  mock = installMockClient();
  response = await readResponse(
    await route.POST(
      postJson(
        "http://localhost/api/admin-legacy-data/rest/v1/saved_addresses?select=id&single=single",
        {
          address: "Safe Address",
          address_role: "pickup",
          company_id: 1,
          is_default: true,
          label: "Office",
          traveler_id: 1,
        },
      ),
      routeContext("saved_addresses"),
    ),
  );

  assert.equal(response.status, 200, "valid admin session write reaches mocked handler");
  assert.equal(response.body.id, "mock-row-1");
  assert.deepEqual(
    mock.client.operations.map((operation) => `${operation.action}:${operation.table}`),
    ["insert:saved_addresses"],
  );
  assertNoLeaks(response.body, "valid write response");

  setEnv(enabledSessionEnv());
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/companies?select=id,finance_notes"),
      routeContext("companies"),
    ),
  );

  assert.equal(response.status, 400, "unsafe select rejected");
  assert.equal(response.body.error, unsupportedContractMessage);
  assertNoSupabaseTouched(mock, "unsafe select");
  assertNoLeaks(response.body, "unsafe select response");

  setEnv(enabledSessionEnv());
  mock = installMockClient();
  response = await readResponse(
    await route.POST(
      postJson("http://localhost/api/admin-legacy-data/rest/v1/travelers?select=id&single=single", {
        company_id: 1,
        traveler_name: "Safe Traveler",
        raw_ai_parser_debug: "blocked",
      }),
      routeContext("travelers"),
    ),
  );

  assert.equal(response.status, 400, "unsafe payload rejected");
  assert.equal(response.body.error, unsupportedContractMessage);
  assertNoSupabaseTouched(mock, "unsafe payload");
  assertNoLeaks(response.body, "unsafe payload response");

  setEnv(enabledSessionEnv());
  mock = installMockClient({
    failures: {
      "select:companies": {
        message: "stack trace with SQL internals should not leave the route",
      },
    },
  });
  response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/companies?select=id,company_name"),
      routeContext("companies"),
    ),
  );

  assert.equal(response.status, 500, "mocked Supabase failure is sanitized");
  assert.equal(response.body.error, safeFailureMessage);
  assertNoLeaks(response.body, "sanitized failure response");

  setEnv(
    enabledSessionEnv({
      SUPABASE_SERVICE_ROLE_KEY: "change-this",
    }),
  );
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/companies?select=id,company_name"),
      routeContext("companies"),
    ),
  );

  assert.equal(response.status, 503, "placeholder server config rejected");
  assertNoSupabaseTouched(mock, "placeholder config");
  assertNoLeaks(response.body, "placeholder config response");

  setEnv(
    enabledSessionEnv({
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_URL: undefined,
    }),
  );
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      getRequest("http://localhost/api/admin-legacy-data/rest/v1/companies?select=id,company_name"),
      routeContext("companies"),
    ),
  );

  assert.equal(response.status, 503, "missing server config rejected");
  assertNoSupabaseTouched(mock, "missing config");
  assertNoLeaks(response.body, "missing config response");

  setEnv(
    localDevEnv({
      NODE_ENV: "production",
    }),
  );
  mock = installMockClient();
  response = await readResponse(
    await route.GET(
      getRequest(
        "http://localhost/api/admin-legacy-data/rest/v1/companies?select=id,company_name",
        adminHeaders(),
      ),
      routeContext("companies"),
    ),
  );

  assert.equal(response.status, 403, "production local-dev boundary rejected");
  assertNoSupabaseTouched(mock, "production local-dev request");
  assertNoLeaks(response.body, "production local-dev response");

  console.log("Legacy admin API route contract tests passed.");
} finally {
  restoreEnv();
  await harness.cleanup();
  delete globalThis.__prestigeLegacyRouteMock;
}
