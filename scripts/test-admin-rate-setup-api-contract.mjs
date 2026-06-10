import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-rate-setup-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_RATE_SETUP_SENTINEL";
const supabaseUrlSentinel = "https://admin-rate-setup-contract.supabase.co";
const unsafeSuccessFieldPattern =
  /paynow|pay_now|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|contact_email|contact_phone|payout_preferences|airport_permit|notes/i;
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_RATE_SETUP_SENTINEL|mock-admin-rate-setup-session-token|admin-rate-setup-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-rate-setup-read.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-rate-setup/route.ts",
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

function validEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Rate setup contract admin",
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
      "  const mock = globalThis.__prestigeAdminRateSetupApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin rate setup Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-rate-setup-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, "app/api/admin-rate-setup/route.js")),
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
      rate_settings: [],
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
      filters.every((filter) => row[filter.column] === filter.value),
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

  globalThis.__prestigeAdminRateSetupApiMock = mock;

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
          customer_rates: { MNG: 88, OTHER: 999 },
          domain: "safe.example",
          driver_payout_rules: { MNG: { max: 78, min: 68 }, secret: { amount: 1 } },
          id: 10,
          transzend_excel_privacy: true,
        },
      ],
      rate_settings: [
        {
          child_seat_customer_surcharge: 15,
          child_seat_driver_payout: 10,
          customer_rates: { MNG: 85, DEP: 75, TRF: 55, DSP: 65, HIDDEN: 999 },
          driver_payout_rules: {
            DEP: { max: 65, min: 55 },
            DSP: { amount: 50, perHour: true },
            HIDDEN: { amount: 1 },
            MNG: { max: 75, min: 65 },
            TRF: { max: 70, min: 45 },
          },
          extra_stop_payout: 10,
          extra_stop_surcharge: 15,
          id: "default",
          midnight_payout: 10,
          midnight_surcharge: 15,
        },
      ],
      travelers: [
        {
          company_id: 10,
          customer_rates: { MNG: 95, INTERNAL: 999 },
          driver_payout_rules: { MNG: { max: 80, min: 70 }, INTERNAL: { amount: 2 } },
          id: 20,
          traveler_name: "Safe Traveler",
        },
      ],
    });
    const success = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-rate-setup", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(success.status, 200);
    assert.equal(success.body.ok, true);
    assert.equal(success.body.settings.customer_rates.HIDDEN, undefined);
    assert.equal(success.body.companies[0].customer_rates.OTHER, undefined);
    assert.equal(success.body.travelers[0].driver_payout_rules.INTERNAL, undefined);
    assert.deepEqual(success.body.settings.driver_payout_rules.DSP, {
      amount: 50,
      perHour: true,
    });
    assert.equal(unsafeSuccessFieldPattern.test(JSON.stringify(success.body)), false);
    assert.deepEqual(
      successMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        orderBy: entry.orderBy,
        selectedColumns: entry.selectedColumns,
        table: entry.table,
      })),
      [
        {
          filters: [{ column: "id", type: "eq", value: "default" }],
          orderBy: [],
          selectedColumns:
            "customer_rates, driver_payout_rules, midnight_surcharge, extra_stop_surcharge, midnight_payout, extra_stop_payout, child_seat_customer_surcharge, child_seat_driver_payout",
          table: "rate_settings",
        },
        {
          filters: [],
          orderBy: [{ column: "company_name", options: { ascending: true } }],
          selectedColumns:
            "id, company_name, domain, customer_rates, driver_payout_rules, transzend_excel_privacy",
          table: "companies",
        },
        {
          filters: [],
          orderBy: [{ column: "traveler_name", options: { ascending: true } }],
          selectedColumns: "id, company_id, traveler_name, customer_rates, driver_payout_rules",
          table: "travelers",
        },
      ],
      "Expected typed rate setup read to avoid legacy broad table fields.",
    );
    assert.equal(
      successMock.client.operations.every((operation) => operation.action === "select"),
      true,
      "Admin rate setup route must remain read-only.",
    );

    for (const [label, request] of [
      ["anonymous", new Request("http://localhost/api/admin-rate-setup")],
      [
        "customer",
        new Request("http://localhost/api/admin-rate-setup", {
          headers: validAdminHeaders({
            referer: "http://localhost/customers/acme",
          }),
        }),
      ],
      [
        "driver",
        new Request("http://localhost/api/admin-rate-setup", {
          headers: validAdminHeaders({
            referer: "http://localhost/driver-job/mock-token",
          }),
        }),
      ],
    ]) {
      setEnv(validEnv());
      const blockedMock = installMockClient();
      const blocked = await responseJson(await route.GET(request));

      assert.equal(blocked.status, 403, `Expected ${label} rate setup access to be blocked`);
      assert.equal(blocked.body.error, routeBlockedMessage);
      assert.equal(blockedMock.createdClients.length, 0, `${label} access must not create Supabase client`);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blocked.body)), false);
    }

    setEnv({
      ...validEnv(),
      SUPABASE_SERVICE_ROLE_KEY: undefined,
    });
    const configMock = installMockClient();
    const configFailure = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-rate-setup", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(configFailure.status, 503);
    assert.equal(configMock.createdClients.length, 0);
    assert.equal(safeApiLeakPattern.test(JSON.stringify(configFailure.body)), false);

    setEnv(validEnv());
    const dbFailureMock = installMockClient(
      {},
      {
        failures: {
          "select:rate_settings": { code: "42P01", message: "relation does not exist" },
        },
      },
    );
    const dbFailure = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-rate-setup", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(dbFailure.status, 500);
    assert.equal(dbFailureMock.createdClients.length, 1);
    assert.equal(safeApiLeakPattern.test(JSON.stringify(dbFailure.body)), false);
  } finally {
    await cleanup();
    restoreEnv();
  }
} catch (error) {
  restoreEnv();
  throw error;
}

console.log("Admin rate setup API contract tests passed.");
