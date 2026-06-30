import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const helperPath = "lib/admin-load-bookings-operational-record-mapper.ts";
const safeDtoHelperPath = "lib/admin-load-bookings-safe-dto-contract.ts";
const safeUiAdapterHelperPath = "lib/admin-load-bookings-safe-ui-adapter-card-contract.ts";
const appPagePath = "app/page.tsx";
const aiParseRoutePath = "app/api/ai-parse/route.ts";
const adminBookingsRoutePath = "app/api/admin-bookings/route.ts";
const adminSavedBookingsRoutePath = "app/api/admin-saved-bookings/route.ts";
const preactivationSuitePath = "scripts/test-preactivation-verification-suite.mjs";

const helperExportName = "buildAdminLoadBookingsOperationalRecordMapper";
const helperVersionName = "adminLoadBookingsOperationalRecordMapperVersion";
const setupSurfaceName = "load_bookings_operational_record_mapper_setup_only";
const guardScript = "scripts/test-load-bookings-operational-record-mapper.mjs";

const livePathPattern =
  /@supabase\/supabase-js|createClient|supabase|\.from\(|\.select\(|insert\s*\(|upsert\s*\(|update\s*\(|delete\s*\(|rpc\s*\(|fetch\s*\(|process\.env|SUPABASE_[A-Z_]*|PRESTIGE_ADMIN_DISPATCHER_SESSION_TOKEN|SERVICE_ROLE_KEY|API_KEY|ACCESS_TOKEN|SECRET_KEY|adminLegacyDataClient|adminLegacyTables|\/api\/admin-legacy-data|legacy_shim|shim\s*\(/i;
const unsafeSafeOutputPattern =
  /pricing|payout|customer_rate|customer_price|customer_rates|driver_payout_rules|driver_payout|driver_notes|driver_dispatch_include_payout|midnight_surcharge|extra_stop_surcharge|child_seat_customer_surcharge|pricing_source|rate_override|payment|billing|invoice|pdf|provider|send_state|send_log|auth|live_location|photo|calendar|internal_admin|admin_notes|parser_debug|debug_payload|mock_archive|mock_qa|service_role|server_secret|secret|api_key|access_token|raw_token/i;

const safeFields = [
  "assigned_driver_display_name",
  "assigned_driver_phone",
  "assigned_driver_plate",
  "assigned_driver_status",
  "assigned_driver_vehicle_type",
  "audit_summary",
  "booking_id",
  "booking_reference",
  "booking_status",
  "booking_type",
  "booker_display_name",
  "booker_email",
  "booker_phone",
  "child_seat_display",
  "company_display_name",
  "created_at",
  "customer_display_name",
  "dropoff_address",
  "dropoff_datetime",
  "extra_stop_display",
  "job_card_display",
  "pax_display",
  "pickup_address",
  "pickup_datetime",
  "route_points_summary",
  "route_summary",
  "service_display",
  "traveler_display_name",
  "updated_at",
  "vehicle_display",
];

const forbiddenFields = [
  "pricing",
  "payout",
  "customer_rate",
  "customer_price_amount",
  "customer_rate_override",
  "customer_price_override_reason",
  "customer_rates",
  "driver_payout_rules",
  "driver_payout_min",
  "driver_payout_max",
  "driver_payout_amount",
  "driver_payout_override",
  "driver_payout_reason",
  "driver_payout_unit",
  "driver_notes",
  "driver_dispatch_include_payout",
  "midnight_surcharge",
  "midnight_payout",
  "extra_stop_surcharge",
  "extra_stop_payout",
  "child_seat_customer_surcharge",
  "child_seat_driver_payout",
  "pricing_source",
  "rate_override",
  "payment",
  "pdf",
  "billing",
  "provider_send",
  "auth_session",
  "live_location",
  "photo",
  "calendar_event_id",
  "internal_admin_notes",
  "debug_payload",
  "secret_token",
];

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

function assertDisabled(value, label) {
  assert.equal(value.readEnabled, false, `${label} must keep readEnabled false.`);
  assert.equal(value.read_enabled, false, `${label} must keep read_enabled false.`);
  assert.equal(value.liveReadEnabled, false, `${label} must keep liveReadEnabled false.`);
  assert.equal(value.live_read_enabled, false, `${label} must keep live_read_enabled false.`);
  assert.equal(value.dbReadEnabled, false, `${label} must keep dbReadEnabled false.`);
  assert.equal(value.db_read_enabled, false, `${label} must keep db_read_enabled false.`);
  assert.equal(value.legacyClientEnabled, false, `${label} must keep legacyClientEnabled false.`);
  assert.equal(value.legacy_client_enabled, false, `${label} must keep legacy_client_enabled false.`);
  assert.equal(value.writeEnabled, false, `${label} must keep writeEnabled false.`);
  assert.equal(value.write_enabled, false, `${label} must keep write_enabled false.`);
  assert.equal(value.appPageRuntimeWiringEnabled, false, `${label} must keep app wiring false.`);
  assert.equal(value.app_page_runtime_wiring_enabled, false, `${label} must keep app wiring false.`);
  assert.equal(value.loadBookingsEndpointChanged, false, `${label} must keep endpoint unchanged.`);
  assert.equal(value.load_bookings_endpoint_changed, false, `${label} must keep endpoint unchanged.`);
  assert.equal(value.loadBookingsRuntimeWiringEnabled, false, `${label} must keep runtime wiring false.`);
  assert.equal(value.load_bookings_runtime_wiring_enabled, false, `${label} must keep runtime wiring false.`);
  assert.equal(value.savedBookingsEndpointChanged, false, `${label} must keep saved bookings endpoint unchanged.`);
  assert.equal(value.saved_bookings_endpoint_changed, false, `${label} must keep saved bookings endpoint unchanged.`);
  assert.equal(value.saveBookingChanged, false, `${label} must keep Save Booking unchanged.`);
  assert.equal(value.save_booking_changed, false, `${label} must keep Save Booking unchanged.`);
  assert.equal(value.parserChanged, false, `${label} must keep parser unchanged.`);
  assert.equal(value.parser_changed, false, `${label} must keep parser unchanged.`);
  assert.equal(value.no_live_read, true, `${label} must keep no_live_read true.`);
  assert.equal(value.no_op, true, `${label} must stay no-op.`);
}

function assertMappedNoLive(value, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, true, `${label} must be ok.`);
  assert.equal(value.status, "mapped", `${label} must be mapped.`);
  assert.equal(value.result_label, "mapped/no-live", `${label} must keep mapped/no-live label.`);
  assert.equal(value.delivery_surface, setupSurfaceName, `${label} must use setup-only surface.`);
  assert.equal(value.mapperReady, true, `${label} must have mapperReady true.`);
  assert.equal(value.mapper_ready, true, `${label} must have mapper_ready true.`);
  assert.deepEqual(value.rejected_fields, [], `${label} must not reject safe fields.`);
  assertNoUnsafeSafeOutput(value, label);
}

function assertRejectedNoLive(value, expectedFields, label) {
  assertDisabled(value, label);
  assert.equal(value.ok, false, `${label} must not be ok.`);
  assert.equal(value.status, "rejected", `${label} must be rejected.`);
  assert.equal(value.result_label, "rejected/no-live", `${label} must keep rejected/no-live label.`);

  for (const expectedField of expectedFields) {
    assert.ok(value.rejected_fields.includes(expectedField), `${label} must reject ${expectedField}.`);
  }
}

function assertNoUnsafeSafeOutput(value, label) {
  assert.equal(
    unsafeSafeOutputPattern.test(
      JSON.stringify({
        safe_card: value.safe_card,
        safe_dto: value.safe_dto,
        safe_field_names: value.safe_field_names,
      }),
    ),
    false,
    `${label} safe output must not expose finance, payout, payment, provider, auth, live location, photo, calendar, internal, parser, mock, token, or secret text.`,
  );
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

async function loadHarness() {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "prestige-load-bookings-record-mapper-"));
  const serverOnlyPath = path.join(tempDir, "node_modules/server-only/index.js");
  const helperOutputPath = path.join(tempDir, helperPath.replace(/\.ts$/, ".js"));
  const safeDtoOutputPath = path.join(tempDir, safeDtoHelperPath.replace(/\.ts$/, ".js"));
  const safeUiAdapterOutputPath = path.join(
    tempDir,
    safeUiAdapterHelperPath.replace(/\.ts$/, ".js"),
  );
  const [helperSource, safeDtoSource, safeUiAdapterSource] = await Promise.all([
    readFile(path.join(process.cwd(), helperPath), "utf8"),
    readFile(path.join(process.cwd(), safeDtoHelperPath), "utf8"),
    readFile(path.join(process.cwd(), safeUiAdapterHelperPath), "utf8"),
  ]);

  await mkdir(path.dirname(serverOnlyPath), { recursive: true });
  await writeFile(serverOnlyPath, "");
  await mkdir(path.dirname(helperOutputPath), { recursive: true });
  await writeFile(safeDtoOutputPath, transpileTypescript(safeDtoSource, safeDtoHelperPath));
  await writeFile(safeUiAdapterOutputPath, transpileTypescript(safeUiAdapterSource, safeUiAdapterHelperPath));
  await writeFile(helperOutputPath, transpileTypescript(helperSource, helperPath));

  const require = createRequire(import.meta.url);

  return {
    cleanup: () => rm(tempDir, { force: true, recursive: true }),
    helper: require(helperOutputPath),
  };
}

const [
  helperSource,
  appPage,
  aiParseRoute,
  adminBookingsRoute,
  adminSavedBookingsRoute,
  preactivationSuite,
] = await Promise.all([
  readFile(helperPath, "utf8"),
  readFile(appPagePath, "utf8"),
  readFile(aiParseRoutePath, "utf8"),
  readFile(adminBookingsRoutePath, "utf8"),
  readFile(adminSavedBookingsRoutePath, "utf8"),
  readFile(preactivationSuitePath, "utf8"),
]);

assertIncludes(helperSource, "server-only", "Load Bookings operational record mapper");
assertIncludes(helperSource, helperExportName, "Load Bookings operational record mapper");
assertIncludes(helperSource, helperVersionName, "Load Bookings operational record mapper");
assertIncludes(helperSource, "buildAdminLoadBookingsSafeDtoContract", "Mapper must use safe DTO contract");
assertIncludes(
  helperSource,
  "buildAdminLoadBookingsSafeUiAdapterCardContract",
  "Mapper must use safe UI adapter/card contract",
);
assertIncludes(helperSource, "readEnabled: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "liveReadEnabled: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "dbReadEnabled: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "legacyClientEnabled: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "writeEnabled: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "appPageRuntimeWiringEnabled: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "loadBookingsEndpointChanged: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "savedBookingsEndpointChanged: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "saveBookingChanged: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "parserChanged: false", "Load Bookings operational record mapper");
assertIncludes(helperSource, "no_live_read: true", "Load Bookings operational record mapper");
assertIncludes(helperSource, "no_op: true", "Load Bookings operational record mapper");
assertExcludes(helperSource, livePathPattern, "Load Bookings operational record mapper live path");

for (const field of safeFields) {
  assertIncludes(helperSource, `"${field}"`, `Allowed operational mapper field ${field}`);
}

for (const field of forbiddenFields) {
  assertIncludes(helperSource, `"${field}"`, `Forbidden operational mapper field ${field}`);
}

const loadBookingsBlock = sliceBetween(appPage, "async function loadBookings", "function loadSelectedBooking");
assertIncludes(
  loadBookingsBlock,
  "fetch(`${adminSavedBookingsApiPath}?${searchParams.toString()}`",
  "Current Load Bookings endpoint",
);
assertIncludes(loadBookingsBlock, 'method: "GET"', "Current Load Bookings method");
assertExcludes(loadBookingsBlock, helperExportName, "Load Bookings app wiring to operational mapper");
assertExcludes(loadBookingsBlock, "admin-load-bookings-operational-record-mapper", "Load Bookings app wiring");

const saveBookingBlock = sliceBetween(appPage, "async function saveBooking", "async function loadBookings");
assertIncludes(saveBookingBlock, 'fetch("/api/admin-bookings"', "Save Booking + CRM endpoint");
assertIncludes(saveBookingBlock, 'method: "POST"', "Save Booking + CRM method");
assertExcludes(saveBookingBlock, "/api/admin-saved-bookings", "Save Booking + CRM saved-bookings separation");

for (const [label, source] of [
  ["AI parse route", aiParseRoute],
  ["admin-bookings route", adminBookingsRoute],
  ["admin-saved-bookings route", adminSavedBookingsRoute],
]) {
  assertExcludes(source, helperPath, `${label} operational mapper wiring`);
  assertExcludes(source, "admin-load-bookings-operational-record-mapper", `${label} mapper import`);
}

assertIncludes(adminSavedBookingsRoute, "export async function GET", "Admin saved bookings GET remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingList", "Admin saved bookings list remains");
assertIncludes(adminSavedBookingsRoute, "loadAdminSavedBookingById", "Admin saved bookings detail remains");
assertIncludes(preactivationSuite, guardScript, "Preactivation suite operational mapper registration");

const harness = await loadHarness();

try {
  const { buildAdminLoadBookingsOperationalRecordMapper, fallbackAdminLoadBookingsOperationalRecordMapper } =
    harness.helper;

  assert.equal(typeof buildAdminLoadBookingsOperationalRecordMapper, "function", "Mapper export must be callable.");
  assert.equal(typeof fallbackAdminLoadBookingsOperationalRecordMapper, "function", "Fallback export must be callable.");

  const safeResult = buildAdminLoadBookingsOperationalRecordMapper({
    id: "BK-100",
    booking_reference: "BK-REF-100",
    status: "assigned",
    booking_type: "MNG",
    vehicle: "Alphard",
    pickup_time: "2026-06-18T10:00:00+08:00",
    pickup_address: "Raffles Hotel Singapore",
    dropoff_address: "Changi Airport Terminal 3",
    route: "Raffles Hotel Singapore > Changi Airport Terminal 3",
    flight_no: "SQ123",
    pax: 2,
    driver_name: "Ali Driver",
    driver_contact: "+6512345678",
    driver_plate_number: "SMA1234A",
    child_seat_required: true,
    child_seat_count: 1,
    child_seat_type: "Booster",
    extra_stop_count: 0,
    created_at: "2026-06-17T09:00:00+08:00",
    updated_at: "2026-06-17T10:00:00+08:00",
    companies: { company_name: "UBS Singapore" },
    bookers: { booker_name: "Jane Booker", email: "jane@example.com", phone: "+6599999999" },
    travelers: { traveler_name: "Mr Lee" },
    customer_rate: "812.35",
    driver_payout_amount: "64.20",
    driver_notes: "driver payout should stay parked",
    internal_admin_notes: "internal admin note should never expose",
    pricing_source: "manual override",
    payment_link: "https://pay.example.invalid",
  });
  assertMappedNoLive(safeResult, "Safe saved-booking shaped mapper payload");
  assert.equal(safeResult.safe_dto.booking_reference, "BK-REF-100");
  assert.equal(safeResult.safe_dto.company_display_name, "UBS Singapore");
  assert.equal(safeResult.safe_dto.traveler_display_name, "Mr Lee");
  assert.equal(safeResult.safe_dto.assigned_driver_display_name, "Ali Driver");
  assert.equal(safeResult.safe_card.pickup_address, "Raffles Hotel Singapore");
  assert.equal(safeResult.safe_card.dropoff_address, "Changi Airport Terminal 3");
  assert.ok(safeResult.quarantined_field_names.includes("customer_rate"), "Mapper must quarantine customer_rate.");
  assert.ok(
    safeResult.quarantined_field_names.includes("driver_payout_amount"),
    "Mapper must quarantine driver_payout_amount.",
  );
  assert.ok(safeResult.quarantined_field_names.includes("driver_notes"), "Mapper must quarantine driver_notes.");
  assert.ok(
    safeResult.quarantined_field_names.includes("internal_admin_notes"),
    "Mapper must quarantine internal_admin_notes.",
  );
  assert.ok(safeResult.quarantined_field_names.includes("pricing_source"), "Mapper must quarantine pricing_source.");
  assert.ok(safeResult.quarantined_field_names.includes("payment_link"), "Mapper must quarantine payment_link.");
  assertNoUnsafeSafeOutput(safeResult, "Safe saved-booking shaped mapper payload");
  assertExcludes(
    JSON.stringify({ safe_card: safeResult.safe_card, safe_dto: safeResult.safe_dto }),
    /812\.35|64\.20|driver payout should stay parked|internal admin note should never expose|manual override|pay\.example/i,
    "Safe mapper output values",
  );

  const optionalUnsafeTravelerResult = buildAdminLoadBookingsOperationalRecordMapper({
    id: "BK-100B",
    booking_reference: "BK-REF-100B",
    status: "assigned",
    companies: { company_name: "Safe Company" },
    travelers: { traveler_name: "Payment team traveler" },
  });
  assertMappedNoLive(optionalUnsafeTravelerResult, "Unsafe optional traveler display mapper payload");
  assert.equal(optionalUnsafeTravelerResult.safe_dto.company_display_name, "Safe Company");
  assert.equal(optionalUnsafeTravelerResult.safe_dto.traveler_display_name, null);
  assertNoUnsafeSafeOutput(optionalUnsafeTravelerResult, "Unsafe optional traveler display mapper payload");

  const rejectedResult = buildAdminLoadBookingsOperationalRecordMapper({
    id: "BK-101",
    companies: { company_name: "Admin finance account" },
  });
  assertRejectedNoLive(rejectedResult, ["company_display_name"], "Unsafe mapper value");

  const fallbackResult = fallbackAdminLoadBookingsOperationalRecordMapper();
  assertMappedNoLive(fallbackResult, "Fallback operational mapper payload");
} finally {
  await harness.cleanup();
}

console.log("Load Bookings operational record mapper guard passed");
