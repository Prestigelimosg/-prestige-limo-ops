import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
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
const portalAccessSecret =
  "mock-customer-driver-notification-portal-secret-0001";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_DRIVER_NOTIFICATION_SENTINEL";
const supabaseUrlSentinel = "https://customer-driver-notification-contract.supabase.co";
const notificationTable = "customer_driver_app_notification_outbox";
const nowDate = new Date();
const validDriverLinkExpiresAt = new Date(nowDate.getTime() + 6 * 60 * 60 * 1000).toISOString();
const farFutureDriverLinkExpiresAt = new Date(
  nowDate.getTime() + 7 * 24 * 60 * 60 * 1000,
).toISOString();
const safeApiLeakPattern =
  /SUPABASE_SERVICE_ROLE_KEY_CUSTOMER_DRIVER_NOTIFICATION_SENTINEL|mock-customer-driver-notification-session-token|customer-driver-notification-contract\.supabase\.co|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const unsafeNotificationLeakPattern =
  /contact_phone|contact_email|customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|payout|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|telegram|whatsapp|sms|email_payload|mock_archive|mock_qa|dev_workbench|internal_admin_note|admin_note|server_secret|token_hash|raw_token|driver_job_link_id|event_key|source_surface|actor_label/i;
const sourceFiles = [
  "lib/customer-runtime-session-map.ts",
  "lib/customer-device-push-notification.ts",
  "lib/driver-device-push-notification.ts",
  "lib/customer-saved-bookings-read.ts",
  "lib/customer-driver-app-notification-persistence.ts",
  "lib/customer-portal-trip-updates-adapter.ts",
  "lib/customer-portal-access-account.ts",
  "lib/customer-portal-access-link.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "lib/driver-job-link.ts",
  "lib/driver-job-link-mode.ts",
  "lib/driver-job-status-workflow.ts",
  "app/api/admin-customer-driver-app-notifications/route.ts",
  "app/api/customer-app-notifications/route.ts",
  "app/api/customer-driver-quick-replies/route.ts",
  "app/api/driver-job/[token]/notifications/route.ts",
  "app/api/driver-job/[token]/quick-replies/route.ts",
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
  PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST:
    process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST,
  PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED:
    process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED,
  PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE:
    process.env.PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE,
  PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED:
    process.env.PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED,
  PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE:
    process.env.PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE,
  PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED:
    process.env.PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED,
  PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST:
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST,
  PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED:
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED,
  PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET:
    process.env.PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET,
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
    PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST:
      "customer-runtime-account-001",
    PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: "true",
    PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE: "one-customer",
    PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_ENABLED: "true",
    PRESTIGE_CUSTOMER_DRIVER_QUICK_REPLIES_MODE: "controlled-runtime",
    PRESTIGE_CUSTOMER_DEVICE_PUSH_ENABLED: "false",
    PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ACCOUNT_ALLOWLIST:
      "customer-runtime-account-001",
    PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_ENABLED: "true",
    PRESTIGE_CUSTOMER_PORTAL_ACCESS_LINK_SECRET: portalAccessSecret,
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

function validDashboardHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
    "x-prestige-admin-purpose": "admin-booking-persistence",
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

function encodeJsonSegment(value) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function createPortalAccessToken(account) {
  const payloadSegment = encodeJsonSegment({
    account,
    iat: Math.floor(Date.now() / 1000),
    scope: "portal_account",
    type: "customer-portal-access-link-v1",
  });
  const signatureSegment = createHmac("sha256", portalAccessSecret)
    .update(payloadSegment)
    .digest("base64url");

  return `portal_access_v1.${payloadSegment}.${signatureSegment}`;
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

function splitPostgrestConditions(expression) {
  const conditions = [];
  let depth = 0;
  let start = 0;

  for (let index = 0; index < expression.length; index += 1) {
    if (expression[index] === "(") depth += 1;
    if (expression[index] === ")") depth -= 1;
    if (expression[index] === "," && depth === 0) {
      conditions.push(expression.slice(start, index));
      start = index + 1;
    }
  }
  conditions.push(expression.slice(start));
  return conditions;
}

function parsePostgrestCondition(condition) {
  if (condition.startsWith("and(") && condition.endsWith(")")) {
    return {
      conditions: parseOrFilterExpression(condition.slice(4, -1)),
      type: "and",
    };
  }

  const [column, operator, ...rest] = condition.split(".");
  const value = rest.join(".");
  if (operator === "is" && value === "null") {
    return { column, type: "is", value: null };
  }
  if (operator === "in" && value.startsWith("(") && value.endsWith(")")) {
    return { column, type: "in", value: splitPostgrestConditions(value.slice(1, -1)) };
  }
  return { column, type: operator, value };
}

function parseOrFilterExpression(expression) {
  return splitPostgrestConditions(String(expression)).map(parsePostgrestCondition);
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
  const nativePushBadgePath = path.join(tempDir, "lib/native-push-badge-count.js");
  const principalPath = path.join(tempDir, "lib/customer-principal-access.js");

  await mkdir(path.dirname(nativePushBadgePath), { recursive: true });
  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(webPushPath), { recursive: true });
  await mkdir(path.dirname(principalPath), { recursive: true });
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
  await writeFile(
    webPushPath,
    "module.exports = { setVapidDetails() {}, async sendNotification() {} };",
  );
  await writeFile(
    nativePushBadgePath,
    "exports.reserveNativePushBadgeCount = async () => null; exports.releaseNativePushBadgeCount = async () => false; exports.resetNativePushBadgeCount = async () => false;",
  );
  await writeFile(
    principalPath,
    [
      "exports.resolveCustomerPrincipalSessionToken = (token) => globalThis.__prestigeCustomerNotificationPrincipalSessions?.has(token) ? { principal_id: token.slice(-12) } : null;",
      "exports.assertActiveCustomerPrincipalSession = async (token) => {",
      "  const context = globalThis.__prestigeCustomerNotificationPrincipalSessions?.get(token);",
      "  return context ? { data: context, ok: true } : { error: 'Customer app access is required.', ok: false, status: 403 };",
      "};",
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
    customerQuickReplyRoute: require(path.join(tempDir, "app/api/customer-driver-quick-replies/route.js")),
    driverQuickReplyRoute: require(
      path.join(tempDir, "app/api/driver-job/[token]/quick-replies/route.js"),
    ),
    driverRoute: require(path.join(tempDir, "app/api/driver-job/[token]/notifications/route.js")),
    notificationPersistence: require(
      path.join(tempDir, "lib/customer-driver-app-notification-persistence.js"),
    ),
    tripUpdatesAdapter: require(
      path.join(tempDir, "lib/customer-portal-trip-updates-adapter.js"),
    ),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.operation = null;
    this.orderBy = [];
    this.payload = null;
    this.resultLimit = null;
    this.resultRange = null;
    this.resultMode = "many";
    this.selectedColumns = null;
    this.selectOptions = null;
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

  gt(column, value) {
    this.filters.push({
      column,
      type: "gt",
      value,
    });

    return this;
  }

  gte(column, value) {
    this.filters.push({
      column,
      type: "gte",
      value,
    });

    return this;
  }

  in(column, values) {
    this.filters.push({
      column,
      type: "in",
      value: [...values],
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

  lt(column, value) {
    this.filters.push({
      column,
      type: "lt",
      value,
    });

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

  or(expression) {
    this.filters.push({
      conditions: parseOrFilterExpression(expression),
      type: "or",
    });

    return this;
  }

  range(from, to) {
    this.resultRange = { from, to };

    return this;
  }

  select(columns, options = null) {
    if (!this.operation) {
      this.operation = "select";
    }

    this.selectedColumns = columns;
    this.selectOptions = options;

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
      this.resultRange,
      this.resultMode,
      this.selectedColumns,
      this.selectOptions,
    );
  }
}

class MockSupabaseClient {
  constructor(seed = {}, options = {}) {
    this.failures = options.failures || {};
    this.insertHistory = [];
    this.operations = [];
    this.rpcHistory = [];
    this.selectHistory = [];
    this.tables = {
      [notificationTable]: [],
      bookings: [],
      customer_access_accounts: [],
      customer_access_devices: [],
      customer_access_memberships: [],
      customer_access_principals: [],
      customer_device_push_subscriptions: [],
      driver_job_status_events: [],
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

  rpc(functionName, args) {
    this.rpcHistory.push({ args: clone(args), functionName });
    this.operations.push({ action: "rpc", args: clone(args), functionName });
    const failure = this.failureFor("rpc", functionName);
    if (failure) return Promise.resolve({ data: null, error: failure });
    assert.equal(
      functionName,
      "dismiss_customer_notification_centre",
      `Unexpected mocked Supabase RPC: ${functionName}`,
    );

    const requestedIds = new Set(Array.isArray(args?.p_notification_ids) ? args.p_notification_ids : []);
    const updatedIds = [];
    this.tables[notificationTable] = this.tables[notificationTable].map((row) => {
      if (
        row.delivery_surface !== "customer_app" ||
        row.notification_status !== "queued" ||
        !requestedIds.has(row.id)
      ) {
        return row;
      }
      updatedIds.push(row.id);
      return { ...row, notification_status: "dismissed", updated_at: new Date().toISOString() };
    });
    updatedIds.sort();
    return Promise.resolve({
      data: [{ updated_count: updatedIds.length, updated_ids: updatedIds }],
      error: null,
    });
  }

  failureFor(action, table) {
    return this.failures[`${action}:${table}`] || this.failures[table] || null;
  }

  filterRows(table, filters) {
    return this.tables[table].filter((row) => filters.every((filter) => this.rowMatchesFilter(row, filter)));
  }

  rowMatchesFilter(row, filter) {
    if (filter.type === "or") {
      return filter.conditions.some((condition) => this.rowMatchesFilter(row, condition));
    }

    if (filter.type === "and") {
      return filter.conditions.every((condition) => this.rowMatchesFilter(row, condition));
    }

    if (filter.type === "is") {
      return row[filter.column] === null || row[filter.column] === undefined;
    }

    if (filter.type === "in") {
      return filter.value.includes(row[filter.column]);
    }

    if (filter.type === "gt") {
      return row[filter.column] > filter.value;
    }

    if (filter.type === "gte") {
      return row[filter.column] >= filter.value;
    }

    if (filter.type === "lt") {
      return row[filter.column] < filter.value;
    }

    return row[filter.column] === filter.value;
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

  selectRows(
    table,
    filters,
    orderBy,
    resultLimit,
    resultRange,
    resultMode,
    selectedColumns,
    selectOptions,
  ) {
    const failure = this.failureFor("select", table);

    this.selectHistory.push({
      filters: clone(filters),
      limit: resultLimit,
      orderBy: clone(orderBy),
      range: clone(resultRange),
      resultMode,
      selectedColumns,
      selectOptions: clone(selectOptions),
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
    const exactCount = rows.length;
    if (
      (resultRange || filters.some((filter) => filter.type === "gt" || filter.type === "lt")) &&
      orderBy.length > 0
    ) {
      rows.sort((left, right) => {
        for (const order of orderBy) {
          const comparison = String(left[order.column] || "").localeCompare(
            String(right[order.column] || ""),
          );
          if (comparison !== 0) {
            return order.options?.ascending === false ? -comparison : comparison;
          }
        }
        return 0;
      });
    }
    let limitedRows = typeof resultLimit === "number" ? rows.slice(0, resultLimit) : rows;
    if (resultRange) limitedRows = limitedRows.slice(resultRange.from, resultRange.to + 1);

    if (resultMode === "single") {
      return {
        count: selectOptions?.count === "exact" ? exactCount : null,
        data: clone(limitedRows[0] || null),
        error: null,
      };
    }

    if (resultMode === "maybeSingle") {
      return {
        count: selectOptions?.count === "exact" ? exactCount : null,
        data: clone(limitedRows[0] || null),
        error: null,
      };
    }

    return {
      count: selectOptions?.count === "exact" ? exactCount : null,
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
      const matches = filters.every((filter) => this.rowMatchesFilter(row, filter));

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

function nativeCustomerAudienceSeed(bookingReference, customerId = "192") {
  const bossPrincipalId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const paPrincipalId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const bossDeviceId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
  const paDeviceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

  return {
    bookings: [{
      booking_reference: bookingReference,
      booker_id: 26,
      company_id: 53,
      customer_id: customerId,
      driver_plate_number: "QA10906",
      public_booking_reference: "10906",
      traveler_id: 40,
    }],
    customer_access_devices: [
      { device_status: "active", id: bossDeviceId, principal_id: bossPrincipalId },
      { device_status: "active", id: paDeviceId, principal_id: paPrincipalId },
    ],
    customer_access_memberships: [
      {
        booker_id: 26,
        company_id: 53,
        membership_role: "boss",
        membership_status: "active",
        principal_id: bossPrincipalId,
        traveler_id: 40,
      },
      {
        booker_id: 26,
        company_id: 53,
        membership_role: "managing_pa",
        membership_status: "active",
        principal_id: paPrincipalId,
        traveler_id: 40,
      },
    ],
    customer_access_principals: [
      { id: bossPrincipalId, principal_status: "active" },
      { id: paPrincipalId, principal_status: "active" },
    ],
    customer_device_push_subscriptions: [
      {
        delivery_channel: "native_expo",
        device_id: bossDeviceId,
        id: "customer-subscription-boss",
        native_expo_token: "ExpoPushToken[customer_native_boss_10906]",
        principal_id: bossPrincipalId,
        subscription_status: "active",
      },
      {
        delivery_channel: "native_expo",
        device_id: paDeviceId,
        id: "customer-subscription-pa",
        native_expo_token: "ExpoPushToken[customer_native_pa_10906]",
        principal_id: paPrincipalId,
        subscription_status: "active",
      },
    ],
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
    booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
    delivery_surface: "customer_app",
    event_key: "BOOK-CUST-DRIVER-NOTIFY-001:customer-in-app:driver-details-ready",
    notification_status: "queued",
    notification_type: "trip_update",
    priority: "normal",
    safe_context: {
      action: "admin_selected",
      message_template: "driver_details_ready",
      provider_send: false,
      source: "customer_copy_compact_row",
    },
    safe_message: "Your Prestige Limo driver details are ready in your customer app.",
    safe_title: "Driver details ready",
    workflow_area: "customer_app_updates",
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
  const {
    adminRoute,
    cleanup,
    customerRoute,
    customerQuickReplyRoute,
    driverQuickReplyRoute,
    driverRoute,
    notificationPersistence,
    tripUpdatesAdapter,
  } = await loadHarness();

  try {
    const maximumStoredCustomerMessage = "A".repeat(1000);
    const mappedLongMessageCentre = tripUpdatesAdapter.mapCustomerNotificationCentrePayload({
      alert_count: 1,
      alerts: [
        {
          created_at: "2026-09-06T03:30:00.000Z",
          latest_message: maximumStoredCustomerMessage,
          latest_title: "Prestige update",
          notification_count: 1,
          notification_type: "trip_update",
          priority: "normal",
          public_booking_reference: "10906",
          workflow_area: "admin_customer_job_messages",
        },
      ],
      delivery_surface: "customer_app",
      external_send: false,
      notification_count: 1,
      ok: true,
      provider_send: false,
      version: "customer-notification-centre-long-message-contract",
    });
    assert.equal(mappedLongMessageCentre.status, "ready");
    assert.equal(mappedLongMessageCentre.alertCount, 1);
    assert.equal(mappedLongMessageCentre.alerts.length, 1);
    assert.equal(mappedLongMessageCentre.alerts[0].latestMessage.length, 500);
    assert.equal(mappedLongMessageCentre.alerts[0].latestMessage.endsWith("..."), true);

    const customerCentreDismissCalls = [];
    const mappedCustomerCentreDismiss = await tripUpdatesAdapter.dismissCustomerNotificationCentre({
      fetcher: async (url, init) => {
        customerCentreDismissCalls.push({ url, init });
        return new Response(JSON.stringify({
          delivery_surface: "customer_app",
          dismissed_count: 3,
          external_send: false,
          ok: true,
          provider_send: false,
          version: "customer-notification-centre-dismiss-contract",
        }), { status: 200 });
      },
    });
    assert.deepEqual(mappedCustomerCentreDismiss, { dismissedCount: 3, status: "ready" });
    assert.equal(customerCentreDismissCalls.length, 1);
    assert.equal(customerCentreDismissCalls[0].url, "/api/customer-app-notifications?view=centre");
    assert.equal(customerCentreDismissCalls[0].init.method, "PATCH");
    assert.equal(customerCentreDismissCalls[0].init.credentials, "same-origin");
    assert.equal(
      customerCentreDismissCalls[0].init.headers["x-prestige-customer-purpose"],
      "customer-in-app-notification-dismiss",
    );
    assert.equal(customerCentreDismissCalls[0].init.body, '{"action":"dismiss_current"}');
    const unsafeCustomerCentreDismiss = await tripUpdatesAdapter.dismissCustomerNotificationCentre({
      fetcher: async () => new Response(JSON.stringify({
        delivery_surface: "customer_app",
        dismissed_count: 3,
        external_send: false,
        ok: true,
        provider_send: false,
        raw_token: "must-not-pass",
        version: "customer-notification-centre-dismiss-contract",
      }), { status: 200 }),
    });
    assert.deepEqual(unsafeCustomerCentreDismiss, { dismissedCount: 0, status: "blocked" });

    setEnv({
      ...validEnv(),
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST: undefined,
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: undefined,
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE: undefined,
    });
    const terminalStatusMock = installMockClient({
      bookings: [
        {
          booking_reference: "BOOK-CUSTOMER-STATUS-001",
          customer_id: 150,
        },
      ],
    });
    const terminalStatusNotification =
      await notificationPersistence.createCustomerDriverAppNotification(
        {
          booking_reference: "BOOK-CUSTOMER-STATUS-001",
          delivery_surface: "customer_app",
          driver_job_link_id: null,
          event_key:
            "BOOK-CUSTOMER-STATUS-001:customer_booking_status:cancelled:2026-07-22T14:59:30.938Z",
          notification_status: "queued",
          notification_type: "booking_status",
          priority: "normal",
          safe_context: {
            customer_facing_status: "cancelled",
            external_send: false,
            provider_send: false,
            source: "admin_booking_status",
          },
          safe_message:
            "Your Prestige Limo booking has been cancelled. Open My Bookings to review.",
          safe_title: "Booking cancelled",
          workflow_area: "customer_booking_status_updates",
        },
        {
          actor_label: "Notification contract admin",
          actor_role: "admin",
          boundary_mode: "server-session-role-surface",
          source_surface: "admin_api",
        },
      );

    assert.equal(terminalStatusNotification.ok, true);
    assert.equal(terminalStatusMock.client.insertHistory.length, 1);
    assert.deepEqual(
      {
        booking_reference:
          terminalStatusMock.client.insertHistory[0].payload.booking_reference,
        delivery_surface:
          terminalStatusMock.client.insertHistory[0].payload.delivery_surface,
        safe_title: terminalStatusMock.client.insertHistory[0].payload.safe_title,
        workflow_area:
          terminalStatusMock.client.insertHistory[0].payload.workflow_area,
      },
      {
        booking_reference: "BOOK-CUSTOMER-STATUS-001",
        delivery_surface: "customer_app",
        safe_title: "Booking cancelled",
        workflow_area: "customer_booking_status_updates",
      },
      "Exact Admin cancellation must use the established customer outbox even when the retired pilot allowlist is closed.",
    );

    setEnv(validEnv());
    const postMock = installMockClient({
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
    });
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
        notification_type: "trip_update",
        safe_title: "Driver details ready",
      },
      "Expected admin POST to create a customer-app notification",
    );
    assert.deepEqual(
      postMock.client.selectHistory[0].filters,
      [{ column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" }],
      "Expected customer-app admin POST to verify the booking before insert.",
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
    const dashboardPostMock = installMockClient({
      driver_job_links: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          expires_at: "2099-12-31T23:59:59.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          link_status: "active",
        },
      ],
    });
    const dashboardPostResult = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              delivery_surface: "driver_app",
              driver_job_link_id: "11111111-1111-4111-8111-111111111111",
              event_key: "BOOK-CUST-DRIVER-NOTIFY-001:admin-driver-message:dashboard",
              notification_type: "trip_update",
              safe_context: {
                audience: "admin_driver",
                external_send: false,
                provider_send: false,
                recipient_role: "driver",
                sender_role: "admin",
                source: "today_jobs",
              },
              safe_message: "Please review the amended pickup time in your Driver Job page.",
              safe_title: "Message from dispatch",
              workflow_area: "admin_driver_job_messages",
            }),
          ),
          headers: validDashboardHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(
      dashboardPostResult.status,
      200,
      "Expected the same-origin dashboard POST to use the verified server-session role without exposing the private request token.",
    );
    assert.equal(dashboardPostResult.body.notification.delivery_surface, "driver_app");
    assert.equal(
      dashboardPostMock.client.insertHistory.length,
      1,
      "Expected exactly one dashboard-scoped driver-app notification insert.",
    );

    setEnv(validEnv());
    const dashboardCustomerPostMock = installMockClient(
      nativeCustomerAudienceSeed("BOOK-CUST-DRIVER-NOTIFY-001"),
    );
    const dashboardCustomerPostResult = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              delivery_surface: "customer_app",
              driver_job_link_id: null,
              event_key: "BOOK-CUST-DRIVER-NOTIFY-001:admin-customer-message:dashboard",
              safe_context: {
                audience: "admin_customer",
                external_send: false,
                provider_send: false,
                recipient_role: "customer",
                sender_role: "admin",
                source: "today_jobs",
              },
              safe_message: "Please meet your driver at the hotel lobby for this booking.",
              safe_title: "Message from dispatch",
              workflow_area: "admin_customer_job_messages",
            }),
          ),
          headers: validDashboardHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );

    assert.equal(
      dashboardCustomerPostResult.status,
      200,
      "Expected the same-origin dashboard POST to queue the approved exact-booking customer message.",
    );
    assert.equal(dashboardCustomerPostResult.body.notification.delivery_surface, "customer_app");
    assert.equal(dashboardCustomerPostResult.body.notification.workflow_area, "admin_customer_job_messages");
    assert.equal(
      dashboardCustomerPostMock.client.insertHistory.length,
      1,
      "Expected exactly one dashboard-scoped customer-app notification insert.",
    );
    for (const table of [
      "customer_access_memberships",
      "customer_access_principals",
      "customer_access_devices",
      "customer_device_push_subscriptions",
    ]) {
      assert.equal(
        dashboardCustomerPostMock.client.selectHistory.some((entry) => entry.table === table),
        true,
        `Admin-to-customer readiness must resolve the exact active Customer native audience through ${table}.`,
      );
    }
    assert.equal(
      dashboardCustomerPostMock.client.selectHistory.some(
        (entry) => entry.table === "driver_job_links",
      ),
      false,
      "Admin-to-customer messages must not depend on or write through the driver-link lane.",
    );

    const principalAudienceDriverToken = "qa-10906-driver-quick-reply-token";
    const principalAudienceDriverLinkId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
    setEnv(validEnv());
    const driverCustomerPostMock = installMockClient({
      ...nativeCustomerAudienceSeed("BOOK-CUST-DRIVER-NOTIFY-001"),
      driver_job_links: [{
        booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
        expires_at: validDriverLinkExpiresAt,
        id: principalAudienceDriverLinkId,
        link_status: "active",
        revoked_at: null,
        token_hash: tokenHash(principalAudienceDriverToken),
      }],
      driver_job_status_events: [],
    });
    const driverCustomerPostResult = await responseJson(
      await driverQuickReplyRoute.POST(
        new Request(
          `http://localhost/api/driver-job/${principalAudienceDriverToken}/quick-replies`,
          {
            body: JSON.stringify({
              client_message_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
              message_text: "Testing back from driver",
            }),
            headers: { "content-type": "application/json" },
            method: "POST",
          },
        ),
        routeContext(principalAudienceDriverToken),
      ),
    );

    assert.equal(
      driverCustomerPostResult.status,
      200,
      "Exact active Customer principal audience must allow the scoped Driver token reply without the retired customer-id allowlist.",
    );
    assert.equal(driverCustomerPostResult.body.direction, "driver_to_customer");
    assert.equal(driverCustomerPostResult.body.delivery_surface, "customer_app");
    assert.equal(driverCustomerPostResult.body.external_send, false);
    assert.equal(driverCustomerPostResult.body.provider_send, false);
    assert.equal(
      driverCustomerPostMock.client.insertHistory.length,
      1,
      "Driver-to-customer must save exactly one scoped customer-app outbox row before best-effort push.",
    );

    setEnv(validEnv());
    const inactiveNativeAudienceSeed = nativeCustomerAudienceSeed(
      "BOOK-CUST-DRIVER-NOTIFY-001",
    );
    inactiveNativeAudienceSeed.customer_device_push_subscriptions = [];
    const inactiveNativeAudienceMock = installMockClient(inactiveNativeAudienceSeed);
    const inactiveNativeAudienceResult = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              delivery_surface: "customer_app",
              driver_job_link_id: null,
              event_key: "BOOK-CUST-DRIVER-NOTIFY-001:admin-customer-message:no-active-native-audience",
              safe_context: {
                audience: "admin_customer",
                external_send: false,
                provider_send: false,
                recipient_role: "customer",
                sender_role: "admin",
                source: "today_jobs",
              },
              safe_message: "Please meet your driver at the hotel lobby for this booking.",
              safe_title: "Message from dispatch",
              workflow_area: "admin_customer_job_messages",
            }),
          ),
          headers: validDashboardHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );
    assert.equal(
      inactiveNativeAudienceResult.status,
      403,
      "Active principal membership without an active native device subscription must fail closed.",
    );
    assert.equal(
      inactiveNativeAudienceMock.client.insertHistory.length,
      0,
      "A Customer-target message must not persist when the exact active native audience is not ready.",
    );

    setEnv(validEnv());
    const wrongCustomerAudienceMock = installMockClient({
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
    });
    const wrongCustomerAudienceResult = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              delivery_surface: "customer_app",
              driver_job_link_id: null,
              event_key: "BOOK-CUST-DRIVER-NOTIFY-001:admin-customer-message:wrong-audience",
              safe_context: {
                audience: "admin_driver",
                external_send: false,
                provider_send: false,
                recipient_role: "driver",
                sender_role: "admin",
                source: "today_jobs",
              },
              safe_message: "Please meet at the hotel lobby for this booking.",
              safe_title: "Message from dispatch",
              workflow_area: "admin_customer_job_messages",
            }),
          ),
          headers: validDashboardHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );
    assert.equal(wrongCustomerAudienceResult.status, 400);
    assert.equal(
      wrongCustomerAudienceMock.client.insertHistory.length,
      0,
      "A customer-app message carrying driver audience context must fail closed.",
    );

    setEnv({
      ...validEnv(),
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST: undefined,
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: undefined,
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE: undefined,
    });
    const runtimeClosedPostMock = installMockClient({
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
    });
    const runtimeClosedPost = await responseJson(
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
    assert.equal(runtimeClosedPost.status, 403);
    assert.equal(runtimeClosedPostMock.client.insertHistory.length, 0, "Runtime-closed customer_app write must not insert.");

    setEnv(validEnv());
    const wrongTemplatePostMock = installMockClient({
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
    });
    const wrongTemplatePost = await responseJson(
      await adminRoute.POST(
        new Request("http://localhost/api/admin-customer-driver-app-notifications", {
          body: JSON.stringify(
            safeNotificationPayload({
              safe_title: "Booking request received",
            }),
          ),
          headers: validAdminHeaders({
            "content-type": "application/json",
          }),
          method: "POST",
        }),
      ),
    );
    assert.equal(wrongTemplatePost.status, 400);
    assert.equal(wrongTemplatePostMock.client.insertHistory.length, 0, "Wrong customer_app template must not insert.");

    setEnv(validEnv());
    const driverPostMock = installMockClient({
      driver_job_links: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          expires_at: "2099-12-31T23:59:59.000Z",
          id: "11111111-1111-4111-8111-111111111111",
          link_status: "active",
        },
      ],
    });
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

    setEnv(validEnv());
    const portalToken = createPortalAccessToken("customer-runtime-account-001");
    const customerDriverDetailsAcknowledgementMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          actor_label: "Notification contract admin",
          actor_role: "admin",
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          id: "notification-driver-details-ready",
          notification_type: "trip_update",
          safe_context: {
            action: "admin_selected",
            message_template: "driver_details_ready",
            provider_send: false,
            source: "customer_copy_compact_row",
          },
          safe_message: "Your Prestige Limo driver details are ready in your customer app.",
          safe_title: "Driver details ready",
          source_surface: "admin_api",
          workflow_area: "customer_app_updates",
        }),
      ],
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
      customer_access_accounts: [
        {
          account_status: "active",
          customer_account_reference: "customer-runtime-account-001",
        },
      ],
    });
    const acknowledgementRequest = () =>
      new Request("http://localhost/api/customer-driver-quick-replies", {
        body: JSON.stringify({
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          template_key: "customer_driver_details_acknowledged",
        }),
        headers: {
          "content-type": "application/json",
          cookie: `prestige_customer_saved_bookings_session=${portalToken}`,
          referer: "http://localhost/my-bookings?booking=BOOK-CUST-DRIVER-NOTIFY-001",
          "x-prestige-customer-purpose": "customer-driver-quick-reply",
        },
        method: "POST",
      });
    const customerDriverDetailsAcknowledgement = await responseJson(
      await customerQuickReplyRoute.POST(acknowledgementRequest()),
    );

    assert.equal(
      customerDriverDetailsAcknowledgement.status,
      200,
      JSON.stringify(customerDriverDetailsAcknowledgement.body),
    );
    assert.equal(customerDriverDetailsAcknowledgement.body.direction, "customer_to_admin");
    assert.equal(customerDriverDetailsAcknowledgement.body.delivery_surface, "customer_app");
    assert.equal(customerDriverDetailsAcknowledgementMock.client.insertHistory.length, 1);
    assert.deepEqual(
      {
        actor_role: customerDriverDetailsAcknowledgementMock.client.insertHistory[0].payload.actor_role,
        delivery_surface:
          customerDriverDetailsAcknowledgementMock.client.insertHistory[0].payload.delivery_surface,
        driver_job_link_id:
          customerDriverDetailsAcknowledgementMock.client.insertHistory[0].payload.driver_job_link_id,
        safe_message:
          customerDriverDetailsAcknowledgementMock.client.insertHistory[0].payload.safe_message,
        safe_title:
          customerDriverDetailsAcknowledgementMock.client.insertHistory[0].payload.safe_title,
        workflow_area:
          customerDriverDetailsAcknowledgementMock.client.insertHistory[0].payload.workflow_area,
      },
      {
        actor_role: "customer",
        delivery_surface: "customer_app",
        driver_job_link_id: null,
        safe_message: "Driver details acknowledged.",
        safe_title: "Driver details acknowledged",
        workflow_area: "customer_driver_details_acknowledgements",
      },
      "Expected explicit customer acknowledgement to remain admin-visible and off the driver surface.",
    );

    const repeatedCustomerDriverDetailsAcknowledgement = await responseJson(
      await customerQuickReplyRoute.POST(acknowledgementRequest()),
    );
    assert.equal(repeatedCustomerDriverDetailsAcknowledgement.status, 200);
    assert.equal(repeatedCustomerDriverDetailsAcknowledgement.body.direction, "customer_to_admin");
    assert.equal(
      customerDriverDetailsAcknowledgementMock.client.insertHistory.length,
      1,
      "Expected repeated acknowledgement to return the existing row without a duplicate insert.",
    );

    setEnv(validEnv());
    const acknowledgementWithoutSendMock = installMockClient({
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
      customer_access_accounts: [
        {
          account_status: "active",
          customer_account_reference: "customer-runtime-account-001",
        },
      ],
    });
    const acknowledgementWithoutSend = await responseJson(
      await customerQuickReplyRoute.POST(acknowledgementRequest()),
    );
    assert.equal(acknowledgementWithoutSend.status, 409);
    assert.equal(
      acknowledgementWithoutSendMock.client.insertHistory.length,
      0,
      "Expected acknowledgement without the prior exact-booking admin send to fail without a write.",
    );

    const rootPrincipalToken = "customer_principal_v1.booker-root-notifications";
    const bossPrincipalToken = "customer_principal_v1.boss-notifications";
    const wrongRootPrincipalToken = "customer_principal_v1.wrong-booker-notifications";
    globalThis.__prestigeCustomerNotificationPrincipalSessions = new Map([
      [
        rootPrincipalToken,
        {
          memberships: [{
            booker_id: 26,
            company_id: 53,
            customer_account_reference: "customer-runtime-account-001",
            membership_role: "managing_pa",
            traveler_id: null,
            verified_boss_name: "Verified Booker",
          }],
          normalized_email: "booker@example.test",
          principal_id: "11111111-1111-4111-8111-111111111111",
          principal_role: "pa",
        },
      ],
      [
        bossPrincipalToken,
        {
          memberships: [{
            booker_id: 26,
            company_id: 53,
            customer_account_reference: "customer-runtime-account-001",
            membership_role: "boss",
            traveler_id: 41,
            verified_boss_name: "Verified Boss",
          }],
          normalized_email: "boss@example.test",
          principal_id: "33333333-3333-4333-8333-333333333333",
          principal_role: "boss",
        },
      ],
      [
        wrongRootPrincipalToken,
        {
          memberships: [{
            booker_id: 27,
            company_id: 53,
            customer_account_reference: "other-account",
            membership_role: "managing_pa",
            traveler_id: null,
            verified_boss_name: "Other Booker",
          }],
          normalized_email: "other@example.test",
          principal_id: "22222222-2222-4222-8222-222222222222",
          principal_role: "pa",
        },
      ],
    ]);
    setEnv(validEnv());
    const rootPrincipalReadMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          id: "notification-root-booker-visible",
          notification_type: "trip_update",
          safe_message: "Shared booking message.",
          safe_title: "Driver reply",
          workflow_area: "driver_customer_job_messages",
        }),
      ],
      bookings: [{
        booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
        booker_id: 26,
        company_id: 53,
        customer_id: "customer-runtime-account-001",
        traveler_id: 41,
      }],
    });
    const rootPrincipalRead = await responseJson(
      await customerRoute.GET(new Request(
        "http://localhost/api/customer-app-notifications?booking_reference=BOOK-CUST-DRIVER-NOTIFY-001&limit=5&page=1",
        {
          headers: {
            referer: "http://localhost/my-bookings?booking=BOOK-CUST-DRIVER-NOTIFY-001",
            "x-prestige-customer-purpose": "customer-in-app-notification-read",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
        },
      )),
    );
    assert.equal(rootPrincipalRead.status, 200);
    assert.equal(rootPrincipalRead.body.notifications.length, 1);
    assert.equal(rootPrincipalRead.body.notifications[0].safe_message, "Shared booking message.");
    assert.equal(rootPrincipalReadMock.client.insertHistory.length, 0);

    const pagedCentreNotifications = Array.from({ length: 501 }, (_, index) =>
      seededNotification({
        booking_reference: "BOOK-CUST-CENTRE-001",
        created_at: new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString(),
        id: `notification-centre-${String(501 - index).padStart(4, "0")}`,
        notification_type: index % 2 === 0 ? "booking_status" : "trip_update",
        safe_message: `Safe customer update ${index + 1}.`,
        safe_title: index === 500 ? "Latest safe customer update" : "Customer update",
        workflow_area: index % 2 === 0 ? "customer_booking_request" : "admin_customer_job_messages",
      }),
    );
    const customerPrincipalCentreMock = installMockClient({
      [notificationTable]: [
        ...pagedCentreNotifications,
        seededNotification({
          booking_reference: "BOOK-CUST-CENTRE-OLD",
          id: "notification-centre-outside-booking-history-window",
          safe_message: "An old booking alert must not remain in the current centre.",
          safe_title: "Old booking update",
        }),
        seededNotification({
          booking_reference: "BOOK-CUST-CENTRE-OTHER",
          id: "notification-centre-cross-account",
          safe_message: "Another account must not see this alert.",
          safe_title: "Cross-account alert",
        }),
      ],
      bookings: [
        {
          booking_reference: "BOOK-CUST-CENTRE-001",
          booker_id: 26,
          company_id: 53,
          customer_id: "customer-runtime-account-001",
          public_booking_reference: "10906",
          pickup_at: new Date().toISOString(),
          traveler_id: 41,
        },
        {
          booking_reference: "BOOK-CUST-CENTRE-OLD",
          booker_id: 26,
          company_id: 53,
          customer_id: "customer-runtime-account-001",
          public_booking_reference: "10800",
          pickup_at: "2024-01-01T00:00:00.000Z",
          traveler_id: 41,
        },
        {
          booking_reference: "BOOK-CUST-CENTRE-OTHER",
          booker_id: 27,
          company_id: 53,
          customer_id: "other-account",
          public_booking_reference: "10907",
          pickup_at: new Date().toISOString(),
          traveler_id: 42,
        },
      ],
    });
    const customerPrincipalCentre = await responseJson(
      await customerRoute.GET(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          headers: {
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-read",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
        },
      )),
    );
    assert.equal(customerPrincipalCentre.status, 200);
    assert.equal(customerPrincipalCentre.body.alert_count, 501);
    assert.equal(customerPrincipalCentre.body.notification_count, 501);
    assert.deepEqual(customerPrincipalCentre.body.alerts, [
      {
        created_at: "2026-08-01T00:08:20.000Z",
        latest_message: "Safe customer update 501.",
        latest_title: "Latest safe customer update",
        notification_count: 501,
        notification_type: "booking_status",
        priority: "normal",
        public_booking_reference: "10906",
        workflow_area: "customer_booking_request",
      },
    ]);
    assert.equal(
      customerPrincipalCentreMock.client.selectHistory.filter(
        (entry) => entry.table === notificationTable,
      ).length,
      4,
      "Expected two stable account-scoped snapshots to cursor beyond the first 500 queued alerts.",
    );
    assert.deepEqual(
      customerPrincipalCentreMock.client.selectHistory.find(
        (entry) => entry.table === "bookings",
      )?.filters,
      [
        { column: "company_id", type: "eq", value: 53 },
        { column: "booker_id", type: "eq", value: 26 },
        {
          column: "pickup_at",
          type: "gte",
          value: customerPrincipalCentreMock.client.selectHistory.find(
            (entry) => entry.table === "bookings",
          )?.filters.find((filter) => filter.column === "pickup_at")?.value,
        },
      ],
      "Expected the Customer centre to scope the PA root by verified Company+Booker identity and the My Bookings history window.",
    );
    assert.match(
      customerPrincipalCentreMock.client.selectHistory.find(
        (entry) => entry.table === "bookings",
      )?.filters.find((filter) => filter.column === "pickup_at")?.value || "",
      /^\d{4}-\d{2}-01T00:00:00\.000Z$/,
      "Expected the Customer centre to use the established month-boundary history window.",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(customerPrincipalCentre.body)), false);
    assert.equal(customerPrincipalCentreMock.client.insertHistory.length, 0);
    assert.equal(customerPrincipalCentreMock.client.updateHistory.length, 0);

    const malformedCustomerCentreDismiss = await responseJson(
      await customerRoute.PATCH(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          body: JSON.stringify({ action: "dismiss_current", booking_reference: "10906" }),
          headers: {
            "content-type": "application/json",
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-dismiss",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
          method: "PATCH",
        },
      )),
    );
    assert.equal(malformedCustomerCentreDismiss.status, 400);
    assert.deepEqual(malformedCustomerCentreDismiss.body, {
      error: "Customer alert clear request is malformed.",
      ok: false,
    });
    assert.equal(customerPrincipalCentreMock.client.updateHistory.length, 0);
    assert.equal(customerPrincipalCentreMock.client.rpcHistory.length, 0);

    const crossOriginCustomerCentreDismiss = await responseJson(
      await customerRoute.PATCH(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          body: JSON.stringify({ action: "dismiss_current" }),
          headers: {
            "content-type": "application/json",
            referer: "https://attacker.example/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-dismiss",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
          method: "PATCH",
        },
      )),
    );
    assert.equal(crossOriginCustomerCentreDismiss.status, 403);
    assert.equal(customerPrincipalCentreMock.client.updateHistory.length, 0);
    assert.equal(customerPrincipalCentreMock.client.rpcHistory.length, 0);

    const customerPrincipalCentreDismiss = await responseJson(
      await customerRoute.PATCH(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          body: JSON.stringify({ action: "dismiss_current" }),
          headers: {
            "content-type": "application/json",
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-dismiss",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
          method: "PATCH",
        },
      )),
    );
    assert.equal(customerPrincipalCentreDismiss.status, 200);
    assert.deepEqual(customerPrincipalCentreDismiss.body, {
      delivery_surface: "customer_app",
      dismissed_count: 501,
      external_send: false,
      ok: true,
      provider_send: false,
      version: "stage-customer-in-app-notification-runtime-v1",
    });
    assert.equal(customerPrincipalCentreMock.client.updateHistory.length, 0);
    assert.equal(customerPrincipalCentreMock.client.rpcHistory.length, 1);
    assert.equal(
      customerPrincipalCentreMock.client.rpcHistory[0]?.functionName,
      "dismiss_customer_notification_centre",
    );
    const rpcNotificationIds =
      customerPrincipalCentreMock.client.rpcHistory[0]?.args.p_notification_ids || [];
    assert.equal(rpcNotificationIds.length, 501);
    assert.deepEqual(
      [...rpcNotificationIds].sort(),
      pagedCentreNotifications.map(({ id }) => id).sort(),
      "Expected all 501 exact scoped IDs in one RPC request body, never a PostgREST URL filter.",
    );
    assert.equal(
      customerPrincipalCentreMock.client.tables[notificationTable].filter(
        (row) => row.booking_reference === "BOOK-CUST-CENTRE-001" && row.notification_status === "dismissed",
      ).length,
      501,
    );
    assert.equal(
      customerPrincipalCentreMock.client.tables[notificationTable].find(
        (row) => row.id === "notification-centre-outside-booking-history-window",
      )?.notification_status,
      "queued",
      "Clear must not dismiss an alert outside the established My Bookings history window.",
    );
    assert.equal(
      customerPrincipalCentreMock.client.tables[notificationTable].find(
        (row) => row.id === "notification-centre-cross-account",
      )?.notification_status,
      "queued",
      "Clear must not dismiss another Company+Booker account's alert.",
    );
    assert.equal(customerPrincipalCentreMock.client.insertHistory.length, 0);
    const customerPrincipalCentreAfterDismiss = await responseJson(
      await customerRoute.GET(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          headers: {
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-read",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
        },
      )),
    );
    assert.equal(customerPrincipalCentreAfterDismiss.status, 200);
    assert.equal(customerPrincipalCentreAfterDismiss.body.alert_count, 0);
    assert.deepEqual(customerPrincipalCentreAfterDismiss.body.alerts, []);

    const customerBossCentreMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-CUST-CENTRE-BOSS",
          id: "notification-centre-boss",
          safe_message: "The driver is on the way for the Boss booking.",
          safe_title: "Driver on the way",
        }),
        seededNotification({
          booking_reference: "BOOK-CUST-CENTRE-SIBLING",
          id: "notification-centre-sibling",
          safe_message: "A sibling verified Boss must not see this sibling booking.",
          safe_title: "Sibling booking update",
        }),
      ],
      bookings: [
        {
          booking_reference: "BOOK-CUST-CENTRE-BOSS-NO-ALERT",
          booker_id: 26,
          company_id: 53,
          customer_id: "customer-runtime-account-001",
          public_booking_reference: "10908",
          pickup_at: new Date().toISOString(),
          traveler_id: 41,
        },
        {
          booking_reference: "BOOK-CUST-CENTRE-BOSS",
          booker_id: 26,
          company_id: 53,
          customer_id: "customer-runtime-account-001",
          public_booking_reference: "10909",
          pickup_at: new Date().toISOString(),
          traveler_id: 41,
        },
        {
          booking_reference: "BOOK-CUST-CENTRE-SIBLING",
          booker_id: 26,
          company_id: 53,
          customer_id: "customer-runtime-account-001",
          public_booking_reference: "10910",
          pickup_at: new Date().toISOString(),
          traveler_id: 42,
        },
      ],
    });
    const customerBossCentre = await responseJson(
      await customerRoute.GET(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          headers: {
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-read",
            "x-prestige-customer-session-token": bossPrincipalToken,
          },
        },
      )),
    );
    assert.equal(customerBossCentre.status, 200);
    assert.equal(customerBossCentre.body.alert_count, 1);
    assert.deepEqual(
      customerBossCentre.body.alerts.map((alert) => alert.public_booking_reference),
      ["10909"],
      "Expected the Boss to use the same notification centre while seeing only that verified Traveller's booking.",
    );
    assert.deepEqual(
      customerBossCentreMock.client.selectHistory.find(
        (entry) => entry.table === "bookings",
      )?.filters,
      [
        { column: "company_id", type: "eq", value: 53 },
        { column: "booker_id", type: "eq", value: 26 },
        { column: "traveler_id", type: "eq", value: 41 },
        {
          column: "pickup_at",
          type: "gte",
          value: customerBossCentreMock.client.selectHistory.find(
            (entry) => entry.table === "bookings",
          )?.filters.find((filter) => filter.column === "pickup_at")?.value,
        },
      ],
      "Expected Boss alerts to require exact Company+Booker+Traveller membership inside the My Bookings history window.",
    );
    assert.equal(
      JSON.stringify(customerBossCentre.body).includes("Sibling booking update"),
      false,
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(customerBossCentre.body)), false);
    assert.equal(customerBossCentreMock.client.insertHistory.length, 0);
    assert.equal(customerBossCentreMock.client.updateHistory.length, 0);

    const customerBossCentreDismiss = await responseJson(
      await customerRoute.PATCH(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          body: JSON.stringify({ action: "dismiss_current" }),
          headers: {
            "content-type": "application/json",
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-dismiss",
            "x-prestige-customer-session-token": bossPrincipalToken,
          },
          method: "PATCH",
        },
      )),
    );
    assert.equal(customerBossCentreDismiss.status, 200);
    assert.equal(customerBossCentreDismiss.body.dismissed_count, 1);
    assert.equal(
      customerBossCentreMock.client.tables[notificationTable].find(
        (row) => row.id === "notification-centre-boss",
      )?.notification_status,
      "dismissed",
    );
    assert.equal(
      customerBossCentreMock.client.tables[notificationTable].find(
        (row) => row.id === "notification-centre-sibling",
      )?.notification_status,
      "queued",
      "Boss Clear must not dismiss a sibling Traveller's alert in the shared Company+Booker account.",
    );

    const unstableCustomerCentreMock = installMockClient({
      [notificationTable]: pagedCentreNotifications,
      bookings: [{
        booking_reference: "BOOK-CUST-CENTRE-001",
        booker_id: 26,
        company_id: 53,
        customer_id: "customer-runtime-account-001",
        public_booking_reference: "10906",
        pickup_at: new Date().toISOString(),
        traveler_id: 41,
      }],
    });
    const stableSelectRows = unstableCustomerCentreMock.client.selectRows.bind(
      unstableCustomerCentreMock.client,
    );
    let unstableNotificationReadCount = 0;
    unstableCustomerCentreMock.client.selectRows = (...args) => {
      if (args[0] === notificationTable) {
        unstableNotificationReadCount += 1;
        if (unstableNotificationReadCount === 3) {
          unstableCustomerCentreMock.client.tables[notificationTable].pop();
        }
      }
      return stableSelectRows(...args);
    };
    const unstableCustomerCentre = await responseJson(
      await customerRoute.GET(new Request(
        "http://localhost/api/customer-app-notifications?view=centre",
        {
          headers: {
            referer: "http://localhost/my-bookings",
            "x-prestige-customer-purpose": "customer-in-app-notification-read",
            "x-prestige-customer-session-token": rootPrincipalToken,
          },
        },
      )),
    );
    assert.equal(unstableCustomerCentre.status, 409);
    assert.deepEqual(unstableCustomerCentre.body, {
      error: "Customer app notification read failed safely.",
      ok: false,
    });
    assert.equal(unstableCustomerCentreMock.client.insertHistory.length, 0);
    assert.equal(unstableCustomerCentreMock.client.updateHistory.length, 0);

    const wrongRootPrincipalRead = await responseJson(
      await customerRoute.GET(new Request(
        "http://localhost/api/customer-app-notifications?booking_reference=BOOK-CUST-DRIVER-NOTIFY-001&limit=5&page=1",
        {
          headers: {
            referer: "http://localhost/my-bookings?booking=BOOK-CUST-DRIVER-NOTIFY-001",
            "x-prestige-customer-purpose": "customer-in-app-notification-read",
            "x-prestige-customer-session-token": wrongRootPrincipalToken,
          },
        },
      )),
    );
    assert.equal(wrongRootPrincipalRead.status, 403);
    assert.equal(
      rootPrincipalReadMock.client.selectHistory.filter((entry) => entry.table === notificationTable).length,
      1,
      "A wrong Company+Booker root must stop before another notification-history read.",
    );

    setEnv(validEnv());
    const customerPortalReadMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          id: "notification-customer-driver-status",
          notification_status: "queued",
          notification_type: "driver_status",
          safe_context: {
            external_send: false,
            provider_send: false,
            source: "driver_job_status",
            status_key: "driver_otw",
            status_label: "Driver on the way",
          },
          safe_message: "Your Prestige Limo driver is on the way to pickup.",
          safe_title: "Driver on the way",
          workflow_area: "driver_status_customer_in_app",
        }),
        seededNotification({
          actor_role: "admin",
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          created_at: "2026-06-08T02:00:00.000Z",
          delivery_surface: "customer_app",
          id: "notification-admin-customer-message",
          notification_type: "trip_update",
          safe_message: "Please meet your driver at the hotel lobby for this booking.",
          safe_title: "Message from dispatch",
          workflow_area: "admin_customer_job_messages",
        }),
        seededNotification({
          actor_role: "admin",
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          id: "notification-admin-driver-hidden-from-customer",
          notification_type: "trip_update",
          safe_message: "Private instruction for the driver.",
          safe_title: "Message from dispatch",
          workflow_area: "admin_driver_job_messages",
        }),
        seededNotification({
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-OTHER",
          delivery_surface: "customer_app",
          id: "notification-other-customer-hidden",
          notification_type: "driver_status",
          safe_title: "Other driver status",
        }),
      ],
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
      customer_access_accounts: [
        {
          account_status: "active",
          customer_account_reference: "customer-runtime-account-001",
        },
      ],
    });
    const customerPortalRead = await responseJson(
      await customerRoute.GET(
        new Request(
          "http://localhost/api/customer-app-notifications?booking_reference=BOOK-CUST-DRIVER-NOTIFY-001&limit=5&page=1",
          {
            headers: {
              cookie: `prestige_customer_saved_bookings_session=${portalToken}`,
              referer:
                "http://localhost/my-bookings?booking=BOOK-CUST-DRIVER-NOTIFY-001&tracking=1",
              "x-prestige-customer-purpose": "customer-in-app-notification-read",
            },
          },
        ),
      ),
    );

    assert.equal(customerPortalRead.status, 200);
    assert.deepEqual(
      customerPortalRead.body.notifications.map((notification) => ({
        booking_reference: notification.booking_reference,
        delivery_surface: notification.delivery_surface,
        notification_type: notification.notification_type,
        safe_message: notification.safe_message,
        safe_title: notification.safe_title,
      })),
      [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          notification_type: "driver_status",
          safe_message: "Your Prestige Limo driver is on the way to pickup.",
          safe_title: "Driver on the way",
        },
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          notification_type: "trip_update",
          safe_message: "Please meet your driver at the hotel lobby for this booking.",
          safe_title: "Message from dispatch",
        },
      ],
      "Expected customer portal access cookie to read only its booking-scoped driver status update",
    );
    assert.deepEqual(
      customerPortalReadMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        table: entry.table,
      })),
      [
        {
          filters: [
            {
              column: "customer_account_reference",
              type: "eq",
              value: "customer-runtime-account-001",
            },
            { column: "account_status", type: "eq", value: "active" },
          ],
          table: "customer_access_accounts",
        },
        {
          filters: [
            { column: "customer_id", type: "eq", value: "customer-runtime-account-001" },
            { column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" },
          ],
          table: "bookings",
        },
        {
          filters: [
            { column: "delivery_surface", type: "eq", value: "customer_app" },
            { column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" },
          ],
          table: notificationTable,
        },
      ],
      "Expected customer portal notification read to require active account and exact booking ownership before notification read",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(customerPortalRead.body)), false);

    setEnv(validEnv());
    const customerPortalStatusFallbackMock = installMockClient({
      [notificationTable]: [],
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
      customer_access_accounts: [
        {
          account_status: "active",
          customer_account_reference: "customer-runtime-account-001",
        },
      ],
      driver_job_status_events: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          occurred_at: "2026-07-06T10:12:00.000Z",
          status_value: "driver_otw",
        },
      ],
    });
    const customerPortalStatusFallback = await responseJson(
      await customerRoute.GET(
        new Request(
          "http://localhost/api/customer-app-notifications?booking_reference=BOOK-CUST-DRIVER-NOTIFY-001&limit=5&page=1",
          {
            headers: {
              cookie: `prestige_customer_saved_bookings_session=${portalToken}`,
              referer:
                "http://localhost/my-bookings?booking=BOOK-CUST-DRIVER-NOTIFY-001&tracking=1",
              "x-prestige-customer-purpose": "customer-in-app-notification-read",
            },
          },
        ),
      ),
    );

    assert.equal(customerPortalStatusFallback.status, 200);
    assert.deepEqual(
      customerPortalStatusFallback.body.notifications.map((notification) => ({
        booking_reference: notification.booking_reference,
        created_at: notification.created_at,
        delivery_surface: notification.delivery_surface,
        notification_type: notification.notification_type,
        safe_message: notification.safe_message,
        safe_title: notification.safe_title,
      })),
      [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          created_at: "2026-07-06T10:12:00.000Z",
          delivery_surface: "customer_app",
          notification_type: "driver_status",
          safe_message: "Your Prestige Limo driver is on the way to pickup.",
          safe_title: "Driver on the way",
        },
      ],
      "Expected customer portal notification read to fall back to customer-safe driver status events",
    );
    assert.deepEqual(
      customerPortalStatusFallbackMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        table: entry.table,
      })),
      [
        {
          filters: [
            {
              column: "customer_account_reference",
              type: "eq",
              value: "customer-runtime-account-001",
            },
            { column: "account_status", type: "eq", value: "active" },
          ],
          table: "customer_access_accounts",
        },
        {
          filters: [
            { column: "customer_id", type: "eq", value: "customer-runtime-account-001" },
            { column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" },
          ],
          table: "bookings",
        },
        {
          filters: [
            { column: "delivery_surface", type: "eq", value: "customer_app" },
            { column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" },
          ],
          table: notificationTable,
        },
        {
          filters: [{ column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" }],
          table: "driver_job_status_events",
        },
      ],
      "Expected customer portal fallback to read driver status only after active account and exact booking ownership checks",
    );
    assert.equal(
      unsafeNotificationLeakPattern.test(JSON.stringify(customerPortalStatusFallback.body)),
      false,
      "Expected fallback driver status response to avoid internal notification/link/GPS/finance fields",
    );

    setEnv({
      ...validEnv(),
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_ACCOUNT_ALLOWLIST: undefined,
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_ENABLED: undefined,
      PRESTIGE_CUSTOMER_IN_APP_NOTIFICATION_RUNTIME_MODE: undefined,
    });
    const customerPortalRuntimeClosedFallbackMock = installMockClient({
      [notificationTable]: [],
      bookings: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          customer_id: "customer-runtime-account-001",
        },
      ],
      customer_access_accounts: [
        {
          account_status: "active",
          customer_account_reference: "customer-runtime-account-001",
        },
      ],
      driver_job_status_events: [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          occurred_at: "2026-07-06T10:12:00.000Z",
          status_value: "driver_otw",
        },
      ],
    });
    const customerPortalRuntimeClosedFallback = await responseJson(
      await customerRoute.GET(
        new Request(
          "http://localhost/api/customer-app-notifications?booking_reference=BOOK-CUST-DRIVER-NOTIFY-001&limit=5&page=1",
          {
            headers: {
              cookie: `prestige_customer_saved_bookings_session=${portalToken}`,
              referer:
                "http://localhost/my-bookings?booking=BOOK-CUST-DRIVER-NOTIFY-001&tracking=1",
              "x-prestige-customer-purpose": "customer-in-app-notification-read",
            },
          },
        ),
      ),
    );

    assert.equal(customerPortalRuntimeClosedFallback.status, 200);
    assert.deepEqual(
      customerPortalRuntimeClosedFallback.body.notifications.map((notification) => ({
        booking_reference: notification.booking_reference,
        delivery_surface: notification.delivery_surface,
        notification_type: notification.notification_type,
        safe_message: notification.safe_message,
        safe_title: notification.safe_title,
      })),
      [
        {
          booking_reference: "BOOK-CUST-DRIVER-NOTIFY-001",
          delivery_surface: "customer_app",
          notification_type: "driver_status",
          safe_message: "Your Prestige Limo driver is on the way to pickup.",
          safe_title: "Driver on the way",
        },
      ],
      "Expected portal app link to read safe driver status even when legacy customer in-app runtime is off",
    );
    assert.deepEqual(
      customerPortalRuntimeClosedFallbackMock.client.selectHistory.map((entry) => ({
        filters: entry.filters,
        table: entry.table,
      })),
      [
        {
          filters: [
            {
              column: "customer_account_reference",
              type: "eq",
              value: "customer-runtime-account-001",
            },
            { column: "account_status", type: "eq", value: "active" },
          ],
          table: "customer_access_accounts",
        },
        {
          filters: [
            { column: "customer_id", type: "eq", value: "customer-runtime-account-001" },
            { column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" },
          ],
          table: "bookings",
        },
        {
          filters: [
            { column: "delivery_surface", type: "eq", value: "customer_app" },
            { column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" },
          ],
          table: notificationTable,
        },
        {
          filters: [{ column: "booking_reference", type: "eq", value: "BOOK-CUST-DRIVER-NOTIFY-001" }],
          table: "driver_job_status_events",
        },
      ],
      "Expected portal runtime-closed fallback to keep active account, exact booking ownership, and exact status filters",
    );
    assert.equal(
      unsafeNotificationLeakPattern.test(JSON.stringify(customerPortalRuntimeClosedFallback.body)),
      false,
      "Expected portal runtime-closed fallback to avoid internal notification/link/GPS/finance fields",
    );

    const driverToken = "safe-driver-notification-token";
    const driverLinkId = "11111111-1111-4111-8111-111111111111";
    setEnv(validEnv());
    const driverGetMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          created_at: "2026-06-08T01:00:00.000Z",
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
          notification_type: "trip_update",
          safe_message: "Please meet your driver at the hotel lobby for this booking.",
          safe_title: "Message from dispatch",
          workflow_area: "admin_customer_job_messages",
        }),
        seededNotification({
          actor_role: "driver",
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          created_at: "2026-06-08T02:00:00.000Z",
          delivery_surface: "customer_app",
          id: "notification-driver-reply-dismissed-by-customer-centre",
          notification_status: "dismissed",
          notification_type: "trip_update",
          safe_message: "I have arrived at the pickup point.",
          safe_title: "Message from driver",
          workflow_area: "customer_driver_quick_replies",
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
          expires_at: validDriverLinkExpiresAt,
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
          notification_status: "dismissed",
          notification_type: "trip_update",
          safe_title: "Message from driver",
        },
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          notification_status: "queued",
          notification_type: "trip_update",
          safe_title: "Dispatch update",
        },
      ],
      "Expected Driver history to retain its exact sent quick reply after Customer clears the current alert",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(driverGet.body)), false);
    assert.equal(driverGetMock.client.selectHistory.length, 2);
    assert.deepEqual(driverGetMock.client.selectHistory[0].filters, [
      { column: "token_hash", type: "eq", value: tokenHash(driverToken) },
    ]);
    const driverNotificationRead = driverGetMock.client.selectHistory[1];
    assert.equal(driverNotificationRead.table, notificationTable);
    assert.deepEqual(driverNotificationRead.range, { from: 0, to: 9 });
    assert.deepEqual(driverNotificationRead.selectOptions, { count: "exact" });
    assert.deepEqual(
      driverNotificationRead.filters,
      [
        { column: "booking_reference", type: "eq", value: "BOOK-DRIVER-NOTIFY-001" },
        {
          conditions: [
            {
              conditions: [
                { column: "delivery_surface", type: "eq", value: "driver_app" },
                { column: "notification_status", type: "eq", value: "queued" },
              ],
              type: "and",
            },
            {
              conditions: [
                { column: "delivery_surface", type: "eq", value: "customer_app" },
                { column: "actor_role", type: "eq", value: "driver" },
                {
                  column: "workflow_area",
                  type: "eq",
                  value: "customer_driver_quick_replies",
                },
                {
                  column: "notification_status",
                  type: "in",
                  value: ["queued", "read", "dismissed", "archived"],
                },
              ],
              type: "and",
            },
          ],
          type: "or",
        },
        {
          conditions: [
            { column: "driver_job_link_id", type: "is", value: null },
            { column: "driver_job_link_id", type: "eq", value: driverLinkId },
          ],
          type: "or",
        },
      ],
      "Expected one database-filtered Driver notification read after token verification.",
    );

    const pagedOtherDriverLinkId = "22222222-2222-4222-8222-222222222222";
    const pagedDriverNotifications = Array.from({ length: 7 }, (_, index) =>
      seededNotification({
        booking_reference: "BOOK-DRIVER-NOTIFY-PAGED",
        created_at: new Date(Date.UTC(2026, 7, 2, 0, index, 0)).toISOString(),
        delivery_surface: "driver_app",
        driver_job_link_id: driverLinkId,
        id: `notification-driver-paged-${index + 1}`,
        safe_message: `Safe paged Driver update ${index + 1}.`,
        safe_title: `Driver update ${index + 1}`,
      }),
    );
    const irrelevantDriverCandidates = Array.from({ length: 510 }, (_, index) =>
      seededNotification({
        actor_role: "admin",
        booking_reference: "BOOK-DRIVER-NOTIFY-PAGED",
        created_at: new Date(Date.UTC(2026, 8, 2, 0, index, 0)).toISOString(),
        delivery_surface: index % 2 === 0 ? "customer_app" : "driver_app",
        driver_job_link_id: index % 2 === 0 ? driverLinkId : pagedOtherDriverLinkId,
        id: `notification-driver-irrelevant-${index + 1}`,
        notification_status: "queued",
        workflow_area: "admin_customer_job_messages",
      }),
    );
    setEnv(validEnv());
    const driverPagedMock = installMockClient({
      [notificationTable]: [...irrelevantDriverCandidates, ...pagedDriverNotifications],
      driver_job_links: [{
        booking_reference: "BOOK-DRIVER-NOTIFY-PAGED",
        expires_at: validDriverLinkExpiresAt,
        id: driverLinkId,
        link_status: "active",
        revoked_at: null,
        token_hash: tokenHash(driverToken),
      }],
    });
    const driverPagedGet = await responseJson(
      await driverRoute.GET(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications?limit=5&page=1`),
        routeContext(driverToken),
      ),
    );
    assert.equal(driverPagedGet.status, 200);
    assert.deepEqual(
      driverPagedGet.body.notifications.map(({ id }) => id),
      [
        "notification-driver-paged-7",
        "notification-driver-paged-6",
        "notification-driver-paged-5",
        "notification-driver-paged-4",
        "notification-driver-paged-3",
      ],
      "Driver limit=5 must be applied after exact surface/status/current-link eligibility in the database.",
    );
    assert.deepEqual(driverPagedGet.body.pagination, {
      has_next_page: true,
      has_previous_page: false,
      page: 1,
      page_count: 2,
      page_size: 5,
      total_notification_count: 7,
    });
    assert.equal(
      driverPagedMock.client.selectHistory.filter((entry) => entry.table === notificationTable).length,
      1,
    );
    assert.deepEqual(
      driverPagedMock.client.selectHistory.find((entry) => entry.table === notificationTable)?.range,
      { from: 0, to: 4 },
    );

    setEnv(validEnv());
    const statusRaceNotificationId = "notification-driver-status-race";
    const driverStatusRaceMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          actor_role: "system",
          booking_reference: "BOOK-DRIVER-NOTIFY-RACE",
          delivery_surface: "driver_app",
          driver_job_link_id: driverLinkId,
          id: statusRaceNotificationId,
          notification_status: "queued",
        }),
        seededNotification({
          actor_role: "driver",
          booking_reference: "BOOK-DRIVER-NOTIFY-RACE",
          delivery_surface: "customer_app",
          driver_job_link_id: driverLinkId,
          id: statusRaceNotificationId,
          notification_status: "dismissed",
          workflow_area: "customer_driver_quick_replies",
        }),
      ],
      driver_job_links: [{
        booking_reference: "BOOK-DRIVER-NOTIFY-RACE",
        expires_at: validDriverLinkExpiresAt,
        id: driverLinkId,
        link_status: "active",
        revoked_at: null,
        token_hash: tokenHash(driverToken),
      }],
    });
    const driverStatusRaceGet = await responseJson(
      await driverRoute.GET(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications?limit=5&page=1`),
        routeContext(driverToken),
      ),
    );
    assert.equal(driverStatusRaceGet.status, 200);
    assert.deepEqual(
      driverStatusRaceGet.body.notifications.map(({ id }) => id),
      [statusRaceNotificationId],
      "Defensive ID dedupe must prevent a queued-to-dismissed transition artifact from duplicating one notification.",
    );
    assert.equal(
      driverStatusRaceMock.client.selectHistory.filter((entry) => entry.table === notificationTable).length,
      1,
      "A Driver default read must use one notification query, removing the former between-query status race.",
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
          expires_at: validDriverLinkExpiresAt,
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
        {
          conditions: [
            { column: "driver_job_link_id", type: "is", value: null },
            { column: "driver_job_link_id", type: "eq", value: driverLinkId },
          ],
          type: "or",
        },
        { column: "notification_status", type: "eq", value: "queued" },
      ],
      "Expected driver PATCH to update only exact queued notifications scoped to the verified link",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(driverPatch.body)), false);

    setEnv(validEnv());
    const bookingWideDriverPatchMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          driver_job_link_id: null,
          id: "notification-driver-booking-wide",
        }),
      ],
      driver_job_links: [
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          expires_at: validDriverLinkExpiresAt,
          id: driverLinkId,
          link_status: "active",
          revoked_at: null,
          token_hash: tokenHash(driverToken),
        },
      ],
    });
    const bookingWideDriverPatch = await responseJson(
      await driverRoute.PATCH(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications`, {
          body: JSON.stringify({
            notification_id: "notification-driver-booking-wide",
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

    assert.equal(bookingWideDriverPatch.status, 200);
    assert.equal(bookingWideDriverPatch.body.notification.notification_status, "dismissed");
    assert.equal(
      bookingWideDriverPatchMock.client.tables[notificationTable][0].notification_status,
      "dismissed",
      "Booking-wide driver notification rows may still be updated by the verified booking link",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(bookingWideDriverPatch.body)), false);

    setEnv(validEnv());
    const otherDriverLinkId = "22222222-2222-4222-8222-222222222222";
    const mismatchedDriverPatchMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          driver_job_link_id: otherDriverLinkId,
          id: "notification-driver-other-link",
        }),
      ],
      driver_job_links: [
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          expires_at: validDriverLinkExpiresAt,
          id: driverLinkId,
          link_status: "active",
          revoked_at: null,
          token_hash: tokenHash(driverToken),
        },
      ],
    });
    const mismatchedDriverPatch = await responseJson(
      await driverRoute.PATCH(
        new Request(`http://localhost/api/driver-job/${driverToken}/notifications`, {
          body: JSON.stringify({
            notification_id: "notification-driver-other-link",
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

    assert.equal(mismatchedDriverPatch.status, 404);
    assert.equal(
      mismatchedDriverPatchMock.client.tables[notificationTable][0].notification_status,
      "queued",
      "Mismatched driver-link notification rows must not be changed before rejection",
    );
    assert.deepEqual(
      mismatchedDriverPatchMock.client.updateHistory[0].filters,
      [
        { column: "id", type: "eq", value: "notification-driver-other-link" },
        { column: "delivery_surface", type: "eq", value: "driver_app" },
        { column: "booking_reference", type: "eq", value: "BOOK-DRIVER-NOTIFY-001" },
        {
          conditions: [
            { column: "driver_job_link_id", type: "is", value: null },
            { column: "driver_job_link_id", type: "eq", value: driverLinkId },
          ],
          type: "or",
        },
        { column: "notification_status", type: "eq", value: "queued" },
      ],
      "Expected mismatched driver PATCH to include driver job link id before update",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(mismatchedDriverPatch.body)), false);

    setEnv(validEnv());
    const farFutureDriverToken = "safe-driver-notification-far-future-token";
    const farFutureDriverMock = installMockClient({
      [notificationTable]: [
        seededNotification({
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          delivery_surface: "driver_app",
          driver_job_link_id: driverLinkId,
          id: "notification-driver-far-future-hidden",
        }),
      ],
      driver_job_links: [
        {
          booking_reference: "BOOK-DRIVER-NOTIFY-001",
          expires_at: farFutureDriverLinkExpiresAt,
          id: driverLinkId,
          link_status: "active",
          revoked_at: null,
          token_hash: tokenHash(farFutureDriverToken),
        },
      ],
    });
    const farFutureDriverGet = await responseJson(
      await driverRoute.GET(
        new Request(`http://localhost/api/driver-job/${farFutureDriverToken}/notifications`),
        routeContext(farFutureDriverToken),
      ),
    );
    const farFutureDriverPatch = await responseJson(
      await driverRoute.PATCH(
        new Request(`http://localhost/api/driver-job/${farFutureDriverToken}/notifications`, {
          body: JSON.stringify({
            notification_id: "notification-driver-far-future-hidden",
            notification_status: "dismissed",
          }),
          headers: {
            "content-type": "application/json",
          },
          method: "PATCH",
        }),
        routeContext(farFutureDriverToken),
      ),
    );

    assert.equal(farFutureDriverGet.status, 410);
    assert.equal(farFutureDriverPatch.status, 410);
    assert.equal(farFutureDriverGet.body.error, "Driver app notification link has expired.");
    assert.equal(farFutureDriverPatch.body.error, "Driver app notification link has expired.");
    assert.equal(
      farFutureDriverMock.client.selectHistory.filter((entry) => entry.table === notificationTable).length,
      0,
      "Far-future driver notification links must stop before notification rows are read.",
    );
    assert.equal(
      farFutureDriverMock.client.updateHistory.length,
      0,
      "Far-future driver notification links must stop before notification rows are updated.",
    );
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(farFutureDriverGet.body)), false);
    assert.equal(unsafeNotificationLeakPattern.test(JSON.stringify(farFutureDriverPatch.body)), false);

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
      PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
      PRESTIGE_DRIVER_JOB_LINKS_PRODUCTION_ENABLED: "false",
      SUPABASE_SERVICE_ROLE_KEY: undefined,
      SUPABASE_URL: undefined,
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
  delete globalThis.__prestigeCustomerNotificationPrincipalSessions;
}
