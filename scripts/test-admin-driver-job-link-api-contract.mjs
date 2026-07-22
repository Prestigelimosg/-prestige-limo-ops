import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledDriverJobLinkError =
  "Admin driver job link persistence is not enabled on this server.";
const serverSessionToken = "mock-admin-driver-job-link-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_DRIVER_JOB_LINK_SENTINEL";
const supabaseUrlSentinel = "https://driver-job-link-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_DRIVER_JOB_LINK_SENTINEL|mock-admin-driver-job-link-session-token|driver-job-link-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|key|createClient/i;
const unsafeDriverJobLinkLeakPattern =
  /token_hash|raw_token|driver_job_token|safe_link_context|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret/i;
const sourceFiles = [
  "lib/admin-driver-job-link-persistence.ts",
  "lib/admin-live-location-runtime-control.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/driver-device-push-notification.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-status-workflow.ts",
  "app/api/admin-driver-job-links/route.ts",
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

function transpileTypescript(source, filename) {
  return ts.transpileModule(source.replace(/\.ts(["'])/g, ".js$1"), {
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
  const webPushPath = path.join(tempDir, "node_modules/web-push/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(webPushPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeAdminDriverJobLinkApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
  await writeFile(
    webPushPath,
    "module.exports = { sendNotification: async () => undefined, setVapidDetails: () => undefined };",
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-driver-job-link-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(tempDir, "lib/admin-driver-job-link-persistence.js")),
    route: require(path.join(tempDir, "app/api/admin-driver-job-links/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.onConflict = null;
    this.orderBy = null;
    this.payload = null;
    this.resultLimit = null;
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
  }

  eq(column, value) {
    this.filters.push({ column, type: "eq", value });

    return this;
  }

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  limit(count) {
    this.resultLimit = count;

    return this;
  }

  order(column, options) {
    this.orderBy = { column, options };

    return this;
  }

  select(columns) {
    if (!this.operation) {
      this.operation = "select";
    }

    this.selectedColumns = columns;

    return this;
  }

  single() {
    this.resultMode = "single";

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return this;
  }

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  upsert(payload, options = {}) {
    this.operation = "upsert";
    this.onConflict = options.onConflict || null;
    this.payload = payload;

    return this;
  }

  execute() {
    if (this.operation === "insert") {
      return this.client.insertRows(this.table, this.payload, this.resultMode);
    }

    if (this.operation === "upsert") {
      return this.client.upsertRows(
        this.table,
        this.payload,
        this.onConflict,
        this.resultMode,
      );
    }

    if (this.operation === "update") {
      return this.client.updateRows(this.table, this.payload, this.filters, this.resultMode);
    }

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
    this.nextId = 1;
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      bookings: [
        { booking_reference: "JOB-LINK-CONTRACT-001", driver_id: 27 },
        { booking_reference: "JOB-LINK-CONTRACT-OPTIONAL-DRIVER", driver_id: null },
        { booking_reference: "JOB-LINK-CONTRACT-BROWSER-DASHBOARD", driver_id: 28 },
        { booking_reference: "May 2026 / JOB-UBS-042", driver_id: 29 },
      ],
      driver_live_location_runtime_settings: [],
      driver_device_push_subscriptions: [],
      driver_job_links: [],
    };

    for (const [table, rows] of Object.entries(seed)) {
      this.tables[table] = rows.map((row) => clone(row));
    }
  }

  from(table) {
    assert.ok(this.tables[table], `Unexpected mocked Supabase table: ${table}`);

    return new MockSupabaseQuery(this, table);
  }

  failureFor(action, table) {
    return this.failures[`${action}:${table}`] || this.failures[table] || null;
  }

  filterRows(table, filters) {
    return this.tables[table].filter((row) =>
      filters.every((filter) => row[filter.column] === filter.value),
    );
  }

  nextUuid() {
    const suffix = String(this.nextId++).padStart(12, "0");

    return `00000000-0000-4000-8000-${suffix}`;
  }

  insertRows(table, payload, mode) {
    const failure = this.failureFor("insert", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
      id: row.id || this.nextUuid(),
      created_at: row.created_at || "2026-06-10T01:00:00.000Z",
      ...clone(row),
    }));

    this.tables[table].push(...rows);
    this.operations.push({ payload: clone(payload), table, type: "insert" });

    return {
      data: mode === "single" ? clone(rows[0]) : clone(rows),
      error: null,
    };
  }

  upsertRows(table, payload, onConflict, mode) {
    const failure = this.failureFor("upsert", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = Array.isArray(payload) ? payload : [payload];
    const upsertedRows = rows.map((row) => {
      const conflictKey = onConflict || "id";
      const existing = this.tables[table].find(
        (tableRow) => tableRow[conflictKey] === row[conflictKey],
      );

      if (existing) {
        Object.assign(existing, clone(row));

        return existing;
      }

      const nextRow = {
        id: row.id || this.nextUuid(),
        created_at: row.created_at || "2026-06-10T01:00:00.000Z",
        ...clone(row),
      };

      this.tables[table].push(nextRow);

      return nextRow;
    });

    this.operations.push({
      onConflict,
      payload: clone(payload),
      table,
      type: "upsert",
    });

    return {
      data:
        mode === "single" || mode === "maybeSingle"
          ? clone(upsertedRows[0] || null)
          : clone(upsertedRows),
      error: null,
    };
  }

  selectRows(table, filters, orderBy, resultLimit, resultMode, selectedColumns) {
    const failure = this.failureFor("select", table);

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    let rows = this.filterRows(table, filters);

    if (orderBy) {
      rows = [...rows].sort((first, second) => {
        const direction = orderBy.options?.ascending === false ? -1 : 1;

        return String(first[orderBy.column] || "").localeCompare(String(second[orderBy.column] || "")) * direction;
      });
    }

    if (resultLimit) {
      rows = rows.slice(0, resultLimit);
    }

    if (resultMode === "single") {
      return {
        data: clone(rows[0] || null),
        error: rows[0] ? null : { code: "PGRST116" },
      };
    }

    if (resultMode === "maybeSingle") {
      return {
        data: clone(rows[0] || null),
        error: null,
      };
    }

    return {
      data: clone(rows),
      error: null,
    };
  }

  updateRows(table, payload, filters, mode) {
    const failure = this.failureFor("update", table);

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.filterRows(table, filters);

    for (const row of rows) {
      Object.assign(row, clone(payload));
    }

    this.operations.push({ filters: clone(filters), payload: clone(payload), table, type: "update" });

    return {
      data: mode === "single" ? clone(rows[0] || null) : clone(rows),
      error: null,
    };
  }
}

function adminHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...overrides,
  };
}

function dashboardBrowserHeaders(overrides = {}) {
  const headers = adminHeaders(overrides);

  delete headers["x-prestige-admin-session-token"];

  return headers;
}

function safeEnv(enabled = true) {
  setEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: enabled ? "true" : "false",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Driver job link contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  });
}

function safeCreatePayload(overrides = {}) {
  return {
    booking_reference: "JOB-LINK-CONTRACT-001",
    driver_job_payload: {
      assigned_driver_contact: "+65 8777 0000",
      assigned_driver_name: "Contract Driver",
      assigned_driver_plate: "SLA1234A",
      assigned_driver_vehicle_model: "Toyota Alphard",
      booking_type: "DEP",
      dropoff_location: "Changi Airport Terminal 3",
      flight_no: "SQ321",
      passenger_name: "Guest Tan",
      pickup_datetime: "2026-06-12T10:30:00.000+08:00",
      pickup_location: "Raffles Hotel Singapore",
      route: "Raffles Hotel Singapore > Changi Airport Terminal 3",
      status: "assigned",
    },
    ttl_hours: 96,
    ...overrides,
  };
}

function requestWithJson(method, url, body, headers = adminHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method,
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoApiLeak(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeApiLeakPattern, `${label} leaked server/env details.`);
}

function assertNoUnsafeDriverJobLinkLeak(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, unsafeDriverJobLinkLeakPattern, `${label} leaked unsafe driver job link data.`);
}

const harness = await loadHarness();

try {
  safeEnv(false);

  const disabledClient = new MockSupabaseClient();
  globalThis.__prestigeAdminDriverJobLinkApiMock = {
    client: disabledClient,
    createdClients: [],
  };

  const disabledRead = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-driver-job-links?booking_reference=JOB-LINK-CONTRACT-001", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(disabledRead.status, 503);
  assert.equal(disabledRead.body.ok, false);
  assert.equal(disabledRead.body.error, disabledDriverJobLinkError);
  assert.equal(disabledClient.operations.length, 0);
  assertNoApiLeak(disabledRead, "disabled read");

  const anonymousRead = await readResponse(
    await harness.route.GET(new Request("http://localhost/api/admin-driver-job-links")),
  );
  const customerRefererWrite = await readResponse(
    await harness.route.POST(
      requestWithJson("POST", "http://localhost/api/admin-driver-job-links", safeCreatePayload(), {
        ...adminHeaders(),
        referer: "http://localhost/book",
      }),
    ),
  );
  const driverRefererRead = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-driver-job-links", {
        headers: {
          ...adminHeaders(),
          referer: "http://localhost/driver-job-demo",
        },
      }),
    ),
  );

  for (const blocked of [anonymousRead, customerRefererWrite, driverRefererRead]) {
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.ok, false);
    assert.equal(blocked.body.error, routeBlockedMessage);
    assertNoApiLeak(blocked, "blocked route");
  }

  const unsafePayload = await readResponse(
    await harness.route.POST(
      requestWithJson(
        "POST",
        "http://localhost/api/admin-driver-job-links",
        safeCreatePayload({
          driver_job_payload: {
            ...safeCreatePayload().driver_job_payload,
            route: "Raffles Hotel > Changi Airport with PayNow payout",
          },
        }),
      ),
    ),
  );

  assert.equal(unsafePayload.status, 400);
  assert.equal(unsafePayload.body.ok, false);
  assertNoApiLeak(unsafePayload, "unsafe payload rejection");

  safeEnv(true);

  const client = new MockSupabaseClient();
  const createdClients = [];
  globalThis.__prestigeAdminDriverJobLinkApiMock = {
    client,
    createdClients,
  };

  const parsed = harness.persistence.parseAdminDriverJobLinkCreatePayload(safeCreatePayload());

  assert.equal(parsed.ok, true);
  assert.equal(parsed.data.ttl_hours, 96);
  assert.equal(
    harness.persistence.parseAdminDriverJobLinkCreatePayload(
      safeCreatePayload({ ttl_hours: 97 }),
    ).ok,
    false,
    "Admin link creation must reject a private-link lifetime beyond 96 hours.",
  );

  const created = await readResponse(
    await harness.route.POST(
      requestWithJson("POST", "http://localhost/api/admin-driver-job-links", safeCreatePayload()),
    ),
  );

  assert.equal(created.status, 200);
  assert.equal(created.body.ok, true);
  assert.equal(created.body.token_display_once, true);
  assert.match(created.body.driver_job_url, /^https:\/\/app\.prestigelimo\.sg\/driver-job\/[A-Za-z0-9_-]+$/);
  assert.equal(created.body.link.booking_reference, "JOB-LINK-CONTRACT-001");
  assert.equal(created.body.link.link_status, "active");
  assert.equal(created.body.link.safe_summary.assigned_driver, "Contract Driver");
  assert.equal(created.body.link.safe_summary.job_card_kind, "new");
  assert.equal(created.body.link.safe_summary.vehicle, "Toyota Alphard");
  assert.equal(created.body.live_location.authorized, true);
  assert.equal(created.body.live_location.customerVisible, false);
  assert.equal(created.body.live_location.external_send, false);
  assert.equal(created.body.live_location.runtime_status, "active");
  assert.deepEqual(created.body.live_location.allowed_booking_references, [
    "JOB-LINK-CONTRACT-001",
  ]);
  assertNoApiLeak(created, "create response");
  assertNoUnsafeDriverJobLinkLeak(created.body.link, "create link payload");
  assert.doesNotMatch(JSON.stringify(created.body), /token_hash|raw_token|driver_job_token/i);

  assert.equal(createdClients.length, 2);
  assert.equal(createdClients[0].url, supabaseUrlSentinel);
  assert.equal(createdClients[0].serviceRoleKey, serviceRoleSentinel);
  assert.equal(createdClients[1].url, supabaseUrlSentinel);
  assert.equal(createdClients[1].serviceRoleKey, serviceRoleSentinel);
  assert.equal(client.tables.driver_job_links.length, 1);
  assert.equal(
    client.tables.driver_job_links[0].driver_id,
    27,
    "Driver Job link must bind the exact saved booking's verified driver ID server-side.",
  );
  assert.equal(client.tables.driver_live_location_runtime_settings.length, 1);
  assert.equal(
    client.tables.driver_live_location_runtime_settings[0].setting_name,
    "driver_live_location_runtime",
  );
  assert.deepEqual(
    client.tables.driver_live_location_runtime_settings[0]
      .driver_live_location_allowed_job_references,
    ["JOB-LINK-CONTRACT-001"],
  );
  assert.equal(
    client.tables.driver_live_location_runtime_settings[0]
      .driver_live_location_capture_enabled,
    true,
  );
  assert.equal(
    client.tables.driver_live_location_runtime_settings[0]
      .admin_active_jobs_map_enabled,
    true,
  );
  assert.match(client.tables.driver_job_links[0].token_hash, /^[a-f0-9]{64}$/);
  assert.equal(client.tables.driver_job_links[0].safe_link_context.driver_job_payload.assigned_driver_name, "Contract Driver");
  assert.equal(client.tables.driver_job_links[0].safe_link_context.driver_job_payload.pickup_location, "Raffles Hotel Singapore");
  assert.equal(client.tables.driver_job_links[0].safe_link_context.job_card_kind, "new");
  assert.match(client.tables.driver_job_links[0].safe_link_context.job_card_revision, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(client.tables.driver_job_links[0].safe_link_context), /paynow|payout|invoice|payment|pdf|token/i);

  assert.equal(
    harness.persistence.classifyAdminDriverJobCardKind(null, safeCreatePayload().driver_job_payload),
    "new",
  );
  assert.equal(
    harness.persistence.classifyAdminDriverJobCardKind(
      { driver_job_payload: safeCreatePayload().driver_job_payload },
      safeCreatePayload().driver_job_payload,
    ),
    "reissued",
  );
  assert.equal(
    harness.persistence.classifyAdminDriverJobCardKind(
      { driver_job_payload: safeCreatePayload().driver_job_payload },
      {
        ...safeCreatePayload().driver_job_payload,
        pickup_datetime: "2026-06-12T11:00:00.000+08:00",
      },
    ),
    "amendment",
  );
  assert.equal(
    harness.persistence.classifyAdminDriverJobCardKind(
      { driver_job_payload: { pickup_location: "Incomplete historic snapshot" } },
      safeCreatePayload().driver_job_payload,
    ),
    null,
    "Historic unsafe/incomplete snapshots must not be guessed as New or Amendment.",
  );

  const optionalDriverDetailsPayload = safeCreatePayload({
    booking_reference: "JOB-LINK-CONTRACT-OPTIONAL-DRIVER",
    driver_job_payload: {
      assigned_driver_vehicle_model: "Vehicle TBC",
      booking_type: "DEP",
      dropoff_location: "Changi Airport Terminal 3",
      flight_no: "SQ321",
      passenger_name: "Guest Tan",
      pickup_datetime: "2026-06-12T10:30:00.000+08:00",
      pickup_location: "Raffles Hotel Singapore",
      route: "Raffles Hotel Singapore > Changi Airport Terminal 3",
      status: "assigned",
    },
  });
  const optionalDriverDetailsCreate = await readResponse(
    await harness.route.POST(
      requestWithJson(
        "POST",
        "http://localhost/api/admin-driver-job-links",
        optionalDriverDetailsPayload,
      ),
    ),
  );

  assert.equal(optionalDriverDetailsCreate.status, 200);
  assert.equal(optionalDriverDetailsCreate.body.ok, true);
  assert.equal(optionalDriverDetailsCreate.body.link.booking_reference, "JOB-LINK-CONTRACT-OPTIONAL-DRIVER");
  assert.equal(optionalDriverDetailsCreate.body.link.safe_summary.assigned_driver, null);
  assert.equal(optionalDriverDetailsCreate.body.link.safe_summary.vehicle, "Vehicle TBC");
  assert.equal(optionalDriverDetailsCreate.body.live_location.authorized, true);
  assert.deepEqual(
    optionalDriverDetailsCreate.body.live_location.allowed_booking_references,
    ["JOB-LINK-CONTRACT-001", "JOB-LINK-CONTRACT-OPTIONAL-DRIVER"],
  );
  assert.equal(client.tables.driver_job_links.length, 2);
  assert.deepEqual(
    client.tables.driver_live_location_runtime_settings[0]
      .driver_live_location_allowed_job_references,
    ["JOB-LINK-CONTRACT-001", "JOB-LINK-CONTRACT-OPTIONAL-DRIVER"],
  );
  assert.equal(
    client.tables.driver_job_links[1].safe_link_context.driver_job_payload.assigned_driver_name,
    undefined,
  );
  assert.equal(
    client.tables.driver_job_links[1].safe_link_context.driver_job_payload.assigned_driver_contact,
    undefined,
  );
  assert.equal(
    client.tables.driver_job_links[1].safe_link_context.driver_job_payload.assigned_driver_plate,
    undefined,
  );
  assertNoApiLeak(optionalDriverDetailsCreate, "optional driver details create response");
  assertNoUnsafeDriverJobLinkLeak(optionalDriverDetailsCreate.body.link, "optional driver details link payload");

  const dashboardBrowserCreate = await readResponse(
    await harness.route.POST(
      requestWithJson(
        "POST",
        "http://localhost/api/admin-driver-job-links",
        safeCreatePayload({
          booking_reference: "JOB-LINK-CONTRACT-BROWSER-DASHBOARD",
          driver_job_payload: {
            ...safeCreatePayload().driver_job_payload,
            assigned_driver_name: undefined,
            assigned_driver_contact: undefined,
            assigned_driver_plate: undefined,
            assigned_driver_vehicle_model: "Vehicle TBC",
          },
        }),
        dashboardBrowserHeaders(),
      ),
    ),
  );

  assert.equal(dashboardBrowserCreate.status, 200);
  assert.equal(dashboardBrowserCreate.body.ok, true);
  assert.equal(dashboardBrowserCreate.body.token_display_once, true);
  assert.match(
    dashboardBrowserCreate.body.driver_job_url,
    /^https:\/\/app\.prestigelimo\.sg\/driver-job\/[A-Za-z0-9_-]+$/,
  );
  assert.equal(dashboardBrowserCreate.body.link.booking_reference, "JOB-LINK-CONTRACT-BROWSER-DASHBOARD");
  assert.equal(dashboardBrowserCreate.body.link.actor_role, "admin");
  assert.equal(dashboardBrowserCreate.body.link.safe_summary.assigned_driver, null);
  assert.equal(dashboardBrowserCreate.body.live_location.authorized, true);
  assert.deepEqual(
    dashboardBrowserCreate.body.live_location.allowed_booking_references,
    [
      "JOB-LINK-CONTRACT-001",
      "JOB-LINK-CONTRACT-OPTIONAL-DRIVER",
      "JOB-LINK-CONTRACT-BROWSER-DASHBOARD",
    ],
  );
  assertNoApiLeak(dashboardBrowserCreate, "dashboard browser create response");
  assertNoUnsafeDriverJobLinkLeak(
    dashboardBrowserCreate.body.link,
    "dashboard browser create link payload",
  );
  assert.doesNotMatch(JSON.stringify(dashboardBrowserCreate.body), /token_hash|raw_token|driver_job_token/i);
  assert.equal(client.tables.driver_job_links.length, 3);
  assert.deepEqual(
    client.tables.driver_live_location_runtime_settings[0]
      .driver_live_location_allowed_job_references,
    [
      "JOB-LINK-CONTRACT-001",
      "JOB-LINK-CONTRACT-OPTIONAL-DRIVER",
      "JOB-LINK-CONTRACT-BROWSER-DASHBOARD",
    ],
  );

  const listed = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-driver-job-links?booking_reference=JOB-LINK-CONTRACT-001&limit=10&page=1", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(listed.status, 200);
  assert.equal(listed.body.ok, true);
  assert.equal(listed.body.links.length, 1);
  assert.equal(listed.body.links[0].booking_reference, "JOB-LINK-CONTRACT-001");
  assert.equal(listed.body.links[0].safe_summary.acknowledged, false);
  assert.equal(listed.body.links[0].safe_summary.acknowledged_at, null);
  assertNoApiLeak(listed, "listed response");
  assertNoUnsafeDriverJobLinkLeak(listed, "listed response");
  assert.doesNotMatch(JSON.stringify(listed.body), /driver_job_url/i);

  client.tables.driver_job_links[0].safe_link_context.driver_acknowledged_at =
    "2026-07-16T12:45:00.000Z";
  const acknowledgedListed = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-driver-job-links?booking_reference=JOB-LINK-CONTRACT-001&link_status=active&limit=10&page=1", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(acknowledgedListed.status, 200);
  assert.equal(acknowledgedListed.body.ok, true);
  assert.equal(acknowledgedListed.body.links.length, 1);
  assert.equal(acknowledgedListed.body.links[0].booking_reference, "JOB-LINK-CONTRACT-001");
  assert.equal(acknowledgedListed.body.links[0].safe_summary.acknowledged, true);
  assert.equal(
    acknowledgedListed.body.links[0].safe_summary.acknowledged_at,
    "2026-07-16T12:45:00.000Z",
  );
  assertNoApiLeak(acknowledgedListed, "acknowledged listed response");
  assertNoUnsafeDriverJobLinkLeak(
    acknowledgedListed,
    "acknowledged listed response",
  );

  client.tables.driver_job_links.push({
    actor_label: "Dashboard test admin",
    actor_role: "admin",
    booking_reference: "May 2026 / JOB-UBS-042",
    created_at: "2026-06-10T02:00:00.000Z",
    expires_at: "2026-06-12T02:00:00.000Z",
    id: "22222222-2222-4222-8222-222222222222",
    issued_at: "2026-06-10T02:00:00.000Z",
    link_status: "active",
    revoked_at: null,
    safe_link_context: {
      driver_job_payload: {
        assigned_driver_name: "Dashboard Driver",
        assigned_driver_vehicle_model: "Mercedes V-Class",
        pickup_datetime: "2026-06-13T09:30:00.000+08:00",
        route: "Raffles Hotel Singapore > Changi Airport Terminal 3",
      },
    },
    source_surface: "admin_dashboard",
    updated_at: "2026-06-10T02:00:00.000Z",
  });

  const dashboardListed = await readResponse(
    await harness.route.GET(
      new Request(
        `http://localhost/api/admin-driver-job-links?booking_reference=${encodeURIComponent("May 2026 / JOB-UBS-042")}&limit=1&link_status=active&page=1`,
        {
          headers: adminHeaders(),
        },
      ),
    ),
  );

  assert.equal(dashboardListed.status, 200);
  assert.equal(dashboardListed.body.ok, true);
  assert.equal(dashboardListed.body.links.length, 1);
  assert.equal(dashboardListed.body.links[0].booking_reference, "May 2026 / JOB-UBS-042");
  assert.equal(dashboardListed.body.links[0].safe_summary.assigned_driver, "Dashboard Driver");
  assertNoApiLeak(dashboardListed, "dashboard-style read response");
  assertNoUnsafeDriverJobLinkLeak(dashboardListed, "dashboard-style read response");

  const unsafeReadReference = await readResponse(
    await harness.route.GET(
      new Request("http://localhost/api/admin-driver-job-links?booking_reference=..%2Funsafe&limit=1&page=1", {
        headers: adminHeaders(),
      }),
    ),
  );

  assert.equal(unsafeReadReference.status, 400);
  assert.equal(unsafeReadReference.body.ok, false);
  assert.equal(unsafeReadReference.body.error, "Malformed driver job link booking reference rejected.");
  assertNoApiLeak(unsafeReadReference, "unsafe read reference");

  const humanReferenceCreate = await readResponse(
    await harness.route.POST(
      requestWithJson(
        "POST",
        "http://localhost/api/admin-driver-job-links",
        safeCreatePayload({ booking_reference: "May 2026 / JOB-UBS-042" }),
      ),
    ),
  );

  assert.equal(humanReferenceCreate.status, 400);
  assert.equal(humanReferenceCreate.body.ok, false);
  assertNoApiLeak(humanReferenceCreate, "human-style create reference rejection");

  const dashboardBrowserRevoked = await readResponse(
    await harness.route.PATCH(
      requestWithJson(
        "PATCH",
        "http://localhost/api/admin-driver-job-links",
        {
          driver_job_link_id: dashboardBrowserCreate.body.link.id,
        },
        dashboardBrowserHeaders(),
      ),
    ),
  );

  assert.equal(dashboardBrowserRevoked.status, 200);
  assert.equal(dashboardBrowserRevoked.body.ok, true);
  assert.equal(dashboardBrowserRevoked.body.link.link_status, "revoked");
  assert.equal(client.tables.driver_job_links[2].link_status, "revoked");
  assertNoApiLeak(dashboardBrowserRevoked, "dashboard browser revoked response");
  assertNoUnsafeDriverJobLinkLeak(dashboardBrowserRevoked, "dashboard browser revoked response");

  const revoked = await readResponse(
    await harness.route.PATCH(
      requestWithJson("PATCH", "http://localhost/api/admin-driver-job-links", {
        driver_job_link_id: created.body.link.id,
      }),
    ),
  );

  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.ok, true);
  assert.equal(revoked.body.link.link_status, "revoked");
  assert.equal(client.tables.driver_job_links[0].link_status, "revoked");
  assertNoApiLeak(revoked, "revoked response");
  assertNoUnsafeDriverJobLinkLeak(revoked, "revoked response");
  assert.doesNotMatch(JSON.stringify(revoked.body), /driver_job_url/i);

  assert.deepEqual(
    client.operations.map((operation) => operation.type),
    ["insert", "upsert", "insert", "upsert", "insert", "upsert", "update", "update"],
  );
  assert.equal(
    client.operations.some(
      (operation) =>
        !["driver_job_links", "driver_live_location_runtime_settings"].includes(
          operation.table,
        ),
    ),
    false,
  );

  const malformedRevoke = await readResponse(
    await harness.route.PATCH(
      requestWithJson("PATCH", "http://localhost/api/admin-driver-job-links", {
        driver_job_link_id: "not-a-uuid",
      }),
    ),
  );

  assert.equal(malformedRevoke.status, 400);
  assert.equal(malformedRevoke.body.ok, false);
  assertNoApiLeak(malformedRevoke, "malformed revoke");
} finally {
  delete globalThis.__prestigeAdminDriverJobLinkApiMock;
  restoreEnv();
  await harness.cleanup();
}

const routeSource = await readFile(
  path.join(process.cwd(), "app/api/admin-driver-job-links/route.ts"),
  "utf8",
);
const helperSource = await readFile(
  path.join(process.cwd(), "lib/admin-driver-job-link-persistence.ts"),
  "utf8",
);

assert.doesNotMatch(routeSource + helperSource, /\bsupabase\s+db\b|\bsupabase\s+migration\b|\bsupabase\s+reset\b/i);
assert.doesNotMatch(routeSource + helperSource, /\btelegram\.(?:send|post|request)|\bwhatsapp\.(?:send|post|request)|sendSms|sendEmail|mailgun|twilio|nodemailer/i);
assert.doesNotMatch(routeSource + helperSource, /createInvoice|paymentIntent|stripe\.|payoutTransfer|paynowTransfer|generatePdf|pdfkit/i);
assert.doesNotMatch(routeSource + helperSource, /\bdelete\(\)|\.delete\(/i, "admin driver job link API must not delete links");
assert.match(routeSource, /const publicDriverJobLinkOrigin = "https:\/\/app\.prestigelimo\.sg"/);
assert.doesNotMatch(
  routeSource,
  /driverJobUrlFromToken\(\s*request/,
  "created driver job links must not use the admin request origin because preview/staging origins can send drivers to Vercel login",
);

console.log("Admin driver job link API contract tests passed.");
