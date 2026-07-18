import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const readinessNotReadyError =
  "Admin booking persistence staging configuration is not ready.";
const validServerUrl = "https://stage-readiness.supabase.co";
const validServerCredential = "sb_secret_stage_readiness_server_credential_1234567890";
const validAdminAccessCheck = "stage-readiness-admin-access-check-1234567890";
const safeLeakPattern =
  /SUPABASE|NEXT_PUBLIC|PRESTIGE_ADMIN|stage-readiness\.supabase\.co|stage-readiness-server-credential|stage-readiness-admin-access|service_role|server-only|server_only|stack|sql|supabase internals|createClient|secret|key|token/i;
const sourceFiles = [
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-booking-persistence.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-bookings/route.ts",
  "app/api/customer-booking-requests/route.ts",
];
const implementationLedgerPath = "docs/current-implementation-ledger.md";
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
      "function createClient(url, serverCredential, options) {",
      "  const mock = globalThis.__prestigeStagingConfigMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('UNEXPECTED_CREATE_CLIENT');",
      "  }",
      "  mock.createdClients.push({ options, serverCredential, url });",
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
    path.join(tempDir, "lib/codex-job-card-auto-preparation.js"),
    [
      "async function prepareCodexJobCardForAdminReview() {}",
      "module.exports = { prepareCodexJobCardForAdminReview };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/customer-booking-receipt-email.js"),
    [
      "async function sendCustomerBookingReceiptEmail() {",
      "  return { ok: false, reason: 'gate_closed', status: 'blocked' };",
      "}",
      "module.exports = { sendCustomerBookingReceiptEmail };",
    ].join("\n"),
  );
  await writeFile(
    path.join(tempDir, "lib/customer-portal-access-link.js"),
    [
      "function createCustomerPortalAccessLinkToken() {",
      "  return { error: 'Customer portal access is unavailable.', ok: false, status: 403 };",
      "}",
      "module.exports = { createCustomerPortalAccessLinkToken };",
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
  await writeFile(
    path.join(tempDir, "lib/customer-saved-bookings-read.js"),
    [
      "function resolveCustomerSavedBookingsBoundaryForPurpose() {",
      "  return { error: 'Customer portal authentication is required.', ok: false, status: 401 };",
      "}",
      "async function resolveCustomerSavedBookingsVerifiedIdentity() {",
      "  return { error: 'Customer portal authentication is required.', ok: false, status: 401 };",
      "}",
      "module.exports = { resolveCustomerSavedBookingsBoundaryForPurpose, resolveCustomerSavedBookingsVerifiedIdentity };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-staging-config-"));

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

async function assertBrowserImportBlocked() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-staging-config-browser-"));

  try {
    await writeMockModules(tempDir, { blockServerOnly: true });
    await writeHarnessFile(tempDir, "lib/admin-booking-supabase-adapter.ts");

    const require = createRequire(import.meta.url);

    assert.throws(
      () => require(path.join(tempDir, "lib/admin-booking-supabase-adapter.js")),
      /CLIENT_IMPORT_BLOCKED/,
      "Browser/client-style import should be blocked before readiness details are reachable",
    );
  } finally {
    await rm(tempDir, { force: true, recursive: true });
  }
}

class MockSupabaseClient {
  constructor() {
    this.operations = [];
  }

  from(table) {
    this.operations.push({ action: "from", table });
    throw new Error(`Unexpected mocked DB access: ${table}`);
  }
}

function installMockClient() {
  const client = new MockSupabaseClient();

  globalThis.__prestigeStagingConfigMock = {
    client,
    createdClients: [],
  };

  return globalThis.__prestigeStagingConfigMock;
}

function validStagingEnv(overrides = {}) {
  return {
    NEXT_PUBLIC_SUPABASE_URL: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Stage Readiness Admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: validAdminAccessCheck,
    SUPABASE_SERVICE_ROLE_KEY: validServerCredential,
    SUPABASE_URL: validServerUrl,
    ...overrides,
  };
}

function adminPayload() {
  return {
    booking: {
      admin_internal_status: "needs_review",
      booking_reference: "STAGE-READY-001",
      contact_display_name: "Stage Safe Contact",
      contact_email: "stage-safe@example.com",
      contact_phone: "+65 9000 1101",
      customer_display_name: "Stage Safe Account",
      customer_facing_status: "pending_review",
      dropoff_location: "Stage Safe Dropoff",
      passenger_name: "Stage Passenger",
      passenger_phone: "+65 9000 1102",
      pickup_at: "2026-06-08T10:30:00+08:00",
      pickup_location: "Stage Safe Pickup",
      route_summary: "Stage Safe Pickup > Stage Safe Dropoff",
      service_type: "MNG",
      short_notice_review_status: "not_required",
      source_surface: "admin-api",
    },
    route_points: [
      {
        location: "Stage Safe Pickup",
        point_type: "pickup",
        sequence: 1,
      },
      {
        location: "Stage Safe Dropoff",
        point_type: "dropoff",
        sequence: 2,
      },
    ],
    service_items: [
      {
        item_type: "extra_stop",
        notes: "Safe staging readiness service item",
        quantity: 1,
      },
    ],
  };
}

function customerPayload() {
  return {
    companyName: "Stage Customer Company",
    contactNo: "+65 9000 1202",
    dropoffLocation: "Stage Customer Dropoff",
    emailAddress: "stage-customer@example.com",
    extraStops: "",
    flightNumber: "SQ202",
    luggage: "1",
    passengerCount: "2",
    passengerName: "Stage Customer Passenger",
    pickupDate: "2026-06-08",
    pickupLocation: "Stage Customer Pickup",
    pickupTime: "10:30",
    serviceType: "Airport Arrival",
    vehicleType: "Alphard / Vellfire",
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
    "x-prestige-admin-session-token": validAdminAccessCheck,
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

function postJson(url, body, headers) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "POST",
  });
}

async function readResponse(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoLeaks(value, label) {
  assert.doesNotMatch(JSON.stringify(value), safeLeakPattern, label);
}

function assertNoPersistenceTouched(mock, label) {
  assert.equal(mock.createdClients.length, 0, `${label}: expected no Supabase client creation`);
  assert.equal(mock.client.operations.length, 0, `${label}: expected no mocked DB operation`);
}

function assertSideEffects(result) {
  assert.deepEqual(result.sideEffects, {
    adminDispatcherGate: "still_required",
    databaseClient: "not_created",
    databaseWrites: "not_opened",
  });
}

function assertRequirementFailures(result, expectedMissing, expectedInvalid, label) {
  assert.equal(result.ok, false, `${label}: expected not-ready result`);
  assert.equal(result.ready, false, `${label}: expected ready=false`);
  assert.equal(result.status, 503, `${label}: expected safe not-ready status`);
  assert.equal(result.error, readinessNotReadyError);
  assert.deepEqual([...result.missing].sort(), [...expectedMissing].sort());
  assert.deepEqual([...result.invalid].sort(), [...expectedInvalid].sort());
  assertSideEffects(result);
  assertNoLeaks(result, `${label}: readiness result should not leak private configuration`);
}

function assertAllRequirementsReady(result) {
  assert.deepEqual(result.requirements, {
    admin_access_check: "ready",
    admin_mode: "ready",
    admin_role: "ready",
    database_url: "ready",
    server_credential: "ready",
    write_gate: "ready",
  });
}

const harness = await loadHarness();

try {
  const { adapter, adminRoute, customerRoute, persistence } = harness;

  await assertBrowserImportBlocked();
  assert.equal(
    adapter.adminBookingPersistenceStagingReadinessVersion,
    "stage-4a-379-admin-persistence-staging-config-readiness-v1",
  );

  for (const [label, overrides, expectedMissing, expectedInvalid] of [
    [
      "missing persistence feature flag",
      { PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined },
      ["write_gate"],
      [],
    ],
    [
      "false persistence feature flag",
      { PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false" },
      [],
      ["write_gate"],
    ],
    ["missing server database url", { SUPABASE_URL: undefined }, ["database_url"], []],
    [
      "browser-style public url only",
      { NEXT_PUBLIC_SUPABASE_URL: validServerUrl, SUPABASE_URL: undefined },
      ["database_url"],
      [],
    ],
    ["missing server credential", { SUPABASE_SERVICE_ROLE_KEY: undefined }, ["server_credential"], []],
    [
      "missing admin auth mode",
      { PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined },
      ["admin_mode"],
      [],
    ],
    [
      "missing admin access check",
      { PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined },
      ["admin_access_check"],
      [],
    ],
    [
      "missing admin role",
      { PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined },
      ["admin_role"],
      [],
    ],
  ]) {
    setEnv(validStagingEnv(overrides));

    const mock = installMockClient();
    const result = adapter.checkAdminBookingPersistenceStagingConfigReadiness();

    assertRequirementFailures(result, expectedMissing, expectedInvalid, label);
    assertNoPersistenceTouched(mock, label);
  }

  for (const [label, overrides, expectedInvalid] of [
    [
      "uppercase feature flag",
      { PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "TRUE" },
      ["write_gate"],
    ],
    ["http database url", { SUPABASE_URL: "http://stage-readiness.supabase.co" }, ["database_url"]],
    ["example database url", { SUPABASE_URL: "https://example.supabase.co" }, ["database_url"]],
    ["malformed database url", { SUPABASE_URL: "not-a-url" }, ["database_url"]],
    [
      "placeholder server credential",
      { SUPABASE_SERVICE_ROLE_KEY: "your-service-role-key" },
      ["server_credential"],
    ],
    ["short server credential", { SUPABASE_SERVICE_ROLE_KEY: "short" }, ["server_credential"]],
    [
      "local admin auth mode",
      { PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "local-dev" },
      ["admin_mode"],
    ],
    [
      "placeholder admin access check",
      { PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "change-me" },
      ["admin_access_check"],
    ],
    [
      "customer admin role",
      { PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "customer" },
      ["admin_role"],
    ],
  ]) {
    setEnv(validStagingEnv(overrides));

    const mock = installMockClient();
    const result = adapter.checkAdminBookingPersistenceStagingConfigReadiness();

    assertRequirementFailures(result, [], expectedInvalid, label);
    assertNoPersistenceTouched(mock, label);
  }

  for (const role of ["admin", "dispatcher"]) {
    setEnv(validStagingEnv({ PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: role }));

    const mock = installMockClient();
    const result = adapter.checkAdminBookingPersistenceStagingConfigReadiness();

    assert.equal(result.ok, true, `${role}: expected ready config`);
    assert.equal(result.ready, true, `${role}: expected ready=true`);
    assert.equal(result.status, 200, `${role}: expected ready status`);
    assert.equal(result.environment, "server");
    assertAllRequirementsReady(result);
    assertSideEffects(result);
    assertNoLeaks(result, `${role}: ready result should not leak private configuration`);
    assertNoPersistenceTouched(mock, `${role}: readiness check`);
  }

  for (const [label, routeCall, expectedBody] of [
    [
      "wrong-token admin request",
      () =>
        adminRoute.POST(
          postJson(
            "http://localhost/api/admin-bookings",
            adminPayload(),
            adminHeaders({ "x-prestige-admin-session-token": "wrong-admin-session-token" }),
          ),
        ),
      {
        error: routeBlockedMessage,
        ok: false,
      },
    ],
    [
      "customer referer admin request",
      () =>
        adminRoute.POST(
          postJson(
            "http://localhost/api/admin-bookings",
            adminPayload(),
            sessionHeaders({ referer: "http://localhost/book" }),
          ),
        ),
      {
        error: routeBlockedMessage,
        ok: false,
      },
    ],
    [
      "driver referer admin request",
      () =>
        adminRoute.POST(
          postJson(
            "http://localhost/api/admin-bookings",
            adminPayload(),
            sessionHeaders({ referer: "http://localhost/driver-job/mock-token" }),
          ),
        ),
      {
        error: routeBlockedMessage,
        ok: false,
      },
    ],
    [
      "public origin admin request",
      () =>
        adminRoute.POST(
          postJson(
            "http://localhost/api/admin-bookings",
            adminPayload(),
            sessionHeaders({ origin: "https://public.example.invalid" }),
          ),
        ),
      {
        error: routeBlockedMessage,
        ok: false,
      },
    ],
  ]) {
    setEnv(validStagingEnv());

    const mock = installMockClient();
    const readiness = adapter.checkAdminBookingPersistenceStagingConfigReadiness();
    const result = await readResponse(await routeCall());

    assert.equal(readiness.ok, true, `${label}: expected valid mocked readiness first`);
    assert.equal(result.status, 403, `${label}: expected readiness not to bypass route gate`);
    assert.deepEqual(result.body, expectedBody);
    assertNoPersistenceTouched(mock, label);
    assertNoLeaks(result, `${label}: blocked response should stay safe`);
  }

  setEnv(
    validStagingEnv({
      PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
      PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: undefined,
      PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: undefined,
    }),
  );

  const customerRequestMock = installMockClient();
  const adminReadinessWithMissingAdminEnv = adapter.checkAdminBookingPersistenceStagingConfigReadiness();
  const customerRequestReadiness = adapter.checkCustomerBookingRequestPersistenceConfigReadiness();
  const customerRouteResult = await readResponse(
    await customerRoute.POST(
      postJson(
        "http://localhost/api/customer-booking-requests",
        customerPayload(),
        customerHeaders(),
      ),
    ),
  );

  assert.equal(
    adminReadinessWithMissingAdminEnv.ok,
    false,
    "Expected admin persistence readiness to keep requiring admin dispatcher envs.",
  );
  assert.equal(
    customerRequestReadiness.ok,
    true,
    "Expected customer booking request DB readiness to ignore admin dispatcher envs.",
  );
  assert.deepEqual(customerRouteResult.body, {
    error: "Booking request failed safely.",
    ok: false,
  });
  assert.equal(
    customerRouteResult.status,
    500,
    "Expected customer booking route to reach the safe DB path instead of failing admin readiness.",
  );
  assert.equal(
    customerRequestMock.createdClients.length,
    1,
    "Expected customer booking request to create a server-only client after customer-specific readiness passes.",
  );
  assert.equal(
    customerRequestMock.client.operations.length > 0,
    true,
    "Expected customer booking request to reach the mocked persistence path.",
  );
  assertNoLeaks(customerRequestReadiness, "customer booking request readiness should stay safe");
  assertNoLeaks(customerRouteResult, "customer booking route safe DB failure should stay safe");

  setEnv(validStagingEnv());

  const directActorMock = installMockClient();
  const parsed = persistence.parseAdminBookingPersistencePayload(adminPayload());

  assert.equal(parsed.ok, true);

  const directActorResult = await persistence.createAdminBooking(parsed.data, {
    actor_label: "Local dev actor should not pass ready config",
    actor_role: "admin",
    boundary_mode: "local-dev-admin-surface",
    source_surface: "admin_api",
  });

  assert.deepEqual(directActorResult, {
    error: "Admin booking persistence requires a verified admin or dispatcher server session.",
    ok: false,
    status: 403,
  });
  assertNoPersistenceTouched(directActorMock, "direct local-dev actor with ready config");
  assertNoLeaks(directActorResult, "direct local-dev actor response should stay safe");
} finally {
  restoreEnv();
  delete globalThis.__prestigeStagingConfigMock;
  await harness.cleanup();
}

const implementationLedger = await readFile(implementationLedgerPath, "utf8");

assert.match(
  implementationLedger,
  /### Production Supabase Legacy API Key Cutoff Evidence \(2026-07-15\)/,
  "Expected the implementation ledger to record the bounded Production legacy-key cutoff.",
);
assert.match(
  implementationLedger,
  /dpl_GTjk3tJdVofKKy36bVFwPmP6sG4Y/,
  "Expected the implementation ledger to record the verified replacement-key Production deployment.",
);
assert.match(
  implementationLedger,
  /legacy `anon` and `service_role` keys are disabled/,
  "Expected the implementation ledger to record both legacy API keys as disabled.",
);
assert.match(
  implementationLedger,
  /remain valid as JWTs until a separately approved project JWT-secret rotation/,
  "Expected the implementation ledger to preserve the residual legacy-JWT risk and approval boundary.",
);
assert.match(
  implementationLedger,
  /Default prices, customer and driver records, bookings, invoices, OTS objects, Automation, schedules, and CRON_SECRET were not changed/,
  "Expected the implementation ledger to preserve the bounded no-data/no-price-change boundary.",
);
assert.match(
  implementationLedger,
  /### Supabase Previous Legacy JWT Key Revocation Evidence \(2026-07-15\)/,
  "Expected the implementation ledger to record the approved previous-key revocation.",
);
assert.match(
  implementationLedger,
  /previous legacy HS256 signing key is revoked/,
  "Expected the implementation ledger to record the previous legacy HS256 key as revoked.",
);
assert.match(
  implementationLedger,
  /public JWKS exposes exactly one ES256 EC key/,
  "Expected the implementation ledger to record the post-revocation public JWKS proof.",
);
assert.match(
  implementationLedger,
  /authenticated Production Load Accounts read succeeded and Automation remained ON/,
  "Expected the implementation ledger to record the post-revocation Production read proof.",
);
assert.doesNotMatch(
  implementationLedger,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  "The implementation ledger must never record a modern Supabase secret key.",
);
assert.doesNotMatch(
  implementationLedger,
  /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/,
  "The implementation ledger must never record a legacy JWT API key.",
);

console.log("Admin booking persistence staging config readiness tests passed.");
