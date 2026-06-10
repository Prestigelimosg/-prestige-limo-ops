import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-customer-name-memory-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_NAME_MEMORY_SENTINEL";
const supabaseUrlSentinel = "https://customer-name-memory-contract.supabase.co";
const unsafeLeakPattern =
  /customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|customer_rates|driver_payout_rules|booker_email|contact_email|contact_phone/i;
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_NAME_MEMORY_SENTINEL|mock-admin-customer-name-memory-session-token|customer-name-memory-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-customer-name-memory-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-customer-name-memory/route.ts",
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

function validEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Name memory contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  };
}

function validAdminHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
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
  }).outputText.replace(/require\("([^"]+)\.ts"\)/g, 'require("$1.js")');
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
      "  const mock = globalThis.__prestigeAdminCustomerNameMemoryApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked customer name memory Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-name-memory-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-customer-name-memory/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.orderBy = [];
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

  ilike(column, value) {
    this.filters.push({
      column,
      type: "ilike",
      value,
    });

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return this;
  }

  order(column, options) {
    this.orderBy.push({ column, options });

    return this;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  execute() {
    return this.client.selectRows(
      this.table,
      this.filters,
      this.orderBy,
      this.resultLimit,
      this.resultMode,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      companies: [],
      saved_addresses: [],
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

  filterRows(table, filters) {
    return this.tables[table].filter((row) =>
      filters.every((filter) => {
        const rowValue = row[filter.column];

        if (filter.type === "ilike") {
          return String(rowValue || "").toLowerCase() === String(filter.value || "").toLowerCase();
        }

        return rowValue === filter.value;
      }),
    );
  }

  selectRows(table, filters, orderBy, resultLimit, resultMode, selectedColumns) {
    const failure = this.failures[`select:${table}`] || this.failures[table] || null;

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
      resultMode,
      selectedColumns,
      table,
    });
    this.operations.push({
      action: "select",
      filters: clone(filters),
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.filterRows(table, filters);
    const limitedRows = typeof resultLimit === "number" ? rows.slice(0, resultLimit) : rows;

    return {
      data: resultMode === "maybeSingle" ? clone(limitedRows[0] || null) : limitedRows.map((row) => clone(row)),
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeAdminCustomerNameMemoryApiMock = mock;

  return mock;
}

async function responseJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

try {
  const { cleanup, route } = await loadHarness();

  try {
    setEnv(validEnv());
    const successMock = installMockClient({
      companies: [
        {
          company_name: "Safe Corporate Account",
          id: 10,
        },
      ],
      saved_addresses: [
        {
          address: "Safe saved dropoff address",
          company_id: 10,
          id: 22,
          is_default: true,
          last_used_at: "2026-06-08T01:00:00.000Z",
          traveler_id: 20,
          use_count: 7,
        },
      ],
      travelers: [
        {
          company_id: 10,
          default_address: "Fallback safe address",
          driver_payout_rules: { secret: true },
          id: 20,
          preferred_vehicle: "VAN",
          traveler_name: "Safe Traveler",
        },
      ],
    });
    const success = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-customer-name-memory?traveler_name=Safe%20Traveler", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(success.status, 200);
    assert.deepEqual(success.body.name_memory, {
      company: "Safe Corporate Account",
      company_id: 10,
      preferred_vehicle: "VAN",
      saved_address: "Safe saved dropoff address",
      traveler_id: 20,
    });
    assert.equal(unsafeLeakPattern.test(JSON.stringify(success.body)), false);
    assert.deepEqual(
      successMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        selectedColumns: entry.selectedColumns,
        table: entry.table,
      })),
      [
        {
          filters: [{ column: "traveler_name", type: "ilike", value: "Safe Traveler" }],
          selectedColumns: "id, company_id, traveler_name, preferred_vehicle, default_address",
          table: "travelers",
        },
        {
          filters: [{ column: "id", type: "eq", value: 10 }],
          selectedColumns: "id, company_name",
          table: "companies",
        },
        {
          filters: [{ column: "traveler_id", type: "eq", value: 20 }],
          selectedColumns:
            "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at",
          table: "saved_addresses",
        },
      ],
      "Expected typed name memory read to avoid legacy broad traveler/company/address fields",
    );
    assert.equal(
      unsafeLeakPattern.test(successMock.client.selectHistory.map((entry) => entry.selectedColumns).join(",")),
      false,
      "Name memory select columns must not include customer price, payout, contact, parser, invoice, or finance fields",
    );

    setEnv(validEnv());
    const missingTravelerMock = installMockClient();
    const missingTraveler = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-customer-name-memory?traveler_name=Unknown", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(missingTraveler.status, 200);
    assert.equal(missingTraveler.body.name_memory, null);
    assert.equal(missingTravelerMock.client.selectHistory.length, 1);

    setEnv(validEnv());
    const unsafeParamMock = installMockClient();
    const unsafeParam = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-customer-name-memory?traveler_name=driver_payout", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(unsafeParam.status, 400);
    assert.equal(unsafeParamMock.client.operations.length, 0, "Unsafe name memory params must not reach Supabase");
    assert.equal(safeApiLeakPattern.test(JSON.stringify(unsafeParam.body)), false);

    for (const [label, request] of [
      ["anonymous", new Request("http://localhost/api/admin-customer-name-memory?traveler_name=Safe%20Traveler")],
      [
        "customer",
        new Request("http://localhost/api/admin-customer-name-memory?traveler_name=Safe%20Traveler", {
          headers: validAdminHeaders({
            referer: "http://localhost/my-bookings",
          }),
        }),
      ],
      [
        "driver",
        new Request("http://localhost/api/admin-customer-name-memory?traveler_name=Safe%20Traveler", {
          headers: validAdminHeaders({
            referer: "http://localhost/driver-job/mock-token",
          }),
        }),
      ],
    ]) {
      setEnv(validEnv());
      const blockedMock = installMockClient();
      const blocked = await responseJson(await route.GET(request));

      assert.equal(blocked.status, 403, `Expected ${label} name memory access to be blocked`);
      assert.equal(blocked.body.error, routeBlockedMessage);
      assert.equal(blockedMock.createdClients.length, 0, `${label} access must not create Supabase client`);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blocked.body)), false);
    }

    assert.equal(
      successMock.client.operations.every((operation) => operation.action === "select"),
      true,
      "Name memory route must remain read-only",
    );
  } finally {
    await cleanup();
    restoreEnv();
  }
} catch (error) {
  restoreEnv();
  throw error;
}

console.log("Admin customer name memory API contract tests passed.");
