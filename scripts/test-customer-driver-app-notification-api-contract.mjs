import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const customerAuthRequiredMessage =
  "Customer app notifications require secure customer account auth before saved notifications can be read.";
const disabledDriverNotificationMessage =
  "Driver app notification persistence is not enabled on this server.";
const serverSessionToken = "mock-customer-driver-notification-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_DRIVER_NOTIFICATION_SENTINEL";
const supabaseUrlSentinel = "https://customer-driver-notification-contract.supabase.co";
const notificationTable = "customer_driver_app_notification_outbox";
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_DRIVER_NOTIFICATION_SENTINEL|mock-customer-driver-notification-session-token|customer-driver-notification-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const unsafeNotificationLeakPattern =
  /contact_phone|contact_email|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|driver_job_link_id|event_key|source_surface|actor_label/i;
const sourceFiles = [
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-mode.ts",
  "lib/driver-job-status-workflow.ts",
  "app/api/admin-customer-driver-app-notifications/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/driver-job/[token]/notifications/route.ts",
];
const originalEnv = {
  DRIVER_JOB_LINK_MODE: process.env.DRIVER_JOB_LINK_MODE,
  NEXT_PUBLIC_DRIVER_JOB_LINK_MODE: process.env.NEXT_PUBLIC_DRIVER_JOB_LINK_MODE,
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
  PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED:
    process.env.PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED,
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
    DRIVER_JOB_LINK_MODE: "production",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Notification contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "true",
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

function routeContext(token) {
  return {
    params: Promise.resolve({ token }),
  };
}

function tokenHash(token) {
  return createHash("sha256").update(token.trim(), "utf8").digest("hex");
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
      "  const mock = globalThis.__prestigeCustomerDriverAppNotificationApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked customer/driver app notification Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-customer-driver-notification-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adminRoute: require(path.join(tempDir, "app/api/admin-customer-driver-app-notifications/route.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerRoute: require(path.join(tempDir, "app/api/customer-app-notifications/route.js")),
    driverRoute: require(path.join(tempDir, "app/api/driver-job/[token]/notifications/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.orderBy = null;
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

  maybeSingle() {
    this.resultMode = "maybeSingle";

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
    this.insertHistory = [];
    this.operations = [];
    this.selectHistory = [];
    this.tables = {
      [notificationTable]: [],
      driver_job_links: [],
    };
    this.updateHistory = [];

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

    const row = {
      id: `${table}-generated-id`,
      created_at: "2026-06-08T01:00:00.000Z",
      ...clone(payload),
    };

    this.tables[table].push(row);

    return {
      data: resultMode === "single" ? clone(row) : [clone(row)],
      error: null,
    };
  }

  selectRows(table, filters, orderBy, resultLimit, resultMode, selectedColumns) {
    const failure = this.failureFor("select", table);

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

    if (resultMode === "single") {
      return {
        data: clone(limitedRows[0] || null),
        error: null,
      };
    }

    if (resultMode === "maybeSingle") {
      return {
        data: clone(limitedRows[0] || null),
        error: null,
      };
    }

    return {
      data: limitedRows.map((row) => clone(row)),
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

  globalThis.__prestigeCustomerDriverAppNotificationApiMock = mock;

  return mock;
}

async function responseJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function safeNotificationPayload(overrides = {}) {
  return {
    booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
    delivery_surface: "customer_app",
    event_key: "BOOK-CUST-DRIVER-NOTIFY-001:customer:queued",
    notification_status: "queued",
    notification_type: "booking_status",
    priority: "normal",
    safe_context: {
      next_action: "Open the app notification drawer.",
    },
    safe_message: "Your booking request is being reviewed by dispatch.",
    safe_title: "Booking request received",
    workflow_area: "customer_booking_request",
    ...overrides,
  };
}

function seededNotification(overrides = {}) {
  return {
    actor_label: "System",
    actor_role: "system",
    booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
    created_at: "2026-06-08T01:00:00.000Z",
    delivery_surface: "customer_app",
    driver_job_link_id: null,
    event_key: "BOOK-CUST-DRIVER-NOTIFY-001:customer:queued",
    id: "notification-customer-one",
    notification_status: "queued",
    notification_type: "booking_status",
    priority: "normal",
    safe_context: {},
    safe_message: "Your booking request is being reviewed by dispatch.",
    safe_title: "Booking request received",
    source_surface: "system",
    updated_at: "2026-06-08T01:00:00.000Z",
    workflow_area: "customer_booking_request",
    ...overrides,
  };
}

try {
  const { adminRoute, cleanup, customerRoute, driverRoute } = await loadHarness();

  try {
    setEnv(validEnv());
    const postMock = installMockClient();
    const postResult = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
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
        booking_reference: postResult.body.notification.booking_reference,
        delivery_surface: postResult.body.notification.delivery_surface,
        notification_status: postResult.body.notification.notification_status,
        notification_type: postResult.body.notification.notification_type,
        safe_title: postResult.body.notification.safe_title,
      },
      {
        booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
        delivery_surface: "customer_app",
        notification_status: "queued",
        notification_type: "booking_status",
        safe_title: "Booking request received",
      },
      "Expected admin POST to create a customer-app notification",
    );
    assert.deepEqual(
      Object.keys(postMock.client.insertHistory[0].payload).sort(),
      [
        "actor_label",
        "actor_role",
        "booking_reference",
        "delivery_surface",
        "driver_job_link_id",
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
      "Expected admin POST payload to stay inside safe notification fields",
    );
    assert.equal(
      unsafeNotificationLeakPattern.test(JSON.stringify(postResult.body.notification)),
      false,
      "Expected admin POST response to omit link internals, actors, finance, auth, parser, and send fields",
    );

    setEnv(validEnv());
    const driverPostMock = installMockClient();
    const driverPostResult = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              delivery_surface: "driver_app",
              driver_job_link_id: "11111111-1111-4111-8111-111111111111",
              event_key: "BOOK-CUST-DRIVER-NOTIFY-001:driver:queued",
              notification_type: "driver_status",
              safe_message: "Dispatch has a new app update for this job.",
              safe_title: "Dispatch app update",
              workflow_area: "driver_job_status",
            }),
          ),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(driverPostResult.status, 200);
    assert.equal(driverPostResult.body.notification.delivery_surface, "driver_app");
    assert.equal(
      driverPostMock.client.insertHistory[0].payload.driver_job_link_id,
      "11111111-1111-4111-8111-111111111111",
      "Expected driver app notification to be scoped by driver job link id when supplied",
    );

    setEnv(validEnv());
    const getMock = installMockClient({
      [notificationTable]: [
        seededNotification(),
        seededNotification({
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-002",
          delivery_surface: "driver_app",
          id: "notification-driver-one",
          notification_type: "driver_status",
          safe_message: "Driver app update.",
          safe_title: "Driver update",
        }),
      ],
    });
    const getResult = await responseJson(
      await adminRoute.GET(
        new Request(
          "http://localhost/api/admin-customer-driver-app-notifications?delivery_surface=driver_app&notification_status=queued&limit=10&page=1",
          {
            headers: validAdminHeaders(),
          },
        ),
      ),
    );

    assert.equal(getResult.status, 200);
    assert.deepEqual(
      getResult.body.notifications.map((notification) => ({
        delivery_surface: notification.delivery_surface,
        notification_status: notification.notification_status,
        notification_type: notification.notification_type,
        safe_title: notification.safe_title,
      })),
      [
        {
          delivery_surface: "driver_app",
          notification_status: "queued",
          notification_type: "driver_status",
          safe_title: "Driver update",
        },
      ],
      "Expected admin GET to filter customer/driver notifications safely",
    );
    assert.deepEqual(
      getMock.client.selectHistory[0].filters,
      [
        { column: "delivery_surface", type: "eq", value: "driver_app" },
        { column: "notification_status", type: "eq", value: "queued" },
      ],
      "Expected admin GET to use safe delivery/status filters",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(getResult.body)), false);

    setEnv(validEnv());
    const patchMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          delivery_surface: "driver_app",
          id: "notification-driver-update",
        }),
      ],
    });
    const patchResult = await responseJson(
      await adminRoute.PATCH(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify({
            delivery_surface: "driver_app",
            notification_id: "notification-driver-update",
            notification_status: "read",
          }),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "PATCH",
        }),
      ),
    );

    assert.equal(patchResult.status, 200);
    assert.equal(patchResult.body.notification.notification_status, "read");
    assert.deepEqual(
      patchMock.client.updateHistory[0].filters,
      [
        { column: "id", type: "eq", value: "notification-driver-update" },
        { column: "notification_status", type: "eq", value: "queued" },
        { column: "delivery_surface", type: "eq", value: "driver_app" },
      ],
      "Expected admin PATCH to update only exact queued notification and optional surface",
    );

    setEnv(validEnv());
    const unsafePostMock = installMockClient();
    const unsafePost = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              customer_price: "$100",
            }),
          ),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(unsafePost.status, 400);
    assert.equal(unsafePostMock.client.operations.length, 0, "Unsafe admin POST must not reach Supabase");

    for (const [label, request] of [
      ["anonymous", new Request("http://localhost/api/admin-customer-driver-app-notifications")],
      [
        "customer",
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          headers: validAdminHeaders({
            referer: "http://localhost/my-bookings",
          }),
        }),
      ],
      [
        "driver",
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          headers: validAdminHeaders({
            referer: "http://localhost/driver-job/mock-token",
          }),
        }),
      ],
    ]) {
      const blocked = await responseJson(await adminRoute.GET(request));

      assert.equal(blocked.status, 403, `Expected ${label} admin route access to be blocked`);
      assert.equal(blocked.body.error, routeBlockedMessage);
      assert.equal(safeApiLeakPattern.test(JSON.stringify(blocked.body)), false);
    }

    setEnv(validEnv());
    const customerGetMock = installMockClient();
    const customerGet = await responseJson(
      await customerRoute.GET(new Request("http://localhost/api/customer-app-notifications")),
    );
    const customerPatch = await responseJson(
      await customerRoute.PATCH(
        new Request("http://localhost/api/customer-app-notifications", {
          body: JSON.stringify({
            notification_id: "notification-customer-one",
            notification_status: "read",
          }),
          method: "PATCH",
        }),
      ),
    );

    assert.equal(customerGet.status, 403);
    assert.equal(customerPatch.status, 403);
    assert.equal(customerGet.body.error, customerAuthRequiredMessage);
    assert.equal(customerPatch.body.error, customerAuthRequiredMessage);
    assert.equal(customerGetMock.createdClients.length, 0, "Customer route must not create a Supabase client");

    const driverToken = "safe-driver-notification-token";
    const driverLinkId = "11111111-1111-4111-8111-111111111111";
    setEnv(validEnv());
    const driverGetMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          driver_job_link_id: driverLinkId,
          id: "notification-driver-safe-one",
          notification_type: "trip_update",
          safe_message: "Dispatch has an app update for this job.",
          safe_title: "Dispatch update",
          workflow_area: "driver_job_status",
        }),
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          id: "notification-customer-hidden",
        }),
        seededNotification({
          booking_reference: "BOOK-OTHER-NOTIFY-001",
          delivery_surface: "driver_app",
          id: "notification-driver-other",
        }),
      ],
      driver_job_links: [
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          expires_at: "2026-06-09T01:00:00.000Z",
          id: driverLinkId,
          link_status: "active",
          revoked_at: null,
          token_hash: tokenHash(driverToken),
        },
      ],
    });
    const driverGet = await responseJson(
      await driverRoute.GET(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications?limit=10&page=1`),
        routeContext(driverToken),
      ),
    );

    assert.equal(driverGet.status, 200);
    assert.deepEqual(
      driverGet.body.notifications.map((notification) => ({
        booking_reference: notification.booking_reference,
        delivery_surface: notification.delivery_surface,
        notification_status: notification.notification_status,
        notification_type: notification.notification_type,
        safe_title: notification.safe_title,
      })),
      [
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          notification_status: "queued",
          notification_type: "trip_update",
          safe_title: "Dispatch update",
        },
      ],
      "Expected driver token route to return only scoped driver-app notifications",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(driverGet.body)), false);
    assert.deepEqual(
      driverGetMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        table: entry.table,
      })),
      [
        {
          filters: [{ column: "token_hash", type: "eq", value: tokenHash(driverToken) }],
          table: "driver_job_links",
        },
        {
          filters: [
            { column: "delivery_surface", type: "eq", value: "driver_app" },
            { column: "booking_reference", type: "eq", value: "BOOK-DRIVER-NOTIFY-001" },
            { column: "notification_status", type: "eq", value: "queued" },
          ],
          table: notificationTable,
        },
      ],
      "Expected driver GET to verify token hash before scoped notification read",
    );

    setEnv(validEnv());
    const driverPatchMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          driver_job_link_id: driverLinkId,
          id: "notification-driver-safe-one",
        }),
      ],
      driver_job_links: [
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          expires_at: "2026-06-09T01:00:00.000Z",
          id: driverLinkId,
          link_status: "active",
          revoked_at: null,
          token_hash: tokenHash(driverToken),
        },
      ],
    });
    const driverPatch = await responseJson(
      await driverRoute.PATCH(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications`, {
          body: JSON.stringify({
            notification_id: "notification-driver-safe-one",
            notification_status: "dismissed",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "PATCH",
        }),
        routeContext(driverToken),
      ),
    );

    assert.equal(driverPatch.status, 200);
    assert.equal(driverPatch.body.notification.notification_status, "dismissed");
    assert.deepEqual(
      driverPatchMock.client.updateHistory[0].filters,
      [
        { column: "id", type: "eq", value: "notification-driver-safe-one" },
        { column: "delivery_surface", type: "eq", value: "driver_app" },
        { column: "booking_reference", type: "eq", value: "BOOK-DRIVER-NOTIFY-001" },
        { column: "notification_status", type: "eq", value: "queued" },
      ],
      "Expected driver PATCH to update only exact queued scoped notification",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(driverPatch.body)), false);

    setEnv(validEnv());
    const unsafeDriverPatchMock = installMockClient();
    const unsafeDriverPatch = await responseJson(
      await driverRoute.PATCH(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications`, {
          body: JSON.stringify({
            notification_id: "notification-driver-safe-one",
            notification_status: "read",
            telegram_chat_id: "not-allowed",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "PATCH",
        }),
        routeContext(driverToken),
      ),
    );

    assert.equal(unsafeDriverPatch.status, 400);
    assert.equal(
      unsafeDriverPatchMock.client.operations.length,
      0,
      "Unsafe driver PATCH must be rejected before Supabase",
    );

    setEnv({
      ...validEnv(),
      DRIVER_JOB_LINK_MODE: "mock",
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "false",
    });
    const disabledDriverMock = installMockClient();
    const disabledDriverGet = await responseJson(
      await driverRoute.GET(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications`),
        routeContext(driverToken),
      ),
    );

    assert.equal(disabledDriverGet.status, 503);
    assert.equal(disabledDriverGet.body.error, disabledDriverNotificationMessage);
    assert.equal(disabledDriverMock.createdClients.length, 0);
  } finally {
    await cleanup();
  }

  console.log("Customer/driver app notification API contract tests passed.");
} finally {
  restoreEnv();
  delete globalThis.__prestigeCustomerDriverAppNotificationApiMock;
}
