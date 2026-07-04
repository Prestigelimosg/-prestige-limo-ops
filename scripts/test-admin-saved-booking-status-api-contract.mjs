import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routeBlockedMessage =
  "Admin booking persistence is available only from the internal admin dashboard.";
const serverSessionToken = "mock-admin-saved-booking-status-session-token";
const serviceRoleSentinel = "SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_STATUS_SENTINEL";
const supabaseUrlSentinel = "https://admin-saved-booking-status-contract.supabase.co";
const unsafeResponsePattern =
  /SUPABASE_SERVICE_ROLE_KEY_ADMIN_SAVED_BOOKING_STATUS_SENTINEL|mock-admin-saved-booking-status-session-token|admin-saved-booking-status-contract\.supabase\.co|customer_price|customer_rate|driver_payout|paynow|invoice|payment|pdf|billing|payout|finance|parser_debug|raw_ai|parser_prompt|internal_admin_note|admin_finance|mock_archive|mock_qa|service_role|server-only|server_only|stack|sql|secret|api_key|createClient/i;
const sourceFiles = [
  "lib/admin-saved-booking-status-persistence.ts",
  "lib/admin-booking-supabase-adapter.ts",
  "lib/admin-dispatcher-auth-boundary.ts",
  "app/api/admin-saved-booking-statuses/route.ts",
];
const dashboardPath = "app/page.tsx";
const originalEnv = {
  NODE_ENV: process.env.NODE_ENV,
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
  VERCEL_ENV: process.env.VERCEL_ENV,
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

function enabledEnv() {
  return {
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "true",
    PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Saved booking status contract admin",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
    PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: serverSessionToken,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleSentinel,
    SUPABASE_URL: supabaseUrlSentinel,
  };
}

function sessionHeaders(extra = {}) {
  return {
    referer: "http://localhost/",
    "content-type": "application/json",
    "x-prestige-admin-purpose": "admin-booking-persistence",
    "x-prestige-admin-session-token": serverSessionToken,
    ...extra,
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
      "  const mock = globalThis.__prestigeAdminSavedBookingStatusApiMock;",
      "  if (!mock || !mock.client) {",
      "    throw new Error('Missing mocked admin saved booking status Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-admin-saved-booking-status-api-"));

  await writeMockModules(tempDir);

  for (const relativePath of sourceFiles) {
    await writeHarnessFile(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(tempDir, "lib/admin-saved-booking-status-persistence.js")),
    route: require(path.join(tempDir, "app/api/admin-saved-booking-statuses/route.js")),
  };
}

class MockSupabaseQuery {
  constructor(client, table) {
    this.client = client;
    this.filters = [];
    this.resultMode = "many";
    this.selectedColumns = null;
    this.table = table;
    this.updatePayload = null;
  }

  eq(column, value) {
    this.filters.push({
      column,
      type: "eq",
      value,
    });

    return this;
  }

  maybeSingle() {
    this.resultMode = "maybeSingle";

    return this;
  }

  select(columns) {
    this.selectedColumns = columns;

    return this;
  }

  then(resolve, reject) {
    return Promise.resolve(this.execute()).then(resolve, reject);
  }

  update(payload) {
    this.updatePayload = clone(payload);

    return this;
  }

  execute() {
    if (!this.updatePayload) {
      throw new Error(`Unexpected non-update query for ${this.table}`);
    }

    return this.client.updateRows(
      this.table,
      this.filters,
      this.updatePayload,
      this.resultMode,
      this.selectedColumns,
    );
  }
}

class MockSupabaseClient {
  constructor(seed, failures = {}) {
    this.failures = failures;
    this.operations = [];
    this.rows = clone(seed);
    this.updateHistory = [];
  }

  from(table) {
    this.operations.push({
      table,
      type: "from",
    });

    return new MockSupabaseQuery(this, table);
  }

  updateRows(table, filters, updatePayload, resultMode, selectedColumns) {
    const configuredFailure = this.failures[`update:${table}`] || this.failures[table] || null;
    const failure = Array.isArray(configuredFailure)
      ? configuredFailure.shift() || null
      : configuredFailure;

    this.updateHistory.push({
      filters: clone(filters),
      payload: clone(updatePayload),
      resultMode,
      selectedColumns,
      table,
    });

    if (failure) {
      return {
        data: null,
        error: failure,
      };
    }

    const rows = this.rows[table] || [];
    const matches = rows.filter((row) =>
      filters.every((filter) => String(row[filter.column]) === String(filter.value)),
    );

    for (const row of matches) {
      Object.assign(row, updatePayload);
    }

    return {
      data: resultMode === "maybeSingle" ? matches[0] ?? null : matches,
      error: null,
    };
  }
}

function installMockClient(seed, failures = {}) {
  const mock = {
    client: new MockSupabaseClient(seed, failures),
    createdClients: [],
  };

  globalThis.__prestigeAdminSavedBookingStatusApiMock = mock;

  return mock;
}

function jsonRequest(url, body, headers = sessionHeaders()) {
  return new Request(url, {
    body: JSON.stringify(body),
    headers,
    method: "PATCH",
  });
}

async function routeJson(response) {
  return {
    body: await response.json(),
    status: response.status,
  };
}

function assertNoUnsafeResponse(result, label) {
  assert.equal(
    unsafeResponsePattern.test(JSON.stringify(result.body)),
    false,
    `${label} leaked an unsafe response field: ${JSON.stringify(result.body)}`,
  );
}

function assertNoWrites(mock, label) {
  assert.equal(mock.client.updateHistory.length, 0, `${label} unexpectedly updated rows`);
}

const seed = {
  bookings: [
    {
      id: "status-booking-1",
      admin_internal_status: "driver_assigned",
      status: "assigned",
      updated_at: "2026-05-27T02:30:00.000Z",
    },
    {
      id: "status-booking-2",
      admin_internal_status: "completed",
      status: "completed",
      updated_at: "2026-05-28T02:30:00.000Z",
    },
    {
      admin_internal_status: "driver_assigned",
      booking_reference: "CUST-20260701174619-ZO8P2W",
      id: "11111111-1111-4111-8111-111111111111",
      status: "assigned",
      updated_at: "2026-05-29T02:30:00.000Z",
    },
  ],
};

const dashboardSource = await readFile(path.join(process.cwd(), dashboardPath), "utf8");
const savedBookingStatusFetchBlock = dashboardSource.match(
  /fetch\(adminSavedBookingStatusesApiPath,[\s\S]*?method: "PATCH",\n\s*\}\);/,
)?.[0];

assert.ok(savedBookingStatusFetchBlock, "Dashboard must call the saved booking status API.");
assert.equal(
  dashboardSource.includes("const bookingStatusReference ="),
  true,
  "Dashboard saved booking status updates must resolve a stable booking status reference.",
);
assert.equal(
  savedBookingStatusFetchBlock.includes("booking_id: bookingStatusReference"),
  true,
  "Dashboard saved booking status updates must send the stable booking reference to the status API.",
);
assert.equal(
  savedBookingStatusFetchBlock.includes('"x-prestige-admin-purpose": "admin-booking-persistence"'),
  true,
  "Dashboard saved booking status updates must use the booking-persistence admin boundary.",
);
assert.equal(
  savedBookingStatusFetchBlock.includes("adminLegacyDataPurpose"),
  false,
  "Dashboard saved booking status updates must not use the legacy data boundary.",
);
assert.equal(
  dashboardSource.includes('patchBookingStatusReference(driverJobLinkBookingReference, "cancelled")'),
  true,
  "Driver job link revoke must persist the booking status as cancelled.",
);
assert.equal(
  dashboardSource.includes("Driver job link revoked. Booking status changed to Cancelled and moved to Completed / History."),
  true,
  "Driver job link revoke success must tell the admin the cancelled booking moved to Completed / History.",
);
assert.equal(
  dashboardSource.includes("applyBookingStatusToLocalRecord(currentBooking, nextStatus, responseUpdatedAt)"),
  true,
  "Saved booking status updates must mirror the new status into the local booking record immediately.",
);
assert.equal(
  dashboardSource.includes("setLoadBookingsTypedOperationalCardsById((current) => {"),
  true,
  "Saved booking status updates must also refresh the typed dashboard card status locally.",
);
assert.equal(
  dashboardSource.includes("String(responseBody.booking.id) !== bookingStatusReference"),
  false,
  "Saved booking status updates must not reject valid booking-reference responses only because the API identifier shape differs.",
);
assert.equal(
  dashboardSource.includes('patchBookingStatusReference(bookingStatusReference, "completed")'),
  true,
  "Driver Job Completed reports must persist the booking status as completed.",
);
assert.equal(
  dashboardSource.includes("function bookingRecordIsCancelledStatus"),
  true,
  "Cancelled bookings must have a status helper for archive routing.",
);
assert.equal(
  dashboardSource.includes('const archivedStatus = isCancelledStatus ? "cancelled" : isCompletedStatus ? "completed" : "";'),
  true,
  "Loaded booking snapshots must normalize final cancelled/completed status before stale pending values.",
);
assert.equal(
  dashboardSource.includes("function adminBookingPersistenceRecordIsCancelledStatus"),
  true,
  "Loaded operational snapshots must detect cancelled status across admin/customer/review fields.",
);
assert.equal(
  dashboardSource.includes("adminBookingPersistenceRecordIsCancelledStatus(record)") &&
    dashboardSource.includes('return "Cancelled";'),
  true,
  "Loaded operational snapshot primary status must show Cancelled before older pending/admin text.",
);

const harness = await loadHarness();

try {
  const { persistence, route } = harness;

  assert.equal(persistence.adminSavedBookingStatusVersion, "admin-saved-booking-status-v1");
  assert.deepEqual(persistence.parseAdminSavedBookingStatusPayload({
    booking_id: "status-booking-1",
    status: "completed",
  }), {
    data: {
      booking_id: "status-booking-1",
      status: "completed",
    },
    ok: true,
  });
  assert.deepEqual(persistence.parseAdminSavedBookingStatusPayload({
    booking_id: "status-booking-1",
    status: "cancelled",
  }), {
    data: {
      booking_id: "status-booking-1",
      status: "cancelled",
    },
    ok: true,
  });
  assert.equal(persistence.parseAdminSavedBookingStatusPayload({ booking_id: "status-booking-1", status: "paid" }).ok, false);
  assert.equal(persistence.parseAdminSavedBookingStatusPayload({ booking_id: "status-booking-1", status: "completed", updated_at: "2026-01-01T00:00:00.000Z" }).ok, false);
  assert.equal(persistence.parseAdminSavedBookingStatusPayload({ status: "completed" }).ok, false);

  setEnv(enabledEnv());

  const blockedMock = installMockClient(seed);
  const blockedResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
      }, sessionHeaders({ referer: "http://localhost/my-bookings" })),
    ),
  );

  assert.equal(blockedResult.status, 403);
  assert.equal(blockedResult.body.error, routeBlockedMessage);
  assert.equal(blockedMock.createdClients.length, 0);
  assertNoWrites(blockedMock, "blocked customer surface");
  assertNoUnsafeResponse(blockedResult, "blocked response");

  setEnv({
    ...enabledEnv(),
    NODE_ENV: "production",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "",
  });

  const productionLocalMock = installMockClient(seed);
  const productionLocalResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
      }, {
        referer: "http://localhost/",
        "content-type": "application/json",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      }),
    ),
  );

  assert.equal(productionLocalResult.status, 403);
  assert.equal(productionLocalMock.createdClients.length, 0);
  assertNoWrites(productionLocalMock, "production local-dev surface");
  assertNoUnsafeResponse(productionLocalResult, "production local-dev response");

  setEnv(enabledEnv());

  const dashboardNoTokenMock = installMockClient(seed);
  const dashboardNoTokenResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
      }, {
        referer: "http://localhost/",
        "content-type": "application/json",
        "x-prestige-admin-purpose": "admin-booking-persistence",
      }),
    ),
  );

  assert.equal(dashboardNoTokenResult.status, 200);
  assert.equal(dashboardNoTokenResult.body.ok, true);
  assert.equal(dashboardNoTokenResult.body.booking.id, "status-booking-1");
  assert.equal(dashboardNoTokenResult.body.booking.status, "completed");
  assert.equal(dashboardNoTokenMock.createdClients.length, 1);
  assert.equal(dashboardNoTokenMock.client.updateHistory.length, 2);
  assertNoUnsafeResponse(dashboardNoTokenResult, "dashboard no-token response");

  setEnv(enabledEnv());

  const invalidPayloadMock = installMockClient(seed);
  const invalidPayloadResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
    ),
  );

  assert.equal(invalidPayloadResult.status, 400);
  assert.equal(invalidPayloadMock.createdClients.length, 0);
  assertNoWrites(invalidPayloadMock, "invalid payload");
  assertNoUnsafeResponse(invalidPayloadResult, "invalid payload response");

  setEnv(enabledEnv());

  const validMock = installMockClient(seed);
  const validResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
      }),
    ),
  );

  assert.equal(validResult.status, 200);
  assert.equal(validResult.body.ok, true);
  assert.equal(validResult.body.version, "admin-saved-booking-status-v1");
  assert.deepEqual(
    {
      id: validResult.body.booking.id,
      status: validResult.body.booking.status,
    },
    {
      id: "status-booking-1",
      status: "completed",
    },
  );
  assert.match(validResult.body.booking.updated_at, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(validMock.createdClients.length, 1);
  assert.equal(validMock.client.updateHistory.length, 2);
  assert.equal(validMock.client.updateHistory[0].table, "bookings");
  assert.deepEqual(validMock.client.updateHistory[0].filters, [
    {
      column: "id",
      type: "eq",
      value: "status-booking-1",
    },
  ]);
  assert.deepEqual(Object.keys(validMock.client.updateHistory[0].payload).sort(), ["admin_internal_status", "updated_at"]);
  assert.equal(validMock.client.updateHistory[0].payload.admin_internal_status, "completed");
  assert.equal(validMock.client.updateHistory[0].selectedColumns, "id, booking_reference, admin_internal_status, updated_at");
  assert.deepEqual(Object.keys(validMock.client.updateHistory[1].payload).sort(), ["status", "updated_at"]);
  assert.equal(validMock.client.updateHistory[1].payload.status, "completed");
  assert.equal(validMock.client.updateHistory[1].selectedColumns, "id, booking_reference, status, updated_at");
  assertNoUnsafeResponse(validResult, "valid response");

  setEnv(enabledEnv());

  const cancelledMock = installMockClient(seed);
  const cancelledResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "cancelled",
      }),
    ),
  );

  assert.equal(cancelledResult.status, 200);
  assert.equal(cancelledResult.body.ok, true);
  assert.equal(cancelledResult.body.booking.id, "status-booking-1");
  assert.equal(cancelledResult.body.booking.status, "cancelled");
  assert.equal(cancelledMock.createdClients.length, 1);
  assert.equal(cancelledMock.client.updateHistory.length, 2);
  assert.equal(cancelledMock.client.updateHistory[0].payload.admin_internal_status, "cancelled");
  assert.equal(cancelledMock.client.updateHistory[1].payload.status, "cancelled");
  assertNoUnsafeResponse(cancelledResult, "cancelled status response");

  setEnv(enabledEnv());

  const missingLegacyMirrorMock = installMockClient(seed, {
    "update:bookings": [
      null,
      {
        code: "PGRST204",
        message: "Could not find the 'status' column of 'bookings' in the schema cache",
        status: 400,
      },
    ],
  });
  const missingLegacyMirrorResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
      }),
    ),
  );

  assert.equal(missingLegacyMirrorResult.status, 200);
  assert.equal(missingLegacyMirrorResult.body.ok, true);
  assert.equal(missingLegacyMirrorResult.body.booking.id, "status-booking-1");
  assert.equal(missingLegacyMirrorResult.body.booking.status, "completed");
  assert.equal(missingLegacyMirrorMock.client.updateHistory.length, 2);
  assert.equal(missingLegacyMirrorMock.client.updateHistory[0].selectedColumns, "id, booking_reference, admin_internal_status, updated_at");
  assert.equal(missingLegacyMirrorMock.client.updateHistory[1].selectedColumns, "id, booking_reference, status, updated_at");
  assertNoUnsafeResponse(missingLegacyMirrorResult, "missing legacy mirror response");

  setEnv(enabledEnv());

  const legacyFallbackMock = installMockClient(seed, {
    "update:bookings": [
      {
        code: "PGRST204",
        message: "Could not find the 'admin_internal_status' column of 'bookings' in the schema cache",
        status: 400,
      },
      null,
    ],
  });
  const legacyFallbackResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "completed",
      }),
    ),
  );

  assert.equal(legacyFallbackResult.status, 200);
  assert.equal(legacyFallbackResult.body.ok, true);
  assert.equal(legacyFallbackResult.body.booking.id, "status-booking-1");
  assert.equal(legacyFallbackResult.body.booking.status, "completed");
  assert.equal(legacyFallbackMock.client.updateHistory.length, 2);
  assert.equal(legacyFallbackMock.client.updateHistory[0].selectedColumns, "id, booking_reference, admin_internal_status, updated_at");
  assert.equal(legacyFallbackMock.client.updateHistory[1].selectedColumns, "id, booking_reference, status, updated_at");
  assert.deepEqual(Object.keys(legacyFallbackMock.client.updateHistory[1].payload).sort(), ["status", "updated_at"]);
  assert.equal(legacyFallbackMock.client.updateHistory[1].payload.status, "completed");
  assertNoUnsafeResponse(legacyFallbackResult, "legacy fallback response");

  setEnv(enabledEnv());

  const bookingReferenceMock = installMockClient(seed);
  const bookingReferenceResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "CUST-20260701174619-ZO8P2W",
        status: "completed",
      }),
    ),
  );

  assert.equal(bookingReferenceResult.status, 200);
  assert.equal(bookingReferenceResult.body.ok, true);
  assert.deepEqual(
    {
      id: bookingReferenceResult.body.booking.id,
      status: bookingReferenceResult.body.booking.status,
    },
    {
      id: "CUST-20260701174619-ZO8P2W",
      status: "completed",
    },
  );
  assert.equal(bookingReferenceMock.createdClients.length, 1);
  assert.equal(bookingReferenceMock.client.updateHistory.length, 2);
  assert.deepEqual(bookingReferenceMock.client.updateHistory[0].filters, [
    {
      column: "booking_reference",
      type: "eq",
      value: "CUST-20260701174619-ZO8P2W",
    },
  ]);
  assert.equal(bookingReferenceMock.client.updateHistory[0].selectedColumns, "id, booking_reference, admin_internal_status, updated_at");
  assert.equal(bookingReferenceMock.client.updateHistory[0].payload.admin_internal_status, "completed");
  assert.equal(bookingReferenceMock.client.updateHistory[1].selectedColumns, "id, booking_reference, status, updated_at");
  assert.equal(bookingReferenceMock.client.updateHistory[1].payload.status, "completed");
  assertNoUnsafeResponse(bookingReferenceResult, "booking-reference response");

  setEnv(enabledEnv());

  const missingMock = installMockClient(seed);
  const missingResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "missing-booking",
        status: "completed",
      }),
    ),
  );

  assert.equal(missingResult.status, 404);
  assert.equal(missingResult.body.error, "Admin saved booking status target was not found.");
  assert.equal(missingMock.client.updateHistory.length, 1);
  assertNoUnsafeResponse(missingResult, "missing response");

  setEnv(enabledEnv());

  const failureMock = installMockClient(seed, {
    "update:bookings": {
      code: "42501",
      message: "permission denied for table bookings",
      status: 403,
    },
  });
  const failureResult = await routeJson(
    await route.PATCH(
      jsonRequest("http://localhost/api/admin-saved-booking-statuses", {
        booking_id: "status-booking-1",
        status: "pob",
      }),
    ),
  );

  assert.equal(failureResult.status, 500);
  assert.equal(failureResult.body.error, "Admin saved booking status update failed safely.");
  assert.equal(failureMock.client.updateHistory.length, 1);
  assertNoUnsafeResponse(failureResult, "failure response");
} finally {
  restoreEnv();
  delete globalThis.__prestigeAdminSavedBookingStatusApiMock;
  await harness.cleanup();
}

console.log("Admin saved booking status API contract passed.");
