import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const routePath = "app/api/admin-load-bookings-typed-read/route.ts";
const gatedHelperPath = "lib/admin-load-bookings-typed-read-gated.ts";
const recordMapperPath = "lib/admin-load-bookings-operational-record-mapper.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const safeUiAdapterHelperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const savedBookingReadPath = "lib/admin-saved-booking-read.ts";
const dispatcherBoundaryPath = "lib/admin-dispatcher-auth-boundary.ts";
const adapterStubPath = "lib/admin-booking-supabase-adapter.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const routePathFragment = "/api/admin-load-bookings-typed-read";
const guardScript = "scripts/test-load-bookings-typed-read-gated-api-contract.mjs";
const enabledEnvName = "PRESTIGE_LOAD_BOOKINGS_TYPED_READ_ENABLED";

const unsafeSafeOutputPattern =
  /pricing|payout|customer_rate|customer_price|customer_rates|driver_payout_rules|driver_payout|driver_notes|driver_dispatch_include_payout|midnight_surcharge|extra_stop_surcharge|child_seat_customer_surcharge|pricing_source|rate_override|payment|billing|invoice|pdf|provider|send_state|send_log|auth|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;
const forbiddenRuntimeWiringPattern =
  /adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;

const originalEnv = {
  [enabledEnvName]: process.env[enabledEnvName],
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

function assertIncludes(source, fragment, label = fragment) {
  assert.equal(source.includes(fragment), true, `${label} must include ${fragment}.`);
}

function assertExcludes(source, fragmentOrPattern, label) {
  const matches =
    fragmentOrPattern instanceof RegExp
      ? fragmentOrPattern.test(source)
      : source.includes(fragmentOrPattern);

  assert.equal(matches, false, `${label} must not include ${fragmentOrPattern}.`);
}

function sliceBetween(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `Missing source marker: ${startMarker}`);
  const end = source.indexOf(endMarker, start + startMarker.length);
  assert.notEqual(end, -1, `Missing end marker after ${startMarker}: ${endMarker}`);

  return source.slice(start, end);
}

function assertClosedGate(value, label) {
  assert.equal(value.ok, false, `${label} must be blocked.`);
  assert.equal(value.status, "blocked", `${label} must report blocked status.`);
  assert.equal(value.read_gate_open, false, `${label} must keep read gate closed.`);
  assert.equal(value.readEnabled, false, `${label} must keep readEnabled false.`);
  assert.equal(value.read_enabled, false, `${label} must keep read_enabled false.`);
  assert.equal(value.dbReadEnabled, false, `${label} must keep dbReadEnabled false.`);
  assert.equal(value.db_read_enabled, false, `${label} must keep db_read_enabled false.`);
  assert.equal(value.databaseClientEnabled, false, `${label} must keep databaseClientEnabled false.`);
  assert.equal(value.database_client_enabled, false, `${label} must keep database_client_enabled false.`);
  assert.equal(value.liveReadEnabled, false, `${label} must keep liveReadEnabled false.`);
  assert.equal(value.live_read_enabled, false, `${label} must keep live_read_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.no_live_read, true, `${label} must keep no_live_read true.`);
  assert.equal(value.no_op, true, `${label} must keep no_op true.`);
  assert.equal(value.env_gate_name, enabledEnvName, `${label} must expose env name only.`);
}

function assertOpenSafeRead(value, label) {
  assert.equal(value.ok, true, `${label} must be ok.`);
  assert.equal(value.status, "ready", `${label} must report ready status under mocked open gate.`);
  assert.equal(value.read_gate_open, true, `${label} must open the typed read gate.`);
  assert.equal(value.readEnabled, true, `${label} must mark readEnabled true only under mocked open gate.`);
  assert.equal(value.dbReadEnabled, true, `${label} must mark dbReadEnabled true only under mocked open gate.`);
  assert.equal(value.databaseClientEnabled, true, `${label} must mark databaseClientEnabled true only under mocked open gate.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.saveBookingChanged, false, `${label} must keep Save Booking unchanged.`);
  assert.equal(value.savedBookingsEndpointChanged, false, `${label} must keep saved-bookings unchanged.`);
  assert.equal(value.loadBookingsRuntimeWiringEnabled, false, `${label} must not wire app runtime.`);
  assert.equal(value.typedEndpointRuntimeWiringEnabled, false, `${label} must keep typed runtime wiring false.`);
  assert.equal(value.env_gate_name, enabledEnvName, `${label} must expose env name only.`);
  assertNoUnsafeSafeOutput(value, label);
}

function assertNoUnsafeSafeOutput(value, label) {
  assert.equal(
    unsafeSafeOutputPattern.test(JSON.stringify(value)),
    false,
    `${label} must not expose finance, payout, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret text.`,
  );
}

function adminHeaders() {
  return {
    "x-prestige-admin-purpose": "admin-booking-persistence",
    origin: "http://localhost",
    referer: "http://localhost/",
  };
}

function routeUrl(pathname = routePathFragment, params = {}) {
  const url = new URL(`http://localhost${pathname}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  return url;
}

function safeSavedBookingRecord(id = "BK-TYPED-001") {
  return {
    id,
    booking_type: "MNG",
    vehicle: "Alphard",
    pickup_time: "2026-06-18T10:00:00+08:00",
    pickup_address: "Raffles Hotel Singapore",
    dropoff_address: "Changi Airport Terminal 3",
    route: "Raffles Hotel Singapore > Changi Airport Terminal 3",
    flight_no: "SQ123",
    pax: 2,
    status: "assigned",
    driver_name: "Ali Driver",
    driver_contact: "+6512345678",
    driver_plate_number: "SMA1234A",
    child_seat_required: true,
    child_seat_count: 1,
    child_seat_type: "Booster",
    extra_stop_count: 0,
    created_at: "2026-06-17T09:00:00+08:00",
    updated_at: "2026-06-17T10:00:00+08:00",
    companies: { company_name: "UBS Singapore", domain: "ubs.example" },
    bookers: { booker_name: "Jane Booker", email: "jane@example.com", phone: "+6599999999" },
    travelers: { traveler_name: "Mr Lee" },
    customer_rate: "812.35",
    driver_payout_amount: "64.20",
    driver_notes: "driver payout should stay parked",
    internal_admin_notes: "internal admin note should never expose",
    pricing_source: "manual override",
    payment_link: "https://pay.example.invalid",
  };
}

function savedBookingRecordWithUnsafeOptionalTraveler(id = "BK-TYPED-UNSAFE-TRAVELER") {
  return {
    ...safeSavedBookingRecord(id),
    companies: { company_name: "Safe Company" },
    travelers: { traveler_name: "Payment team traveler" },
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

async function writeTranspiled(tempDir, relativePath) {
  const sourcePath = path.join(process.cwd(), relativePath);
  const outputPath = path.join(tempDir, relativePath.replace(/\.ts$/, ".js"));
  const source = await readFile(sourcePath, "utf8");

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, transpileTypescript(source, sourcePath));
}

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-load-bookings-typed-read-gated-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const supabasePath = path.join(tempDir, "node_modules/@supabase/supabase-js/index.js");
  const adapterPath = path.join(tempDir, adapterStubPath.replace(/\.ts$/, ".js"));

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await mkdir(path.dirname(supabasePath), { recursive: true });
  await mkdir(path.dirname(adapterPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await writeFile(
    adapterPath,
    [
      "function adminDispatcherBoundaryToPersistenceAdapterActor(context) {",
      "  return {",
      "    actor_label: context.actorLabel || 'Harness admin',",
      "    actor_role: context.role === 'dispatcher' ? 'dispatcher' : 'admin',",
      "    boundary_mode: context.mode,",
      "    source_surface: 'admin_api',",
      "  };",
      "}",
      "module.exports = { adminDispatcherBoundaryToPersistenceAdapterActor };",
    ].join("\n"),
  );
  await writeFile(
    supabasePath,
    [
      "function createClient(url, serviceRoleKey, options) {",
      "  const mock = globalThis.__prestigeLoadBookingsTypedReadMock;",
      "  if (!mock) {",
      "    throw new Error('Missing mocked Supabase client.');",
      "  }",
      "  mock.createdClients.push({ options, serviceRoleKey, url });",
      "  return mock.client;",
      "}",
      "module.exports = { createClient };",
    ].join("\n"),
  );

  for (const relativePath of [
    safeDtoHelperPath,
    safeUiAdapterHelperPath,
    recordMapperPath,
    gatedHelperPath,
    dispatcherBoundaryPath,
    savedBookingReadPath,
    routePath,
  ]) {
    await writeTranspiled(tempDir, relativePath);
  }

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    route: require(path.join(tempDir, routePath.replace(/\.ts$/, ".js"))),
  };
}

function installMockClient() {
  const mock = {
    createdClients: [],
    detailData: safeSavedBookingRecord("BK-TYPED-DETAIL"),
    listData: [safeSavedBookingRecord("BK-TYPED-LIST")],
    selectedColumns: [],
    tableNames: [],
  };

  mock.client = {
    from(tableName) {
      mock.tableNames.push(tableName);

      return {
        select(columns) {
          mock.selectedColumns.push(columns);

          return {
            limit(limit) {
              mock.detailLimit = limit;

              return {
                eq(field, value) {
                  mock.eq = { field, value };

                  return {
                    maybeSingle() {
                      return Promise.resolve({ data: mock.detailData, error: null });
                    },
                  };
                },
              };
            },
            order(field, options) {
              mock.order = { field, options };

              return {
                limit(limit) {
                  mock.listLimit = limit;

                  return Promise.resolve({ data: mock.listData, error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  globalThis.__prestigeLoadBookingsTypedReadMock = mock;

  return mock;
}

const [
  routeSource,
  gatedHelperSource,
  recordMapperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(routePath, "utf8"),
  readFile(gatedHelperPath, "utf8"),
  readFile(recordMapperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(routeSource, "export const dynamic = \"force-dynamic\"", "Typed Load Bookings gated route");
assertIncludes(routeSource, "export async function GET", "Typed Load Bookings gated route");
assertExcludes(routeSource, "export async function POST", "Typed Load Bookings gated route POST");
assertExcludes(routeSource, "export async function PUT", "Typed Load Bookings gated route PUT");
assertExcludes(routeSource, "export async function PATCH", "Typed Load Bookings gated route PATCH");
assertExcludes(routeSource, "export async function DELETE", "Typed Load Bookings gated route DELETE");
assertIncludes(routeSource, "buildAdminLoadBookingsTypedReadGateState", "Typed Load Bookings gated route gate state");
assertIncludes(routeSource, "mapAdminLoadBookingsTypedReadList", "Typed Load Bookings gated route list mapper");
assertIncludes(routeSource, "mapAdminLoadBookingsTypedReadDetail", "Typed Load Bookings gated route detail mapper");
assertIncludes(routeSource, "loadAdminSavedBookingList", "Typed Load Bookings gated route list read");
assertIncludes(routeSource, "loadAdminSavedBookingById", "Typed Load Bookings gated route detail read");
assertIncludes(routeSource, "resolveAdminDispatcherBoundary", "Typed Load Bookings gated route boundary");
assertIncludes(routeSource, "adminBookingPersistencePurpose", "Typed Load Bookings gated route purpose");
assertIncludes(gatedHelperSource, enabledEnvName, "Typed Load Bookings gated helper env name");
assertIncludes(gatedHelperSource, "process.env[adminLoadBookingsTypedReadEnabledEnvName]", "Typed Load Bookings gated helper env read");
assertIncludes(gatedHelperSource, "buildAdminLoadBookingsOperationalRecordMapper", "Typed Load Bookings gated helper mapper usage");
assertExcludes(gatedHelperSource, /SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY|createClient|\.from\(|\.select\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(/i, "Typed Load Bookings gated helper direct DB path");
assertExcludes(`${routeSource}\n${gatedHelperSource}`, forbiddenRuntimeWiringPattern, "Typed Load Bookings gated route/helper no shim path");

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Current Load Bookings endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertIncludes(
  appPage,
  `const adminLoadBookingsTypedReadApiPath = "${routePathFragment}"`,
  "Load Bookings typed read display bridge path",
);
assertIncludes(
  loadBookingsBlock,
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
  "Load Bookings typed read display bridge",
);
const typedOperationalFetchIndex = loadBookingsBlock.indexOf(
  "fetchLoadBookingsTypedOperationalDisplayResult(searchParams)",
);
const legacySavedBookingsFetchIndex = loadBookingsBlock.indexOf(
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
);
assert.equal(
  typedOperationalFetchIndex > -1 && legacySavedBookingsFetchIndex > -1,
  true,
  "Load Bookings typed and legacy fetches must both be present.",
);
assert.equal(
  typedOperationalFetchIndex < legacySavedBookingsFetchIndex,
  true,
  "Load Bookings must hydrate typed operational display cards before the legacy booking/form source.",
);
assertIncludes(
  appPage,
  "function buildLoadBookingsOperationalDisplayCardFromTypedRead",
  "Load Bookings typed read safe-card adapter",
);
assertIncludes(
  appPage,
  "function getLoadBookingsOperationalDisplayCard",
  "Load Bookings operational card selector",
);
assertIncludes(
  appPage,
  "setLoadBookingsTypedOperationalCardsById(typedOperationalDisplay?.cardsById ?? {})",
  "Load Bookings typed read safe-card state",
);
assertIncludes(
  appPage,
  "setLoadBookingsTypedOperationalCardOrder(typedOperationalDisplay?.orderedCardIds ?? [])",
  "Load Bookings typed read ordered safe-card state",
);
assertIncludes(
  appPage,
  "function buildLoadBookingsTypedOperationalDisplayResult",
  "Load Bookings typed read ordered display result builder",
);
assertIncludes(
  appPage,
  "orderedCardIds.push(cardKey)",
  "Load Bookings typed read ordered card ids",
);
assertExcludes(
  loadBookingsBlock,
  "setBookings(typedOperationalCardsById",
  "Load Bookings typed read must not replace booking/form source",
);
assertExcludes(
  loadBookingsBlock,
  "setBookings(typedOperationalDisplay",
  "Load Bookings typed read ordered result must not replace booking/form source",
);
assertExcludes(loadBookingsBlock, "admin-load-bookings-typed-read-gated", "Load Bookings app typed helper wiring");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, routePathFragment, `${label} typed Load Bookings route wiring`);
  assertExcludes(source, "admin-load-bookings-typed-read-gated", `${label} typed Load Bookings helper wiring`);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings detail remains");
assertIncludes(recordMapperSource, "safe_card", "Operational mapper remains safe-card based");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite typed gated route guard registration");

const harness = await loadHarness();

try {
  const mock = installMockClient();

  setEnv({
    [enabledEnvName]: undefined,
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    SUPABASE_SERVICE_ROLE_KEY: undefined,
    SUPABASE_URL: undefined,
  });

  const closedResponse = await harness.route.GET(new Request(routeUrl(), { headers: adminHeaders() }));
  const closedBody = await closedResponse.json();
  assert.equal(closedResponse.status, 503, "Closed typed read gate must return 503.");
  assertClosedGate(closedBody, "Closed typed read gate");
  assert.equal(mock.createdClients.length, 0, "Closed typed read gate must not create a Supabase client.");
  assertNoUnsafeSafeOutput(closedBody, "Closed typed read gate");

  setEnv({
    [enabledEnvName]: "true",
    PRESTIGE_ADMIN_BOOKING_PERSISTENCE_ENABLED: undefined,
    PRESTIGE_ADMIN_DISPATCHER_AUTH_MODE: undefined,
    SUPABASE_SERVICE_ROLE_KEY: "service-role-key-for-mocked-read-only-test",
    SUPABASE_URL: "https://prestige-load-bookings-test.supabase.co",
  });

  const listResponse = await harness.route.GET(
    new Request(routeUrl(routePathFragment, { limit: 2 }), { headers: adminHeaders() }),
  );
  const listBody = await listResponse.json();
  assert.equal(listResponse.status, 200, "Mocked open typed read list must return 200.");
  assertOpenSafeRead(listBody, "Mocked typed read list");
  assert.equal(listBody.mode, "list", "Mocked typed read list must report list mode.");
  assert.equal(listBody.bookings.length, 1, "Mocked typed read list must return mapped safe booking.");
  assert.equal(listBody.bookings[0].safe_dto.booking_reference, "BK-TYPED-LIST");
  assert.equal(listBody.bookings[0].safe_card.company_display_name, "UBS Singapore");
  assert.equal(listBody.bookings[0].quarantined_field_count > 0, true, "Mocked list must quarantine risky source field names.");
  assert.equal(mock.tableNames.includes("bookings"), true, "Mocked open typed read list may touch bookings table only in harness.");
  assert.equal(mock.listLimit, 2, "Mocked open typed read list must pass safe limit.");
  assertExcludes(
    JSON.stringify(listBody),
    /812\.35|64\.20|driver payout should stay parked|internal admin note should never expose|manual override|pay\.example/i,
    "Mocked typed read list response",
  );

  const detailResponse = await harness.route.GET(
    new Request(routeUrl(routePathFragment, { id: "BK-TYPED-DETAIL" }), { headers: adminHeaders() }),
  );
  const detailBody = await detailResponse.json();
  assert.equal(detailResponse.status, 200, "Mocked open typed read detail must return 200.");
  assertOpenSafeRead(detailBody, "Mocked typed read detail");
  assert.equal(detailBody.mode, "detail", "Mocked typed read detail must report detail mode.");
  assert.equal(detailBody.booking.safe_dto.booking_reference, "BK-TYPED-DETAIL");
  assert.equal(mock.eq.field, "id", "Mocked typed detail read must query by id.");
  assert.equal(mock.eq.value, "BK-TYPED-DETAIL", "Mocked typed detail read must query requested id.");
  assertExcludes(
    JSON.stringify(detailBody),
    /812\.35|64\.20|driver payout should stay parked|internal admin note should never expose|manual override|pay\.example/i,
    "Mocked typed read detail response",
  );

  mock.listData = [savedBookingRecordWithUnsafeOptionalTraveler("BK-TYPED-LIST-UNSAFE-TRAVELER")];

  const unsafeOptionalTravelerListResponse = await harness.route.GET(
    new Request(routeUrl(routePathFragment, { limit: 2 }), { headers: adminHeaders() }),
  );
  const unsafeOptionalTravelerListBody = await unsafeOptionalTravelerListResponse.json();
  assert.equal(
    unsafeOptionalTravelerListResponse.status,
    200,
    "Mocked open typed read list must not reject an unsafe optional traveler display label.",
  );
  assertOpenSafeRead(unsafeOptionalTravelerListBody, "Mocked typed read list with unsafe optional traveler");
  assert.equal(
    unsafeOptionalTravelerListBody.bookings[0].safe_dto.booking_reference,
    "BK-TYPED-LIST-UNSAFE-TRAVELER",
  );
  assert.equal(unsafeOptionalTravelerListBody.bookings[0].safe_dto.company_display_name, "Safe Company");
  assert.equal(unsafeOptionalTravelerListBody.bookings[0].safe_dto.traveler_display_name, null);
  assertExcludes(
    JSON.stringify(unsafeOptionalTravelerListBody),
    /Payment team traveler/i,
    "Mocked typed read list with unsafe optional traveler response",
  );
} finally {
  restoreEnv();
  delete globalThis.__prestigeLoadBookingsTypedReadMock;
  await harness.cleanup();
}

console.log("Load Bookings typed read gated API contract passed");
