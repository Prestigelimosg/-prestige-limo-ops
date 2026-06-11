import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const disabledPersistenceError =
  "Admin booking persistence is not enabled on this server.";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KILL_SWITCH_SENTINEL_DO_NOT_LEAK";
const supabaseUrlSentinel = "https://kill-switch-ready.supabase.co";
const serverSessionToken = "mock-kill-switch-admin-session-token";
const safeResponseLeakPattern =
  /SUPABASE_SERVICE_ROLE_KILL_SWITCH_SENTINEL|mock-kill-switch-admin-session-token|kill-switch-ready\.supabase\.co|PRESTIGE_ADMIN|service_role|server-only|server_only|stack|sql|supabase internals|createClient|secret|key|token/i;
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
      "  const mock = globalThis.__prestigeKillSwitchMock;",
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
    path.join(tempDir, "lib/customer-driver-app-notification-persistence.js"),
    [
      "async function maybePersistCustomerDriverAppNotification() {",
      "  return { data: null, ok: true };",
      "}",
      "module.exports = { maybePersistCustomerDriverAppNotification };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-kill-switch-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
    adminRoute: require(path.join(tempDir, "app/api/admin-bookings/route.js")),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    customerRoute: require(path.join(tempDir, "app/api/customer-booking-requests/route.js")),
    persistence: require(path.join(tempDir, "lib/admin-booking-persistence.js")),
  };
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
    throw new Error(`Kill switch test should never touch mocked Supabase table: ${table}`);
  }
}

function installMockClient() {
  const client = new ExplodingSupabaseClient();

  globalThis.__prestigeKillSwitchMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeKillSwitchMock;
}

function readyEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Kill Switch Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
    ...overrides,
  };
}

function killSwitchEnv(overrides = {}) {
  return readyEnv({
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
    ...overrides,
  });
}

function adminPayload(overrides = {}) {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: "KILL-SWITCH-001",
      contact_display_name: "Kill Switch Contact",
      contact_email: "kill-switch@example.com",
      contact_phone: "+65 9000 2101",
      customer_display_name: "Kill Switch Account",
      customer_facing_status: "pending_review",
      dropoff_location: "Kill Switch Dropoff",
      passenger_name: "Kill Switch Passenger",
      passenger_phone: "+65 9000 2102",
      pickup_at: "2026-06-08T10:30:00+08:00",
      pickup_location: "Kill Switch Pickup",
      route_summary: "Kill Switch Pickup > Kill Switch Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-api",
      ...overrides.booking,
    },
    route_points: [
      {
        location: "Kill Switch Pickup",
        point_type: "pickup",
        sequence: 1,
      },
      {
        location: "Kill Switch Dropoff",
        point_type: "dropoff",
        sequence: 2,
      },
      ...(overrides.route_points || []),
    ],
    service_items: [
      {
        item_type: "extra_stop",
        notes: "Safe kill-switch service item",
        quantity: 1,
      },
      ...(overrides.service_items || []),
    ],
  };
}

function adminUpdatePayload(overrides = {}) {
  return {
    target_booking_reference: "KILL-SWITCH-001",
    ...adminPayload({
      booking: {
        booking_reference: "KILL-SWITCH-001",
        pickup_location: "Kill Switch Updated Pickup",
        route_summary: "Kill Switch Updated Pickup > Kill Switch Dropoff",
        ...overrides.booking,
      },
      route_points: overrides.route_points,
      service_items: overrides.service_items,
    }),
  };
}

function customerPayload(overrides = {}) {
  return {
    companyName: "Kill Switch Customer Company",
    contactNo: "+65 9000 2202",
    dropoffLocation: "Kill Switch Customer Dropoff",
    emailAddress: "kill-switch-customer@example.com",
    extraStops: "",
    flightNumber: "SQ202",
    luggage: "1",
    passengerCount: "2",
    passengerName: "Kill Switch Customer Passenger",
    pickupDate: "2026-06-08",
    pickupLocation: "Kill Switch Customer Pickup",
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

function assertDisabledAdminResponse(result, label) {
  assert.equal(result.status, 503, `${label}: expected disabled persistence status`);
  assert.deepEqual(result.body, {
    error: disabledPersistenceError,
    ok: false,
  });
  assertNoLeaks(result, `${label}: disabled admin response should stay safe`);
}

function assertBlockedAdminBoundary(result, label) {
  assert.equal(result.status, 403, `${label}: expected blocked admin boundary`);
  assert.deepEqual(result.body, {
    error: routeBlockedMessage,
    ok: false,
  });
  assertNoLeaks(result, `${label}: blocked response should stay safe`);
}

function assertReady(readiness, label) {
  assert.equal(readiness.ok, true, `${label}: expected ready config before kill switch`);
  assert.equal(readiness.ready, true, `${label}: expected ready=true before kill switch`);
  assert.equal(readiness.status, 200, `${label}: expected ready status before kill switch`);
}

const harness = await loadHarness();

try {
  const { adapter, adminRoute, customerRoute, persistence } = harness;

  assert.equal(
    adapter.adminBookingSupabaseAdapterVersion,
    "stage-4a-376-server-only-supabase-adapter-v1",
  );
  assert.equal(
    adapter.adminBookingPersistenceStagingReadinessVersion,
    "stage-4a-379-admin-persistence-staging-config-readiness-v1",
  );
  assert.equal(
    persistence.adminBookingPersistenceContractVersion,
    "stage-4a-376-admin-only-safe-operational-adapter-v1",
  );

  for (const role of ["admin", "dispatcher"]) {
    setEnv(readyEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const readyMock = installMockClient();
    const readiness = adapter.checkAdminBookingPersistenceStagingConfigReadiness();

    assertReady(readiness, `${role} staging readiness`);
    assertNoSupabaseTouched(readyMock, `${role} staging readiness`);

    setEnv(killSwitchEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const createMock = installMockClient();
    const createResult = await readResponse(
      await adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", adminPayload(), sessionHeaders()),
      ),
    );

    assertDisabledAdminResponse(createResult, `${role} create after kill switch`);
    assertNoSupabaseTouched(createMock, `${role} create after kill switch`);

    const updateMock = installMockClient();
    const updateResult = await readResponse(
      await adminRoute.PATCH(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          adminUpdatePayload(),
          sessionHeaders(),
          "PATCH",
        ),
      ),
    );

    assertDisabledAdminResponse(updateResult, `${role} update after kill switch`);
    assertNoSupabaseTouched(updateMock, `${role} update after kill switch`);

    const parsed = persistence.parseAdminBookingPersistencePayload(adminPayload());

    assert.equal(parsed.ok, true);

    const directMock = installMockClient();
    const directResult = await persistence.createAdminBooking(
      parsed.data,
      {
        actor_label: `Kill Switch ${role}`,
        actor_role: role,
        boundary_mode: "server-session-role-surface",
        source_surface: "admin_api",
      },
      {
        action: "admin_booking_create",
        actor_label: `Kill Switch ${role}`,
        change_summary: "Kill switch should close direct adapter write path.",
        source_route: "/api/admin-bookings",
      },
    );

    assert.deepEqual(directResult, {
      error: disabledPersistenceError,
      ok: false,
      status: 503,
    });
    assertNoSupabaseTouched(directMock, `${role} direct adapter after kill switch`);
    assertNoLeaks(directResult, `${role} direct adapter disabled response should stay safe`);
  }

  setEnv(killSwitchEnv());

  const customerMock = installMockClient();
  const customerResult = await readResponse(
    await customerRoute.POST(
      requestWithJson(
        "http://localhost/api/customer-booking-requests",
        customerPayload(),
        customerHeaders(),
      ),
    ),
  );

  assert.equal(customerResult.status, 503);
  assert.deepEqual(customerResult.body, {
    error: "Booking request intake is not enabled or configured on this server.",
    ok: false,
  });
  assertNoSupabaseTouched(customerMock, "customer request after kill switch");
  assertNoLeaks(customerResult, "customer disabled response should stay safe");

  for (const [label, envOverrides, headers] of [
    ["anonymous admin request", {}, { "content-type": "application/json" }],
    ["customer referer admin request", {}, sessionHeaders({ referer: "http://localhost/book" })],
    [
      "driver referer admin request",
      {},
      sessionHeaders({ referer: "http://localhost/driver-job/mock-token" }),
    ],
    [
      "public origin admin request",
      {},
      sessionHeaders({ origin: "https://public.example.invalid" }),
    ],
    [
      "local dev admin fallback after kill switch",
      { PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined },
      adminHeaders(),
    ],
  ]) {
    setEnv(killSwitchEnv(envOverrides));

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        requestWithJson("http://localhost/api/admin-bookings", adminPayload(), headers),
      ),
    );

    if (label === "local dev admin fallback after kill switch") {
      assertDisabledAdminResponse(result, label);
    } else {
      assertBlockedAdminBoundary(result, label);
    }
    assertNoSupabaseTouched(mock, label);
  }

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
    setEnv(killSwitchEnv());

    const mock = installMockClient();
    const result = await readResponse(
      await adminRoute.POST(
        requestWithJson(
          "http://localhost/api/admin-bookings",
          adminPayload({
            booking: {
              [unsafeField]: `${unsafeField} should not pass through kill-switch tests`,
            },
          }),
          sessionHeaders(),
        ),
      ),
    );

    assert.equal(result.status, 400, `${unsafeField}: expected parser rejection before kill switch`);
    assert.deepEqual(result.body, {
      error: "Forbidden admin booking fields rejected.",
      ok: false,
    });
    assertNoSupabaseTouched(mock, `${unsafeField} unsafe admin field`);
    assertNoLeaks(result, `${unsafeField} unsafe admin response should stay safe`);
  }

  for (const unsafeField of [
    "driverPayout",
    "customerPrice",
    "paynowPayout",
    "invoicePdfLink",
    "parserDebugInternals",
    "proofPhotoUrl",
    "liveLocationUrl",
  ]) {
    setEnv(killSwitchEnv());

    const mock = installMockClient();
    const result = await readResponse(
      await customerRoute.POST(
        requestWithJson(
          "http://localhost/api/customer-booking-requests",
          customerPayload({
            [unsafeField]: `${unsafeField} should not pass through kill-switch tests`,
          }),
          customerHeaders(),
        ),
      ),
    );

    assert.equal(result.status, 400, `${unsafeField}: expected customer parser rejection before kill switch`);
    assert.deepEqual(result.body, {
      error: "Booking request includes fields outside the approved request scope.",
      ok: false,
    });
    assertNoSupabaseTouched(mock, `${unsafeField} unsafe customer field`);
    assertNoLeaks(result, `${unsafeField} unsafe customer response should stay safe`);
  }

  setEnv(killSwitchEnv());

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
    error: "Booking requests can be submitted only from the customer booking form.",
    ok: false,
  });
  assertNoSupabaseTouched(customerBoundaryMock, "customer missing browser boundary");
  assertNoLeaks(customerBoundaryResult, "customer missing boundary response should stay safe");
} finally {
  restoreEnv();
  delete globalThis.__prestigeKillSwitchMock;
  await harness.cleanup();
}

console.log("Admin booking persistence kill-switch tests passed.");
