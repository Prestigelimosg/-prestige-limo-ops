import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-companies-crm-identity-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_COMPANIES_IDENTITY_SENTINEL";
const supabaseUrlSentinel = "https://companies-identity-contract.supabase.co";
const unsafeLeakPattern =
  /customer_rates|driver_payout_rules|customer_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|contact_email|contact_phone/i;
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_COMPANIES_IDENTITY_SENTINEL|mock-admin-companies-crm-identity-session-token|companies-identity-contract\.supabase\.co|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-companies-crm-identity.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-companies-crm-identity/route.ts",
];
const companyIdentitySelect =
  "id, company_name, domain, billing_address, main_phone, mobile_phone, website, primary_contact_name, billing_email, accounts_email, operations_email";
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

function validEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Companies identity contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
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

function validActor() {
  return {
    actor_label: "Companies identity contract admin",
    actor_role: "admin",
    boundary_mode: "server-session-role-surface",
    source_surface: "admin_api",
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
      "  const mock = globalThis.__prestigeAdminCompaniesCrmIdentityMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked companies CRM identity Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-companies-crm-identity-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    reader: require(path.join(tempDir, "lib/admin-companies-crm-identity.js")),
    route: require(path.join(tempDir, "app/api/admin-companies-crm-identity/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.resultLimit = null;
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
  }

  eq(column, value) {
    this.filters.push({ column, type: "eq", value });

    return this;
  }

  ilike(column, value) {
    this.filters.push({ column, type: "ilike", value });

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return Promise.resolve(this.execute());
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

  selectRows(table, filters, resultLimit, resultMode, selectedColumns) {
    const failure = this.failures[`select:${table}`] || this.failures[table] || null;

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
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

  globalThis.__prestigeAdminCompaniesCrmIdentityMock = mock;

  return mock;
}

async function responseJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

try {
  const { cleanup, reader, route } = await loadHarness();

  try {
    assert.equal(reader.adminCompaniesCrmIdentityVersion, "admin-companies-crm-identity-api-v1");
    assert.equal(typeof route.GET, "function");
    assert.equal(route.POST, undefined, "Companies CRM identity route must stay GET-only.");
    assert.equal(route.PATCH, undefined, "Companies CRM identity route must not expose PATCH.");
    assert.equal(route.DELETE, undefined, "Companies CRM identity route must not expose DELETE.");

    setEnv(validEnv());
    const helperMock = installMockClient({
      companies: [
        {
          company_name: "Safe Corporate",
          customer_rates: { HOURLY: 999 },
          domain: "safe.example.invalid",
          driver_payout_rules: { HOURLY: { min: 1 } },
          id: 101,
          internal_admin_note: "must not leak",
        },
      ],
    });
    const helperResult = await reader.findAdminCompanyCrmIdentity(
      new URLSearchParams({ domain: "safe.example.invalid" }),
      validActor(),
    );

    assert.equal(helperResult.ok, true);
    assert.deepEqual(helperResult.data, {
      accounts_email: null,
      billing_address: null,
      billing_email: null,
      company_name: "Safe Corporate",
      domain: "safe.example.invalid",
      id: 101,
      main_phone: null,
      mobile_phone: null,
      operations_email: null,
      primary_contact_name: null,
      website: null,
    });
    assert.deepEqual(
      helperMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        selectedColumns: entry.selectedColumns,
        table: entry.table,
      })),
      [
        {
          filters: [{ column: "domain", type: "eq", value: "safe.example.invalid" }],
          selectedColumns: companyIdentitySelect,
          table: "companies",
        },
      ],
      "Expected typed companies CRM identity helper to select safe company profile columns only.",
    );
    assert.equal(unsafeLeakPattern.test(JSON.stringify(helperResult)), false);

    setEnv(validEnv());
    const routeMock = installMockClient({
      companies: [
        {
          company_name: "Case Match Company",
          customer_rates: { OTHER: 123 },
          domain: "case.example.invalid",
          driver_payout_rules: { OTHER: { max: 1 } },
          id: 202,
        },
      ],
    });
    const success = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-companies-crm-identity?company_name=case%20match%20company", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(success.status, 200);
    assert.equal(success.body.ok, true);
    assert.deepEqual(success.body.company, {
      accounts_email: null,
      billing_address: null,
      billing_email: null,
      company_name: "Case Match Company",
      domain: "case.example.invalid",
      id: 202,
      main_phone: null,
      mobile_phone: null,
      operations_email: null,
      primary_contact_name: null,
      website: null,
    });
    assert.deepEqual(success.body.readiness, {
      external_send: false,
      readOnly: true,
      setupSafe: true,
      source: "typed_companies_crm_identity",
      writeEnabled: false,
    });
    assert.equal(success.body.version, "admin-companies-crm-identity-api-v1");
    assert.equal(unsafeLeakPattern.test(JSON.stringify(success.body)), false);
    assert.equal(
      routeMock.client.operations.every((operation) => operation.action === "select"),
      true,
      "Companies CRM identity route must remain read-only.",
    );
    assert.deepEqual(
      routeMock.client.selectHistory.map((entry) => entry.selectedColumns),
      [companyIdentitySelect],
      "Companies CRM identity route must not select rate, payout, notes, payment, or parser fields.",
    );

    setEnv(validEnv());
    const unsafeParamMock = installMockClient();
    const unsafeParam = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-companies-crm-identity?customer_rates=1", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(unsafeParam.status, 400);
    assert.equal(unsafeParamMock.client.operations.length, 0, "Unsafe params must not reach Supabase.");
    assert.equal(safeApiLeakPattern.test(JSON.stringify(unsafeParam.body)), false);

    for (const [label, request] of [
      ["anonymous", new Request("http://localhost/api/admin-companies-crm-identity?domain=safe.example.invalid")],
      [
        "customer",
        new Request("http://localhost/api/admin-companies-crm-identity?domain=safe.example.invalid", {
          headers: validAdminHeaders({
            referer: "http://localhost/my-bookings",
          }),
        }),
      ],
      [
        "driver",
        new Request("http://localhost/api/admin-companies-crm-identity?domain=safe.example.invalid", {
          headers: validAdminHeaders({
            referer: "http://localhost/driver-job/mock-token",
          }),
        }),
      ],
    ]) {
      setEnv(validEnv());
      const blockedMock = installMockClient();
      const blocked = await responseJson(await route.GET(request));

      assert.equal(blocked.status, 403, `Expected ${label} companies CRM identity access to be blocked`);
      assert.equal(blocked.body.error, routeBlockedMessage);
      assert.equal(blockedMock.createdClients.length, 0, `${label} access must not create Supabase client`);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blocked.body)), false);
    }

    setEnv(validEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_URL: undefined }));
    const configMock = installMockClient();
    const configMissing = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-companies-crm-identity?id=202", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(configMissing.status, 503);
    assert.equal(configMock.createdClients.length, 0, "Missing config must not create a Supabase client.");
    assert.equal(safeApiLeakPattern.test(JSON.stringify(configMissing.body)), false);
  } finally {
    await cleanup();
    restoreEnv();
  }
} catch (error) {
  restoreEnv();
  throw error;
}

console.log("Admin companies CRM identity API contract tests passed.");
