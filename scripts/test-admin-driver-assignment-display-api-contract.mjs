import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-driver-assignment-display-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_DRIVER_ASSIGNMENT_DISPLAY_SENTINEL";
const supabaseUrlSentinel = "https://driver-assignment-display-contract.supabase.co";
const unsafeLeakPattern =
  /payout_preferences|driver_payout_rules|customer_rates|customer_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|pricing|billing|commission|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|preferred_areas|airport_permit_notes|server_secret|token_hash|raw_token/i;
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_DRIVER_ASSIGNMENT_DISPLAY_SENTINEL|mock-admin-driver-assignment-display-session-token|driver-assignment-display-contract\.supabase\.co|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-driver-assignment-display.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-driver-assignment-display/route.ts",
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
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Driver assignment display contract admin",
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
    actor_label: "Driver assignment display contract admin",
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
      "  const mock = globalThis.__prestigeAdminDriverAssignmentDisplayMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked driver assignment display Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-driver-assignment-display-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    reader: require(path.join(tempDir, "lib/admin-driver-assignment-display.js")),
    route: require(path.join(tempDir, "app/api/admin-driver-assignment-display/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.orderBy = [];
    this.resultLimit = null;
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
      drivers: [],
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

  selectRows(table, filters, orderBy, resultLimit, selectedColumns) {
    const failure = this.failures[`select:${table}`] || this.failures[table] || null;

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
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

    let rows = this.filterRows(table, filters);

    for (const order of [...orderBy].reverse()) {
      rows = [...rows].sort((left, right) => {
        const leftValue = String(left[order.column] || "");
        const rightValue = String(right[order.column] || "");
        const result = leftValue.localeCompare(rightValue);

        return order.options?.ascending === false ? -result : result;
      });
    }

    if (resultLimit) {
      rows = rows.slice(0, resultLimit);
    }

    const selected = selectedColumns
      ? selectedColumns.split(",").map((column) => column.trim()).filter(Boolean)
      : [];

    return {
      data: rows.map((row) =>
        Object.fromEntries(selected.map((column) => [column, row[column]])),
      ),
      error: null,
    };
  }
}

function seedDrivers() {
  return {
    drivers: [
      {
        availability_status: "available",
        contact_number: "+65 8123 4567",
        driver_name: "Aisha Driver",
        driver_payout_rules: { airport: 90 },
        id: 1,
        notes: "internal admin note must not leak",
        payout_preferences: "PayNow payout",
        plate_number: "SLA1234X",
        preferred_areas: "Airport",
        vehicle_type: "Mercedes V-Class",
      },
      {
        airport_permit_notes: "private permit note",
        availability_status: "busy",
        contact_number: "+65 8999 0000",
        driver_name: "Bala Driver",
        id: 2,
        plate_number: "SMA8888Z",
        vehicle_type: "Toyota Alphard",
      },
      {
        availability_status: "driver_payout",
        contact_number: "customer_price",
        driver_name: "driver_payout",
        id: 3,
        plate_number: "paynow",
        vehicle_type: "billing",
      },
    ],
  };
}

function installMock(seed = seedDrivers(), options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeAdminDriverAssignmentDisplayMock = mock;

  return mock;
}

async function readJson(response) {
  return response.json();
}

function request(url, headers = validAdminHeaders()) {
  return new Request(url, {
    headers,
    method: "GET",
  });
}

function assertSafeApiPayload(payload, label) {
  const body = JSON.stringify(payload);

  assert.equal(
    unsafeLeakPattern.test(body),
    false,
    `${label} must not leak payout, rate, pricing, billing, notes, or internal fields: ${body}`,
  );
  assert.equal(
    safeApiLeakPattern.test(body),
    false,
    `${label} must not leak server-only implementation or secret details: ${body}`,
  );
}

function assertSafeSelectColumns(selectHistory, label) {
  const selectedColumns = selectHistory.map((entry) => entry.selectedColumns).join(" ");

  assert.equal(
    selectedColumns,
    "id, driver_name, contact_number, vehicle_type, plate_number, availability_status",
    `${label} must select only safe driver assignment/display columns.`,
  );
  assert.equal(
    unsafeLeakPattern.test(selectedColumns),
    false,
    `${label} selected unsafe driver fields: ${selectedColumns}`,
  );
}

const harness = await loadHarness();

try {
  const { reader, route } = harness;
  const helperSource = await readFile("lib/admin-driver-assignment-display.ts", "utf8");
  const routeSource = await readFile("app/api/admin-driver-assignment-display/route.ts", "utf8");
  const appPageSource = await readFile("app/page.tsx", "utf8");

  assert.equal(
    reader.adminDriverAssignmentDisplayVersion,
    "admin-driver-assignment-display-api-v1",
    "Helper must expose a stable version.",
  );
  assert.equal(typeof route.GET, "function", "Route must expose GET.");
  assert.equal(route.POST, undefined, "Route must not expose POST.");
  assert.equal(route.PATCH, undefined, "Route must not expose PATCH.");
  assert.equal(route.PUT, undefined, "Route must not expose PUT.");
  assert.equal(route.DELETE, undefined, "Route must not expose DELETE.");
  assert.equal(routeSource.includes("listAdminDriverAssignmentDisplay"), true);
  assert.equal(helperSource.includes('from("drivers")'), true, "Helper must target drivers.");
  assert.equal(helperSource.includes(".update("), false, "Helper must not write drivers.");
  assert.equal(helperSource.includes(".insert("), false, "Helper must not insert drivers.");
  assert.equal(helperSource.includes(".delete("), false, "Helper must not delete drivers.");
  assert.equal(
    appPageSource.includes("/api/admin-driver-assignment-display"),
    true,
    "Booking driver assignment display must use the typed display-only API.",
  );
  assert.equal(
    appPageSource.includes("driverAssignmentDisplayDrivers"),
    true,
    "Booking driver assignment display state must stay split from full driver profile state.",
  );
  assert.equal(
    appPageSource.includes("driverProfileDisplayDrivers"),
    true,
    "Driver Database display state must stay split from full driver profile state.",
  );
  assert.equal(
    appPageSource.includes("async function loadDriverAssignmentDisplayDrivers"),
    true,
    "Booking driver assignment display must use a dedicated typed loader.",
  );
  assert.equal(
    appPageSource.includes("const assignedDriverSelectValue = assignedDriverId;"),
    true,
    "Verified driver selection must remain empty until an explicit persisted driver ID is selected.",
  );
  assert.equal(
    appPageSource.includes("assignedDriverId || (assignedDriverRecord ? String(assignedDriverRecord.id) : \"\")"),
    false,
    "Driver names must not make an unverified legacy assignment appear selected.",
  );
  assert.equal(
    appPageSource.includes("payout_preferences, driver_payout_rules"),
    true,
    "Full driver profile shim risk must remain visible/parked until a later write-path split.",
  );
  const assignmentLoaderSource = appPageSource.slice(
    appPageSource.indexOf("async function loadDriverAssignmentDisplayDrivers"),
    appPageSource.indexOf("async function saveDriverProfile"),
  );
  assert.equal(
    assignmentLoaderSource.includes("adminLegacyDataClient"),
    false,
    "Driver assignment display loader must not use the legacy shim client.",
  );
  assert.equal(
    assignmentLoaderSource.includes("payout_preferences") || assignmentLoaderSource.includes("driver_payout_rules"),
    false,
    "Driver assignment display loader must not use payout-aware driver profile fields.",
  );
  const profileDisplaySearchSource = appPageSource.slice(
    appPageSource.indexOf("function driverDisplayMatchesSearch"),
    appPageSource.indexOf("function isRatesSetupErrorMessage"),
  );
  assert.equal(
    profileDisplaySearchSource.includes("DriverAssignmentDisplayRecord"),
    true,
    "Driver Database display search must use the typed display-only record.",
  );
  assert.equal(
    unsafeLeakPattern.test(profileDisplaySearchSource),
    false,
    "Driver Database display search must not include payout, rate, notes, preferred areas, or internal fields.",
  );
  const fullProfileLoadSource = appPageSource.slice(
    appPageSource.indexOf("async function loadDrivers"),
    appPageSource.indexOf("async function fetchDriverAssignmentDisplayDriverRecords"),
  );
  assert.equal(
    fullProfileLoadSource.includes("fetchDriverAssignmentDisplayDriverRecords"),
    true,
    "Driver Database load must refresh the typed display-only list.",
  );
  assert.equal(
    fullProfileLoadSource.includes("setDriverProfileDisplayDrivers"),
    true,
    "Driver Database load must store typed display rows separately from full profile rows.",
  );
  const applyDriverSource = appPageSource.slice(
    appPageSource.indexOf("function applyDriverToBooking"),
    appPageSource.indexOf("function updateDriverProfilePayout"),
  );
  assert.equal(
    applyDriverSource.includes("driverAssignmentDisplayDrivers"),
    true,
    "Booking driver selection must read from display-only driver state.",
  );
  assert.equal(
    applyDriverSource.includes("selectedDriver.notes"),
    false,
    "Booking driver selection must not copy full-profile internal driver notes.",
  );
  assert.equal(
    applyDriverSource.includes("payout_preferences") || applyDriverSource.includes("driver_payout_rules"),
    false,
    "Booking driver selection must not use payout-aware driver profile fields.",
  );

  {
    const mock = installMock();

    setEnv(validEnv());
    const result = await reader.listAdminDriverAssignmentDisplay(
      new URLSearchParams("limit=2"),
      validActor(),
    );

    assert.equal(result.ok, true);
    assert.deepEqual(result.data, [
      {
        availability_status: "available",
        contact_number: "+65 8123 4567",
        driver_name: "Aisha Driver",
        id: 1,
        plate_number: "SLA1234X",
        vehicle_type: "Mercedes V-Class",
      },
      {
        availability_status: "busy",
        contact_number: "+65 8999 0000",
        driver_name: "Bala Driver",
        id: 2,
        plate_number: "SMA8888Z",
        vehicle_type: "Toyota Alphard",
      },
    ]);
    assert.deepEqual(mock.client.operations, [{ action: "select", filters: [], table: "drivers" }]);
    assertSafeSelectColumns(mock.client.selectHistory, "Helper read");
    assertSafeApiPayload(result.data, "Helper read");
  }

  {
    const mock = installMock();

    setEnv(validEnv());
    const response = await route.GET(
      request("http://localhost/api/admin-driver-assignment-display?plate_number=SMA8888Z"),
    );
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.equal(payload.version, "admin-driver-assignment-display-api-v1");
    assert.deepEqual(payload.readiness, {
      external_send: false,
      fullProfileWritePathParked: true,
      readOnly: true,
      setupSafe: true,
      source: "typed_driver_assignment_display",
      writeEnabled: false,
    });
    assert.deepEqual(payload.drivers, [
      {
        availability_status: "busy",
        contact_number: "+65 8999 0000",
        driver_name: "Bala Driver",
        id: 2,
        plate_number: "SMA8888Z",
        vehicle_type: "Toyota Alphard",
      },
    ]);
    assert.equal(mock.createdClients.length, 1);
    assert.deepEqual(mock.client.selectHistory[0].filters, [
      { column: "plate_number", type: "eq", value: "SMA8888Z" },
    ]);
    assertSafeSelectColumns(mock.client.selectHistory, "Route filtered read");
    assertSafeApiPayload(payload, "Route filtered read");
  }

  {
    const mock = installMock();

    setEnv(validEnv());
    const response = await route.GET(
      request("http://localhost/api/admin-driver-assignment-display?id=3"),
    );
    const payload = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(payload.ok, true);
    assert.deepEqual(payload.drivers, [
      {
        availability_status: null,
        contact_number: null,
        driver_name: null,
        id: 3,
        plate_number: null,
        vehicle_type: null,
      },
    ]);
    assert.equal(mock.client.selectHistory[0].limit, 1);
    assertSafeApiPayload(payload, "Sanitized route read");
  }

  {
    const mock = installMock();

    setEnv(validEnv());
    const response = await route.GET(
      request("http://localhost/api/admin-driver-assignment-display?driver_payout_rules=1"),
    );
    const payload = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(payload.ok, false);
    assert.equal(mock.createdClients.length, 0, "Unsafe params must be rejected before Supabase client creation.");
    assertSafeApiPayload(payload, "Unsafe params response");
  }

  {
    const mock = installMock();

    setEnv(validEnv());
    const response = await route.GET(
      request("http://localhost/api/admin-driver-assignment-display", {
        referer: "http://localhost/customers",
      }),
    );
    const payload = await readJson(response);

    assert.equal(response.status, 403);
    assert.equal(payload.error, routeBlockedMessage);
    assert.equal(mock.createdClients.length, 0, "Blocked public surfaces must not create Supabase clients.");
    assertSafeApiPayload(payload, "Blocked route response");
  }

  {
    const mock = installMock();

    setEnv(validEnv({ SUPABASE_SERVICE_ROLE_KEY: undefined }));
    const response = await route.GET(
      request("http://localhost/api/admin-driver-assignment-display"),
    );
    const payload = await readJson(response);

    assert.equal(response.status, 503);
    assert.equal(payload.ok, false);
    assert.equal(mock.createdClients.length, 0, "Missing config must not create Supabase clients.");
    assertSafeApiPayload(payload, "Missing config response");
  }

  {
    const mock = installMock(seedDrivers(), {
      failures: {
        "select:drivers": {
          code: "42501",
          message: "permission denied for drivers",
        },
      },
    });

    setEnv(validEnv());
    const result = await reader.listAdminDriverAssignmentDisplay({}, validActor());

    assert.equal(result.ok, false);
    assert.equal(result.category, "permission_or_rls_denied");
    assert.equal(mock.createdClients.length, 1);
  }
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminDriverAssignmentDisplayMock;
  await harness.cleanup();
}

console.log("admin driver assignment display API contract ok");
