import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledNotificationPersistenceError =
  "Admin app notification persistence is not enabled on this server.";
const serverSessionToken = "mock-admin-app-notification-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_APP_NOTIFICATION_SENTINEL";
const supabaseUrlSentinel = "https://app-notification-contract.supabase.co";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_APP_NOTIFICATION_SENTINEL|mock-admin-app-notification-session-token|app-notification-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const unsafeNotificationLeakPattern =
  /contact_phone|contact_email|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token/i;
const sourceFiles = [
  "lib/admin-app-notification-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-app-notifications/route.ts",
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
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeAdminAppNotificationApiMock;",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-app-notification-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(tempDir, "lib/admin-app-notification-persistence.js")),
    route: require(path.join(tempDir, "app/api/admin-app-notifications/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.payload = null;
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

  insert(payload) {
    this.operation = "insert";
    this.payload = payload;

    return this;
  }

  limit(count) {
    this.resultLimit = count;

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

  then(onFulfilled, onRejected) {
    return Promise.resolve(this.execute()).then(onFulfilled, onRejected);
  }

  update(payload) {
    this.operation = "update";
    this.payload = payload;

    return this;
  }

  execute() {
    if (this.operation === "insert") {
      return this.client.insertRow(
        this.table,
        this.payload,
        this.resultMode,
        this.selectedColumns,
      );
    }

    if (this.operation === "update") {
      return this.client.updateRows(
        this.table,
        this.payload,
        this.filters,
        this.resultMode,
        this.selectedColumns,
      );
    }

    return this.client.selectRows(this.table, this.resultLimit, this.selectedColumns);
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.insertHistory = [];
    this.operations = [];
    this.selectHistory = [];
    this.updateHistory = [];
    this.tables = {
      admin_app_notification_outbox: [],
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

  insertRow(table, payload, resultMode, selectedColumns) {
    const failure = this.failureFor("insert", table);

    this.insertHistory.push({
      payload: clone(payload),
      resultMode,
      selectedColumns,
      table,
    });
    this.operations.push({
      action: "insert",
      payload: clone(payload),
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const now = "2026-06-07T00:00:00.000Z";
    const row = {
      created_at: now,
      id: `mock-admin-app-notification-${this.tables[table].length + 1}`,
      ...clone(payload),
      updated_at: payload.updated_at || now,
    };

    this.tables[table].push(row);

    return {
      data: clone(row),
      error: null,
    };
  }

  selectRows(table, resultLimit, selectedColumns) {
    const failure = this.failureFor("select", table);

    this.selectHistory.push({
      limit: resultLimit,
      selectedColumns,
      table,
    });
    this.operations.push({
      action: "select",
      payload: null,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    return {
      data: this.tables[table].slice(0, resultLimit || undefined).map((row) => clone(row)),
      error: null,
    };
  }

  updateRows(table, payload, filters, resultMode, selectedColumns) {
    const failure = this.failureFor("update", table);

    this.updateHistory.push({
      filters: clone(filters),
      payload: clone(payload),
      resultMode,
      selectedColumns,
      table,
    });
    this.operations.push({
      action: "update",
      filters: clone(filters),
      payload: clone(payload),
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const updatedRows = [];

    this.tables[table] = this.tables[table].map((row) => {
      const matches = filters.every((filter) => row[filter.column] === filter.value);

      if (!matches) {
        return row;
      }

      const updatedRow = {
        ...row,
        ...clone(payload),
      };

      updatedRows.push(updatedRow);

      return updatedRow;
    });

    return {
      data: resultMode === "single" ? clone(updatedRows[0] || null) : updatedRows.map((row) => clone(row)),
      error: null,
    };
  }
}

function installMockClient(seed = {}, options = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, options),
    createdClients: [],
  };

  globalThis.__prestigeAdminAppNotificationApiMock = mock;

  return mock;
}

function validAdminHeaders(overrides = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...overrides,
  };
}

function validAdminBrowserHeaders(overrides = {}) {
  const headers = validAdminHeaders(overrides);
  delete headers["x-prestige-admin-session-token"];

  return headers;
}

function validProductionEnv(overrides = {}) {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Notification contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  };
}

async function responseJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function safeNotificationPayload(overrides = {}) {
  return {
    booking_reference: "APP-NOTIFY-REF-001",
    event_key: "APP-NOTIFY-REF-001:driver-status:queued",
    notification_status: "queued",
    notification_type: "driver_status",
    priority: "normal",
    safe_context: {
      next_action: "Review the driver status update in the admin dashboard.",
      source: "contract_test",
    },
    safe_message: "Driver status update is ready for admin review.",
    safe_title: "Driver status update ready",
    workflow_area: "day_of_trip_dispatch_monitor",
    ...overrides,
  };
}

try {
  const { cleanup, route } = await loadHarness();

  try {
    setEnv(validProductionEnv());
    const mock = installMockClient({
      admin_app_notification_outbox: [
        {
          actor_label: "System",
          actor_role: "system",
          booking_reference: "APP-NOTIFY-REF-001",
          created_at: "2026-06-07T03:00:00.000Z",
          delivery_surface: "admin_app",
          event_key: "APP-NOTIFY-REF-001:queued",
          id: "queued-newer",
          notification_status: "queued",
          notification_type: "driver_status",
          priority: "high",
          safe_context: {
            next_action: "Review saved status.",
          },
          safe_message: "Saved driver status is ready for review.",
          safe_title: "Saved driver status",
          source_surface: "system",
          updated_at: "2026-06-07T03:00:00.000Z",
          workflow_area: "day_of_trip_dispatch_monitor",
        },
        {
          actor_label: "System",
          actor_role: "system",
          booking_reference: "APP-NOTIFY-REF-002",
          created_at: "2026-06-07T02:00:00.000Z",
          delivery_surface: "admin_app",
          id: "read-older",
          notification_status: "read",
          notification_type: "monthly_billing",
          priority: "normal",
          safe_context: {},
          safe_message: "Monthly billing draft plan is ready for review.",
          safe_title: "Billing draft plan ready",
          source_surface: "system",
          updated_at: "2026-06-07T02:00:00.000Z",
          workflow_area: "monthly_billing",
        },
      ],
    });
    const getResult = await responseJson(
      await route.GET(
        new Request(
          "http://localhost/api/admin-app-notifications?notification_status=queued&limit=1&page=1",
          {
            headers: validAdminHeaders(),
          },
        ),
      ),
    );

    assert.equal(getResult.status, 200);
    assert.deepEqual(
      getResult.body.notifications.map((notification) => ({
        booking_reference: notification.booking_reference,
        delivery_surface: notification.delivery_surface,
        notification_status: notification.notification_status,
        notification_type: notification.notification_type,
        priority: notification.priority,
        safe_title: notification.safe_title,
      })),
      [
        {
          booking_reference: "APP-NOTIFY-REF-001",
          delivery_surface: "admin_app",
          notification_status: "queued",
          notification_type: "driver_status",
          priority: "high",
          safe_title: "Saved driver status",
        },
      ],
      "Expected GET to return only safe queued admin app notifications",
    );
    assert.deepEqual(getResult.body.pagination, {
      has_next_page: false,
      has_previous_page: false,
      page: 1,
      page_count: 1,
      page_size: 1,
      total_notification_count: 1,
    });
    assert.deepEqual(
      mock.client.selectHistory.map((entry) => ({
        limit: entry.limit,
        table: entry.table,
      })),
      [
        {
          limit: 500,
          table: "admin_app_notification_outbox",
        },
      ],
      "Expected GET to read only from admin_app_notification_outbox",
    );
    assert.equal(
      safeApiLeakPattern.test(JSON.stringify(getResult.body)),
      false,
      "Expected GET response not to leak secrets or server internals",
    );
    assert.equal(
      unsafeNotificationLeakPattern.test(JSON.stringify(getResult.body)),
      false,
      "Expected GET response not to leak forbidden finance/auth/parser/external-send fields",
    );

    setEnv(validProductionEnv());
    const postMock = installMockClient();
    const postResult = await responseJson(
      await route.POST(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify(safeNotificationPayload()),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(postResult.status, 200);
    assert.deepEqual(
      {
        actor_role: postResult.body.notification.actor_role,
        booking_reference: postResult.body.notification.booking_reference,
        delivery_surface: postResult.body.notification.delivery_surface,
        notification_status: postResult.body.notification.notification_status,
        notification_type: postResult.body.notification.notification_type,
        priority: postResult.body.notification.priority,
        source_surface: postResult.body.notification.source_surface,
      },
      {
        actor_role: "admin",
        booking_reference: "APP-NOTIFY-REF-001",
        delivery_surface: "admin_app",
        notification_status: "queued",
        notification_type: "driver_status",
        priority: "normal",
        source_surface: "admin_api",
      },
      "Expected POST to create one safe admin app notification",
    );
    assert.deepEqual(
      Object.keys(postMock.client.insertHistory[0].payload).sort(),
      [
        "actor_label",
        "actor_role",
        "booking_reference",
        "delivery_surface",
        "event_key",
        "notification_status",
        "notification_type",
        "priority",
        "safe_context",
        "safe_message",
        "safe_title",
        "source_surface",
        "updated_at",
        "workflow_area",
      ],
      "Expected POST payload to include only safe app-notification fields",
    );
    assert.equal(
      unsafeNotificationLeakPattern.test(JSON.stringify(postMock.client.insertHistory[0].payload)),
      false,
      "Expected POST payload not to include external delivery, finance, auth, parser, or secret fields",
    );

    setEnv(validProductionEnv());
    const updateMock = installMockClient({
      admin_app_notification_outbox: [
        {
          actor_label: "System",
          actor_role: "system",
          booking_reference: "APP-NOTIFY-REF-001",
          created_at: "2026-06-07T03:00:00.000Z",
          delivery_surface: "admin_app",
          event_key: "APP-NOTIFY-REF-001:queued",
          id: "queued-update-target",
          notification_status: "queued",
          notification_type: "driver_status",
          priority: "high",
          safe_context: {},
          safe_message: "Saved driver status is ready for review.",
          safe_title: "Saved driver status",
          source_surface: "system",
          updated_at: "2026-06-07T03:00:00.000Z",
          workflow_area: "day_of_trip_dispatch_monitor",
        },
      ],
    });
    const patchResult = await responseJson(
      await route.PATCH(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify({
            notification_id: "queued-update-target",
            notification_status: "read",
          }),
          headers: validAdminBrowserHeaders({
            "content-type": "application/json",
          }),
          method: "PATCH",
        }),
      ),
    );

    assert.equal(patchResult.status, 200);
    assert.deepEqual(
      {
        actor_role: patchResult.body.notification.actor_role,
        id: patchResult.body.notification.id,
        notification_status: patchResult.body.notification.notification_status,
        source_surface: patchResult.body.notification.source_surface,
      },
      {
        actor_role: "admin",
        id: "queued-update-target",
        notification_status: "read",
        source_surface: "admin_api",
      },
      "Expected PATCH to update one queued admin app notification status",
    );
    assert.deepEqual(
      updateMock.client.updateHistory.map((entry) => ({
        filters: entry.filters,
        payloadKeys: Object.keys(entry.payload).sort(),
        table: entry.table,
      })),
      [
        {
          filters: [
            {
              column: "id",
              type: "eq",
              value: "queued-update-target",
            },
            {
              column: "notification_status",
              type: "eq",
              value: "queued",
            },
          ],
          payloadKeys: [
            "actor_label",
            "actor_role",
            "notification_status",
            "source_surface",
            "updated_at",
          ],
          table: "admin_app_notification_outbox",
        },
      ],
      "Expected PATCH to update only the exact queued notification row",
    );
    assert.deepEqual(
      {
        actor_label: updateMock.client.updateHistory[0].payload.actor_label,
        actor_role: updateMock.client.updateHistory[0].payload.actor_role,
        notification_status: updateMock.client.updateHistory[0].payload.notification_status,
        source_surface: updateMock.client.updateHistory[0].payload.source_surface,
      },
      {
        actor_label: "Notification contract admin",
        actor_role: "admin",
        notification_status: "read",
        source_surface: "admin_api",
      },
      "Expected PATCH payload to include only safe status and actor audit fields",
    );
    assert.equal(
      unsafeNotificationLeakPattern.test(JSON.stringify(updateMock.client.updateHistory[0].payload)),
      false,
      "Expected PATCH payload not to include external delivery, finance, auth, parser, or secret fields",
    );
    assert.match(
      await readFile("app/api/admin-app-notifications/route.ts", "utf8"),
      /allowServerSessionRoleMethodsWithoutRequestToken:\s*\["PATCH"\]/,
      "Expected admin app notification status updates to be allowed from the same-origin dashboard without a browser token",
    );

    for (const nextStatus of ["dismissed", "archived"]) {
      setEnv(validProductionEnv());
      const statusMock = installMockClient({
        admin_app_notification_outbox: [
          {
            ...safeNotificationPayload({
              notification_status: "queued",
            }),
            actor_label: "System",
            actor_role: "system",
            created_at: "2026-06-07T03:00:00.000Z",
            delivery_surface: "admin_app",
            id: `queued-${nextStatus}-target`,
            source_surface: "system",
            updated_at: "2026-06-07T03:00:00.000Z",
          },
        ],
      });
      const statusPatchResult = await responseJson(
        await route.PATCH(
          new Request("http://localhost/api/admin-app-notifications", {
            body: JSON.stringify({
              notification_id: `queued-${nextStatus}-target`,
              notification_status: nextStatus,
            }),
            headers: validAdminHeaders({
              "content-type": "application/json",
            }),
            method: "PATCH",
          }),
        ),
      );

      assert.equal(statusPatchResult.status, 200);
      assert.equal(statusPatchResult.body.notification.notification_status, nextStatus);
      assert.equal(statusMock.client.updateHistory[0].payload.notification_status, nextStatus);
    }

    setEnv(validProductionEnv());
    const unsafePatchMock = installMockClient();
    const unsafePatchResult = await responseJson(
      await route.PATCH(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify({
            notification_id: "queued-update-target",
            notification_status: "read",
            telegram_chat_id: "should-not-be-accepted",
          }),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "PATCH",
        }),
      ),
    );

    assert.equal(unsafePatchResult.status, 400);
    assert.equal(unsafePatchMock.client.operations.length, 0, "Unsafe PATCH must not reach Supabase");

    const malformedPatchStatus = await responseJson(
      await route.PATCH(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify({
            notification_id: "queued-update-target",
            notification_status: "queued",
          }),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "PATCH",
        }),
      ),
    );

    assert.equal(malformedPatchStatus.status, 400);

    for (const [label, request] of [
      ["anonymous", new Request("http://localhost/api/admin-app-notifications")],
      [
        "public-book",
        new Request("http://localhost/api/admin-app-notifications", {
          headers: validAdminHeaders({
            referer: "http://localhost/book",
          }),
        }),
      ],
      [
        "driver",
        new Request("http://localhost/api/admin-app-notifications", {
          headers: validAdminHeaders({
            referer: "http://localhost/driver-job-demo",
          }),
        }),
      ],
      [
        "wrong-purpose",
        new Request("http://localhost/api/admin-app-notifications", {
          headers: validAdminHeaders({
            "x-prestige-admin-purpose": "customer-surface",
          }),
        }),
      ],
    ]) {
      const blocked = await responseJson(await route.GET(request));

      assert.equal(blocked.status, 403, `Expected ${label} GET to be blocked`);
      assert.equal(blocked.body.error, routeBlockedMessage);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blocked.body)), false);
    }

    for (const [label, headers] of [
      ["anonymous", { "content-type": "application/json" }],
      [
        "public-book",
        validAdminHeaders({
          referer: "http://localhost/book",
          "content-type": "application/json",
        }),
      ],
      [
        "driver",
        validAdminHeaders({
          referer: "http://localhost/driver-job-demo",
          "content-type": "application/json",
        }),
      ],
      [
        "wrong-purpose",
        validAdminHeaders({
          "content-type": "application/json",
          "x-prestige-admin-purpose": "customer-surface",
        }),
      ],
    ]) {
      const blockedPatch = await responseJson(
        await route.PATCH(
          new Request("http://localhost/api/admin-app-notifications", {
            body: JSON.stringify({
              notification_id: "queued-update-target",
              notification_status: "read",
            }),
            headers,
            method: "PATCH",
          }),
        ),
      );

      assert.equal(blockedPatch.status, 403, `Expected ${label} PATCH to be blocked`);
      assert.equal(blockedPatch.body.error, routeBlockedMessage);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blockedPatch.body)), false);
    }

    setEnv(validProductionEnv());
    const invalidMock = installMockClient();
    const unsafeResult = await responseJson(
      await route.POST(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              telegram_chat_id: "should-not-be-accepted",
            }),
          ),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(unsafeResult.status, 400);
    assert.equal(invalidMock.client.operations.length, 0, "Unsafe POST must not reach Supabase");
    assert.equal(
      safeApiLeakPattern.test(JSON.stringify(unsafeResult.body)),
      false,
      "Expected unsafe POST error not to leak server internals",
    );

    const unsafeTextResult = await responseJson(
      await route.POST(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              safe_message: "Send a payment link to the customer.",
            }),
          ),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(unsafeTextResult.status, 400);

    const malformedGet = await responseJson(
      await route.GET(
        new Request("http://localhost/api/admin-app-notifications?notification_status=sent", {
          headers: validAdminHeaders(),
        }),
      ),
    );

    assert.equal(malformedGet.status, 400);

    setEnv({
      PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
      SUPABASE_URL: supabaseUrlSentinel,
    });
    installMockClient();
    const disabledResult = await responseJson(
      await route.POST(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify(safeNotificationPayload()),
          headers: {
            referer: "http://localhost/",
            "x-prestige-admin-purpose": "admin-booking-persistence",
          },
          method: "POST",
        }),
      ),
    );

    assert.equal(disabledResult.status, 503);
    assert.equal(disabledResult.body.error, disabledNotificationPersistenceError);
    assert.equal(safeApiLeakPattern.test(JSON.stringify(disabledResult.body)), false);

    setEnv(
      validProductionEnv({
        PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "different-token",
      }),
    );
    installMockClient();
    const missingSessionResult = await responseJson(
      await route.POST(
        new Request("http://localhost/api/admin-app-notifications", {
          body: JSON.stringify(safeNotificationPayload()),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(missingSessionResult.status, 403);
    assert.equal(missingSessionResult.body.error, routeBlockedMessage);
  } finally {
    restoreEnv();
    await cleanup();
    delete globalThis.__prestigeAdminAppNotificationApiMock;
  }
} catch (error) {
  restoreEnv();
  delete globalThis.__prestigeAdminAppNotificationApiMock;
  throw error;
}

console.log("Admin app notification API contract tests passed.");
