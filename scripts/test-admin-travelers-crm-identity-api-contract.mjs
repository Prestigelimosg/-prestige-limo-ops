import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-travelers-crm-identity-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_TRAVELERS_IDENTITY_SENTINEL";
const supabaseUrlSentinel = "https://travelers-identity-contract.supabase.co";
const unsafeLeakPattern =
  /customer_rates|driver_payout_rules|customer_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token/i;
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_TRAVELERS_IDENTITY_SENTINEL|mock-admin-travelers-crm-identity-session-token|travelers-identity-contract\.supabase\.co|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-travelers-crm-identity.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-travelers-crm-identity/route.ts",
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

function validEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Travelers identity contract admin",
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
    actor_label: "Travelers identity contract admin",
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
      "  const mock = globalThis.__prestigeAdminTravelersCrmIdentityMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked travelers CRM identity Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-travelers-crm-identity-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    reader: require(path.join(tempDir, "lib/admin-travelers-crm-identity.js")),
    route: require(path.join(tempDir, "app/api/admin-travelers-crm-identity/route.js")),
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

  globalThis.__prestigeAdminTravelersCrmIdentityMock = mock;

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
    assert.equal(reader.adminTravelersCrmIdentityVersion, "admin-travelers-crm-identity-api-v1");
    assert.equal(typeof route.GET, "function");
    assert.equal(route.POST, undefined, "Travelers CRM identity route must stay GET-only.");
    assert.equal(route.PATCH, undefined, "Travelers CRM identity route must not expose PATCH.");
    assert.equal(route.DELETE, undefined, "Travelers CRM identity route must not expose DELETE.");

    const appSource = await readFile(path.join(process.cwd(), "app/page.tsx"), "utf8");
    assert.match(appSource, /adminTravelersCrmIdentityApiPath/);
    assert.doesNotMatch(
      appSource,
      /\.from\(adminLegacyTables\.travelers\)\s*\.select\("company_id"\)/,
      "Safe traveler company-id lookup must not use the legacy travelers shim.",
    );

    setEnv(validEnv());
    const helperMock = installMockClient({
      saved_addresses: [
        {
          address: "Safe saved display address",
          address_role: "traveler_default",
          id: 7001,
          is_default: true,
          label: "Default",
          last_used_at: "2026-06-08T01:00:00.000Z",
          traveler_id: 501,
          use_count: 4,
        },
      ],
      travelers: [
        {
          booker_contact: "+65 9123 4567",
          booker_email: "safe.booker@example.test",
          booker_name: "Safe Booker",
          company_id: 301,
          customer_rates: { MNG: 999 },
          default_address: "Safe fallback address",
          default_dropoff_address: "Safe dropoff address",
          default_pickup_address: "Safe pickup address",
          driver_payout_rules: { MNG: { min: 1 } },
          id: 501,
          internal_admin_note: "must not leak",
          preferred_vehicle: "VAN",
          traveler_name: "Safe Traveler",
        },
      ],
    });
    const helperResult = await reader.findAdminTravelerCrmIdentity(
      new URLSearchParams({ traveler_name: "safe traveler" }),
      validActor(),
    );

    assert.equal(helperResult.ok, true);
    assert.deepEqual(helperResult.data, {
      booker_contact: "+65 9123 4567",
      booker_email: "safe.booker@example.test",
      booker_name: "Safe Booker",
      company_id: 301,
      default_address: "Safe fallback address",
      default_dropoff_address: "Safe dropoff address",
      default_pickup_address: "Safe pickup address",
      id: 501,
      preferred_vehicle: "VAN",
      saved_address: {
        address: "Safe saved display address",
        address_role: "traveler_default",
        id: 7001,
        is_default: true,
        label: "Default",
      },
      traveler_name: "Safe Traveler",
    });
    assert.deepEqual(
      helperMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        selectedColumns: entry.selectedColumns,
        table: entry.table,
      })),
      [
        {
          filters: [{ column: "traveler_name", type: "ilike", value: "safe traveler" }],
          selectedColumns:
            "id, company_id, traveler_name, preferred_vehicle, default_address, default_pickup_address, default_dropoff_address, booker_name, booker_contact, booker_email",
          table: "travelers",
        },
        {
          filters: [{ column: "traveler_id", type: "eq", value: 501 }],
          selectedColumns:
            "id, company_id, traveler_id, label, address, address_role, is_default, use_count, last_used_at",
          table: "saved_addresses",
        },
      ],
      "Expected typed travelers CRM identity helper to select safe identity/default-address fields only.",
    );
    assert.equal(unsafeLeakPattern.test(JSON.stringify(helperResult)), false);

    setEnv(validEnv());
    const routeMock = installMockClient({
      saved_addresses: [],
      travelers: [
        {
          booker_contact: null,
          booker_email: null,
          booker_name: "Route Booker",
          company_id: 401,
          default_address: "Route fallback address",
          default_dropoff_address: null,
          default_pickup_address: "Route pickup address",
          id: 601,
          preferred_vehicle: "E-Class",
          traveler_name: "Route Traveler",
        },
      ],
    });
    const success = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-travelers-crm-identity?company_id=401&traveler_name=route%20traveler", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(success.status, 200);
    assert.equal(success.body.ok, true);
    assert.equal(success.body.traveler.company_id, 401);
    assert.equal(success.body.traveler.traveler_name, "Route Traveler");
    assert.deepEqual(success.body.readiness, {
      external_send: false,
      readOnly: true,
      setupSafe: true,
      source: "typed_travelers_crm_identity",
      writeEnabled: false,
    });
    assert.equal(success.body.version, "admin-travelers-crm-identity-api-v1");
    assert.equal(unsafeLeakPattern.test(JSON.stringify(success.body)), false);
    assert.equal(
      routeMock.client.operations.every((operation) => operation.action === "select"),
      true,
      "Travelers CRM identity route must remain read-only.",
    );
    assert.equal(
      unsafeLeakPattern.test(routeMock.client.selectHistory.map((entry) => entry.selectedColumns).join(",")),
      false,
      "Travelers CRM identity route must not select rate, payout, billing, payment, parser, or private fields.",
    );

    setEnv(validEnv());
    const unsafeParamMock = installMockClient();
    const unsafeParam = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-travelers-crm-identity?customer_rates=1", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(unsafeParam.status, 400);
    assert.equal(unsafeParamMock.client.operations.length, 0, "Unsafe params must not reach Supabase.");
    assert.equal(safeApiLeakPattern.test(JSON.stringify(unsafeParam.body)), false);

    for (const [label, request] of [
      ["anonymous", new Request("http://localhost/api/admin-travelers-crm-identity?traveler_name=Safe%20Traveler")],
      [
        "customer",
        new Request("http://localhost/api/admin-travelers-crm-identity?traveler_name=Safe%20Traveler", {
          headers: validAdminHeaders({
            referer: "http://localhost/my-bookings",
          }),
        }),
      ],
      [
        "driver",
        new Request("http://localhost/api/admin-travelers-crm-identity?traveler_name=Safe%20Traveler", {
          headers: validAdminHeaders({
            referer: "http://localhost/driver-job/mock-token",
          }),
        }),
      ],
    ]) {
      setEnv(validEnv());
      const blockedMock = installMockClient();
      const blocked = await responseJson(await route.GET(request));

      assert.equal(blocked.status, 403, `Expected ${label} travelers CRM identity access to be blocked`);
      assert.equal(blocked.body.error, routeBlockedMessage);
      assert.equal(blockedMock.createdClients.length, 0, `${label} access must not create Supabase client`);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blocked.body)), false);
    }

    setEnv(validEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined, SUPABASE_URL: undefined }));
    const configMock = installMockClient();
    const configMissing = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-travelers-crm-identity?id=601", {
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

console.log("Admin travelers CRM identity API contract tests passed.");
