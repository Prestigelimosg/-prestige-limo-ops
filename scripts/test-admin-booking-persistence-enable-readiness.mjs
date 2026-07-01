import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const enableReadinessError =
  "Admin booking persistence enablement readiness gates are not ready.";
const disabledPersistenceError =
  "Admin booking persistence is not enabled on this server.";
const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const customerBlockedMessage =
  "Booking requests can be submitted only from the customer booking form.";
const serviceRoleSentinel =
  "SUPABASE_SERVICE_ROLE_ENABLE_READINESS_SENTINEL_DO_NOT_LEAK";
const supabaseUrlSentinel = "https://enable-readiness.supabase.co";
const serverSessionToken = "mock-enable-readiness-admin-session-token";
const safeResponseLeakPattern =
  /SUPABASE_SERVICE_ROLE_ENABLE_READINESS_SENTINEL|mock-enable-readiness-admin-session-token|enable-readiness\.supabase\.co|PRESTIGE_ADMIN|service_role|server-only|server_only|stack|sql|supabase internals|createClient|secret|key|token/i;
const unsafeResponseLeakPattern =
  /customer_price|quoted_price|rate_amount|driver_payout|paynow|invoice|payment|pdf|billing|finance|parser_debug|raw_ai|parser_prompt|live_location|proof|photo|notification|mock_archive|mock_qa|dev_workbench|service_role|server_only|secret/i;
const sourceFiles = [
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-bookings/route.ts",
  "app/api/customer-booking-requests/route.ts",
];
const originalEnv = {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
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

async function writeMockModules(tempDir, options = {}) {
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await writeFile(
    serverOnlyPath,
    options.blockServerOnly ? "throw new Error('CLIENT_IMPORT_BLOCKED');" : "",
  );
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeEnableReadinessMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('UNEXPECTED_CREATE_CLIENT_WITHOUT_MOCK');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
  await mkdir(path.join(tempDir, "lib"), { recursive: true });
  await writeFile(
    path.join(tempDir, "lib/admin-app-notification-persistence.js"),
    [
      "async function createCustomerBookingRequestAdminAppNotification() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { createCustomerBookingRequestAdminAppNotification };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-device-push-notification.js"),
    [
      "async function sendAdminNewBookingDevicePushAlert() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { sendAdminNewBookingDevicePushAlert };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/admin-new-booking-email-alert.js"),
    [
      "async function sendAdminNewBookingEmailAlert() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { sendAdminNewBookingEmailAlert };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/customer-driver-app-notification-persistence.js"),
    [
      "async function createCustomerDriverAppNotification() {",
      "  return { data: null, ok: true };",
      "}",
      "async function maybePersistCustomerDriverAppNotification() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { createCustomerDriverAppNotification, maybePersistCustomerDriverAppNotification };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-enable-readiness-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
    adminRoute: require(path.join(tempDir, "app/api/admin-bookings/route.js")),
    authBoundary: require(path.join(tempDir, "lib/admin-dispatcher-auth-boundary.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerRoute: require(path.join(tempDir, "app/api/customer-booking-requests/route.js")),
    persistence: require(path.join(tempDir, "lib/admin-booking-persistence.js")),
  };
}

async function assertBrowserImportBlocked() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-enable-browser-"));

  try {
    await writeMockModules(tempDir, { blockServerOnly: true });
    await writeHarnessFile(tempDir, "lib/admin-booking-supabase-adapter.ts");

    const require = createRequire(import.meta.url);

    assert.throws(
      () => require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
      /CLIENT_IMPORT_BLOCKED/,
      "Client-style adapter import should be blocked before enablement readiness is reachable",
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

class ExplodingSupabaseClient {
  constructor() {
    this.operations = [];
  }

  from(table) {
    this.operations.push({
      action: "from",
      table,
    });
    throw new Error(`Enable readiness tests should never touch mocked Supabase table: ${table}`);
  }
}

function installMockClient() {
  const client = new ExplodingSupabaseClient();

  globalThis.__prestigeEnableReadinessMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeEnableReadinessMock;
}

function blankEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
    ...overrides,
  };
}

function fullReadyEnv(overrides = {}) {
  return blankEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Enable Readiness Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  });
}

function killSwitchClosedEnv(overrides = {}) {
  return fullReadyEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
    ...overrides,
  });
}

function adminPayload(overrides = {}) {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: "ENABLE-READY-001",
      contact_display_name: "Enable Readiness Contact",
      contact_email: "enable-readiness@example.com",
      contact_phone: "+65 9000 3101",
      customer_display_name: "Enable Readiness Account",
      customer_facing_status: "pending_review",
      dropoff_location: "Enable Readiness Dropoff",
      passenger_name: "Enable Readiness Passenger",
      passenger_phone: "+65 9000 3102",
      pickup_at: "2026-06-08T10:30:00+08:00",
      pickup_location: "Enable Readiness Pickup",
      route_summary: "Enable Readiness Pickup > Enable Readiness Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-api",
      ...overrides.booking,
    },
    route_points: [
      {
        location: "Enable Readiness Pickup",
        point_type: "pickup",
        sequence: 1,
      },
      {
        location: "Enable Readiness Dropoff",
        point_type: "dropoff",
        sequence: 2,
      },
      ...(overrides.route_points || []),
    ],
    service_items: [
      {
        item_type: "extra_stop",
        notes: "Safe enable-readiness service item",
        quantity: 1,
      },
      ...(overrides.service_items || []),
    ],
  };
}

function customerPayload(overrides = {}) {
  return {
    companyName: "Enable Readiness Customer Company",
    contactNo: "+65 9000 3202",
    dropoffLocation: "Enable Readiness Customer Dropoff",
    emailAddress: "enable-readiness-customer@example.com",
    extraStops: "",
    flightNumber: "SQ202",
    luggage: "1",
    passengerCount: "2",
    passengerName: "Enable Readiness Customer Passenger",
    pickupDate: "2026-06-08",
    pickupLocation: "Enable Readiness Customer Pickup",
    pickupTime: "10:30",
    serviceType: "Airport Arrival",
    vehicleType: "Alphard / Vellfire",
    ...overrides,
  };
}

function adminHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
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

function customerHeaders(overrides = {}) {
  return {
    "content-type": "application/json",
    origin: "http://localhost",
    referer: "http://localhost/book",
    "x-prestige-customer-purpose": "customer-booking-request",
    ...overrides,
  };
}

function requestWithJson(url, body, headers, method = "POST") {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method,
  });
}

function requestWithoutBody(url, headers, method = "GET") {
  return new Request(url, {
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

function assertNoLeaks(value, label) {
  const text = JSON.stringify(value);

  assert.doesNotMatch(text, safeResponseLeakPattern, label);
  assert.doesNotMatch(text, unsafeResponseLeakPattern, label);
}

function assertNoSupabaseTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client creation`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked DB operation`);
}

function assertSafeSideEffects(result, label) {
  assert.deepEqual(
    result.sideEffects,
    {
      databaseClient: "not_created",
      databaseReads: "not_opened",
      databaseWrites: "not_opened",
    },
    `${label}: readiness should advertise no database side effects`,
  );
}

function assertNotReady(result, expectedBlocked, label) {
  assert.equal(result.ok, false, `${label}: expected not ready`);
  assert.equal(result.readyToEnable, false, `${label}: expected readyToEnable=false`);
  assert.equal(result.status, 503, `${label}: expected 503 readiness status`);
  assert.equal(result.error, enableReadinessError, `${label}: expected safe readiness error`);

  for (const requirement of expectedBlocked) {
    assert.equal(
      result.requirements[requirement],
      "blocked",
      `${label}: expected ${requirement} to be blocked`,
    );
    assert.ok(result.blocked.includes(requirement), `${label}: blocked list should include ${requirement}`);
  }

  assertSafeSideEffects(result, label);
  assertNoLeaks(result, `${label}: readiness failure should stay safe`);
}

function assertReady(result, label) {
  assert.equal(result.ok, true, `${label}: expected ready`);
  assert.equal(result.readyToEnable, true, `${label}: expected readyToEnable=true`);
  assert.equal(result.status, 200, `${label}: expected ready status`);
  assert.deepEqual(result.requirements, {
    admin_dispatcher_session: "ready",
    feature_flag: "ready",
    kill_switch: "ready",
    safe_payload: "ready",
    staging_config: "ready",
  });
  assertSafeSideEffects(result, label);
  assertNoLeaks(result, `${label}: ready response should stay safe`);
}

function assertBlockedAdminBoundary(result, label) {
  assert.equal(result.status, 403, `${label}: expected blocked admin boundary`);
  assert.deepEqual(result.body, {
    error: routeBlockedMessage,
    ok: false,
  });
  assertNoLeaks(result, `${label}: blocked response should stay safe`);
}

function assertDisabledAdminResponse(result, label) {
  assert.equal(result.status, 503, `${label}: expected disabled persistence status`);
  assert.deepEqual(result.body, {
    error: disabledPersistenceError,
    ok: false,
  });
  assertNoLeaks(result, `${label}: disabled response should stay safe`);
}

function actorFromAdminRequest(authBoundary, adapter, request) {
  const boundary = authBoundary.resolveAdminDispatcherBoundary(
    request,
    authBoundary.adminBookingPersistencePurpose,
  );

  return boundary.ok ? adapter.adminDispatcherBoundaryToPersistenceAdapterActor(boundary.context) : null;
}

function safeAdminPayloadResult(persistence) {
  const parsed = persistence.parseAdminBookingPersistencePayload(adminPayload());

  assert.equal(parsed.ok, true, "Safe admin payload should parse before readiness checks");

  return parsed;
}

await assertBrowserImportBlocked();

const harness = await loadHarness();

try {
  const { adapter, adminRoute, authBoundary, customerRoute, persistence } = harness;

  assert.equal(
    adapter.adminBookingSupabaseAdapterVersion,
    "stage-4a-376-server-only-supabase-adapter-v1",
  );
  assert.equal(
    adapter.adminBookingPersistenceStagingReadinessVersion,
    "stage-4a-379-admin-persistence-staging-config-readiness-v1",
  );
  assert.equal(
    adapter.adminBookingPersistenceEnableReadinessVersion,
    "stage-4a-381-controlled-persistence-enable-readiness-v1",
  );
  assert.equal(
    persistence.adminBookingPersistenceContractVersion,
    "stage-4a-376-admin-only-safe-operational-adapter-v1",
  );

  setEnv(blankEnv({ PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true" }));

  const featureFlagOnlyMock = installMockClient();
  const featureFlagOnly = adapter.checkAdminBookingPersistenceEnableReadiness(null, null);

  assertNotReady(
    featureFlagOnly,
    ["staging_config", "admin_dispatcher_session", "safe_payload"],
    "feature flag alone",
  );
  assert.equal(featureFlagOnly.requirements.feature_flag, "ready");
  assert.equal(featureFlagOnly.requirements.kill_switch, "ready");
  assertNoSupabaseTouched(featureFlagOnlyMock, "feature flag alone");

  setEnv(fullReadyEnv());

  const stagingOnlyMock = installMockClient();
  const stagingOnly = adapter.checkAdminBookingPersistenceEnableReadiness(null, null);

  assertNotReady(
    stagingOnly,
    ["admin_dispatcher_session", "safe_payload"],
    "ready staging config alone",
  );
  assert.equal(stagingOnly.requirements.feature_flag, "ready");
  assert.equal(stagingOnly.requirements.staging_config, "ready");
  assertNoSupabaseTouched(stagingOnlyMock, "ready staging config alone");

  for (const role of ["admin", "dispatcher"]) {
    setEnv(
      blankEnv({
        PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: `Session Only ${role}`,
        PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
        PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role,
        PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
      }),
    );

    const sessionOnlyActor = actorFromAdminRequest(
      authBoundary,
      adapter,
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    );

    assert.ok(sessionOnlyActor, `${role} server session should resolve before readiness blocks`);

    const sessionOnlyMock = installMockClient();
    const sessionOnly = adapter.checkAdminBookingPersistenceEnableReadiness(null, sessionOnlyActor);

    assertNotReady(
      sessionOnly,
      ["feature_flag", "staging_config", "safe_payload", "kill_switch"],
      `valid ${role} session alone`,
    );
    assert.equal(sessionOnly.requirements.admin_dispatcher_session, "ready");
    assertNoSupabaseTouched(sessionOnlyMock, `valid ${role} session alone`);

    const sessionOnlyWriteMock = installMockClient();
    const sessionOnlyWrite = await readResponse(
      await adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
      ),
    );

    assertDisabledAdminResponse(sessionOnlyWrite, `valid ${role} session without enabled persistence`);
    assertNoSupabaseTouched(sessionOnlyWriteMock, `valid ${role} session without enabled persistence`);
  }

  setEnv(fullReadyEnv());

  const dashboardReadActor = actorFromAdminRequest(
    authBoundary,
    adapter,
    requestWithoutBody("http://localhost/api/admin-bookings", adminHeaders(), "GET"),
  );

  assert.ok(
    dashboardReadActor,
    "same-origin admin dashboard GET should resolve without exposing the server session token",
  );
  assert.equal(
    dashboardReadActor.boundary_mode,
    "server-session-role-surface",
    "dashboard GET should still use the verified server-session role surface",
  );
  assert.equal(dashboardReadActor.actor_role, "admin", "dashboard GET should use the configured admin role");
  assert.equal(dashboardReadActor.source_surface, "admin_api", "dashboard GET should stay admin API scoped");

  const dashboardWriteActor = actorFromAdminRequest(
    authBoundary,
    adapter,
    requestWithJson("http://localhost/api/admin-bookings", adminPayload(), adminHeaders(), "POST"),
  );

  assert.equal(
    dashboardWriteActor,
    null,
    "same-origin admin dashboard POST must still require the private server session token",
  );

  const customerRefererReadActor = actorFromAdminRequest(
    authBoundary,
    adapter,
    requestWithoutBody(
      "http://localhost/api/admin-bookings",
      adminHeaders({ referer: "http://localhost/book" }),
      "GET",
    ),
  );

  assert.equal(
    customerRefererReadActor,
    null,
    "customer referer must not unlock admin dashboard GET reads",
  );

  const publicOriginReadActor = actorFromAdminRequest(
    authBoundary,
    adapter,
    requestWithoutBody(
      "http://localhost/api/admin-bookings",
      adminHeaders({ origin: "https://public.example.invalid" }),
      "GET",
    ),
  );

  assert.equal(
    publicOriginReadActor,
    null,
    "public origin must not unlock admin dashboard GET reads",
  );

  setEnv(fullReadyEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined }));

  const missingServerTokenReadActor = actorFromAdminRequest(
    authBoundary,
    adapter,
    requestWithoutBody("http://localhost/api/admin-bookings", adminHeaders(), "GET"),
  );

  assert.equal(
    missingServerTokenReadActor,
    null,
    "dashboard GET must still require the server-side session token to be configured",
  );

  setEnv(blankEnv());

  const payloadOnlyParsed = safeAdminPayloadResult(persistence);
  const payloadOnlyMock = installMockClient();
  const payloadOnly = adapter.checkAdminBookingPersistenceEnableReadiness(payloadOnlyParsed, null);

  assertNotReady(
    payloadOnly,
    ["feature_flag", "staging_config", "admin_dispatcher_session", "kill_switch"],
    "safe payload alone",
  );
  assert.equal(payloadOnly.requirements.safe_payload, "ready");
  assertNoSupabaseTouched(payloadOnlyMock, "safe payload alone");

  const payloadOnlyRouteMock = installMockClient();
  const payloadOnlyRoute = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), {
        "content-type": "application/json",
      }),
    ),
  );

  assertBlockedAdminBoundary(payloadOnlyRoute, "safe payload without admin boundary");
  assertNoSupabaseTouched(payloadOnlyRouteMock, "safe payload without admin boundary");

  setEnv(killSwitchClosedEnv());

  const killClosedActor = actorFromAdminRequest(
    authBoundary,
    adapter,
    requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
  );
  const killClosedParsed = safeAdminPayloadResult(persistence);
  const killClosedMock = installMockClient();
  const killClosed = adapter.checkAdminBookingPersistenceEnableReadiness(
    killClosedParsed,
    killClosedActor,
  );

  assertNotReady(
    killClosed,
    ["feature_flag", "staging_config", "kill_switch"],
    "kill-switch closed with every other gate ready",
  );
  assert.equal(killClosed.requirements.admin_dispatcher_session, "ready");
  assert.equal(killClosed.requirements.safe_payload, "ready");
  assertNoSupabaseTouched(killClosedMock, "kill-switch closed readiness");

  const killClosedWriteMock = installMockClient();
  const killClosedWrite = await readResponse(
    await adminRoute.POST(
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    ),
  );

  assertDisabledAdminResponse(killClosedWrite, "kill-switch closed write attempt");
  assertNoSupabaseTouched(killClosedWriteMock, "kill-switch closed write attempt");

  for (const role of ["admin", "dispatcher"]) {
    setEnv(fullReadyEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const actor = actorFromAdminRequest(
      authBoundary,
      adapter,
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    );
    const parsed = safeAdminPayloadResult(persistence);
    const mock = installMockClient();
    const readiness = adapter.checkAdminBookingPersistenceEnableReadiness(parsed, actor);

    assertReady(readiness, `${role} full mocked enablement readiness`);
    assertNoSupabaseTouched(mock, `${role} full mocked enablement readiness`);
  }

  setEnv(fullReadyEnv());

  for (const [label, request, parsedPayload] of [
    [
      "anonymous admin path",
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), {
        "content-type": "application/json",
      }),
      safeAdminPayloadResult(persistence),
    ],
    [
      "customer referer admin path",
      requestWithJson(
        "http://localhost/api/admin-bookings",
        adminPayload(),
        sessionHeaders({ referer: "http://localhost/book" }),
      ),
      safeAdminPayloadResult(persistence),
    ],
    [
      "driver referer admin path",
      requestWithJson(
        "http://localhost/api/admin-bookings",
        adminPayload(),
        sessionHeaders({ referer: "http://localhost/driver-job/mock-token" }),
      ),
      safeAdminPayloadResult(persistence),
    ],
    [
      "public origin admin path",
      requestWithJson(
        "http://localhost/api/admin-bookings",
        adminPayload(),
        sessionHeaders({ origin: "https://public.example.invalid" }),
      ),
      safeAdminPayloadResult(persistence),
    ],
  ]) {
    const mock = installMockClient();
    const actor = actorFromAdminRequest(authBoundary, adapter, request);
    const readiness = adapter.checkAdminBookingPersistenceEnableReadiness(parsedPayload, actor);

    assert.equal(actor, null, `${label}: route boundary should not produce an admin actor`);
    assertNotReady(readiness, ["admin_dispatcher_session"], label);
    assertNoSupabaseTouched(mock, label);
  }

  const customerParsed = persistence.parseCustomerBookingRequestPayload(customerPayload());

  assert.equal(customerParsed.ok, true, "Safe customer payload should parse before readiness blocks it");

  const customerPathMock = installMockClient();
  const customerPath = adapter.checkAdminBookingPersistenceEnableReadiness(
    customerParsed,
    adapter.customerBookingRequestPersistenceAdapterActor,
  );

  assertNotReady(customerPath, ["admin_dispatcher_session"], "customer booking request path");
  assert.equal(customerPath.requirements.safe_payload, "ready");
  assertNoSupabaseTouched(customerPathMock, "customer booking request path");

  const customerRouteMock = installMockClient();
  const customerRouteResult = await readResponse(
    await customerRoute.POST(
      requestWithJson(
        "http://localhost/api/customer-booking-requests",
        customerPayload(),
        customerHeaders(),
      ),
    ),
  );

  assert.equal(customerRouteResult.status, 500);
  assert.deepEqual(customerRouteResult.body, {
    error: "Booking request failed safely.",
    ok: false,
  });
  assertNoLeaks(customerRouteResult, "customer route under admin-only enablement should stay safe");
  assert.equal(
    customerRouteMock.createdClients.length,
    1,
    "customer route should reach the mocked DB only after the exact /book boundary and customer actor pass",
  );
  assert.deepEqual(customerRouteMock.client.operations, [
    {
      action: "from",
      table: "customers",
    },
  ]);

  const customerBoundaryMock = installMockClient();
  const customerBoundaryResult = await readResponse(
    await customerRoute.POST(
      requestWithJson(
        "http://localhost/api/customer-booking-requests",
        customerPayload(),
        {
          "content-type": "application/json",
          "x-prestige-customer-purpose": "customer-booking-request",
        },
      ),
    ),
  );

  assert.equal(customerBoundaryResult.status, 403);
  assert.deepEqual(customerBoundaryResult.body, {
    error: customerBlockedMessage,
    ok: false,
  });
  assertNoLeaks(customerBoundaryResult, "customer missing browser boundary should stay safe");
  assertNoSupabaseTouched(customerBoundaryMock, "customer missing browser boundary");

  for (const unsafeField of [
    "customer_price",
    "quoted_price",
    "driver_payout",
    "paynow_payout",
    "invoice_payment_pdf_link",
    "internal_finance_notes",
    "parser_debug_internals",
    "raw_ai_parser_prompt_text",
    "live_location_url",
    "proof_photo_url",
    "notification_send_records",
    "mock_archive_content",
    "dev_workbench_content",
  ]) {
    setEnv(fullReadyEnv());

    const actor = actorFromAdminRequest(
      authBoundary,
      adapter,
      requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
    );
    const unsafeParsed = persistence.parseAdminBookingPersistencePayload(
      adminPayload({
        booking: {
          [unsafeField]: `${unsafeField} should not reach enablement readiness`,
        },
      }),
    );
    const mock = installMockClient();
    const readiness = adapter.checkAdminBookingPersistenceEnableReadiness(unsafeParsed, actor);

    assert.equal(unsafeParsed.ok, false, `${unsafeField}: unsafe field should fail parsing`);
    assertNotReady(readiness, ["safe_payload"], `${unsafeField} unsafe admin readiness`);
    assert.equal(readiness.requirements.admin_dispatcher_session, "ready");
    assert.equal(readiness.requirements.feature_flag, "ready");
    assert.equal(readiness.requirements.staging_config, "ready");
    assertNoSupabaseTouched(mock, `${unsafeField} unsafe admin readiness`);

    const routeMock = installMockClient();
    const routeResult = await readResponse(
      await adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          adminPayload({
            booking: {
              [unsafeField]: `${unsafeField} should not pass through readiness tests`,
            },
          }),
          sessionHeaders(),
        ),
      ),
    );

    assert.equal(routeResult.status, 400, `${unsafeField}: expected parser rejection before writes`);
    assert.deepEqual(routeResult.body, {
      error: "Forbidden admin booking fields rejected.",
      ok: false,
    });
    assertNoLeaks(routeResult, `${unsafeField} route failure should stay safe`);
    assertNoSupabaseTouched(routeMock, `${unsafeField} unsafe admin route`);
  }
} finally {
  restoreEnv();
  delete globalThis.__prestigeEnableReadinessMock;
  await harness.cleanup();
}

console.log("Admin booking persistence enable-readiness tests passed.");
