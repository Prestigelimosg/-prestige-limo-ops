import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const appPagePath = "app/page.tsx";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const adminBookingPersistencePath = "lib/admin-booking-persistence.ts";
const adapterPath = "lib/admin-booking-supabase-adapter.ts";
const disabledPersistenceError =
  "Admin booking persistence is not enabled on this server.";
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
const riskyActivationFragments = [
  "customer_price",
  "customerPrice",
  "customer_rate",
  "customerRate",
  "customer_rates",
  "driver_payout",
  "driverPayout",
  "driver_payout_rules",
  "payout",
  "payment",
  "pdf",
  "billing",
  "rate_override",
  "rateOverride",
  "provider",
  "send_state",
  "send_log",
  "auth",
  "photo",
  "live_location",
  "liveLocation",
  "internal_note",
  "internalNote",
  "admin_note",
  "parser_debug",
  "mock_archive",
];
const unsafePayloadFields = [
  "customer_price",
  "customer_rates",
  "driver_payout",
  "driver_payout_rules",
  "rate_override",
  "payment_link",
  "pdf_link",
  "billing_status",
  "provider_send_state",
  "auth_link",
  "photo_url",
  "live_location_url",
  "internal_note",
  "parser_debug",
];

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

function extractBlock(source, marker) {
  const start = source.indexOf(marker);

  assert.notEqual(start, -1, `Missing source marker: ${marker}`);

  const openBrace = source.indexOf("{", start);

  assert.notEqual(openBrace, -1, `Missing block start for: ${marker}`);

  let depth = 0;

  for (let index = openBrace; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    }

    if (character === "}") {
      depth -= 1;

      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`Missing block end for: ${marker}`);
}

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(
    source.includes(fragment),
    true,
    `Expected ${label} to include ${fragment}.`,
  );
}

function assertExcludes(source, fragment, label = fragment) {
  assert.equal(
    source.includes(fragment),
    false,
    `Expected ${label} to exclude ${fragment}.`,
  );
}

function assertNoRiskyFragments(source, label) {
  for (const fragment of riskyActivationFragments) {
    assertExcludes(source, fragment, label);
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
      "  const mock = globalThis.__prestigeCoreBookingSafePathMock;",
      "  if (!mock) {",
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
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-core-booking-safe-path-"));

  await writeMockModules(tempDir);
  await writeHarnessFile(tempDir, adapterPath);
  await writeHarnessFile(tempDir, adminBookingPersistencePath);

  const require = createRequire(import.meta.url);

  return {
    adapter: require(path.join(tempDir, adapterPath.replace(/\.ts$/, ".js"))),
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    persistence: require(path.join(tempDir, adminBookingPersistencePath.replace(/\.ts$/, ".js"))),
  };
}

function installMockClient() {
  const mock = {
    client: {
      from(table) {
        throw new Error(`Safe-path guard did not expect Supabase table access: ${table}`);
      },
    },
    createdClients: [],
  };

  globalThis.__prestigeCoreBookingSafePathMock = mock;

  return mock;
}

function safeOperationalPayload(extraBookingFields = {}) {
  return {
    booking: {
      booking_reference: "SAFE-PATH-GUARD-001",
      source_channel: "admin-dashboard",
      source_surface: "admin_api",
      customer_id: null,
      pickup_datetime: "2026-06-15T09:30:00+08:00",
      pickup_at: "2026-06-15T09:30:00+08:00",
      pickup_location: "Safe path pickup",
      dropoff_location: "Safe path dropoff",
      route_type: "MNG",
      service_type: "airport_arrival",
      route_summary: "Safe path pickup > Safe path dropoff",
      customer_display_name: "Safe Path Customer",
      contact_display_name: "Safe Path Dispatcher",
      contact_phone: "+6500000000",
      contact_email: "safe-path@example.invalid",
      passenger_name: "Safe Path Passenger",
      passenger_phone: "+6500000001",
      pax_count: 1,
      luggage_count: 1,
      vehicle_type_or_category: "AVF",
      customer_facing_status: "received",
      admin_internal_status: "draft",
      short_notice_review_status: "not_required",
      request_review_status: "pending_review",
      change_review_status: "not_requested",
      cancellation_review_status: "not_requested",
      parser_source_reference: "safe-path-guard",
      ...extraBookingFields,
    },
    route_points: [
      {
        point_type: "pickup",
        sequence_number: 1,
        location_text: "Safe path pickup",
      },
      {
        point_type: "dropoff",
        sequence_number: 2,
        location_text: "Safe path dropoff",
      },
    ],
    service_items: [
      {
        service_item_type: "child_seat",
        quantity: 1,
        notes: "Safe operational service item",
      },
    ],
  };
}

try {
  const [pageSource, adminRouteSource, savedRouteSource, persistenceSource] = await Promise.all([
    readFile(appPagePath, "utf8"),
    readFile(adminBookingsRoutePath, "utf8"),
    readFile(adminSavedBookingsRoutePath, "utf8"),
    readFile(adminBookingPersistencePath, "utf8"),
  ]);
  const saveBookingSource = extractBlock(pageSource, "async function saveBooking");
  const operationalSaveSource = extractBlock(pageSource, "async function saveAdminBookingOperationalSnapshot");
  const operationalPayloadSource = extractBlock(pageSource, "function buildAdminBookingPersistencePayload");

  assertIncludes(saveBookingSource, "adminSavedBookingsApiPath", "current Save Booking + CRM path");
  assertIncludes(saveBookingSource, "customer_price_amount", "current legacy payload");
  assertIncludes(saveBookingSource, "driver_payout_amount", "current legacy payload");
  assertIncludes(saveBookingSource, "resolvePricing", "current legacy pricing dependency");
  assertIncludes(saveBookingSource, "calculateProfit", "current legacy pricing dependency");

  assertIncludes(operationalSaveSource, 'fetch("/api/admin-bookings"', "safe operational save path");
  assertIncludes(operationalSaveSource, 'method: "POST"', "safe operational save method");
  assertIncludes(operationalSaveSource, '"x-prestige-admin-purpose": "admin-booking-persistence"', "safe operational admin purpose");
  assertExcludes(operationalSaveSource, "adminSavedBookingsApiPath", "safe operational save path");
  assertExcludes(operationalSaveSource, "/api/admin-saved-bookings", "safe operational save path");
  assertNoRiskyFragments(operationalPayloadSource, "safe operational payload builder");

  assertIncludes(adminRouteSource, "parseAdminBookingPersistencePayload", "admin-bookings route");
  assertIncludes(adminRouteSource, "createAdminBooking", "admin-bookings route");
  assertIncludes(adminRouteSource, 'source_route: "/api/admin-bookings"', "admin-bookings route audit source");
  assertIncludes(savedRouteSource, "createAdminSavedBooking", "legacy saved-bookings route");
  assertIncludes(adminSavedBookingsRoutePath, "admin-saved-bookings", "legacy saved-bookings route path");
  assertIncludes(persistenceSource, "forbiddenFieldResult", "safe contract rejection helper");
  assertIncludes(persistenceSource, 'forbiddenFieldResult("admin booking")', "safe admin booking rejection call");

  const { cleanup, persistence } = await loadHarness();

  try {
    const parsedSafePayload = persistence.parseAdminBookingPersistencePayload(safeOperationalPayload());

    assert.equal(parsedSafePayload.ok, true, "Safe operational payload should parse.");

    for (const unsafeField of unsafePayloadFields) {
      const parsedUnsafePayload = persistence.parseAdminBookingPersistencePayload(
        safeOperationalPayload({
          [unsafeField]: `${unsafeField} must not be accepted by the safe path`,
        }),
      );

      assert.equal(parsedUnsafePayload.ok, false, `${unsafeField} should be rejected.`);
      assert.equal(parsedUnsafePayload.status, 400, `${unsafeField} rejection status should be 400.`);
    }

    setEnv({
      PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: "false",
      PRESTIGE_ADMIN_DISPATCHER_ACTOR_LABEL: "Safe path guard admin",
      PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: "server-session-token",
      PRESTIGE_ADMIN_DISPATCHER_SESSION_ROLE: "admin",
      PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN: "mock-safe-path-guard-admin-session-token",
      SUPABASE_SERVICE_ROLE_KEY: "SUPABASE_SERVICE_ROLE_SAFE_PATH_GUARD_SENTINEL",
      SUPABASE_URL: "https://safe-path-guard.supabase.co",
    });

    const mock = installMockClient();
    const disabledResult = await persistence.createAdminBooking(
      parsedSafePayload.data,
      {
        actor_label: "Safe path guard admin",
        actor_role: "admin",
        boundary_mode: "server-session-role-surface",
        source_surface: "admin_api",
      },
      {
        action: "admin_booking_create",
        actor_label: "Safe path guard admin",
        change_summary: "Safe path guard disabled write attempt.",
        source_route: "/api/admin-bookings",
      },
    );

    assert.deepEqual(disabledResult, {
      error: disabledPersistenceError,
      ok: false,
      status: 503,
    });
    assert.equal(mock.createdClients.length, 0, "Closed kill switch must not create a Supabase client.");
  } finally {
    await cleanup();
  }
} finally {
  restoreEnv();
  delete globalThis.__prestigeCoreBookingSafePathMock;
}

console.log("core booking persistence safe path guard passed");
